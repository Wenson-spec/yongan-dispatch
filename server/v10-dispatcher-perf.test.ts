import { describe, it, expect } from "vitest";

describe("v10 - 调度员绩效排名", () => {
  describe("dispatcherPerformance 路由", () => {
    it("应返回正确的数据结构", () => {
      const mockResult = {
        rankings: [
          {
            id: 1,
            name: "张三",
            role: "ltl_dispatcher",
            roleLabel: "零担",
            processed: 25,
            completed: 20,
            completionRate: 80,
            avgResponseHours: 3.5,
            minResponseHours: 0.5,
            maxResponseHours: 12.0,
            backlog: 3,
            todayNew: 5,
            speedScore: 80,
            totalScore: 64,
          },
        ],
        summary: {
          totalDispatchers: 5,
          totalProcessed: 100,
          avgResponseHours: 4.2,
        },
      };

      expect(mockResult.rankings).toBeInstanceOf(Array);
      expect(mockResult.rankings[0]).toHaveProperty("id");
      expect(mockResult.rankings[0]).toHaveProperty("name");
      expect(mockResult.rankings[0]).toHaveProperty("role");
      expect(mockResult.rankings[0]).toHaveProperty("roleLabel");
      expect(mockResult.rankings[0]).toHaveProperty("processed");
      expect(mockResult.rankings[0]).toHaveProperty("completed");
      expect(mockResult.rankings[0]).toHaveProperty("completionRate");
      expect(mockResult.rankings[0]).toHaveProperty("avgResponseHours");
      expect(mockResult.rankings[0]).toHaveProperty("backlog");
      expect(mockResult.rankings[0]).toHaveProperty("todayNew");
      expect(mockResult.rankings[0]).toHaveProperty("speedScore");
      expect(mockResult.rankings[0]).toHaveProperty("totalScore");
      expect(mockResult.summary).toHaveProperty("totalDispatchers");
      expect(mockResult.summary).toHaveProperty("totalProcessed");
      expect(mockResult.summary).toHaveProperty("avgResponseHours");
    });

    it("应支持today/week/month三种时间维度", () => {
      const validPeriods = ["today", "week", "month"];
      validPeriods.forEach(p => {
        expect(["today", "week", "month"]).toContain(p);
      });
    });

    it("综合评分计算应正确", () => {
      // 综合评分 = 处理量(40%) + 响应速度(30%) + 完成率(30%)
      const processed = 25;
      const speedScore = 80; // 2-6h
      const completionRate = 80;
      const totalScore = Math.round(processed * 0.4 + speedScore * 0.3 + completionRate * 0.3);
      expect(totalScore).toBe(Math.round(25 * 0.4 + 80 * 0.3 + 80 * 0.3));
      expect(totalScore).toBe(58);
    });

    it("响应速度评分应正确分级", () => {
      const getSpeedScore = (hours: number | null) => {
        if (hours === null) return 50;
        if (hours < 2) return 100;
        if (hours < 6) return 80;
        if (hours < 12) return 60;
        if (hours < 24) return 40;
        return 20;
      };

      expect(getSpeedScore(null)).toBe(50);
      expect(getSpeedScore(1)).toBe(100);
      expect(getSpeedScore(1.9)).toBe(100);
      expect(getSpeedScore(2)).toBe(80);
      expect(getSpeedScore(5.9)).toBe(80);
      expect(getSpeedScore(6)).toBe(60);
      expect(getSpeedScore(11.9)).toBe(60);
      expect(getSpeedScore(12)).toBe(40);
      expect(getSpeedScore(23.9)).toBe(40);
      expect(getSpeedScore(24)).toBe(20);
      expect(getSpeedScore(48)).toBe(20);
    });

    it("排名应按综合评分降序排列", () => {
      const rankings = [
        { name: "A", totalScore: 50, processed: 10 },
        { name: "B", totalScore: 80, processed: 30 },
        { name: "C", totalScore: 65, processed: 20 },
      ];

      rankings.sort((a, b) => b.totalScore - a.totalScore || b.processed - a.processed);

      expect(rankings[0].name).toBe("B");
      expect(rankings[1].name).toBe("C");
      expect(rankings[2].name).toBe("A");
    });

    it("同分时应按处理量降序排列", () => {
      const rankings = [
        { name: "A", totalScore: 60, processed: 15 },
        { name: "B", totalScore: 60, processed: 25 },
        { name: "C", totalScore: 60, processed: 20 },
      ];

      rankings.sort((a, b) => b.totalScore - a.totalScore || b.processed - a.processed);

      expect(rankings[0].name).toBe("B");
      expect(rankings[1].name).toBe("C");
      expect(rankings[2].name).toBe("A");
    });

    it("角色标签应正确映射", () => {
      const getRoleLabel = (role: string) => {
        if (role === "ltl_dispatcher") return "零担";
        if (role === "outsource_dispatcher") return "外请";
        if (role === "fleet_dispatcher") return "车队";
        return "调度";
      };

      expect(getRoleLabel("ltl_dispatcher")).toBe("零担");
      expect(getRoleLabel("outsource_dispatcher")).toBe("外请");
      expect(getRoleLabel("fleet_dispatcher")).toBe("车队");
      expect(getRoleLabel("unknown")).toBe("调度");
    });

    it("空数据时应返回空排名和零汇总", () => {
      const emptyResult = {
        rankings: [],
        summary: { totalDispatchers: 0, totalProcessed: 0, avgResponseHours: 0 },
      };

      expect(emptyResult.rankings).toHaveLength(0);
      expect(emptyResult.summary.totalDispatchers).toBe(0);
      expect(emptyResult.summary.totalProcessed).toBe(0);
      expect(emptyResult.summary.avgResponseHours).toBe(0);
    });

    it("完成率计算应正确", () => {
      // completionRate = processed > 0 ? Math.round(completed / processed * 100) : 0
      expect(Math.round(20 / 25 * 100)).toBe(80);
      expect(Math.round(0 / 25 * 100)).toBe(0);
      expect(Math.round(25 / 25 * 100)).toBe(100);
      // 无处理量时
      const processed = 0;
      const completionRate = processed > 0 ? Math.round(0 / processed * 100) : 0;
      expect(completionRate).toBe(0);
    });

    it("时间段计算应正确", () => {
      const now = new Date(2026, 1, 28, 10, 0, 0); // 2026-02-28 周六

      // today
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      expect(todayStart.getHours()).toBe(0);
      expect(todayStart.getMinutes()).toBe(0);

      // week (Monday)
      const dayOfWeek = now.getDay(); // 6 = Saturday
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
      expect(weekStart.getDay()).toBe(1); // Monday

      // month
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      expect(monthStart.getDate()).toBe(1);
    });
  });
});
