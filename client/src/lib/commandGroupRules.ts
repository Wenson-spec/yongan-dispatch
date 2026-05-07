export type CommandGroupGuideTab = "pricing" | "manual" | "approval";

export function isFindVehicleAlignedCommandTab(tab?: string | null) {
  return [
    "pricing",
    "manual-assign",
    "approval",
    "pending",
    "dispatched",
    "pod-tracking",
    "deposit_pending",
    "deposit_done",
  ].includes(tab || "");
}

export function getApprovalTypeLabel(approvalType?: string | null) {
  if (approvalType === "initial_price") return "初始定价";
  if (approvalType === "vehicle_quote") return "车辆报价";
  if (approvalType === "surcharge") return "加价";
  return approvalType || "-";
}

export function getApprovalTypeLabelFromItem(item?: { approvalType?: string | null } | null) {
  return getApprovalTypeLabel(item?.approvalType);
}

function normalizeGroupSummaryValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(
    values
      .map((value) => typeof value === "string" ? value.trim() : "")
      .filter(Boolean),
  ));
}

export function formatGroupDistinctLabel(values: Array<string | null | undefined>, unitLabel: string, fallback = "-") {
  const normalized = normalizeGroupSummaryValues(values);
  if (normalized.length === 0) {
    return fallback;
  }
  if (normalized.length === 1) {
    return normalized[0];
  }
  return `${normalized.join(" / ")}（${normalized.length}${unitLabel}）`;
}

export function getGroupCustomerSummary(orders: any[]) {
  return formatGroupDistinctLabel(orders.map((o: any) => o.customerName), "客户");
}

export function getGroupWarehouseSummary(orders: any[]) {
  return formatGroupDistinctLabel(orders.map((o: any) => o.warehouseName || o.originCity), "仓");
}

export function getGroupCustomerCargoSummary(orders: any[]) {
  const customerSummary = getGroupCustomerSummary(orders);
  const cargoSummary = formatGroupDistinctLabel(
    orders.map((o: any) => o.cargoName || o.productName),
    "货",
  );
  return `${customerSummary} · ${cargoSummary}`;
}

export function getGroupRouteSummary(orders: any[]) {
  const originSummary = formatGroupDistinctLabel(
    orders.map((o: any) => o.originCity),
    "地",
    "-",
  );
  const destinations = normalizeGroupSummaryValues(orders.map((o: any) => o.destinationCity));
  if (destinations.length === 0) {
    return `${originSummary} → -`;
  }
  if (destinations.length === 1) {
    return `${originSummary} → ${destinations[0]}`;
  }
  return `${originSummary} → ${destinations.join(" / ")}（${destinations.length}地）`;
}

export function getCommandGroupGuide(tab: CommandGroupGuideTab) {
  if (tab === "pricing") {
    return {
      titlePrefix: "整理单参考批次",
      badgeText: "支持整组定价/加急/退回/删除",
      hintText: "当前页签参考找车台组合单展示；主订单支持整组定价，也支持按整组或当前筛选结果批量加急、退回、删除，子订单仅作明细预览。",
      childHint: "子订单仅随主订单整组操作，不支持单独定价、加急、退回或删除",
    };
  }
  if (tab === "manual") {
    return {
      titlePrefix: "待分配参考批次",
      badgeText: "支持整组分配/加急/退回/删除",
      hintText: "当前页签参考找车台组合单展示；主订单支持整组分配调度员，也支持按整组或当前筛选结果批量加急、退回、删除，子订单仅作明细预览。",
      childHint: "子订单仅随主订单整组操作，不支持单独分配、加急、退回或删除",
    };
  }
  return {
    titlePrefix: "待审批参考批次",
    badgeText: "支持整组审批/加急/退回/删除",
    hintText: "当前页签参考找车台组合单展示；主订单支持整组通过或驳回，也支持按整组或当前筛选结果批量加急、退回、删除，子订单仅作审批明细预览。",
    childHint: "子订单仅随主订单整组操作，不支持单独审批、加急、退回或删除",
  };
}

export function getApprovalApplicants(items: any[]) {
  return Array.from(new Set(items.map((item: any) => item.applicantName).filter(Boolean))).join("/") || "-";
}

export function isMergedChildOrder(order: any) {
  const hasMergedPlanNumber = Boolean(order?.mergedPlanNumber);
  if (!hasMergedPlanNumber) return false;

  const isExplicitMergedChild = order?.isMerged === false;
  const isMergedStatusChild = Boolean(order?.parentId && order?.status === "merged");

  return isExplicitMergedChild || isMergedStatusChild;
}

export function getMergedChildActionLockReason(order: any, actionLabel: string, fallbackReason?: string) {
  if (!isMergedChildOrder(order)) return null;
  return fallbackReason || `当前是合并子订单，请在主订单统一${actionLabel}整组合并单。`;
}

export function getMergedChildBusinessTypeLockReason(order: any) {
  return getMergedChildActionLockReason(order, "修改业务类型", "当前是合并子订单，业务类型只能在主订单统一修改。");
}

export function getMergedChildDeleteLockReason(order: any) {
  return getMergedChildActionLockReason(order, "删除");
}

export function getMergedChildRollbackLockReason(order: any) {
  return getMergedChildActionLockReason(order, "退回");
}

export function getApprovalTypeSummary(items: any[]) {
  return Array.from(new Set(items.map((item: any) => getApprovalTypeLabelFromItem(item)).filter(Boolean))).join(" / ") || "-";
}
