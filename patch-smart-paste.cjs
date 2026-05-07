const fs = require('fs');
const path = require('path');

const distFile = process.env.YONGAN_DIST_FILE || '/var/www/yongan/dist/index.js';

const MARKER_START = '/* REGEX_SMART_PASTE_INLINED_START */';
const MARKER_END = '/* REGEX_SMART_PASTE_INLINED_END */';

const injection = String.raw`
/* REGEX_SMART_PASTE_INLINED_START */
const __regexSmartPasteConfidenceTemplate = () => ({
  customerName: 'low',
  warehouseName: 'low',
  orderNumber: 'low',
  mergedPlanNumber: 'low',
  customerPrice: 'low',
  cargoName: 'low',
  weight: 'low',
  originCity: 'low',
  destinationCity: 'low',
  deliveryAddress: 'low',
  receiverName: 'low',
  receiverPhone: 'low',
  cargoSpec: 'low',
  specialRequirements: 'low',
  shippingNote: 'low',
  remarks: 'low',
  isUrgent: 'low',
  urgentReason: 'low',
  packageCount: 'low',
  palletCount: 'low',
  chargeableWeight: 'low',
  largeSlabShippingRequired: 'low'
});

const __regexSmartPasteOrderRe = /\b((?!P\d{6,}\b)[A-Z]{1,3}\d{6,})\b/g;
const __regexSmartPastePlanRe = /\b(P\d{6,})\b/i;
const __regexSmartPasteMobileRe = /(?<!\d)(1[3-9]\d{9})(?!\d)/;
const __regexSmartPasteLandlineRe = /(?<!\d)(0\d{2,3}-\d{7,8}|0\d{9,11})(?!\d)/;
const __regexSmartPasteSpecRe = /(\d{2,4})\s*[xX×*]\s*(\d{2,4})(?:\s*[xX×*]\s*(\d{2,4}))?/;
const __regexSmartPasteWeightRe = /(\d+(?:\.\d+)?)\s*(KG|KGS|公斤|千克|吨|T)(?![A-Za-z])/i;
const __regexSmartPastePalletRe = /([0-9一二三四五六七八九十两俩半]+(?:\.\d+)?)\s*(托|卡板|板)(?![材块])/i;
const __regexSmartPasteJiaRe = /([0-9一二三四五六七八九十两俩半]+(?:\.\d+)?)\s*架/i;
const __regexSmartPastePackageRe = /([0-9一二三四五六七八九十两俩半]+(?:\.\d+)?)\s*(件|箱|包|扎|捆|片|支|块)/i;
const __regexSmartPasteUrgentRe = /(加急|急发|优先|马上|立即|尽快|今天到|明早到|催送)/;
const __regexSmartPasteLargeSlabRe = /(大板|岩板|连纹|SC\s*:|SC：|SC:)/i;
const __regexSmartPasteLargeSlabShippingRe = /(按大板发货要求执行|大板发货|岩板发货|按大板要求执行)/;
const __regexSmartPasteCargoKeywords = ['岩板', '瓷砖', '地砖', '墙砖', '板材', '石材', '陶瓷', '玻璃'];
const __regexSmartPasteNameBlacklistEnd = /(省|市|区|县|镇|乡|村|路|街|道|仓|园|栋|楼|号)$/;
const __regexSmartPasteNameBlacklistWord = /(广东|广西|福建|江西|湖南|湖北|浙江|江苏|上海|北京|重庆|天津|佛山|清远|南昌|南庄|红谷滩|工业园|物流|仓库|电话|手机|收货|地址|发货|客户|备注|要求)/;

function __regexSmartPasteCleanupText(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\u3000/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\t/g, ' ')
    .replace(/[：]/g, ':')
    .replace(/[，；]/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function __regexSmartPasteTrimValue(value) {
  return String(value || '').replace(/^[\s,，;；:：-]+|[\s,，;；:：-]+$/g, '').trim();
}

function __regexSmartPasteUniqueJoin(values, sep) {
  const arr = (values || [])
    .map((v) => __regexSmartPasteTrimValue(v))
    .filter(Boolean)
    .filter((v, idx, self) => self.indexOf(v) === idx);
  return arr.join(sep || '；');
}

function __regexSmartPasteParseChineseCount(raw) {
  const text = __regexSmartPasteTrimValue(raw);
  if (!text) return NaN;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const map = { 零: 0, 一: 1, 二: 2, 两: 2, 俩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (text === '十') return 10;
  if (text === '半') return 0.5;
  if (text.includes('十')) {
    const parts = text.split('十');
    const tens = parts[0] ? (map[parts[0]] || 0) : 1;
    const units = parts[1] ? (map[parts[1]] || 0) : 0;
    return tens * 10 + units;
  }
  if (text.length === 1 && map[text] !== undefined) return map[text];
  return NaN;
}

function __regexSmartPasteNormalizeCount(raw) {
  const num = __regexSmartPasteParseChineseCount(raw);
  if (!Number.isFinite(num)) return '';
  if (Math.abs(num - Math.round(num)) < 1e-9) return String(Math.round(num));
  return String(Number(num.toFixed(2))).replace(/\.0+$/, '');
}

function __regexSmartPasteTrimNumber(num, digits) {
  if (!Number.isFinite(num)) return '';
  const fixed = Number(num.toFixed(typeof digits === 'number' ? digits : 5));
  if (Math.abs(fixed - Math.round(fixed)) < 1e-9) return String(Math.round(fixed));
  return String(fixed);
}

function __regexSmartPasteNormalizeCargoSpec(spec) {
  const text = __regexSmartPasteTrimValue(spec).replace(/\s+/g, '');
  const match = text.match(__regexSmartPasteSpecRe);
  if (!match) return '';
  const parts = [match[1], match[2]];
  if (match[3]) parts.push(match[3]);
  return parts.join('*');
}

function __regexSmartPasteFirstMatch(text, regex, group) {
  const match = __regexSmartPasteCleanupText(text).match(regex);
  const index = typeof group === 'number' ? group : 1;
  return match ? __regexSmartPasteTrimValue(match[index] || match[0]) : '';
}

function __regexSmartPasteSplitOrderBlocks(text) {
  const clean = __regexSmartPasteCleanupText(text);
  const matches = [...clean.matchAll(__regexSmartPasteOrderRe)];
  if (matches.length === 0) return [clean];
  const blocks = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : clean.length;
    blocks.push(clean.slice(start, end).trim());
  }
  return blocks.filter(Boolean);
}

function __regexSmartPasteExtractMergedPlanNumber(text) {
  return __regexSmartPasteFirstMatch(text, __regexSmartPastePlanRe, 1).toUpperCase();
}

function __regexSmartPasteExtractOrderNumber(text) {
  return __regexSmartPasteFirstMatch(text, /\b((?!P\d{6,}\b)[A-Z]{1,3}\d{6,})\b/i, 1).toUpperCase();
}

function __regexSmartPasteExtractWarehouseName(text) {
  const clean = __regexSmartPasteCleanupText(text);
  let match = clean.match(/(?:^|\n|\s)([\u4e00-\u9fa5A-Za-z0-9()（）_-]{2,20}?仓)\s*-{2,}/);
  if (match) return __regexSmartPasteTrimValue(match[1]);
  match = clean.match(/(?:^|\n|\s)([\u4e00-\u9fa5A-Za-z0-9()（）_-]{2,20}?仓)(?=\s|$)/);
  if (match) return __regexSmartPasteTrimValue(match[1]);
  match = clean.match(/([\u4e00-\u9fa5]{2,8})\s*发\s*[\u4e00-\u9fa5]{2,8}/);
  if (match) return __regexSmartPasteTrimValue(match[1] + '仓');
  return '';
}

function __regexSmartPasteExtractReceiverPhone(text) {
  const clean = __regexSmartPasteCleanupText(text);
  const mobile = clean.match(__regexSmartPasteMobileRe);
  if (mobile) return mobile[1];
  if (/(电话|座机|固话|tel|TEL)/.test(clean)) {
    const landline = clean.match(__regexSmartPasteLandlineRe);
    return landline ? landline[1] : '';
  }
  return '';
}

function __regexSmartPasteLooksLikeName(name) {
  const value = __regexSmartPasteTrimValue(name);
  if (!/^[\u4e00-\u9fa5]{2,4}$/.test(value)) return false;
  if (__regexSmartPasteNameBlacklistEnd.test(value)) return false;
  if (__regexSmartPasteNameBlacklistWord.test(value)) return false;
  return true;
}

function __regexSmartPasteExtractReceiverName(text, phone) {
  const clean = __regexSmartPasteCleanupText(text);
  let match = clean.match(/收货人\s*:?\s*([\u4e00-\u9fa5]{2,4})/);
  if (match && __regexSmartPasteLooksLikeName(match[1])) return match[1];

  if (phone && clean.includes(phone)) {
    const beforePhone = clean.slice(0, clean.indexOf(phone));
    const candidates = beforePhone.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      if (__regexSmartPasteLooksLikeName(candidates[i])) return candidates[i];
    }
  }

  const lines = clean.split(/\n+/).map(__regexSmartPasteTrimValue).filter(Boolean);
  for (const line of lines) {
    const candidates = line.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      if (__regexSmartPasteLooksLikeName(candidates[i])) return candidates[i];
    }
  }
  return '';
}

function __regexSmartPasteExtractWeight(text) {
  const clean = __regexSmartPasteCleanupText(text);
  const match = clean.match(__regexSmartPasteWeightRe);
  if (!match) return '';
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return '';
  const unit = String(match[2] || '').toUpperCase();
  const ton = /KG|KGS|公斤|千克/.test(unit) ? num / 1000 : num;
  return __regexSmartPasteTrimNumber(ton, 5);
}

function __regexSmartPasteExtractSpec(text) {
  const clean = __regexSmartPasteCleanupText(text);
  let match = clean.match(/SC\s*:\s*([\d\s*xX×*]{5,20})/i);
  if (match) return __regexSmartPasteNormalizeCargoSpec(match[1]);
  match = clean.match(__regexSmartPasteSpecRe);
  return match ? __regexSmartPasteNormalizeCargoSpec(match[0]) : '';
}

function __regexSmartPasteExtractCounts(text) {
  const clean = __regexSmartPasteCleanupText(text);
  const palletMatch = clean.match(__regexSmartPastePalletRe);
  const jiaMatch = clean.match(__regexSmartPasteJiaRe);
  const packageMatch = clean.match(__regexSmartPastePackageRe);
  return {
    palletCount: palletMatch ? __regexSmartPasteNormalizeCount(palletMatch[1]) : '',
    jiaCount: jiaMatch ? __regexSmartPasteNormalizeCount(jiaMatch[1]) : '',
    packageCount: packageMatch ? __regexSmartPasteNormalizeCount(packageMatch[1]) : ''
  };
}

function __regexSmartPasteDetectLargeSlab(text, spec) {
  const clean = __regexSmartPasteCleanupText(text);
  if (__regexSmartPasteLargeSlabRe.test(clean)) return true;
  const normalized = __regexSmartPasteNormalizeCargoSpec(spec);
  if (!normalized) return false;
  const nums = normalized.split('*').map((v) => Number(v)).filter(Number.isFinite);
  if (nums.length < 2) return false;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  return max >= 1200 && min >= 800;
}

function __regexSmartPasteExtractCargoName(text, spec) {
  const clean = __regexSmartPasteCleanupText(text);
  for (const keyword of __regexSmartPasteCargoKeywords) {
    if (clean.includes(keyword)) return keyword;
  }
  if (__regexSmartPasteNormalizeCargoSpec(spec)) return '瓷砖';
  return '';
}

function __regexSmartPasteDeriveOriginCity(warehouseName, text) {
  const cleanWarehouse = __regexSmartPasteTrimValue(warehouseName).replace(/仓$/, '');
  if (cleanWarehouse) {
    const match = cleanWarehouse.match(/([\u4e00-\u9fa5]{2,8})(?:市)?$/);
    if (match) return match[1];
  }
  const clean = __regexSmartPasteCleanupText(text);
  let match = clean.match(/([\u4e00-\u9fa5]{2,8})仓/);
  if (match) return match[1].replace(/市$/, '');
  match = clean.match(/([\u4e00-\u9fa5]{2,8})\s*发\s*[\u4e00-\u9fa5]{2,8}/);
  return match ? match[1].replace(/市$/, '') : '';
}

function __regexSmartPasteDeriveDestinationCity(address, text) {
  const source = __regexSmartPasteCleanupText(address || text);
  let match = source.match(/(?:[\u4e00-\u9fa5]{2,8}省|[\u4e00-\u9fa5]{2,8}自治区)?\s*([\u4e00-\u9fa5]{2,8}市)/);
  if (match) return __regexSmartPasteTrimValue(match[1]);
  match = source.match(/(?:到|至|发往|发)\s*([\u4e00-\u9fa5]{2,8})/);
  if (match) return __regexSmartPasteTrimValue(match[1]);
  match = source.match(/([\u4e00-\u9fa5]{2,8})(?=区|县|镇|乡|街道|街|路)/);
  if (match) return __regexSmartPasteTrimValue(match[1]);
  match = source.match(/^[\u4e00-\u9fa5]{2,8}$/);
  if (match) return __regexSmartPasteTrimValue(match[0]);
  return '';
}

function __regexSmartPasteCleanupAddress(address, extras) {
  let value = __regexSmartPasteCleanupText(address);
  if (!value) return '';
  const phone = extras && extras.phone ? extras.phone : '';
  const name = extras && extras.name ? extras.name : '';
  const warehouseName = extras && extras.warehouseName ? extras.warehouseName : '';
  if (phone) value = value.replace(phone, ' ');
  if (name) value = value.replace(name, ' ');
  if (warehouseName) value = value.replace(warehouseName, ' ');
  value = value.replace(/收货人\s*:?[\u4e00-\u9fa5]{2,4}/g, ' ');
  value = value.replace(/电话\s*:?\s*(?:1[3-9]\d{9}|0\d{2,3}-?\d{7,8})/g, ' ');
  value = value.replace(/\b(?:F|P)[A-Z0-9]*\d{6,}\b/ig, ' ');
  value = value.replace(__regexSmartPasteSpecRe, ' ');
  value = value.replace(/\d+(?:\.\d+)?\s*(?:KG|KGS|公斤|千克|吨|T)\b/ig, ' ');
  value = value.replace(/[\-—]{2,}/g, ' ');
  value = value.replace(/\s+/g, ' ').trim();
  return value;
}

function __regexSmartPasteExtractAddress(text, warehouseName, phone, receiverName) {
  const clean = __regexSmartPasteCleanupText(text);

  let match = clean.match(/仓\s*[-—]{2,}\s*([^\n]+)/);
  if (match) return __regexSmartPasteCleanupAddress(match[1], { phone, name: receiverName, warehouseName });

  match = clean.match(/([\u4e00-\u9fa5]{2,30}仓)\s*[-—]{2,}\s*([^\n]+)/);
  if (match) return __regexSmartPasteCleanupAddress(match[2], { phone, name: receiverName, warehouseName: match[1] });

  match = clean.match(/(?:地址|送货地址|收货地址)\s*:?\s*([^\n]+)/);
  if (match) return __regexSmartPasteCleanupAddress(match[1], { phone, name: receiverName, warehouseName });

  if (phone && clean.includes(phone)) {
    const beforePhone = clean.slice(0, clean.indexOf(phone));
    const lines = beforePhone.split(/\n+/).map(__regexSmartPasteTrimValue).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const candidate = __regexSmartPasteCleanupAddress(lines[i], { phone, name: receiverName, warehouseName });
      if (!candidate) continue;
      if (candidate.includes('省') || candidate.includes('市') || candidate.includes('区') || candidate.includes('县') || candidate.includes('镇') || candidate.includes('路')) {
        return candidate;
      }
    }
  }

  const lines = clean.split(/\n+/).map(__regexSmartPasteTrimValue).filter(Boolean);
  for (const line of lines) {
    if (warehouseName && line.includes(warehouseName) && /[-—]{2,}/.test(line)) {
      const candidate = __regexSmartPasteCleanupAddress(line.split(/[-—]{2,}/).slice(1).join(' '), { phone, name: receiverName, warehouseName });
      if (candidate) return candidate;
    }
  }

  return '';
}

function __regexSmartPasteExtractCustomerName(text) {
  const clean = __regexSmartPasteCleanupText(text);
  let match = clean.match(/(?:客户|客户名|下单客户|发货客户)\s*:?\s*([\u4e00-\u9fa5A-Za-z0-9()（）]{2,30})/);
  if (match) return __regexSmartPasteTrimValue(match[1]);
  match = clean.match(/([\u4e00-\u9fa5A-Za-z0-9()（）]{2,30})(?:公司|贸易|建材|陶瓷)/);
  return match ? __regexSmartPasteTrimValue(match[0]) : '';
}

function __regexSmartPasteExtractCustomerPrice(text) {
  const clean = __regexSmartPasteCleanupText(text);
  const match = clean.match(/(?:客户运价|客户单价|单价|运费|价格)\s*:?\s*(\d+(?:\.\d+)?)/i);
  return match ? __regexSmartPasteTrimValue(match[1]) : '';
}

function __regexSmartPasteExtractFallbackShippingNote(text) {
  const lines = __regexSmartPasteCleanupText(text)
    .split(/\n+/)
    .map(__regexSmartPasteTrimValue)
    .filter(Boolean)
    .filter((line) => /(按.+执行|要求|备注|注意|回单|加急|尽快|送货前|联系|上楼|叉车|卸货)/.test(line))
    .filter((line) => !/^P\d{6,}$/i.test(line));
  return __regexSmartPasteUniqueJoin(lines, '；');
}

function __regexSmartPasteExtractTextFeatures(text) {
  const clean = __regexSmartPasteCleanupText(text);
  return {
    hasUrgent: __regexSmartPasteUrgentRe.test(clean),
    hasLargeSlab: __regexSmartPasteLargeSlabRe.test(clean),
    largeSlabShippingRequired: __regexSmartPasteLargeSlabShippingRe.test(clean)
  };
}

function __regexSmartPasteBuildOrder(block, context) {
  const cleanBlock = __regexSmartPasteCleanupText(block);
  const confidence = __regexSmartPasteConfidenceTemplate();

  const warehouseName = __regexSmartPasteExtractWarehouseName(cleanBlock) || context.warehouseName || '';
  const mergedPlanNumber = __regexSmartPasteExtractMergedPlanNumber(cleanBlock) || context.mergedPlanNumber || '';
  const orderNumber = __regexSmartPasteExtractOrderNumber(cleanBlock) || '';
  const receiverPhone = __regexSmartPasteExtractReceiverPhone(cleanBlock) || context.receiverPhone || '';
  const receiverName = __regexSmartPasteExtractReceiverName(cleanBlock, receiverPhone) || context.receiverName || '';
  const deliveryAddress = __regexSmartPasteExtractAddress(cleanBlock, warehouseName, receiverPhone, receiverName) || context.deliveryAddress || '';
  const spec = __regexSmartPasteExtractSpec(cleanBlock) || context.cargoSpec || '';
  const weight = __regexSmartPasteExtractWeight(cleanBlock) || context.weight || '';
  const counts = __regexSmartPasteExtractCounts(cleanBlock);
  const cargoName = __regexSmartPasteExtractCargoName(cleanBlock, spec) || context.cargoName || '';
  const originCity = __regexSmartPasteDeriveOriginCity(warehouseName, cleanBlock) || context.originCity || '';
  const destinationCity = __regexSmartPasteDeriveDestinationCity(deliveryAddress, cleanBlock) || context.destinationCity || '';
  const customerName = __regexSmartPasteExtractCustomerName(cleanBlock) || context.customerName || '';
  const customerPrice = __regexSmartPasteExtractCustomerPrice(cleanBlock) || context.customerPrice || '';
  const urgentMatch = cleanBlock.match(__regexSmartPasteUrgentRe);
  const isUrgent = !!urgentMatch || !!context.isUrgent;
  const urgentReason = urgentMatch ? __regexSmartPasteTrimValue(urgentMatch[1] || urgentMatch[0]) : (context.urgentReason || '');
  const fallbackShippingNote = __regexSmartPasteExtractFallbackShippingNote(cleanBlock);
  const specialRequirements = __regexSmartPasteUniqueJoin([
    fallbackShippingNote,
    context.specialRequirements,
    context.largeSlabShippingRequired ? '按大板发货要求执行' : ''
  ], '；');
  const shippingNote = __regexSmartPasteUniqueJoin([
    fallbackShippingNote,
    context.shippingNote,
    context.largeSlabShippingRequired ? '按大板发货要求执行' : ''
  ], '；');
  const isLargeSlab = __regexSmartPasteDetectLargeSlab(cleanBlock, spec) || context.isLargeSlab;
  const largeSlabShippingRequired = !!context.largeSlabShippingRequired || isLargeSlab;

  const order = {
    customerName,
    warehouseName,
    orderNumber,
    mergedPlanNumber,
    customerPrice,
    cargoName,
    weight,
    originCity,
    destinationCity,
    deliveryAddress,
    receiverName,
    receiverPhone,
    cargoSpec: spec,
    specialRequirements,
    shippingNote,
    remarks: '',
    isUrgent,
    urgentReason,
    isLargeSlab,
    chargeableWeight: '',
    packageCount: counts.packageCount || context.packageCount || '',
    palletCount: counts.palletCount || context.palletCount || '',
    largeSlabShippingRequired,
    confidence
  };

  if (order.customerName) confidence.customerName = 'medium';
  if (order.warehouseName) confidence.warehouseName = 'high';
  if (order.orderNumber) confidence.orderNumber = 'high';
  if (order.mergedPlanNumber) confidence.mergedPlanNumber = 'high';
  if (order.customerPrice) confidence.customerPrice = 'medium';
  if (order.cargoName) confidence.cargoName = spec ? 'medium' : 'low';
  if (order.weight) confidence.weight = 'high';
  if (order.originCity) confidence.originCity = 'medium';
  if (order.destinationCity) confidence.destinationCity = order.deliveryAddress ? 'medium' : 'low';
  if (order.deliveryAddress) confidence.deliveryAddress = 'high';
  if (order.receiverName) confidence.receiverName = 'high';
  if (order.receiverPhone) confidence.receiverPhone = 'high';
  if (order.cargoSpec) confidence.cargoSpec = 'high';
  if (order.specialRequirements) confidence.specialRequirements = 'medium';
  if (order.shippingNote) confidence.shippingNote = 'medium';
  if (order.isUrgent) confidence.isUrgent = 'medium';
  if (order.urgentReason) confidence.urgentReason = 'medium';
  if (order.packageCount) confidence.packageCount = 'high';
  if (order.palletCount) confidence.palletCount = 'high';
  if (order.largeSlabShippingRequired) confidence.largeSlabShippingRequired = 'medium';

  return order;
}

function regexParseOrders(text) {
  const cleanText = __regexSmartPasteCleanupText(text);
  const globalFeatures = __regexSmartPasteExtractTextFeatures(cleanText);
  const globalWarehouse = __regexSmartPasteExtractWarehouseName(cleanText);
  const globalMergedPlanNumber = __regexSmartPasteExtractMergedPlanNumber(cleanText);
  const globalSpec = __regexSmartPasteExtractSpec(cleanText);
  const globalWeight = __regexSmartPasteExtractWeight(cleanText);
  const globalCounts = __regexSmartPasteExtractCounts(cleanText);
  const globalPhone = __regexSmartPasteExtractReceiverPhone(cleanText);
  const globalName = __regexSmartPasteExtractReceiverName(cleanText, globalPhone);
  const globalAddress = __regexSmartPasteExtractAddress(cleanText, globalWarehouse, globalPhone, globalName);
  const globalShippingNote = __regexSmartPasteExtractFallbackShippingNote(cleanText);
  const blocks = __regexSmartPasteSplitOrderBlocks(cleanText);

  const context = {
    warehouseName: globalWarehouse,
    mergedPlanNumber: globalMergedPlanNumber,
    cargoSpec: blocks.length > 1 ? globalSpec : globalSpec,
    weight: blocks.length === 1 ? globalWeight : '',
    cargoName: __regexSmartPasteExtractCargoName(cleanText, globalSpec),
    originCity: __regexSmartPasteDeriveOriginCity(globalWarehouse, cleanText),
    destinationCity: __regexSmartPasteDeriveDestinationCity(globalAddress, cleanText),
    deliveryAddress: blocks.length === 1 ? globalAddress : '',
    receiverName: blocks.length === 1 ? globalName : '',
    receiverPhone: blocks.length === 1 ? globalPhone : '',
    customerName: __regexSmartPasteExtractCustomerName(cleanText),
    customerPrice: __regexSmartPasteExtractCustomerPrice(cleanText),
    packageCount: globalCounts.packageCount,
    palletCount: globalCounts.palletCount,
    shippingNote: globalShippingNote,
    specialRequirements: globalShippingNote,
    isUrgent: globalFeatures.hasUrgent,
    urgentReason: globalFeatures.hasUrgent ? (__regexSmartPasteFirstMatch(cleanText, __regexSmartPasteUrgentRe, 1) || '加急') : '',
    isLargeSlab: globalFeatures.hasLargeSlab || __regexSmartPasteDetectLargeSlab(cleanText, globalSpec),
    largeSlabShippingRequired: globalFeatures.largeSlabShippingRequired
  };

  const orders = blocks
    .map((block) => __regexSmartPasteBuildOrder(block, context))
    .filter((order) => {
      return [
        order.orderNumber,
        order.mergedPlanNumber,
        order.deliveryAddress,
        order.receiverPhone,
        order.receiverName,
        order.cargoSpec,
        order.weight,
        order.warehouseName
      ].some(Boolean);
    });

  if (orders.length === 0) {
    orders.push(__regexSmartPasteBuildOrder(cleanText, context));
  }

  return { orders };
}
/* REGEX_SMART_PASTE_INLINED_END */
`;

function readDistFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('dist 入口文件不存在：' + filePath);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function writeDistFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function findStatementEnd(source, startIndex) {
  let quote = '';
  let escape = false;
  let blockComment = false;
  let lineComment = false;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;

  for (let i = startIndex; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === quote) {
        quote = '';
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }

    if (ch === '"' || ch === '\'' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '(') depthParen += 1;
    else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
    else if (ch === '{') depthBrace += 1;
    else if (ch === '}') depthBrace = Math.max(0, depthBrace - 1);
    else if (ch === '[') depthBracket += 1;
    else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1);
    else if (ch === ';' && depthParen === 0 && depthBrace === 0 && depthBracket === 0) return i + 1;
  }

  return source.length;
}

function findInjectionPoint(source) {
  let cursor = 0;
  while (cursor < source.length) {
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (!source.startsWith('import', cursor)) break;
    const stmtEnd = findStatementEnd(source, cursor);
    if (stmtEnd <= cursor) break;
    cursor = stmtEnd;
  }
  return cursor;
}

function injectParser(source) {
  if (source.includes(MARKER_START)) return source;
  const pos = findInjectionPoint(source);
  return source.slice(0, pos) + '\n' + injection + '\n' + source.slice(pos);
}

function collectInvokeIndices(source) {
  const indices = [];
  let start = 0;
  while (true) {
    const idx = source.indexOf('invokeLLM(', start);
    if (idx === -1) break;
    indices.push(idx);
    start = idx + 1;
  }
  return indices;
}

function findAnchor(source) {
  const keywords = ['smart_paste_result', '智能解析失败', 'regexPreParse', 'smartPaste.parse', 'smartPaste'];
  for (const keyword of keywords) {
    const idx = source.indexOf(keyword);
    if (idx !== -1) return idx;
  }
  return -1;
}

function pickInvokeIndex(source, candidates) {
  if (candidates.length === 0) return -1;
  if (candidates.length === 1) return candidates[0];
  const anchor = findAnchor(source);
  if (anchor === -1) return candidates[0];
  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const idx of candidates) {
    const score = Math.abs(idx - anchor);
    if (score < bestScore) {
      bestScore = score;
      best = idx;
    }
  }
  return best;
}

function findCallEnd(source, openParenIndex) {
  let quote = '';
  let escape = false;
  let blockComment = false;
  let lineComment = false;
  let depth = 1;

  for (let i = openParenIndex + 1; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === quote) {
        quote = '';
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }

    if (ch === '"' || ch === '\'' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }

  throw new Error('未能定位 invokeLLM 调用的结束括号');
}

function detectInputTextExpression(source, invokeIndex) {
  const nearby = source.slice(Math.max(0, invokeIndex - 1200), Math.min(source.length, invokeIndex + 300));
  const matches = [...nearby.matchAll(/\b([A-Za-z_$][\w$]*)\.text\b/g)];
  if (matches.length > 0) {
    return matches[matches.length - 1][0];
  }
  return '((typeof input!=="undefined"&&input&&typeof input.text==="string")?input.text:"")';
}

function replaceInvokeLLM(source) {
  if (source.includes('JSON.stringify(regexParseOrders(')) {
    return source;
  }

  const candidates = collectInvokeIndices(source);
  if (candidates.length === 0) {
    throw new Error('在 dist/index.js 中未找到 invokeLLM 调用');
  }

  const invokeIndex = pickInvokeIndex(source, candidates);
  const openParenIndex = source.indexOf('(', invokeIndex);
  const callEnd = findCallEnd(source, openParenIndex);

  let exprStart = invokeIndex;
  const prefix = source.slice(Math.max(0, invokeIndex - 20), invokeIndex);
  const awaitMatch = prefix.match(/await\s*$/);
  let hadAwait = false;
  if (awaitMatch) {
    hadAwait = true;
    exprStart = invokeIndex - awaitMatch[0].length;
  }

  const textExpr = detectInputTextExpression(source, invokeIndex);
  const replacement = (hadAwait ? 'await ' : '') + 'Promise.resolve({ choices: [{ message: { content: JSON.stringify(regexParseOrders(' + textExpr + ')) } }] })';

  return source.slice(0, exprStart) + replacement + source.slice(callEnd);
}

function main() {
  const source = readDistFile(distFile);
  let output = injectParser(source);
  output = replaceInvokeLLM(output);
  writeDistFile(distFile, output);
  console.log('[patch-smart-paste] 补丁已成功写入：' + distFile);
}

main();
