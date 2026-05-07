import { describe, expect, it } from "vitest";
import { classifyEntryQueuePendingAssignEvent } from "./fieldChangeTracker";

const STATUS_LABELS: Record<string, string> = {
  pending_assign: "待指派",
  pending_inquiry: "待询价",
  inquiry_confirmed: "已询价",
  shipped: "已发运",
  pending_price: "待定价",
};

function resolveLatestReturn(logs: Array<{
  action?: string | null;
  changes?: unknown;
  createdAt: Date;
  userName?: string | null;
  description?: string | null;
}>) {
  for (const log of logs) {
    const event = classifyEntryQueuePendingAssignEvent(log, STATUS_LABELS);
    if (!event) continue;
    return event.eventType === "returned" ? event : null;
  }
  return null;
}

describe("录单台 pending_assign 事件分类", () => {
  it("真实退回到 pending_assign 时应标记为 returned", () => {
    const event = classifyEntryQueuePendingAssignEvent({
      action: "rollback",
      createdAt: new Date("2026-04-02T09:00:00Z"),
      userName: "调度甲",
      description: "订单 A001 退回：待询价 → 待指派，原因：客户改约",
      changes: {
        fromStatus: "pending_inquiry",
        toStatus: "pending_assign",
        reason: "客户改约",
      },
    }, STATUS_LABELS);

    expect(event).not.toBeNull();
    expect(event?.eventType).toBe("returned");
    expect(event?.returnedBy).toBe("调度甲");
    expect(event?.reason).toBe("客户改约");
    expect(event?.fromStatus).toBe("pending_inquiry");
    expect(event?.fromLabel).toBe("待询价");
  });

  it("业务类型切换后回到 pending_assign 时应标记为 rerouted 而不是 returned", () => {
    const event = classifyEntryQueuePendingAssignEvent({
      action: "update",
      createdAt: new Date("2026-04-02T10:00:00Z"),
      userName: "客服乙",
      description: "更新订单 #12：业务类型、订单状态",
      changes: {
        fieldChanges: [
          { field: "businessType", label: "业务类型", oldValue: "零担", newValue: "外请" },
          { field: "status", label: "订单状态", oldValue: "待询价", newValue: "待指派" },
        ],
        rawUpdate: {
          businessType: "outsource",
          status: "pending_assign",
        },
      },
    }, STATUS_LABELS);

    expect(event).not.toBeNull();
    expect(event?.eventType).toBe("rerouted");
    expect(event?.returnedBy).toBeNull();
    expect(event?.reason).toBeNull();
    expect(event?.fromStatus).toBeNull();
    expect(event?.fromLabel).toBeNull();
  });

  it("最近一次进入 pending_assign 是正常回流时，不应继续显示更早的退回记录", () => {
    const latestReturn = resolveLatestReturn([
      {
        action: "update",
        createdAt: new Date("2026-04-02T10:00:00Z"),
        userName: "客服乙",
        description: "更新订单 #12：业务类型、订单状态",
        changes: {
          fieldChanges: [
            { field: "businessType", label: "业务类型", oldValue: "零担", newValue: "外请" },
            { field: "status", label: "订单状态", oldValue: "待询价", newValue: "待指派" },
          ],
          rawUpdate: {
            businessType: "outsource",
            status: "pending_assign",
          },
        },
      },
      {
        action: "rollback",
        createdAt: new Date("2026-04-02T09:30:00Z"),
        userName: "调度甲",
        description: "订单 A001 退回：待询价 → 待指派，原因：客户改约",
        changes: {
          fromStatus: "pending_inquiry",
          toStatus: "pending_assign",
          reason: "客户改约",
        },
      },
    ]);

    expect(latestReturn).toBeNull();
  });
});
