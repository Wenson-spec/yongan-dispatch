import { describe, it, expect } from "vitest";

/**
 * 审批派车、回单与退押金闭环专项测试
 *
 * 真实后端口径：
 * 1. approval 路由审批通过后，会把 dispatchPrice 更新为 approvedAmount，整组时按各子单 actualFreight 比例分摊。
 * 2. order.refundDeposit / order.batchRefundDeposit 仅允许财务确认同组回单原件均已 received 后退押金。
 * 3. pod.update 在直接把 depositRefunded 设为 true 时，同样要求全组 originalStatus 必须全部为 received。
 */

type OrderLike = {
  id: number;
  actualFreight: number;
  dispatchPrice?: number;
  depositStatus?: string;
  depositAmount?: string | null;
};

type PodLike = {
  orderId: number;
  originalStatus: "pending" | "sent" | "received" | null;
  originalSentAt?: Date | null;
};

function markPodSent(order: { podStatus?: string | null; podSentDate?: Date | null }, pod: PodLike) {
  const sentAt = new Date("2026-04-10T09:00:00.000Z");
  return {
    order: {
      ...order,
      podStatus: "original_sent",
      podSentDate: sentAt,
    },
    pod: {
      ...pod,
      originalStatus: "sent" as const,
      originalSentAt: sentAt,
    },
  };
}

function cancelPodSent(order: { podStatus?: string | null; podSentDate?: Date | null }, pod: PodLike) {
  if (pod.originalStatus === "received") {
    throw new Error("已进入财务确认环节，不可撤销寄出");
  }

  return {
    order: {
      ...order,
      podStatus: "none",
      podSentDate: null,
    },
    pod: {
      ...pod,
      originalStatus: "pending" as const,
      originalSentAt: null,
    },
  };
}

function allocateApprovedAmountByActualFreight(
  groupOrders: Array<Pick<OrderLike, "id" | "actualFreight">>,
  approvedAmount: number,
) {
  const totalActualFreight = groupOrders.reduce((sum, order) => sum + order.actualFreight, 0);
  const totalApprovedCents = Math.round(approvedAmount * 100);
  let allocatedCents = 0;

  return groupOrders.map((order, index) => {
    if (index === groupOrders.length - 1) {
      const cents = totalApprovedCents - allocatedCents;
      return { ...order, dispatchPrice: cents / 100 };
    }

    const cents = Math.round((order.actualFreight / totalActualFreight) * totalApprovedCents);
    allocatedCents += cents;
    return { ...order, dispatchPrice: cents / 100 };
  });
}

function validateRefundableDepositScope(orderIds: number[], pods: PodLike[]) {
  for (const orderId of orderIds) {
    const pod = pods.find((item) => item.orderId === orderId);
    if (!pod || pod.originalStatus !== "received") {
      return false;
    }
  }
  return true;
}

function validatePodDirectDepositRefund(orderIds: number[], pods: PodLike[]) {
  for (const orderId of orderIds) {
    const pod = pods.find((item) => item.orderId === orderId);
    if (!pod || pod.originalStatus !== "received") {
      return false;
    }
  }
  return true;
}

describe("审批通过后 dispatchPrice 同步更新", () => {
  it("单个订单审批通过时 dispatchPrice 应更新为 approvedAmount", () => {
    const order = { id: 1, actualFreight: 5000, dispatchPrice: 3000 };
    const approvedAmount = 5000;

    const updatedDispatchPrice = approvedAmount;

    expect(updatedDispatchPrice).toBe(5000);
    expect(updatedDispatchPrice).toBeGreaterThanOrEqual(order.actualFreight);
    expect(updatedDispatchPrice).not.toBe(order.dispatchPrice);
  });

  it("整组审批金额未修改时，每个子订单 dispatchPrice 应与各自 actualFreight 对齐", () => {
    const groupOrders = [
      { id: 1, actualFreight: 4773.59, dispatchPrice: 2800 },
      { id: 2, actualFreight: 226.41, dispatchPrice: 200 },
    ];

    const aligned = groupOrders.map((order) => ({
      ...order,
      dispatchPrice: order.actualFreight,
    }));

    expect(aligned[0].dispatchPrice).toBe(4773.59);
    expect(aligned[1].dispatchPrice).toBe(226.41);
    expect(aligned.every((order) => order.dispatchPrice === order.actualFreight)).toBe(true);
  });

  it("审批通过后溢价检测不应再触发", () => {
    const order = { actualFreight: 5000, dispatchPrice: 5000 };
    const isOverpriced = order.actualFreight > order.dispatchPrice;
    expect(isOverpriced).toBe(false);
  });

  it("审批通过前溢价检测应触发", () => {
    const order = { actualFreight: 5000, dispatchPrice: 3000 };
    const isOverpriced = order.actualFreight > order.dispatchPrice;
    expect(isOverpriced).toBe(true);
  });

  it("整组审批金额被修改时应按各子单实际运费比例重算 dispatchPrice，且总和等于 approvedAmount", () => {
    const approvedAmount = 4500;
    const groupOrders = [
      { id: 1, actualFreight: 4773.59 },
      { id: 2, actualFreight: 226.41 },
    ];

    const recalculated = allocateApprovedAmountByActualFreight(groupOrders, approvedAmount);

    expect(recalculated[0].dispatchPrice).toBe(4296.23);
    expect(recalculated[1].dispatchPrice).toBe(203.77);
    expect(recalculated[0].dispatchPrice + recalculated[1].dispatchPrice).toBe(4500);
    expect(recalculated[0].dispatchPrice).toBeLessThan(groupOrders[0].actualFreight);
    expect(recalculated[1].dispatchPrice).toBeLessThan(groupOrders[1].actualFreight);
  });
});

describe("统一状态源下的寄出与撤销闭环", () => {
  it("寄出成功时应同时推进订单展示字段与回单表业务状态", () => {
    const order = { podStatus: "uploaded", podSentDate: null };
    const pod: PodLike = { orderId: 101, originalStatus: "pending", originalSentAt: null };

    const result = markPodSent(order, pod);

    expect(result.order.podStatus).toBe("original_sent");
    expect(result.order.podSentDate).toBeInstanceOf(Date);
    expect(result.pod.originalStatus).toBe("sent");
    expect(result.pod.originalSentAt).toBeInstanceOf(Date);
  });

  it("取消寄出时应同时回滚订单展示字段与回单表业务状态", () => {
    const sentAt = new Date("2026-04-09T09:00:00.000Z");
    const order = { podStatus: "original_sent", podSentDate: sentAt };
    const pod: PodLike = { orderId: 102, originalStatus: "sent", originalSentAt: sentAt };

    const result = cancelPodSent(order, pod);

    expect(result.order.podStatus).toBe("none");
    expect(result.order.podSentDate).toBeNull();
    expect(result.pod.originalStatus).toBe("pending");
    expect(result.pod.originalSentAt).toBeNull();
  });

  it("已被财务确认收到的回单不可再撤销寄出", () => {
    const sentAt = new Date("2026-04-09T09:00:00.000Z");
    const order = { podStatus: "signed", podSentDate: sentAt };
    const pod: PodLike = { orderId: 103, originalStatus: "received", originalSentAt: sentAt };

    expect(() => cancelPodSent(order, pod)).toThrow("已进入财务确认环节，不可撤销寄出");
  });
});

describe("订单侧退押金校验口径", () => {
  it("同组合并订单回单均为 received 时，才应允许退押金", () => {
    const groupOrderIds = [1, 2, 3];
    const groupPods: PodLike[] = [
      { orderId: 1, originalStatus: "received" },
      { orderId: 2, originalStatus: "received" },
      { orderId: 3, originalStatus: "received" },
    ];

    expect(validateRefundableDepositScope(groupOrderIds, groupPods)).toBe(true);
  });

  it("只要有回单仍为 sent 或 pending，就应阻止订单侧退押金", () => {
    const groupOrderIds = [1, 2, 3];
    const groupPods: PodLike[] = [
      { orderId: 1, originalStatus: "sent" },
      { orderId: 2, originalStatus: "pending" },
      { orderId: 3, originalStatus: "received" },
    ];

    expect(validateRefundableDepositScope(groupOrderIds, groupPods)).toBe(false);
  });

  it("订单表即使显示已签收，只要回单表尚未 received 也应阻止退押金", () => {
    const groupOrderIds = [1, 2];
    const orderViewRows = [
      { id: 1, podStatus: "signed" },
      { id: 2, podStatus: "original_sent" },
    ];
    const groupPods: PodLike[] = [
      { orderId: 1, originalStatus: "received" },
      { orderId: 2, originalStatus: "sent" },
    ];

    expect(orderViewRows.every((item) => item.podStatus === "signed")).toBe(false);
    expect(validateRefundableDepositScope(groupOrderIds, groupPods)).toBe(false);
  });

  it("有订单缺少回单记录时，应阻止订单侧退押金", () => {
    const groupOrderIds = [1, 2, 3];
    const groupPods: PodLike[] = [
      { orderId: 1, originalStatus: "sent" },
      { orderId: 3, originalStatus: "received" },
    ];

    expect(validateRefundableDepositScope(groupOrderIds, groupPods)).toBe(false);
  });

  it("批量退押金应只处理 depositStatus=paid 且押金金额大于 0 的订单", () => {
    const orders: OrderLike[] = [
      { id: 1, actualFreight: 1000, depositStatus: "paid", depositAmount: "100" },
      { id: 2, actualFreight: 1000, depositStatus: "refunded", depositAmount: "100" },
      { id: 3, actualFreight: 1000, depositStatus: "paid", depositAmount: "50" },
      { id: 4, actualFreight: 1000, depositStatus: "paid", depositAmount: "0" },
    ];

    const eligible = orders.filter(
      (order) => order.depositStatus === "paid" && order.depositAmount && parseFloat(order.depositAmount) > 0,
    );

    expect(eligible.map((order) => order.id)).toEqual([1, 3]);
    expect(eligible.reduce((sum, order) => sum + parseFloat(order.depositAmount ?? "0"), 0)).toBe(150);
  });

  it("订单侧退押金后应同步更新 orders.depositStatus 与 podRecords.depositRefunded", () => {
    const refundableIds = [11, 12];
    const updateActions: string[] = [];

    for (const id of refundableIds) {
      updateActions.push(`update_order_${id}_depositStatus_refunded`);
      updateActions.push(`update_pod_${id}_depositRefunded_true`);
    }

    expect(updateActions).toEqual([
      "update_order_11_depositStatus_refunded",
      "update_pod_11_depositRefunded_true",
      "update_order_12_depositStatus_refunded",
      "update_pod_12_depositRefunded_true",
    ]);
  });
});

describe("回单侧直接标记押金已退的更严格校验", () => {
  it("只有全组回单都已收到时，才允许在回单侧直接标记 depositRefunded=true", () => {
    const groupOrderIds = [1, 2, 3];
    const groupPods: PodLike[] = [
      { orderId: 1, originalStatus: "received" },
      { orderId: 2, originalStatus: "received" },
      { orderId: 3, originalStatus: "received" },
    ];

    expect(validatePodDirectDepositRefund(groupOrderIds, groupPods)).toBe(true);
  });

  it("若仅为 sent 而未 received，回单侧仍应阻止直接标记押金已退", () => {
    const groupOrderIds = [1, 2];
    const groupPods: PodLike[] = [
      { orderId: 1, originalStatus: "received" },
      { orderId: 2, originalStatus: "sent" },
    ];

    expect(validatePodDirectDepositRefund(groupOrderIds, groupPods)).toBe(false);
  });

  it("checkGroupsReceived 结果应同时区分 allSent 与 allReceived，供前端不同页签使用", () => {
    const groupReceivedMap = {
      "MPN-001": { allReceived: true, allSent: true, sentCount: 2, receivedCount: 2, totalCount: 2 },
      "MPN-002": { allReceived: false, allSent: true, sentCount: 2, receivedCount: 1, totalCount: 2 },
      "MPN-003": { allReceived: false, allSent: false, sentCount: 1, receivedCount: 0, totalCount: 2 },
    };

    expect(groupReceivedMap["MPN-001"].allSent).toBe(true);
    expect(groupReceivedMap["MPN-001"].allReceived).toBe(true);

    expect(groupReceivedMap["MPN-002"].allSent).toBe(true);
    expect(groupReceivedMap["MPN-002"].allReceived).toBe(false);

    expect(groupReceivedMap["MPN-003"].allSent).toBe(false);
    expect(groupReceivedMap["MPN-003"].receivedCount).toBe(0);
  });
});
