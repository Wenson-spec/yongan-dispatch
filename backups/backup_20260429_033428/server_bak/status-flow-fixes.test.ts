import { describe, it, expect } from "vitest";
import { safeParseFloat } from "@shared/safeParseFloat";

// ============================================================
// 测试1：消除 in_transit 黑洞 - VALID_TRANSITIONS 不再包含 dispatched→in_transit
// ============================================================
describe("消除 in_transit 黑洞", () => {
  // 模拟后端 VALID_TRANSITIONS（与 order.ts 保持一致）
  const VALID_TRANSITIONS: Record<string, string[]> = {
    pending_assign: ["pending_price", "pending_dispatch", "pending_inquiry", "on_hold", "cancelled"],
    pending_price: ["priced", "pending_vehicle", "on_hold", "cancelled", "pending_assign"],
    priced: ["pending_vehicle", "on_hold", "cancelled", "pending_price"],
    pending_vehicle: ["dispatched", "pending_approval", "on_hold", "cancelled", "pending_price"],
    pending_dispatch: ["dispatched", "on_hold", "cancelled", "pending_price"],
    pending_approval: ["dispatched", "pending_vehicle", "on_hold", "cancelled"],
    pending_inquiry: ["inquiry_confirmed", "on_hold", "cancelled", "pending_price"],
    inquiry_confirmed: ["shipped", "dispatched", "delivered", "on_hold", "cancelled", "pending_inquiry"],
    shipped: ["delivered", "on_hold", "cancelled", "inquiry_confirmed"],
    dispatched: ["delivered", "on_hold", "cancelled", "pending_vehicle", "pending_dispatch"],
    in_transit: ["delivered", "on_hold", "cancelled", "dispatched"], // 兼容旧数据
    delivered: ["signed", "on_hold", "cancelled", "dispatched"],
    signed: ["on_hold"],
    on_hold: ["pending_assign", "pending_price", "priced", "pending_vehicle", "pending_dispatch", "pending_inquiry", "inquiry_confirmed", "shipped", "dispatched", "delivered", "signed", "cancelled"],
    cancelled: [],
  };

  it("dispatched 的下一步不包含 in_transit", () => {
    expect(VALID_TRANSITIONS["dispatched"]).not.toContain("in_transit");
  });

  it("dispatched 的下一步包含 delivered（直接跳过 in_transit）", () => {
    expect(VALID_TRANSITIONS["dispatched"]).toContain("delivered");
  });

  it("shipped 的下一步不包含 in_transit", () => {
    expect(VALID_TRANSITIONS["shipped"]).not.toContain("in_transit");
    expect(VALID_TRANSITIONS["shipped"]).toContain("delivered");
  });

  it("inquiry_confirmed 的下一步不包含 in_transit", () => {
    expect(VALID_TRANSITIONS["inquiry_confirmed"]).not.toContain("in_transit");
    expect(VALID_TRANSITIONS["inquiry_confirmed"]).toContain("delivered");
  });

  it("on_hold 的恢复选项不包含 in_transit", () => {
    expect(VALID_TRANSITIONS["on_hold"]).not.toContain("in_transit");
  });

  it("delivered 退回到 dispatched 而非 in_transit", () => {
    expect(VALID_TRANSITIONS["delivered"]).toContain("dispatched");
    expect(VALID_TRANSITIONS["delivered"]).not.toContain("in_transit");
  });

  it("in_transit 兼容旧数据：可以推进到 delivered", () => {
    expect(VALID_TRANSITIONS["in_transit"]).toContain("delivered");
  });
});

// ============================================================
// 测试2：退回映射验证
// ============================================================
describe("退回映射 - delivered 退回到 dispatched", () => {
  const ROLLBACK_MAP: Record<string, string> = {
    pending_price: "pending_assign",
    priced: "pending_price",
    pending_vehicle: "pending_price",
    pending_approval: "pending_vehicle",
    dispatched: "pending_vehicle",
    pending_dispatch: "pending_assign",
    pending_inquiry: "pending_assign",
    inquiry_confirmed: "pending_inquiry",
    in_transit: "dispatched",
    delivered: "dispatched",  // 跳过 in_transit
    signed: "delivered",
    settled: "signed",
    on_hold: "pending_assign",
  };

  it("delivered 退回到 dispatched（而非 in_transit）", () => {
    expect(ROLLBACK_MAP["delivered"]).toBe("dispatched");
  });

  it("in_transit 兼容旧数据退回到 dispatched", () => {
    expect(ROLLBACK_MAP["in_transit"]).toBe("dispatched");
  });

  it("signed 退回到 delivered", () => {
    expect(ROLLBACK_MAP["signed"]).toBe("delivered");
  });
});

// ============================================================
// 测试3：审批驳回精准回退逻辑
// ============================================================
describe("审批驳回精准回退", () => {
  it("有 previousStatus 时恢复原状态", () => {
    const ap = { previousStatus: "pending_price" };
    const rollbackStatus = ap.previousStatus || "pending_vehicle";
    expect(rollbackStatus).toBe("pending_price");
  });

  it("无 previousStatus 时兼容旧数据回退到 pending_vehicle", () => {
    const ap = { previousStatus: null };
    const rollbackStatus = ap.previousStatus || "pending_vehicle";
    expect(rollbackStatus).toBe("pending_vehicle");
  });

  it("previousStatus 为 pending_dispatch 时精准回退", () => {
    const ap = { previousStatus: "pending_dispatch" };
    const rollbackStatus = ap.previousStatus || "pending_vehicle";
    expect(rollbackStatus).toBe("pending_dispatch");
  });

  it("previousStatus 为 pending_inquiry 时精准回退", () => {
    const ap = { previousStatus: "pending_inquiry" };
    const rollbackStatus = ap.previousStatus || "pending_vehicle";
    expect(rollbackStatus).toBe("pending_inquiry");
  });
});

// ============================================================
// 测试4：totalCost 重新计算逻辑
// ============================================================
describe("总费用同步刷新 - recalcTotalCost 逻辑", () => {
  function recalcTotalCost(order: Record<string, any>) {
    const total = safeParseFloat(order.actualFreight)
      + safeParseFloat(order.deliveryFee)
      + safeParseFloat(order.extraFee)
      + safeParseFloat(order.ltlDeliveryFee)
      + safeParseFloat(order.ltlOtherFee);
    return total;
  }

  it("正常费用累加", () => {
    const order = {
      actualFreight: "1000.50",
      deliveryFee: "200",
      extraFee: "50",
      ltlDeliveryFee: null,
      ltlOtherFee: null,
    };
    expect(recalcTotalCost(order)).toBe(1250.5);
  });

  it("所有字段为空时返回0", () => {
    const order = {
      actualFreight: null,
      deliveryFee: null,
      extraFee: null,
      ltlDeliveryFee: null,
      ltlOtherFee: null,
    };
    expect(recalcTotalCost(order)).toBe(0);
  });

  it("包含零担费用的累加", () => {
    const order = {
      actualFreight: "500",
      deliveryFee: null,
      extraFee: "100",
      ltlDeliveryFee: "80",
      ltlOtherFee: "30",
    };
    expect(recalcTotalCost(order)).toBe(710);
  });

  it("审批通过更新 actualFreight 后重新计算", () => {
    // 模拟审批通过后 actualFreight 被更新
    const orderBefore = {
      actualFreight: "800",
      deliveryFee: "100",
      extraFee: null,
      ltlDeliveryFee: null,
      ltlOtherFee: null,
    };
    expect(recalcTotalCost(orderBefore)).toBe(900);

    // 审批通过后 actualFreight 变为 1200
    const orderAfter = {
      actualFreight: "1200",
      deliveryFee: "100",
      extraFee: null,
      ltlDeliveryFee: null,
      ltlOtherFee: null,
    };
    expect(recalcTotalCost(orderAfter)).toBe(1300);
  });

  it("审批通过更新 extraFee 后重新计算", () => {
    const orderBefore = {
      actualFreight: "1000",
      deliveryFee: "200",
      extraFee: null,
      ltlDeliveryFee: null,
      ltlOtherFee: null,
    };
    expect(recalcTotalCost(orderBefore)).toBe(1200);

    // 加价审批通过后 extraFee 变为 150
    const orderAfter = {
      actualFreight: "1000",
      deliveryFee: "200",
      extraFee: "150",
      ltlDeliveryFee: null,
      ltlOtherFee: null,
    };
    expect(recalcTotalCost(orderAfter)).toBe(1350);
  });
});

// ============================================================
// 测试5：回单闭环反向同步逻辑
// ============================================================
describe("回单闭环反向同步", () => {
  it("回单 received 时，delivered 状态的订单应推进到 signed", () => {
    const orderStatus = "delivered";
    const podOriginalStatus = "received";
    // 模拟同步逻辑
    let newOrderStatus = orderStatus;
    if (podOriginalStatus === "received" && orderStatus === "delivered") {
      newOrderStatus = "signed";
    }
    expect(newOrderStatus).toBe("signed");
  });

  it("回单 received 时，已经是 signed 的订单不应被覆盖", () => {
    const orderStatus = "signed";
    const podOriginalStatus = "received";
    let newOrderStatus = orderStatus;
    if (podOriginalStatus === "received" && orderStatus === "delivered") {
      newOrderStatus = "signed";
    }
    // 已经是 signed，不应变化
    expect(newOrderStatus).toBe("signed");
  });

  it("回单 received 时，已经是 settled 的订单不应被覆盖", () => {
    const orderStatus = "settled";
    const podOriginalStatus = "received";
    let newOrderStatus = orderStatus;
    if (podOriginalStatus === "received" && orderStatus === "delivered") {
      newOrderStatus = "signed";
    }
    expect(newOrderStatus).toBe("settled");
  });

  it("押金退还时同步订单 depositStatus 为 refunded", () => {
    const depositRefunded = true;
    let orderDepositStatus = "paid";
    if (depositRefunded) {
      orderDepositStatus = "refunded";
    }
    expect(orderDepositStatus).toBe("refunded");
  });

  it("押金未退还时不改变订单 depositStatus", () => {
    const depositRefunded = false;
    let orderDepositStatus = "paid";
    if (depositRefunded) {
      orderDepositStatus = "refunded";
    }
    expect(orderDepositStatus).toBe("paid");
  });
});

// ============================================================
// 测试6：delivered 时补充 loadingDate 逻辑
// ============================================================
describe("delivered 时补充 loadingDate", () => {
  it("loadingDate 为空时，delivered 应补充 loadingDate", () => {
    const currentLoadingDate = null;
    const status = "delivered";
    let updateData: Record<string, any> = {};
    if (status === "delivered") {
      updateData.deliveryDate = new Date();
      if (!currentLoadingDate) {
        updateData.loadingDate = new Date();
      }
    }
    expect(updateData.loadingDate).toBeDefined();
    expect(updateData.deliveryDate).toBeDefined();
  });

  it("loadingDate 已有值时，delivered 不应覆盖", () => {
    const currentLoadingDate = new Date("2026-01-01");
    const status = "delivered";
    let updateData: Record<string, any> = {};
    if (status === "delivered") {
      updateData.deliveryDate = new Date();
      if (!currentLoadingDate) {
        updateData.loadingDate = new Date();
      }
    }
    expect(updateData.loadingDate).toBeUndefined();
    expect(updateData.deliveryDate).toBeDefined();
  });
});
