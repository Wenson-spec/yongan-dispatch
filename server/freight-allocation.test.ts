import { describe, it, expect } from "vitest";

/**
 * 运费分摊算法专项测试
 * 验证整组派车时总运费按重量比例分摊到各子订单的正确性
 */

// 从 batchUpdateStatus / batchDispatch 中提取的分摊算法
// 使用整数运算（分为单位）避免浮点精度问题
function allocateFreight(
  totalFreight: number,
  orderWeights: { id: number; weight: string }[]
): Map<number, number> {
  const result = new Map<number, number>();
  const totalWeight = orderWeights.reduce((sum, o) => sum + (parseFloat(o.weight) || 0), 0);
  const useWeightRatio = totalWeight > 0;
  // 转为分（整数）运算，避免浮点累加误差
  const totalCents = Math.round(totalFreight * 100);
  let allocatedCents = 0;

  for (let i = 0; i < orderWeights.length; i++) {
    const order = orderWeights[i];
    if (i === orderWeights.length - 1) {
      // 最后一个订单取剩余金额（整数减法，精确无误差）
      const lastCents = totalCents - allocatedCents;
      result.set(order.id, lastCents / 100);
    } else if (useWeightRatio) {
      const orderWeight = parseFloat(order.weight) || 0;
      const shareCents = Math.round((orderWeight / totalWeight) * totalCents);
      allocatedCents += shareCents;
      result.set(order.id, shareCents / 100);
    } else {
      // 无重量信息时平均分摊
      const shareCents = Math.round(totalCents / orderWeights.length);
      allocatedCents += shareCents;
      result.set(order.id, shareCents / 100);
    }
  }
  return result;
}

describe("运费分摊算法", () => {
  it("按重量比例分摊：2个订单，不同重量", () => {
    const orders = [
      { id: 1, weight: "10" },  // 10吨
      { id: 2, weight: "20" },  // 20吨
    ];
    const result = allocateFreight(5000, orders);

    // 10/(10+20) * 5000 = 1666.67
    // 20/(10+20) * 5000 = 3333.33
    expect(result.get(1)).toBeCloseTo(1666.67, 2);
    expect(result.get(2)).toBeCloseTo(3333.33, 2);

    // 关键：总和必须等于5000
    const total = (result.get(1) || 0) + (result.get(2) || 0);
    expect(total).toBe(5000);
  });

  it("按重量比例分摊：3个订单，除不尽的情况（尾差处理）", () => {
    const orders = [
      { id: 1, weight: "10" },
      { id: 2, weight: "10" },
      { id: 3, weight: "10" },
    ];
    const result = allocateFreight(100, orders);

    // 100/3 = 33.33... 四舍五入后 33.33 * 2 = 66.66, 最后一个 = 100 - 66.66 = 33.34
    expect(result.get(1)).toBe(33.33);
    expect(result.get(2)).toBe(33.33);
    expect(result.get(3)).toBe(33.34); // 尾差给最后一个

    // 关键：总和必须等于100
    const total = (result.get(1) || 0) + (result.get(2) || 0) + (result.get(3) || 0);
    expect(total).toBe(100);
  });

  it("绝对不能每个订单都赋总运费", () => {
    const orders = [
      { id: 1, weight: "15" },
      { id: 2, weight: "15" },
    ];
    const result = allocateFreight(5000, orders);

    // 每个订单的运费必须小于总运费
    expect(result.get(1)).toBeLessThan(5000);
    expect(result.get(2)).toBeLessThan(5000);

    // 每个订单应该是2500
    expect(result.get(1)).toBe(2500);
    expect(result.get(2)).toBe(2500);

    // 总和必须等于5000
    const total = (result.get(1) || 0) + (result.get(2) || 0);
    expect(total).toBe(5000);
  });

  it("无重量信息时按订单数量平均分摊", () => {
    const orders = [
      { id: 1, weight: "" },
      { id: 2, weight: "" },
      { id: 3, weight: "" },
    ];
    const result = allocateFreight(5000, orders);

    // 5000/3 = 1666.67 * 2 = 3333.34, 最后一个 = 5000 - 3333.34 = 1666.66
    expect(result.get(1)).toBe(1666.67);
    expect(result.get(2)).toBe(1666.67);
    expect(result.get(3)).toBe(1666.66); // 尾差

    // 总和必须等于5000
    const total = (result.get(1) || 0) + (result.get(2) || 0) + (result.get(3) || 0);
    expect(total).toBe(5000);
  });

  it("单个订单不需要分摊", () => {
    const orders = [{ id: 1, weight: "20" }];
    const result = allocateFreight(5000, orders);

    expect(result.get(1)).toBe(5000);
  });

  it("不同重量的5个订单分摊", () => {
    const orders = [
      { id: 1, weight: "5" },
      { id: 2, weight: "10" },
      { id: 3, weight: "15" },
      { id: 4, weight: "20" },
      { id: 5, weight: "50" },
    ];
    const totalFreight = 10000;
    const result = allocateFreight(totalFreight, orders);

    // 总重量 = 100
    // id1: 5/100 * 10000 = 500
    // id2: 10/100 * 10000 = 1000
    // id3: 15/100 * 10000 = 1500
    // id4: 20/100 * 10000 = 2000
    // id5: 10000 - 500 - 1000 - 1500 - 2000 = 5000
    expect(result.get(1)).toBe(500);
    expect(result.get(2)).toBe(1000);
    expect(result.get(3)).toBe(1500);
    expect(result.get(4)).toBe(2000);
    expect(result.get(5)).toBe(5000);

    // 关键验证：所有分摊金额之和 === 总运费
    let sum = 0;
    result.forEach(v => sum += v);
    expect(sum).toBe(totalFreight);
  });

  it("极端情况：总运费为0", () => {
    const orders = [
      { id: 1, weight: "10" },
      { id: 2, weight: "20" },
    ];
    const result = allocateFreight(0, orders);

    // 0 * ratio = 0 for all
    expect(result.get(1)).toBe(0);
    expect(result.get(2)).toBe(0);
  });

  it("极端情况：部分订单重量为0", () => {
    const orders = [
      { id: 1, weight: "0" },
      { id: 2, weight: "30" },
    ];
    const result = allocateFreight(3000, orders);

    // 0/30 * 3000 = 0
    // 最后一个 = 3000 - 0 = 3000
    expect(result.get(1)).toBe(0);
    expect(result.get(2)).toBe(3000);

    const total = (result.get(1) || 0) + (result.get(2) || 0);
    expect(total).toBe(3000);
  });

  it("小数重量的精确分摊", () => {
    const orders = [
      { id: 1, weight: "3.5" },
      { id: 2, weight: "6.5" },
    ];
    const result = allocateFreight(10000, orders);

    // 3.5/10 * 10000 = 3500
    // 最后一个 = 10000 - 3500 = 6500
    expect(result.get(1)).toBe(3500);
    expect(result.get(2)).toBe(6500);

    const total = (result.get(1) || 0) + (result.get(2) || 0);
    expect(total).toBe(10000);
  });

  it("大量订单的分摊精度", () => {
    // 10个相同重量的订单
    const orders = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, weight: "5" }));
    const totalFreight = 9999;
    const result = allocateFreight(totalFreight, orders);

    // 每个 = 999900/10 = 99990 cents = 999.9
    // 使用整数（分）累加验证，避免浮点累加误差
    let sumCents = 0;
    result.forEach(v => sumCents += Math.round(v * 100));
    // 关键：总和（分）必须精确等于总运费（分）
    expect(sumCents).toBe(totalFreight * 100);

    // 前9个应该是999.9
    for (let i = 1; i <= 9; i++) {
      expect(result.get(i)).toBe(999.9);
    }
    // 最后一个 = (999900 - 99990*9) / 100 = (999900 - 899910) / 100 = 99990/100 = 999.9
    expect(result.get(10)).toBe(999.9);
  });
});
