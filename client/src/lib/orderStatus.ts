export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_assign: "待分配",
  pending_price: "待定价",
  pending_dispatch: "待派车",
  pending_vehicle: "待找车",
  pending_approval: "待审批",
  pending_inquiry: "待询价",
  inquiry_confirmed: "已询价",
  shipped: "已发运",
  dispatched: "已调度",
  in_transit: "运输中",
  delivered: "已送达",
  signed: "已签收",
  cancelled: "已取消",
  on_hold: "等通知",
  settled: "已结算",
};

export function getOrderStatusLabel(status?: string | null) {
  if (!status) return "-";
  return ORDER_STATUS_LABELS[status] || status;
}

// ─── 零担工作台状态字典 ────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<string, string> = {
  pending_assign: "待分配",
  pending_inquiry: "待询价",
  inquiry_confirmed: "已询价",
  shipped: "已发运",
  pending_price: "待定价",
  pending_find_vehicle: "待找车",
  pending_dispatch: "待派车",
  dispatched: "已调度",
  in_transit: "运输中",
  delivered: "已送达",
  signed: "已签收",
  settled: "已结算",
  priced: "已定价",
};

export const STATUS_COLORS: Record<string, string> = {
  pending_assign: "bg-yellow-100 text-yellow-700",
  pending_inquiry: "bg-cyan-100 text-cyan-700",
  inquiry_confirmed: "bg-teal-100 text-teal-700",
  dispatched: "bg-indigo-100 text-indigo-700",
  in_transit: "bg-green-100 text-green-700",
  delivered: "bg-emerald-100 text-emerald-700",
  signed: "bg-green-200 text-green-800",
  settled: "bg-green-200 text-green-800",
  // LtlDispatchWorkspace 额外条目
  shipped: "bg-blue-100 text-blue-700",
};

export const ROLLBACK_MAP: Record<string, string> = {
  pending_price: "待处理",
  pending_find_vehicle: "待定价",
  pending_dispatch: "待找车",
  dispatched: "待派车",
  in_transit: "已调度",
  delivered: "运输中",
  signed: "已送达",
  inquiry_confirmed: "待询价",
  pending_inquiry: "",
  pending_assign: "",
};

export const BUSINESS_TYPE_LABELS: Record<string, string> = {
  outsource: "外请",
  self: "自运",
  ltl: "零担",
};

export const SETTLEMENT_LABELS: Record<string, string> = {
  monthly: "月结",
  cash: "现付",
  collect: "到付",
};

export const RECEIVING_STATUS_LABELS: Record<string, string> = {
  receivable: "可收货",
  wait_notice: "等通知",
  not_receivable: "暂不收货",
};
