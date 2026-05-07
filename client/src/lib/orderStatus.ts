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
