import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, permissionProcedure } from "../_core/trpc";
import { router } from "../_core/trpc";
import { PERMISSIONS } from "@shared/permissions";
import { optionalDecimal, requiredDecimal, optionalWeight, optionalPositiveInt, requiredPositiveDecimal, optionalPositiveDecimal, requiredPositiveWeight } from "@shared/validators";
import { getDb } from "../db";
import { orders, dispatcherRegions, users, approvals, operationLogs, podRecords, ltlDispatchBatches, ltlDispatchBatchOrders, vehicles, drivers, noteChangeLogs } from "../../drizzle/schema";
import { eq, and, or, like, desc, asc, sql, inArray, isNull, gte, lte, count, ne } from "drizzle-orm";
import { createOperationLog, findFreightStationByName, createFreightStation } from "../db";
import { trackFieldChanges, classifyEntryQueuePendingAssignEvent } from "../fieldChangeTracker";
import { notifyOwner } from "../_core/notification";
import { safeParseFloat } from "@shared/safeParseFloat";
import { normalizeLtlWeightField, resolveWeightInTons } from "@shared/ltlWeight";
import { expandDispatcherAssignmentOrderIds } from "../assignmentScope";
const dbHelpers = { findFreightStationByName, createFreightStation };
// 生成系统编号: YA + 日期 + 6位随机码（彻底解决并发漏洞，不再依赖 select count）
// 策略：时间戳 + 6位随机字母数字，并通过数据库 UNIQUE 约束 + 重试保证绝对唯一
const SYSTEM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混淆的 0/O/1/I
function randomSuffix(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += SYSTEM_CODE_CHARS[Math.floor(Math.random() * SYSTEM_CODE_CHARS.length)];
  }
  return s;
}
async function generateSystemCode(maxRetries = 5): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `YA${dateStr}`;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const code = `${prefix}${randomSuffix(6)}`;
    // 检查是否已存在
    const existing = await db.select({ id: orders.id }).from(orders)
      .where(eq(orders.systemCode, code)).limit(1);
    if (existing.length === 0) return code;
  }
  // 极端情况：多次重试后仍然冲突，追加毫秒级时间戳
  const fallback = `${prefix}${Date.now().toString(36).toUpperCase().slice(-6)}`;
  return fallback;
}
// 全量中国行政区划：城市→省份映射表
// 共 375 个城市/地区，覆盖全国34个省级行政区
// 数据来源：中国民政部行政区划代码（2023年版）
const CITY_TO_PROVINCE: Record<string, string> = {
  // 北京市
  "北京": "北京市",
  // 天津市
  "天津": "天津市",
  // 上海市
  "上海": "上海市",
  // 重庆市
  "重庆": "重庆市",
  // 河北省
  "石家庄": "河北省", "唐山": "河北省", "秦皇岛": "河北省", "邯郸": "河北省", "邢台": "河北省", "保定": "河北省", "张家口": "河北省", "承德": "河北省", "沧州": "河北省", "廊坊": "河北省", "衡水": "河北省",
  // 山西省
  "太原": "山西省", "大同": "山西省", "阳泉": "山西省", "长治": "山西省", "晋城": "山西省", "朔州": "山西省", "晋中": "山西省", "运城": "山西省", "忻州": "山西省", "临汾": "山西省", "吕梁": "山西省",
  // 内蒙古自治区
  "呼和浩特": "内蒙古自治区", "包头": "内蒙古自治区", "乌海": "内蒙古自治区", "赤峰": "内蒙古自治区", "通辽": "内蒙古自治区", "鄂尔多斯": "内蒙古自治区", "呼伦贝尔": "内蒙古自治区", "巴彦淖尔": "内蒙古自治区", "乌兰察布": "内蒙古自治区", "兴安": "内蒙古自治区", "锡林郭勒": "内蒙古自治区", "阿拉善": "内蒙古自治区",
  // 辽宁省
  "沈阳": "辽宁省", "大连": "辽宁省", "鞍山": "辽宁省", "抚顺": "辽宁省", "本溪": "辽宁省", "丹东": "辽宁省", "锦州": "辽宁省", "营口": "辽宁省", "阜新": "辽宁省", "辽阳": "辽宁省", "盘锦": "辽宁省", "铁岭": "辽宁省", "朝阳": "辽宁省", "葫芦岛": "辽宁省",
  // 吉林省
  "长春": "吉林省", "吉林": "吉林省", "四平": "吉林省", "辽源": "吉林省", "通化": "吉林省", "白山": "吉林省", "松原": "吉林省", "白城": "吉林省", "延边": "吉林省",
  // 黑龙江省
  "哈尔滨": "黑龙江省", "齐齐哈尔": "黑龙江省", "鸡西": "黑龙江省", "鹤岗": "黑龙江省", "双鸭山": "黑龙江省", "大庆": "黑龙江省", "伊春": "黑龙江省", "佳木斯": "黑龙江省", "七台河": "黑龙江省", "牡丹江": "黑龙江省", "黑河": "黑龙江省", "绥化": "黑龙江省", "大兴安岭": "黑龙江省",
  // 江苏省
  "南京": "江苏省", "无锡": "江苏省", "徐州": "江苏省", "常州": "江苏省", "苏州": "江苏省", "南通": "江苏省", "连云港": "江苏省", "淮安": "江苏省", "盐城": "江苏省", "扬州": "江苏省", "镇江": "江苏省", "泰州": "江苏省", "宿迁": "江苏省",
  // 浙江省
  "杭州": "浙江省", "宁波": "浙江省", "温州": "浙江省", "嘉兴": "浙江省", "湖州": "浙江省", "绍兴": "浙江省", "金华": "浙江省", "衢州": "浙江省", "舟山": "浙江省", "台州": "浙江省", "丽水": "浙江省",
  // 安徽省
  "合肥": "安徽省", "芜湖": "安徽省", "蚌埠": "安徽省", "淮南": "安徽省", "马鞍山": "安徽省", "淮北": "安徽省", "铜陵": "安徽省", "安庆": "安徽省", "黄山": "安徽省", "滁州": "安徽省", "阜阳": "安徽省", "宿州": "安徽省", "六安": "安徽省", "亳州": "安徽省", "池州": "安徽省", "宣城": "安徽省",
  // 福建省
  "福州": "福建省", "厦门": "福建省", "莆田": "福建省", "三明": "福建省", "泉州": "福建省", "漳州": "福建省", "南平": "福建省", "龙岩": "福建省", "宁德": "福建省",
  // 江西省
  "南昌": "江西省", "景德镇": "江西省", "萍乡": "江西省", "九江": "江西省", "新余": "江西省", "鹰潭": "江西省", "赣州": "江西省", "吉安": "江西省", "宜春": "江西省", "抚州": "江西省", "上饶": "江西省", "丰城": "江西省", "樟树": "江西省", "高安": "江西省", "瑞金": "江西省", "共青城": "江西省", "庐山": "江西省",
  // 山东省
  "济南": "山东省", "青岛": "山东省", "淄博": "山东省", "枣庄": "山东省", "东营": "山东省", "烟台": "山东省", "潍坊": "山东省", "济宁": "山东省", "泰安": "山东省", "威海": "山东省", "日照": "山东省", "临沂": "山东省", "德州": "山东省", "聊城": "山东省", "滨州": "山东省", "菏泽": "山东省",
  // 河南省
  "郑州": "河南省", "开封": "河南省", "洛阳": "河南省", "平顶山": "河南省", "安阳": "河南省", "鹤壁": "河南省", "新乡": "河南省", "焦作": "河南省", "濮阳": "河南省", "许昌": "河南省", "漯河": "河南省", "三门峡": "河南省", "南阳": "河南省", "商丘": "河南省", "信阳": "河南省", "周口": "河南省", "驻马店": "河南省", "济源": "河南省",
  // 湖北省
  "武汉": "湖北省", "黄石": "湖北省", "十堰": "湖北省", "宜昌": "湖北省", "襄阳": "湖北省", "鄂州": "湖北省", "荆门": "湖北省", "孝感": "湖北省", "荆州": "湖北省", "黄冈": "湖北省", "咸宁": "湖北省", "随州": "湖北省", "恩施": "湖北省", "仙桃": "湖北省", "潜江": "湖北省", "天门": "湖北省", "神农架": "湖北省",
  // 湖南省
  "长沙": "湖南省", "株洲": "湖南省", "湘潭": "湖南省", "衡阳": "湖南省", "邵阳": "湖南省", "岳阳": "湖南省", "常德": "湖南省", "张家界": "湖南省", "益阳": "湖南省", "郴州": "湖南省", "永州": "湖南省", "怀化": "湖南省", "娄底": "湖南省", "湘西": "湖南省",
  // 广东省
  "广州": "广东省", "韶关": "广东省", "深圳": "广东省", "珠海": "广东省", "汕头": "广东省", "佛山": "广东省", "江门": "广东省", "湛江": "广东省", "茂名": "广东省", "肇庆": "广东省", "惠州": "广东省", "梅州": "广东省", "汕尾": "广东省", "河源": "广东省", "阳江": "广东省", "清远": "广东省", "东莞": "广东省", "中山": "广东省", "潮州": "广东省", "揭阳": "广东省", "云浮": "广东省",
  // 广西壮族自治区
  "南宁": "广西壮族自治区", "柳州": "广西壮族自治区", "桂林": "广西壮族自治区", "梧州": "广西壮族自治区", "北海": "广西壮族自治区", "防城港": "广西壮族自治区", "钦州": "广西壮族自治区", "贵港": "广西壮族自治区", "玉林": "广西壮族自治区", "百色": "广西壮族自治区", "贺州": "广西壮族自治区", "河池": "广西壮族自治区", "来宾": "广西壮族自治区", "崇左": "广西壮族自治区",
  // 海南省
  "海口": "海南省", "三亚": "海南省", "三沙": "海南省", "儋州": "海南省", "五指山": "海南省", "琼海": "海南省", "文昌": "海南省", "万宁": "海南省", "东方": "海南省",
  // 四川省
  "成都": "四川省", "自贡": "四川省", "攀枝花": "四川省", "泸州": "四川省", "德阳": "四川省", "绵阳": "四川省", "广元": "四川省", "遂宁": "四川省", "内江": "四川省", "乐山": "四川省", "南充": "四川省", "眉山": "四川省", "宜宾": "四川省", "广安": "四川省", "达州": "四川省", "雅安": "四川省", "巴中": "四川省", "资阳": "四川省", "阿坝": "四川省", "甘孜": "四川省", "凉山": "四川省",
  // 贵州省
  "贵阳": "贵州省", "六盘水": "贵州省", "遵义": "贵州省", "安顺": "贵州省", "毕节": "贵州省", "铜仁": "贵州省", "黔西南": "贵州省", "黔东南": "贵州省", "黔南": "贵州省",
  // 云南省
  "昆明": "云南省", "曲靖": "云南省", "玉溪": "云南省", "保山": "云南省", "昭通": "云南省", "丽江": "云南省", "普洱": "云南省", "临沧": "云南省", "楚雄": "云南省", "红河": "云南省", "文山": "云南省", "西双版纳": "云南省", "大理": "云南省", "德宏": "云南省", "怒江": "云南省", "迪庆": "云南省",
  // 西藏自治区
  "拉萨": "西藏自治区", "日喀则": "西藏自治区", "昌都": "西藏自治区", "林芝": "西藏自治区", "山南": "西藏自治区", "那曲": "西藏自治区", "阿里": "西藏自治区",
  // 陕西省
  "西安": "陕西省", "铜川": "陕西省", "宝鸡": "陕西省", "咸阳": "陕西省", "渭南": "陕西省", "延安": "陕西省", "汉中": "陕西省", "榆林": "陕西省", "安康": "陕西省", "商洛": "陕西省",
  // 甘肃省
  "兰州": "甘肃省", "嘉峪关": "甘肃省", "金昌": "甘肃省", "白银": "甘肃省", "天水": "甘肃省", "武威": "甘肃省", "张掖": "甘肃省", "平凉": "甘肃省", "酒泉": "甘肃省", "庆阳": "甘肃省", "定西": "甘肃省", "陇南": "甘肃省", "临夏": "甘肃省", "甘南": "甘肃省",
  // 青海省
  "西宁": "青海省", "海东": "青海省", "海北": "青海省", "黄南": "青海省", "海南": "青海省", "果洛": "青海省", "玉树": "青海省", "海西": "青海省",
  // 宁夏回族自治区
  "银川": "宁夏回族自治区", "石嘴山": "宁夏回族自治区", "吴忠": "宁夏回族自治区", "固原": "宁夏回族自治区", "中卫": "宁夏回族自治区",
  // 新疆维吾尔自治区
  "乌鲁木齐": "新疆维吾尔自治区", "克拉玛依": "新疆维吾尔自治区", "吐鲁番": "新疆维吾尔自治区", "哈密": "新疆维吾尔自治区", "昌吉": "新疆维吾尔自治区", "博尔塔拉": "新疆维吾尔自治区", "巴音郭楞": "新疆维吾尔自治区", "阿克苏": "新疆维吾尔自治区", "克孜勒苏": "新疆维吾尔自治区", "喀什": "新疆维吾尔自治区", "和田": "新疆维吾尔自治区", "伊犁": "新疆维吾尔自治区", "塔城": "新疆维吾尔自治区", "阿勒泰": "新疆维吾尔自治区", "石河子": "新疆维吾尔自治区", "阿拉尔": "新疆维吾尔自治区", "图木舒克": "新疆维吾尔自治区", "五家渠": "新疆维吾尔自治区", "北屯": "新疆维吾尔自治区", "铁门关": "新疆维吾尔自治区", "双河": "新疆维吾尔自治区", "可克达拉": "新疆维吾尔自治区", "昆玉": "新疆维吾尔自治区", "胡杨河": "新疆维吾尔自治区", "新星": "新疆维吾尔自治区",
  // 香港特别行政区
  "香港": "香港特别行政区",
  // 澳门特别行政区
  "澳门": "澳门特别行政区",
  // 台湾省
  "台北": "台湾省", "新北": "台湾省", "桃园": "台湾省", "台中": "台湾省", "台南": "台湾省", "高雄": "台湾省", "基隆": "台湾省", "新竹": "台湾省", "嘉义": "台湾省",
};
// 标准化城市名称：去掉"市"、"区"、"县"等后缀，方便匹配
function normalizeCityName(city: string): string[] {
  const variants: string[] = [city];
  // 去掉常见后缀
  for (const suffix of ["市", "区", "县", "州", "地区"]) {
    if (city.endsWith(suffix) && city.length > suffix.length + 1) {
      variants.push(city.slice(0, -suffix.length));
    }
  }
  // 如果不带后缀，也尝试加上"市"
  if (!city.endsWith("市") && !city.endsWith("区") && !city.endsWith("县")) {
    variants.push(city + "市");
  }
  return Array.from(new Set(variants));
}
// 根据目的地城市自动匹配调度员
async function autoAssignDispatcher(destinationCity: string | null | undefined) {
  if (!destinationCity) return null;
  const db = await getDb();
  if (!db) return null;
  const cityVariants = normalizeCityName(destinationCity);
  // 1. 先精确匹配城市（dispatcher_regions.city字段），尝试所有变体
  for (const variant of cityVariants) {
    const regions = await db
      .select()
      .from(dispatcherRegions)
      .where(eq(dispatcherRegions.city, variant))
      .orderBy(asc(dispatcherRegions.priority))
      .limit(1);
    if (regions.length > 0) return regions[0];
  }
  // 2. 通过城市→省份映射，匹配province字段（尝试所有变体）
  let province: string | undefined;
  for (const variant of cityVariants) {
    province = CITY_TO_PROVINCE[variant];
    if (province) break;
  }
  if (province) {
    const regions = await db
      .select()
      .from(dispatcherRegions)
      .where(eq(dispatcherRegions.province, province))
      .orderBy(asc(dispatcherRegions.priority))
      .limit(1);
    if (regions.length > 0) return regions[0];
  }
  // 3. 全称匹配省份名（废弃字符串截取模糊匹配，避免误匹配）
  // 如果城市名本身就是省级名称（如"广东"、"浙江"），尝试直接匹配省份
  for (const variant of cityVariants) {
    // 尝试匹配省份全称（如"广东省"、"广东"）
    const provinceVariants = [variant, variant + "省", variant + "市", variant + "自治区"];
    for (const pv of provinceVariants) {
      const regions = await db
        .select()
        .from(dispatcherRegions)
        .where(eq(dispatcherRegions.province, pv))
        .orderBy(asc(dispatcherRegions.priority))
        .limit(1);
      if (regions.length > 0) return regions[0];
    }
  }
  return null;
}

const BUSINESS_TYPE_EDITABLE_STATUSES = [
  "pending_assign", "pending_price", "priced", "pending_dispatch",
  "pending_vehicle", "pending_inquiry", "on_hold",
];

const RECEIVING_EDITABLE_STATUSES = [
  "pending_assign", "pending_price", "priced", "pending_dispatch",
  "pending_vehicle", "pending_approval", "dispatched", "in_transit",
  "partial_delivered", "delivered", "on_hold",
];

const STRUCTURED_RECEIVING_FIELDS = [
  "receivingStatus",
  "expectedReceiveAt",
  "nextFollowUpAt",
  "receivingReason",
  "receivingNote",
] as const;

function isMergedChildOrder(order: { parentId?: number | null; mergedPlanNumber?: string | null; status?: string | null; isMerged?: boolean | null; subchainStage?: string | null; ltlSegmentMode?: string | null }) {
  // v22 fix: outsource sub-chains (ltl pickup/delivery) have parentId but are NOT merged children
  if (order.subchainStage || order.ltlSegmentMode) return false;
  return Boolean(order.parentId) || (Boolean(order.mergedPlanNumber) && order.status === "merged" && !order.isMerged);
}

const STATUS_STAGE: Record<string, number> = {
  pending_assign: 0, pending_price: 1, priced: 2,
  pending_vehicle: 3, pending_dispatch: 3, pending_inquiry: 3,
  pending_approval: 4, inquiry_confirmed: 4, shipped: 5,
  dispatched: 6, in_transit: 7, partial_delivered: 8, delivered: 8,
  signed: 9, settled: 10, cancelled: 10, merged: 10,
};

const STATUS_LABELS: Record<string, string> = {
  pending_assign: "待指派", pending_dispatch: "待调度", pending_price: "待定价",
  priced: "已定价", pending_vehicle: "待找车", pending_approval: "待审批",
  pending_inquiry: "待询价", inquiry_confirmed: "已询价", shipped: "已发运", dispatched: "已调度",
  in_transit: "运输中", partial_delivered: "部分送达", delivered: "已送达", signed: "已签收",
  settled: "已结算", on_hold: "等通知", cancelled: "已取消", merged: "已合并",
};

const TERMINAL_ORDER_STATUSES = new Set(["settled", "merged", "cancelled"]);
const ENTRY_QUEUE_REASON_LABELS: Record<string, string> = {
  new: "新建录单待分流",
  returned: "退回待处理",
  rerouted: "重新分流待处理",
};
const BUSINESS_TYPE_PENDING_ASSIGN_TARGET: Record<string, string> = {
  outsource: "pending_price",
  self: "pending_dispatch",
  ltl: "pending_inquiry",
};

const ROLLBACK_MAP: Record<string, string> = {
  pending_price: "pending_assign",
  priced: "pending_price",
  pending_vehicle: "pending_price",
  pending_approval: "pending_vehicle",
  dispatched: "pending_dispatch",
  pending_dispatch: "pending_assign",
  pending_inquiry: "pending_assign",
  inquiry_confirmed: "pending_inquiry",
  shipped: "inquiry_confirmed",
  in_transit: "dispatched",
  partial_delivered: "dispatched",
  delivered: "dispatched",
  signed: "delivered",
  on_hold: "pending_assign",
};

function isTerminalOrderStatus(status?: string | null) {
  return Boolean(status) && TERMINAL_ORDER_STATUSES.has(String(status));
}

function getPendingAssignTargetForBusinessType(businessType?: string | null) {
  return businessType ? BUSINESS_TYPE_PENDING_ASSIGN_TARGET[String(businessType)] ?? null : null;
}

function buildEntryQueueMetadata(params: {
  reason?: "new" | "returned" | "rerouted" | null;
  fromStatus?: string | null;
  returnedBy?: string | null;
  returnReason?: string | null;
  enteredAt?: Date | null;
}) {
  const reason = params.reason ?? null;
  return {
    entryQueueReason: reason,
    entryQueueSourceStatus: params.fromStatus ?? null,
    entryQueueEnteredAt: params.enteredAt ?? new Date(),
    entryQueueReturnedBy: reason === "returned" ? (params.returnedBy ?? null) : null,
    entryQueueReturnReason: reason === "returned" ? (params.returnReason ?? null) : null,
  };
}

function resetEntryQueueMetadata() {
  return {
    entryQueueReason: null,
    entryQueueSourceStatus: null,
    entryQueueEnteredAt: null,
    entryQueueReturnedBy: null,
    entryQueueReturnReason: null,
  };
}

function resolveEntryQueueReasonFromAction(action?: string | null) {
  return action === "rollback" || action === "revert" ? "returned" : "rerouted";
}

function getEntryQueueDisplayReason(order: {
  entryQueueReason?: string | null;
  lastReturnAt?: Date | string | null;
}) {
  if (order.entryQueueReason === "returned") return "returned" as const;
  if (order.entryQueueReason === "new" || order.entryQueueReason === "rerouted") return "pool" as const;
  return order.lastReturnAt ? "returned" as const : "pool" as const;
}

function assertPendingAssignRouteMatchesBusinessType(params: {
  currentStatus?: string | null;
  nextStatus?: string | null;
  businessType?: string | null;
}) {
  if (params.currentStatus !== "pending_assign") return;
  if (params.nextStatus === "on_hold" || params.nextStatus === "cancelled") return;
  const expectedTarget = getPendingAssignTargetForBusinessType(params.businessType);
  if (!expectedTarget) return;
  if (params.nextStatus !== expectedTarget) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `当前业务类型“${params.businessType || "未知"}”只能从待分流进入“${STATUS_LABELS[expectedTarget] || expectedTarget}”，不能进入“${STATUS_LABELS[String(params.nextStatus || "")] || params.nextStatus || "未知状态"}”。`,
    });
  }
}

function hasMeaningfulText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNonEmptyCollection(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : false;
}

function normalizeRequiredRemark(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label}不能为空`,
    });
  }
  return normalized;
}

function resolveOnHoldReleaseTargetStatus(order: any, requestedStatus: string) {
  if (String(order?.status || "") !== "on_hold") return requestedStatus;
  if (requestedStatus === "on_hold" || requestedStatus === "cancelled") return requestedStatus;

  const restoredStatus = String(order?.preHoldStatus || "").trim();
  if (!restoredStatus) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "当前等通知订单缺少搁置前状态，无法自动恢复。",
    });
  }
  return restoredStatus;
}

async function resolvePreHoldAssignee(db: any, preHoldAssignee: number | null | undefined) {
  const assigneeId = Number(preHoldAssignee);
  if (!Number.isInteger(assigneeId) || assigneeId <= 0) {
    return null;
  }

  const [assignee] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.id, assigneeId), eq(users.isActive, true))).limit(1);
  return assignee?.id ?? null;
}

function assertOnHoldRestorePrerequisites(order: any, targetStatus: string) {
  if (String(order?.status || "") !== "on_hold") return;

  if (targetStatus === "dispatched") {
    const hasDispatchSnapshot = hasMeaningfulText(order?.plateNumber)
      || hasMeaningfulText(order?.driverName)
      || Number.isInteger(Number(order?.driverId))
      || Number.isInteger(Number(order?.vehicleId));
    if (!hasDispatchSnapshot) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "等通知恢复到“已调度”前，必须存在可恢复的派车信息（车牌、司机或关联司机/车辆）。",
      });
    }
  }

  if (targetStatus === "signed") {
    const hasSignedEvidence = hasMeaningfulText(order?.signedBy)
      || hasMeaningfulText(order?.signedRemark)
      || hasNonEmptyCollection(order?.signedAttachments)
      || hasNonEmptyCollection(order?.evidenceUrls);
    if (!hasSignedEvidence) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "等通知恢复到“已签收”前，必须补充签收依据（签收人、签收说明或附件证据）。",
      });
    }
  }

  const ltlMiddleAndLateStatuses = new Set(["inquiry_confirmed", "shipped", "dispatched", "partial_delivered", "delivered", "signed"]);
  if (ltlMiddleAndLateStatuses.has(targetStatus) && String(order?.businessType || "") === "ltl") {
    const relatedParentIds = getRelatedParentIds(order);
    const subchainStage = resolveLtlSubchainStage(order);
    const hasStructuredRelation = !subchainStage || relatedParentIds.length > 0;
    if (!hasStructuredRelation) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "等通知恢复到零担中后段前，必须先补齐零担主单/子链结构关系。",
      });
    }
  }
}

const DELETE_ALLOWED_STATUSES = [
  "pending_assign", "pending_price", "priced", "pending_dispatch",
  "pending_vehicle", "pending_inquiry", "on_hold",
];

const LTL_BATCH_RELEASEABLE_STATUSES = new Set(["inquiry_confirmed", "shipped", "dispatched"]);

type OrderDeleteSnapshot = {
  id: number;
  orderNumber: string | null;
  status: string | null;
  parentId: number | null;
  isMerged: boolean | null;
  mergedPlanNumber: string | null;
};

type OrderDeleteRestrictions = {
  childParentIds: Set<number>;
  batchedOrderIds: Set<number>;
  lockedPodOrderIds: Set<number>;
};

const ORDER_CONCURRENT_CHANGE_MESSAGE = "订单已被其他人处理或状态已变化，请刷新后重试。";
const LTL_BATCH_CONCURRENT_CHANGE_MESSAGE = "零担批次已被其他人修改，请刷新后重试。";

function getMutationAffectedCount(result: any): number {
  if (typeof result === "number") return result;
  if (Array.isArray(result)) {
    for (const item of result) {
      const affected = getMutationAffectedCount(item);
      if (affected > 0) return affected;
    }
    return 0;
  }
  if (result && typeof result === "object") {
    const candidate = result.affectedRows ?? result.rowsAffected ?? result.rowCount ?? result.count;
    if (typeof candidate === "number") return candidate;
  }
  return 0;
}

function assertMutationApplied(result: any, message: string) {
  if (getMutationAffectedCount(result) < 1) {
    throw new TRPCError({ code: "CONFLICT", message });
  }
}

async function executeProtectedOrderDelete(db: any, orderId: number): Promise<OrderDeleteSnapshot> {
  const [order] = await db.select({
    id: orders.id,
    orderNumber: orders.orderNumber,
    status: orders.status,
    parentId: orders.parentId,
    isMerged: orders.isMerged,
    mergedPlanNumber: orders.mergedPlanNumber,
  }).from(orders).where(eq(orders.id, orderId)).limit(1) as OrderDeleteSnapshot[];

  if (!order) {
    throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
  }

  const restrictions = await loadOrderDeleteRestrictions(db, [orderId]);
  const blockedReason = getOrderDeleteBlockedReason(order, restrictions);
  if (blockedReason) {
    throw new TRPCError({ code: "BAD_REQUEST", message: blockedReason });
  }

  await deleteRelatedApprovalRecords(db, [orderId]);
  await deletePendingPodRecords(db, [orderId]);
  const deleteResult = await db.delete(orders).where(
    and(
      eq(orders.id, orderId),
      eq(orders.status, String(order.status || "") as any),
    ),
  );
  assertMutationApplied(deleteResult, ORDER_CONCURRENT_CHANGE_MESSAGE);
  return order;
}

function assertRollbackTarget(currentStatus?: string | null, targetStatus?: string | null) {
  const fromStatus = String(currentStatus || "");
  const toStatus = String(targetStatus || "");
  const fromStage = STATUS_STAGE[fromStatus] ?? -1;
  const toStage = STATUS_STAGE[toStatus] ?? -1;

  if (fromStage < 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `订单当前状态为"${STATUS_LABELS[fromStatus] || fromStatus || "未知状态"}"，不支持退回操作。`,
    });
  }

  if (toStage < 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `不支持退回到"${STATUS_LABELS[toStatus] || toStatus || "未知状态"}"。`,
    });
  }

  if (toStage >= fromStage) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `退回目标状态必须早于当前状态：${STATUS_LABELS[fromStatus] || fromStatus} → ${STATUS_LABELS[toStatus] || toStatus} 不成立。`,
    });
  }

  return { fromStage, toStage };
}

function buildRollbackCleanUpdate(targetStatus: string) {
  const toStage = STATUS_STAGE[targetStatus] ?? -1;
  if (toStage < 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `不支持退回到"${STATUS_LABELS[targetStatus] || targetStatus}"。`,
    });
  }

  const rollbackClean: Record<string, any> = { status: targetStatus as any };
  if (toStage < 6) { rollbackClean.dispatchDate = null; }
  if (toStage < 7) { rollbackClean.transitDate = null; rollbackClean.loadingDate = null; }
  if (toStage < 8) {
    rollbackClean.deliveryDate = null;
    rollbackClean.deliveredQty = null;
    rollbackClean.remainingQty = null;
  }
  if (toStage < 9) {
    rollbackClean.signedDate = null;
    rollbackClean.signedBy = null;
    rollbackClean.signedAttachments = null;
    rollbackClean.signedRemark = null;
    rollbackClean.signExceptionType = null;
    rollbackClean.exceptionQty = null;
    rollbackClean.damageDesc = null;
    rollbackClean.rejectReason = null;
    rollbackClean.evidenceUrls = null;
    rollbackClean.podDate = null;
    rollbackClean.podSentDate = null;
  }
  if (toStage <= 3) {
    rollbackClean.plateNumber = null;
    rollbackClean.driverName = null;
    rollbackClean.driverPhone = null;
    rollbackClean.driverId = null;
    rollbackClean.vehicleId = null;
    rollbackClean.depositAmount = null;
    rollbackClean.depositStatus = "none";
    rollbackClean.depositRefundable = true;
  }
  if (toStage <= 1) {
    rollbackClean.actualFreight = null;
    rollbackClean.totalCost = null;
  }
  return rollbackClean;
}

async function deletePendingPodRecords(db: any, orderIds: number[]) {
  const uniqueIds = Array.from(new Set(orderIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (uniqueIds.length === 0) return;
  await db.delete(podRecords).where(
    and(
      inArray(podRecords.orderId, uniqueIds),
      eq(podRecords.originalStatus, "pending"),
    ),
  );
}

function formatGroupDistinctLabel(values: Array<string | null | undefined>, unitLabel: string) {
  const normalized = Array.from(new Set(
    values
      .map((value) => typeof value === "string" ? value.trim() : "")
      .filter(Boolean),
  ));

  if (normalized.length === 0) {
    return "未知";
  }
  if (normalized.length === 1) {
    return normalized[0];
  }
  return `${normalized.join(" / ")}（${normalized.length}${unitLabel}）`;
}

async function deleteRelatedApprovalRecords(db: any, orderIds: number[]) {
  const uniqueIds = Array.from(new Set(orderIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (uniqueIds.length === 0) return;
  await db.delete(approvals).where(inArray(approvals.orderId, uniqueIds));
}

async function loadOrderDeleteRestrictions(db: any, orderIds: number[]): Promise<OrderDeleteRestrictions> {
  const uniqueIds = Array.from(new Set(orderIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (uniqueIds.length === 0) {
    return {
      childParentIds: new Set<number>(),
      batchedOrderIds: new Set<number>(),
      lockedPodOrderIds: new Set<number>(),
    };
  }

  const [childRows, batchRows, podRows] = await Promise.all([
    db.select({ parentId: orders.parentId }).from(orders).where(inArray(orders.parentId, uniqueIds)),
    db.select({ orderId: ltlDispatchBatchOrders.orderId }).from(ltlDispatchBatchOrders).where(inArray(ltlDispatchBatchOrders.orderId, uniqueIds)),
    db.select({ orderId: podRecords.orderId }).from(podRecords).where(
      and(
        inArray(podRecords.orderId, uniqueIds),
        ne(podRecords.originalStatus, "pending"),
      ),
    ),
  ]);

  return {
    childParentIds: new Set(
      childRows
        .map((row: any) => Number(row.parentId))
        .filter((value: number) => Number.isInteger(value) && value > 0),
    ),
    batchedOrderIds: new Set(
      batchRows
        .map((row: any) => Number(row.orderId))
        .filter((value: number) => Number.isInteger(value) && value > 0),
    ),
    lockedPodOrderIds: new Set(
      podRows
        .map((row: any) => Number(row.orderId))
        .filter((value: number) => Number.isInteger(value) && value > 0),
    ),
  };
}

function getOrderDeleteBlockedReason(order: OrderDeleteSnapshot, restrictions: OrderDeleteRestrictions) {
  if (restrictions.childParentIds.has(order.id) || order.isMerged) {
    return "当前订单下仍存在合并子单，请先处理整组关系后再删除。";
  }
  if (isMergedChildOrder(order)) {
    return "合并子订单不允许单独删除，请在主单统一处理。";
  }
  if (restrictions.batchedOrderIds.has(order.id)) {
    return "订单已加入零担派车批次，请先从批次中移除后再删除。";
  }
  if (restrictions.lockedPodOrderIds.has(order.id)) {
    return "订单已产生回单流转记录，不能直接删除，请先退回并清理相关流程。";
  }
  if (!DELETE_ALLOWED_STATUSES.includes(String(order.status || ""))) {
    return `订单当前状态为"${STATUS_LABELS[String(order.status || "")] || order.status || "未知状态"}"，不允许直接删除。`;
  }
  return null;
}

async function releaseOrdersFromLtlBatch(db: any, orderIds: number[]) {
  const uniqueIds = Array.from(new Set(orderIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (uniqueIds.length === 0) {
    return { ordersToRelease: [] as Array<{ id: number; orderNumber: string | null; status: string | null }> };
  }

  const ordersToRelease = await db.select({
    id: orders.id,
    orderNumber: orders.orderNumber,
    status: orders.status,
  }).from(orders).where(inArray(orders.id, uniqueIds));

  if (ordersToRelease.length !== uniqueIds.length) {
    throw new TRPCError({ code: "NOT_FOUND", message: "批次中存在不存在的订单，请刷新后重试。" });
  }

  const invalidOrders = ordersToRelease.filter((item: any) => !LTL_BATCH_RELEASEABLE_STATUSES.has(String(item.status || "")));
  if (invalidOrders.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `订单 ${invalidOrders.map((item: any) => item.orderNumber || `#${item.id}`).join("、")} 已进入后续流程，不能再从零担批次中删除或移除。`,
    });
  }

  const lockedPodRows = await db.select({
    orderId: podRecords.orderId,
  }).from(podRecords).where(
    and(
      inArray(podRecords.orderId, uniqueIds),
      ne(podRecords.originalStatus, "pending"),
    ),
  );

  if (lockedPodRows.length > 0) {
    const lockedIds = new Set(lockedPodRows.map((row: any) => Number(row.orderId)));
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `订单 ${ordersToRelease.filter((item: any) => lockedIds.has(item.id)).map((item: any) => item.orderNumber || `#${item.id}`).join("、")} 已产生回单流转记录，不能直接移出批次。`,
    });
  }

  await deletePendingPodRecords(db, uniqueIds);

  for (const order of ordersToRelease) {
    const currentStatus = String(order.status || "");
    const updateResult = await db.update(orders).set({
      ...buildRollbackCleanUpdate("inquiry_confirmed"),
      plateNumber: null,
      driverName: null,
      driverPhone: null,
      driverId: null,
      vehicleId: null,
    }).where(
      and(
        eq(orders.id, order.id),
        eq(orders.status, currentStatus as any),
      ),
    );
    assertMutationApplied(updateResult, ORDER_CONCURRENT_CHANGE_MESSAGE);
  }

  return { ordersToRelease };
}

async function releaseOrdersFromActiveLtlBatches(db: any, orderIds: number[]) {
  const uniqueIds = Array.from(new Set(orderIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (uniqueIds.length === 0) {
    return { affectedBatchIds: [] as number[], deletedBatchIds: [] as number[] };
  }

  const batchRows = await db.select({
    batchId: ltlDispatchBatchOrders.batchId,
    orderId: ltlDispatchBatchOrders.orderId,
  }).from(ltlDispatchBatchOrders).where(inArray(ltlDispatchBatchOrders.orderId, uniqueIds));

  if (batchRows.length === 0) {
    return { affectedBatchIds: [] as number[], deletedBatchIds: [] as number[] };
  }

  const affectedBatchIds: number[] = Array.from(new Set(
    batchRows
      .map((row: any) => Number(row.batchId))
      .filter((value: number) => Number.isInteger(value) && value > 0),
  ));

  await deletePendingPodRecords(db, uniqueIds);
  await db.delete(ltlDispatchBatchOrders).where(inArray(ltlDispatchBatchOrders.orderId, uniqueIds));

  if (affectedBatchIds.length === 0) {
    return { affectedBatchIds, deletedBatchIds: [] as number[] };
  }

  const remainingRows = await db.select({
    batchId: ltlDispatchBatchOrders.batchId,
  }).from(ltlDispatchBatchOrders).where(inArray(ltlDispatchBatchOrders.batchId, affectedBatchIds));

  const nonEmptyBatchIds = new Set<number>(
    remainingRows
      .map((row: any) => Number(row.batchId))
      .filter((value: number) => Number.isInteger(value) && value > 0),
  );
  const deletedBatchIds: number[] = affectedBatchIds.filter((batchId) => !nonEmptyBatchIds.has(batchId));

  if (deletedBatchIds.length > 0) {
    await db.delete(ltlDispatchBatches).where(inArray(ltlDispatchBatches.id, deletedBatchIds));
  }

  return { affectedBatchIds, deletedBatchIds };
}

const SUBCHAIN_PARENT_IDS_MARKER = "【关联主单IDs】";

function normalizeParentIds(parentId?: number | null, parentIds?: Array<number | null | undefined>) {
  return Array.from(
    new Set(
      [parentId, ...(parentIds ?? [])]
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
}

function parseRelatedParentIdsFromRemarks(remarks?: string | null) {
  const text = String(remarks || "");
  const match = text.match(/【关联主单IDs】,?([\d,]+),?/);
  if (!match?.[1]) return [] as number[];
  return Array.from(
    new Set(
      match[1]
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );
}

function normalizeStructuredParentIds(value: unknown) {
  if (!Array.isArray(value)) return [] as number[];
  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );
}

function getRelatedParentIds(order: {
  parentId?: number | null;
  relatedParentIds?: unknown;
  remarks?: string | null;
}) {
  return normalizeParentIds(
    order.parentId,
    normalizeStructuredParentIds(order.relatedParentIds).length > 0
      ? normalizeStructuredParentIds(order.relatedParentIds)
      : parseRelatedParentIdsFromRemarks(order.remarks),
  );
}

function attachRelatedParentIdsToRemarks(remarks: string | null | undefined, parentIds: number[]) {
  const cleaned = String(remarks || "")
    .replace(/\s*【关联主单IDs】,?[\d,]+,?\s*/g, "\n")
    .trim();
  if (parentIds.length === 0) {
    return cleaned || null;
  }
  const relationLine = `${SUBCHAIN_PARENT_IDS_MARKER},${parentIds.join(",")},`;
  return cleaned ? `${cleaned}\n${relationLine}` : relationLine;
}

const LTL_SUBCHAIN_RELEASED_STATUSES = new Set(["pending_assign", "cancelled"]);
const LTL_PICKUP_SUBCHAIN_TAG = "【零担前段外请子链】";
const LTL_DELIVERY_SUBCHAIN_TAG = "【零担后段外请子链】";
const LTL_CUSTOMER_PICKUP_TAG = "【零担后段客户自提】";
const LTL_CUSTOMER_SELF_DELIVER_TAG = "【零担前段客户自送到站】";
const POD_RESPONSIBLE_STATUSES = new Set(["dispatched", "in_transit", "delivered", "signed", "settled"]);

type PodOwnershipModeValue = "current_order" | "delivery_outsource" | "none";
type LtlFrontSegmentModeValue = "self_transport" | "pickup_outsource" | "customer_self_deliver" | "unknown";
type LtlBackSegmentModeValue = "station_delivery" | "delivery_outsource" | "customer_pickup" | "unknown";

type LtlStructuredOrderLike = {
  remarks?: string | null;
  subchainStage?: string | null;
  ltlSegmentMode?: string | null;
  parentId?: number | null;
  relatedParentIds?: unknown;
};

function isActiveLtlSubchainStatus(status?: string | null) {
  return Boolean(status) && !LTL_SUBCHAIN_RELEASED_STATUSES.has(String(status));
}

function resolveLtlSubchainStage(source?: string | null | LtlStructuredOrderLike) {
  const structuredStage = typeof source === "object" && source ? source.subchainStage : null;
  if (structuredStage === "pickup" || structuredStage === "delivery") {
    return structuredStage;
  }
  const remarks = typeof source === "object" && source ? source.remarks : source;
  const text = String(remarks || "");
  if (text.includes(LTL_PICKUP_SUBCHAIN_TAG)) return "pickup" as const;
  if (text.includes(LTL_DELIVERY_SUBCHAIN_TAG)) return "delivery" as const;
  return null;
}

function hasLtlRemarkTag(remarks: string | null | undefined, tag: string) {
  return String(remarks || "").includes(tag);
}

function hasLtlCustomerPickupTag(remarks?: string | null) {
  return hasLtlRemarkTag(remarks, LTL_CUSTOMER_PICKUP_TAG);
}

function hasLtlCustomerSelfDeliverTag(remarks?: string | null) {
  return hasLtlRemarkTag(remarks, LTL_CUSTOMER_SELF_DELIVER_TAG);
}

function removeLtlRemarkTag(remarks: string | null | undefined, tag: string) {
  const lines = String(remarks || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0 && !line.includes(tag));
  return lines.join("\n").trim() || null;
}

function applyLtlRemarkTag(options: {
  remarks?: string | null;
  tag: string;
  enabled: boolean;
  operatorName?: string | null;
}) {
  const base = removeLtlRemarkTag(options.remarks, options.tag);
  if (!options.enabled) {
    return base;
  }
  const operatorPart = options.operatorName ? ` 操作人：${options.operatorName}` : "";
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  return [base, `${options.tag}${operatorPart} 时间：${timestamp}`].filter(Boolean).join("\n").trim() || null;
}

function resolveLtlSegmentMode(order: {
  businessType?: string | null;
  remarks?: string | null;
  subchainStage?: string | null;
  ltlSegmentMode?: string | null;
}) {
  if (order.ltlSegmentMode) return String(order.ltlSegmentMode);
  const stage = resolveLtlSubchainStage(order);
  if (order.businessType === "outsource" && stage === "pickup") return "pickup_outsource";
  if (order.businessType === "outsource" && stage === "delivery") return "delivery_outsource";
  if (hasLtlCustomerSelfDeliverTag(order.remarks)) return "customer_self_deliver";
  if (hasLtlCustomerPickupTag(order.remarks)) return "customer_pickup";
  if (order.businessType === "ltl") return "station_delivery";
  if (order.businessType === "self") return "self_transport";
  return null;
}

function isMergedLtlPickupOutsourceOrder(params: {
  businessType?: string | null;
  remarks?: string | null;
  subchainStage?: string | null;
  ltlSegmentMode?: string | null;
  parentId?: number | null;
  relatedParentIds?: unknown;
}) {
  if (params.businessType !== "outsource") return false;
  if (resolveLtlSubchainStage(params) !== "pickup") return false;
  const relatedParentIds = getRelatedParentIds(params);
  return relatedParentIds.length > 1;
}

function shouldRouteMergedLtlPickupToApproval(params: {
  currentStatus?: string | null;
  requestedStatus?: string | null;
  businessType?: string | null;
  remarks?: string | null;
  subchainStage?: string | null;
  ltlSegmentMode?: string | null;
  parentId?: number | null;
  relatedParentIds?: unknown;
}) {
  return params.currentStatus === "pending_vehicle"
    && params.requestedStatus === "dispatched"
    && isMergedLtlPickupOutsourceOrder(params);
}

function resolveRequestedDispatchStatus(params: {
  currentStatus?: string | null;
  requestedStatus?: string | null;
  businessType?: string | null;
  remarks?: string | null;
  subchainStage?: string | null;
  ltlSegmentMode?: string | null;
  parentId?: number | null;
  relatedParentIds?: unknown;
}) {
  return shouldRouteMergedLtlPickupToApproval(params) ? "pending_approval" : params.requestedStatus;
}

function resolvePodOwnership(params: {
  businessType?: string | null;
  remarks?: string | null;
  subchainStage?: "pickup" | "delivery" | string | null;
  ltlSegmentMode?: string | null;
}): PodOwnershipModeValue {
  const stage = params.subchainStage ?? resolveLtlSubchainStage(params);
  const segmentMode = params.ltlSegmentMode ?? resolveLtlSegmentMode(params);
  if (params.businessType === "outsource" && stage === "pickup") {
    return "none";
  }
  if (segmentMode === "customer_pickup" || hasLtlCustomerPickupTag(params.remarks)) {
    return "none";
  }
  return "current_order";
}

function isSelfBusinessType(businessType?: string | null) {
  return businessType === "self";
}

function buildSelfTransportDepositReset() {
  return {
    depositAmount: null,
    depositRefundable: true,
    depositStatus: "none" as const,
    depositRefundDate: null,
  };
}

async function ensurePendingPodRecordForOrder(
  db: any,
  order: {
    id: number;
    podOwnership?: string | null;
    depositAmount?: string | null;
    businessType?: string | null;
  },
  depositAmount?: string | null,
) {
  if (order.podOwnership !== "current_order") {
    return false;
  }

  const safeDepositAmount = isSelfBusinessType(order.businessType)
    ? null
    : (depositAmount ?? order.depositAmount ?? null);

  const existingPod = await db.select({
    id: podRecords.id,
    podOwnership: podRecords.podOwnership,
  }).from(podRecords).where(eq(podRecords.orderId, order.id)).limit(1);

  if (existingPod.length === 0) {
    await db.insert(podRecords).values({
      orderId: order.id,
      podOwnership: "current_order",
      originalStatus: "pending",
      depositAmount: safeDepositAmount,
    });
    return true;
  }

  if (existingPod[0].podOwnership !== "current_order") {
    await db.update(podRecords).set({
      podOwnership: "current_order",
    }).where(eq(podRecords.id, existingPod[0].id));
  }
  return false;
}

async function clearPodArtifactsForOrder(db: any, orderId: number) {
  await db.delete(podRecords).where(eq(podRecords.orderId, orderId));
  await db.update(orders).set({
    podStatus: "none" as any,
    podSentDate: null,
    podDate: null,
  }).where(eq(orders.id, orderId));
}

async function getActiveLtlSubchainParentIdSet(db: any, parentIds: number[], stage: "pickup" | "delivery") {
  if (parentIds.length === 0) return new Set<number>();
  const subchainTag = stage === "pickup" ? LTL_PICKUP_SUBCHAIN_TAG : LTL_DELIVERY_SUBCHAIN_TAG;
  const candidates = await db.select({
    id: orders.id,
    parentId: orders.parentId,
    remarks: orders.remarks,
    status: orders.status,
  }).from(orders).where(
    and(
      eq(orders.businessType, "outsource"),
      or(
        inArray(orders.parentId, parentIds),
        like(orders.remarks, `%${SUBCHAIN_PARENT_IDS_MARKER}%`),
      ),
    ),
  );

  const matchedParentIds = new Set<number>();
  for (const candidate of candidates) {
    if (!isActiveLtlSubchainStatus(candidate.status)) continue;
    if (resolveLtlSubchainStage(candidate) !== stage) continue;
    for (const parentId of getRelatedParentIds(candidate)) {
      if (parentIds.includes(parentId)) {
        matchedParentIds.add(parentId);
      }
    }
  }
  return matchedParentIds;
}

async function resolveLtlSegmentModes(db: any, order: {
  id: number;
  remarks?: string | null;
  relatedParentIds?: unknown;
  dispatchDate?: Date | null;
  plateNumber?: string | null;
  driverName?: string | null;
  status?: string | null;
  receivingConfirmedAt?: Date | null;
  ltlFinalStation?: string | null;
}) {
  const parentIds = getRelatedParentIds({
    parentId: order.id,
    relatedParentIds: order.relatedParentIds,
    remarks: order.remarks,
  });
  const pickupParentIds = await getActiveLtlSubchainParentIdSet(db, parentIds, "pickup");
  const deliveryParentIds = await getActiveLtlSubchainParentIdSet(db, parentIds, "delivery");
  const hasPickupDispatch = Boolean(order.dispatchDate || order.plateNumber || order.driverName);
  const frontMode: LtlFrontSegmentModeValue = pickupParentIds.has(order.id)
    ? "pickup_outsource"
    : hasLtlCustomerSelfDeliverTag(order.remarks)
      ? "customer_self_deliver"
      : hasPickupDispatch
        ? "self_transport"
        : "unknown";
  const backMode: LtlBackSegmentModeValue = hasLtlCustomerPickupTag(order.remarks)
    ? "customer_pickup"
    : deliveryParentIds.has(order.id)
      ? "delivery_outsource"
      : (order.receivingConfirmedAt || order.ltlFinalStation || POD_RESPONSIBLE_STATUSES.has(String(order.status || "")))
        ? "station_delivery"
        : "unknown";
  return { frontMode, backMode };
}

async function refreshRelatedParentPodOwnership(db: any, parentIds: number[]) {
  const uniqueParentIds = Array.from(new Set(parentIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (uniqueParentIds.length === 0) return;

  const deliveryParentIdSet = await getActiveLtlSubchainParentIdSet(db, uniqueParentIds, "delivery");
  const parentOrders = await db.select({
    id: orders.id,
    status: orders.status,
    podOwnership: orders.podOwnership,
    depositAmount: orders.depositAmount,
    businessType: orders.businessType,
    remarks: orders.remarks,
  }).from(orders).where(inArray(orders.id, uniqueParentIds));

  if (parentOrders.length === 0) return;

  const existingPods = await db.select({
    id: podRecords.id,
    orderId: podRecords.orderId,
    originalStatus: podRecords.originalStatus,
  }).from(podRecords).where(inArray(podRecords.orderId, uniqueParentIds));

  const podMap = new Map<number, Array<{ id: number; orderId: number; originalStatus: string | null }>>();
  for (const pod of existingPods) {
    const bucket = podMap.get(pod.orderId) || [];
    bucket.push(pod);
    podMap.set(pod.orderId, bucket);
  }

  const orderIdsToCurrent: number[] = [];
  const orderIdsToDeliveryOutsource: number[] = [];
  const orderIdsToNone: number[] = [];
  const podIdsToCurrent: number[] = [];
  const podIdsToDeliveryOutsource: number[] = [];
  const podIdsToDelete: number[] = [];

  for (const parentOrder of parentOrders) {
    const nextOwnership: PodOwnershipModeValue = hasLtlCustomerPickupTag(parentOrder.remarks)
      ? "none"
      : deliveryParentIdSet.has(parentOrder.id)
        ? "delivery_outsource"
        : "current_order";

    if (parentOrder.podOwnership !== nextOwnership) {
      if (nextOwnership === "current_order") orderIdsToCurrent.push(parentOrder.id);
      if (nextOwnership === "delivery_outsource") orderIdsToDeliveryOutsource.push(parentOrder.id);
      if (nextOwnership === "none") orderIdsToNone.push(parentOrder.id);
    }

    const relatedPods = podMap.get(parentOrder.id) || [];
    if (nextOwnership === "current_order") {
      podIdsToCurrent.push(...relatedPods.map((item) => item.id));
      continue;
    }
    if (nextOwnership === "delivery_outsource") {
      podIdsToDeliveryOutsource.push(...relatedPods.filter((item) => item.originalStatus !== "pending").map((item) => item.id));
      podIdsToDelete.push(...relatedPods.filter((item) => item.originalStatus === "pending").map((item) => item.id));
      continue;
    }
    podIdsToDelete.push(...relatedPods.map((item) => item.id));
  }

  if (orderIdsToCurrent.length > 0) {
    await db.update(orders).set({ podOwnership: "current_order" }).where(inArray(orders.id, orderIdsToCurrent));
  }
  if (orderIdsToDeliveryOutsource.length > 0) {
    await db.update(orders).set({ podOwnership: "delivery_outsource" }).where(inArray(orders.id, orderIdsToDeliveryOutsource));
  }
  if (orderIdsToNone.length > 0) {
    await db.update(orders).set({
      podOwnership: "none",
      podStatus: "none" as any,
      podSentDate: null,
      podDate: null,
    }).where(inArray(orders.id, orderIdsToNone));
  }
  if (podIdsToCurrent.length > 0) {
    await db.update(podRecords).set({ podOwnership: "current_order" }).where(inArray(podRecords.id, Array.from(new Set(podIdsToCurrent))));
  }
  if (podIdsToDeliveryOutsource.length > 0) {
    await db.update(podRecords).set({ podOwnership: "delivery_outsource" }).where(inArray(podRecords.id, Array.from(new Set(podIdsToDeliveryOutsource))));
  }
  if (podIdsToDelete.length > 0) {
    await db.delete(podRecords).where(inArray(podRecords.id, Array.from(new Set(podIdsToDelete))));
  }

  for (const parentOrder of parentOrders) {
    if (hasLtlCustomerPickupTag(parentOrder.remarks)) {
      await clearPodArtifactsForOrder(db, parentOrder.id);
      continue;
    }
    if (!POD_RESPONSIBLE_STATUSES.has(String(parentOrder.status || ""))) continue;
    await ensurePendingPodRecordForOrder(db, {
      ...parentOrder,
      podOwnership: deliveryParentIdSet.has(parentOrder.id) ? "delivery_outsource" : "current_order",
    }, parentOrder.depositAmount ?? null);
  }
}

async function findExistingLtlSubchain(db: any, parentIds: number[], stage: "pickup" | "delivery") {
  if (parentIds.length === 0) return null;
  const subchainTag = stage === "pickup" ? LTL_PICKUP_SUBCHAIN_TAG : LTL_DELIVERY_SUBCHAIN_TAG;
  const candidates = await db.select({
    id: orders.id,
    parentId: orders.parentId,
    status: orders.status,
    remarks: orders.remarks,
    orderNumber: orders.orderNumber,
  }).from(orders).where(
    and(
      eq(orders.businessType, "outsource"),
      or(
        inArray(orders.parentId, parentIds),
        like(orders.remarks, `%${SUBCHAIN_PARENT_IDS_MARKER}%`),
      ),
    ),
  );

  return candidates.find((item: any) => {
    if (!isActiveLtlSubchainStatus(item.status) || !String(item.remarks || "").includes(subchainTag)) {
      return false;
    }
    const relatedParentIds = normalizeParentIds(item.parentId, parseRelatedParentIdsFromRemarks(item.remarks));
    return relatedParentIds.some((id) => parentIds.includes(id));
  }) ?? null;
}

async function resolveDispatcherAssignmentScope(db: any, baseOrderIds: number[]) {
  const normalizedOrderIds = Array.from(
    new Set(
      baseOrderIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  );
  if (normalizedOrderIds.length === 0) {
    return { orderIds: [] as number[], autoFollowOrderIds: [] as number[] };
  }

  const candidates = await db.select({
    id: orders.id,
    parentId: orders.parentId,
    remarks: orders.remarks,
    status: orders.status,
    businessType: orders.businessType,
  }).from(orders).where(
    and(
      eq(orders.businessType, "outsource"),
      or(
        inArray(orders.parentId, normalizedOrderIds),
        like(orders.remarks, `%${SUBCHAIN_PARENT_IDS_MARKER}%`),
      ),
    ),
  );

  return expandDispatcherAssignmentOrderIds(normalizedOrderIds, candidates as Array<{
    id: number;
    parentId?: number | null;
    remarks?: string | null;
    status?: string | null;
    businessType?: string | null;
  }>);
}

function parseOptionalDateInput(value: string | undefined, label: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${label}格式不正确` });
  }
  return parsed;
}

function hasStructuredReceivingChanges(updateData: Record<string, any>) {
  return STRUCTURED_RECEIVING_FIELDS.some((field) => updateData[field] !== undefined);
}

type DepositScopeOrder = {
  id: number;
  parentId: number | null;
  isMerged: boolean | null;
  mergedPlanNumber: string | null;
  depositStatus: string | null;
  depositAmount: string | null;
};

async function expandDepositScopeOrders(db: any, seedOrders: DepositScopeOrder[]) {
  const scopedOrders = new Map<number, DepositScopeOrder>();

  for (const seed of seedOrders) {
    let relatedOrders: DepositScopeOrder[] = [seed];

    if (seed.isMerged) {
      relatedOrders = await db.select({
        id: orders.id,
        parentId: orders.parentId,
        isMerged: orders.isMerged,
        mergedPlanNumber: orders.mergedPlanNumber,
        depositStatus: orders.depositStatus,
        depositAmount: orders.depositAmount,
      }).from(orders).where(or(eq(orders.id, seed.id), eq(orders.parentId, seed.id))) as DepositScopeOrder[];
    } else if (seed.parentId) {
      relatedOrders = await db.select({
        id: orders.id,
        parentId: orders.parentId,
        isMerged: orders.isMerged,
        mergedPlanNumber: orders.mergedPlanNumber,
        depositStatus: orders.depositStatus,
        depositAmount: orders.depositAmount,
      }).from(orders).where(or(eq(orders.id, seed.parentId), eq(orders.parentId, seed.parentId))) as DepositScopeOrder[];
    } else if (seed.mergedPlanNumber) {
      relatedOrders = await db.select({
        id: orders.id,
        parentId: orders.parentId,
        isMerged: orders.isMerged,
        mergedPlanNumber: orders.mergedPlanNumber,
        depositStatus: orders.depositStatus,
        depositAmount: orders.depositAmount,
      }).from(orders).where(eq(orders.mergedPlanNumber, seed.mergedPlanNumber)) as DepositScopeOrder[];
    }

    for (const order of relatedOrders) {
      scopedOrders.set(order.id, order);
    }
  }

  return Array.from(scopedOrders.values());
}

async function validateRefundableDepositScope(db: any, seedOrders: DepositScopeOrder[]) {
  const scopeOrders = await expandDepositScopeOrders(db, seedOrders);
  const refundableOrders = scopeOrders.filter((order) => (
    order.depositStatus === "paid"
    && order.depositAmount !== null
    && safeParseFloat(order.depositAmount) > 0
  ));

  if (refundableOrders.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "无可退押金订单" });
  }

  const orderIds = scopeOrders.map((order) => order.id);
  const podRows = await db.select({
    orderId: podRecords.orderId,
    originalStatus: podRecords.originalStatus,
  }).from(podRecords).where(inArray(podRecords.orderId, orderIds));

  for (const order of scopeOrders) {
    const pod = podRows.find((item: { orderId: number; originalStatus: string | null }) => item.orderId === order.id);
    if (!pod || pod.originalStatus !== "received") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `该车次仍有订单#${order.id}尚未完成财务原件确认，不可退押金。`,
      });
    }
  }

  return { scopeOrders, refundableOrders };
}

export const orderRouter = router({
  // 创建订单
  create: permissionProcedure("order.create").input(
    z.object({
      orderNumber: z.string().min(1, "客户订单号不能为空").max(100, "客户订单号不能超过100个字符"),
      mergedPlanNumber: z.string().optional(),
      businessType: z.enum(["outsource", "self", "ltl"]),
      department: z.string().optional(),
      isUrgent: z.boolean().default(false),
      urgentReason: z.string().optional(),
      customerId: z.number().optional(),
      customerName: z.string().max(200, "客户名称不能超过200个字符").optional(),
      customerPhone: z.string().optional(),
      settlementType: z.enum(["monthly", "cash", "collect"]).optional(),
      cargoName: z.string().optional(),
      weight: optionalWeight(),
      packagingType: z.enum(["pallet", "loose", "pallet_loaded"]).optional(),
      cargoSpec: z.string().optional(),
      specialRequirements: z.string().optional(),
      warehouseId: z.number().optional(),
      warehouseName: z.string().optional(),
      originCity: z.string().optional(),
      deliveryAddress: z.string().optional(),
      destinationCity: z.string().optional(),
      receiverName: z.string().optional(),
      receiverPhone: z.string().optional(),
      customerPrice: optionalDecimal(),
      quotedPrice: optionalDecimal(),
      shippingNote: z.string().optional(),
      remarks: z.string().optional(),
      orderDate: z.string().optional(),
      chargeableWeight: optionalWeight(),
      packageCount: z.number().optional(),
      isLargeSlab: z.boolean().optional(),
      parentId: z.number().optional(),
      parentIds: z.array(z.number()).optional(),
      subchainStage: z.enum(["pickup", "delivery"]).optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const systemCode = await generateSystemCode();
    // 新建订单统一先进入待指派，由录单台再分流到外请、自运、零担后续工位
    let assignedDispatcherId: number | null = null;
    let autoAssignedRegion: string | null = null;
    const initialStatus: string = "pending_assign";
    // 瓷砖大板自动标注：货物名称含"瓷砖"且规格含1800*900及以上尺寸
    // 也支持前端传入的isLargeSlab标记（强制确认弹窗）
    let isLargeSlab = input.isLargeSlab || false;
    if (!isLargeSlab && input.cargoName) {
      const textToCheck = `${input.cargoName} ${input.cargoSpec || ''} ${input.remarks || ''}`;
      const isTile = /瓷砖|大板|石材|岩板|铁架|铁托/.test(textToCheck);
      if (isTile) {
        // 检查规格
        const sizeMatches = Array.from(textToCheck.matchAll(/(\d+)\s*[*×xX]\s*(\d+)/g));
        for (const match of sizeMatches) {
          const w = parseInt(match[1]);
          const h = parseInt(match[2]);
          if ((w >= 1800 && h >= 900) || (h >= 1800 && w >= 900)) {
            isLargeSlab = true;
            break;
          }
        }
      }
    }
    const normalizedOrderWeight = input.businessType === "ltl"
      ? normalizeLtlWeightField(input.weight)
      : input.weight;
    const normalizedChargeableWeight = input.businessType === "ltl"
      ? normalizeLtlWeightField(input.chargeableWeight)
      : input.chargeableWeight;
    const normalizedParentIds = normalizeParentIds(input.parentId, input.parentIds);
    const primaryParentId = normalizedParentIds[0] ?? null;
    const normalizedRemarks = attachRelatedParentIdsToRemarks(input.remarks, normalizedParentIds);
    const subchainTag = input.subchainStage === "pickup"
      ? LTL_PICKUP_SUBCHAIN_TAG
      : input.subchainStage === "delivery"
        ? LTL_DELIVERY_SUBCHAIN_TAG
        : null;
    const entryQueueMetadata = buildEntryQueueMetadata({ reason: "new" });
    const structuredLtlSegmentMode = input.businessType === "outsource"
      ? input.subchainStage === "pickup"
        ? "pickup_outsource"
        : input.subchainStage === "delivery"
          ? "delivery_outsource"
          : null
      : null;

    if (input.businessType === "outsource" && normalizedParentIds.length > 0 && subchainTag) {
      const duplicated = await findExistingLtlSubchain(db, normalizedParentIds, input.subchainStage as "pickup" | "delivery");
      if (duplicated) {
        throw new Error(`该零担主单已存在${input.subchainStage === "pickup" ? "前段" : "后段"}外请子链：${duplicated.orderNumber || `#${duplicated.id}`}，请勿重复创建`);
      }
    }

    const result = await db.insert(orders).values({
      systemCode,
      isLargeSlab,
      chargeableWeight: normalizedChargeableWeight || null,
      packageCount: input.packageCount || null,
      orderNumber: input.orderNumber,
      mergedPlanNumber: input.mergedPlanNumber || null,
      businessType: input.businessType,
      department: input.department || null,
      status: initialStatus as any,
      ...entryQueueMetadata,
      podOwnership: resolvePodOwnership({ businessType: input.businessType, subchainStage: input.subchainStage ?? null }),
      isUrgent: input.isUrgent,
      urgentReason: input.urgentReason || null,
      customerId: input.customerId || null,
      customerName: input.customerName || null,
      customerPhone: input.customerPhone || null,
      settlementType: (input.settlementType as any) || null,
      cargoName: input.cargoName || null,
      weight: normalizedOrderWeight || null,
      packagingType: (input.packagingType as any) || null,
      cargoSpec: input.cargoSpec || null,
      specialRequirements: input.specialRequirements || null,
      warehouseId: input.warehouseId || null,
      warehouseName: input.warehouseName || null,
      originCity: input.originCity || null,
      deliveryAddress: input.deliveryAddress || null,
      destinationCity: input.destinationCity || null,
      receiverName: input.receiverName || null,
      receiverPhone: input.receiverPhone || null,
      customerPrice: input.customerPrice || null,
      quotedPrice: input.quotedPrice || null,
      shippingNote: input.shippingNote || null,
      remarks: normalizedRemarks,
      parentId: primaryParentId,
      relatedParentIds: normalizedParentIds.length > 0 ? normalizedParentIds : null,
      subchainStage: input.subchainStage ?? null,
      ltlSegmentMode: structuredLtlSegmentMode,
      orderDate: input.orderDate ? new Date(input.orderDate) : new Date(),
      createdBy: ctx.user!.id,
      assignedDispatcherId,
      autoAssignedRegion,
      autoAssignedAt: assignedDispatcherId ? new Date() : null,
    });
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "create",
      targetType: "order",
      targetId: String(result[0].insertId),
      description: `创建订单 ${systemCode}${input.isUrgent ? ' [加急]' : ''}`,
    });
    // 加急订单通知
    if (input.isUrgent) {
      const route = `${input.originCity || '?'} → ${input.destinationCity || '?'}`;
      notifyOwner({
        title: `🚨 加急订单创建: ${systemCode}`,
        content: `客户: ${input.customerName || '未知'} | 路线: ${route} | 货物: ${input.cargoName || '-'} ${normalizedOrderWeight ? normalizedOrderWeight + '吨' : ''} | 加急原因: ${input.urgentReason || '未填写'}`,
      }).catch(e => console.error('Urgent order notification failed:', e));
    }
    if (input.businessType === "outsource" && input.subchainStage === "delivery" && normalizedParentIds.length > 0) {
      await refreshRelatedParentPodOwnership(db, normalizedParentIds);
    }
    return { id: result[0].insertId, systemCode, orderNumber: input.orderNumber };
  }),
  // 订单池列表查询（支持筛选、排序、分页）
  list: protectedProcedure.input(
    z.object({
      page: z.number().default(1),
      pageSize: z.number().default(50),
      businessType: z.enum(["outsource", "self", "ltl"]).optional(),
      status: z.string().optional(),
      isUrgent: z.boolean().optional(),
      customerId: z.number().optional(),
      keyword: z.string().optional(),
      mergedPlanNumber: z.string().optional(),
      destinationCity: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      assignedDispatcherId: z.number().optional(),
      freightMin: z.number().optional(),
      freightMax: z.number().optional(),
      originCity: z.string().optional(),
      plateNumber: z.string().optional(),
      viewScope: z.enum(["default", "entry_total"]).optional(),
    }),
  ).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return { items: [], total: 0 };
    const conditions: any[] = [];
    if (input.businessType) {
      conditions.push(eq(orders.businessType, input.businessType));
    }
    if (input.status) {
      conditions.push(eq(orders.status, input.status as any));
    }
    if (input.isUrgent !== undefined) {
      conditions.push(eq(orders.isUrgent, input.isUrgent));
    }
    if (input.customerId) {
      conditions.push(eq(orders.customerId, input.customerId));
    }
    if (input.destinationCity) {
      conditions.push(like(orders.destinationCity, `%${input.destinationCity}%`));
    }
    if (input.keyword) {
      conditions.push(
        or(
          like(orders.systemCode, `%${input.keyword}%`),
          like(orders.orderNumber, `%${input.keyword}%`),
          like(orders.customerName, `%${input.keyword}%`),
          like(orders.receiverName, `%${input.keyword}%`),
          like(orders.mergedPlanNumber, `%${input.keyword}%`),
          like(orders.plateNumber, `%${input.keyword}%`),
          like(orders.driverName, `%${input.keyword}%`),
          like(orders.freightWaybillNumber, `%${input.keyword}%`),
          like(orders.shippingNote, `%${input.keyword}%`),
        ),
      );
    }
    if (input.mergedPlanNumber) {
      conditions.push(eq(orders.mergedPlanNumber, input.mergedPlanNumber));
    }
    if (input.startDate) {
      conditions.push(gte(orders.orderDate, new Date(input.startDate)));
    }
    if (input.endDate) {
      conditions.push(lte(orders.orderDate, new Date(input.endDate)));
    }
    if (input.assignedDispatcherId) {
      conditions.push(eq(orders.assignedDispatcherId, input.assignedDispatcherId));
    }
    if (input.freightMin !== undefined) {
      conditions.push(gte(orders.customerPrice, String(input.freightMin)));
    }
    if (input.freightMax !== undefined) {
      conditions.push(lte(orders.customerPrice, String(input.freightMax)));
    }
    if (input.originCity) {
      conditions.push(like(orders.originCity, `%${input.originCity}%`));
    }
    if (input.plateNumber) {
      conditions.push(like(orders.plateNumber, `%${input.plateNumber}%`));
    }
    // 非管理员/客服经理只能看到自己相关的订单（角色数据隔离）
    const role = ctx.user?.role;
    const allowEntryTotalGlobalView = input.viewScope === "entry_total" && role === "order_entry";
    if (role && !["admin", "cs_manager"].includes(role)) {
      if (allowEntryTotalGlobalView) {
        // 录单台“全部订单”需要看到全量订单闭环，不能被 createdBy 截断，否则合并主单和他人创建的加急单会缺失
      } else if (["outsource_dispatcher", "ltl_dispatcher", "fleet_dispatcher", "field_manager"].includes(role)) {
        // 调度员和现场管理员只能看到分配给自己的订单
        conditions.push(eq(orders.assignedDispatcherId, ctx.user!.id));
      } else if (role === "order_entry") {
        // 录单员默认只能看到自己创建的订单
        conditions.push(eq(orders.createdBy, ctx.user!.id));
      } else if (role === "ltl_cs") {
        // 零担客服只能看到零担订单 + 自己创建的订单
        conditions.push(or(
          eq(orders.businessType, "ltl"),
          eq(orders.createdBy, ctx.user!.id)
        ));
      } else if (role === "chain_cs") {
        // 连锁客服只能看到自己创建的订单
        conditions.push(eq(orders.createdBy, ctx.user!.id));
      } else if (role === "finance_assistant") {
        // 财务助理只能看到已调度以后的订单（与回单押金相关）
        conditions.push(inArray(orders.status, ["dispatched", "delivered", "signed", "settled"] as any[]));
      }
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [items, totalResult] = await Promise.all([
      db
        .select()
        .from(orders)
        .where(whereClause)
        .orderBy(desc(orders.isUrgent), asc(orders.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      db.select({ cnt: count() }).from(orders).where(whereClause),
    ]);
    // 批量查询订单相关人员姓名（当前负责人、搁置操作人、原负责人）
    const relatedUserIds = Array.from(new Set(
      items.flatMap((item) => [item.assignedDispatcherId, item.holdBy, item.preHoldAssignee])
        .filter((id): id is number => id !== null && id !== undefined)
    ));
    let userNameMap = new Map<number, string>();
    if (relatedUserIds.length > 0) {
      const relatedUsers = await db.select({ id: users.id, name: users.name, username: users.username })
        .from(users)
        .where(inArray(users.id, relatedUserIds));
      userNameMap = new Map(relatedUsers.map((user) => [user.id, user.name || user.username || `#${user.id}`]));
    }

    const orderIds = items.map((item) => item.id);
    const podRows = orderIds.length > 0
      ? await db.select({
          orderId: podRecords.orderId,
          podRecordId: podRecords.id,
          podOriginalStatus: podRecords.originalStatus,
          podOriginalSentAt: podRecords.originalSentAt,
          podOriginalReceivedAt: podRecords.originalReceivedAt,
          podDeliveryNoteUrl: podRecords.deliveryNoteUrl,
          podOwnership: podRecords.podOwnership,
        }).from(podRecords)
       .where(inArray(podRecords.orderId, orderIds))
          .orderBy(desc(podRecords.id))
      : [];
    const podMap = new Map<number, {
      orderId: number;
      podRecordId: number;
      podOriginalStatus: string | null;
      podOriginalSentAt: Date | null;
      podOriginalReceivedAt: Date | null;
      podDeliveryNoteUrl: string | null;
      podOwnership: string | null;
    }>();
    for (const pod of podRows) {
      if (!podMap.has(pod.orderId)) {
        podMap.set(pod.orderId, pod);
      }
    }
    let latestRejectedApprovalMap = new Map<number, {
      approverName: string | null;
      approverComment: string | null;
      reason: string | null;
      createdAt: Date | null;
    }>();
    if (input.status === "pending_vehicle" && orderIds.length > 0) {
      const rejectedApprovals = await db.select({
        orderId: approvals.orderId,
        approverName: approvals.approverName,
        approverComment: approvals.approverComment,
        reason: approvals.reason,
        createdAt: approvals.createdAt,
      })
        .from(approvals)
        .where(and(
          inArray(approvals.orderId, orderIds),
          eq(approvals.status, "rejected" as any),
        ))
        .orderBy(desc(approvals.createdAt));

      for (const approval of rejectedApprovals) {
        if (!latestRejectedApprovalMap.has(approval.orderId)) {
          latestRejectedApprovalMap.set(approval.orderId, approval);
        }
      }
    }

    const enrichedItems = items.map(item => {
      const latestRejectedApproval = latestRejectedApprovalMap.get(item.id);
      const lastRejectReason = latestRejectedApproval?.approverComment?.trim() || null;
      const lastRejectDescription = latestRejectedApproval?.reason?.trim() || null;
      const pod = podMap.get(item.id);
      const podOriginalStatus = pod?.podOriginalStatus ?? null;
      const podDeliveryNoteUrl = pod?.podDeliveryNoteUrl ?? null;
      const podEffectiveStatus = podOriginalStatus === "received"
        ? "original_received"
        : podOriginalStatus === "sent"
          ? "original_sent"
          : podDeliveryNoteUrl
            ? "uploaded"
            : "none";
      return {
        ...item,
        podRecordId: pod?.podRecordId ?? null,
        podOriginalStatus,
        podOriginalSentAt: pod?.podOriginalSentAt ?? null,
        podOriginalReceivedAt: pod?.podOriginalReceivedAt ?? null,
        podDeliveryNoteUrl,
        podRecordOwnership: pod?.podOwnership ?? null,
        podEffectiveStatus,
        dispatcherName: item.assignedDispatcherId ? (userNameMap.get(item.assignedDispatcherId) || null) : null,
        holdByName: item.holdBy ? (userNameMap.get(item.holdBy) || null) : null,
        preHoldAssigneeName: item.preHoldAssignee ? (userNameMap.get(item.preHoldAssignee) || null) : null,
        lastReturnAt: item.status === "pending_vehicle" ? (item.approvalDate ?? latestRejectedApproval?.createdAt ?? null) : null,
        lastReturnBy: item.status === "pending_vehicle" ? (latestRejectedApproval?.approverName ?? null) : null,
        lastReturnReason: item.status === "pending_vehicle" ? lastRejectReason : null,
        lastReturnDescription: item.status === "pending_vehicle" ? lastRejectDescription : null,
        // 等通知经历字段（用于全部订单页当前队列显示）
        isFromOnHold: item.entryQueueReason === "returned" && item.entryQueueSourceStatus === "on_hold",
        holdAt: (item.entryQueueReason === "returned" && item.entryQueueSourceStatus === "on_hold") ? (item.holdAt ?? null) : null,
        holdReason: (item.entryQueueReason === "returned" && item.entryQueueSourceStatus === "on_hold") ? (item.holdReason ?? null) : null,
        releaseReason: (item.entryQueueReason === "returned" && item.entryQueueSourceStatus === "on_hold") ? (item.releaseReason ?? null) : null,
        entryQueueEnteredAt: item.entryQueueEnteredAt ?? null,
      };
    });
    return { items: enrichedItems, total: totalResult[0]?.cnt ?? 0 };
  }),
  // 录单台待分流 / 退回待处理队列
  listEntryQueue: protectedProcedure.input(
    z.object({
      page: z.number().default(1),
      pageSize: z.number().default(50),
      keyword: z.string().optional(),
      view: z.enum(["pool", "returned"]).default("pool"),
    }),
  ).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return { items: [], total: 0 };

    const conditions: any[] = [eq(orders.status, "pending_assign" as any)];
    if (input.keyword) {
      conditions.push(
        or(
          like(orders.systemCode, `%${input.keyword}%`),
          like(orders.orderNumber, `%${input.keyword}%`),
          like(orders.customerName, `%${input.keyword}%`),
          like(orders.receiverName, `%${input.keyword}%`),
          like(orders.destinationCity, `%${input.keyword}%`),
          like(orders.shippingNote, `%${input.keyword}%`),
          like(orders.remarks, `%${input.keyword}%`),
        ),
      );
    }

    const role = ctx.user?.role;
    if (role && !["admin", "cs_manager"].includes(role)) {
      if (role === "order_entry") {
        conditions.push(eq(orders.createdBy, ctx.user!.id));
      } else if (role === "ltl_cs") {
        conditions.push(or(eq(orders.businessType, "ltl"), eq(orders.createdBy, ctx.user!.id)));
      } else if (role === "chain_cs") {
        conditions.push(eq(orders.createdBy, ctx.user!.id));
      } else {
        return { items: [], total: 0 };
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const pendingOrders = await db
      .select()
      .from(orders)
      .where(whereClause)
      .orderBy(desc(orders.isUrgent), asc(orders.createdAt));

    if (pendingOrders.length === 0) {
      return { items: [], total: 0 };
    }

    const dispatcherIds = Array.from(new Set(pendingOrders.map((item) => item.assignedDispatcherId).filter((id): id is number => id !== null && id !== undefined)));
    let dispatcherMap = new Map<number, string>();
    if (dispatcherIds.length > 0) {
      const dispatchers = await db.select({ id: users.id, name: users.name, username: users.username })
        .from(users)
        .where(inArray(users.id, dispatcherIds));
      dispatcherMap = new Map(dispatchers.map((item) => [item.id, item.name || item.username || `#${item.id}`]));
    }

    const orderIdStrings = pendingOrders.map((item) => String(item.id));
    const pendingAssignLogs = orderIdStrings.length > 0
      ? await db.select({
          action: operationLogs.action,
          targetId: operationLogs.targetId,
          changes: operationLogs.changes,
          description: operationLogs.description,
          createdAt: operationLogs.createdAt,
          userName: operationLogs.userName,
        })
          .from(operationLogs)
          .where(and(
            eq(operationLogs.targetType, "order"),
            inArray(operationLogs.action, ["rollback", "revert", "update", "status_change"]),
            inArray(operationLogs.targetId, orderIdStrings),
          ))
          .orderBy(desc(operationLogs.createdAt))
      : [];

    const RETURN_STATUS_LABELS: Record<string, string> = {
      pending_assign: "待指派",
      pending_dispatch: "待调度",
      pending_price: "待定价",
      priced: "已定价",
      pending_vehicle: "待找车",
      pending_approval: "待审批",
      pending_inquiry: "待询价",
      inquiry_confirmed: "已询价",
      shipped: "已发运",
      dispatched: "已调度",
      in_transit: "运输中",
      delivered: "已送达",
      signed: "已签收",
      settled: "已结算",
      on_hold: "等通知",
      cancelled: "已取消",
    };

    const latestPendingAssignEventMap = new Map<string, NonNullable<ReturnType<typeof classifyEntryQueuePendingAssignEvent>>>();

    for (const log of pendingAssignLogs) {
      const targetId = log.targetId ?? "";
      if (!targetId || latestPendingAssignEventMap.has(targetId)) {
        continue;
      }
      const pendingAssignEvent = classifyEntryQueuePendingAssignEvent(log, RETURN_STATUS_LABELS);
      if (!pendingAssignEvent) {
        continue;
      }
      latestPendingAssignEventMap.set(targetId, pendingAssignEvent);
    }

    const enrichedItems = pendingOrders.map((item) => {
      const latestPendingAssignEvent = latestPendingAssignEventMap.get(String(item.id));
      const latestReturn = latestPendingAssignEvent?.eventType === "returned"
        ? latestPendingAssignEvent
        : null;
      // 判断是否从等通知恢复（entryQueueSourceStatus=on_hold 且 entryQueueReason=returned）
      const isFromOnHold = item.entryQueueReason === "returned" && item.entryQueueSourceStatus === "on_hold";
      return {
        ...item,
        dispatcherName: item.assignedDispatcherId ? (dispatcherMap.get(item.assignedDispatcherId) || null) : null,
        lastReturnAt: latestReturn?.enteredAt ?? null,
        lastReturnBy: latestReturn?.returnedBy ?? null,
        lastReturnReason: latestReturn?.reason ?? null,
        lastReturnFromStatus: latestReturn?.fromStatus ?? null,
        lastReturnFromLabel: latestReturn?.fromLabel ?? null,
        lastReturnDescription: latestReturn?.description ?? null,
        lastReturnAction: latestReturn?.action ?? null,
        // 等通知经历字段（从orders表直接读取）
        holdAt: isFromOnHold ? (item.holdAt ?? null) : null,
        holdReason: isFromOnHold ? (item.holdReason ?? null) : null,
        releaseReason: isFromOnHold ? (item.releaseReason ?? null) : null,
        isFromOnHold,
      };
    });

    // 合并视图：不再区分pool/returned，显示所有pending_assign订单
    const filteredItems = enrichedItems.sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    const total = filteredItems.length;
    const start = (input.page - 1) * input.pageSize;
    const end = start + input.pageSize;
    return {
      items: filteredItems.slice(start, end),
      total,
    };
  }),
  // 获取单个订单详情
  getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
    const order = rows[0] ?? null;
    if (!order) return null;
    
    // 查询调度员姓名（安全处理null值，防御关联数据不存在的情况）
    let dispatcherName: string | null = null;
    if (order.assignedDispatcherId) {
      try {
        const dispatcherRows = await db.select({ name: users.name, username: users.username })
          .from(users)
          .where(eq(users.id, order.assignedDispatcherId))
          .limit(1);
        if (dispatcherRows[0]) {
          dispatcherName = dispatcherRows[0].name || dispatcherRows[0].username || null;
        }
      } catch (e) {
        // 调度员查询失败不影响订单返回
        console.error(`查询调度员(${order.assignedDispatcherId})失败:`, e);
      }
    }
    
    // 安全返回：确保所有字段都有默认值
    return {
      ...order,
      dispatcherName,
      customerName: order.customerName ?? null,
      warehouseName: order.warehouseName ?? null,
      freightStationName: order.freightStationName ?? null,
      driverName: order.driverName ?? null,
      plateNumber: order.plateNumber ?? null,
    };
  }),
  // 更新订单信息
  update: permissionProcedure(["order.create", "order.edit"]).input(
    z.object({
      id: z.number(),
      orderNumber: z.string().optional(),
      mergedPlanNumber: z.string().optional(),
      businessType: z.enum(["outsource", "self", "ltl"]).optional(),
      department: z.string().optional(),
      isUrgent: z.boolean().optional(),
      urgentReason: z.string().optional(),
      customerId: z.number().optional(),
      customerName: z.string().max(200, "客户名称不能超过200个字符").optional(),
      customerPhone: z.string().optional(),
      settlementType: z.enum(["monthly", "cash", "collect"]).optional(),
      cargoName: z.string().optional(),
      weight: optionalWeight(),
      packagingType: z.enum(["pallet", "loose", "pallet_loaded"]).optional(),
      cargoSpec: z.string().optional(),
      specialRequirements: z.string().optional(),
      warehouseId: z.number().optional(),
      warehouseName: z.string().optional(),
      originCity: z.string().optional(),
      deliveryAddress: z.string().optional(),
      destinationCity: z.string().optional(),
      receiverName: z.string().optional(),
      receiverPhone: z.string().optional(),
      customerPrice: optionalDecimal(),
      quotedPrice: optionalDecimal(),
      shippingNote: z.string().optional(),
      remarks: z.string().optional(),
      receivingNote: z.string().optional(),
      receivingStatus: z.enum(["receivable", "wait_notice", "not_receivable"]).optional(),
      expectedReceiveAt: z.string().optional(),
      nextFollowUpAt: z.string().optional(),
      receivingReason: z.string().optional(),
      dispatcherRemark: z.string().optional(),
      plateNumber: z.string().optional(),
      driverName: z.string().optional(),
      driverPhone: z.string().optional(),
      reassignReason: z.string().optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const { id, ...data } = input;
    const updateData: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    const [currentOrder] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!currentOrder) {
      throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
    }

    // 校验：合并订单场景下，业务类型只能在主订单修改；子订单一律禁止修改
    if (updateData.businessType !== undefined) {
      if (isMergedChildOrder(currentOrder)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "子订单（指引单）不允许修改业务类型，请在主订单上统一修改。",
        });
      }
      if (!BUSINESS_TYPE_EDITABLE_STATUSES.includes(currentOrder.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `订单当前状态为"${currentOrder.status}"，不允许修改业务类型。请先退回到初始阶段后再修改。`,
        });
      }
      if (currentOrder.businessType === updateData.businessType) {
        delete updateData.businessType;
      } else if (currentOrder.isMerged || currentOrder.mergedPlanNumber) {
        const siblingOrders = currentOrder.isMerged
          ? await db.select({ id: orders.id, status: orders.status }).from(orders).where(eq(orders.parentId, id))
          : await db.select({ id: orders.id, status: orders.status }).from(orders).where(and(eq(orders.mergedPlanNumber, currentOrder.mergedPlanNumber!), ne(orders.id, id)));
        const blockedSiblings = siblingOrders.filter((order) => !BUSINESS_TYPE_EDITABLE_STATUSES.includes(order.status));
        if (blockedSiblings.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "当前合并组中存在已进入后续流程的子订单，暂不能统一修改业务类型。请先退回后再操作。",
          });
        }
        if (siblingOrders.length > 0) {
          if (currentOrder.isMerged) {
            await db.update(orders).set({ businessType: updateData.businessType }).where(eq(orders.parentId, id));
          } else {
            await db.update(orders).set({ businessType: updateData.businessType }).where(and(eq(orders.mergedPlanNumber, currentOrder.mergedPlanNumber!), ne(orders.id, id)));
          }
        }
      }
    }

    if (hasStructuredReceivingChanges(updateData)) {
      if (!RECEIVING_EDITABLE_STATUSES.includes(currentOrder.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `订单当前状态为"${currentOrder.status}"，不允许修改收货确认信息。请先退回到可编辑阶段后再修改。`,
        });
      }
      updateData.expectedReceiveAt = parseOptionalDateInput(updateData.expectedReceiveAt, "预计收货时间");
      updateData.nextFollowUpAt = parseOptionalDateInput(updateData.nextFollowUpAt, "下次跟进时间");
      const effectiveReceivingStatus = updateData.receivingStatus ?? currentOrder.receivingStatus;
      const effectiveReceivingReason = (updateData.receivingReason ?? currentOrder.receivingReason ?? "").trim();
      const effectiveFollowUpAt = updateData.nextFollowUpAt !== undefined ? updateData.nextFollowUpAt : currentOrder.nextFollowUpAt;
      if (effectiveReceivingStatus === "wait_notice" && !effectiveFollowUpAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "“等通知”必须填写下次跟进时间。" });
      }
      if (effectiveReceivingStatus === "not_receivable" && !effectiveReceivingReason) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "“暂不收货”必须填写原因。" });
      }
      if (effectiveReceivingStatus === "receivable") {
        if (updateData.nextFollowUpAt === undefined) updateData.nextFollowUpAt = null;
        if (updateData.receivingReason === undefined) updateData.receivingReason = null;
      }
      updateData.receivingConfirmedAt = new Date();
      updateData.receivingConfirmedBy = ctx.user!.id;
      updateData.receivingConfirmedByName = ctx.user!.name ?? ctx.user!.username ?? "未知";
    }

    // 瓷砖大板自动标注：当更新货物名称或规格时重新检测
    if (updateData.cargoName || updateData.cargoSpec) {
      const existing = await db.select({ cargoName: orders.cargoName, cargoSpec: orders.cargoSpec }).from(orders).where(eq(orders.id, id)).limit(1);
      const cargoName = updateData.cargoName || existing[0]?.cargoName || "";
      const cargoSpec = updateData.cargoSpec || existing[0]?.cargoSpec || "";
      const isTile = /瓷砖|大板|石材|岩板/.test(cargoName);
      if (isTile && cargoSpec) {
        const sizeMatch = cargoSpec.match(/(\d+)\s*[*×x]\s*(\d+)/i);
        if (sizeMatch) {
          const [, w, h] = sizeMatch.map(Number);
          updateData.isLargeSlab = (w >= 1800 && h >= 900) || (h >= 1800 && w >= 900);
        }
      }
    }
    if (Object.keys(updateData).length > 0) {
      // 先查询旧记录用于字段级变更对比
      const [oldRecord] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      const fieldChanges = oldRecord ? trackFieldChanges(oldRecord as unknown as Record<string, unknown>, updateData) : [];
      
      await db.update(orders).set(updateData).where(eq(orders.id, id));
      await createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name || ctx.user!.username || undefined,
        action: "update",
        targetType: "order",
        targetId: String(id),
        changes: fieldChanges.length > 0 ? { fieldChanges, rawUpdate: updateData } : updateData,
        description: fieldChanges.length > 0 
          ? `更新订单 #${id}：${fieldChanges.map(c => c.label).join("、")}`
          : `更新订单 #${id}`,
      });
    }
    return { success: true };
  }),
  // 更新订单状态（权限细化：基础权限 + 状态转换角色校验）
  updateStatus: permissionProcedure(PERMISSIONS.ORDER_UPDATE_STATUS).input(
    z.object({
      id: z.number(),
      status: z.string(),
      plateNumber: z.string().optional(),
      driverName: z.string().optional(),
      driverPhone: z.string().optional(),
      dispatchPrice: optionalDecimal(),
      actualFreight: optionalDecimal(),
      deliveryFee: optionalDecimal(),
      extraFee: optionalDecimal(),
      freightStationId: z.number().optional(),
      freightStationName: z.string().optional(),
      ltlFinalStation: z.string().optional(),
      ltlFreightPrice: optionalDecimal(),
      depositAmount: optionalDecimal(),
      depositRefundable: z.boolean().optional(),
      stationReceiptUrl: z.string().optional(),
      dispatcherRemark: z.string().optional(),
      ltlUnitPrice: optionalDecimal(),
      ltlDeliveryFee: optionalDecimal(),
      ltlOtherFee: optionalDecimal(),
      freightWaybillNumber: z.string().optional(),
      inquiryPhone: z.string().optional(),
      isLargeSlab: z.boolean().optional(),
      receivingNote: z.string().optional(),
      driverIdCard: z.string().optional(),
      driverId: z.number().optional(),
      vehicleId: z.number().optional(),
      signedBy: z.string().optional(),
      signedRemark: z.string().optional(),
      signedAttachments: z.array(z.string()).optional(),
      signExceptionType: z.enum(["damage", "shortage", "reject", "other"]).optional(),
      exceptionQty: optionalDecimal(),
      damageDesc: z.string().optional(),
      rejectReason: z.string().optional(),
      evidenceUrls: z.array(z.string()).optional(),
      deliveredQty: optionalDecimal(),
      remainingQty: optionalDecimal(),
      reassignReason: z.string().optional(),
      holdReason: z.string().optional(),
      releaseReason: z.string().optional(),
      nextFollowUpAt: z.coerce.date().optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const { id, status, ...extra } = input;
    // ========== 状态转换角色权限细化（先于DB访问，快速拒绝无权请求） ==========
    // 管理员和客服经理拥有全部状态推进权限，跳过角色检查
    const userRole = ctx.user!.role;
    if (userRole !== "admin" && userRole !== "cs_manager") {
      // 按目标状态映射允许的角色
      const STATUS_ROLE_MAP: Record<string, string[]> = {
        // 外请调度员：找车→提交审批/已调度→已送达
        pending_approval: ["outsource_dispatcher"],
        dispatched: ["outsource_dispatcher", "fleet_dispatcher", "ltl_dispatcher"],
        partial_delivered: ["outsource_dispatcher", "fleet_dispatcher", "ltl_dispatcher", "field_manager"],
        delivered: ["outsource_dispatcher", "fleet_dispatcher", "ltl_dispatcher", "field_manager"],
        signed: ["outsource_dispatcher", "fleet_dispatcher", "ltl_dispatcher", "field_manager", "order_entry", "ltl_cs", "chain_cs"],
        // 零担调度员：询价→确认→发运
        inquiry_confirmed: ["ltl_dispatcher", "ltl_cs"],
        shipped: ["ltl_dispatcher", "ltl_cs"],
        // 车队调度员：派车→运输
        pending_dispatch: ["fleet_dispatcher", "order_entry", "ltl_cs"],
        // 待定价/待找车：客服经理专属（已在上方跳过）
        pending_price: ["order_entry", "ltl_cs", "chain_cs"],
        pending_vehicle: ["outsource_dispatcher"],
        pending_inquiry: ["ltl_dispatcher", "ltl_cs", "order_entry"],
        // 搁置/取消：客服经理专属（已在上方跳过），但开放给录单员和客服
        on_hold: ["order_entry", "ltl_cs", "chain_cs"],
        cancelled: ["order_entry", "ltl_cs", "chain_cs"],
        // 待指派：仅客服经理
        pending_assign: [],
      };
      const allowedRoles = STATUS_ROLE_MAP[status];
      if (allowedRoles !== undefined && !allowedRoles.includes(userRole)) {
        const STATUS_LABELS: Record<string, string> = {
            pending_assign:"待指派", pending_price:"待定价", priced:"已定价",
            pending_vehicle:"待找车", pending_dispatch:"待调度", pending_approval:"待审批",
            pending_inquiry:"待询价", inquiry_confirmed:"已询价", shipped:"已发运",
            dispatched:"已调度", in_transit:"运输中", partial_delivered:"部分送达", delivered:"已送达",
            signed:"已签收", on_hold:"等通知", cancelled:"已取消",

        };
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `您的角色无权将订单推进到“${STATUS_LABELS[status] || status}”状态`,
        });
      }
    }
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    // 状态转换合法性校验
    const VALID_TRANSITIONS: Record<string, string[]> = {
      pending_assign: ["pending_price", "pending_dispatch", "pending_inquiry", "on_hold", "cancelled"],
      pending_price: ["priced", "pending_vehicle", "pending_dispatch", "pending_inquiry", "on_hold", "cancelled"],
      priced: ["pending_vehicle", "pending_dispatch", "pending_inquiry", "on_hold", "cancelled"],
      pending_vehicle: ["dispatched", "pending_approval", "on_hold", "cancelled", "pending_price"],
      pending_dispatch: ["dispatched", "on_hold", "cancelled", "pending_price"],
      pending_approval: ["dispatched", "pending_vehicle", "on_hold", "cancelled"],
      pending_inquiry: ["inquiry_confirmed", "on_hold", "cancelled", "pending_price"],
      inquiry_confirmed: ["shipped", "dispatched", "partial_delivered", "delivered", "on_hold", "cancelled", "pending_inquiry"],
      shipped: ["partial_delivered", "delivered", "on_hold", "cancelled", "inquiry_confirmed"],
      dispatched: ["shipped", "in_transit", "partial_delivered", "delivered", "on_hold", "cancelled", "pending_vehicle", "pending_dispatch"],
      in_transit: ["partial_delivered", "delivered", "on_hold", "cancelled", "dispatched"],
      partial_delivered: ["partial_delivered", "delivered", "signed", "on_hold", "cancelled", "dispatched"],
      delivered: ["signed", "on_hold", "cancelled", "dispatched"],
      signed: ["on_hold"],
      on_hold: ["pending_assign", "pending_price", "priced", "pending_vehicle", "pending_dispatch", "pending_approval", "pending_inquiry", "inquiry_confirmed", "shipped", "dispatched", "in_transit", "delivered", "signed", "cancelled"],
      settled: [],
      merged: [],
      cancelled: [],
    };
    // 查询当前订单（需要完整数据用于逆向清洗判断）
    const [currentOrderFull] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!currentOrderFull) throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
    const currentStatus = currentOrderFull.status;
    const requestedNextStatus = resolveRequestedDispatchStatus({
      currentStatus,
      requestedStatus: status,
      businessType: currentOrderFull.businessType,
      remarks: currentOrderFull.remarks,
      subchainStage: currentOrderFull.subchainStage,
      ltlSegmentMode: currentOrderFull.ltlSegmentMode,
      parentId: currentOrderFull.parentId,
      relatedParentIds: currentOrderFull.relatedParentIds,
    });
    if (!requestedNextStatus) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "目标状态不能为空" });
    }
    const nextStatus = resolveOnHoldReleaseTargetStatus(currentOrderFull, requestedNextStatus);
    const isEnteringOnHold = currentStatus !== "on_hold" && nextStatus === "on_hold";
    const isReleasingOnHold = currentStatus === "on_hold" && nextStatus !== "on_hold" && nextStatus !== "cancelled";
    if (isEnteringOnHold) {
      extra.holdReason = normalizeRequiredRemark(extra.holdReason, "搁置原因");
    }
    if (isReleasingOnHold) {
      extra.releaseReason = normalizeRequiredRemark(extra.releaseReason, "恢复原因");
    }
    const isSelfTransportOrder = isSelfBusinessType(currentOrderFull.businessType);
    if (isSelfTransportOrder && nextStatus === "pending_approval") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "自运订单不允许进入审批流程" });
    }
    if (isSelfTransportOrder && extra.depositAmount !== undefined) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "自运订单不允许填写押金" });
    }
    if (isTerminalOrderStatus(currentStatus)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `终态订单“${STATUS_LABELS[currentStatus] || currentStatus}”不允许再修改状态，如需调整请联系管理员。`,
      });
    }
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (allowed && !allowed.includes(nextStatus)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `不允许从"${currentStatus}"状态转换到"${nextStatus}"状态`,
      });
    }
    assertPendingAssignRouteMatchesBusinessType({
      currentStatus,
      nextStatus,
      businessType: currentOrderFull.businessType,
    });
    assertOnHoldRestorePrerequisites(currentOrderFull, nextStatus);
    const restoredAssigneeId = isReleasingOnHold
      ? await resolvePreHoldAssignee(db, currentOrderFull.preHoldAssignee)
      : null;
    const updateData: Record<string, any> = { status: nextStatus };
    if (isEnteringOnHold) {
      Object.assign(updateData, {
        holdReason: extra.holdReason,
        releaseReason: null,
        holdBy: ctx.user!.id,
        holdAt: new Date(),
        preHoldStatus: currentStatus,
        preHoldAssignee: currentOrderFull.assignedDispatcherId ?? null,
      });
    } else if (isReleasingOnHold) {
      Object.assign(updateData, {
        releaseReason: extra.releaseReason,
        assignedDispatcherId: restoredAssigneeId,
      });
    }
    if (currentStatus === "pending_assign" && nextStatus !== "pending_assign") {
      Object.assign(updateData, resetEntryQueueMetadata());
    } else if (nextStatus === "pending_assign") {
      Object.assign(updateData, buildEntryQueueMetadata({
        reason: currentStatus === "on_hold" ? "returned" : "rerouted",
        fromStatus: currentStatus,
        returnedBy: ctx.user!.name || ctx.user!.username || null,
        returnReason: extra.reassignReason || extra.releaseReason || null,
      }));
    }
    // ========== 逆向清洗逻辑：状态回退时清除脏数据 ==========
    // on_hold 是临时搁置态，进入/恢复时都应保留当前业务数据，不能按普通阶段回退做清洗。
    const fromStage = STATUS_STAGE[currentStatus] ?? -1;
    const toStage = STATUS_STAGE[nextStatus] ?? -1;
    const isOnHoldToggle = currentStatus === "on_hold" || nextStatus === "on_hold";
    const isRollback = !isOnHoldToggle && toStage < fromStage;
    if (isRollback) {
      // 1. 清洗时间戳：将更晚阶段的时间戳置null
      if (toStage < 6) { // 退回到dispatched之前
        updateData.dispatchDate = null;
      }
      if (toStage < 7) { // 退回到in_transit之前
        updateData.transitDate = null;
        updateData.loadingDate = null;
      }
      if (toStage < 8) { // 退回到delivered之前
        updateData.deliveryDate = null;
        updateData.deliveredQty = null;
        updateData.remainingQty = null;
      }
      if (toStage < 9) { // 退回到signed之前
        updateData.signedDate = null;
        updateData.signedBy = null;
        updateData.signedAttachments = null;
        updateData.signedRemark = null;
        updateData.signExceptionType = null;
        updateData.exceptionQty = null;
        updateData.damageDesc = null;
        updateData.rejectReason = null;
        updateData.evidenceUrls = null;
        updateData.podDate = null;
        updateData.podSentDate = null;
      }
      // 2. 清洗车辆与回单：退回到 pending_vehicle/pending_price/pending_assign 时
      if (toStage <= 3) {
        updateData.plateNumber = null;
        updateData.driverName = null;
        updateData.driverPhone = null;
        updateData.driverId = null;
        updateData.vehicleId = null;
        updateData.depositAmount = null;
        updateData.depositStatus = null;
        // 删除 pending 状态的回单记录（自动创建的幽灵记录）
        try {
          await db.delete(podRecords).where(
            and(
              eq(podRecords.orderId, id),
              eq(podRecords.originalStatus, "pending")
            )
          );
        } catch (e) {
          console.error("Clean pod records failed:", e);
        }
      }
      // 3. 清洗幽灵金额：退回到 pending_price（待定价）时
      if (toStage <= 1) {
        updateData.actualFreight = null;
        updateData.totalCost = null;
      }
    }
    // 根据状态自动设置时间（完整日期跟踪体系）
        if (nextStatus === "dispatched") {
      updateData.dispatchDate = new Date();
      if (isSelfTransportOrder) {
        Object.assign(updateData, buildSelfTransportDepositReset());
      }
      // 如果有押金，自动设置押金状态
      if (!isSelfTransportOrder && extra.depositAmount && safeParseFloat(extra.depositAmount) > 0) {
        updateData.depositStatus = extra.depositRefundable === false ? "not_refundable" : "paid";
      }
      // 自动创建回单记录（仅当前订单负责回单时创建）
      try {
        await ensurePendingPodRecordForOrder(
          db,
          {
            id,
            podOwnership: currentOrderFull.podOwnership,
            depositAmount: (extra.depositAmount as string | null | undefined) ?? currentOrderFull.depositAmount,
            businessType: currentOrderFull.businessType,
          },
          (extra.depositAmount as string | null | undefined) ?? currentOrderFull.depositAmount,
        );
      } catch (e) {
        console.error("Auto-create pod record failed:", e);
      }
    } else if (nextStatus === "in_transit") {
      // 兼容旧数据：如果从旧版本还能推到in_transit
      updateData.transitDate = new Date();
      if (!updateData.loadingDate) updateData.loadingDate = new Date();
           } else if (nextStatus === "partial_delivered" || nextStatus === "delivered") {

      updateData.deliveryDate = new Date(); // 送货日期
      // 如果 loadingDate 为空，顺便赋值为当前时间（消除in_transit后的补充逻辑）
      const currentOrderData = await db.select({ loadingDate: orders.loadingDate }).from(orders).where(eq(orders.id, id)).limit(1);
      if (currentOrderData[0] && !currentOrderData[0].loadingDate) {
        updateData.loadingDate = new Date();
      }
          if (nextStatus === "delivered" && updateData.deliveredQty === undefined) {
        updateData.deliveredQty = currentOrderFull.packageCount != null ? String(currentOrderFull.packageCount) : null;
      }
      if (nextStatus === "delivered" && updateData.remainingQty === undefined) {
        updateData.remainingQty = "0";
      }
    } else if (nextStatus === "signed") {
      updateData.signedDate = new Date();   // 签收日期
    } else if (nextStatus === "pending_approval") {
      // 审批日期在审批通过/驳回时记录（见approval路由）
    }
    // 附加字段
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }
    if (nextStatus === "cancelled") {
      Object.assign(updateData, buildRollbackCleanUpdate("pending_assign"));
      updateData.status = "cancelled";
      updateData.depositStatus = "none";
      updateData.depositRefundable = true;
      updateData.podOwnership = resolvePodOwnership({
        businessType: currentOrderFull.businessType,
        remarks: currentOrderFull.remarks,
        subchainStage: currentOrderFull.subchainStage,
        ltlSegmentMode: currentOrderFull.ltlSegmentMode,
      });
      Object.assign(updateData, resetEntryQueueMetadata());
    }
    if (isSelfTransportOrder) {
      Object.assign(updateData, buildSelfTransportDepositReset());
    }
    // ========== 打破数据孤岛：自动关联driverId和vehicleId ==========
    // 如果前端没有传入driverId/vehicleId，根据车牌号和司机姓名自动查找关联
    if (!updateData.vehicleId && updateData.plateNumber) {
      try {
        const vRows = await db.select({ id: vehicles.id }).from(vehicles)
          .where(eq(vehicles.plateNumber, updateData.plateNumber)).limit(1);
        if (vRows[0]) updateData.vehicleId = vRows[0].id;
      } catch (e) { /* ignore */ }
    }
    if (!updateData.driverId && updateData.driverName) {
      try {
        const dRows = await db.select({ id: drivers.id }).from(drivers)
          .where(eq(drivers.name, updateData.driverName)).limit(1);
        if (dRows[0]) updateData.driverId = dRows[0].id;
      } catch (e) { /* ignore */ }
    }
    // 零担订单：自动计算 运费 = 单价 × 吨位，总价 = 运费 + 送货费 + 其他费
    if (updateData.ltlUnitPrice) {
      const row = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      if (row[0]) {
        const unitPrice = safeParseFloat(updateData.ltlUnitPrice);
        const weight = safeParseFloat(row[0].weight);
        const freight = Math.round(unitPrice * weight * 100) / 100;
        updateData.actualFreight = String(freight);
        const deliveryFee = safeParseFloat(updateData.ltlDeliveryFee || row[0].ltlDeliveryFee);
        const otherFee = safeParseFloat(updateData.ltlOtherFee || row[0].ltlOtherFee);
        updateData.totalCost = String(freight + deliveryFee + otherFee);
      }
    }
    // 计算总费用（非零担订单）
    if (!updateData.ltlUnitPrice && (updateData.actualFreight || updateData.deliveryFee || updateData.extraFee)) {
      const row = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      if (row[0]) {
        const af = safeParseFloat(updateData.actualFreight || row[0].actualFreight);
        const df = safeParseFloat(updateData.deliveryFee || row[0].deliveryFee);
        const ef = safeParseFloat(updateData.extraFee || row[0].extraFee);
        updateData.totalCost = String(af + df + ef);
      }
    }
    // 先查询旧记录用于字段级变更对比
    const [oldRecordForTrack] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    const statusFieldChanges = oldRecordForTrack ? trackFieldChanges(oldRecordForTrack as unknown as Record<string, unknown>, updateData) : [];

    await db.update(orders).set(updateData).where(eq(orders.id, id));
    const currentOrderParentIds = getRelatedParentIds(currentOrderFull);
    if (nextStatus === "cancelled") {
      await deletePendingPodRecords(db, [id]);
      await deleteRelatedApprovalRecords(db, [id]);
      await releaseOrdersFromActiveLtlBatches(db, [id]);
    }
    if (resolveLtlSubchainStage(currentOrderFull) === "delivery" && currentOrderParentIds.length > 0) {
      await refreshRelatedParentPodOwnership(db, currentOrderParentIds);
    }
    // 当状态变为pending_approval时，自动创建审批记录
    if (nextStatus === "pending_approval") {
      try {
        const orderRow = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
        if (orderRow[0]) {
          const remarkPart = extra.dispatcherRemark ? ` 备注：${extra.dispatcherRemark}` : "";
          await db.insert(approvals).values({
            orderId: id,
            approvalType: "vehicle_quote",
            applicantId: ctx.user!.id,
            applicantName: ctx.user!.name || ctx.user!.username || "未知",
            requestedAmount: extra.actualFreight || null,
            status: "pending",
            reason: `外请找车审批：车牌${extra.plateNumber || ""} 司机${extra.driverName || ""} 运费${extra.actualFreight || ""}元 押金${extra.depositAmount || "0"}元${remarkPart}`,
          });
          // 发送审批待办通知
          notifyOwner({
            title: `📝 新审批待办: ${orderRow[0].systemCode || orderRow[0].orderNumber || `#${id}`}`,
            content: `客户: ${orderRow[0].customerName || '未知'} | 路线: ${orderRow[0].originCity || '?'} → ${orderRow[0].destinationCity || '?'} | 车牌: ${extra.plateNumber || '-'} | 运费: ${extra.actualFreight || '-'}元 | 报价人: ${ctx.user!.name || ctx.user!.username || '未知'}`,
          }).catch(e => console.error('Approval notification failed:', e));
        }
      } catch (e) {
        console.error("Auto-create approval record failed:", e);
      }
    }
    // 零担询价确认后，自动保存新货站到货站管理
    if (nextStatus === "inquiry_confirmed" && extra.freightStationName) {
      try {
        const existingStation = await dbHelpers.findFreightStationByName(extra.freightStationName);
        if (!existingStation) {
          await dbHelpers.createFreightStation({
            name: extra.freightStationName,
            phone: extra.inquiryPhone || undefined,
            isActive: true,
          });
        }
      } catch (e) {
        console.error("Auto-save freight station failed:", e);
      }
    }
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "status_change",
      targetType: "order",
      targetId: String(id),
      changes: statusFieldChanges.length > 0 ? { fieldChanges: statusFieldChanges, rawUpdate: updateData } : updateData,
      description: (() => {
        const _sLabel: Record<string, string> = {pending_assign:"待指派",pending_price:"待定价",pending_dispatch:"待调度",pending_vehicle:"待找车",pending_approval:"待审批",pending_inquiry:"待询价",inquiry_confirmed:"已询价",shipped:"已发运",dispatched:"已调度",in_transit:"运输中",delivered:"已送达",signed:"已签收",on_hold:"等通知",cancelled:"已取消"};
        if (isEnteringOnHold) return `进入等通知，原因：${extra.holdReason || "未填写"}`;
        if (isReleasingOnHold) return `从等通知恢复到${_sLabel[nextStatus] || nextStatus}，原因：${extra.releaseReason || "未填写"}`;
        return `订单 #${id} 状态变更为 ${_sLabel[nextStatus] || nextStatus}`;
      })(),
    });
    return { success: true };
  }),
  handleSignException: permissionProcedure(PERMISSIONS.ORDER_UPDATE_STATUS).input(
    z.object({
      orderId: z.number(),
      signExceptionType: z.enum(["damage", "shortage", "reject", "other"]),
      signedBy: z.string().optional(),
      signedRemark: z.string().optional(),
      signedAttachments: z.array(z.string()).optional(),
      exceptionQty: optionalDecimal(),
      damageDesc: z.string().optional(),
      rejectReason: z.string().optional(),
      evidenceUrls: z.array(z.string()).optional(),
      deliveredQty: optionalDecimal(),
      remainingQty: optionalDecimal(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");

    const [currentOrder] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!currentOrder) {
      throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
    }

    const currentStatus = String(currentOrder.status || "");
    if (!["partial_delivered", "delivered"].includes(currentStatus)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "只有已送达或部分送达的订单才能执行异常签收处理。" });
    }

    const resolvedRemainingQty = input.remainingQty ?? currentOrder.remainingQty ?? null;
    const resolvedExceptionQty = input.exceptionQty
      ?? (input.signExceptionType === "shortage" ? resolvedRemainingQty : null)
      ?? null;
    const updateData: Record<string, any> = {
      status: "signed",
      signedDate: new Date(),
      signedBy: input.signedBy?.trim() || currentOrder.signedBy || ctx.user!.name || ctx.user!.username || "系统",
      signedRemark: input.signedRemark?.trim() || null,
      signedAttachments: input.signedAttachments && input.signedAttachments.length > 0 ? input.signedAttachments : null,
      signExceptionType: input.signExceptionType,
      exceptionQty: resolvedExceptionQty,
      damageDesc: input.damageDesc?.trim() || null,
      rejectReason: input.rejectReason?.trim() || null,
      evidenceUrls: input.evidenceUrls && input.evidenceUrls.length > 0 ? input.evidenceUrls : null,
      deliveredQty: input.deliveredQty ?? currentOrder.deliveredQty ?? null,
      remainingQty: resolvedRemainingQty,
    };

    await db.update(orders).set(updateData).where(eq(orders.id, input.orderId));
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "sign_exception_handle",
      targetType: "order",
      targetId: String(input.orderId),
      changes: updateData,
      description: `订单 #${input.orderId} 执行异常签收处理，异常类型：${input.signExceptionType}`,
    });
    return { success: true };
  }),
  // 指派调度员
  assignDispatcher: permissionProcedure("order.assign").input(
    z.object({
      orderId: z.number(),
      dispatcherId: z.number(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    await db.update(orders).set({
      assignedDispatcherId: input.dispatcherId,
    }).where(eq(orders.id, input.orderId));
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "assign_dispatcher",
      targetType: "order",
      targetId: String(input.orderId),
      description: `指派调度员 #${input.dispatcherId}`,
    });
    return { success: true };
  }),
  // 指挥台定价+区域匹配（客服经理专用，权限细化）
  priceAndAssign: permissionProcedure(PERMISSIONS.OUTSOURCE_SET_PRICE).input(
    z.object({
      orderId: z.number(),
      dispatchPrice: requiredPositiveDecimal(),
      dispatcherRemark: z.string().optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    // 获取订单信息
    const orderRows = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!orderRows[0]) throw new Error("订单不存在");
    const order = orderRows[0];
    // 尝试自动匹配区域调度员
    const region = await autoAssignDispatcher(order.destinationCity);
    const updateData: Record<string, any> = {
      dispatchPrice: input.dispatchPrice,
    };
    if (input.dispatcherRemark) {
      updateData.dispatcherRemark = input.dispatcherRemark;
    }
    if (region) {
      // 匹配成功：状态变为待找车，自动分配给对应调度员
      updateData.status = "pending_vehicle";
      updateData.assignedDispatcherId = region.dispatcherId;
      updateData.autoAssignedRegion = `${region.province}${region.city ? '-' + region.city : ''}`;
      updateData.autoAssignedAt = new Date();
    } else {
      // 匹配失败：状态仍然是待定价，需要客服经理手动分配
      // 保持pending_price状态，但记录已定价
      updateData.status = "pending_price";
    }
    await db.update(orders).set(updateData).where(eq(orders.id, input.orderId));
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "price_and_assign",
      targetType: "order",
      targetId: String(input.orderId),
      description: `订单 #${input.orderId} 定价 ¥${input.dispatchPrice}${region ? `，自动分配区域: ${region.province}${region.city || ''}` : '，待手动分配'}`,
    });
    return {
      success: true,
      autoAssigned: !!region,
      assignedRegion: region ? `${region.province}${region.city || ''}` : null,
    };
  }),
  // 手动分配调度员并设置状态为待找车（客服经理专用，权限细化）
  manualAssign: permissionProcedure(PERMISSIONS.ORDER_ASSIGN).input(
    z.object({
      orderId: z.number(),
      dispatcherId: z.number(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const assignmentScope = await resolveDispatcherAssignmentScope(db, [input.orderId]);
    const targetOrderIds = assignmentScope.orderIds.length > 0 ? assignmentScope.orderIds : [input.orderId];
    await db.update(orders).set({
      assignedDispatcherId: input.dispatcherId,
      status: "pending_vehicle" as any,
      autoAssignedAt: new Date(),
    }).where(inArray(orders.id, targetOrderIds));
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "manual_assign",
      targetType: "order",
      targetId: targetOrderIds.join(","),
      description: `手动分配调度员 #${input.dispatcherId}，共 ${targetOrderIds.length} 个订单${assignmentScope.autoFollowOrderIds.length > 0 ? `（自动带入 ${assignmentScope.autoFollowOrderIds.length} 个关联子单）` : ""}`,
    });
    return { success: true, count: targetOrderIds.length, autoFollowOrderIds: assignmentScope.autoFollowOrderIds };
  }),
  // 批量分配调度员（指挥台分组批量操作，权限细化）
  batchManualAssign: permissionProcedure(PERMISSIONS.ORDER_ASSIGN).input(
    z.object({
      orderIds: z.array(z.number()).min(1),
      dispatcherId: z.number(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const assignmentScope = await resolveDispatcherAssignmentScope(db, input.orderIds);
    const targetOrderIds = assignmentScope.orderIds.length > 0 ? assignmentScope.orderIds : input.orderIds;

    await db.update(orders).set({
      assignedDispatcherId: input.dispatcherId,
      status: "pending_vehicle" as any,
      autoAssignedAt: new Date(),
    }).where(inArray(orders.id, targetOrderIds));
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "batch_manual_assign",
      targetType: "order",
      targetId: targetOrderIds.join(","),
      description: `批量分配调度员 #${input.dispatcherId}，共 ${targetOrderIds.length} 个订单${assignmentScope.autoFollowOrderIds.length > 0 ? `（自动带入 ${assignmentScope.autoFollowOrderIds.length} 个关联子单）` : ""}`,
    });
    return { success: true, count: targetOrderIds.length, autoFollowOrderIds: assignmentScope.autoFollowOrderIds };
  }),
  // 重新分配调度员（已分配的订单可以改分配给其他调度员，权限细化）
  reassignDispatcher: permissionProcedure(PERMISSIONS.ORDER_ASSIGN).input(
    z.object({
      orderId: z.number(),
      dispatcherId: z.number(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    // 获取订单当前状态
    const orderRows = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!orderRows[0]) throw new Error("订单不存在");
    const order = orderRows[0];
    // 只允许在以下状态下重新分配：待找车、待审批、已调度
    const allowedStatuses = ["pending_vehicle", "pending_approval", "dispatched", "pending_price"];
    if (!allowedStatuses.includes(order.status)) {
      throw new Error(`当前状态"${order.status}"不允许重新分配调度员`);
    }
    const oldDispatcherId = order.assignedDispatcherId;
    // 获取新调度员信息
    const dispatcherRows = await db.select().from(users).where(eq(users.id, input.dispatcherId)).limit(1);
    const newDispatcherName = dispatcherRows[0]?.name || dispatcherRows[0]?.username || `#${input.dispatcherId}`;
    await db.update(orders).set({
      assignedDispatcherId: input.dispatcherId,
      status: "pending_vehicle" as any,  // 重新分配后回到待找车状态
      autoAssignedAt: new Date(),
    }).where(eq(orders.id, input.orderId));
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "reassign_dispatcher",
      targetType: "order",
      targetId: String(input.orderId),
      description: `重新分配调度员：从 #${oldDispatcherId || '无'} 改为 ${newDispatcherName}(#${input.dispatcherId})，订单 #${input.orderId}`,
    });
    return { success: true };
  }),
  reassignLtlDeliveryCarrier: permissionProcedure(PERMISSIONS.ORDER_UPDATE_STATUS).input(
    z.object({
      orderId: z.number(),
      plateNumber: z.string().min(1, "车牌号不能为空"),
      driverName: z.string().min(1, "司机姓名不能为空"),
      driverPhone: z.string().optional(),
      actualFreight: optionalDecimal(),
      depositAmount: optionalDecimal(),
      depositRefundable: z.boolean().optional(),
      dispatcherRemark: z.string().optional(),
      reassignReason: z.string().min(2, "改派原因不能为空"),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");

    const [currentOrder] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!currentOrder) {
      throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
    }

    const currentStatus = String(currentOrder.status || "");
    const currentStage = resolveLtlSubchainStage(currentOrder.remarks);
    if (currentStage !== "delivery" || currentOrder.businessType !== "outsource") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "只有零担后段外请子链才允许执行“改派后段承运”。" });
    }
    if (!["pending_vehicle", "pending_approval", "dispatched"].includes(currentStatus)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `当前状态“${currentStatus || "未知"}”不允许改派后段承运。` });
    }

    const normalizedReason = input.reassignReason.trim();
    const updateData: Record<string, any> = {
      plateNumber: input.plateNumber.trim(),
      driverName: input.driverName.trim(),
      driverPhone: input.driverPhone?.trim() || null,
      dispatcherRemark: input.dispatcherRemark?.trim() || currentOrder.dispatcherRemark || null,
    };

    if (input.actualFreight !== undefined) {
      updateData.actualFreight = input.actualFreight;
    }
    if (input.depositAmount !== undefined) {
      updateData.depositAmount = input.depositAmount;
      updateData.depositStatus = input.depositAmount && safeParseFloat(input.depositAmount) > 0
        ? (input.depositRefundable === false ? "not_refundable" : "paid")
        : "none";
    }
    if (input.depositRefundable !== undefined) {
      updateData.depositRefundable = input.depositRefundable;
    }
    if (currentStatus === "pending_approval") {
      updateData.status = "pending_vehicle";
      await deleteRelatedApprovalRecords(db, [input.orderId]);
    }

    try {
      const vehicleRows = await db.select({ id: vehicles.id }).from(vehicles)
        .where(eq(vehicles.plateNumber, updateData.plateNumber)).limit(1);
      if (vehicleRows[0]) updateData.vehicleId = vehicleRows[0].id;
    } catch (e) { /* ignore */ }
    try {
      const driverRows = await db.select({ id: drivers.id }).from(drivers)
        .where(eq(drivers.name, updateData.driverName)).limit(1);
      if (driverRows[0]) updateData.driverId = driverRows[0].id;
    } catch (e) { /* ignore */ }

    await db.update(orders).set(updateData).where(eq(orders.id, input.orderId));
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "reassign_ltl_delivery_carrier",
      targetType: "order",
      targetId: String(input.orderId),
      changes: {
        oldPlateNumber: currentOrder.plateNumber ?? null,
        oldDriverName: currentOrder.driverName ?? null,
        newPlateNumber: updateData.plateNumber,
        newDriverName: updateData.driverName,
        reassignReason: normalizedReason,
      },
      description: `订单 #${input.orderId} 改派后段承运：${currentOrder.plateNumber || "未填车牌"}/${currentOrder.driverName || "未填司机"} → ${updateData.plateNumber}/${updateData.driverName}，原因：${normalizedReason}`,
    });
    return { success: true };
  }),
  // 批量找车+报价（找车台分组批量操作，权限细化）
  batchUpdateStatus: permissionProcedure(PERMISSIONS.ORDER_UPDATE_STATUS).input(
    z.object({
      orderIds: z.array(z.number()).min(1),
      status: z.string(),
      plateNumber: z.string().optional(),
      driverName: z.string().optional(),
      driverPhone: z.string().optional(),
      actualFreight: z.string().optional(),
      depositAmount: z.string().optional(),
      depositRefundable: z.boolean().optional(),
      dispatcherRemark: z.string().optional(),
      receivingNote: z.string().optional(),
      driverIdCard: z.string().optional(),
      driverId: z.number().optional(),
      vehicleId: z.number().optional(),
      signedBy: z.string().optional(),
      signedRemark: z.string().optional(),
      signedAttachments: z.array(z.string()).optional(),
      signExceptionType: z.enum(["damage", "shortage", "reject", "other"]).optional(),
      exceptionQty: optionalDecimal(),
      damageDesc: z.string().optional(),
      rejectReason: z.string().optional(),
      evidenceUrls: z.array(z.string()).optional(),
      deliveredQty: optionalDecimal(),
      remainingQty: optionalDecimal(),
      holdReason: z.string().optional(),
      releaseReason: z.string().optional(),
      nextFollowUpAt: z.coerce.date().optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const { orderIds, status, ...extra } = input;
    // 状态转换角色权限检查（先于DB访问，与 updateStatus 保持一致）
    const userRole = ctx.user!.role;
    if (userRole !== "admin" && userRole !== "cs_manager") {
      const STATUS_ROLE_MAP: Record<string, string[]> = {
        pending_approval: ["outsource_dispatcher"],
        dispatched: ["outsource_dispatcher", "fleet_dispatcher", "ltl_dispatcher"],
        partial_delivered: ["outsource_dispatcher", "fleet_dispatcher", "ltl_dispatcher", "field_manager"],
        delivered: ["outsource_dispatcher", "fleet_dispatcher", "ltl_dispatcher", "field_manager"],
        signed: ["outsource_dispatcher", "fleet_dispatcher", "ltl_dispatcher", "field_manager", "order_entry", "ltl_cs", "chain_cs"],
        inquiry_confirmed: ["ltl_dispatcher", "ltl_cs"],
        shipped: ["ltl_dispatcher", "ltl_cs"],
        pending_dispatch: ["fleet_dispatcher", "order_entry", "ltl_cs"],
        pending_price: ["order_entry", "ltl_cs", "chain_cs"],
        pending_vehicle: ["outsource_dispatcher"],
        pending_inquiry: ["ltl_dispatcher", "ltl_cs", "order_entry"],
        on_hold: ["order_entry", "ltl_cs", "chain_cs"],
        cancelled: ["order_entry", "ltl_cs", "chain_cs"],
        pending_assign: [],
      };
      const allowedRoles = STATUS_ROLE_MAP[status];
      if (allowedRoles !== undefined && !allowedRoles.includes(userRole)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `您的角色无权将订单批量推进到“${status}”状态`,
        });
      }
    }
    const db = await getDb();
    if (!db) throw new Error("\u6570\u636e\u5e93\u4e0d\u53ef\u7528");
    const currentOrders = await db.select().from(orders)
      .where(inArray(orders.id, orderIds));
    const currentOrdersById = new Map(currentOrders.map((order) => [order.id, order]));
    const orderedCurrentOrders = orderIds
      .map((id) => currentOrdersById.get(id))
      .filter(Boolean) as any[];
    // ========== 运费分摊逻辑（核心！）：当传入actualFreight且有多个订单时，按重量比例分摊 ==========
    // 绝对禁止将总运费直接赋给每个子订单！
    let freightMap: Map<number, string> | null = null;
    let depositMap: Map<number, string> | null = null;
    const rawTotalFreight = extra.actualFreight;
    const rawTotalDeposit = extra.depositAmount;
    if (extra.actualFreight && orderedCurrentOrders.length > 1) {
      const totalFreightNum = safeParseFloat(extra.actualFreight);
      console.log(`[batchUpdateStatus] 运费分摊触发: totalFreight=${totalFreightNum}, orderCount=${orderedCurrentOrders.length}`);
      if (totalFreightNum > 0) {
        const totalWeight = orderedCurrentOrders.reduce((sum, order) => sum + safeParseFloat(order.weight), 0);
        const useWeightRatio = totalWeight > 0;
        freightMap = new Map();
        const totalCents = Math.round(totalFreightNum * 100);
        let allocatedCents = 0;
        orderedCurrentOrders.forEach((order, index) => {
          if (index === orderedCurrentOrders.length - 1) {
            const lastCents = totalCents - allocatedCents;
            freightMap!.set(order.id, String(lastCents / 100));
            return;
          }
          const shareCents = useWeightRatio
            ? Math.round((safeParseFloat(order.weight) / totalWeight) * totalCents)
            : Math.round(totalCents / orderedCurrentOrders.length);
          allocatedCents += shareCents;
          freightMap!.set(order.id, String(shareCents / 100));
        });
      }
      delete extra.actualFreight;
    }
    if (extra.depositAmount && orderedCurrentOrders.length > 1) {
      const totalDepositNum = safeParseFloat(extra.depositAmount);
      console.log(`[batchUpdateStatus] 押金分摊触发: totalDeposit=${totalDepositNum}, orderCount=${orderedCurrentOrders.length}`);
      if (totalDepositNum > 0) {
        const totalWeight = orderedCurrentOrders.reduce((sum, order) => sum + safeParseFloat(order.weight), 0);
        const useWeightRatio = totalWeight > 0;
        depositMap = new Map();
        const totalDepositCents = Math.round(totalDepositNum * 100);
        let allocatedDepositCents = 0;
        orderedCurrentOrders.forEach((order, index) => {
          if (index === orderedCurrentOrders.length - 1) {
            const lastCents = totalDepositCents - allocatedDepositCents;
            depositMap!.set(order.id, String(lastCents / 100));
            return;
          }
          const shareCents = useWeightRatio
            ? Math.round((safeParseFloat(order.weight) / totalWeight) * totalDepositCents)
            : Math.round(totalDepositCents / orderedCurrentOrders.length);
          allocatedDepositCents += shareCents;
          depositMap!.set(order.id, String(shareCents / 100));
        });
      }
      delete extra.depositAmount;
    }

    let resolvedVehicleId = extra.vehicleId;
    let resolvedDriverId = extra.driverId;
    if (!resolvedVehicleId && extra.plateNumber) {
      const [matchedVehicle] = await db.select({ id: vehicles.id }).from(vehicles)
        .where(eq(vehicles.plateNumber, extra.plateNumber)).limit(1);
      resolvedVehicleId = matchedVehicle?.id;
    }
    if (!resolvedDriverId && extra.driverName) {
      const [matchedDriver] = await db.select({ id: drivers.id }).from(drivers)
        .where(eq(drivers.name, extra.driverName)).limit(1);
      resolvedDriverId = matchedDriver?.id;
    }

    const activePreHoldAssigneeIds = new Set<number>();
    orderedCurrentOrders.forEach((order) => {
      const assigneeId = Number(order.preHoldAssignee);
      if (Number.isInteger(assigneeId) && assigneeId > 0) {
        activePreHoldAssigneeIds.add(assigneeId);
      }
    });
    const availableAssigneeRows = activePreHoldAssigneeIds.size > 0
      ? await db.select({ id: users.id }).from(users)
        .where(and(inArray(users.id, Array.from(activePreHoldAssigneeIds)), eq(users.isActive, true)))
      : [];
    const availableAssigneeIdSet = new Set(availableAssigneeRows.map((row) => row.id));

    const batchHoldReason = status === "on_hold"
      ? normalizeRequiredRemark(extra.holdReason, "搁置原因")
      : undefined;
    const batchReleaseReason = status !== "on_hold"
      ? (typeof extra.releaseReason === "string" ? extra.releaseReason.trim() : extra.releaseReason)
      : undefined;
    const batchTasks = orderedCurrentOrders.map(async (curOrder) => {
      if (!curOrder || curOrder.status === "settled") {
        return false;
      }
      const currentStatus = curOrder.status;
      const requestedNextStatus = resolveRequestedDispatchStatus({
        currentStatus,
        requestedStatus: status,
        businessType: curOrder.businessType,
        remarks: curOrder.remarks,
        subchainStage: curOrder.subchainStage,
        ltlSegmentMode: curOrder.ltlSegmentMode,
        parentId: curOrder.parentId,
        relatedParentIds: curOrder.relatedParentIds,
      });
      if (!requestedNextStatus) {
        return false;
      }
      const nextStatus = resolveOnHoldReleaseTargetStatus(curOrder, requestedNextStatus);
      const isEnteringOnHold = currentStatus !== "on_hold" && nextStatus === "on_hold";
      const isReleasingOnHold = currentStatus === "on_hold" && nextStatus !== "on_hold" && nextStatus !== "cancelled";
      const normalizedReleaseReason = isReleasingOnHold
        ? normalizeRequiredRemark(batchReleaseReason, "恢复原因")
        : undefined;
      const isSelfTransportOrder = isSelfBusinessType(curOrder.businessType);
      if (isSelfTransportOrder && nextStatus === "pending_approval") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "自运订单不允许进入审批流程" });
      }
      assertPendingAssignRouteMatchesBusinessType({
        currentStatus,
        nextStatus,
        businessType: curOrder.businessType,
      });
      assertOnHoldRestorePrerequisites(curOrder, nextStatus);

      const restoredAssigneeId = isReleasingOnHold
        ? (availableAssigneeIdSet.has(Number(curOrder.preHoldAssignee)) ? Number(curOrder.preHoldAssignee) : null)
        : null;
      const updateData: Record<string, any> = { status: nextStatus };
      if (isEnteringOnHold) {
        Object.assign(updateData, {
          holdReason: batchHoldReason,
          releaseReason: null,
          holdBy: ctx.user!.id,
          holdAt: new Date(),
          preHoldStatus: currentStatus,
          preHoldAssignee: curOrder.assignedDispatcherId ?? null,
        });
      } else if (isReleasingOnHold) {
        Object.assign(updateData, {
          releaseReason: normalizedReleaseReason,
          assignedDispatcherId: restoredAssigneeId,
        });
      }
      if (currentStatus === "pending_assign" && nextStatus !== "pending_assign") {
        Object.assign(updateData, resetEntryQueueMetadata());
      } else if (nextStatus === "pending_assign") {
        Object.assign(updateData, buildEntryQueueMetadata({
          reason: currentStatus === "on_hold" ? "returned" : "rerouted",
          fromStatus: currentStatus,
          returnedBy: ctx.user!.name || ctx.user!.username || null,
          returnReason: normalizedReleaseReason || null,
        }));
      }
      if (nextStatus === "dispatched") {
        updateData.dispatchDate = new Date();
        if (!depositMap && rawTotalDeposit && safeParseFloat(rawTotalDeposit) > 0) {
          updateData.depositStatus = extra.depositRefundable === false ? "not_refundable" : "paid";
        }
      } else if (nextStatus === "partial_delivered" || nextStatus === "delivered") {
        updateData.deliveryDate = new Date();
        if (!curOrder.loadingDate) {
          updateData.loadingDate = new Date();
        }
        if (nextStatus === "delivered" && updateData.deliveredQty === undefined) {
          updateData.deliveredQty = curOrder.packageCount != null ? String(curOrder.packageCount) : null;
        }
        if (nextStatus === "delivered" && updateData.remainingQty === undefined) {
          updateData.remainingQty = "0";
        }
      } else if (nextStatus === "signed") {
        updateData.signedDate = new Date();
      }
      for (const [key, value] of Object.entries(extra)) {
        if (value !== undefined) updateData[key] = value;
      }
      if (freightMap?.has(curOrder.id)) {
        const allocatedFreight = freightMap.get(curOrder.id)!;
        updateData.actualFreight = allocatedFreight;
        updateData.totalCost = allocatedFreight;
      } else if (freightMap) {
        delete updateData.actualFreight;
      }
      if (depositMap?.has(curOrder.id)) {
        updateData.depositAmount = depositMap.get(curOrder.id)!;
        updateData.depositStatus = extra.depositRefundable === false ? "not_refundable" : "paid";
      } else if (depositMap) {
        delete updateData.depositAmount;
      }
      if (isSelfTransportOrder) {
        Object.assign(updateData, buildSelfTransportDepositReset());
      } else if (resolvedVehicleId && !updateData.vehicleId) {
        updateData.vehicleId = resolvedVehicleId;
      }
      if (!isSelfTransportOrder && resolvedDriverId && !updateData.driverId) {
        updateData.driverId = resolvedDriverId;
      }

      await db.update(orders).set(updateData).where(eq(orders.id, curOrder.id));

      if (nextStatus === "dispatched") {
        try {
          const podDepositAmount = depositMap ? depositMap.get(curOrder.id) || null : (rawTotalDeposit || curOrder.depositAmount || null);
          await ensurePendingPodRecordForOrder(db, {
            id: curOrder.id,
            podOwnership: curOrder.podOwnership,
            depositAmount: podDepositAmount,
            businessType: curOrder.businessType,
          }, podDepositAmount);
        } catch (e) {
          console.error("Auto-create pod failed:", e);
        }
      }

      const currentBatchParentIds = getRelatedParentIds(curOrder || {});
      if (resolveLtlSubchainStage(curOrder || {}) === "delivery" && currentBatchParentIds.length > 0) {
        await refreshRelatedParentPodOwnership(db, currentBatchParentIds);
      }

      if (nextStatus === "pending_approval") {
        try {
          const remarkPart = extra.dispatcherRemark ? ` 备注：${extra.dispatcherRemark}` : "";
          await db.insert(approvals).values({
            orderId: curOrder.id,
            approvalType: "vehicle_quote",
            applicantId: ctx.user!.id,
            applicantName: ctx.user!.name || ctx.user!.username || "未知",
            requestedAmount: rawTotalFreight || null,
            previousStatus: "pending_vehicle",
            status: "pending",
            reason: `批量找车审批：车牌${extra.plateNumber || ""} 司机${extra.driverName || ""} 整组申请报价¥${rawTotalFreight || "0"} 押金${rawTotalDeposit || "0"}元${remarkPart}`,
          });
        } catch (e) {
          console.error("Auto-create approval failed:", e);
        }
      }

      // 为每个订单写入单条操作日志（确保getOrderTimeline能查到）
      const _statusLabelMap: Record<string, string> = {pending_assign:"待指派",pending_price:"待定价",pending_dispatch:"待调度",pending_vehicle:"待找车",pending_approval:"待审批",pending_inquiry:"待询价",inquiry_confirmed:"已询价",shipped:"已发运",dispatched:"已调度",in_transit:"运输中",delivered:"已送达",signed:"已签收",on_hold:"等通知",cancelled:"已取消"};
      const _logAction = isEnteringOnHold ? "status_change" : isReleasingOnHold ? "status_change" : "status_change";
      const _logChanges: Record<string, any> = { fromStatus: currentStatus, toStatus: nextStatus };
      if (isEnteringOnHold && batchHoldReason) _logChanges.holdReason = batchHoldReason;
      if (isReleasingOnHold && normalizedReleaseReason) _logChanges.releaseReason = normalizedReleaseReason;
      if (extra.reason) _logChanges.reason = extra.reason;
      await createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name || ctx.user!.username || undefined,
        action: _logAction,
        targetType: "order",
        targetId: String(curOrder.id),
        changes: _logChanges,
        description: (() => {
          if (isEnteringOnHold) return `进入等通知，原因：${batchHoldReason || "未填写"}`;
          if (isReleasingOnHold) return `从等通知恢复到${_statusLabelMap[nextStatus] || nextStatus}，原因：${normalizedReleaseReason || "未填写"}`;
          return `订单 #${curOrder.id} 状态变更为 ${_statusLabelMap[nextStatus] || nextStatus}`;
        })(),
      });

      return true;
    });

    const batchResults = await Promise.allSettled(batchTasks);
    const successCount = batchResults.filter((result) => result.status === "fulfilled" && result.value).length;
    batchResults.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`Batch update status failed for order ${orderedCurrentOrders[index]?.id}:`, result.reason);
      }
    });

    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "batch_status_change",
      targetType: "order",
      targetId: orderIds.join(","),
      description: `批量更新订单状态为 ${status}，共 ${successCount}/${orderIds.length} 个`,
    });
    return { success: true, count: successCount, total: orderIds.length };
  }),
  // 标记回单已寄出（外请调度员专用，权限细化）
  markPodSent: permissionProcedure(PERMISSIONS.POD_MARK_SENT).input(
    z.object({ orderId: z.number() }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const [currentOrder] = await db.select({
      podOwnership: orders.podOwnership,
    }).from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!currentOrder) {
      throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
    }
    if (currentOrder.podOwnership !== "current_order") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "当前订单不负责回单原件流转，请在实际负责的外请单上操作。" });
    }

    const now = new Date();
    const podRows = await db.select({
      id: podRecords.id,
      originalStatus: podRecords.originalStatus,
    }).from(podRecords).where(eq(podRecords.orderId, input.orderId)).limit(1);

    if (podRows[0]?.originalStatus === "received") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "该回单已财务确认收到，无需重复标记寄出。" });
    }

    if (podRows.length > 0) {
      await db.update(podRecords).set({
        originalStatus: "sent",
        originalSentAt: now,
        originalReceivedAt: null,
        originalReceivedBy: null,
      }).where(eq(podRecords.orderId, input.orderId));
    } else {
      await db.insert(podRecords).values({
        orderId: input.orderId,
        podOwnership: "current_order",
        originalStatus: "sent",
        originalSentAt: now,
      });
    }

    await db.update(orders).set({
      podStatus: "original_sent" as any,
      podSentDate: now,
      podDate: null,
    }).where(eq(orders.id, input.orderId));

    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "mark_pod_sent",
      targetType: "order",
      targetId: String(input.orderId),
      description: `标记订单#${input.orderId}回单已寄出`,
    });
    return { success: true };
  }),
  cancelPodSent: permissionProcedure(PERMISSIONS.POD_MARK_SENT).input(
    z.object({ orderId: z.number() }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const [currentOrder] = await db.select({
      podOwnership: orders.podOwnership,
      status: orders.status,
      podStatus: orders.podStatus,
    }).from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!currentOrder) {
      throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
    }
    if (currentOrder.podOwnership !== "current_order") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "当前订单不负责回单原件流转，请在实际负责的外请单上操作。" });
    }

    const podRows = await db.select({
      id: podRecords.id,
      originalStatus: podRecords.originalStatus,
    }).from(podRecords).where(eq(podRecords.orderId, input.orderId)).limit(1);

    if (!podRows[0]) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "当前订单尚未进入原件寄出环节，无需撤销寄出。" });
    }
    if (podRows[0].originalStatus === "received") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "该回单已财务确认收到，不能撤销寄出。" });
    }
    if (podRows[0].originalStatus !== "sent") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "只有已寄出的回单才可以撤销寄出。" });
    }

    await db.update(podRecords).set({
      originalStatus: "pending",
      originalSentAt: null,
      originalReceivedAt: null,
      originalReceivedBy: null,
    }).where(eq(podRecords.orderId, input.orderId));

    await db.update(orders).set({
      podStatus: "none" as any,
      podSentDate: null,
      podDate: null,
    }).where(eq(orders.id, input.orderId));

    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "cancel_pod_sent",
      targetType: "order",
      targetId: String(input.orderId),
      description: `撤销订单#${input.orderId}回单寄出标记`,
    });
    return { success: true };
  }),

  // 标记已结算（录单员专用，权限细化）
  markSettled: permissionProcedure(PERMISSIONS.ORDER_UPDATE_STATUS).input(
    z.object({ ids: z.array(z.number()) }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    await db.update(orders).set({
      status: "settled" as any,
    }).where(inArray(orders.id, input.ids));
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "mark_settled",
      targetType: "order",
      targetId: input.ids.join(","),
      description: `批量标记结算 ${input.ids.length} 笔订单`,
    });
    return { success: true };
  }),
  // 统计数据（首页卡片）
  stats: protectedProcedure.input(
    z.object({
      businessType: z.enum(["outsource", "self", "ltl"]).optional(),
    }).optional(),
  ).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return { total: 0, pendingAssign: 0, dispatching: 0, inTransit: 0, delivered: 0, urgent: 0, todayNew: 0 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const conditions: any[] = [];
    if (input?.businessType) {
      conditions.push(eq(orders.businessType, input.businessType));
    }
    const role = ctx.user?.role;
    if (role && !["admin", "cs_manager"].includes(role)) {
      if (["outsource_dispatcher", "ltl_dispatcher", "fleet_dispatcher", "field_manager"].includes(role)) {
        conditions.push(eq(orders.assignedDispatcherId, ctx.user!.id));
      } else if (role === "order_entry") {
        conditions.push(eq(orders.createdBy, ctx.user!.id));
      } else if (role === "ltl_cs") {
        conditions.push(or(eq(orders.businessType, "ltl"), eq(orders.createdBy, ctx.user!.id)));
      } else if (role === "chain_cs") {
        conditions.push(eq(orders.createdBy, ctx.user!.id));
      } else if (role === "finance_assistant") {
        conditions.push(inArray(orders.status, ["dispatched", "delivered", "signed", "settled"] as any[]));
      }
    }
    const baseWhere = conditions.length > 0 ? and(...conditions) : undefined;
    // 合并7次查询为单次 SUM(CASE WHEN) 查询，减少数据库往返
    const result = await db.select({
      total: count(),
      pendingAssign: sql<number>`SUM(CASE WHEN ${orders.status} IN ('pending_assign', 'pending_dispatch', 'pending_price', 'pending_inquiry') THEN 1 ELSE 0 END)`,
      dispatching: sql<number>`SUM(CASE WHEN ${orders.status} IN ('priced', 'pending_vehicle', 'pending_approval', 'inquiry_confirmed', 'dispatched', 'in_transit') THEN 1 ELSE 0 END)`,
      delivered: sql<number>`SUM(CASE WHEN ${orders.status} IN ('delivered', 'signed') THEN 1 ELSE 0 END)`,
      urgent: sql<number>`SUM(CASE WHEN ${orders.isUrgent} = true AND ${orders.status} NOT IN ('settled', 'cancelled') THEN 1 ELSE 0 END)`,
      todayNew: sql<number>`SUM(CASE WHEN ${orders.createdAt} >= ${today} THEN 1 ELSE 0 END)`,
    }).from(orders).where(baseWhere);
    return {
      total: result[0]?.total ?? 0,
      pendingAssign: Number(result[0]?.pendingAssign ?? 0),
      dispatching: Number(result[0]?.dispatching ?? 0),
      inTransit: 0,
      delivered: Number(result[0]?.delivered ?? 0),
      urgent: Number(result[0]?.urgent ?? 0),
      todayNew: Number(result[0]?.todayNew ?? 0),
    };
  }),
  // 退还押金（权限细化）
  refundDeposit: permissionProcedure(PERMISSIONS.POD_REFUND_DEPOSIT).input(
    z.object({ id: z.number() }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const row = await db.select({
      id: orders.id,
      parentId: orders.parentId,
      isMerged: orders.isMerged,
      mergedPlanNumber: orders.mergedPlanNumber,
      depositStatus: orders.depositStatus,
      depositAmount: orders.depositAmount,
    }).from(orders).where(eq(orders.id, input.id)).limit(1);
    if (!row[0]) throw new Error("订单不存在");

    const { refundableOrders } = await validateRefundableDepositScope(db, [row[0] as DepositScopeOrder]);
    const refundableIds = refundableOrders.map((order) => order.id);
    const refundedAt = new Date();
    const totalRefunded = refundableOrders.reduce((sum, order) => sum + safeParseFloat(order.depositAmount), 0);

    await db.update(orders)
      .set({ depositStatus: "refunded" as any, depositRefundDate: refundedAt })
      .where(inArray(orders.id, refundableIds));
    await db.update(podRecords)
      .set({ depositRefunded: true })
      .where(inArray(podRecords.orderId, refundableIds));

    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "update",
      targetType: "order",
      targetId: refundableIds.join(","),
      description: `退还押金 ${refundableOrders.length} 个订单，总额: ¥${totalRefunded.toFixed(2)}`,
    });
    return { success: true, count: refundableOrders.length, totalRefunded: totalRefunded.toFixed(2) };
  }),
  // 批量退还押金（合并组退押金）
  batchRefundDeposit: permissionProcedure(PERMISSIONS.POD_REFUND_DEPOSIT).input(
    z.object({ ids: z.array(z.number()).min(1) }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const rows = await db.select({
      id: orders.id,
      parentId: orders.parentId,
      isMerged: orders.isMerged,
      mergedPlanNumber: orders.mergedPlanNumber,
      depositStatus: orders.depositStatus,
      depositAmount: orders.depositAmount,
    }).from(orders).where(inArray(orders.id, input.ids)) as DepositScopeOrder[];

    const { refundableOrders } = await validateRefundableDepositScope(db, rows);
    const refundableIds = refundableOrders.map((order) => order.id);
    const refundedAt = new Date();
    const totalRefunded = refundableOrders.reduce((sum, order) => sum + safeParseFloat(order.depositAmount), 0);

    await db.update(orders)
      .set({ depositStatus: "refunded" as any, depositRefundDate: refundedAt })
      .where(inArray(orders.id, refundableIds));
    await db.update(podRecords)
      .set({ depositRefunded: true })
      .where(inArray(podRecords.orderId, refundableIds));

    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "update",
      targetType: "order",
      targetId: refundableIds.map((id) => `#${id}`).join(","),
      description: `批量退押金 ${refundableOrders.length} 个订单，总额: ¥${totalRefunded.toFixed(2)}`,
    });
    return { success: true, count: refundableOrders.length, totalRefunded: totalRefunded.toFixed(2) };
  }),
  // 上传货站开单图片（权限细化）
  uploadStationReceipt: permissionProcedure(PERMISSIONS.ORDER_UPDATE_STATUS).input(
    z.object({
      id: z.number(),
      stationReceiptUrl: z.string(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    await db.update(orders).set({
      stationReceiptUrl: input.stationReceiptUrl,
      stationReceiptUploadedAt: new Date(),
    }).where(eq(orders.id, input.id));
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "update",
      targetType: "order",
      targetId: String(input.id),
      description: `订单 #${input.id} 上传货站开单图片`,
    });
    return { success: true };
  }),
  // 获取调度员列表（供指挥台手动分配使用，不需要admin权限）
  getDispatchers: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("数据库不可用");
      const dispatchers = await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
          role: users.role,
          region: users.region,
        })
        .from(users)
        .where(
          and(
            inArray(users.role, ['outsource_dispatcher', 'fleet_dispatcher', 'ltl_dispatcher', 'field_manager']),
            eq(users.isActive, true)
          )
        );
      return dispatchers;
    }),
  // 单条删除订单
  delete: permissionProcedure(PERMISSIONS.ORDER_DELETE)
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库不可用");
      const order = await db.transaction(async (tx) => executeProtectedOrderDelete(tx, input.id));
      await createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "delete",
        targetType: "order",
        targetId: String(input.id),
        description: `删除订单 ${order.orderNumber || input.id}`,
      });
      return { success: true, deleted: true, id: input.id, orderNumber: order.orderNumber || null };
    }),
  // 订单退回上一流程
  rollbackStatus: permissionProcedure(PERMISSIONS.ORDER_ROLLBACK).input(
    z.object({
      id: z.number(),
      reason: z.string().min(1, "请填写退回原因"),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const transition = await db.transaction(async (tx) => {
      const [order] = await tx.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        parentId: orders.parentId,
        remarks: orders.remarks,
        depositStatus: orders.depositStatus,
        depositAmount: orders.depositAmount,
        depositRefundable: orders.depositRefundable,
      }).from(orders).where(eq(orders.id, input.id)).limit(1);
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
      }
      const currentStatus = String(order.status || "");
      if (currentStatus === "settled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "已结算的订单不允许退回，如需调整请联系管理员",
        });
      }
      const previousStatus = ROLLBACK_MAP[currentStatus];
      if (!previousStatus) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `当前状态"${STATUS_LABELS[currentStatus] || currentStatus}"不支持退回操作`,
        });
      }
      assertRollbackTarget(currentStatus, previousStatus);
      const rollbackClean = buildRollbackCleanUpdate(previousStatus);
      if ((STATUS_STAGE[currentStatus] ?? -1) >= 9 && (STATUS_STAGE[previousStatus] ?? -1) < 9 && order.depositStatus === "refunded") {
        const numericDepositAmount = Number(order.depositAmount ?? 0);
        rollbackClean.depositStatus = !Number.isFinite(numericDepositAmount) || numericDepositAmount <= 0
          ? ("none" as any)
          : order.depositRefundable === false
            ? ("not_refundable" as any)
            : ("paid" as any);
        rollbackClean.depositRefundDate = null;
        await tx.update(podRecords).set({ depositRefunded: false }).where(eq(podRecords.orderId, input.id));
      }
      if ((STATUS_STAGE[previousStatus] ?? -1) <= 3) {
        await deletePendingPodRecords(tx, [input.id]);
      }
      const updateResult = await tx.update(orders).set(rollbackClean).where(
        and(
          eq(orders.id, input.id),
          eq(orders.status, currentStatus as any),
        ),
      );
      assertMutationApplied(updateResult, ORDER_CONCURRENT_CHANGE_MESSAGE);
      const currentOrderParentIds = getRelatedParentIds(order);
      if (resolveLtlSubchainStage(order) === "delivery" && currentOrderParentIds.length > 0) {
        await refreshRelatedParentPodOwnership(tx, currentOrderParentIds);
      }
      return {
        orderNumber: order.orderNumber,
        fromStatus: currentStatus,
        toStatus: previousStatus,
      };
    });
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name ?? ctx.user!.username ?? undefined,
      action: "rollback",
      targetType: "order",
      targetId: String(input.id),
      changes: {
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        reason: input.reason,
      },
      description: `订单 ${transition.orderNumber} 退回：${STATUS_LABELS[transition.fromStatus] || transition.fromStatus} → ${STATUS_LABELS[transition.toStatus] || transition.toStatus}，原因：${input.reason}`,
    });
    return {
      success: true,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      fromLabel: STATUS_LABELS[transition.fromStatus] || transition.fromStatus,
      toLabel: STATUS_LABELS[transition.toStatus] || transition.toStatus,
    };
  }),
  // 批量退回订单
  batchRollback: permissionProcedure(PERMISSIONS.ORDER_ROLLBACK)
    .input(z.object({
      ids: z.array(z.number()).min(1),
      reason: z.string().min(1, "请填写退回原因"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库不可用");
      const uniqueIds = Array.from(new Set(input.ids.filter((id) => Number.isInteger(id) && id > 0)));
      let successCount = 0;
      let skipCount = 0;
      const results: { id: number; orderNumber: string | null; success: boolean; fromLabel?: string; toLabel?: string; error?: string }[] = [];
      for (const id of uniqueIds) {
        try {
          const transition = await db.transaction(async (tx) => {
            const [order] = await tx.select({
              id: orders.id,
              orderNumber: orders.orderNumber,
              status: orders.status,
              parentId: orders.parentId,
              remarks: orders.remarks,
              depositStatus: orders.depositStatus,
              depositAmount: orders.depositAmount,
              depositRefundable: orders.depositRefundable,
            }).from(orders).where(eq(orders.id, id)).limit(1);
            if (!order) {
              throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
            }
            const currentStatus = String(order.status || "");
            if (currentStatus === "settled") {
              throw new TRPCError({ code: "BAD_REQUEST", message: "已结算的订单不允许退回" });
            }
            const previousStatus = ROLLBACK_MAP[currentStatus];
            if (!previousStatus) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `状态"${STATUS_LABELS[currentStatus] || currentStatus}"不支持退回`,
              });
            }
            assertRollbackTarget(currentStatus, previousStatus);
            const rollbackClean = buildRollbackCleanUpdate(previousStatus);
            if ((STATUS_STAGE[currentStatus] ?? -1) >= 9 && (STATUS_STAGE[previousStatus] ?? -1) < 9 && order.depositStatus === "refunded") {
              const numericDepositAmount = Number(order.depositAmount ?? 0);
              rollbackClean.depositStatus = !Number.isFinite(numericDepositAmount) || numericDepositAmount <= 0
                ? ("none" as any)
                : order.depositRefundable === false
                  ? ("not_refundable" as any)
                  : ("paid" as any);
              rollbackClean.depositRefundDate = null;
              await tx.update(podRecords).set({ depositRefunded: false }).where(eq(podRecords.orderId, id));
            }
            if ((STATUS_STAGE[previousStatus] ?? -1) <= 3) {
              await deletePendingPodRecords(tx, [id]);
            }
            const updateResult = await tx.update(orders).set(rollbackClean).where(
              and(
                eq(orders.id, id),
                eq(orders.status, currentStatus as any),
              ),
            );
            assertMutationApplied(updateResult, ORDER_CONCURRENT_CHANGE_MESSAGE);
            const currentOrderParentIds = getRelatedParentIds(order);
            if (resolveLtlSubchainStage(order) === "delivery" && currentOrderParentIds.length > 0) {
              await refreshRelatedParentPodOwnership(tx, currentOrderParentIds);
            }
            return {
              id,
              orderNumber: order.orderNumber,
              fromStatus: currentStatus,
              toStatus: previousStatus,
            };
          });
          await createOperationLog({
            userId: ctx.user!.id,
            userName: ctx.user!.name ?? ctx.user!.username ?? undefined,
            action: "rollback",
            targetType: "order",
            targetId: String(id),
            changes: {
              fromStatus: transition.fromStatus,
              toStatus: transition.toStatus,
              reason: input.reason,
              batchOperation: true,
            },
            description: `[批量退回] 订单 ${transition.orderNumber} 退回：${STATUS_LABELS[transition.fromStatus] || transition.fromStatus} → ${STATUS_LABELS[transition.toStatus] || transition.toStatus}，原因：${input.reason}`,
          });
          successCount++;
          results.push({
            id,
            orderNumber: transition.orderNumber,
            success: true,
            fromLabel: STATUS_LABELS[transition.fromStatus] || transition.fromStatus,
            toLabel: STATUS_LABELS[transition.toStatus] || transition.toStatus,
          });
        } catch (error: any) {
          skipCount++;
          results.push({
            id,
            orderNumber: null,
            success: false,
            error: error?.message || "当前订单不支持退回",
          });
        }
      }
      return { success: true, successCount, skipCount, total: uniqueIds.length, results };
    }),
  // 更新订单字段（不改变状态，用于OCR自动填写和手动编辑货站信息）
  updateOrderFields: protectedProcedure.input(
    z.object({
      id: z.number(),
      freightWaybillNumber: z.string().optional(),
      inquiryPhone: z.string().optional(),
      freightStationName: z.string().optional(),
      stationReceiptUrl: z.string().optional(),
      ltlUnitPrice: optionalDecimal(),
      ltlDeliveryFee: optionalDecimal(),
      ltlOtherFee: optionalDecimal(),
      actualFreight: optionalDecimal(),
      deliveryFee: optionalDecimal(),
      extraFee: optionalDecimal(),
      totalCost: optionalDecimal(),
      dispatchPrice: optionalDecimal(),
      weight: z.string().optional(),
      isLargeSlab: z.boolean().optional(),
      shippingNote: z.string().optional(),
      receivingNote: z.string().optional(),
      receivingStatus: z.enum(["receivable", "wait_notice", "not_receivable"]).optional(),
      expectedReceiveAt: z.string().optional(),
      nextFollowUpAt: z.string().optional(),
      receivingReason: z.string().optional(),
      dispatcherRemark: z.string().optional(),
      businessType: z.enum(["outsource", "self", "ltl"]).optional(),
      isUrgent: z.boolean().optional(),
      urgentReason: z.string().optional(),
      podStatus: z.enum(["none", "uploaded", "original_sent", "original_received"]).optional(),
      podTrackingNumber: z.string().optional(),
      podSentDate: z.string().optional(),
      // 车辆和司机信息（确认派车时填写）
      plateNumber: z.string().optional(),
      driverName: z.string().optional(),
      driverPhone: z.string().optional(),
      driverIdCard: z.string().optional(),
      reassignReason: z.string().optional(),
      ltlCustomerPickup: z.boolean().optional(),
      ltlCustomerSelfDeliverConfirmed: z.boolean().optional(),
      ltlPickupOutsourced: z.boolean().optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const {
      id,
      driverIdCard: _driverIdCard,
      reassignReason,
      ltlCustomerPickup,
      ltlCustomerSelfDeliverConfirmed,
      ltlPickupOutsourced,
      ...fields
    } = input; // driverIdCard及零担模式操作字段不在orders表中，排除
    const updateData: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updateData[k] = v;
    }
    if (updateData.podStatus !== undefined || updateData.podSentDate !== undefined) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "回单原件状态必须通过专用回单流程操作，不能通过订单通用编辑直接修改。",
      });
    }
    if (Object.keys(updateData).length === 0) return { success: true };
    const [currentOrder] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!currentOrder) {
      throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
    }
    const isVehicleOrDriverChanged = ["plateNumber", "driverName", "driverPhone", "driverId", "vehicleId"].some((field) => {
      if (!(field in updateData)) return false;
      return (updateData as Record<string, unknown>)[field] !== (currentOrder as Record<string, unknown>)[field];
    });
    const effectiveBusinessType = updateData.businessType ?? currentOrder.businessType;
    if (effectiveBusinessType === "ltl") {
      if (updateData.weight !== undefined) {
        updateData.weight = normalizeLtlWeightField(updateData.weight);
      }
      if (updateData.businessType === "ltl" && currentOrder.businessType !== "ltl" && updateData.weight === undefined) {
        updateData.weight = normalizeLtlWeightField(currentOrder.weight);
      }
    }
    if (currentOrder.status === "dispatched" && isVehicleOrDriverChanged && currentOrder.plateNumber) {
      const normalizedReason = reassignReason?.trim();
      if (!normalizedReason) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "已派车订单修改车牌或司机时，必须填写改派原因。" });
      }
      await createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? ctx.user!.username ?? undefined,
        action: "reassign_vehicle_driver",
        targetType: "order",
        targetId: String(id),
        changes: {
          oldPlateNumber: currentOrder.plateNumber ?? null,
          oldDriverName: currentOrder.driverName ?? null,
          newPlateNumber: updateData.plateNumber ?? currentOrder.plateNumber ?? null,
          newDriverName: updateData.driverName ?? currentOrder.driverName ?? null,
          reassignReason: normalizedReason,
          operatorName: ctx.user!.name ?? ctx.user!.username ?? null,
          operatedAt: new Date().toISOString(),
        },
        description: `订单 #${id} 改派车辆/司机：${currentOrder.plateNumber || "未填车牌"}/${currentOrder.driverName || "未填司机"} → ${updateData.plateNumber ?? currentOrder.plateNumber ?? "未填车牌"}/${updateData.driverName ?? currentOrder.driverName ?? "未填司机"}，原因：${normalizedReason}`,
      });
    }

    if (ltlCustomerPickup !== undefined || ltlCustomerSelfDeliverConfirmed !== undefined) {
      if (effectiveBusinessType !== "ltl") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "仅零担订单支持客户自提或客户自送到站确认。" });
      }
    }
    if (ltlCustomerPickup !== undefined) {
      const nextRemarksBase = updateData.remarks ?? currentOrder.remarks;
      updateData.remarks = applyLtlRemarkTag({
        remarks: nextRemarksBase,
        tag: LTL_CUSTOMER_PICKUP_TAG,
        enabled: ltlCustomerPickup,
        operatorName: ctx.user!.name ?? ctx.user!.username ?? null,
      });
      if (ltlCustomerPickup) {
        updateData.podOwnership = "none";
      }
    }
    if (ltlCustomerSelfDeliverConfirmed !== undefined) {
      const hasDispatchRecord = Boolean(
        updateData.dispatchDate
        || currentOrder.dispatchDate
        || updateData.plateNumber
        || currentOrder.plateNumber
        || updateData.driverName
        || currentOrder.driverName,
      );
      if (ltlCustomerSelfDeliverConfirmed && hasDispatchRecord) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "存在派车记录的零担订单不能标记为客户自送到站，请先取消派车后再操作。" });
      }
      const nextRemarksBase = updateData.remarks ?? currentOrder.remarks;
      updateData.remarks = applyLtlRemarkTag({
        remarks: nextRemarksBase,
        tag: LTL_CUSTOMER_SELF_DELIVER_TAG,
        enabled: ltlCustomerSelfDeliverConfirmed,
        operatorName: ctx.user!.name ?? ctx.user!.username ?? null,
      });
      if (ltlCustomerSelfDeliverConfirmed) {
        updateData.receivingConfirmedAt = updateData.receivingConfirmedAt ?? new Date();
        updateData.receivingConfirmedBy = ctx.user!.id;
        updateData.receivingConfirmedByName = ctx.user!.name ?? ctx.user!.username ?? "未知";
      }
    }
    // 零担前段外请标记
    if (ltlPickupOutsourced !== undefined) {
      if (effectiveBusinessType !== "ltl") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "仅零担订单支持前段外请标记。" });
      }
      updateData.ltlPickupOutsourced = ltlPickupOutsourced;
      if (ltlPickupOutsourced) {
        const nextRemarksBase = updateData.remarks ?? currentOrder.remarks;
        updateData.remarks = applyLtlRemarkTag({
          remarks: nextRemarksBase,
          tag: "【前段已转外请】",
          enabled: true,
          operatorName: ctx.user!.name ?? ctx.user!.username ?? null,
        });
      }
    }
    // 当更新车牌号时，自动关联vehicleId和driverId
    if (updateData.plateNumber) {
      try {
        const vRows = await db.select({ id: vehicles.id }).from(vehicles)
          .where(eq(vehicles.plateNumber, updateData.plateNumber)).limit(1);
        if (vRows[0]) updateData.vehicleId = vRows[0].id;
      } catch (e) { /* ignore */ }
    }
    if (updateData.driverName) {
      try {
        const dRows = await db.select({ id: drivers.id }).from(drivers)
          .where(eq(drivers.name, updateData.driverName)).limit(1);
        if (dRows[0]) updateData.driverId = dRows[0].id;
      } catch (e) { /* ignore */ }
    }
    // 如果切换了业务类型，需要校验状态限制 + 合并订单统一修改
    if (updateData.businessType) {
      if (isMergedChildOrder(currentOrder)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "子订单（指引单）不允许修改业务类型，请在主订单上统一修改。",
        });
      }
      if (!BUSINESS_TYPE_EDITABLE_STATUSES.includes(currentOrder.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `订单当前状态为"${currentOrder.status}"，不允许修改业务类型。请先将订单退回到初始状态后再修改。`,
        });
      }
      // 如果业务类型没有实际变化，跳过后续处理
      if (currentOrder.businessType === updateData.businessType) {
        delete updateData.businessType;
      } else {
        const newBizType = updateData.businessType;
        const destCity = currentOrder.destinationCity;
        let newDispatcherId: number | null = null;
        let newRegion: string | null = null;
        if (destCity && (newBizType === "outsource" || newBizType === "self")) {
          const region = await autoAssignDispatcher(destCity);
          if (region) {
            newDispatcherId = region.dispatcherId;
            newRegion = `${region.province}${region.city ? '-' + region.city : ''}`;
          }
        }
        updateData.assignedDispatcherId = newDispatcherId;
        updateData.autoAssignedRegion = newRegion;
        updateData.autoAssignedAt = newDispatcherId ? new Date() : null;
        // 业务类型切换后统一退回待指派，由录单台重新分流承接
        updateData.status = "pending_assign";
        const siblingOrders = currentOrder.isMerged
          ? await db.select({ id: orders.id, status: orders.status, businessType: orders.businessType })
              .from(orders)
              .where(eq(orders.parentId, id))
          : currentOrder.mergedPlanNumber
            ? await db.select({ id: orders.id, status: orders.status, businessType: orders.businessType })
                .from(orders)
                .where(and(eq(orders.mergedPlanNumber, currentOrder.mergedPlanNumber), ne(orders.id, id)))
            : [];
        const blockedSiblings = siblingOrders.filter((s) => !BUSINESS_TYPE_EDITABLE_STATUSES.includes(s.status));
        if (blockedSiblings.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "当前合并组中存在已进入调度流程的子订单，无法统一修改业务类型。请先将所有子订单退回到初始状态。",
          });
        }
        // 同步更新同组所有子单的业务类型、状态和调度员
        for (const sibling of siblingOrders) {
          if (sibling.businessType !== newBizType) {
            const sibUpdateData: Record<string, any> = {
              businessType: newBizType,
              status: updateData.status,
              assignedDispatcherId: newDispatcherId,
              autoAssignedRegion: newRegion,
              autoAssignedAt: newDispatcherId ? new Date() : null,
            };
            await db.update(orders).set(sibUpdateData).where(eq(orders.id, sibling.id));
            await createOperationLog({
              userId: ctx.user!.id,
              userName: ctx.user!.name ?? ctx.user!.username ?? undefined,
              action: "update",
              targetType: "order",
              targetId: String(sibling.id),
              changes: { businessType: newBizType, reason: currentOrder.isMerged ? `主订单#${id}统一修改业务类型` : `合并计划号${currentOrder.mergedPlanNumber}统一修改业务类型` },
              description: `合并订单统一修改业务类型为${newBizType}`,
            });
          }
        }
      }
    }

    if (hasStructuredReceivingChanges(updateData)) {
      if (!RECEIVING_EDITABLE_STATUSES.includes(currentOrder.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `订单当前状态为"${currentOrder.status}"，不允许修改收货确认信息。请先退回到可编辑阶段后再修改。`,
        });
      }
      updateData.expectedReceiveAt = parseOptionalDateInput(updateData.expectedReceiveAt, "预计收货时间");
      updateData.nextFollowUpAt = parseOptionalDateInput(updateData.nextFollowUpAt, "下次跟进时间");
      const effectiveReceivingStatus = updateData.receivingStatus ?? currentOrder.receivingStatus;
      const effectiveReceivingReason = (updateData.receivingReason ?? currentOrder.receivingReason ?? "").trim();
      const effectiveFollowUpAt = updateData.nextFollowUpAt !== undefined ? updateData.nextFollowUpAt : currentOrder.nextFollowUpAt;
      if (effectiveReceivingStatus === "wait_notice" && !effectiveFollowUpAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "“等通知”必须填写下次跟进时间。" });
      }
      if (effectiveReceivingStatus === "not_receivable" && !effectiveReceivingReason) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "“暂不收货”必须填写原因。" });
      }
      if (effectiveReceivingStatus === "receivable") {
        if (updateData.nextFollowUpAt === undefined) updateData.nextFollowUpAt = null;
        if (updateData.receivingReason === undefined) updateData.receivingReason = null;
      }
      updateData.receivingConfirmedAt = new Date();
      updateData.receivingConfirmedBy = ctx.user!.id;
      updateData.receivingConfirmedByName = ctx.user!.name ?? ctx.user!.username ?? "未知";
    }
    // 自动计算总费用：当更新了任何费用相关字段时自动重算totalCost和dispatchPrice
    const costFieldsChanged = [
      "ltlUnitPrice",
      "actualFreight",
      "deliveryFee",
      "extraFee",
      "ltlDeliveryFee",
      "ltlOtherFee",
      "dispatchPrice",
      "weight",
    ].some((field) => updateData[field] !== undefined);
    if (costFieldsChanged) {
      const row = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      if (row[0]) {
        const effectiveRowBusinessType = updateData.businessType ?? row[0].businessType;
        const isLtl = effectiveRowBusinessType === 'ltl';
        const currentWeight = resolveWeightInTons(effectiveRowBusinessType, updateData.weight ?? row[0].weight);
        // 如果更新了重量，同步更新orders表的weight
        // (weight已在updateData中，会被后续的update语句写入)
        
        // 如果更新了单价，先计算运费
        if (isLtl && updateData.ltlUnitPrice !== undefined) {
          const unitPrice = safeParseFloat(updateData.ltlUnitPrice);
          const freight = Math.round(unitPrice * currentWeight * 100) / 100;
          updateData.actualFreight = String(freight);
        }
        // 使用新值或已有值计算总费用
        const freight = safeParseFloat(updateData.actualFreight || row[0].actualFreight);
        const deliveryFee = safeParseFloat(updateData.deliveryFee || row[0].deliveryFee);
        const extraFee = safeParseFloat(updateData.extraFee || row[0].extraFee);
        const ltlDeliveryFee = safeParseFloat(updateData.ltlDeliveryFee || row[0].ltlDeliveryFee);
        const ltlOtherFee = safeParseFloat(updateData.ltlOtherFee || row[0].ltlOtherFee);
        // totalCost = 运费 + 送货费 + 其他费用
        const total = freight + deliveryFee + extraFee + ltlDeliveryFee + ltlOtherFee;
        updateData.totalCost = String(Math.round(total * 100) / 100);
        // 零担订单：同步更新dispatchPrice（显示用的总价字段）
        if (isLtl) {
          const ltlTotal = freight + safeParseFloat(updateData.ltlDeliveryFee || row[0].ltlDeliveryFee) + safeParseFloat(updateData.ltlOtherFee || row[0].ltlOtherFee);
          updateData.dispatchPrice = String(Math.round(ltlTotal * 100) / 100);
        }
      }
    }
    if (updateData.stationReceiptUrl) {
      updateData.stationReceiptUploadedAt = new Date();
    }
    // 如果修改了shippingNote或receivingNote，先查旧值记录变更日志
    const noteFields: ("shippingNote" | "receivingNote")[] = ["shippingNote", "receivingNote"];
    const changedNotes = noteFields.filter(f => updateData[f] !== undefined);
    let oldNoteValues: Record<string, string | null> = {};
    if (changedNotes.length > 0) {
      const existingRow = await db.select({ shippingNote: orders.shippingNote, receivingNote: orders.receivingNote }).from(orders).where(eq(orders.id, id)).limit(1);
      if (existingRow[0]) {
        oldNoteValues = { shippingNote: existingRow[0].shippingNote, receivingNote: existingRow[0].receivingNote };
      }
    }
    // 先查询旧记录用于字段级变更对比
    const [oldRecordForFieldTrack] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    const fieldLevelChanges = oldRecordForFieldTrack ? trackFieldChanges(oldRecordForFieldTrack as unknown as Record<string, unknown>, updateData) : [];
    
    await db.update(orders).set(updateData).where(eq(orders.id, id));

    const refreshedRows = await db.select({
      id: orders.id,
      remarks: orders.remarks,
      status: orders.status,
      parentId: orders.parentId,
      relatedParentIds: orders.relatedParentIds,
      dispatchDate: orders.dispatchDate,
      plateNumber: orders.plateNumber,
      driverName: orders.driverName,
      receivingConfirmedAt: orders.receivingConfirmedAt,
      ltlFinalStation: orders.ltlFinalStation,
      podOwnership: orders.podOwnership,
      depositAmount: orders.depositAmount,
      businessType: orders.businessType,
    }).from(orders).where(eq(orders.id, id)).limit(1);
    const refreshedOrder = refreshedRows[0];
    if (refreshedOrder && refreshedOrder.businessType === "ltl") {
      const relatedParentIds = getRelatedParentIds({
        parentId: refreshedOrder.id,
        relatedParentIds: refreshedOrder.relatedParentIds,
        remarks: refreshedOrder.remarks,
      });
      await refreshRelatedParentPodOwnership(db, relatedParentIds);
      if (hasLtlCustomerPickupTag(refreshedOrder.remarks)) {
        await clearPodArtifactsForOrder(db, id);
      }
    }
    // 记录备注变更日志
    for (const field of changedNotes) {
      const oldVal = oldNoteValues[field] ?? null;
      const newVal = updateData[field] ?? null;
      if (oldVal !== newVal) {
        await db.insert(noteChangeLogs).values({
          orderId: id,
          field,
          oldValue: oldVal,
          newValue: newVal as string,
          changedByUserId: ctx.user!.id,
          changedByUserName: ctx.user!.name ?? ctx.user!.username ?? "未知",
        });
      }
    }
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name ?? ctx.user!.username ?? undefined,
      action: "update",
      targetType: "order",
      targetId: String(id),
      changes: fieldLevelChanges.length > 0 ? { fieldChanges: fieldLevelChanges, rawUpdate: updateData } : updateData,
      description: fieldLevelChanges.length > 0
        ? `更新订单 #${id}：${fieldLevelChanges.map(c => c.label).join("、")}`
        : `更新订单 #${id} 字段: ${Object.keys(updateData).join(", ")}`,
    });
    return { success: true };
  }),
  // 根据车牌号查询车型信息（用于派车表单自动带出）
  getVehicleByPlate: protectedProcedure.input(
    z.object({ plateNumber: z.string().min(1) }),
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.plateNumber, input.plateNumber.trim())).limit(1);
    if (!vehicle) return null;
    return {
      vehicleLength: vehicle.vehicleLength || null,
      vehicleModel: vehicle.vehicleModel || null,
      standardCapacity: vehicle.standardCapacity || null,
    };
  }),
  // 批量撤销零担派车批次
  batchDeleteLtlBatches: permissionProcedure(PERMISSIONS.LTL_ARRANGE_SHIP).input(
    z.object({ batchIds: z.array(z.number()).min(1, "至少选择一个批次") }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    let deletedCount = 0;
    let orderRevertedCount = 0;
    for (const batchId of input.batchIds) {
      // 查找该批次关联的订单
      const batchOrders = await db.select({ orderId: ltlDispatchBatchOrders.orderId })
        .from(ltlDispatchBatchOrders).where(eq(ltlDispatchBatchOrders.batchId, batchId));
      // 将 dispatched 状态的订单回退为 inquiry_confirmed，并清空车辆信息
      for (const { orderId } of batchOrders) {
        const [order] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1);
        if (order && ["dispatched", "shipped"].includes(order.status)) {
          await db.update(orders).set({
            status: "inquiry_confirmed",
            plateNumber: null,
            driverName: null,
            driverPhone: null,
          }).where(eq(orders.id, orderId));
          orderRevertedCount++;
        }
      }
      // 删除批次关联订单
      await db.delete(ltlDispatchBatchOrders).where(eq(ltlDispatchBatchOrders.batchId, batchId));
      // 删除批次
      await db.delete(ltlDispatchBatches).where(eq(ltlDispatchBatches.id, batchId));
      deletedCount++;
    }
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "delete",
      targetType: "ltl_dispatch_batch",
      targetId: input.batchIds[0],
      description: `批量撤销 ${deletedCount} 个零担派车批次，${orderRevertedCount} 个订单回退为已询价`,
    });
    return { deletedCount, orderRevertedCount };
  }),
  // ============================================================
  // 零担派车批次管理
  // ============================================================
  // 创建零担派车批次（选择车辆+司机，分配订单，权限细化）
  createLtlBatch: permissionProcedure(PERMISSIONS.LTL_ARRANGE_SHIP).input(
    z.object({
      plateNumber: z.string().min(1, "车牌号不能为空"),
      driverName: z.string().min(1, "司机姓名不能为空"),
      driverPhone: z.string().optional(),
      dispatchDate: z.string().optional(), // ISO date string
      orderIds: z.array(z.number()).min(1, "至少选择一个订单"),
      remarks: z.array(z.object({
        orderId: z.number(),
        remark: z.string().optional(),
      })).optional(),
      remark: z.string().optional(),
      vehicleLength: z.string().optional(), // 车长
      vehicleModel: z.string().optional(),  // 车型
      capacity: z.string().optional(),      // 载重吨位
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    // 1. 自动匹配或创建车辆
    let vehicle = await db.select().from(vehicles).where(eq(vehicles.plateNumber, input.plateNumber)).limit(1);
    if (vehicle.length === 0) {
      await db.insert(vehicles).values({
        plateNumber: input.plateNumber,
        vehicleType: "outsource",
        ...(input.vehicleLength ? { vehicleLength: input.vehicleLength } : {}),
        ...(input.vehicleModel ? { vehicleModel: input.vehicleModel } : {}),
        ...(input.capacity ? { standardCapacity: input.capacity } : {}),
      });
    } else if (input.vehicleLength || input.vehicleModel || input.capacity) {
      // 更新已有车辆的车型信息
      const vehicleUpdate: any = {};
      if (input.vehicleLength) vehicleUpdate.vehicleLength = input.vehicleLength;
      if (input.vehicleModel) vehicleUpdate.vehicleModel = input.vehicleModel;
      if (input.capacity) vehicleUpdate.standardCapacity = input.capacity;
      await db.update(vehicles).set(vehicleUpdate).where(eq(vehicles.plateNumber, input.plateNumber));
    }
    // 2. 自动匹配或创建司机
    const existingDriver = await db.select().from(drivers).where(eq(drivers.name, input.driverName)).limit(1);
    if (existingDriver.length === 0) {
      await db.insert(drivers).values({
        name: input.driverName,
        phone: input.driverPhone || null,
        driverType: "outsource",
        commonPlateNumber: input.plateNumber,
      });
    } else if (input.driverPhone && existingDriver[0].phone !== input.driverPhone) {
      // 更新司机电话
      await db.update(drivers).set({ phone: input.driverPhone }).where(eq(drivers.id, existingDriver[0].id));
    }
    // 3. 生成批次号 LTL + 日期 + 3位序号
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `LTL${dateStr}`;
    const countResult = await db.select({ cnt: count() }).from(ltlDispatchBatches).where(like(ltlDispatchBatches.batchCode, `${prefix}%`));
    const seq = String((countResult[0]?.cnt ?? 0) + 1).padStart(3, "0");
    const batchCode = `${prefix}${seq}`;
    // 4. 创建批次
    const batchResult = await db.insert(ltlDispatchBatches).values({
      batchCode,
      plateNumber: input.plateNumber.trim(),
      driverName: input.driverName.trim(),
      driverPhone: input.driverPhone?.trim() || null,
      dispatchDate: input.dispatchDate ? new Date(input.dispatchDate) : new Date(),
      remark: input.remark || null,
      vehicleLength: input.vehicleLength || null,
      vehicleModel: input.vehicleModel || null,
      capacity: input.capacity ? input.capacity : null,
      createdBy: ctx.user!.id,
      createdByName: ctx.user!.name || ctx.user!.username || null,
    });
    const batchId = batchResult[0].insertId;
    // 5. 关联订单到批次 + 自动推进状态为 dispatched + 创建回单记录
    const remarkMap = new Map((input.remarks || []).map(r => [r.orderId, r.remark]));
    let statusUpdatedCount = 0;
    let podCreatedCount = 0;
    for (let i = 0; i < input.orderIds.length; i++) {
      const orderId = input.orderIds[i];
      await db.insert(ltlDispatchBatchOrders).values({
        batchId,
        orderId,
        remark: remarkMap.get(orderId) || null,
        sortOrder: i + 1,
      });
      // 查询当前订单状态
      const [currentOrder] = await db.select({ id: orders.id, status: orders.status, depositAmount: orders.depositAmount }).from(orders).where(eq(orders.id, orderId)).limit(1);
      // 更新订单的车辆、司机信息 + 自动推进状态为 dispatched
      const updateData: any = {
        plateNumber: input.plateNumber.trim(),
        driverName: input.driverName.trim(),
        driverPhone: input.driverPhone?.trim() || undefined,
      };
      // 只有 inquiry_confirmed / shipped 状态的订单才自动推进为 dispatched
      if (currentOrder && ["inquiry_confirmed", "shipped"].includes(currentOrder.status)) {
        updateData.status = "dispatched";
        statusUpdatedCount++;
      }
      await db.update(orders).set(updateData).where(eq(orders.id, orderId));
      // 自动创建回单记录（如果还没有）
      try {
        const existingPod = await db.select({ id: podRecords.id }).from(podRecords)
          .where(eq(podRecords.orderId, orderId)).limit(1);
        if (existingPod.length === 0) {
          await db.insert(podRecords).values({
            orderId,
            originalStatus: "pending",
            depositAmount: currentOrder?.depositAmount || null,
          });
          podCreatedCount++;
        }
      } catch (e) {
        console.error(`创建回单记录失败 orderId=${orderId}:`, e);
      }
    }
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "create",
      targetType: "ltl_dispatch_batch",
      targetId: String(batchId),
      changes: { batchCode, plateNumber: input.plateNumber, driverName: input.driverName, orderCount: input.orderIds.length, statusUpdatedCount, podCreatedCount },
      description: `创建零担派车批次 ${batchCode}，车牌 ${input.plateNumber}，司机 ${input.driverName}，${input.orderIds.length} 个订单，${statusUpdatedCount} 个自动推进为已发运`,
    });
    return { batchId, batchCode, statusUpdatedCount, podCreatedCount };
  }),
  // 查询零担派车批次列表
  listLtlBatches: protectedProcedure.input(
    z.object({
      page: z.number().default(1),
      pageSize: z.number().default(50),
      keyword: z.string().optional(),
    }).optional(),
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { items: [], total: 0 };
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 50;
    const offset = (page - 1) * pageSize;
    const conditions: any[] = [];
    if (input?.keyword) {
      conditions.push(
        or(
          like(ltlDispatchBatches.batchCode, `%${input.keyword}%`),
          like(ltlDispatchBatches.plateNumber, `%${input.keyword}%`),
          like(ltlDispatchBatches.driverName, `%${input.keyword}%`),
        )
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [items, totalResult] = await Promise.all([
      db.select().from(ltlDispatchBatches).where(where).orderBy(desc(ltlDispatchBatches.createdAt)).limit(pageSize).offset(offset),
      db.select({ cnt: count() }).from(ltlDispatchBatches).where(where),
    ]);
    return { items, total: totalResult[0]?.cnt ?? 0 };
  }),
  // 查询某批次下的订单详情
  getLtlBatchDetail: protectedProcedure.input(
    z.object({ batchId: z.number() }),
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { batch: null, orders: [] };
    const [batch] = await db.select().from(ltlDispatchBatches).where(eq(ltlDispatchBatches.id, input.batchId)).limit(1);
    if (!batch) return { batch: null, orders: [] };
    // 查询关联订单
    const batchOrders = await db.select({
      batchOrderId: ltlDispatchBatchOrders.id,
      orderId: ltlDispatchBatchOrders.orderId,
      remark: ltlDispatchBatchOrders.remark,
      sortOrder: ltlDispatchBatchOrders.sortOrder,
    }).from(ltlDispatchBatchOrders).where(eq(ltlDispatchBatchOrders.batchId, input.batchId)).orderBy(asc(ltlDispatchBatchOrders.sortOrder));
    // 查询订单详情
    const orderIds = batchOrders.map(bo => bo.orderId);
    if (orderIds.length === 0) return { batch, orders: [] };
    const orderList = await db.select().from(orders).where(inArray(orders.id, orderIds));
    const orderMap = new Map(orderList.map(o => [o.id, o]));
    const enrichedOrders = batchOrders.map(bo => ({
      ...bo,
      order: orderMap.get(bo.orderId) || null,
    }));
    return { batch, orders: enrichedOrders };
  }),
  // ============================================================
  // 智能拼货推荐：兼容 v1（按目的站分组）和 v2（混拼模式）
  // v1 参数：targetDestinationCity + maxRecommendations → 按目的站分组，返回 recommendations[]
  // v2 参数：targetOriginCities → 混拼模式，返回 recommendation + remainingCandidates
  // 自动检测：如果传了 targetOriginCities 或 consolidationMode=="cross_city" 则走 v2，否则走 v1
  // ============================================================
  recommendLtlConsolidation: permissionProcedure(PERMISSIONS.LTL_ARRANGE_SHIP).input(
    z.object({
      capacity: z.number().min(0.1, "载重必须大于0"),
      vehicleLength: z.string().optional(),
      vehicleModels: z.array(z.string()).optional(),
      // v1 旧参数（主应用兼容）
      targetDestinationCity: z.string().optional(),
      maxRecommendations: z.number().min(1).max(10).default(5),
      // v2 新参数（/ltl/ 独立工作台）
      targetOriginCities: z.array(z.string()).optional(),
      consolidationMode: z.enum(["by_destination", "cross_city"]).optional(),
      // 共用
      candidateOrderIds: z.array(z.number()).optional(),
      fillRateMin: z.number().min(0).max(1).default(0.3),
    }),
  ).query(async ({ input }) => {
    const db = await getDb();
    // 判断走 v2 还是 v1
    const useV2 = input.consolidationMode === "cross_city" || (input.targetOriginCities && input.targetOriginCities.length > 0) || (!input.targetDestinationCity && !input.consolidationMode);

    if (!db) {
      if (useV2) return { recommendation: null, remainingCandidates: [], totalCandidates: 0, capacity: input.capacity };
      return { recommendations: [], totalCandidates: 0, capacity: input.capacity };
    }

    // 1. 加载候选订单：状态为 inquiry_confirmed
    const baseConditions: any[] = [
      eq(orders.businessType, "ltl"),
      eq(orders.status, "inquiry_confirmed"),
    ];
    if (input.candidateOrderIds && input.candidateOrderIds.length > 0) {
      baseConditions.push(inArray(orders.id, input.candidateOrderIds));
    }
    // v2: 发出城市多选
    if (useV2 && input.targetOriginCities && input.targetOriginCities.length > 0) {
      baseConditions.push(inArray(orders.originCity, input.targetOriginCities));
    }
    // v1: 目的站单选
    if (!useV2 && input.targetDestinationCity) {
      baseConditions.push(eq(orders.destinationCity, input.targetDestinationCity));
    }
    const candidates = await db.select().from(orders).where(and(...baseConditions));

    // 排除已经派车的订单
    const candidateIds = candidates.map((o: any) => o.id);
    let dispatchedSet = new Set<number>();
    if (candidateIds.length > 0) {
      const dispatched = await db.select({ orderId: ltlDispatchBatchOrders.orderId })
        .from(ltlDispatchBatchOrders).where(inArray(ltlDispatchBatchOrders.orderId, candidateIds));
      dispatchedSet = new Set(dispatched.map((d: any) => Number(d.orderId)));
    }
    const available = candidates.filter((o: any) => !dispatchedSet.has(Number(o.id)));

    if (available.length === 0) {
      if (useV2) return { recommendation: null, remainingCandidates: [], totalCandidates: 0, capacity: input.capacity };
      return { recommendations: [], totalCandidates: 0, capacity: input.capacity };
    }

    // 2. 解析每个订单的吨位
    const enriched = available.map((o: any) => {
      const w = resolveWeightInTons(o.weight);
      return {
        id: Number(o.id),
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        cargoName: o.cargoName,
        weight: w || 0,
        destinationCity: o.destinationCity || "未知目的站",
        destinationProvince: o.destinationProvince || null,
        originCity: o.originCity || null,
        warehouseName: o.warehouseName || null,
        isUrgent: Boolean(o.isUrgent),
        customerPrice: o.customerPrice ? Number(o.customerPrice) : 0,
      };
    }).filter((o: any) => o.weight > 0);

    // ========== v2 混拼模式 ==========
    if (useV2) {
      const sorted = [...enriched].sort((a, b) => {
        if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
        return (b.weight || 0) - (a.weight || 0);
      });
      const picked: any[] = [];
      let used = 0;
      const notPicked: any[] = [];
      for (const o of sorted) {
        if (used + o.weight <= input.capacity + 0.001) {
          picked.push(o);
          used += o.weight;
        } else {
          notPicked.push(o);
        }
      }
      if (picked.length === 0) {
        return { recommendation: null, remainingCandidates: [], totalCandidates: enriched.length, capacity: input.capacity };
      }
      const fillRate = used / input.capacity;
      if (fillRate < input.fillRateMin) {
        return { recommendation: null, remainingCandidates: [], totalCandidates: enriched.length, capacity: input.capacity };
      }
      const destBreakdown: Record<string, { count: number; weight: number }> = {};
      for (const o of picked) {
        const key = o.destinationCity;
        if (!destBreakdown[key]) destBreakdown[key] = { count: 0, weight: 0 };
        destBreakdown[key].count += 1;
        destBreakdown[key].weight = Number((destBreakdown[key].weight + o.weight).toFixed(3));
      }
      const urgentCount = picked.filter((o: any) => o.isUrgent).length;
      const totalRevenue = picked.reduce((s: number, o: any) => s + (o.customerPrice || 0), 0);
      const remainingSpace = input.capacity - used;
      const remainingCandidates = notPicked
        .filter((o: any) => o.weight <= remainingSpace + 0.001)
        .sort((a: any, b: any) => (b.weight || 0) - (a.weight || 0))
        .slice(0, 10);
      return {
        recommendation: {
          orderCount: picked.length,
          totalWeight: Number(used.toFixed(3)),
          fillRate: Number((fillRate * 100).toFixed(1)),
          remainingSpace: Number(remainingSpace.toFixed(3)),
          urgentCount,
          totalRevenue: Number(totalRevenue.toFixed(2)),
          destBreakdown,
          orders: picked,
        },
        remainingCandidates,
        totalCandidates: enriched.length,
        capacity: input.capacity,
        vehicleLength: input.vehicleLength || null,
        vehicleModels: input.vehicleModels && input.vehicleModels.length > 0 ? input.vehicleModels : null,
      };
    }

    // ========== v1 按目的站分组模式（主应用兼容） ==========
    const byDest = new Map<string, typeof enriched>();
    for (const o of enriched) {
      const key = o.destinationCity;
      if (!byDest.has(key)) byDest.set(key, []);
      byDest.get(key)!.push(o);
    }
    const recommendations: any[] = [];
    for (const [destCity, list] of byDest.entries()) {
      const sorted = [...list].sort((a, b) => {
        if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
        return (b.weight || 0) - (a.weight || 0);
      });
      const picked: any[] = [];
      let used = 0;
      for (const o of sorted) {
        if (used + o.weight <= input.capacity + 0.001) {
          picked.push(o);
          used += o.weight;
        }
      }
      if (picked.length === 0) continue;
      const fillRate = used / input.capacity;
      if (fillRate < (input.fillRateMin || 0.5)) continue;
      const urgentCount = picked.filter(o => o.isUrgent).length;
      const totalRevenue = picked.reduce((s, o) => s + (o.customerPrice || 0), 0);
      const score = fillRate * 0.6 + Math.min(urgentCount / Math.max(picked.length, 1), 1) * 0.3 + Math.min(picked.length / 10, 1) * 0.1;
      recommendations.push({
        destinationCity: destCity,
        destinationProvince: picked[0]?.destinationProvince || null,
        orderCount: picked.length,
        totalWeight: Number(used.toFixed(3)),
        fillRate: Number((fillRate * 100).toFixed(1)),
        urgentCount,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        score: Number(score.toFixed(4)),
        orders: picked,
      });
    }
    recommendations.sort((a, b) => b.score - a.score);
    return {
      recommendations: recommendations.slice(0, input.maxRecommendations),
      totalCandidates: enriched.length,
      capacity: input.capacity,
      vehicleLength: input.vehicleLength || null,
      vehicleModels: input.vehicleModels && input.vehicleModels.length > 0 ? input.vehicleModels : null,
    };
  }),
  // 删除零担派车批次（权限细化）
  deleteLtlBatch: permissionProcedure(PERMISSIONS.LTL_ARRANGE_SHIP).input(
    z.object({ batchId: z.number() }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const { ordersToRelease } = await db.transaction(async (tx) => {
      const batchOrders = await tx.select({
        orderId: ltlDispatchBatchOrders.orderId,
      }).from(ltlDispatchBatchOrders).where(eq(ltlDispatchBatchOrders.batchId, input.batchId));
      const orderIds = batchOrders.map((item: any) => Number(item.orderId)).filter((id: number) => Number.isInteger(id) && id > 0);
      const released = await releaseOrdersFromLtlBatch(tx, orderIds);
      if (orderIds.length > 0) {
        const relationDeleteResult = await tx.delete(ltlDispatchBatchOrders).where(eq(ltlDispatchBatchOrders.batchId, input.batchId));
        assertMutationApplied(relationDeleteResult, LTL_BATCH_CONCURRENT_CHANGE_MESSAGE);
      }
      const batchDeleteResult = await tx.delete(ltlDispatchBatches).where(eq(ltlDispatchBatches.id, input.batchId));
      assertMutationApplied(batchDeleteResult, "零担批次不存在或已被其他人处理，请刷新后重试。");
      return released;
    });
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "delete",
      targetType: "ltl_dispatch_batch",
      targetId: String(input.batchId),
      changes: {
        releasedOrderIds: ordersToRelease.map((item: any) => item.id),
        revertedStatusTo: "inquiry_confirmed",
      },
      description: `删除零担派车批次 #${input.batchId}，释放 ${ordersToRelease.length} 个订单回待询价/已询价承接状态`,
    });
    return { success: true, releasedCount: ordersToRelease.length };
  }),
  // 从批次中移除订单（权限细化）
  removeOrderFromLtlBatch: permissionProcedure(PERMISSIONS.LTL_ARRANGE_SHIP).input(
    z.object({
      batchId: z.number(),
      orderId: z.number(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    await db.transaction(async (tx) => {
      const [relation] = await tx.select({
        orderId: ltlDispatchBatchOrders.orderId,
      }).from(ltlDispatchBatchOrders).where(
        and(
          eq(ltlDispatchBatchOrders.batchId, input.batchId),
          eq(ltlDispatchBatchOrders.orderId, input.orderId),
        )
      ).limit(1);
      if (!relation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "该订单不在当前零担批次中" });
      }
      await releaseOrdersFromLtlBatch(tx, [input.orderId]);
      const relationDeleteResult = await tx.delete(ltlDispatchBatchOrders).where(
        and(
          eq(ltlDispatchBatchOrders.batchId, input.batchId),
          eq(ltlDispatchBatchOrders.orderId, input.orderId),
        )
      );
      assertMutationApplied(relationDeleteResult, LTL_BATCH_CONCURRENT_CHANGE_MESSAGE);
    });
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "update",
      targetType: "ltl_dispatch_batch",
      targetId: String(input.batchId),
      changes: {
        orderId: input.orderId,
        revertedStatusTo: "inquiry_confirmed",
      },
      description: `从批次 #${input.batchId} 移除订单 #${input.orderId}，并释放车辆/回单占用`,
    });
    return { success: true };
  }),
  // 查询备注变更日志
  getNoteChangeLogs: protectedProcedure.input(
    z.object({ orderId: z.number() }),
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const logs = await db.select().from(noteChangeLogs)
      .where(eq(noteChangeLogs.orderId, input.orderId))
      .orderBy(desc(noteChangeLogs.createdAt));
    return logs;
  }),
  // 查询订单流转时间线日志（支持批量查询，用于组合订单整组日志）
  getOrderTimeline: protectedProcedure.input(
    z.object({ orderIds: z.array(z.number()).min(1).max(50) }),
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const idStrings = input.orderIds.map(id => String(id));
    const logs = await db.select({
      id: operationLogs.id,
      action: operationLogs.action,
      targetId: operationLogs.targetId,
      changes: operationLogs.changes,
      description: operationLogs.description,
      createdAt: operationLogs.createdAt,
      userName: operationLogs.userName,
    })
      .from(operationLogs)
      .where(
        and(
          eq(operationLogs.targetType, "order"),
          inArray(operationLogs.targetId, idStrings),
        ),
      )
      .orderBy(operationLogs.createdAt)
      .limit(500);
    return logs;
  }),
  getLtlPickupSubchainStatus: protectedProcedure
    .input(z.object({ parentIds: z.array(z.number()).min(1).max(200) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return {
          parentIds: [] as number[],
          items: [] as Array<{ id: number; parentId: number; relatedParentIds: number[]; orderNumber: string | null; mergedPlanNumber: string | null; status: string | null }>,
        };
      }

      const parentIds = Array.from(new Set(input.parentIds.filter((id) => Number.isFinite(id))));
      if (parentIds.length === 0) {
        return {
          parentIds: [] as number[],
          items: [] as Array<{ id: number; parentId: number; relatedParentIds: number[]; orderNumber: string | null; mergedPlanNumber: string | null; status: string | null }>,
        };
      }

      const candidates = await db.select({
        id: orders.id,
        parentId: orders.parentId,
        orderNumber: orders.orderNumber,
        mergedPlanNumber: orders.mergedPlanNumber,
        status: orders.status,
        remarks: orders.remarks,
      }).from(orders).where(
        and(
          eq(orders.businessType, "outsource"),
          or(
            inArray(orders.parentId, parentIds),
            like(orders.remarks, `%${SUBCHAIN_PARENT_IDS_MARKER}%`),
          ),
        ),
      );

      const items = candidates
        .map((item) => {
          const relatedParentIds = getRelatedParentIds(item)
            .filter((id) => parentIds.includes(id));
          return {
            id: item.id,
            parentId: item.parentId as number,
            relatedParentIds,
            orderNumber: item.orderNumber,
            mergedPlanNumber: item.mergedPlanNumber,
            status: item.status,
            remarks: item.remarks,
          };
        })
        .filter((item) => isActiveLtlSubchainStatus(item.status) && String(item.remarks || "").includes("【零担前段外请子链】") && item.relatedParentIds.length > 0)
        .map(({ remarks, ...item }) => item);

      return {
        parentIds: Array.from(new Set(items.flatMap((item) => item.relatedParentIds))),
        items,
      };
    }),
  getLtlDeliverySubchainStatus: protectedProcedure
    .input(z.object({ parentIds: z.array(z.number()).min(1).max(200) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return {
          parentIds: [] as number[],
          items: [] as Array<{ id: number; parentId: number; relatedParentIds: number[]; orderNumber: string | null; mergedPlanNumber: string | null; status: string | null }>,
        };
      }

      const parentIds = Array.from(new Set(input.parentIds.filter((id) => Number.isFinite(id))));
      if (parentIds.length === 0) {
        return {
          parentIds: [] as number[],
          items: [] as Array<{ id: number; parentId: number; relatedParentIds: number[]; orderNumber: string | null; mergedPlanNumber: string | null; status: string | null }>,
        };
      }

      const candidates = await db.select({
        id: orders.id,
        parentId: orders.parentId,
        orderNumber: orders.orderNumber,
        mergedPlanNumber: orders.mergedPlanNumber,
        status: orders.status,
        remarks: orders.remarks,
      }).from(orders).where(
        and(
          eq(orders.businessType, "outsource"),
          or(
            inArray(orders.parentId, parentIds),
            like(orders.remarks, `%${SUBCHAIN_PARENT_IDS_MARKER}%`),
          ),
        ),
      );

      const items = candidates
        .map((item) => {
          const relatedParentIds = getRelatedParentIds(item)
            .filter((id) => parentIds.includes(id));
          return {
            id: item.id,
            parentId: item.parentId as number,
            relatedParentIds,
            orderNumber: item.orderNumber,
            mergedPlanNumber: item.mergedPlanNumber,
            status: item.status,
            remarks: item.remarks,
          };
        })
        .filter((item) => isActiveLtlSubchainStatus(item.status) && String(item.remarks || "").includes("【零担后段外请子链】") && item.relatedParentIds.length > 0)
        .map(({ remarks, ...item }) => item);

      return {
        parentIds: Array.from(new Set(items.flatMap((item) => item.relatedParentIds))),
        items,
      };
    }),
  getOutsourceSuborderPreviews: protectedProcedure
    .input(z.object({ orderIds: z.array(z.number()).min(1).max(200) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return {
          items: [] as Array<{
            orderId: number;
            parentIds: number[];
            parentOrders: Array<{
              id: number;
              orderNumber: string | null;
              systemCode: string | null;
              customerName: string | null;
              cargoName: string | null;
              originCity: string | null;
              destinationCity: string | null;
              weight: string | null;
              status: string | null;
              receivingNote: string | null;
              mergedPlanNumber: string | null;
              isUrgent: boolean | null;
              orderDate: Date | null;
              dispatchPrice: string | null;
            }>;
          }>,
        };
      }

      const orderIds = Array.from(new Set(input.orderIds.filter((id) => Number.isFinite(id))));
      if (orderIds.length === 0) {
        return {
          items: [] as Array<{
            orderId: number;
            parentIds: number[];
            parentOrders: Array<{
              id: number;
              orderNumber: string | null;
              systemCode: string | null;
              customerName: string | null;
              cargoName: string | null;
              originCity: string | null;
              destinationCity: string | null;
              weight: string | null;
              status: string | null;
              receivingNote: string | null;
              mergedPlanNumber: string | null;
              isUrgent: boolean | null;
              orderDate: Date | null;
              dispatchPrice: string | null;
            }>;
          }>,
        };
      }

      const subchainOrders = await db.select({
        id: orders.id,
        parentId: orders.parentId,
        remarks: orders.remarks,
      }).from(orders).where(inArray(orders.id, orderIds));

      const previewTargets = subchainOrders
        .map((item) => ({
          orderId: item.id,
          parentIds: getRelatedParentIds(item),
        }))
        .filter((item) => item.parentIds.length > 0);

      const allParentIds = Array.from(new Set(previewTargets.flatMap((item) => item.parentIds)));
      if (allParentIds.length === 0) {
        return { items: [] as Array<{ orderId: number; parentIds: number[]; parentOrders: Array<Record<string, unknown>> }> };
      }

      const parentOrders = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        systemCode: orders.systemCode,
        customerName: orders.customerName,
        cargoName: orders.cargoName,
        originCity: orders.originCity,
        destinationCity: orders.destinationCity,
        weight: orders.weight,
        status: orders.status,
        receivingNote: orders.receivingNote,
        mergedPlanNumber: orders.mergedPlanNumber,
        isUrgent: orders.isUrgent,
        orderDate: orders.orderDate,
        dispatchPrice: orders.dispatchPrice,
      }).from(orders).where(inArray(orders.id, allParentIds));

      const parentOrderMap = new Map(parentOrders.map((item) => [item.id, item]));

      return {
        items: previewTargets.map((item) => ({
          orderId: item.orderId,
          parentIds: item.parentIds,
          parentOrders: item.parentIds
            .map((parentId) => parentOrderMap.get(parentId))
            .filter(Boolean),
        })),
      };
    }),
  // 批量删除订单
  batchDelete: permissionProcedure(PERMISSIONS.ORDER_DELETE)
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库不可用");
      const uniqueIds = Array.from(new Set(input.ids.filter((id) => Number.isInteger(id) && id > 0)));
      let successCount = 0;
      let skipCount = 0;
      const deletedOrders: Array<{ id: number; orderNumber: string | null }> = [];
      const results: Array<{ id: number; orderNumber: string | null; success: boolean; error?: string }> = [];

      for (const id of uniqueIds) {
        try {
          const order = await db.transaction(async (tx) => executeProtectedOrderDelete(tx, id));
          deletedOrders.push({ id, orderNumber: order.orderNumber });
          successCount++;
          results.push({ id, orderNumber: order.orderNumber, success: true });
        } catch (error: any) {
          skipCount++;
          results.push({
            id,
            orderNumber: null,
            success: false,
            error: error?.message || "删除失败",
          });
        }
      }

      if (deletedOrders.length > 0) {
        await createOperationLog({
          userId: ctx.user!.id,
          userName: ctx.user!.name ?? undefined,
          action: "delete",
          targetType: "order",
          targetId: deletedOrders.map((item) => item.id).join(","),
          description: `批量删除 ${deletedOrders.length} 个订单: ${deletedOrders.map((item) => item.orderNumber || item.id).join(", ")}`,
        });
      }

      return {
        success: skipCount === 0,
        deleted: successCount > 0,
        count: successCount,
        successCount,
        skipCount,
        total: uniqueIds.length,
        results,
      };
    }),
  // ============================================================
  // 批量创建订单（智能粘贴一次性提交）
  // ============================================================
  batchCreate: permissionProcedure("order.create").input(
    z.object({
      orders: z.array(z.object({
        orderNumber: z.string().min(1),
        mergedPlanNumber: z.string().optional(),
        businessType: z.enum(["outsource", "self", "ltl"]),
        isUrgent: z.boolean().default(false),
        urgentReason: z.string().optional(),
        customerId: z.number().optional(),
        customerName: z.string().optional(),
        customerPhone: z.string().optional(),
        settlementType: z.enum(["monthly", "cash", "collect"]).optional(),
        cargoName: z.string().optional(),
        weight: optionalWeight(),
        originCity: z.string().optional(),
        destinationCity: z.string().optional(),
        deliveryAddress: z.string().optional(),
        receiverName: z.string().optional(),
        receiverPhone: z.string().optional(),
        customerPrice: optionalDecimal(),
        cargoSpec: z.string().optional(),
        specialRequirements: z.string().optional(),
        shippingNote: z.string().optional(),
        remarks: z.string().optional(),
        warehouseName: z.string().optional(),
        isLargeSlab: z.boolean().optional(),
        chargeableWeight: optionalWeight(),
        packageCount: z.number().optional(),
        palletCount: z.number().optional(),
        largeSlabShippingRequired: z.boolean().optional(),
        parentId: z.number().optional(),
        parentIds: z.array(z.number()).optional(),
        subchainStage: z.enum(["pickup", "delivery"]).optional(),
      })).min(1, "至少提交1条订单").max(100, "单次最多100条订单"),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const results: { id: number; systemCode: string; orderNumber: string }[] = [];
    let urgentCount = 0;
    // 使用事务批量插入
    await db.transaction(async (tx) => {
      for (const item of input.orders) {
        const systemCode = await generateSystemCode();
        const initialStatus: string = "pending_assign";
        // 大板检测
        let isLargeSlab = item.isLargeSlab || false;
        if (!isLargeSlab && item.cargoName) {
          const textToCheck = `${item.cargoName} ${item.cargoSpec || ''} ${item.shippingNote || ''} ${item.remarks || ''}`;
          const isTile = /瓷砖|大板|石材|岩板|铁架|铁托/.test(textToCheck);
          if (isTile) {
            const sizeMatches = Array.from(textToCheck.matchAll(/(\d+)\s*[*×xX]\s*(\d+)/g));
            for (const match of sizeMatches) {
              const w = parseInt(match[1]);
              const h = parseInt(match[2]);
              if ((w >= 1800 && h >= 900) || (h >= 1800 && w >= 900)) {
                isLargeSlab = true;
                break;
              }
            }
          }
        }
        const normalizedParentIds = normalizeParentIds(item.parentId, item.parentIds);
        const primaryParentId = normalizedParentIds[0] ?? null;
        const normalizedRemarks = attachRelatedParentIdsToRemarks(item.remarks, normalizedParentIds);
        const subchainTag = item.subchainStage === "pickup"
          ? "【零担前段外请子链】"
          : item.subchainStage === "delivery"
            ? "【零担后段外请子链】"
            : null;
        const entryQueueMetadata = buildEntryQueueMetadata({ reason: "new" });
        const structuredLtlSegmentMode = item.businessType === "outsource"
          ? item.subchainStage === "pickup"
            ? "pickup_outsource"
            : item.subchainStage === "delivery"
              ? "delivery_outsource"
              : null
          : null;

        if (item.businessType === "outsource" && normalizedParentIds.length > 0 && subchainTag) {
          const duplicated = await findExistingLtlSubchain(tx, normalizedParentIds, item.subchainStage as "pickup" | "delivery");
          if (duplicated) {
            throw new Error(`零担主单 ${item.orderNumber} 已存在${item.subchainStage === "pickup" ? "前段" : "后段"}外请子链：${duplicated.orderNumber || `#${duplicated.id}`}，请先处理现有子链`);
          }
        }

        const result = await tx.insert(orders).values({
          systemCode,
          isLargeSlab,
          chargeableWeight: item.chargeableWeight || null,
          packageCount: item.packageCount || null,
          palletCount: item.palletCount || null,
          largeSlabShippingRequired: item.largeSlabShippingRequired ?? null,
          orderNumber: item.orderNumber,
          mergedPlanNumber: item.mergedPlanNumber || null,
          businessType: item.businessType,
          status: initialStatus as any,
          ...entryQueueMetadata,
          isUrgent: item.isUrgent,
          urgentReason: item.urgentReason || null,
          customerId: item.customerId || null,
          customerName: item.customerName || null,
          customerPhone: item.customerPhone || null,
          settlementType: (item.settlementType as any) || null,
          cargoName: item.cargoName || null,
          weight: item.weight || null,
          originCity: item.originCity || null,
          deliveryAddress: item.deliveryAddress || null,
          destinationCity: item.destinationCity || null,
          receiverName: item.receiverName || null,
          receiverPhone: item.receiverPhone || null,
          customerPrice: item.customerPrice || null,
          cargoSpec: item.cargoSpec || null,
          specialRequirements: item.specialRequirements || null,
          shippingNote: item.shippingNote || null,
          remarks: normalizedRemarks,
          warehouseName: item.warehouseName || null,
          parentId: primaryParentId,
          relatedParentIds: normalizedParentIds.length > 0 ? normalizedParentIds : null,
          subchainStage: item.subchainStage ?? null,
          ltlSegmentMode: structuredLtlSegmentMode,
          orderDate: new Date(),
          createdBy: ctx.user!.id,
        });
        const insertedId = Number(result[0].insertId);
        results.push({ id: insertedId, systemCode, orderNumber: item.orderNumber });
        if (item.isUrgent) urgentCount++;
      }
    });
    // 事务外记录操作日志
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "create",
      targetType: "order",
      targetId: results.map(r => r.id).join(","),
      description: `批量创建 ${results.length} 条订单${urgentCount > 0 ? ` [其中${urgentCount}条加急]` : ''}`,
    });
    // 加急订单通知
    if (urgentCount > 0) {
      notifyOwner({
        title: `🚨 批量创建含 ${urgentCount} 条加急订单`,
        content: `共创建 ${results.length} 条订单，其中 ${urgentCount} 条加急`,
      }).catch(e => console.error('Batch urgent notification failed:', e));
    }
    return { success: true, count: results.length, results };
  }),
  // ============================================================
  // 合并订单（拼车）接口
  // 接收子订单IDs，新建一个主订单并累加重量体积，子订单状态改为merged并关联parentId
  // ============================================================
  // 整组派车（合并计划号专用）：运费按重量分摊、押金防重、自动创建回单
  // ============================================================
  batchDispatch: permissionProcedure(PERMISSIONS.ORDER_UPDATE_STATUS).input(
    z.object({
      orderIds: z.array(z.number()).min(1, "至少选择1个订单"),
      plateNumber: z.string().min(1, "请填写车牌号"),
      driverName: z.string().optional(),
      driverPhone: z.string().optional(),
      driverIdCard: z.string().optional(),
      driverId: z.number().optional(),
      vehicleId: z.number().optional(),
      totalFreight: z.string().min(1, "请填写整车总运费"),
      depositAmount: z.string().optional(),
      depositRefundable: z.boolean().optional(),
      dispatcherRemark: z.string().optional(),
      receivingNote: z.string().optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const { orderIds, totalFreight, depositAmount, depositRefundable, ...vehicleInfo } = input;
    // 1. 查询所有目标订单
    const targetOrders = await db.select().from(orders)
      .where(inArray(orders.id, orderIds));
    if (targetOrders.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "未找到任何订单" });
    }
    // 校验：不能对已结算/已取消的订单派车
    const invalidOrders = targetOrders.filter(o => o.status === "settled" || o.status === "cancelled");
    if (invalidOrders.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `订单 ${invalidOrders.map(o => o.orderNumber).join(", ")} 状态不允许派车`,
      });
    }
    const hasSelfBusinessOrder = targetOrders.some((order) => isSelfBusinessType(order.businessType));
    if (hasSelfBusinessOrder && safeParseFloat(depositAmount || "0") > 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "自运订单不允许填写押金" });
    }
    // 2. 运费分摊：按重量比例，全部无重量则按数量平分
    const totalFreightNum = safeParseFloat(totalFreight);
    if (totalFreightNum <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "总运费必须大于0" });
    }
    const totalWeight = targetOrders.reduce((sum, o) => sum + safeParseFloat(o.weight), 0);
    const useWeightRatio = totalWeight > 0;
    const freightAllocation: { orderId: number; freight: number }[] = [];
    // 使用整数（分）运算，彻底避免浮点累加误差
    const totalCents = Math.round(totalFreightNum * 100);
    let allocatedCents = 0;
    if (useWeightRatio) {
      // 按重量比例分摊
      for (let i = 0; i < targetOrders.length; i++) {
        const order = targetOrders[i];
        const orderWeight = safeParseFloat(order.weight);
        if (i === targetOrders.length - 1) {
          // 最后一个订单取剩余金额（整数减法，精确无误差）
          const lastCents = totalCents - allocatedCents;
          freightAllocation.push({ orderId: order.id, freight: lastCents / 100 });
        } else {
          const shareCents = Math.round((orderWeight / totalWeight) * totalCents);
          allocatedCents += shareCents;
          freightAllocation.push({ orderId: order.id, freight: shareCents / 100 });
        }
      }
    } else {
      // 无重量信息，按数量平分
      for (let i = 0; i < targetOrders.length; i++) {
        if (i === targetOrders.length - 1) {
          const lastCents = totalCents - allocatedCents;
          freightAllocation.push({ orderId: targetOrders[i].id, freight: lastCents / 100 });
        } else {
          const shareCents = Math.round(totalCents / targetOrders.length);
          allocatedCents += shareCents;
          freightAllocation.push({ orderId: targetOrders[i].id, freight: shareCents / 100 });
        }
      }
    }
    // 3. 自动关联 vehicleId 和 driverId
    let resolvedVehicleId = vehicleInfo.vehicleId;
    let resolvedDriverId = vehicleInfo.driverId;
    if (!resolvedVehicleId && vehicleInfo.plateNumber) {
      try {
        const vRows = await db.select({ id: vehicles.id }).from(vehicles)
          .where(eq(vehicles.plateNumber, vehicleInfo.plateNumber)).limit(1);
        if (vRows[0]) resolvedVehicleId = vRows[0].id;
      } catch (e) { /* ignore */ }
    }
    if (!resolvedDriverId && vehicleInfo.driverName) {
      try {
        const dRows = await db.select({ id: drivers.id }).from(drivers)
          .where(eq(drivers.name, vehicleInfo.driverName)).limit(1);
        if (dRows[0]) resolvedDriverId = dRows[0].id;
      } catch (e) { /* ignore */ }
    }
    // 4. 押金分摊处理：按重量比例分摊总押金到每个子订单
    const depositNum = safeParseFloat(depositAmount || "0");
    const hasDeposit = depositNum > 0;
    // 押金分摊算法（与运费分摊一致）
    const depositAllocation: { orderId: number; deposit: number }[] = [];
    if (hasDeposit && targetOrders.length > 1) {
      const totalWeight = targetOrders.reduce((s, o) => s + safeParseFloat(o.weight), 0);
      const useWeightRatio = totalWeight > 0;
      const totalDepositCents = Math.round(depositNum * 100);
      let allocatedDepositCents = 0;
      for (let i = 0; i < targetOrders.length; i++) {
        const order = targetOrders[i];
        if (i === targetOrders.length - 1) {
          const lastCents = totalDepositCents - allocatedDepositCents;
          depositAllocation.push({ orderId: order.id, deposit: lastCents / 100 });
        } else if (useWeightRatio) {
          const orderWeight = safeParseFloat(order.weight);
          const shareCents = Math.round((orderWeight / totalWeight) * totalDepositCents);
          allocatedDepositCents += shareCents;
          depositAllocation.push({ orderId: order.id, deposit: shareCents / 100 });
        } else {
          const shareCents = Math.round(totalDepositCents / targetOrders.length);
          allocatedDepositCents += shareCents;
          depositAllocation.push({ orderId: order.id, deposit: shareCents / 100 });
        }
      }
      console.log(`[batchDispatch] 押金分摊: total=${depositNum}, allocations=`, depositAllocation);
    } else if (hasDeposit) {
      // 单订单：全额记录
      depositAllocation.push({ orderId: targetOrders[0].id, deposit: depositNum });
    }
    // 4.5 溢价检测：比对总运费与总原定价/调度价
    const totalQuotedPrice = targetOrders.reduce((s, o) => s + safeParseFloat(o.quotedPrice), 0);
    const totalDispatchPrice = targetOrders.reduce((s, o) => s + safeParseFloat(o.dispatchPrice), 0);
    const referencePrice = totalQuotedPrice > 0 ? totalQuotedPrice : totalDispatchPrice;
    const hasRemark = !!vehicleInfo.dispatcherRemark;
    const isOverpriced = totalFreightNum > 0 && referencePrice > 0 && totalFreightNum > referencePrice;
    const hasLargeSlab = targetOrders.some((order) => Boolean(order.isLargeSlab));
    const needApproval = isOverpriced || hasRemark || hasLargeSlab;
    // 5. 并行更新订单，避免逐单串行阻塞
    const freightAllocationMap = new Map(freightAllocation.map((item) => [item.orderId, item.freight]));
    const depositAllocationMap = new Map(depositAllocation.map((item) => [item.orderId, item.deposit]));
    const updateTasks = targetOrders.map(async (order) => {
      const freight = freightAllocationMap.get(order.id) ?? 0;
      const orderNeedApproval = !isSelfBusinessType(order.businessType) && (
        needApproval || isMergedLtlPickupOutsourceOrder(order)
      );
      const targetStatus = orderNeedApproval ? "pending_approval" : "dispatched";
      const updateData: Record<string, any> = {
        status: targetStatus,
        dispatchDate: orderNeedApproval ? undefined : new Date(),
        plateNumber: vehicleInfo.plateNumber,
        driverName: vehicleInfo.driverName || null,
        driverPhone: vehicleInfo.driverPhone || null,
        driverIdCard: vehicleInfo.driverIdCard || null,
        vehicleId: resolvedVehicleId || null,
        driverId: resolvedDriverId || null,
        actualFreight: String(freight),
        totalCost: String(freight),
      };
      if (vehicleInfo.dispatcherRemark) {
        updateData.dispatcherRemark = vehicleInfo.dispatcherRemark;
      }
      if (vehicleInfo.receivingNote) {
        updateData.receivingNote = vehicleInfo.receivingNote;
      }
      const depositAlloc = depositAllocationMap.get(order.id);
      if (isSelfBusinessType(order.businessType)) {
        Object.assign(updateData, buildSelfTransportDepositReset());
      } else if (depositAlloc && depositAlloc > 0) {
        updateData.depositAmount = String(depositAlloc);
        updateData.depositRefundable = depositRefundable !== false;
        updateData.depositStatus = depositRefundable === false ? "not_refundable" : "paid";
      } else {
        updateData.depositAmount = "0";
        updateData.depositStatus = "none";
      }

      await db.update(orders).set(updateData).where(eq(orders.id, order.id));

      if (!orderNeedApproval) {
        try {
          const depositAmountForPod = depositAlloc && depositAlloc > 0 ? String(depositAlloc) : null;
          await ensurePendingPodRecordForOrder(db, {
            id: order.id,
            podOwnership: order.podOwnership,
            depositAmount: depositAmountForPod,
            businessType: order.businessType,
          }, depositAmountForPod);
        } catch (e) {
          console.error("Auto-create pod failed for order", order.id, e);
        }
      }

      if (orderNeedApproval) {
        try {
          const remarkPart = vehicleInfo.dispatcherRemark ? ` 备注：${vehicleInfo.dispatcherRemark}` : "";
          const largeSlabTriggerPart = order.isLargeSlab ? " 大板订单触发审批" : "";
          const snapshotParts = [
            `isLargeSlab=${order.isLargeSlab ? "true" : "false"}`,
            `cargoSpec=${order.cargoSpec || "-"}`,
            `chargeableWeight=${order.chargeableWeight || "-"}`,
            `packageCount=${order.packageCount ?? "-"}`,
            `palletCount=${order.palletCount ?? "-"}`,
            `specialRequirements=${order.specialRequirements || "-"}`,
          ];
          await db.insert(approvals).values({
            orderId: order.id,
            approvalType: "vehicle_quote",
            applicantId: ctx.user!.id,
            applicantName: ctx.user!.name || ctx.user!.username || "未知",
            requestedAmount: String(totalFreightNum),
            status: "pending",
            reason: `整组派车审批：车牌${vehicleInfo.plateNumber} 司机${vehicleInfo.driverName || ""} 整组申请报价¥${totalFreightNum}${isOverpriced ? ` 超出${totalQuotedPrice > 0 ? '原定价' : '调度价'}¥${referencePrice}` : ''}${largeSlabTriggerPart}${remarkPart} 审批快照[${snapshotParts.join("; ")}]`,
          });
        } catch (e) {
          console.error("Auto-create approval failed for order", order.id, e);
        }
      }

      return true;
    });
    const updateResults = await Promise.allSettled(updateTasks);
    const successCount = updateResults.filter((result) => result.status === "fulfilled" && result.value).length;
    updateResults.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`batchDispatch failed for order ${targetOrders[index]?.id}:`, result.reason);
      }
    });
    const hasApprovalOrders = targetOrders.some((order) => !isSelfBusinessType(order.businessType) && (needApproval || isMergedLtlPickupOutsourceOrder(order)));
    // 溢价时发送审批通知
    if (hasApprovalOrders) {
      try {
        const firstOrder = targetOrders[0];
        const customerSummary = formatGroupDistinctLabel(targetOrders.map((order) => order.customerName), "客户");
        const warehouseSummary = formatGroupDistinctLabel(
          targetOrders.map((order) => order.warehouseName || order.originCity),
          "仓",
        );
        notifyOwner({
          title: `\uD83D\uDCDD 整组派车审批: ${firstOrder.mergedPlanNumber || firstOrder.orderNumber || `#${firstOrder.id}`}`,
          content: `${targetOrders.length}单 | 客户: ${customerSummary} | 发货仓: ${warehouseSummary} | 路线: ${firstOrder.originCity || '?'} → ${firstOrder.destinationCity || '?'} | 车牌: ${vehicleInfo.plateNumber} | 总运费: ¥${totalFreightNum}${isOverpriced ? ` (超出¥${Math.round((totalFreightNum - referencePrice) * 100) / 100})` : ''}${hasLargeSlab ? ' | 含大板订单' : ''} | 报价人: ${ctx.user!.name || ctx.user!.username || '未知'}`,
        }).catch(e => console.error('Batch dispatch approval notification failed:', e));
      } catch (e) { /* ignore */ }
    }
    // 6. 记录操作日志
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "batch_dispatch",
      targetType: "order",
      targetId: orderIds.join(","),
      changes: {
        totalFreight: totalFreightNum,
        freightAllocation,
        depositAmount: hasSelfBusinessOrder ? null : depositNum,
        depositAllocation: depositAllocation.length > 0 ? depositAllocation : null,
        plateNumber: vehicleInfo.plateNumber,
        driverName: vehicleInfo.driverName,
        useWeightRatio,
      },
      description: `整组派车 ${successCount}/${targetOrders.length} 单，车牌${vehicleInfo.plateNumber}，总运费¥${totalFreightNum}${useWeightRatio ? '(按重量分摊)' : '(按数量平分)'}${hasDeposit && !hasSelfBusinessOrder ? `，押金¥${depositNum}记在首单` : ''}`,
    });
    return {
      success: true,
      count: successCount,
      total: targetOrders.length,
      freightAllocation,
      depositOnOrderId: hasDeposit ? targetOrders[0].id : null,
    };
  }),
  // ============================================================
  // 整组分配调度员（合并计划号专用）
  // ============================================================
  batchAssign: permissionProcedure(PERMISSIONS.ORDER_ASSIGN).input(
    z.object({
      orderIds: z.array(z.number()).min(1, "至少选择1个订单"),
      dispatcherId: z.number(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const { orderIds, dispatcherId } = input;
    // 验证调度员存在
    const dispatcherRows = await db.select({ id: users.id, name: users.name, username: users.username })
      .from(users).where(eq(users.id, dispatcherId)).limit(1);
    if (!dispatcherRows[0]) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "指定的调度员不存在" });
    }
    const dispatcherName = dispatcherRows[0].name || dispatcherRows[0].username || `#${dispatcherId}`;
    // 批量更新
    const result = await db.update(orders).set({
      assignedDispatcherId: dispatcherId,
    }).where(inArray(orders.id, orderIds));
    // 记录操作日志
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "batch_assign",
      targetType: "order",
      targetId: orderIds.join(","),
      description: `整组分配 ${orderIds.length} 个订单给调度员 ${dispatcherName}`,
    });
    return {
      success: true,
      count: orderIds.length,
      dispatcherName,
    };
  }),
  // ============================================================
  // 指定目标状态退回（增强版：强制清空派车信息+清理回单+重置押金）
  // ============================================================
  revertStatus: permissionProcedure(PERMISSIONS.ORDER_ROLLBACK).input(
    z.object({
      id: z.number(),
      targetStatus: z.string().min(1, "请指定退回目标状态"),
      reason: z.string().min(1, "请填写退回原因"),
      holdReason: z.string().optional(),
      releaseReason: z.string().optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    const transition = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, input.id)).limit(1);
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
      }
      const currentStatus = String(order.status || "");
      if (currentStatus === "settled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "已结算的订单不允许退回，如需调整请联系管理员" });
      }
      const requestedTargetStatus = String(input.targetStatus || "").trim();
      if (!requestedTargetStatus) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "请指定退回目标状态" });
      }
      const nextStatus = resolveOnHoldReleaseTargetStatus(order, requestedTargetStatus);
      const isEnteringOnHold = currentStatus !== "on_hold" && nextStatus === "on_hold";
      const isReleasingOnHold = currentStatus === "on_hold" && nextStatus !== "on_hold" && nextStatus !== "cancelled";
      const holdReason = isEnteringOnHold ? normalizeRequiredRemark(input.holdReason, "搁置原因") : null;
      const releaseReason = isReleasingOnHold ? normalizeRequiredRemark(input.releaseReason, "恢复原因") : null;
      const ALLOWED_TARGETS = [
        "pending_assign", "pending_price", "priced",
        "pending_vehicle", "pending_dispatch", "pending_inquiry",
        "pending_approval", "inquiry_confirmed",
        "dispatched", "delivered", "on_hold",
      ];
      if (!ALLOWED_TARGETS.includes(nextStatus)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `不允许退回到"${nextStatus}"状态` });
      }
      assertRollbackTarget(currentStatus, nextStatus);
      assertOnHoldRestorePrerequisites(order, nextStatus);
      const restoredAssigneeId = isReleasingOnHold
        ? await resolvePreHoldAssignee(db, order.preHoldAssignee)
        : null;
      const revertClean = isEnteringOnHold
        ? {
            status: nextStatus,
            holdReason,
            releaseReason: null,
            holdBy: ctx.user!.id,
            holdAt: new Date(),
            preHoldStatus: currentStatus,
            preHoldAssignee: order.assignedDispatcherId ?? null,
          }
        : isReleasingOnHold
          ? {
              status: nextStatus,
              releaseReason,
              assignedDispatcherId: restoredAssigneeId,
            }
          : buildRollbackCleanUpdate(nextStatus);
      if (nextStatus === "pending_assign") {
        Object.assign(revertClean, buildEntryQueueMetadata({
          reason: "returned",
          fromStatus: currentStatus,
          returnedBy: ctx.user!.name || ctx.user!.username || null,
          returnReason: input.reason,
        }));
      }
      if (!isEnteringOnHold && (STATUS_STAGE[nextStatus] ?? -1) <= 3) {
        await deletePendingPodRecords(tx, [input.id]);
      }
      const updateResult = await tx.update(orders).set(revertClean).where(
        and(
          eq(orders.id, input.id),
          eq(orders.status, currentStatus as any),
        ),
      );
      assertMutationApplied(updateResult, ORDER_CONCURRENT_CHANGE_MESSAGE);
      const currentOrderParentIds = getRelatedParentIds(order);
      if (resolveLtlSubchainStage(order) === "delivery" && currentOrderParentIds.length > 0) {
        await refreshRelatedParentPodOwnership(tx, currentOrderParentIds);
      }
      return {
        orderNumber: order.orderNumber,
        fromStatus: currentStatus,
        toStatus: nextStatus,
        cleanedFields: Object.keys(revertClean).filter((key) => key !== "status"),
      };
    });
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name ?? ctx.user!.username ?? undefined,
      action: "revert",
      targetType: "order",
      targetId: String(input.id),
      changes: {
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        reason: input.reason,
        cleanedFields: transition.cleanedFields,
      },
      description: `订单 ${transition.orderNumber} 退回：${STATUS_LABELS[transition.fromStatus] || transition.fromStatus} → ${STATUS_LABELS[transition.toStatus] || transition.toStatus}，原因：${input.reason}`,
    });
    return {
      success: true,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      fromLabel: STATUS_LABELS[transition.fromStatus] || transition.fromStatus,
      toLabel: STATUS_LABELS[transition.toStatus] || transition.toStatus,
    };
  }),
  // ============================================================
  mergeOrders: permissionProcedure(PERMISSIONS.ORDER_UPDATE_STATUS).input(
    z.object({
      childOrderIds: z.array(z.number()).min(2, "至少选择2个订单进行合并"),
      businessType: z.enum(["outsource", "self", "ltl"]),
      customerName: z.string().optional(),
      destinationCity: z.string().optional(),
      remarks: z.string().optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    // 查询所有子订单
    const childOrders = await db.select().from(orders)
      .where(inArray(orders.id, input.childOrderIds));
    if (childOrders.length !== input.childOrderIds.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `部分订单不存在，请检查后重试`,
      });
    }
    // 检查子订单是否已被合并
    const alreadyMerged = childOrders.filter(o => o.status === "merged" || o.parentId !== null);
    if (alreadyMerged.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `订单 ${alreadyMerged.map(o => o.orderNumber).join(", ")} 已被合并，不能重复合并`,
      });
    }
    // 累加重量和客户报价
    const totalWeight = childOrders.reduce((sum, o) => sum + safeParseFloat(o.weight), 0);
    const totalCustomerPrice = childOrders.reduce((sum, o) => sum + safeParseFloat(o.customerPrice), 0);
    // 生成主订单编号
    const systemCode = await generateSystemCode();
    const mergedOrderNumber = `MG-${childOrders.map(o => o.orderNumber).join("/")}`;
    // 创建主订单
    const firstChild = childOrders[0];
    const result = await db.insert(orders).values({
      systemCode,
      orderNumber: mergedOrderNumber.substring(0, 100), // 截断以防超长
      businessType: input.businessType,
      department: firstChild.department || null,
      status: "pending_price" as any,
      isUrgent: childOrders.some(o => o.isUrgent),
      customerId: firstChild.customerId || null,
      customerName: input.customerName || firstChild.customerName || null,
      customerPhone: firstChild.customerPhone || null,
      settlementType: firstChild.settlementType || null,
      cargoName: childOrders.map(o => o.cargoName).filter(Boolean).join(", ") || null,
      weight: String(Math.round(totalWeight * 1000) / 1000),
      originCity: firstChild.originCity || null,
      originProvince: firstChild.originProvince || null,
      deliveryAddress: firstChild.deliveryAddress || null,
      destinationCity: input.destinationCity || firstChild.destinationCity || null,
      destinationProvince: firstChild.destinationProvince || null,
      receiverName: firstChild.receiverName || null,
      receiverPhone: firstChild.receiverPhone || null,
      customerPrice: totalCustomerPrice > 0 ? String(totalCustomerPrice) : null,
      isMerged: true,
      remarks: input.remarks || `合并订单，包含 ${childOrders.length} 个子订单`,
      orderDate: new Date(),
      createdBy: ctx.user!.id,
    });
    const parentId = result[0].insertId;
    // 更新子订单：状态改为merged，关联parentId
    await db.update(orders).set({
      status: "merged" as any,
      parentId: parentId,
    }).where(inArray(orders.id, input.childOrderIds));
    // 记录操作日志
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "merge_orders",
      targetType: "order",
      targetId: String(parentId),
      changes: { childOrderIds: input.childOrderIds, totalWeight },
      description: `合并 ${childOrders.length} 个订单为主订单 ${systemCode}，总重量 ${totalWeight} 吨`,
    });
    return {
      parentOrderId: parentId,
      systemCode,
      mergedCount: childOrders.length,
      totalWeight,
    };
  }),

  // ============================================================
  // 零担前段外请子链自动创建（从零担工作台前段模式弹窗调用）
  // 自动创建外请子单，同时标记主单 ltlPickupOutsourced=true
  // ============================================================
  createLtlPickupSubchain: protectedProcedure.input(
    z.object({
      parentOrderId: z.number(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    // 1. 查询父订单
    const [parentOrder] = await db.select().from(orders).where(eq(orders.id, input.parentOrderId)).limit(1);
    if (!parentOrder) {
      throw new TRPCError({ code: "NOT_FOUND", message: "父订单不存在" });
    }
    if (parentOrder.businessType !== "ltl") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "仅零担订单支持创建前段外请子链" });
    }
    // 2. 检查是否已存在前段外请子链（防重）
    const normalizedParentIds = [input.parentOrderId];
    const duplicated = await findExistingLtlSubchain(db, normalizedParentIds, "pickup");
    if (duplicated) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `该订单已存在前段外请子链：${duplicated.orderNumber || `#${duplicated.id}`}，请勿重复创建`,
      });
    }
    // 3. 创建外请子单
    const systemCode = await generateSystemCode();
    const entryQueueMetadata = buildEntryQueueMetadata({ reason: "new" });
    const subchainRemarks = applyLtlRemarkTag({
      remarks: parentOrder.remarks,
      tag: "【零担前段外请子链】",
      enabled: true,
      operatorName: ctx.user!.name ?? ctx.user!.username ?? null,
    });
    const result = await db.insert(orders).values({
      systemCode,
      orderNumber: parentOrder.orderNumber || systemCode,
      mergedPlanNumber: null, // v22 fix: do NOT copy mergedPlanNumber to avoid isMergedChildOrder false positive
      businessType: "outsource",
      status: "pending_price" as any,
      ...entryQueueMetadata,
      isUrgent: parentOrder.isUrgent,
      urgentReason: parentOrder.urgentReason || null,
      customerId: parentOrder.customerId || null,
      customerName: parentOrder.customerName || null,
      customerPhone: parentOrder.customerPhone || null,
      settlementType: parentOrder.settlementType || null,
      cargoName: parentOrder.cargoName || null,
      weight: parentOrder.weight || null,
      originCity: parentOrder.originCity || null,
      destinationCity: parentOrder.destinationCity || null,
      destinationProvince: parentOrder.destinationProvince || null,
      originProvince: parentOrder.originProvince || null,
      deliveryAddress: parentOrder.deliveryAddress || null,
      receiverName: parentOrder.receiverName || null,
      receiverPhone: parentOrder.receiverPhone || null,
      customerPrice: parentOrder.customerPrice || null,
      cargoSpec: parentOrder.cargoSpec || null,
      specialRequirements: parentOrder.specialRequirements || null,
      shippingNote: parentOrder.shippingNote || null,
      remarks: subchainRemarks,
      warehouseName: parentOrder.warehouseName || null,
      isLargeSlab: parentOrder.isLargeSlab || false,
      chargeableWeight: parentOrder.chargeableWeight || null,
      packageCount: parentOrder.packageCount || null,
      palletCount: parentOrder.palletCount || null,
      parentId: input.parentOrderId,
      relatedParentIds: [input.parentOrderId],
      subchainStage: "pickup",
      ltlSegmentMode: "pickup_outsource",
      orderDate: new Date(),
      createdBy: ctx.user!.id,
    });
    const insertedId = Number(result[0].insertId);
    // 4. 标记父订单 ltlPickupOutsourced=true
    const parentRemarks = applyLtlRemarkTag({
      remarks: parentOrder.remarks,
      tag: "【前段已转外请】",
      enabled: true,
      operatorName: ctx.user!.name ?? ctx.user!.username ?? null,
    });
    await db.update(orders).set({
      ltlPickupOutsourced: true,
      remarks: parentRemarks,
    }).where(eq(orders.id, input.parentOrderId));
    // 5. 记录操作日志
    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "create",
      targetType: "order",
      targetId: String(insertedId),
      description: `零担前段外请子链自动创建：父单#${input.parentOrderId} → 子单#${insertedId}(${systemCode})，状态pending_price，进入指挥台待定价队列`,
    });
    // 6. 尝试自动分配外请调度员
    try {
      const matched = await autoAssignDispatcher(parentOrder.destinationCity);
      if (matched) {
        await db.update(orders).set({
          assignedDispatcherId: matched.dispatcherId,
        }).where(eq(orders.id, insertedId));
      }
    } catch (e) {
      console.error("[createLtlPickupSubchain] autoAssignDispatcher failed:", e);
    }
    return {
      success: true,
      subchainOrderId: insertedId,
      systemCode,
      message: `已自动创建前段外请子单 ${systemCode}，进入指挥台待定价队列`,
    };
  }),
});