import {
  PROGRESS_STAGE_LABELS,
  getOrderOwnerLabel,
  getOrderWorkbenchMeta,
  sortEntryStationTotalOrders,
  summarizeTotalOrders,
} from "./entryStationTotalTable.utils";

describe("entryStation total table utils", () => {
  it("keeps progress stage labels for key statuses", () => {
    expect(PROGRESS_STAGE_LABELS.pending_assign).toBe("录单待分流");
    expect(PROGRESS_STAGE_LABELS.pending_vehicle).toBe("待找车");
    expect(PROGRESS_STAGE_LABELS.signed).toBe("已签收待回单");
  });

  it("routes orders to the correct workstation by status first", () => {
    expect(getOrderWorkbenchMeta({ status: "pending_assign", businessType: "outsource" })).toEqual({
      path: "/station/entry",
      label: "录单台",
    });

    expect(getOrderWorkbenchMeta({ status: "pending_price", businessType: "outsource" })).toEqual({
      path: "/station/command",
      label: "指挥台",
    });

    expect(getOrderWorkbenchMeta({ status: "pending_dispatch", businessType: "self" })).toEqual({
      path: "/station/dispatch-vehicle",
      label: "派车台",
    });

    expect(getOrderWorkbenchMeta({ status: "signed", businessType: "outsource" })).toEqual({
      path: "/station/pod-deposit",
      label: "回单管理台",
    });
  });

  it("falls back to business type when status does not directly map to a workstation", () => {
    expect(getOrderWorkbenchMeta({ status: "delivered", businessType: "ltl" })).toEqual({
      path: "/station/ltl-workspace",
      label: "零担工作台",
    });

    expect(getOrderWorkbenchMeta({ status: "delivered", businessType: "self" })).toEqual({
      path: "/station/dispatch-vehicle",
      label: "派车台",
    });

    expect(getOrderWorkbenchMeta({ status: "delivered", businessType: "outsource" })).toEqual({
      path: "/station/find-vehicle",
      label: "找车台",
    });
  });

  it("derives owner labels from status and dispatcher priority", () => {
    expect(getOrderOwnerLabel({ status: "pending_assign" })).toBe("录单台");
    expect(getOrderOwnerLabel({ status: "pending_approval" })).toBe("客服经理");
    expect(getOrderOwnerLabel({ status: "signed", dispatcherName: "张三" })).toBe("回单管理台");
    expect(getOrderOwnerLabel({ status: "delivered", dispatcherName: "李四" })).toBe("李四");
    expect(getOrderOwnerLabel({ status: "cancelled" })).toBe("已取消");
  });

  it("sorts urgent orders to the top and keeps each group in created-at descending order", () => {
    const sorted = sortEntryStationTotalOrders([
      { status: "pending_assign", isUrgent: false, createdAt: "2026-04-01T08:00:00.000Z" },
      { status: "pending_assign", isUrgent: true, createdAt: "2026-04-01T09:00:00.000Z" },
      { status: "pending_assign", isUrgent: true, createdAt: "2026-04-01T10:00:00.000Z" },
      { status: "pending_assign", isUrgent: false, createdAt: "2026-04-01T11:00:00.000Z" },
    ]);

    expect(sorted.map((item) => ({ isUrgent: item.isUrgent, createdAt: item.createdAt }))).toEqual([
      { isUrgent: true, createdAt: "2026-04-01T10:00:00.000Z" },
      { isUrgent: true, createdAt: "2026-04-01T09:00:00.000Z" },
      { isUrgent: false, createdAt: "2026-04-01T11:00:00.000Z" },
      { isUrgent: false, createdAt: "2026-04-01T08:00:00.000Z" },
    ]);
  });

  it("summarizes current page totals for active, transit, pod pending and settled orders", () => {
    const summary = summarizeTotalOrders([
      { status: "pending_assign" },
      { status: "dispatched" },
      { status: "in_transit" },
      { status: "shipped" },
      { status: "delivered" },
      { status: "signed" },
      { status: "settled" },
      { status: "cancelled" },
    ]);

    expect(summary).toEqual({
      active: 6,
      transit: 3,
      podPending: 2,
      done: 1,
    });
  });
});
