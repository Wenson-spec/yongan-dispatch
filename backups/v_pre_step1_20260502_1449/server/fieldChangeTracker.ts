/**
 * 字段级变更追踪工具
 * 用于在更新操作时记录每个字段的旧值和新值
 */

// 字段中文名映射
export const FIELD_LABELS: Record<string, string> = {
  orderNumber: "客户订单号",
  mergedPlanNumber: "合并计划号",
  businessType: "业务类型",
  department: "部门",
  isUrgent: "加急",
  urgentReason: "加急原因",
  customerId: "客户ID",
  customerName: "客户名称",
  customerPhone: "客户电话",
  cargoName: "货物名称",
  cargoType: "货物类型",
  weight: "重量(吨)",
  volume: "体积(方)",
  quantity: "件数",
  originProvince: "发货省份",
  originCity: "发货城市",
  originAddress: "发货详细地址",
  destinationProvince: "目的省份",
  destinationCity: "目的城市",
  destinationAddress: "目的详细地址",
  receiverName: "收货人",
  receiverPhone: "收货电话",
  quotedPrice: "报价",
  customerPrice: "客户价格",
  actualFreight: "实际运费",
  dispatchPrice: "调度价",
  plateNumber: "车牌号",
  driverName: "司机姓名",
  driverPhone: "司机电话",
  shippingNote: "发货备注",
  receivingNote: "收货备注",
  dispatcherRemark: "调度备注",
  status: "订单状态",
  depositAmount: "押金金额",
  depositStatus: "押金状态",
  podStatus: "回单状态",
  freightStationName: "货站名称",
  freightWaybillNumber: "货站运单号",
  inquiryPhone: "查货电话",
  ltlUnitPrice: "零担单价",
  ltlDeliveryFee: "送货费",
  ltlOtherFee: "其他费用",
  orderDate: "订单日期",
  assignedDispatcherId: "调度员ID",
};

// 业务类型标签
const BUSINESS_TYPE_LABELS: Record<string, string> = {
  outsource: "外请",
  self: "自运",
  ltl: "零担",
};

// 状态标签
const STATUS_LABELS: Record<string, string> = {
  pending_assign: "待分配",
  pending_price: "待定价",
  pending_vehicle: "待找车",
  in_transit: "运输中",
  delivered: "已送达",
  signed: "已签收",
  settled: "已结算",
  cancelled: "已取消",
  on_hold: "暂扣",
  pending_inquiry: "待询价",
  inquiry_replied: "已询价",
  ltl_in_transit: "零担运输中",
  ltl_arrived: "零担已到达",
};

// 押金状态标签
const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  none: "无押金",
  paid: "已收取",
  refunded: "已退还",
  not_returned: "不退还",
};

// 回单状态标签
const POD_STATUS_LABELS: Record<string, string> = {
  pending: "待收",
  original_sent: "已寄出",
  received: "已收到",
};

export interface FieldChange {
  field: string;
  label: string;
  oldValue: string | null;
  newValue: string | null;
}

/**
 * 格式化字段值为可读字符串
 */
function formatValue(field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (field === "businessType") return BUSINESS_TYPE_LABELS[String(value)] || String(value);
  if (field === "status") return STATUS_LABELS[String(value)] || String(value);
  if (field === "depositStatus") return DEPOSIT_STATUS_LABELS[String(value)] || String(value);
  if (field === "podStatus") return POD_STATUS_LABELS[String(value)] || String(value);
  if (field === "isUrgent") return value ? "是" : "否";
  if (value instanceof Date) return value.toLocaleString("zh-CN");

  return String(value);
}

/**
 * 对比旧记录和新数据，返回变更字段列表
 * @param oldRecord 数据库中的旧记录
 * @param newData 要更新的新数据（只包含要更新的字段）
 * @returns 变更字段列表
 */
export function trackFieldChanges(
  oldRecord: Record<string, unknown>,
  newData: Record<string, unknown>,
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const [field, newValue] of Object.entries(newData)) {
    // 跳过 id 和系统字段
    if (["id", "createdAt", "updatedAt", "createdBy"].includes(field)) continue;
    // 跳过 undefined 值（表示不更新）
    if (newValue === undefined) continue;

    const oldValue = oldRecord[field];

    // 对比值（处理类型差异）
    const oldStr = formatValue(field, oldValue);
    const newStr = formatValue(field, newValue);

    // 值相同则跳过
    if (oldStr === newStr) continue;
    // 都是空值也跳过
    if (!oldStr && !newStr) continue;

    changes.push({
      field,
      label: FIELD_LABELS[field] || field,
      oldValue: oldStr,
      newValue: newStr,
    });
  }

  return changes;
}

export interface EntryQueuePendingAssignEvent {
  enteredAt: Date;
  eventType: "returned" | "rerouted";
  returnedBy: string | null;
  reason: string | null;
  fromStatus: string | null;
  fromLabel: string | null;
  description: string | null;
  action: string | null;
}

export function extractStatusTransition(changes: unknown): {
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
} {
  if (!changes || typeof changes !== "object") {
    return { fromStatus: null, toStatus: null, reason: null };
  }

  const payload = changes as Record<string, unknown>;
  const rawUpdate = payload.rawUpdate && typeof payload.rawUpdate === "object"
    ? payload.rawUpdate as Record<string, unknown>
    : null;

  const fromStatus = typeof payload.fromStatus === "string"
    ? payload.fromStatus
    : null;
  const toStatus = typeof payload.toStatus === "string"
    ? payload.toStatus
    : typeof rawUpdate?.status === "string"
      ? rawUpdate.status
      : typeof payload.status === "string"
        ? payload.status
        : null;
  const reason = typeof payload.reason === "string"
    ? payload.reason
    : typeof rawUpdate?.reason === "string"
      ? rawUpdate.reason
      : null;

  return { fromStatus, toStatus, reason };
}

export function classifyEntryQueuePendingAssignEvent(
  log: {
    action?: string | null;
    changes?: unknown;
    createdAt: Date;
    userName?: string | null;
    description?: string | null;
  },
  statusLabels: Record<string, string>,
): EntryQueuePendingAssignEvent | null {
  const { fromStatus, toStatus, reason } = extractStatusTransition(log.changes);
  if (toStatus !== "pending_assign") {
    return null;
  }

  const isReturned = log.action === "rollback" || log.action === "revert";

  return {
    enteredAt: log.createdAt,
    eventType: isReturned ? "returned" : "rerouted",
    returnedBy: isReturned ? (log.userName ?? null) : null,
    reason: isReturned ? reason : null,
    fromStatus: isReturned ? fromStatus : null,
    fromLabel: isReturned && fromStatus ? (statusLabels[fromStatus] || fromStatus) : null,
    description: log.description ?? null,
    action: log.action ?? null,
  };
}
