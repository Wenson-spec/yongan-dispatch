import { describe, it, expect } from "vitest";

/**
 * 业务类型修改校验规则测试
 * 
 * 规则1：只有初始状态的订单才能修改业务类型
 * 规则2：合并订单修改业务类型时，必须同步更新同一合并计划号下的所有子单
 */

// 允许修改业务类型的状态列表
const ALLOWED_STATUSES_FOR_TYPE_CHANGE = [
  "pending_assign",
  "pending_price",
  "priced",
  "pending_dispatch",
  "pending_vehicle",
  "pending_inquiry",
  "on_hold",
];

// 不允许修改业务类型的状态列表
const BLOCKED_STATUSES = [
  "pending_approval",
  "dispatched",
  "delivered",
  "signed",
  "cancelled",
];

function canChangeBusinessType(status: string): boolean {
  return ALLOWED_STATUSES_FOR_TYPE_CHANGE.includes(status);
}

interface Order {
  id: number;
  status: string;
  businessType: string;
  mergedPlanNumber: string | null;
}

function validateBusinessTypeChange(
  order: Order,
  newType: string,
  allOrdersInGroup: Order[]
): { valid: boolean; error?: string; affectedIds?: number[] } {
  // Rule 1: Check status
  if (!canChangeBusinessType(order.status)) {
    return {
      valid: false,
      error: `订单状态为"${order.status}"，无法修改业务类型。请先将订单退回到初始状态后再修改。`,
    };
  }

  // Rule 2: If merged plan, check all orders in group
  if (order.mergedPlanNumber && allOrdersInGroup.length > 1) {
    const blockedOrders = allOrdersInGroup.filter(
      (o) => o.id !== order.id && !canChangeBusinessType(o.status)
    );
    if (blockedOrders.length > 0) {
      return {
        valid: false,
        error: `合并计划号"${order.mergedPlanNumber}"下有${blockedOrders.length}个订单已进入调度流程，无法统一修改业务类型。`,
      };
    }
    return {
      valid: true,
      affectedIds: allOrdersInGroup.map((o) => o.id),
    };
  }

  return { valid: true, affectedIds: [order.id] };
}

describe("业务类型修改 - 状态限制规则", () => {
  it("待分配状态的订单可以修改业务类型", () => {
    expect(canChangeBusinessType("pending_assign")).toBe(true);
  });

  it("待定价状态的订单可以修改业务类型", () => {
    expect(canChangeBusinessType("pending_price")).toBe(true);
  });

  it("已定价状态的订单可以修改业务类型", () => {
    expect(canChangeBusinessType("priced")).toBe(true);
  });

  it("待调度状态的订单可以修改业务类型", () => {
    expect(canChangeBusinessType("pending_dispatch")).toBe(true);
  });

  it("待找车状态的订单可以修改业务类型", () => {
    expect(canChangeBusinessType("pending_vehicle")).toBe(true);
  });

  it("待询价状态的订单可以修改业务类型", () => {
    expect(canChangeBusinessType("pending_inquiry")).toBe(true);
  });

  it("暂挂状态的订单可以修改业务类型", () => {
    expect(canChangeBusinessType("on_hold")).toBe(true);
  });

  it("待审批状态的订单不能修改业务类型", () => {
    expect(canChangeBusinessType("pending_approval")).toBe(false);
  });

  it("已调度状态的订单不能修改业务类型", () => {
    expect(canChangeBusinessType("dispatched")).toBe(false);
  });

  it("已送达状态的订单不能修改业务类型", () => {
    expect(canChangeBusinessType("delivered")).toBe(false);
  });

  it("已签收状态的订单不能修改业务类型", () => {
    expect(canChangeBusinessType("signed")).toBe(false);
  });

  it("已取消状态的订单不能修改业务类型", () => {
    expect(canChangeBusinessType("cancelled")).toBe(false);
  });
});

describe("业务类型修改 - 合并订单统一修改规则", () => {
  it("单独订单（无合并计划号）可以独立修改", () => {
    const order: Order = { id: 1, status: "pending_price", businessType: "outsource", mergedPlanNumber: null };
    const result = validateBusinessTypeChange(order, "self", [order]);
    expect(result.valid).toBe(true);
    expect(result.affectedIds).toEqual([1]);
  });

  it("合并订单修改时应影响所有子单", () => {
    const orders: Order[] = [
      { id: 1, status: "pending_price", businessType: "outsource", mergedPlanNumber: "P001" },
      { id: 2, status: "pending_price", businessType: "outsource", mergedPlanNumber: "P001" },
      { id: 3, status: "pending_price", businessType: "outsource", mergedPlanNumber: "P001" },
    ];
    const result = validateBusinessTypeChange(orders[0], "self", orders);
    expect(result.valid).toBe(true);
    expect(result.affectedIds).toEqual([1, 2, 3]);
  });

  it("合并订单中有子单已调度时，不允许修改整组类型", () => {
    const orders: Order[] = [
      { id: 1, status: "pending_price", businessType: "outsource", mergedPlanNumber: "P002" },
      { id: 2, status: "dispatched", businessType: "outsource", mergedPlanNumber: "P002" },
    ];
    const result = validateBusinessTypeChange(orders[0], "self", orders);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("已进入调度流程");
  });

  it("合并订单中有子单已签收时，不允许修改整组类型", () => {
    const orders: Order[] = [
      { id: 1, status: "pending_price", businessType: "outsource", mergedPlanNumber: "P003" },
      { id: 2, status: "signed", businessType: "outsource", mergedPlanNumber: "P003" },
      { id: 3, status: "pending_price", businessType: "outsource", mergedPlanNumber: "P003" },
    ];
    const result = validateBusinessTypeChange(orders[0], "ltl", orders);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("1个订单已进入调度流程");
  });

  it("已调度的订单即使是单独订单也不能修改", () => {
    const order: Order = { id: 1, status: "dispatched", businessType: "outsource", mergedPlanNumber: null };
    const result = validateBusinessTypeChange(order, "self", [order]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("无法修改业务类型");
  });

  it("合并订单中所有子单都在初始状态时可以修改", () => {
    const orders: Order[] = [
      { id: 1, status: "pending_assign", businessType: "outsource", mergedPlanNumber: "P004" },
      { id: 2, status: "pending_price", businessType: "outsource", mergedPlanNumber: "P004" },
      { id: 3, status: "on_hold", businessType: "outsource", mergedPlanNumber: "P004" },
    ];
    const result = validateBusinessTypeChange(orders[0], "ltl", orders);
    expect(result.valid).toBe(true);
    expect(result.affectedIds).toEqual([1, 2, 3]);
  });
});

describe("业务类型修改 - 净单价计算", () => {
  function calculateNetUnitPrice(
    actualFreight: number,
    extraFee: number,
    deliveryFee: number,
    weight: number
  ): number | null {
    if (weight <= 0) return null;
    const netFreight = actualFreight - extraFee - deliveryFee;
    if (netFreight <= 0) return null;
    return Math.round((netFreight / weight) * 100) / 100;
  }

  it("正常计算净单价", () => {
    expect(calculateNetUnitPrice(5000, 200, 300, 10)).toBe(450);
  });

  it("无其他费用时净单价等于运费/重量", () => {
    expect(calculateNetUnitPrice(3000, 0, 0, 10)).toBe(300);
  });

  it("重量为0时返回null", () => {
    expect(calculateNetUnitPrice(5000, 200, 300, 0)).toBeNull();
  });

  it("净运费为负时返回null", () => {
    expect(calculateNetUnitPrice(100, 200, 300, 10)).toBeNull();
  });

  it("精确到两位小数", () => {
    expect(calculateNetUnitPrice(1000, 100, 50, 3)).toBe(283.33);
  });
});
