/**
 * 智能粘贴录单 + 送货单OCR识别 + TMS导出
 * 设计方案 6.1.5 / 6.5 / 11章
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, permissionProcedure } from "../_core/trpc";
import { router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import * as fs from "fs";
import * as path from "path";
// 本地文件存储（当 BUILT_IN_FORGE_API_URL 未配置时的回退方案）
async function localStoragePut(fileKey: string, buffer: Buffer, contentType: string): Promise<{ key: string; url: string }> {
  const uploadsDir = path.join(process.cwd(), "dist", "public", "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const safeName = fileKey.split("/").join("_").split("\\").join("_");
  const filePath = path.join(uploadsDir, safeName);
  fs.writeFileSync(filePath, buffer);
  const host = process.env.PUBLIC_HOST || "http://8.138.186.184";
  return { key: fileKey, url: `${host}/uploads/${safeName}` };
}

async function storagePutSafe(fileKey: string, buffer: Buffer, contentType: string): Promise<{ key: string; url: string }> {
  const forgeUrl = process.env.BUILT_IN_FORGE_API_URL;
  if (!forgeUrl) {
    return localStoragePut(fileKey, buffer, contentType);
  }
  return storagePut(fileKey, buffer, contentType);
}

import { safeParseFloat } from "@shared/safeParseFloat";
import { getDb, createOperationLog } from "../db";
import { orders, customers, warehouses, podRecords, drivers, freightStations, pasteTemplates } from "../../drizzle/schema";
import { eq, and, desc, gte, lte, like, sql, count, inArray } from "drizzle-orm";

// ============================================================
// 瓷砖行业规格简称映射
const TILE_SPEC_MAP: Record<string, string> = {
  '918': '1800×900',
  '715': '1500×750',
  '612': '1200×600',
};

// ============================================================
// 智能粘贴解析 (设计方案 6.1.5)
// ============================================================

// Fault-tolerant JSON parser: handles common AI response format issues
// 1. Strip Markdown code blocks (```json ... ```)
// 2. Fix single-quote property names/values
// 3. Remove trailing commas in objects/arrays
// 4. Remove // and /* */ comments
// 5. Truncation recovery (try parsing up to last complete brace)
function safeParseJSON(raw: string): any {
  if (!raw || !raw.trim()) throw new Error('LLM returned empty content');

  // Step 1: strip Markdown code fences
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  s = s.trim();

  // Step 2: try direct parse (most common case)
  try { return JSON.parse(s); } catch (_) {}

  // Step 3: remove JS comments (// line and /* */ block)
  let cleaned = s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  // Step 4: remove trailing commas
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  try { return JSON.parse(cleaned); } catch (_) {}

  // Step 5: fix single-quote property names and string values
  const singleQuoteFix = cleaned
    .replace(/'([^'\n]*)'\s*:/g, '"$1":')
    .replace(/:\s*'([^'\n]*)'/g, ': "$1"');
  try { return JSON.parse(singleQuoteFix); } catch (_) {}

  // Step 6: truncation recovery - find last complete } or ] and try parsing
  const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (lastBrace > 0) {
    try { return JSON.parse(cleaned.substring(0, lastBrace + 1)); } catch (_) {}
  }

  // Step 7: all attempts failed
  throw new SyntaxError('AI JSON parse failed, first 200 chars: ' + s.substring(0, 200));
}

// 正则预处理：从文本中提取常见字段
function regexPreParse(text: string) {
  // 预处理：将···分隔符统一为--
  text = text.replace(/\u00B7{2,}/g, "--");

  const results: Record<string, string | null> = {};

  // 手机号（11位）
  const phoneMatch = text.match(/1[3-9]\d{9}/);
  results.phone = phoneMatch ? phoneMatch[0] : null;

  // 座机号（区号-号码格式）
  const landlineMatch = text.match(/0\d{2,3}-\d{7,8}/);
  results.landline = landlineMatch ? landlineMatch[0] : null;

  // 重量 (支持 "10吨" "10t" "10T" "10.5吨" "28024.58KG")
  const weightKgMatch = text.match(/(\d+\.?\d*)\s*[kK][gG]/);
  const weightTonMatch = text.match(/(\d+\.?\d*)\s*[吨tT]/);
  if (weightKgMatch) {
    results.weight = (safeParseFloat(weightKgMatch[1]) / 1000).toFixed(3);
    results.weightUnit = 'kg';
  } else if (weightTonMatch) {
    results.weight = weightTonMatch[1];
    results.weightUnit = 'ton';
  } else {
    results.weight = null;
  }

  // 单号 (常见格式 F开头/P开头等)
  const orderNos = text.match(/[A-Za-z]\d{6,}/g);
  results.orderNumbers = orderNos ? orderNos.join(',') : null;

  // 运费/价格提取：匹配数字（可含小数），后面可能跟括号说明
  // 例如："1357.13（含送150+提400+卸56.84）" → price=1357.13, priceNote="含送150+提400+卸56.84"
  const priceMatch = text.match(/(\d+\.?\d*)\s*[（(]([^）)]+)[）)]/);
  // 支持孤立纯数字行（整数或小数），如"1900"或"1357.13"单独成行
  const simplePriceMatch = text.match(/(?:^|\n)\s*(\d+(?:\.\d+)?)\s*(?:\n|$)/);
  if (priceMatch) {
    results.customerPrice = priceMatch[1];
    results.customerPriceNote = priceMatch[2]; // 括号内的说明，应追加到备注
  } else if (simplePriceMatch) {
    results.customerPrice = simplePriceMatch[1];
    results.customerPriceNote = null;
  } else {
    results.customerPrice = null;
    results.customerPriceNote = null;
  }

  // 中文破折号分隔符（——）提取仓库名："仓库名——收货地址" 格式
  // 支持单个或两个em dash（—或——）
  const emDashSepMatch = text.match(/^([^\n\t]+?)\s*[——]{1,2}\s*(.+)$/m);
  if (emDashSepMatch) {
    // em-dash前的内容可能包含订单号、重量等字段，仓库名是最后一个空白分隔的字段
    const beforeDash = emDashSepMatch[1].trim();
    const beforeParts = beforeDash.split(/\s+/).filter(Boolean);
    results.warehouseFromEmDash = beforeParts.length > 0 ? beforeParts[beforeParts.length - 1] : beforeDash;
    // 地址后面可能跟着tab和备注，截断tab前的内容作为地址
    results.addressFromEmDash = emDashSepMatch[2].split(/\t/)[0].trim();
  } else {
    results.warehouseFromEmDash = null;
    results.addressFromEmDash = null;
  }

  // 合并计划号 (P开头+数字)
  const planMatch = text.match(/P\d{8,}/);
  results.mergedPlanNumber = planMatch ? planMatch[0] : null;

  // 收货人姓名（地址后面紧跟的2-3个汉字人名，后面跟电话号码）
  const receiverMatches = text.match(/[\u4e00-\u9fa5]{2,3}(?=\s*(?:1[3-9]\d{9}|0\d{2,3}-\d{7,8}))/g);
  results.receiverNames = receiverMatches ? receiverMatches.join(',') : null;

  // 规格信息提取（SC/SA行、数字×数字格式）
  const specLines = text.match(/(?:SC|SA)[:：]\s*[^\n]*/gi);
  results.specLines = specLines ? specLines.join('; ') : null;

  // 规格尺寸提取（如 2700X1200、1800*900、800×800）
  const sizeMatches = text.match(/\d{3,4}\s*[xX×*]\s*\d{3,4}/g);
  // 同时匹配瓷砖规格简称（918、715、612）
  const tileSpecMatches = text.match(/\b(918|715|612)\b/g);
  const allSizeMatches: string[] = [];
  if (sizeMatches) allSizeMatches.push(...sizeMatches);
  if (tileSpecMatches) {
    for (const s of tileSpecMatches) {
      const expanded = TILE_SPEC_MAP[s];
      if (expanded && !allSizeMatches.includes(expanded)) {
        allSizeMatches.push(expanded);
      }
    }
  }
  results.sizes = allSizeMatches.length > 0 ? allSizeMatches.join(', ') : null;
  // 计费重量提取：匹配"共XX吨""按XX吨算""计费XX吨""XX吨计费"等格式
  const chargeableWeightMatch = text.match(/(?:共|按|计费|共计)\s*(\d+(?:\.\d+)?)\s*吨(?:算|计费|$|\s|[，。,；;])|(?:\d+(?:\.\d+)?)\s*吨\s*计费/);
  if (chargeableWeightMatch) {
    results.chargeableWeight = chargeableWeightMatch[1] || chargeableWeightMatch[0].match(/\d+(?:\.\d+)?/)?.[0] || null;
  } else {
    results.chargeableWeight = null;
  }

  // 大板检测：检查规格是否达到大板标准
  let hasLargeSlab = false;
  if (sizeMatches) {
    for (const s of sizeMatches) {
      const nums = s.match(/\d+/g);
      if (nums && nums.length >= 2) {
        const w = parseInt(nums[0]);
        const h = parseInt(nums[1]);
        if ((w >= 1800 && h >= 900) || (h >= 1800 && w >= 900)) {
          hasLargeSlab = true;
          break;
        }
      }
    }
  }
  // 关键词检测
  if (/大板|岩板|铁架|铁托/.test(text)) {
    hasLargeSlab = true;
  }
  results.hasLargeSlab = hasLargeSlab ? 'true' : 'false';

  // 托数信息提取
  const tuoMatches = text.match(/\d+\s*托|[一二三四五六七八九十]+托/g);
  results.tuoInfo = tuoMatches ? tuoMatches.join(', ') : null;

  // 架数信息提取
  const jiaMatches = text.match(/\d+\s*架|铁架\s*\d*\s*个/g);
  results.jiaInfo = jiaMatches ? jiaMatches.join(', ') : null;

  return results;
}

function parseChineseCount(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return parseInt(text, 10);
  const map: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (text === '十') return 10;
  if (text.includes('十')) {
    const [left, right] = text.split('十');
    const tens = left ? (map[left] ?? 0) : 1;
    const ones = right ? (map[right] ?? 0) : 0;
    return tens * 10 + ones;
  }
  return map[text] ?? null;
}

function normalizeCount(raw?: string | null): string {
  if (!raw) return '';
  const digitMatch = raw.match(/\d+/);
  if (digitMatch) return digitMatch[0];
  const chineseMatch = raw.match(/[零一二两三四五六七八九十]+/);
  if (!chineseMatch) return '';
  const count = parseChineseCount(chineseMatch[0]);
  return count != null ? String(count) : '';
}

function normalizeCargoSpec(raw?: string | null): string {
  if (!raw) return '';
  // 匹配尺寸格式（如 2700×1200、1800*900、1800x900）
  const matches = raw.match(/\d{3,4}\s*[xX×*]\s*\d{3,4}/g);
  if (matches && matches.length > 0) {
    const expanded = matches.map((item) => {
      // 提取两个数字
      const nums = item.match(/\d+/g);
      if (!nums || nums.length < 2) return item.replace(/\s+/g, '').replace(/[xX*]/g, '×');
      const [a, b] = nums;
      // 如果两个数字都是瓷砖简称，分别展开
      const expandedA = TILE_SPEC_MAP[a];
      const expandedB = TILE_SPEC_MAP[b];
      if (expandedA && expandedB) {
        // 两个都是简称，返回两个完整规格（用 / 分隔）
        return `${expandedA}|${expandedB}`;
      } else if (expandedA) {
        return expandedA;
      } else if (expandedB) {
        return expandedB;
      }
      // 普通尺寸，统一用 × 分隔
      return item.replace(/\s+/g, '').replace(/[xX*]/g, '×');
    });
    // 展开后可能有 | 分隔的多规格，展开并去重
    const allSpecs: string[] = [];
    for (const e of expanded) {
      for (const s of e.split('|')) {
        if (s && !allSpecs.includes(s)) allSpecs.push(s);
      }
    }
    return allSpecs.join(' / ');
  }
  // try tile spec shorthand: 918=1800x900, 715=1500x750, 612=1200x600
  const tileMatches = raw.match(/\b(918|715|612)\b/g);
  if (tileMatches && tileMatches.length > 0) {
    const uniq = Array.from(new Set(tileMatches.map((s) => TILE_SPEC_MAP[s] || s)));
    return uniq.join(' / ');
  }
  // 没有找到尺寸规格，返回空字符串
  return '';
}

function extractFallbackShippingNote(text: string): string {
  const notePatterns = [
    /同规格拼托[^\n，。,；;]*/g,
    /拼托[^\n，。,；;]*/g,
    /按大板发货要求执行[^\n，。,；;]*/g,
    /按大板要求发货[^\n，。,；;]*/g,
    /发货要求[^\n，。,；;]*/g,
    /提货[^\n]*(?:货站|送货|联系)[^\n]*/g,
    /送货[^\n]*(?:联系|自提|预约)[^\n]*/g,
    /专车发运[^\n，。,；;]*/g,
    /专车[^\n，。,；;]*/g,
    /整车[^\n，。,；;]*/g,
    /零担[^\n，。,；;]*/g,
    /回程车[^\n，。,；;]*/g,
  ];
  const parts = notePatterns.flatMap((pattern) => text.match(pattern) || []);
  return Array.from(new Set(parts.map((item) => item.trim()).filter(Boolean))).join('；');
}

// 提取文本特征用于模板匹配
function extractTextFeatures(text: string) {
  const commonCities = [
    '清远', '佛山', '广州', '深圳', '东莞', '中山', '珠海', '惠州', '江门', '肇庆',
    '南昌', '赣州', '九江', '吉安', '上饶', '抚州', '宜春', '景德镇', '萍乡', '新余',
    '武汉', '长沙', '成都', '重庆', '贵阳', '昆明', '南宁', '福州', '厦门', '济南',
    '郑州', '太原', '西安', '兰州', '银川', '哈尔滨', '长春', '沈阳', '大连',
    '北京', '上海', '天津', '杭州', '南京', '合肥', '苏州', '无锡', '宁波', '温州',
  ];

  const cities = commonCities.filter(c => text.includes(c));
  const hasSeparator = text.includes('---');
  const hasMergedPlan = /合并计划号|P\d{8,}/.test(text);
  const hasOrderNumber = /[A-Za-z]\d{6,}/.test(text);
  const hasWeight = /\d+\.?\d*\s*[吨tT]|\d+\.?\d*\s*[kK][gG]/.test(text);
  const hasPhone = /1[3-9]\d{9}/.test(text);

  return { cities, hasSeparator, hasMergedPlan, hasOrderNumber, hasWeight, hasPhone };
}

export const smartPasteRouter = router({
  // 智能粘贴解析
  parse: permissionProcedure("order.create").input(
    z.object({
      text: z.string().min(1, "请输入文本"),
    }),
  ).mutation(async ({ ctx, input }) => {
    const regexResults = regexPreParse(input.text);

    // 获取客户和仓库列表用于匹配
    const db = await getDb();
    let customerNames: string[] = [];
    let warehouseNames: string[] = [];
    if (db) {
      const custs = await db.select({ name: customers.name }).from(customers).where(eq(customers.isActive, true));
      customerNames = custs.map(c => c.name);
      const whs = await db.select({ name: warehouses.name, city: warehouses.city }).from(warehouses).where(eq(warehouses.isActive, true));
      warehouseNames = whs.map(w => `${w.name}(${w.city || ''})`);
    }

    const systemPrompt = `你是永安物流的智能录单助手。用户会粘贴微信聊天记录或文本消息，你需要从中提取物流订单信息。

已知客户列表：${customerNames.join('、') || '暂无'}
已知仓库列表：${warehouseNames.join('、') || '暂无'}

请从文本中识别以下字段：
- customerName: 客户名称（尝试匹配已知客户，如果原文没有明确客户名则填空字符串）
- warehouseName: 发货仓库（尝试匹配已知仓库，如"清远仓""清远青龙仓""清远配送仓"等）
- orderNumber: 客户订单号/单号（如F0002214509，每个子单都有自己的单号，必填）
- mergedPlanNumber: 合并计划号（如P0000050964，多个子单共用同一个计划号，可能没有。注意：P开头+数字的编号就是合并计划号）
- customerPrice: 客户给的价格（元，纯数字。【极其重要】只有原文中明确出现了价格/金额/费用/报价等数字时才填写，绝对不能自己编造或计算价格！如果原文完全没有提到任何价格数字，必须填空字符串""）
- cargoName: 货物名称（如"托装""散装""瓷砖"等，如果原文没有明确货物名称则填空字符串）
- weight: 重量（吨，纯数字，如"28024.58KG"应转换为28.02458吨，"1627.26KG"应转换为1.62726吨）
- originCity: 发货城市（如"清远"）
- destinationCity: 目的城市（如"佛山市""南昌市"）
- deliveryAddress: 收货地址（完整地址，如"广东省佛山市南庄镇紫洞北路（东鹏仓前门）"）
- receiverName: 收货人姓名（如"李庆河""冯笑莲"，通常紧跟在地址后面或电话号码前面的中文人名）
- receiverPhone: 收货人电话（如"18244363569""0757-82275371"，支持手机号和座机号格式）
- cargoSpec: 货物规格（规格字段，优先提取标准尺寸，如"1800*900""2700*1200"；多个规格可用" / "连接）
- specialRequirements: 特殊要求（客户特殊要求、同规格拼托、包装/交接要求等结构化说明）
- shippingNote: 发货备注兜底文本（仅保留无法归入上述结构化字段但确实属于发货说明的内容；如果规格、托数、大板发货要求已经能结构化表达，就不要再重复塞入 shippingNote）
- remarks: 其他备注信息（【重要】包括但不限于：装卸顺序说明如"先装XX再装XX""先卸XX再卸XX"、送货时间要求如"最晚要在X号到货""预计X月X号可提"、客户特殊要求如"要开订货会""样板"、调度安排说明如"请安排""共XX吨""加急安排"等。这些信息非常重要，必须完整提取！）
- isUrgent: 是否加急（布尔值）
- urgentReason: 加急原因（当isUrgent为true时必填，从文本中提取加急原因，如"加急""紧急""尽快"等，若无具体原因则填"加急"）
- isLargeSlab: 是否大板货物（布尔值，见大板识别规则）
- chargeableWeight: 计费重量（吨，纯数字，如"按32吨"中的32，仅大板整车需要）
- packageCount: 架数（纯数字，如"3架"中的3，仅大板零担需要）
- palletCount: 托数（纯数字，如"4托"中的4，与架数 packageCount 严格区分）
- largeSlabShippingRequired: 是否要求按大板发货（布尔值，仅当原文明确出现"按大板发货要求执行"或同义表达时为 true）

重要规则：
1. 每个子单号必须拆分为独立的订单记录（即使它们属于同一个合并计划号）
2. 如果文本中有"合并计划号"或P开头+数字格式的编号（如P0000050964），每个子单都要填写相同的mergedPlanNumber
3. "--"、"---"或中文破折号"——"（一个或两个em dash）通常表示发货地到收货地的分隔，如"清远仓--广东省佛山市南庄镇..."或"BG/0YO清远万豪——海南省儋州市..."
4. 重量单位如果是KG请转换为吨（除以1000），保留完整精度不要四舍五入
5. "--"、"---"或"——"右边的部分是完整收货地址，必须提取到deliveryAddress字段
6. "--"、"---"或"——"左边的部分是发货仓库名称（如"清远仓""清远青龙仓""BG/0YO清远万豪"），必须提取到warehouseName字段。仓库名可能包含字母、数字、斜杠等字符（如"BG/0YO清远万豪"）
7. 发货城市从仓库名称中提取（如"清远仓"→originCity为"清远"），目的城市从收货地址中提取（如"广东省佛山市..."→destinationCity为"佛山市"）

【客户报价(customerPrice)极其重要的规则】：
8. 只有当原文中明确出现了价格/金额/费用/报价/运费等数字时，才能填写customerPrice。以下情况均应识别为运费：
   - 明确标注的运费（如"总价3937.98""运费5000""报价280元"）
   - 价格后跟括号说明（如"1357.13（含送150+提400+卸56.84）"）
   - 【重要】文本中出现孤立的纯数字行（单独一行只有数字，如"1900"或"1357.13"），这通常是客户单独发送的运费金额，应识别为customerPrice
   - 正则预提取结果中如果customerPrice有值，优先使用该值
9. 如果原文中完全没有出现任何价格相关的数字，customerPrice必须填空字符串""
10. 绝对禁止根据重量、距离等信息自行计算或推测价格！
11. 如果有明确的总价且有多个子单，将总价按重量比例分配到每个子单的customerPrice（保留两位小数）
12. 【极其重要】如果价格后面跟着括号说明（如"1357.13（含送150+提400+卸56.84）"），customerPrice只填括号前的纯数字部分（即"1357.13"），括号内的内容（"含送150+提400+卸56.84"）必须追加到remarks字段，不要放入customerPrice！

收货人信息提取规则（重要）：
12. 收货人姓名通常是2-3个汉字的中文人名，出现在地址末尾或电话号码前面
13. 收货人电话支持手机号（1开头11位）和座机号（区号-号码格式如0757-82275371）
14. 每个子单可能有不同的收货人和电话，必须分别提取

结构化发货信息提取规则：
15. cargoSpec 只存货物尺寸规格，例如“1800×900”“2700×1200”；严格禁止把以下内容放入 cargoSpec：托数、架数、运输方式（如“专车发运”“零担”“整车”“回程车”）、加急说明、任何非尺寸的文字描述。如果文本中没有明确的尺寸规格，cargoSpec必须填空字符串””！【极其重要】瓷砖行业规格简称映射，必须转换为完整规格：918=1800×900、715=1500×750、612=1200×600。如果文本中出现这些简称（如“918和715原托”“SA:918”“918规格”），必须转换为对应的完整尺寸（如“1800×900 / 1500×750”）填入cargoSpec，不能直接填简称数字。
16. palletCount 只存托数；packageCount 只存架数；二者不能混填，也不要写单位
17. 如果原文出现"按大板发货要求执行""按大板要求发货"等明确表达，largeSlabShippingRequired 设为 true，并将原始要求写入 specialRequirements
18. shippingNote 仅作兜底字段，保存无法结构化归类但又确实属于发货说明的文本；不要把规格、托数、架数、大板要求重复写进 shippingNote。以下内容应放入 shippingNote：
    - 运输方式说明（如"专车发运""整车运输""回程车""零担拼车"）
    - 提货/送货特殊说明（如"需预约提货""自提""送货上门"）
    - 其他无法归入结构化字段的发货操作说明
19. 如果完全没有额外发货说明，shippingNote 填空字符串

装卸顺序和调度备注(remarks)提取规则（极其重要）：
20. 如果文本中包含装卸顺序说明（如"先装XX再装XX""先卸XX再卸XX"），必须完整提取到remarks字段
21. 如果文本中包含调度安排说明（如"清远仓转紫洞仓/广佛仓，共31.84吨，请安排"），也必须提取到remarks字段
22. 装卸顺序和调度说明通常适用于同一批次的所有子单，每个子单的remarks都应该包含这些信息
23. remarks是非常重要的业务信息，不能遗漏！

大板识别规则（极其重要，必须严格执行）：
24. 大板定义：只要瓷砖/陶瓷/石材中任意一个规格的长或宽≥1800mm且另一边≥900mm，就是大板。常见大板规格举例：2700×1200、2400×1200、1800×900、1600×3200等。注意规格可能用"×""X""x""*"等不同符号分隔
25. 关键词触发：如果文本中出现"大板""岩板""铁架""铁托"等关键词，也直接判定isLargeSlab为true
26. 混合规格场景：如果一批货中既有大板规格（如2700×1200）又有普通规格（如800×800），只要有任何一个规格达到大板标准，isLargeSlab就设为true
27. 如果文本中提到计费重量（如"按32吨算""计费32吨""共XX吨""XX吨计费""共计XX吨"），提取到chargeableWeight字段。注意"共XX吨"格式的计费重量通常出现在文本末尾，如"共33.501吨"就是计费重量33.501吨
28. 如果文本中提到架数（如"3架""共5架""铁架一个"），提取到packageCount字段
29. 如果文本中提到托数（如"4托""八托"），提取到palletCount字段
30. SC/SA等行业缩写说明：SC通常指大板规格（如"SC: 2700X1200"），SA通常指普通规格（如"SA: 918四托"），出现SC行就很可能包含大板

合并计划号特别规则：
31. 当多个子单共享同一个合并计划号时，每个子单的信息必须独立准确填写
32. 不要将合并计划号下第一个子单的信息复制给其他子单
33. 如果某个子单的某个字段无法从文本中确定，填空字符串

发出仓库(warehouseName)独立识别规则（重要）：
34. 每个子单可能有不同的发出仓库，必须为每个子单独立识别warehouseName
35. 如果文本中出现多个仓库名（如"清远仓"和"佛山仓"），应根据上下文将不同仓库分配给对应的子单
36. 如果文本中只有一个仓库名，则所有子单共用该仓库
37. 仓库名通常出现在"--"或"---"分隔符左边，或者在"XX仓"格式中

正则预提取结果供参考：${JSON.stringify(regexResults)}`;

    try {
      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: input.text },
        ],
        max_tokens: 8192,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "smart_paste_result",
            strict: true,
            schema: {
              type: "object",
              properties: {
                orders: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      customerName: { type: "string", description: "客户名称" },
                      warehouseName: { type: "string", description: "仓库名称" },
                      orderNumber: { type: "string", description: "客户订单号" },
                      mergedPlanNumber: { type: "string", description: "合并计划号" },
                      customerPrice: { type: "string", description: "客户给的价格(元)" },
                      cargoName: { type: "string", description: "货物名称" },
                      weight: { type: "string", description: "重量(吨)" },
                      originCity: { type: "string", description: "发货城市" },
                      destinationCity: { type: "string", description: "目的城市" },
                      deliveryAddress: { type: "string", description: "收货地址" },
                      receiverName: { type: "string", description: "收货人" },
                      receiverPhone: { type: "string", description: "收货人电话" },
                      cargoSpec: { type: "string", description: "货物规格，如1800*900" },
                      specialRequirements: { type: "string", description: "特殊要求" },
                      shippingNote: { type: "string", description: "发货备注兜底文本" },
                      remarks: { type: "string", description: "其他备注" },
                      isUrgent: { type: "boolean", description: "是否加急" },
                      urgentReason: { type: "string", description: "加急原因" },
                      isLargeSlab: { type: "boolean", description: "是否大板货物" },
                      chargeableWeight: { type: "string", description: "计费重量(吨)" },
                      packageCount: { type: "string", description: "架数" },
                      palletCount: { type: "string", description: "托数" },
                      largeSlabShippingRequired: { type: "boolean", description: "是否按大板发货要求执行" },
                    },
                    required: ["customerName", "warehouseName", "orderNumber", "mergedPlanNumber", "customerPrice", "cargoName", "weight", "originCity", "destinationCity", "deliveryAddress", "receiverName", "receiverPhone", "cargoSpec", "specialRequirements", "shippingNote", "remarks", "isUrgent", "urgentReason", "isLargeSlab", "chargeableWeight", "packageCount", "palletCount", "largeSlabShippingRequired"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["orders"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices?.[0]?.message?.content;
      if (!rawContent) throw new Error("LLM返回为空");
       const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
      let parsed = safeParseJSON(content);
      // 兜底：豆包有时返回单个订单对象而非 { orders: [...] } 结构
      if (!parsed.orders || !Array.isArray(parsed.orders)) {
        // 兼容 AI 返回 orderList / orderItems / list 等字段名
        const altList = parsed.orderList || parsed.orderItems || parsed.list || parsed.data;
        if (Array.isArray(altList)) {
          parsed = { orders: altList };
        } else if (parsed.orderNumber || parsed.warehouseName || parsed.deliveryAddress) {
          // 单个订单对象，包装为数组
          parsed = { orders: [parsed] };
        } else if (Array.isArray(parsed)) {
          // 直接返回了数组
          parsed = { orders: parsed };
        } else {
          // 无法识别的结构，返回空
          parsed = { orders: [] };
        }
      }

      // 后处理：用代码二次验证和补充LLM结果
      if (parsed.orders && Array.isArray(parsed.orders)) {
        for (const order of parsed.orders) {
          // 1. 大板二次检测：用正则检查原文和shippingNote
          if (!order.isLargeSlab) {
            const textToCheck = `${input.text} ${order.shippingNote || ''} ${order.cargoName || ''}`;
            // 检查规格尺寸
            const sizeMatches = textToCheck.match(/\d{3,4}\s*[xX×*]\s*\d{3,4}/g);
            if (sizeMatches) {
              for (const s of sizeMatches) {
                const nums = s.match(/\d+/g);
                if (nums && nums.length >= 2) {
                  const w = parseInt(nums[0]);
                  const h = parseInt(nums[1]);
                  if ((w >= 1800 && h >= 900) || (h >= 1800 && w >= 900)) {
                    order.isLargeSlab = true;
                    break;
                  }
                }
              }
            }
            // 检查关键词
            if (/大板|岩板|铁架|铁托/.test(textToCheck)) {
              order.isLargeSlab = true;
            }
          }

          // 1.5 运费后处理：只保留纯数字，括号内容追加到备注
          if (order.customerPrice && typeof order.customerPrice === 'string') {
            // 如果customerPrice包含括号（AI可能把整段都放进去了），只取数字部分
            const priceOnlyMatch = order.customerPrice.match(/^(\d+\.?\d*)/);
            if (priceOnlyMatch) {
              const priceNote = order.customerPrice.replace(/^\d+\.?\d*/, '').replace(/^\s*[（(]/, '').replace(/[）)]\s*$/, '').trim();
              order.customerPrice = priceOnlyMatch[1];
              if (priceNote) {
                // 将括号内容追加到remarks
                order.remarks = order.remarks ? `${order.remarks}（${priceNote}）` : `（${priceNote}）`;
              }
            }
          }
          // 如果正则预处理提取到了运费但AI没有识别，用正则结果填充
          if ((!order.customerPrice || order.customerPrice.trim() === '') && regexResults.customerPrice) {
            order.customerPrice = regexResults.customerPrice;
            if (regexResults.customerPriceNote) {
              order.remarks = order.remarks ? `${order.remarks}（${regexResults.customerPriceNote}）` : `（${regexResults.customerPriceNote}）`;
            }
          }

          // 1.6 仓库名后处理：如果AI没有识别仓库，用em-dash分隔符提取的结果填充
          if ((!order.warehouseName || order.warehouseName.trim() === '') && regexResults.warehouseFromEmDash) {
            order.warehouseName = regexResults.warehouseFromEmDash;
          }
          // 如果AI没有识别收货地址，用em-dash分隔符提取的结果填充
          if ((!order.deliveryAddress || order.deliveryAddress.trim() === '') && regexResults.addressFromEmDash) {
            order.deliveryAddress = regexResults.addressFromEmDash;
          }

          // 2. 结构化字段补充：规格、托数、架数、大板发货要求
          if (!order.cargoSpec || order.cargoSpec.trim() === '') {
            // 只用正则提取的尺寸规格填充，不用shippingNote/remarks（避免把运输方式等文字当规格）
            order.cargoSpec = normalizeCargoSpec(regexResults.specLines || regexResults.sizes || '');
          } else {
            order.cargoSpec = normalizeCargoSpec(order.cargoSpec);
          }
          // chargeableWeight兜底：如果AI没有识别，用正则提取的结果填充
          const cwStr = order.chargeableWeight != null ? String(order.chargeableWeight) : '';
          if (!cwStr.trim() && regexResults.chargeableWeight) {
            order.chargeableWeight = regexResults.chargeableWeight;
          } else {
            order.chargeableWeight = cwStr;
          }

          const pcStr = order.palletCount != null ? String(order.palletCount) : '';
          if (!pcStr.trim()) {
            order.palletCount = normalizeCount(regexResults.tuoInfo || input.text.match(/(?:共)?\s*(\d+|[零一二两三四五六七八九十]+)\s*托/)?.[0] || '');
          } else {
            order.palletCount = normalizeCount(pcStr);
          }

          const pkgStr = order.packageCount != null ? String(order.packageCount) : '';
          if (!pkgStr.trim()) {
            order.packageCount = normalizeCount(regexResults.jiaInfo || input.text.match(/(?:共)?\s*(\d+|[零一二两三四五六七八九十]+)\s*架/)?.[0] || '');
          } else {
            order.packageCount = normalizeCount(pkgStr);
          }

          const slabShippingText = `${order.specialRequirements || ''} ${order.shippingNote || ''} ${order.remarks || ''} ${input.text}`;
          if (!order.largeSlabShippingRequired) {
            order.largeSlabShippingRequired = /按大板发货要求执行|按大板发货要求|按大板要求发货|大板发货要求执行/.test(slabShippingText);
          }
          if (order.largeSlabShippingRequired && (!order.specialRequirements || order.specialRequirements.trim() === '')) {
            const slabRequirementMatch = slabShippingText.match(/按大板发货要求执行[^\n，。,；;]*|按大板要求发货[^\n，。,；;]*|大板发货要求执行[^\n，。,；;]*/);
            order.specialRequirements = slabRequirementMatch ? slabRequirementMatch[0].trim() : '按大板发货要求执行';
          }

          if (!order.shippingNote || order.shippingNote.trim() === '') {
            order.shippingNote = extractFallbackShippingNote(input.text);
          }

          // 3. 加急检测补充
          if (!order.isUrgent) {
            if (/加急|紧急|尽快|马上/.test(input.text)) {
              order.isUrgent = true;
              if (!order.urgentReason) {
                const urgentMatch = input.text.match(/(加急|紧急|尽快|马上)[^\n,，。]*/g);
                order.urgentReason = urgentMatch ? urgentMatch[0] : '加急';
              }
            }
          }
        }
      }

      // ===== 后处理：customerPrice按重量比例分摊 =====
      // 当多个子单共享同一个总价（值相同）时，按各子单weight占总weight的比例分摊
      if (parsed.orders && Array.isArray(parsed.orders) && parsed.orders.length > 1) {
        // 按mergedPlanNumber分组
        const groups: Record<string, any[]> = {};
        for (const order of parsed.orders) {
          const key = order.mergedPlanNumber || '__no_plan__';
          if (!groups[key]) groups[key] = [];
          groups[key].push(order);
        }
        for (const [key, groupOrders] of Object.entries(groups)) {
          if (groupOrders.length < 2) continue;
          // 检查组内是否有多个子单的customerPrice相同（说明AI填了总价而非分摊价）
          const prices = groupOrders.map((o: any) => o.customerPrice ? parseFloat(o.customerPrice) : null);
          const validPrices = prices.filter((p): p is number => p !== null && !isNaN(p) && p > 0);
          if (validPrices.length < 2) continue;
          // 判断是否所有有效价格都相同（AI把总价填给了每个子单）
          const allSame = validPrices.every(p => Math.abs(p - validPrices[0]) < 0.01);
          if (!allSame) continue;
          // 按重量比例分摊
          const totalPrice = validPrices[0]; // 总价
          const weights = groupOrders.map((o: any) => o.weight ? parseFloat(o.weight) : 0);
          const totalWeight = weights.reduce((a: number, b: number) => a + b, 0);
          if (totalWeight <= 0) continue;
          for (let i = 0; i < groupOrders.length; i++) {
            const ratio = weights[i] / totalWeight;
            const allocated = Math.round(totalPrice * ratio * 100) / 100;
            groupOrders[i].customerPrice = allocated.toFixed(2);
          }
        }
      }

      await createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name || ctx.user!.username || undefined,
        action: "smart_paste",
        targetType: "order",
        description: `智能粘贴解析，识别出${parsed.orders?.length || 0}条订单`,
      });

      return { orders: parsed.orders || [], rawText: input.text };
    } catch (error: any) {
      console.error("[SmartPaste] LLM parse error:", error);
      throw new Error(`智能解析失败：${error.message}`);
    }
  }),

  // ============================================================
  // 送货单OCR识别 (设计方案 6.5)
  // ============================================================
  ocrDeliveryNote: protectedProcedure.input(
    z.object({
      imageUrl: z.string().min(1, "请提供图片URL"),
      orderId: z.number().optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    try {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `你是永安物流的送货单OCR识别助手。请从送货单照片中识别以下信息：
- deliveryNoteNumber: 送货单号
- receiverSignature: 收货人签名（文字描述）
- signDate: 签收日期
- cargoQuantity: 货物数量/件数
- cargoDescription: 货物描述
- remarks: 备注信息
- condition: 货物状况（完好/破损/部分缺失）

如果某个字段无法识别，填写空字符串。`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "请识别这张送货单上的信息" },
              { type: "image_url", image_url: { url: input.imageUrl, detail: "high" } },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ocr_result",
            strict: true,
            schema: {
              type: "object",
              properties: {
                deliveryNoteNumber: { type: "string" },
                receiverSignature: { type: "string" },
                signDate: { type: "string" },
                cargoQuantity: { type: "string" },
                cargoDescription: { type: "string" },
                remarks: { type: "string" },
                condition: { type: "string" },
              },
              required: ["deliveryNoteNumber", "receiverSignature", "signDate", "cargoQuantity", "cargoDescription", "remarks", "condition"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent2 = response.choices?.[0]?.message?.content;
      if (!rawContent2) throw new Error("OCR识别返回为空");
       const content2 = typeof rawContent2 === "string" ? rawContent2 : JSON.stringify(rawContent2);
      const ocrResult = safeParseJSON(content2);

      // 如果关联了订单，更新回单记录
      if (input.orderId) {
        const db = await getDb();
        if (db) {
          // 查找或创建回单记录
          const existing = await db.select().from(podRecords).where(eq(podRecords.orderId, input.orderId)).limit(1);
          if (existing.length > 0) {
            await db.update(podRecords).set({
              deliveryNoteUrl: input.imageUrl,
              ocrResult: ocrResult,
              ocrVerified: false,
            }).where(eq(podRecords.id, existing[0].id));
          } else {
            await db.insert(podRecords).values({
              orderId: input.orderId,
              deliveryNoteUrl: input.imageUrl,
              ocrResult: ocrResult,
              ocrVerified: false,
            });
          }
        }
      }

      await createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name || ctx.user!.username || undefined,
        action: "ocr_scan",
        targetType: "pod",
        targetId: input.orderId ? String(input.orderId) : undefined,
        description: `送货单OCR识别${input.orderId ? `，订单#${input.orderId}` : ''}`,
      });

      return { ocrResult, imageUrl: input.imageUrl };
    } catch (error: any) {
      console.error("[OCR] Recognition error:", error);
      throw new Error(`OCR识别失败：${error.message}`);
    }
  }),

  // 上传送货单照片到S3
  uploadDeliveryNote: protectedProcedure.input(
    z.object({
      fileName: z.string(),
      fileBase64: z.string(),
      contentType: z.string().default("image/jpeg"),
    }),
  ).mutation(async ({ ctx, input }) => {
    const buffer = Buffer.from(input.fileBase64, "base64");
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const fileKey = `delivery-notes/${ctx.user!.id}/${Date.now()}-${randomSuffix}-${input.fileName}`;
    const { url } = await storagePutSafe(fileKey, buffer, input.contentType);
    return { url, fileKey };
  }),

  // 货站运费图片OCR识别：上传图片并识别货站运单号、查货电话、运费等信息
  ocrFreightReceipt: protectedProcedure.input(
    z.object({
      fileName: z.string(),
      fileBase64: z.string(),
      contentType: z.string().default("image/jpeg"),
    }),
  ).mutation(async ({ ctx, input }) => {
    // 1. 上传图片到S3
    const buffer = Buffer.from(input.fileBase64, "base64");
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const fileKey = `freight-receipts/${ctx.user!.id}/${Date.now()}-${randomSuffix}-${input.fileName}`;
    const { url } = await storagePutSafe(fileKey, buffer, input.contentType);

    // 2. 调用LLM识别图片中的信息
    try {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `你是物流货站运费单据识别助手。请从图片中识别以下信息：
- 货站名称（如德坤物流、安能物流等）
- 货站运单号（托运单号、运单编号）
- 查货电话（联系电话、客服电话）
- 运费金额（包括运费、送货费、其他费用）
- 发货地
- 目的地
- 货物名称
- 重量
- 件数
请以JSON格式返回，字段名为：stationName, waybillNumber, inquiryPhone, freightAmount, deliveryFee, otherFee, originCity, destinationCity, cargoName, weight, quantity。无法识别的字段留空字符串。`,
          },
          {
            role: "user",
            content: [
              { type: "text" as const, text: "请识别这张货站运费单据图片中的信息" },
              { type: "image_url" as const, image_url: { url, detail: "high" as const } },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "freight_receipt_ocr",
            strict: true,
            schema: {
              type: "object",
              properties: {
                stationName: { type: "string", description: "货站名称" },
                waybillNumber: { type: "string", description: "货站运单号" },
                inquiryPhone: { type: "string", description: "查货电话" },
                freightAmount: { type: "string", description: "运费金额" },
                deliveryFee: { type: "string", description: "送货费" },
                otherFee: { type: "string", description: "其他费用" },
                originCity: { type: "string", description: "发货地" },
                destinationCity: { type: "string", description: "目的地" },
                cargoName: { type: "string", description: "货物名称" },
                weight: { type: "string", description: "重量" },
                quantity: { type: "string", description: "件数" },
              },
              required: ["stationName", "waybillNumber", "inquiryPhone", "freightAmount", "deliveryFee", "otherFee", "originCity", "destinationCity", "cargoName", "weight", "quantity"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices?.[0]?.message?.content;
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent) || "{}";
      const ocrResult = safeParseJSON(content);
      return { url, fileKey, ocrResult };
    } catch (e: any) {
      console.error("OCR freight receipt error:", e);
      return { url, fileKey, ocrResult: null, error: "图片识别失败，请手动填写" };
    }
  }),

  // ============================================================
  // 智能粘贴模板记忆功能
  // ============================================================

  // 保存模板：解析成功后客服可保存当前粘贴格式为模板
  saveTemplate: protectedProcedure.input(
    z.object({
      customerName: z.string().min(1, "请输入客户名称"),
      templateName: z.string().min(1, "请输入模板名称"),
      sampleText: z.string().min(1, "请提供样本文本"),
      fieldMapping: z.any().optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");

    // 检查是否已存在同名模板
    const existing = await db.select().from(pasteTemplates)
      .where(and(
        eq(pasteTemplates.customerName, input.customerName),
        eq(pasteTemplates.templateName, input.templateName),
        eq(pasteTemplates.isActive, true),
      )).limit(1);

    if (existing.length > 0) {
      // 更新现有模板
      await db.update(pasteTemplates).set({
        sampleText: input.sampleText,
        fieldMapping: input.fieldMapping || null,
      }).where(eq(pasteTemplates.id, existing[0].id));
      return { id: existing[0].id, updated: true };
    }

    const [result] = await db.insert(pasteTemplates).values({
      customerName: input.customerName,
      templateName: input.templateName,
      sampleText: input.sampleText,
      fieldMapping: input.fieldMapping || null,
      createdBy: ctx.user!.id,
      createdByName: ctx.user!.name || ctx.user!.username || "未知",
    });
    return { id: result.insertId, updated: false };
  }),

  // 获取模板列表（按客户名筛选或全部）
  listTemplates: protectedProcedure.input(
    z.object({
      customerName: z.string().optional(),
    }).optional(),
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];

    const conditions = [eq(pasteTemplates.isActive, true)];
    if (input?.customerName) {
      conditions.push(like(pasteTemplates.customerName, `%${input.customerName}%`));
    }

    const templates = await db.select().from(pasteTemplates)
      .where(and(...conditions))
      .orderBy(desc(pasteTemplates.successCount), desc(pasteTemplates.updatedAt))
      .limit(50);

    return templates;
  }),

  // 删除模板（软删除）
  deleteTemplate: protectedProcedure.input(
    z.object({ id: z.number() }),
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    await db.update(pasteTemplates).set({ isActive: false }).where(eq(pasteTemplates.id, input.id));
    return { success: true };
  }),

  // 应用模板：用已保存的模板来辅助解析新文本
  applyTemplate: permissionProcedure("order.create").input(
    z.object({
      templateId: z.number(),
      text: z.string().min(1, "请输入文本"),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");

    // 获取模板
    const [template] = await db.select().from(pasteTemplates).where(eq(pasteTemplates.id, input.templateId)).limit(1);
    if (!template) throw new Error("模板不存在");

    const regexResults = regexPreParse(input.text);

    // 获取客户和仓库列表
    let customerNames: string[] = [];
    let warehouseNames: string[] = [];
    const custs = await db.select({ name: customers.name }).from(customers).where(eq(customers.isActive, true));
    customerNames = custs.map(c => c.name);
    const whs = await db.select({ name: warehouses.name, city: warehouses.city }).from(warehouses).where(eq(warehouses.isActive, true));
    warehouseNames = whs.map(w => `${w.name}(${w.city || ''})`);

    // 构建增强的提示词，包含模板样本
    const templateHint = `

重要参考：以下是该客户之前成功解析的样本文本，请参考其格式来解析新文本：
--- 模板样本开始 ---
${template.sampleText.substring(0, 2000)}
--- 模板样本结束 ---
客户名称：${template.customerName}
${template.fieldMapping ? `字段映射规则：${JSON.stringify(template.fieldMapping)}` : ''}
请按照样本的格式规律来解析以下新文本。`;

    const systemPrompt = `你是永安物流的智能录单助手。用户会粘贴微信聊天记录或文本消息，你需要从中提取物流订单信息。

已知客户列表：${customerNames.join('、') || '暂无'}
已知仓库列表：${warehouseNames.join('、') || '暂无'}
${templateHint}

请从文本中识别以下字段：
- customerName, warehouseName, orderNumber, mergedPlanNumber, customerPrice, cargoName, weight, originCity, destinationCity, deliveryAddress, receiverName, receiverPhone, cargoSpec, specialRequirements, shippingNote, remarks, isUrgent, urgentReason, isLargeSlab, chargeableWeight, packageCount, palletCount, largeSlabShippingRequired

规则同标准解析，但优先参考模板样本的格式规律。

【极其重要的规则】：
1. customerPrice：只有原文明确出现价格/金额数字时才填写，绝对禁止自行计算或推测价格！没有价格则填空字符串
2. receiverName/receiverPhone：从地址后面提取收货人姓名和电话（支持座机号如0757-82275371）
3. remarks：必须提取装卸顺序说明（如"先装XX再装XX"）和调度安排说明（如"共31.84吨，请安排"）
4. mergedPlanNumber：P开头+数字的编号就是合并计划号
5. "--"或"---"分隔符左边是仓库，右边是收货地址
6. 每个子单可能有不同的发出仓库，必须为每个子单独立识别warehouseName；如果只有一个仓库则所有子单共用

正则预提取结果供参考：${JSON.stringify(regexResults)}`;

    try {
      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: input.text },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "smart_paste_result",
            strict: true,
            schema: {
              type: "object",
              properties: {
                orders: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      customerName: { type: "string" },
                      warehouseName: { type: "string" },
                      orderNumber: { type: "string" },
                      mergedPlanNumber: { type: "string" },
                      customerPrice: { type: "string" },
                      cargoName: { type: "string" },
                      weight: { type: "string" },
                      originCity: { type: "string" },
                      destinationCity: { type: "string" },
                      deliveryAddress: { type: "string" },
                      receiverName: { type: "string" },
                      receiverPhone: { type: "string" },
                      cargoSpec: { type: "string" },
                      specialRequirements: { type: "string" },
                      shippingNote: { type: "string" },
                      remarks: { type: "string" },
                      isUrgent: { type: "boolean" },
                      urgentReason: { type: "string" },
                      isLargeSlab: { type: "boolean" },
                      chargeableWeight: { type: "string" },
                      packageCount: { type: "string" },
                      palletCount: { type: "string" },
                      largeSlabShippingRequired: { type: "boolean" },
                    },
                    required: ["customerName", "warehouseName", "orderNumber", "mergedPlanNumber", "customerPrice", "cargoName", "weight", "originCity", "destinationCity", "deliveryAddress", "receiverName", "receiverPhone", "cargoSpec", "specialRequirements", "shippingNote", "remarks", "isUrgent", "urgentReason", "isLargeSlab", "chargeableWeight", "packageCount", "palletCount", "largeSlabShippingRequired"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["orders"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices?.[0]?.message?.content;
      if (!rawContent) throw new Error("LLM返回为空");
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
      const parsed = safeParseJSON(content);
      // 更新模板使用次数数
      await db.update(pasteTemplates).set({
        successCount: sql`${pasteTemplates.successCount} + 1`,
        lastUsedAt: new Date(),
      }).where(eq(pasteTemplates.id, input.templateId));

      await createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name || ctx.user!.username || undefined,
        action: "smart_paste_template",
        targetType: "order",
        description: `使用模板"${template.templateName}"解析，识别出${parsed.orders?.length || 0}条订单`,
      });

      return { orders: parsed.orders || [], rawText: input.text, templateUsed: template.templateName };
    } catch (error: any) {
      console.error("[SmartPaste] Template-based parse error:", error);
      throw new Error(`模板解析失败：${error.message}`);
    }
  }),

  // 自动学习：解析成功后自动更新模板的成功次数
  recordTemplateSuccess: protectedProcedure.input(
    z.object({
      customerName: z.string(),
      rawText: z.string(),
    }),
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) return { matched: false };

    // 查找该客户的模板
    const templates = await db.select().from(pasteTemplates)
      .where(and(
        eq(pasteTemplates.customerName, input.customerName),
        eq(pasteTemplates.isActive, true),
      ))
      .orderBy(desc(pasteTemplates.successCount))
      .limit(5);

    if (templates.length === 0) return { matched: false };

    // 简单相似度匹配：检查新文本与模板样本的结构相似度
    for (const tpl of templates) {
      // 简单含有关键词匹配（如客户名、分隔符格式等）
      const sampleLines = tpl.sampleText.split('\n').filter(l => l.trim()).length;
      const newLines = input.rawText.split('\n').filter(l => l.trim()).length;
      // 行数相近且包含客户名，认为匹配
      if (Math.abs(sampleLines - newLines) <= sampleLines * 0.5) {
        await db.update(pasteTemplates).set({
          successCount: sql`${pasteTemplates.successCount} + 1`,
          lastUsedAt: new Date(),
        }).where(eq(pasteTemplates.id, tpl.id));
        return { matched: true, templateId: tpl.id, templateName: tpl.templateName };
      }
    }

    return { matched: false };
  }),

  // 自动推荐模板：根据粘贴文本自动匹配最佳模板
  matchTemplate: protectedProcedure.input(
    z.object({
      text: z.string().min(1),
    }),
  ).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) return { matched: false, templates: [] };

    // 获取所有活跃模板
    const allTemplates = await db.select().from(pasteTemplates)
      .where(eq(pasteTemplates.isActive, true))
      .orderBy(desc(pasteTemplates.successCount))
      .limit(100);

    if (allTemplates.length === 0) return { matched: false, templates: [] };

    const inputText = input.text.trim();
    const inputLines = inputText.split('\n').filter(l => l.trim());
    const inputLineCount = inputLines.length;

    // 提取输入文本的特征
    const inputFeatures = extractTextFeatures(inputText);

    // 对每个模板计算相似度分数
    const scored = allTemplates.map(tpl => {
      const sampleText = (tpl.sampleText || '').trim();
      const sampleFeatures = extractTextFeatures(sampleText);
      let score = 0;

      // 1. 客户名匹配（最高权重）
      if (inputText.includes(tpl.customerName)) {
        score += 40;
      } else {
        // 部分匹配（客户名前2字）
        const shortName = tpl.customerName.substring(0, 2);
        if (shortName.length >= 2 && inputText.includes(shortName)) {
          score += 15;
        }
      }

      // 2. 行数结构相似度
      const sampleLineCount = sampleText.split('\n').filter(l => l.trim()).length;
      if (sampleLineCount > 0 && inputLineCount > 0) {
        const ratio = Math.min(sampleLineCount, inputLineCount) / Math.max(sampleLineCount, inputLineCount);
        score += Math.round(ratio * 15);
      }

      // 3. 关键分隔符匹配（如 "---" "合并计划号" 等）
      if (inputFeatures.hasSeparator && sampleFeatures.hasSeparator) score += 10;
      if (inputFeatures.hasMergedPlan && sampleFeatures.hasMergedPlan) score += 10;
      if (inputFeatures.hasOrderNumber && sampleFeatures.hasOrderNumber) score += 5;

      // 4. 地名重叠度
      const commonCities = inputFeatures.cities.filter(c => sampleFeatures.cities.includes(c));
      score += Math.min(commonCities.length * 3, 10);

      // 5. 模板使用次数加成（热门模板优先）
      score += Math.min((tpl.successCount || 0), 10);

      return { template: tpl, score };
    });

    // 按分数排序，取前3个
    scored.sort((a, b) => b.score - a.score);
    const topMatches = scored.filter(s => s.score >= 25).slice(0, 3);

    if (topMatches.length === 0) return { matched: false, templates: [] };

    return {
      matched: true,
      templates: topMatches.map(m => ({
        id: m.template.id,
        templateName: m.template.templateName,
        customerName: m.template.customerName,
        successCount: m.template.successCount,
        score: m.score,
      })),
    };
  }),

  // ============================================================
  // TMS格式导出 (设计方案 11章)
  // ============================================================
  tmsExport: permissionProcedure("export.customer_ledger").input(
    z.object({
      exportType: z.enum(["full", "outsource", "self", "ltl"]),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      customerId: z.number().optional(),
    }),
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { columns: [], rows: [] };

    // ========== 防止OOM：强制时间范围验证 ==========
    if (!input.startDate || !input.endDate) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "导出必须选择开始日期和结束日期",
      });
    }
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "日期格式不正确，请检查后重试",
      });
    }
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "结束日期不能早于开始日期",
      });
    }
    if (diffDays > 31) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `导出时间跨度不能超过31天（当前跨度${Math.ceil(diffDays)}天），请缩小时间范围`,
      });
    }

    const conditions: any[] = [];
    if (input.exportType !== "full") {
      const typeMap: Record<string, string> = { outsource: "outsource", self: "self", ltl: "ltl" };
      conditions.push(eq(orders.businessType, typeMap[input.exportType] as any));
    }
    conditions.push(gte(orders.orderDate, start));
    conditions.push(lte(orders.orderDate, end));
    if (input.customerId) conditions.push(eq(orders.customerId, input.customerId));

    const whereClause = and(...conditions);

    const items = await db.select().from(orders).where(whereClause).orderBy(desc(orders.orderDate));

    // TMS 34列格式
    const columns = [
      "序号", "系统编号", "客户订单号", "业务类型", "部门", "客户名称",
      "客户电话", "结算方式", "货物名称", "重量(吨)", "包装方式",
      "货物规格", "特殊要求", "发货仓库", "发货城市", "收货地址",
      "目的城市", "收货人", "收货人电话", "报价(元/吨)", "调度价格",
      "实际运费", "送货费", "加价费", "总费用", "车牌号", "司机姓名",
      "司机电话", "货站名称", "订单状态", "是否加急", "下单日期",
      "调度日期", "送达日期",
    ];

    const packagingLabels: Record<string, string> = { pallet: "托盘", loose: "散装", pallet_loaded: "带板装" };
    const settlementLabels: Record<string, string> = { monthly: "月结", cash: "现付", collect: "到付" };
    const businessLabels: Record<string, string> = { outsource: "外请", self: "自运", ltl: "零担" };
    const statusLabels: Record<string, string> = {
      pending_assign: "待指派", pending_dispatch: "待调度", pending_price: "待定价",
      priced: "已定价", pending_vehicle: "待找车", pending_approval: "待审批",
      pending_inquiry: "待询价", inquiry_confirmed: "已询价", dispatched: "已调度",
      in_transit: "运输中", delivered: "已送达", signed: "已签收",
      settled: "已结算", on_hold: "等通知", cancelled: "已取消",
    };

    const rows = items.map((item, idx) => [
      idx + 1,
      item.systemCode,
      item.orderNumber || "",
      businessLabels[item.businessType] || item.businessType,
      item.department || "",
      item.customerName || "",
      item.customerPhone || "",
      settlementLabels[item.settlementType || ""] || item.settlementType || "",
      item.cargoName || "",
      item.weight || "",
      packagingLabels[item.packagingType || ""] || item.packagingType || "",
      item.cargoSpec || "",
      item.specialRequirements || "",
      item.warehouseName || "",
      item.originCity || "",
      item.deliveryAddress || "",
      item.destinationCity || "",
      item.receiverName || "",
      item.receiverPhone || "",
      item.quotedPrice || "",
      item.dispatchPrice || "",
      item.actualFreight || "",
      item.deliveryFee || "",
      item.extraFee || "",
      item.totalCost || "",
      item.plateNumber || "",
      item.driverName || "",
      item.driverPhone || "",
      item.freightStationName || "",
      statusLabels[item.status] || item.status,
      item.isUrgent ? "是" : "否",
      item.orderDate ? new Date(item.orderDate).toLocaleDateString("zh-CN") : "",
      item.dispatchDate ? new Date(item.dispatchDate).toLocaleDateString("zh-CN") : "",
      item.deliveryDate ? new Date(item.deliveryDate).toLocaleDateString("zh-CN") : "",
    ]);

    return { columns, rows, total: items.length };
  }),
});
