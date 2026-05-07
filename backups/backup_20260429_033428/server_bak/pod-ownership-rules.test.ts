import { describe, expect, it } from "vitest";

/**
 * 零担前后段外请回单唯一归属规则测试
 *
 * 本组测试聚焦两类业务约束：
 * 1. 零担前后段外请场景下，回单原件只能由一个责任单持续跟踪；
 * 2. 组合单业务类型修改规则不能因回单责任切换而被绕开。
 */

type PodOwnershipMode = "current_order" | "delivery_outsource" | "none";

type OrderLike = {
  id: number;
  businessType: string;
  mergedPlanNumber: string | null;
  status: string;
  podOwnership: PodOwnershipMode;
  remarks?: string | null;
};

const LTL_PICKUP_SUBCHAIN_TAG = "【零担前段外请子链】";
const LTL_DELIVERY_SUBCHAIN_TAG = "【零担后段外请子链】";

const ALLOWED_STATUSES_FOR_TYPE_CHANGE = [
  "pending_assign",
  "pending_price",
  "priced",
  "pending_dispatch",
  "pending_vehicle",
  "pending_inquiry",
  "on_hold",
];

function resolveLtlSubchainStage(remarks?: string | null) {
  const text = String(remarks || "");
  if (text.includes(LTL_PICKUP_SUBCHAIN_TAG)) return "pickup" as const;
  if (text.includes(LTL_DELIVERY_SUBCHAIN_TAG)) return "delivery" as const;
  return null;
}

function resolvePodOwnership(params: {
  businessType?: string | null;
  remarks?: string | null;
  subchainStage?: "pickup" | "delivery" | null;
}): PodOwnershipMode {
  const stage = params.subchainStage ?? resolveLtlSubchainStage(params.remarks);
  if (params.businessType === "outsource" && stage === "pickup") {
    return "none";
  }
  return "current_order";
}

function computeParentPodOwnership(hasActiveDeliverySubchain: boolean): PodOwnershipMode {
  return hasActiveDeliverySubchain ? "delivery_outsource" : "current_order";
}

function shouldKeepPendingPodRecord(podOwnership: PodOwnershipMode): boolean {
  return podOwnership === "current_order";
}

function canOperatePod(podOwnership: PodOwnershipMode): boolean {
  return podOwnership === "current_order";
}

function isChildOrder(order: Pick<OrderLike, "id" | "mergedPlanNumber">): boolean {
  if (!order.mergedPlanNumber) return false;
  return order.id !== Number.parseInt(order.mergedPlanNumber, 10);
}

function canChangeBusinessType(status: string): boolean {
  return ALLOWED_STATUSES_FOR_TYPE_CHANGE.includes(status);
}

function validateMergedBusinessTypeChange(order: OrderLike, groupOrders: OrderLike[]) {
  if (isChildOrder(order)) {
    return {
      valid: false,
      error: "子单不能单独修改业务类型，必须由组头统一修改。",
    };
  }

  if (!canChangeBusinessType(order.status)) {
    return {
      valid: false,
      error: `订单状态为${order.status}，无法修改业务类型。`,
    };
  }

  if (order.mergedPlanNumber) {
    const blocked = groupOrders.filter((item) => !canChangeBusinessType(item.status));
    if (blocked.length > 0) {
      return {
        valid: false,
        error: `合并组内有${blocked.length}单已进入不可编辑状态。`,
      };
    }

    return {
      valid: true,
      affectedIds: groupOrders.map((item) => item.id),
    };
  }

  return {
    valid: true,
    affectedIds: [order.id],
  };
}

describe("回单唯一归属 - 零担前后段外请责任切换", () => {
  it("零担前段外请子链不负责回单，归属应为 none", () => {
    expect(
      resolvePodOwnership({
        businessType: "outsource",
        remarks: `客户要求工厂提货 ${LTL_PICKUP_SUBCHAIN_TAG}`,
      }),
    ).toBe("none");
  });

  it("零担后段外请子链负责回单，归属应落在当前责任单", () => {
    expect(
      resolvePodOwnership({
        businessType: "outsource",
        remarks: `货站送客户 ${LTL_DELIVERY_SUBCHAIN_TAG}`,
      }),
    ).toBe("current_order");
  });

  it("普通零担主单在未拆出后段外请时默认由当前订单负责回单", () => {
    expect(
      resolvePodOwnership({
        businessType: "ltl",
        remarks: "零担主单，待派车",
      }),
    ).toBe("current_order");
  });

  it("主单一旦存在有效后段外请子链，应切换为 delivery_outsource 并退出回单责任", () => {
    const parentOwnership = computeParentPodOwnership(true);
    expect(parentOwnership).toBe("delivery_outsource");
    expect(shouldKeepPendingPodRecord(parentOwnership)).toBe(false);
    expect(canOperatePod(parentOwnership)).toBe(false);
  });

  it("后段外请取消或释放后，主单应恢复 current_order 并重新承担待回单跟踪", () => {
    const parentOwnership = computeParentPodOwnership(false);
    expect(parentOwnership).toBe("current_order");
    expect(shouldKeepPendingPodRecord(parentOwnership)).toBe(true);
    expect(canOperatePod(parentOwnership)).toBe(true);
  });
});

describe("回单唯一归属 - 可操作权限边界", () => {
  it("只有 current_order 责任单可以创建、查询、寄出或收取回单", () => {
    expect(canOperatePod("current_order")).toBe(true);
    expect(canOperatePod("delivery_outsource")).toBe(false);
    expect(canOperatePod("none")).toBe(false);
  });

  it("主单已转后段外请负责时，调度侧不应再把主单当作可见回单记录", () => {
    const parentOwnership: PodOwnershipMode = "delivery_outsource";
    const deliverySubchainOwnership: PodOwnershipMode = "current_order";

    expect(canOperatePod(parentOwnership)).toBe(false);
    expect(canOperatePod(deliverySubchainOwnership)).toBe(true);
  });
});

describe("组合单业务类型限制 - 不因回单责任切换而放开", () => {
  it("合并组子单即使当前负责回单，也不能单独修改业务类型", () => {
    const childOrder: OrderLike = {
      id: 102,
      businessType: "outsource",
      mergedPlanNumber: "101",
      status: "pending_price",
      podOwnership: "current_order",
    };

    const result = validateMergedBusinessTypeChange(childOrder, [childOrder]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("子单不能单独修改业务类型");
  });

  it("合并组组头已转后段外请负责时，仍需同步整组修改业务类型", () => {
    const orders: OrderLike[] = [
      {
        id: 101,
        businessType: "ltl",
        mergedPlanNumber: "101",
        status: "pending_price",
        podOwnership: "delivery_outsource",
      },
      {
        id: 102,
        businessType: "ltl",
        mergedPlanNumber: "101",
        status: "pending_dispatch",
        podOwnership: "current_order",
      },
      {
        id: 103,
        businessType: "ltl",
        mergedPlanNumber: "101",
        status: "pending_vehicle",
        podOwnership: "current_order",
      },
    ];

    const result = validateMergedBusinessTypeChange(orders[0], orders);
    expect(result.valid).toBe(true);
    expect(result.affectedIds).toEqual([101, 102, 103]);
  });

  it("合并组内任一订单进入不可编辑状态时，即使发生责任切换也不能改业务类型", () => {
    const orders: OrderLike[] = [
      {
        id: 201,
        businessType: "ltl",
        mergedPlanNumber: "201",
        status: "pending_price",
        podOwnership: "delivery_outsource",
      },
      {
        id: 202,
        businessType: "ltl",
        mergedPlanNumber: "201",
        status: "dispatched",
        podOwnership: "current_order",
      },
    ];

    const result = validateMergedBusinessTypeChange(orders[0], orders);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("不可编辑状态");
  });

  it("独立订单在允许状态下可正常修改业务类型，且不受回单责任字段干扰", () => {
    const order: OrderLike = {
      id: 301,
      businessType: "outsource",
      mergedPlanNumber: null,
      status: "pending_assign",
      podOwnership: "current_order",
    };

    const result = validateMergedBusinessTypeChange(order, [order]);
    expect(result.valid).toBe(true);
    expect(result.affectedIds).toEqual([301]);
  });
});
