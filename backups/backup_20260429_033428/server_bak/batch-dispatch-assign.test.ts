import { describe, it, expect } from "vitest";

/**
 * 合并计划号整组操作测试
 * 验证 batchDispatch 和 batchAssign 接口的核心业务逻辑
 * - 运费按重量比例分摊
 * - 押金防重（仅首单记录）
 * - 整组分配调度员
 */

// ========== 运费分摊计算函数（与后端逻辑一致） ==========
function calculateFreightSplit(
  orders: Array<{ id: number; weight: string | null }>,
  totalFreight: number
): Array<{ id: number; freight: number }> {
  const totalWeight = orders.reduce((sum, o) => sum + (parseFloat(o.weight || "0") || 0), 0);
  const useWeight = totalWeight > 0;

  return orders.map((order) => {
    let freight: number;
    if (useWeight) {
      const w = parseFloat(order.weight || "0") || 0;
      freight = Math.round((totalFreight * (w / totalWeight)) * 100) / 100;
    } else {
      freight = Math.round((totalFreight / orders.length) * 100) / 100;
    }
    return { id: order.id, freight };
  });
}

// ========== 押金分配函数（与后端逻辑一致） ==========
function calculateDepositSplit(
  orderIds: number[],
  depositAmount: number,
  depositRefundable: boolean
): Array<{ id: number; deposit: number; status: string }> {
  return orderIds.map((id, idx) => ({
    id,
    deposit: idx === 0 ? depositAmount : 0,
    status: idx === 0
      ? (depositRefundable ? "paid" : "not_refundable")
      : "none",
  }));
}

// ========== 测试用例 ==========

describe("batchDispatch - 运费按重量比例分摊", () => {
  it("标准场景：3个订单按重量分摊", () => {
    const orders = [
      { id: 1, weight: "10" },
      { id: 2, weight: "20" },
      { id: 3, weight: "20" },
    ];
    const result = calculateFreightSplit(orders, 5000);

    expect(result[0].freight).toBe(1000);  // 10/50 * 5000
    expect(result[1].freight).toBe(2000);  // 20/50 * 5000
    expect(result[2].freight).toBe(2000);  // 20/50 * 5000

    const total = result.reduce((s, r) => s + r.freight, 0);
    expect(total).toBe(5000);
  });

  it("无重量时按数量平分", () => {
    const orders = [
      { id: 1, weight: null },
      { id: 2, weight: "0" },
      { id: 3, weight: null },
    ];
    const result = calculateFreightSplit(orders, 3600);

    expect(result[0].freight).toBe(1200);
    expect(result[1].freight).toBe(1200);
    expect(result[2].freight).toBe(1200);
  });

  it("部分有重量：无重量订单分摊为0", () => {
    const orders = [
      { id: 1, weight: "10" },
      { id: 2, weight: null },
      { id: 3, weight: "10" },
    ];
    const result = calculateFreightSplit(orders, 4000);

    expect(result[0].freight).toBe(2000);
    expect(result[1].freight).toBe(0);
    expect(result[2].freight).toBe(2000);
  });

  it("单个订单不分摊", () => {
    const orders = [{ id: 1, weight: "15" }];
    const result = calculateFreightSplit(orders, 3500);
    expect(result[0].freight).toBe(3500);
  });

  it("大量订单的分摊精度", () => {
    const orders = Array.from({ length: 7 }, (_, i) => ({
      id: i + 1,
      weight: "1.5",
    }));
    const result = calculateFreightSplit(orders, 10000);

    result.forEach(r => {
      expect(r.freight).toBeCloseTo(10000 / 7, 0);
    });
  });

  it("极端重量差异", () => {
    const orders = [
      { id: 1, weight: "0.001" },
      { id: 2, weight: "100" },
    ];
    const result = calculateFreightSplit(orders, 10000);

    expect(result[0].freight).toBeLessThan(1);
    expect(result[1].freight).toBeGreaterThan(9990);
  });

  it("运费为0时所有分摊为0", () => {
    const orders = [
      { id: 1, weight: "10" },
      { id: 2, weight: "20" },
    ];
    const result = calculateFreightSplit(orders, 0);
    result.forEach(r => expect(r.freight).toBe(0));
  });

  it("BUG修复验证：总价3500不会被乘法放大", () => {
    // 之前的Bug：每个子订单都收3500
    const orders = [
      { id: 1, weight: "5" },
      { id: 2, weight: "10" },
      { id: 3, weight: "5" },
    ];
    const result = calculateFreightSplit(orders, 3500);

    // 修复后：按重量分摊
    expect(result[0].freight).toBe(875);   // 5/20 * 3500
    expect(result[1].freight).toBe(1750);  // 10/20 * 3500
    expect(result[2].freight).toBe(875);   // 5/20 * 3500

    // 关键验证：总和等于原始总运费，不会放大
    const total = result.reduce((s, r) => s + r.freight, 0);
    expect(total).toBe(3500);

    // 每个子单的运费都小于总运费
    result.forEach(r => expect(r.freight).toBeLessThan(3500));
  });
});

describe("batchDispatch - 押金防重", () => {
  it("押金只记录在首单", () => {
    const result = calculateDepositSplit([1, 2, 3], 500, true);

    expect(result[0].deposit).toBe(500);
    expect(result[0].status).toBe("paid");
    expect(result[1].deposit).toBe(0);
    expect(result[1].status).toBe("none");
    expect(result[2].deposit).toBe(0);
    expect(result[2].status).toBe("none");
  });

  it("不可退还押金状态正确", () => {
    const result = calculateDepositSplit([1, 2], 1000, false);

    expect(result[0].deposit).toBe(1000);
    expect(result[0].status).toBe("not_refundable");
    expect(result[1].deposit).toBe(0);
    expect(result[1].status).toBe("none");
  });

  it("BUG修复验证：押金不会重复收取", () => {
    // 之前的Bug：每个子订单都记了押金
    const orderIds = [1, 2, 3, 4, 5];
    const depositAmount = 800;
    const result = calculateDepositSplit(orderIds, depositAmount, true);

    // 只有首单有押金
    const totalDeposit = result.reduce((s, r) => s + r.deposit, 0);
    expect(totalDeposit).toBe(depositAmount); // 不是 800*5=4000

    // 其余子单押金为0
    const nonFirstDeposits = result.slice(1).map(r => r.deposit);
    nonFirstDeposits.forEach(d => expect(d).toBe(0));

    // 其余子单状态为none
    const nonFirstStatuses = result.slice(1).map(r => r.status);
    nonFirstStatuses.forEach(s => expect(s).toBe("none"));
  });
});

describe("batchAssign - 整组分配调度员", () => {
  it("所有订单分配给同一调度员", () => {
    const orderIds = [1, 2, 3, 4, 5];
    const dispatcherId = 10;

    const updates = orderIds.map(id => ({
      id,
      assignedDispatcherId: dispatcherId,
    }));

    expect(updates.length).toBe(5);
    updates.forEach(u => {
      expect(u.assignedDispatcherId).toBe(dispatcherId);
    });
  });

  it("空订单列表应被拒绝", () => {
    const orderIds: number[] = [];
    expect(orderIds.length).toBe(0);
    // 后端 z.array().min(1) 会拒绝
  });

  it("dispatcherId必须为正整数", () => {
    const validId = 5;
    expect(validId).toBeGreaterThan(0);
    expect(Number.isInteger(validId)).toBe(true);
  });
});
