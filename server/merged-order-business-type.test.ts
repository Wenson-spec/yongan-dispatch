import { describe, it, expect } from "vitest";

/**
 * 合并订单业务类型修改限制测试
 * 
 * 规则：
 * 1. 子单不能单独修改业务类型，只能在主订单（组头）统一修改
 * 2. 主订单修改业务类型时，自动同步更新所有子单
 * 3. 子单在编辑页面应显示锁定状态
 * 4. 智能粘贴页面分组头可修改，子单只显示文本标签
 */

interface Order {
  id: number;
  mergedPlanNumber: string | null;
  businessType: string;
  status: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  shouldSyncToGroup?: boolean;
}

const BUSINESS_TYPE_EDITABLE_STATUSES = [
  "pending_assign",
  "pending_price",
  "priced",
  "pending_dispatch",
  "pending_vehicle",
  "pending_inquiry",
  "on_hold",
];

/**
 * 检查是否是子单（子单的id不等于mergedPlanNumber）
 */
function isChildOrder(order: Order): boolean {
  return !!order.mergedPlanNumber && order.id !== parseInt(order.mergedPlanNumber);
}

/**
 * 验证业务类型修改权限
 */
function validateBusinessTypeModification(order: Order): ValidationResult {
  // 如果是子单，禁止修改
  if (isChildOrder(order)) {
    return {
      valid: false,
      error: `这是合并订单的子单，业务类型必须在主订单（组头）统一修改。请编辑合并计划号「${order.mergedPlanNumber}」的主订单来修改整组的业务类型。`,
    };
  }

  // 进入后续流程后，整组业务类型锁定
  if (!BUSINESS_TYPE_EDITABLE_STATUSES.includes(order.status)) {
    return {
      valid: false,
      error: `订单当前状态为"${order.status}"，不允许修改业务类型。请先退回到初始阶段后再修改。`,
    };
  }

  // 如果是主订单（有mergedPlanNumber），修改时需要同步到所有子单
  if (order.mergedPlanNumber) {
    return {
      valid: true,
      shouldSyncToGroup: true,
    };
  }

  // 独立订单可以修改
  return {
    valid: true,
    shouldSyncToGroup: false,
  };
}

describe("合并订单业务类型修改 - 子单限制规则", () => {
  it("子单不能单独修改业务类型", () => {
    const childOrder: Order = {
      id: 2,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_price",
    };
    const result = validateBusinessTypeModification(childOrder);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("子单");
    expect(result.error).toContain("主订单");
  });

  it("主订单可以修改业务类型", () => {
    const mainOrder: Order = {
      id: 1,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_price",
    };
    const result = validateBusinessTypeModification(mainOrder);
    expect(result.valid).toBe(true);
    expect(result.shouldSyncToGroup).toBe(true);
  });

  it("独立订单可以修改业务类型", () => {
    const independentOrder: Order = {
      id: 1,
      mergedPlanNumber: null,
      businessType: "outsource",
      status: "pending_price",
    };
    const result = validateBusinessTypeModification(independentOrder);
    expect(result.valid).toBe(true);
    expect(result.shouldSyncToGroup).toBe(false);
  });

  it("待审批状态的主订单也不能修改业务类型", () => {
    const mainOrderInApproval: Order = {
      id: 1,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_approval",
    };
    const result = validateBusinessTypeModification(mainOrderInApproval);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("pending_approval");
    expect(result.error).toContain("不允许修改业务类型");
  });

  it("待审批状态的独立订单也不能修改业务类型", () => {
    const independentOrderInApproval: Order = {
      id: 8,
      mergedPlanNumber: null,
      businessType: "self",
      status: "pending_approval",
    };
    const result = validateBusinessTypeModification(independentOrderInApproval);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("pending_approval");
  });

  it("多个子单都不能单独修改", () => {
    const childOrder1: Order = {
      id: 2,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_price",
    };
    const childOrder2: Order = {
      id: 3,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_price",
    };

    const result1 = validateBusinessTypeModification(childOrder1);
    const result2 = validateBusinessTypeModification(childOrder2);

    expect(result1.valid).toBe(false);
    expect(result2.valid).toBe(false);
  });

  it("isChildOrder正确识别子单", () => {
    const mainOrder: Order = {
      id: 1,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_price",
    };
    const childOrder: Order = {
      id: 2,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_price",
    };

    expect(isChildOrder(mainOrder)).toBe(false);
    expect(isChildOrder(childOrder)).toBe(true);
  });

  it("mergedPlanNumber为null的订单不是子单", () => {
    const order: Order = {
      id: 1,
      mergedPlanNumber: null,
      businessType: "outsource",
      status: "pending_price",
    };
    expect(isChildOrder(order)).toBe(false);
  });

  it("主订单修改时应标记需要同步到整组", () => {
    const mainOrder: Order = {
      id: 1,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_price",
    };
    const result = validateBusinessTypeModification(mainOrder);
    expect(result.shouldSyncToGroup).toBe(true);
  });

  it("独立订单修改时不需要同步", () => {
    const order: Order = {
      id: 1,
      mergedPlanNumber: null,
      businessType: "outsource",
      status: "pending_price",
    };
    const result = validateBusinessTypeModification(order);
    expect(result.shouldSyncToGroup).toBe(false);
  });
});

describe("合并订单业务类型修改 - 前端UI限制", () => {
  /**
   * 模拟OrderEdit页面的业务类型选择器状态
   */
  function getBusinessTypeFieldState(order: Order): {
    disabled: boolean;
    label: string;
  } {
    if (!BUSINESS_TYPE_EDITABLE_STATUSES.includes(order.status)) {
      return {
        disabled: true,
        label: "订单已进入调度流程，无法修改业务类型。请先将订单退回到初始状态后再修改。",
      };
    }
    if (isChildOrder(order)) {
      return {
        disabled: true,
        label: "这是合并订单的子单，业务类型必须在主订单统一修改",
      };
    }
    return {
      disabled: false,
      label: "",
    };
  }

  it("子单的业务类型选择器应禁用", () => {
    const childOrder: Order = {
      id: 2,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_price",
    };
    const state = getBusinessTypeFieldState(childOrder);
    expect(state.disabled).toBe(true);
  });

  it("主订单的业务类型选择器应启用", () => {
    const mainOrder: Order = {
      id: 1,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_price",
    };
    const state = getBusinessTypeFieldState(mainOrder);
    expect(state.disabled).toBe(false);
  });

  it("独立订单的业务类型选择器应启用", () => {
    const order: Order = {
      id: 1,
      mergedPlanNumber: null,
      businessType: "outsource",
      status: "pending_price",
    };
    const state = getBusinessTypeFieldState(order);
    expect(state.disabled).toBe(false);
  });

  it("子单禁用时应显示提示文本", () => {
    const childOrder: Order = {
      id: 2,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_price",
    };
    const state = getBusinessTypeFieldState(childOrder);
    expect(state.label).toContain("子单");
    expect(state.label).toContain("主订单");
  });

  it("待审批状态的主订单选择器也应禁用", () => {
    const mainOrderInApproval: Order = {
      id: 1,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_approval",
    };
    const state = getBusinessTypeFieldState(mainOrderInApproval);
    expect(state.disabled).toBe(true);
    expect(state.label).toContain("调度流程");
  });
});

describe("合并订单业务类型修改 - 智能粘贴页面", () => {
  /**
   * 模拟SmartPaste页面的分组头和子单渲染逻辑
   */
  function getSmartPasteRowType(
    order: Order,
    isGroupHeader: boolean
  ): "group_header" | "child_order" | "independent_order" {
    if (isGroupHeader) {
      return "group_header";
    }
    if (isChildOrder(order)) {
      return "child_order";
    }
    return "independent_order";
  }

  function canEditBusinessTypeInSmartPaste(rowType: string): boolean {
    return rowType === "group_header" || rowType === "independent_order";
  }

  it("分组头可以修改业务类型", () => {
    const mainOrder: Order = {
      id: 1,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_price",
    };
    const rowType = getSmartPasteRowType(mainOrder, true);
    expect(canEditBusinessTypeInSmartPaste(rowType)).toBe(true);
  });

  it("子单只显示文本标签，不能修改", () => {
    const childOrder: Order = {
      id: 2,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_price",
    };
    const rowType = getSmartPasteRowType(childOrder, false);
    expect(canEditBusinessTypeInSmartPaste(rowType)).toBe(false);
  });

  it("独立订单可以修改业务类型", () => {
    const order: Order = {
      id: 1,
      mergedPlanNumber: null,
      businessType: "outsource",
      status: "pending_price",
    };
    const rowType = getSmartPasteRowType(order, false);
    expect(canEditBusinessTypeInSmartPaste(rowType)).toBe(true);
  });

  it("多个子单都不能修改", () => {
    const childOrder1: Order = {
      id: 2,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_price",
    };
    const childOrder2: Order = {
      id: 3,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_price",
    };

    const rowType1 = getSmartPasteRowType(childOrder1, false);
    const rowType2 = getSmartPasteRowType(childOrder2, false);

    expect(canEditBusinessTypeInSmartPaste(rowType1)).toBe(false);
    expect(canEditBusinessTypeInSmartPaste(rowType2)).toBe(false);
  });
});

describe("合并订单业务类型修改 - 后端同步规则", () => {
  /**
   * 模拟后端order.update的业务类型修改同步逻辑
   */
  interface UpdateResult {
    mainOrderUpdated: boolean;
    childOrdersUpdated: number;
    error?: string;
  }

  function updateBusinessTypeWithSync(
    order: Order,
    newType: string,
    allOrdersInGroup: Order[]
  ): UpdateResult {
    void newType;
    // 检查是否是子单
    if (isChildOrder(order)) {
      return {
        mainOrderUpdated: false,
        childOrdersUpdated: 0,
        error: "子单不能单独修改业务类型，请在主订单修改",
      };
    }

    if (!BUSINESS_TYPE_EDITABLE_STATUSES.includes(order.status)) {
      return {
        mainOrderUpdated: false,
        childOrdersUpdated: 0,
        error: `订单当前状态为"${order.status}"，不允许修改业务类型。请先退回到初始阶段后再修改。`,
      };
    }

    // 如果是主订单，同步更新所有子单
    if (order.mergedPlanNumber) {
      const childCount = allOrdersInGroup.filter((o) => isChildOrder(o)).length;
      return {
        mainOrderUpdated: true,
        childOrdersUpdated: childCount,
      };
    }

    // 独立订单只更新自己
    return {
      mainOrderUpdated: true,
      childOrdersUpdated: 0,
    };
  }

  it("子单修改时返回错误", () => {
    const childOrder: Order = {
      id: 2,
      mergedPlanNumber: "1",
      businessType: "outsource",
      status: "pending_price",
    };
    const result = updateBusinessTypeWithSync(childOrder, "self", [childOrder]);
    expect(result.error).toBeDefined();
    expect(result.mainOrderUpdated).toBe(false);
  });

  it("主订单修改时同步更新所有子单", () => {
    const orders: Order[] = [
      {
        id: 1,
        mergedPlanNumber: "1",
        businessType: "outsource",
        status: "pending_price",
      },
      {
        id: 2,
        mergedPlanNumber: "1",
        businessType: "outsource",
        status: "pending_price",
      },
      {
        id: 3,
        mergedPlanNumber: "1",
        businessType: "outsource",
        status: "pending_price",
      },
    ];
    const result = updateBusinessTypeWithSync(orders[0], "self", orders);
    expect(result.mainOrderUpdated).toBe(true);
    expect(result.childOrdersUpdated).toBe(2);
  });

  it("独立订单修改时不同步任何订单", () => {
    const order: Order = {
      id: 1,
      mergedPlanNumber: null,
      businessType: "outsource",
      status: "pending_price",
    };
    const result = updateBusinessTypeWithSync(order, "self", [order]);
    expect(result.mainOrderUpdated).toBe(true);
    expect(result.childOrdersUpdated).toBe(0);
  });

  it("待审批状态的主订单修改时应直接返回锁定错误", () => {
    const orders: Order[] = [
      {
        id: 1,
        mergedPlanNumber: "1",
        businessType: "outsource",
        status: "pending_approval",
      },
      {
        id: 2,
        mergedPlanNumber: "1",
        businessType: "outsource",
        status: "pending_approval",
      },
    ];
    const result = updateBusinessTypeWithSync(orders[0], "self", orders);
    expect(result.mainOrderUpdated).toBe(false);
    expect(result.childOrdersUpdated).toBe(0);
    expect(result.error).toContain("pending_approval");
  });

  it("主订单修改时应更新正确数量的子单", () => {
    const orders: Order[] = [
      {
        id: 1,
        mergedPlanNumber: "1",
        businessType: "outsource",
        status: "pending_price",
      },
      {
        id: 2,
        mergedPlanNumber: "1",
        businessType: "outsource",
        status: "pending_price",
      },
      {
        id: 3,
        mergedPlanNumber: "1",
        businessType: "outsource",
        status: "pending_price",
      },
      {
        id: 4,
        mergedPlanNumber: "1",
        businessType: "outsource",
        status: "pending_price",
      },
    ];
    const result = updateBusinessTypeWithSync(orders[0], "ltl", orders);
    expect(result.childOrdersUpdated).toBe(3);
  });
});
