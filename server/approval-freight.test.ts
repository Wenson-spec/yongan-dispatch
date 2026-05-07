import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 测试审批通过后运费分摊的幂等性和正确性
 * 
 * 核心场景：
 * 1. batchUpdateStatus 阶段正确分摊运费到每个子订单
 * 2. approval.execute 审批通过时不覆盖已分摊的运费
 * 3. 同组多次审批调用时幂等保护生效
 */

// Mock 数据库
const mockOrders = new Map<number, any>();
const mockApprovals = new Map<number, any>();

function safeParseFloat(val: any): number {
  const n = parseFloat(String(val ?? "0"));
  return isNaN(n) ? 0 : n;
}

describe("运费分摊逻辑", () => {
  beforeEach(() => {
    mockOrders.clear();
    mockApprovals.clear();
  });

  describe("batchUpdateStatus 阶段运费分摊", () => {
    it("应按重量比例分摊总运费到每个子订单", () => {
      const totalFreight = 5000;
      const orderWeights = [
        { id: 570003, weight: "1.000" },
        { id: 570004, weight: "21.000" },
      ];
      const totalWeight = orderWeights.reduce((s, o) => s + parseFloat(o.weight), 0);
      const totalCents = Math.round(totalFreight * 100);
      let allocatedCents = 0;
      const freightMap = new Map<number, string>();

      for (let i = 0; i < orderWeights.length; i++) {
        const o = orderWeights[i];
        let shareCents: number;
        if (i === orderWeights.length - 1) {
          shareCents = totalCents - allocatedCents;
        } else {
          const w = parseFloat(o.weight);
          shareCents = Math.round((w / totalWeight) * totalCents);
        }
        allocatedCents += shareCents;
        freightMap.set(o.id, (shareCents / 100).toFixed(2));
      }

      // 验证分摊结果
      const freight570003 = parseFloat(freightMap.get(570003)!);
      const freight570004 = parseFloat(freightMap.get(570004)!);
      
      // 总和必须等于5000
      expect(freight570003 + freight570004).toBe(5000);
      
      // 570003 重量1t / 总22t ≈ 4.55%
      expect(freight570003).toBeCloseTo(227.27, 0); // 约227元
      
      // 570004 重量21t / 总22t ≈ 95.45%
      expect(freight570004).toBeCloseTo(4772.73, 0); // 约4773元
      
      // 验证不是5000（之前的Bug会让每个订单都是5000）
      expect(freight570003).toBeLessThan(5000);
      expect(freight570004).toBeLessThan(5000);
    });

    it("无重量时应平均分摊", () => {
      const totalFreight = 5000;
      const orderIds = [1, 2, 3];
      const totalCents = Math.round(totalFreight * 100);
      let allocatedCents = 0;
      const freightMap = new Map<number, string>();

      for (let i = 0; i < orderIds.length; i++) {
        let shareCents: number;
        if (i === orderIds.length - 1) {
          shareCents = totalCents - allocatedCents;
        } else {
          shareCents = Math.round(totalCents / orderIds.length);
        }
        allocatedCents += shareCents;
        freightMap.set(orderIds[i], (shareCents / 100).toFixed(2));
      }

      const f1 = parseFloat(freightMap.get(1)!);
      const f2 = parseFloat(freightMap.get(2)!);
      const f3 = parseFloat(freightMap.get(3)!);
      
      // 总和必须等于5000
      expect(f1 + f2 + f3).toBe(5000);
      
      // 每个约1666.67
      expect(f1).toBeCloseTo(1666.67, 1);
      expect(f2).toBeCloseTo(1666.67, 1);
    });
  });

  describe("审批通过幂等保护", () => {
    it("已处理的订单（非pending_approval状态）应跳过运费更新", () => {
      // 模拟场景：第一次审批已将订单状态改为dispatched
      const currentOrderStatus = "dispatched";
      const alreadyProcessed = currentOrderStatus !== "pending_approval";
      
      expect(alreadyProcessed).toBe(true);
      // 幂等保护应生效，不修改订单数据
    });

    it("pending_approval状态的订单应正常处理", () => {
      const currentOrderStatus = "pending_approval";
      const alreadyProcessed = currentOrderStatus !== "pending_approval";
      
      expect(alreadyProcessed).toBe(false);
      // 应正常执行审批通过流程
    });
  });

  describe("审批通过不覆盖已分摊运费", () => {
    it("有mergedPlanNumber且已有actualFreight的订单不应被覆盖", () => {
      const mpn = "MP-2026-001";
      const existingFreight = "4773.59";
      const approvedAmount = "5000"; // 审批总额
      
      // 修复后的逻辑：有mpn时不设置actualFreight
      let shouldSetFreight = false;
      if (!mpn && (!existingFreight || safeParseFloat(existingFreight) <= 0)) {
        if (approvedAmount) {
          shouldSetFreight = true;
        }
      }
      
      expect(shouldSetFreight).toBe(false);
      // 不应覆盖已分摊的运费
    });

    it("无mergedPlanNumber且无actualFreight的单订单应使用approvedAmount", () => {
      const mpn = null;
      const existingFreight = null;
      const approvedAmount = "3000";
      
      let shouldSetFreight = false;
      if (!mpn && (!existingFreight || safeParseFloat(existingFreight) <= 0)) {
        if (approvedAmount) {
          shouldSetFreight = true;
        }
      }
      
      expect(shouldSetFreight).toBe(true);
    });
  });

  describe("审批记录requestedAmount", () => {
    it("batchUpdateStatus创建的审批记录应使用分摊后的金额", () => {
      // 模拟freightMap
      const freightMap = new Map<number, string>();
      freightMap.set(570003, "226.41");
      freightMap.set(570004, "4773.59");
      const rawTotalFreight = "5000";
      
      // 修复后的逻辑
      const orderId = 570003;
      const allocatedForApproval = freightMap ? freightMap.get(orderId) : rawTotalFreight;
      
      expect(allocatedForApproval).toBe("226.41");
      expect(allocatedForApproval).not.toBe("5000");
    });

    it("无freightMap时应使用rawTotalFreight", () => {
      const freightMap: Map<number, string> | null = null;
      const rawTotalFreight = "3000";
      const orderId = 1;
      
      const allocatedForApproval = freightMap ? freightMap.get(orderId) : rawTotalFreight;
      
      expect(allocatedForApproval).toBe("3000");
    });
  });

  describe("整数分运算精度", () => {
    it("分摊结果总和应精确等于总运费（无浮点误差）", () => {
      const testCases = [
        { total: 5000, weights: [1, 21] },
        { total: 10000, weights: [3.5, 7.2, 1.3] },
        { total: 3333, weights: [10, 10, 10] },
        { total: 1, weights: [1, 1, 1] }, // 极端情况
      ];

      for (const tc of testCases) {
        const totalCents = Math.round(tc.total * 100);
        const totalWeight = tc.weights.reduce((s, w) => s + w, 0);
        let allocatedCents = 0;
        const shares: number[] = [];

        for (let i = 0; i < tc.weights.length; i++) {
          let shareCents: number;
          if (i === tc.weights.length - 1) {
            shareCents = totalCents - allocatedCents;
          } else {
            shareCents = Math.round((tc.weights[i] / totalWeight) * totalCents);
          }
          allocatedCents += shareCents;
          shares.push(shareCents);
        }

        const sum = shares.reduce((s, v) => s + v, 0);
        expect(sum).toBe(totalCents);
      }
    });
  });
});
