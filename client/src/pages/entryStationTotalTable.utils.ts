export type EntryStationOrderLike = {
  id?: number | string | null;
  orderNumber?: string | null;
  systemCode?: string | null;
  mergedPlanNumber?: string | null;
  parentId?: number | null;
  isMerged?: boolean | null;
  status?: string | null;
  businessType?: string | null;
  dispatcherName?: string | null;
  customerName?: string | null;
  cargoName?: string | null;
  weight?: string | null;
  originCity?: string | null;
  destinationCity?: string | null;
  orderDate?: string | Date | null;
  updatedAt?: string | Date | null;
  isUrgent?: boolean | null;
  createdAt?: string | Date | null;
  entryQueueReason?: string | null;
  entryQueueSourceStatus?: string | null;
};

export const PROGRESS_STAGE_LABELS: Record<string, string> = {
  pending_assign: "录单待分流",
  pending_price: "待定价",
  pending_dispatch: "待派车",
  pending_vehicle: "待找车",
  pending_approval: "待审批",
  pending_inquiry: "待询价",
  inquiry_confirmed: "待发运",
  shipped: "已发运待跟踪",
  priced: "已定价待流转",
  dispatched: "已调度待执行",
  in_transit: "运输中",
  delivered: "已送达待签收",
  signed: "已签收待回单",
  settled: "已结算完成",
  on_hold: "暂停待通知",
  cancelled: "已取消",
};

export function getOrderWorkbenchMeta(order: EntryStationOrderLike) {
  if (order?.status === "pending_assign") {
    return { path: "/station/entry", label: "录单台" };
  }
  if (["pending_price", "priced", "pending_approval"].includes(String(order?.status || ""))) {
    return { path: "/station/command", label: "指挥台" };
  }
  if (order?.status === "pending_dispatch") {
    return { path: "/station/dispatch-vehicle", label: "派车台" };
  }
  if (["pending_inquiry", "inquiry_confirmed", "shipped"].includes(String(order?.status || ""))) {
    return { path: "/station/ltl-workspace", label: "零担统一工作台" };
  }
  if (["signed", "settled"].includes(String(order?.status || ""))) {
    return { path: "/station/pod-deposit", label: "回单押金台" };
  }
  if (order?.businessType === "self") {
    return { path: "/station/dispatch-vehicle", label: "派车台" };
  }
  if (order?.businessType === "ltl") {
    return { path: "/station/ltl-workspace", label: "零担统一工作台" };
  }
  return { path: "/station/find-vehicle", label: "找车台" };
}

export function getOrderOwnerLabel(order: EntryStationOrderLike) {
  if (order?.status === "cancelled") return "已取消";
  if (order?.status === "on_hold") return "等通知";
  if (order?.status === "pending_assign") return "录单台";
  if (["pending_price", "priced", "pending_approval"].includes(String(order?.status || ""))) return "客服经理";
  if (["signed", "settled"].includes(String(order?.status || ""))) return "回单押金台";
  if (order?.dispatcherName) return order.dispatcherName;
  return getOrderWorkbenchMeta(order).label;
}

export function getOrderPrimaryStatusLabel(order: EntryStationOrderLike) {
  return PROGRESS_STAGE_LABELS[String(order?.status || "")] || String(order?.status || "处理中");
}

export function getOrderPublicViewReason(order: EntryStationOrderLike, scope: "pool" | "overview" = "pool") {
  if (scope === "overview") {
    return "公共总览：跨工作台聚合展示，不代表唯一归属工位";
  }
  if (order?.status === "pending_assign") {
    if (order?.entryQueueReason === "returned") return "公共录单池：退回待处理";
    if (order?.entryQueueReason === "new") return "公共录单池：新建待分流";
    if (order?.entryQueueReason === "rerouted") return "公共录单池：重新分流待处理";
    return "公共录单池：录单待分流";
  }
  return `公共订单池：按主状态“${getOrderPrimaryStatusLabel(order)}”同步展示`; 
}

export function sortEntryStationTotalOrders(items: EntryStationOrderLike[]) {
  return [...items].sort((a, b) => {
    const urgentDiff = Number(Boolean(b.isUrgent)) - Number(Boolean(a.isUrgent));
    if (urgentDiff !== 0) return urgentDiff;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
}

export function getEntryStationTotalPlanKey(order: EntryStationOrderLike) {
  const planNumber = String(order?.mergedPlanNumber || "").trim();
  return planNumber || null;
}

export function buildEntryStationTotalPlanMeta(items: EntryStationOrderLike[]) {
  const sortedItems = sortEntryStationTotalOrders(items);
  const groupSizes = new Map<string, number>();
  const leadIds = new Map<string, EntryStationOrderLike["id"]>();

  sortedItems.forEach((item) => {
    const key = getEntryStationTotalPlanKey(item);
    if (!key) return;
    groupSizes.set(key, (groupSizes.get(key) || 0) + 1);
    if (!leadIds.has(key)) {
      leadIds.set(key, item.id ?? null);
    }
  });

  return { groupSizes, leadIds };
}

export function isEntryStationTotalPlanGrouped(
  order: EntryStationOrderLike,
  groupSizes: Map<string, number>,
) {
  const key = getEntryStationTotalPlanKey(order);
  if (!key) return false;
  return (groupSizes.get(key) || 0) > 1;
}

export function isEntryStationTotalPlanLead(
  order: EntryStationOrderLike,
  leadIds: Map<string, EntryStationOrderLike["id"]>,
) {
  const key = getEntryStationTotalPlanKey(order);
  if (!key) return false;
  return leadIds.get(key) === (order.id ?? null);
}

export function isEntryStationPlanFollower(
  order: EntryStationOrderLike,
  groupSizes: Map<string, number>,
  leadIds: Map<string, EntryStationOrderLike["id"]>,
) {
  const key = getEntryStationTotalPlanKey(order);
  if (!key) return false;
  if ((groupSizes.get(key) || 0) <= 1) return false;
  return !isEntryStationTotalPlanLead(order, leadIds);
}

export function summarizeTotalOrders(items: EntryStationOrderLike[]) {
  return {
    active: items.filter((item) => !["settled", "cancelled"].includes(String(item.status || ""))).length,
    transit: items.filter((item) => ["dispatched", "in_transit", "shipped"].includes(String(item.status || ""))).length,
    podPending: items.filter((item) => ["delivered", "signed"].includes(String(item.status || ""))).length,
    done: items.filter((item) => item.status === "settled").length,
  };
}
