import { describe, it, expect } from "vitest";

/**
 * revertStatus 接口逻辑测试
 * 验证退回操作的核心业务逻辑：
 * - 退回到指定目标状态
 * - 退回到 pending_dispatch/pending_vehicle 时强制清空派车信息
 * - 押金重置为 none（而非 null，避免 NOT NULL 约束报错）
 * - 清理已生成的回单记录
 */

// ========== 退回清洗逻辑（与后端 revertStatus 一致） ==========
type OrderStatus = string;

interface RevertCleanResult {
  status: OrderStatus;
  plateNumber: string | null;
  driverName: string | null;
  driverPhone: string | null;
  dispatchDate: number | null;
  depositAmount: string | null;
  depositStatus: string; // 注意：NOT NULL 字段，不能为 null
  actualFreight: string | null;
  totalCost: string | null;
  shouldDeletePodRecords: boolean;
}

// 需要清空派车信息的目标状态
const CLEAR_DISPATCH_STATUSES = [
  "pending_assign", "pending_price", "priced",
  "pending_dispatch", "pending_vehicle", "pending_inquiry", "on_hold"
];

function computeRevertClean(
  currentStatus: string,
  targetStatus: string,
  currentDepositStatus: string
): RevertCleanResult {
  const shouldClearDispatch = CLEAR_DISPATCH_STATUSES.includes(targetStatus);
  const shouldDeletePodRecords = CLEAR_DISPATCH_STATUSES.includes(targetStatus);

  return {
    status: targetStatus,
    plateNumber: shouldClearDispatch ? null : null, // 总是保留当前值除非需要清空
    driverName: shouldClearDispatch ? null : null,
    driverPhone: shouldClearDispatch ? null : null,
    dispatchDate: shouldClearDispatch ? null : null,
    depositAmount: shouldClearDispatch ? null : null,
    depositStatus: shouldClearDispatch ? "none" : currentDepositStatus, // 关键：用 "none" 而非 null
    actualFreight: shouldClearDispatch ? null : null,
    totalCost: shouldClearDispatch ? null : null,
    shouldDeletePodRecords,
  };
}

// ========== 测试用例 ==========

describe("revertStatus - 退回到指定目标状态", () => {
  it("从 dispatched 退回到 pending_dispatch：清空派车信息", () => {
    const result = computeRevertClean("dispatched", "pending_dispatch", "paid");
    expect(result.status).toBe("pending_dispatch");
    expect(result.plateNumber).toBeNull();
    expect(result.driverName).toBeNull();
    expect(result.driverPhone).toBeNull();
    expect(result.dispatchDate).toBeNull();
    expect(result.depositAmount).toBeNull();
    expect(result.depositStatus).toBe("none"); // 关键：不是 null
    expect(result.actualFreight).toBeNull();
    expect(result.totalCost).toBeNull();
    expect(result.shouldDeletePodRecords).toBe(true);
  });

  it("从 dispatched 退回到 pending_vehicle：清空派车信息", () => {
    const result = computeRevertClean("dispatched", "pending_vehicle", "not_refundable");
    expect(result.status).toBe("pending_vehicle");
    expect(result.plateNumber).toBeNull();
    expect(result.depositStatus).toBe("none");
    expect(result.shouldDeletePodRecords).toBe(true);
  });

  it("从 dispatched 退回到 pending_assign：清空所有", () => {
    const result = computeRevertClean("dispatched", "pending_assign", "paid");
    expect(result.status).toBe("pending_assign");
    expect(result.plateNumber).toBeNull();
    expect(result.depositStatus).toBe("none");
    expect(result.shouldDeletePodRecords).toBe(true);
  });

  it("从 in_transit 退回到 dispatched：保留派车信息", () => {
    const result = computeRevertClean("in_transit", "dispatched", "paid");
    expect(result.status).toBe("dispatched");
    expect(result.depositStatus).toBe("paid"); // 保留原始押金状态
    expect(result.shouldDeletePodRecords).toBe(false);
  });

  it("从 delivered 退回到 in_transit：保留派车信息", () => {
    const result = computeRevertClean("delivered", "in_transit", "paid");
    expect(result.status).toBe("in_transit");
    expect(result.depositStatus).toBe("paid");
    expect(result.shouldDeletePodRecords).toBe(false);
  });
});

describe("revertStatus - depositStatus NOT NULL 约束", () => {
  it("depositStatus 永远不为 null（修复退回报错的根本原因）", () => {
    const statuses = [
      "pending_assign", "pending_price", "priced",
      "pending_dispatch", "pending_vehicle", "pending_inquiry",
      "on_hold", "dispatched", "in_transit", "delivered"
    ];

    for (const targetStatus of statuses) {
      const result = computeRevertClean("dispatched", targetStatus, "paid");
      expect(result.depositStatus).not.toBeNull();
      expect(typeof result.depositStatus).toBe("string");
      expect(result.depositStatus.length).toBeGreaterThan(0);
    }
  });

  it("清空派车信息时 depositStatus 重置为 'none'", () => {
    for (const target of CLEAR_DISPATCH_STATUSES) {
      const result = computeRevertClean("dispatched", target, "paid");
      expect(result.depositStatus).toBe("none");
    }
  });

  it("不清空派车信息时保留原始 depositStatus", () => {
    const result1 = computeRevertClean("in_transit", "dispatched", "paid");
    expect(result1.depositStatus).toBe("paid");

    const result2 = computeRevertClean("delivered", "in_transit", "not_refundable");
    expect(result2.depositStatus).toBe("not_refundable");
  });
});

describe("revertStatus - 回单清理", () => {
  it("退回到派车前状态时应删除回单记录", () => {
    for (const target of CLEAR_DISPATCH_STATUSES) {
      const result = computeRevertClean("dispatched", target, "none");
      expect(result.shouldDeletePodRecords).toBe(true);
    }
  });

  it("退回到 dispatched/in_transit 时不删除回单记录", () => {
    const result1 = computeRevertClean("in_transit", "dispatched", "paid");
    expect(result1.shouldDeletePodRecords).toBe(false);

    const result2 = computeRevertClean("delivered", "in_transit", "paid");
    expect(result2.shouldDeletePodRecords).toBe(false);
  });
});

describe("revertStatus - 边界场景", () => {
  it("退回到 on_hold 状态：清空派车信息", () => {
    const result = computeRevertClean("dispatched", "on_hold", "paid");
    expect(result.status).toBe("on_hold");
    expect(result.plateNumber).toBeNull();
    expect(result.depositStatus).toBe("none");
    expect(result.shouldDeletePodRecords).toBe(true);
  });

  it("退回到 pending_inquiry 状态：清空派车信息", () => {
    const result = computeRevertClean("dispatched", "pending_inquiry", "paid");
    expect(result.status).toBe("pending_inquiry");
    expect(result.depositStatus).toBe("none");
    expect(result.shouldDeletePodRecords).toBe(true);
  });

  it("退回到 priced 状态：清空派车信息", () => {
    const result = computeRevertClean("dispatched", "priced", "paid");
    expect(result.status).toBe("priced");
    expect(result.depositStatus).toBe("none");
    expect(result.shouldDeletePodRecords).toBe(true);
  });
});
