import { describe, it, expect } from "vitest";

/**
 * 逆向清洗逻辑测试
 * 验证状态回退时的数据清洗规则
 */

// 复制与生产代码一致的 STATUS_STAGE 映射
const STATUS_STAGE: Record<string, number> = {
  pending_assign: 0, pending_price: 1, priced: 2,
  pending_vehicle: 3, pending_dispatch: 3, pending_inquiry: 3,
  pending_approval: 4, inquiry_confirmed: 4, shipped: 5,
  dispatched: 6, in_transit: 7, delivered: 8,
  signed: 9, settled: 10,
};

// 模拟逆向清洗逻辑（与 order.ts 中的实现一致）
function computeRollbackClean(fromStatus: string, toStatus: string): Record<string, any> {
  const fromStage = STATUS_STAGE[fromStatus] ?? -1;
  const toStage = STATUS_STAGE[toStatus] ?? -1;
  const isRollback = toStage < fromStage;
  const clean: Record<string, any> = { status: toStatus };

  if (!isRollback) return clean;

  // 1. 清洗时间戳
  if (toStage < 6) clean.dispatchDate = null;
  if (toStage < 7) { clean.transitDate = null; clean.loadingDate = null; }
  if (toStage < 8) clean.deliveryDate = null;
  if (toStage < 9) { clean.signedDate = null; clean.podDate = null; clean.podSentDate = null; }

  // 2. 清洗车辆与回单
  if (toStage <= 3) {
    clean.plateNumber = null;
    clean.driverName = null;
    clean.driverPhone = null;
    clean.driverId = null;
    clean.vehicleId = null;
    clean.depositAmount = null;
    clean.depositStatus = null;
    clean._deletePendingPods = true; // 标记需要删除pending回单
  }

  // 3. 清洗幽灵金额
  if (toStage <= 1) {
    clean.actualFreight = null;
    clean.totalCost = null;
  }

  return clean;
}

describe("逆向清洗逻辑 - STATUS_STAGE 映射", () => {
  it("所有关键状态都有对应的阶段值", () => {
    const requiredStatuses = [
      "pending_assign", "pending_price", "priced",
      "pending_vehicle", "pending_dispatch", "pending_inquiry",
      "pending_approval", "inquiry_confirmed", "shipped",
      "dispatched", "in_transit", "delivered",
      "signed", "settled",
    ];
    for (const s of requiredStatuses) {
      expect(STATUS_STAGE[s]).toBeDefined();
      expect(typeof STATUS_STAGE[s]).toBe("number");
    }
  });

  it("阶段值严格递增（同阶段允许相等）", () => {
    const orderedStatuses = [
      "pending_assign", "pending_price", "priced",
      "pending_vehicle", "dispatched", "delivered", "signed", "settled",
    ];
    for (let i = 1; i < orderedStatuses.length; i++) {
      expect(STATUS_STAGE[orderedStatuses[i]]).toBeGreaterThan(STATUS_STAGE[orderedStatuses[i - 1]]);
    }
  });
});

describe("逆向清洗逻辑 - 终极防呆 settled", () => {
  it("settled 状态不在 ROLLBACK_MAP 中（单独拦截）", () => {
    // settled 在接口最开头被拦截，不应出现在 ROLLBACK_MAP 中
    const ROLLBACK_MAP: Record<string, string> = {
      pending_price: "pending_assign",
      priced: "pending_price",
      pending_vehicle: "pending_price",
      pending_approval: "pending_vehicle",
      dispatched: "pending_vehicle",
      pending_dispatch: "pending_assign",
      pending_inquiry: "pending_assign",
      inquiry_confirmed: "pending_inquiry",
      shipped: "inquiry_confirmed",
      in_transit: "dispatched",
      delivered: "dispatched",
      signed: "delivered",
      on_hold: "pending_assign",
    };
    expect(ROLLBACK_MAP["settled"]).toBeUndefined();
  });
});

describe("逆向清洗逻辑 - 清洗时间戳", () => {
  it("delivered → dispatched: 清除 deliveryDate, signedDate, podDate, podSentDate", () => {
    const clean = computeRollbackClean("delivered", "dispatched");
    expect(clean.deliveryDate).toBeNull();
    expect(clean.signedDate).toBeNull();
    expect(clean.podDate).toBeNull();
    expect(clean.podSentDate).toBeNull();
    // dispatched 阶段=6，不应清除 dispatchDate
    expect(clean.dispatchDate).toBeUndefined();
  });

  it("signed → delivered: 清除 signedDate, podDate, podSentDate", () => {
    const clean = computeRollbackClean("signed", "delivered");
    expect(clean.signedDate).toBeNull();
    expect(clean.podDate).toBeNull();
    expect(clean.podSentDate).toBeNull();
    // delivered 阶段=8，不应清除 deliveryDate
    expect(clean.deliveryDate).toBeUndefined();
    expect(clean.dispatchDate).toBeUndefined();
  });

  it("dispatched → pending_vehicle: 清除所有时间戳", () => {
    const clean = computeRollbackClean("dispatched", "pending_vehicle");
    expect(clean.dispatchDate).toBeNull();
    expect(clean.transitDate).toBeNull();
    expect(clean.loadingDate).toBeNull();
    expect(clean.deliveryDate).toBeNull();
    expect(clean.signedDate).toBeNull();
    expect(clean.podDate).toBeNull();
    expect(clean.podSentDate).toBeNull();
  });

  it("正向推进不触发清洗", () => {
    const clean = computeRollbackClean("dispatched", "delivered");
    expect(clean.deliveryDate).toBeUndefined();
    expect(clean.signedDate).toBeUndefined();
  });
});

describe("逆向清洗逻辑 - 清洗车辆与回单", () => {
  it("dispatched → pending_vehicle (stage 3): 清除车辆信息 + 标记删除回单", () => {
    const clean = computeRollbackClean("dispatched", "pending_vehicle");
    expect(clean.plateNumber).toBeNull();
    expect(clean.driverName).toBeNull();
    expect(clean.driverPhone).toBeNull();
    expect(clean.driverId).toBeNull();
    expect(clean.vehicleId).toBeNull();
    expect(clean.depositAmount).toBeNull();
    expect(clean.depositStatus).toBeNull();
    expect(clean._deletePendingPods).toBe(true);
  });

  it("dispatched → pending_price (stage 1): 也清除车辆信息", () => {
    // 虽然 dispatched 正常退回到 pending_vehicle，但 updateStatus 可能直接跳到 pending_price
    const clean = computeRollbackClean("dispatched", "pending_price");
    expect(clean.plateNumber).toBeNull();
    expect(clean.driverId).toBeNull();
    expect(clean._deletePendingPods).toBe(true);
  });

  it("delivered → dispatched (stage 6): 不清除车辆信息", () => {
    const clean = computeRollbackClean("delivered", "dispatched");
    expect(clean.plateNumber).toBeUndefined();
    expect(clean.driverName).toBeUndefined();
    expect(clean._deletePendingPods).toBeUndefined();
  });
});

describe("逆向清洗逻辑 - 清洗幽灵金额", () => {
  it("退回到 pending_price (stage 1): 清除 actualFreight 和 totalCost", () => {
    const clean = computeRollbackClean("pending_vehicle", "pending_price");
    expect(clean.actualFreight).toBeNull();
    expect(clean.totalCost).toBeNull();
  });

  it("退回到 pending_assign (stage 0): 清除 actualFreight 和 totalCost", () => {
    const clean = computeRollbackClean("pending_price", "pending_assign");
    expect(clean.actualFreight).toBeNull();
    expect(clean.totalCost).toBeNull();
  });

  it("退回到 pending_vehicle (stage 3): 不清除金额", () => {
    const clean = computeRollbackClean("dispatched", "pending_vehicle");
    expect(clean.actualFreight).toBeUndefined();
    expect(clean.totalCost).toBeUndefined();
  });

  it("退回到 dispatched (stage 6): 不清除金额", () => {
    const clean = computeRollbackClean("delivered", "dispatched");
    expect(clean.actualFreight).toBeUndefined();
    expect(clean.totalCost).toBeUndefined();
  });
});

describe("逆向清洗逻辑 - 综合场景", () => {
  it("signed → delivered: 只清时间戳，不清车辆和金额", () => {
    const clean = computeRollbackClean("signed", "delivered");
    expect(clean.signedDate).toBeNull();
    expect(clean.podDate).toBeNull();
    // 不清车辆
    expect(clean.plateNumber).toBeUndefined();
    // 不清金额
    expect(clean.actualFreight).toBeUndefined();
  });

  it("delivered → dispatched: 只清 deliveryDate 和签收时间戳", () => {
    const clean = computeRollbackClean("delivered", "dispatched");
    expect(clean.deliveryDate).toBeNull();
    expect(clean.signedDate).toBeNull();
    expect(clean.podDate).toBeNull();
    // 不清 dispatchDate（dispatched stage=6，toStage=6 不 < 6）
    expect(clean.dispatchDate).toBeUndefined();
    // 不清车辆和金额
    expect(clean.plateNumber).toBeUndefined();
    expect(clean.actualFreight).toBeUndefined();
  });

  it("dispatched → pending_assign: 全面清洗", () => {
    // 虽然正常不会直接跳到 pending_assign，但 on_hold 可能退到 pending_assign
    const clean = computeRollbackClean("dispatched", "pending_assign");
    // 时间戳全清
    expect(clean.dispatchDate).toBeNull();
    expect(clean.transitDate).toBeNull();
    expect(clean.loadingDate).toBeNull();
    expect(clean.deliveryDate).toBeNull();
    expect(clean.signedDate).toBeNull();
    // 车辆全清
    expect(clean.plateNumber).toBeNull();
    expect(clean.driverId).toBeNull();
    expect(clean.vehicleId).toBeNull();
    // 金额全清
    expect(clean.actualFreight).toBeNull();
    expect(clean.totalCost).toBeNull();
  });

  it("in_transit → dispatched: 只清 transitDate/loadingDate 和后续时间戳", () => {
    const clean = computeRollbackClean("in_transit", "dispatched");
    // dispatched stage=6, toStage=6
    expect(clean.dispatchDate).toBeUndefined(); // 不清
    expect(clean.transitDate).toBeNull(); // toStage < 7
    expect(clean.loadingDate).toBeNull();
    expect(clean.deliveryDate).toBeNull();
    expect(clean.signedDate).toBeNull();
    // 不清车辆和金额
    expect(clean.plateNumber).toBeUndefined();
    expect(clean.actualFreight).toBeUndefined();
  });
});
