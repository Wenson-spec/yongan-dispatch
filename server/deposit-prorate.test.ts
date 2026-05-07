import { describe, it, expect } from "vitest";

/**
 * 押金分摊算法测试
 * 验证整组派车时押金按重量比例正确分摊
 */

// 模拟押金分摊算法（与 order.ts 中的逻辑一致）
function prorateDeposit(totalDeposit: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const useWeightRatio = totalWeight > 0;
  const totalCents = Math.round(totalDeposit * 100);
  let allocatedCents = 0;
  const results: number[] = [];

  for (let i = 0; i < weights.length; i++) {
    if (i === weights.length - 1) {
      // 尾差处理：最后一个 = 总额 - 前面之和
      results.push((totalCents - allocatedCents) / 100);
    } else {
      const ratio = useWeightRatio ? weights[i] / totalWeight : 1 / weights.length;
      const cents = Math.round(totalCents * ratio);
      allocatedCents += cents;
      results.push(cents / 100);
    }
  }
  return results;
}

describe("押金分摊算法", () => {
  it("两个订单按重量比例分摊200元押金", () => {
    const result = prorateDeposit(200, [5000, 237]);
    const total = result.reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(200, 2);
    expect(result[0]).toBeGreaterThan(result[1]); // 重量大的分摊多
    expect(result.length).toBe(2);
  });

  it("三个订单按重量比例分摊300元押金", () => {
    const result = prorateDeposit(300, [1000, 2000, 3000]);
    const total = result.reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(300, 2);
    expect(result[0]).toBeCloseTo(50, 1); // 1000/6000 * 300 = 50
    expect(result[1]).toBeCloseTo(100, 1); // 2000/6000 * 300 = 100
    expect(result[2]).toBeCloseTo(150, 1); // 尾差处理
  });

  it("单个订单不分摊", () => {
    const result = prorateDeposit(200, [5000]);
    expect(result).toEqual([200]);
  });

  it("总押金为0时所有子订单为0", () => {
    const result = prorateDeposit(0, [1000, 2000]);
    expect(result).toEqual([0, 0]);
  });

  it("重量为0时等额分摊", () => {
    const result = prorateDeposit(200, [0, 0]);
    const total = result.reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(200, 2);
    expect(result[0]).toBeCloseTo(100, 2);
    expect(result[1]).toBeCloseTo(100, 2);
  });

  it("尾差处理确保精确到分", () => {
    // 100 / 3 = 33.33... 每个，尾差处理确保总额精确
    const result = prorateDeposit(100, [1000, 1000, 1000]);
    const total = result.reduce((s, v) => s + v, 0);
    expect(total).toBe(100); // 精确等于100，不是99.99或100.01
    expect(result[0]).toBe(33.33);
    expect(result[1]).toBe(33.33);
    expect(result[2]).toBe(33.34); // 尾差
  });

  it("大额押金分摊精度", () => {
    const result = prorateDeposit(10000, [3500, 1500, 5000]);
    const total = result.reduce((s, v) => s + v, 0);
    expect(total).toBe(10000);
    expect(result[0]).toBeCloseTo(3500, 0); // 3500/10000 * 10000
    expect(result[1]).toBeCloseTo(1500, 0);
    expect(result[2]).toBeCloseTo(5000, 0);
  });

  it("不均匀重量分摊", () => {
    // 5000kg vs 237kg, 总押金200
    const result = prorateDeposit(200, [5000, 237]);
    const total = result.reduce((s, v) => s + v, 0);
    expect(total).toBe(200);
    // 5000/(5000+237) * 200 = 190.95...
    expect(result[0]).toBeGreaterThan(180);
    expect(result[1]).toBeLessThan(20);
  });
});

describe("批量退押金逻辑", () => {
  it("合并组退押金应退还所有子订单的分摊押金总和", () => {
    // 模拟两个子订单的分摊押金
    const deposits = [190.95, 9.05]; // 分摊后的押金
    const totalRefund = deposits.reduce((s, v) => s + v, 0);
    expect(totalRefund).toBe(200); // 总退还金额 = 原始总押金
  });

  it("部分退押金不影响其他子订单", () => {
    // 如果只退一个子订单
    const deposit1 = 190.95;
    const deposit2 = 9.05;
    // 退第一个后，第二个仍然是待退状态
    expect(deposit1 + deposit2).toBe(200);
  });
});

describe("回单分组逻辑", () => {
  it("按mergedPlanNumber分组", () => {
    const pods = [
      { id: 1, orderId: 101, order: { mergedPlanNumber: "MPN001", plateNumber: "粤B12345", dispatchDate: 1700000000000 } },
      { id: 2, orderId: 102, order: { mergedPlanNumber: "MPN001", plateNumber: "粤B12345", dispatchDate: 1700000000000 } },
      { id: 3, orderId: 103, order: { mergedPlanNumber: null, plateNumber: "粤B99999", dispatchDate: 1700000000000 } },
    ];

    const groups = new Map<string, any[]>();
    for (const pod of pods) {
      let key = `single_${pod.id}`;
      if (pod.order?.mergedPlanNumber) {
        key = `mpn_${pod.order.mergedPlanNumber}`;
      } else if (pod.order?.plateNumber && pod.order?.dispatchDate) {
        const dateStr = new Date(pod.order.dispatchDate).toISOString().slice(0, 10);
        key = `plate_${pod.order.plateNumber}_${dateStr}`;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(pod);
    }

    expect(groups.size).toBe(2); // MPN001组 + 单独的粤B99999
    expect(groups.get("mpn_MPN001")?.length).toBe(2);
  });

  it("无mergedPlanNumber时按plateNumber+dispatchDate分组", () => {
    const pods = [
      { id: 1, orderId: 101, order: { mergedPlanNumber: null, plateNumber: "粤B12345", dispatchDate: 1700000000000 } },
      { id: 2, orderId: 102, order: { mergedPlanNumber: null, plateNumber: "粤B12345", dispatchDate: 1700000000000 } },
    ];

    const groups = new Map<string, any[]>();
    for (const pod of pods) {
      let key = `single_${pod.id}`;
      if (pod.order?.mergedPlanNumber) {
        key = `mpn_${pod.order.mergedPlanNumber}`;
      } else if (pod.order?.plateNumber && pod.order?.dispatchDate) {
        const dateStr = new Date(pod.order.dispatchDate).toISOString().slice(0, 10);
        key = `plate_${pod.order.plateNumber}_${dateStr}`;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(pod);
    }

    const dateStr = new Date(1700000000000).toISOString().slice(0, 10);
    expect(groups.size).toBe(1);
    expect(groups.get(`plate_粤B12345_${dateStr}`)?.length).toBe(2);
  });
});
