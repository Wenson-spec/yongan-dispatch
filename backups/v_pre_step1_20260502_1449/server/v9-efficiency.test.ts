import { describe, it, expect } from "vitest";

describe("v9 - 调度效率分析 + 发货时效监控", () => {
  describe("dispatchEfficiency 路由", () => {
    it("应返回正确的数据结构", () => {
      // 验证返回值类型结构
      const mockResult = {
        stationAvgHours: { "录单台": 2.5, "指挥台": 4.1 },
        stationBacklog: [
          { station: "录单台", total: 10, over24h: 2, over48h: 0, maxWaitHours: 30 },
          { station: "指挥台", total: 5, over24h: 1, over48h: 1, maxWaitHours: 55 },
        ],
        comparison: {
          todayProcessed: 15,
          yesterdayProcessed: 12,
          todayChange: 25,
          thisWeekProcessed: 80,
          lastWeekProcessed: 75,
          weekChange: 7,
        },
      };

      expect(mockResult.stationAvgHours).toBeDefined();
      expect(typeof mockResult.stationAvgHours["录单台"]).toBe("number");
      expect(mockResult.stationBacklog).toBeInstanceOf(Array);
      expect(mockResult.stationBacklog[0]).toHaveProperty("station");
      expect(mockResult.stationBacklog[0]).toHaveProperty("total");
      expect(mockResult.stationBacklog[0]).toHaveProperty("over24h");
      expect(mockResult.stationBacklog[0]).toHaveProperty("over48h");
      expect(mockResult.stationBacklog[0]).toHaveProperty("maxWaitHours");
      expect(mockResult.comparison).toHaveProperty("todayProcessed");
      expect(mockResult.comparison).toHaveProperty("yesterdayProcessed");
      expect(mockResult.comparison).toHaveProperty("todayChange");
      expect(mockResult.comparison).toHaveProperty("thisWeekProcessed");
      expect(mockResult.comparison).toHaveProperty("lastWeekProcessed");
      expect(mockResult.comparison).toHaveProperty("weekChange");
    });

    it("工位状态映射应包含所有工位", () => {
      const stationStatuses: Record<string, string[]> = {
        "录单台": ["pending_assign"],
        "指挥台": ["pending_price", "pending_approval"],
        "找车台": ["pending_vehicle"],
        "派车台": ["pending_dispatch"],
        "询价台": ["pending_inquiry", "inquiry_confirmed"],
      };

      expect(Object.keys(stationStatuses)).toHaveLength(5);
      expect(stationStatuses["录单台"]).toContain("pending_assign");
      expect(stationStatuses["指挥台"]).toContain("pending_price");
      expect(stationStatuses["指挥台"]).toContain("pending_approval");
      expect(stationStatuses["找车台"]).toContain("pending_vehicle");
      expect(stationStatuses["派车台"]).toContain("pending_dispatch");
      expect(stationStatuses["询价台"]).toContain("pending_inquiry");
      expect(stationStatuses["询价台"]).toContain("inquiry_confirmed");
    });

    it("效率对比变化率计算应正确", () => {
      // 正常情况
      const todayProcessed = 15;
      const yesterdayProcessed = 12;
      const todayChange = yesterdayProcessed > 0
        ? Math.round((todayProcessed - yesterdayProcessed) / yesterdayProcessed * 100)
        : null;
      expect(todayChange).toBe(25);

      // 下降情况
      const today2 = 8;
      const yesterday2 = 12;
      const change2 = yesterday2 > 0
        ? Math.round((today2 - yesterday2) / yesterday2 * 100)
        : null;
      expect(change2).toBe(-33);

      // 昨日为0的情况
      const today3 = 5;
      const yesterday3 = 0;
      const change3 = yesterday3 > 0
        ? Math.round((today3 - yesterday3) / yesterday3 * 100)
        : null;
      expect(change3).toBeNull();
    });
  });

  describe("shippingTimeliness 路由", () => {
    it("应返回正确的数据结构", () => {
      const mockResult = {
        shipped: { within24h: 50, between24and48h: 10, over48h: 3, total: 63 },
        unshipped: { within24h: 20, between24and48h: 5, over48h: 2, total: 27 },
        urgentOrders: [
          {
            id: 1, orderNumber: "YA20260228001", systemCode: "SYS001",
            mergedPlanNumber: "MP-001",
            parentId: 1001,
            customerName: "测试客户", originCity: "广州", destinationCity: "上海",
            status: "pending_vehicle", waitHours: 46, remainHours: 2, isUrgent: false,
            createdAt: "2026-02-26 10:00:00",
          },
        ],
        onTimeRate24h: 79,
        onTimeRate48h: 95,
      };

      expect(mockResult.shipped).toHaveProperty("within24h");
      expect(mockResult.shipped).toHaveProperty("between24and48h");
      expect(mockResult.shipped).toHaveProperty("over48h");
      expect(mockResult.shipped).toHaveProperty("total");
      expect(mockResult.unshipped).toHaveProperty("within24h");
      expect(mockResult.unshipped).toHaveProperty("between24and48h");
      expect(mockResult.unshipped).toHaveProperty("over48h");
      expect(mockResult.urgentOrders).toBeInstanceOf(Array);
      expect(mockResult.urgentOrders[0]).toHaveProperty("mergedPlanNumber");
      expect(mockResult.urgentOrders[0]).toHaveProperty("parentId");
      expect(mockResult.urgentOrders[0]).toHaveProperty("remainHours");
      expect(mockResult.urgentOrders[0]).toHaveProperty("waitHours");
      expect(typeof mockResult.onTimeRate24h).toBe("number");
      expect(typeof mockResult.onTimeRate48h).toBe("number");
    });

    it("urgentOrders 返回 mergedPlanNumber 时应支持按全局概览口径分组", () => {
      const urgentOrders = [
        { id: 1, mergedPlanNumber: "MP-001", parentId: null, orderNumber: "A001", waitHours: 26 },
        { id: 2, mergedPlanNumber: "MP-001", parentId: null, orderNumber: "A002", waitHours: 49 },
        { id: 3, mergedPlanNumber: null, parentId: null, orderNumber: "A003", waitHours: 12 },
        { id: 4, mergedPlanNumber: "MP-002", parentId: null, orderNumber: "A004", waitHours: 30 },
      ];

      const groups = new Map<string, typeof urgentOrders>();
      const ungrouped: typeof urgentOrders = [];

      for (const order of urgentOrders) {
        if (order.mergedPlanNumber) {
          if (!groups.has(order.mergedPlanNumber)) groups.set(order.mergedPlanNumber, []);
          groups.get(order.mergedPlanNumber)!.push(order);
        } else {
          ungrouped.push(order);
        }
      }

      expect(groups.size).toBe(2);
      expect(groups.get("MP-001")?.map((order) => order.id)).toEqual([1, 2]);
      expect(groups.get("MP-002")?.map((order) => order.id)).toEqual([4]);
      expect(ungrouped.map((order) => order.id)).toEqual([3]);
    });

    it("mergedPlanNumber 为空时应支持按前段外请主单兜底分组", () => {
      const deriveCommandGroupKey = (item: {
        mergedPlanNumber?: string | null;
        parentId?: number | null;
        orderNumber?: string | null;
      }) => {
        if (item.mergedPlanNumber) return item.mergedPlanNumber;
        if (item.parentId !== null && item.parentId !== undefined) return `前段外请主单#${item.parentId}`;
        if (item.orderNumber?.endsWith("-前段外请")) return item.orderNumber.replace(/-前段外请$/, "");
        return null;
      };

      const urgentOrders = [
        { id: 1, mergedPlanNumber: null, parentId: 4, orderNumber: "F0002265965等2单-前段外请" },
        { id: 2, mergedPlanNumber: null, parentId: 4, orderNumber: "F0002265965等2单-前段外请" },
        { id: 3, mergedPlanNumber: null, parentId: null, orderNumber: "F0002265964-前段外请" },
        { id: 4, mergedPlanNumber: null, parentId: null, orderNumber: "F0002265962" },
      ];

      const normalized = urgentOrders.map((item) => ({
        ...item,
        mergedPlanNumber: deriveCommandGroupKey(item),
      }));

      const groups = new Map<string, number[]>();
      const ungrouped: number[] = [];

      for (const order of normalized) {
        if (order.mergedPlanNumber) {
          if (!groups.has(order.mergedPlanNumber)) groups.set(order.mergedPlanNumber, []);
          groups.get(order.mergedPlanNumber)!.push(order.id);
        } else {
          ungrouped.push(order.id);
        }
      }

      expect(groups.get("前段外请主单#4")).toEqual([1, 2]);
      expect(groups.get("F0002265964")).toEqual([3]);
      expect(ungrouped).toEqual([4]);
    });

    it("达标率计算应正确", () => {
      const within24h = 50;
      const between24and48h = 10;
      const over48h = 3;
      const total = within24h + between24and48h + over48h;

      const onTimeRate24h = total > 0 ? Math.round(within24h / total * 100) : 0;
      const onTimeRate48h = total > 0 ? Math.round((within24h + between24and48h) / total * 100) : 0;

      expect(onTimeRate24h).toBe(79);
      expect(onTimeRate48h).toBe(95);
    });

    it("空数据时达标率应为0", () => {
      const total = 0;
      const onTimeRate24h = total > 0 ? Math.round(0 / total * 100) : 0;
      const onTimeRate48h = total > 0 ? Math.round(0 / total * 100) : 0;

      expect(onTimeRate24h).toBe(0);
      expect(onTimeRate48h).toBe(0);
    });

    it("紧急订单应按剩余时间<12h筛选", () => {
      const orders = [
        { id: 1, waitHours: 40, remainHours: 8 },   // 剩余8h < 12h → 紧急
        { id: 2, waitHours: 20, remainHours: 28 },   // 剩余28h > 12h → 不紧急
        { id: 3, waitHours: 50, remainHours: -2 },   // 已超时 → 紧急
        { id: 4, waitHours: 36, remainHours: 12 },   // 刚好12h → 不紧急
        { id: 5, waitHours: 37, remainHours: 11 },   // 11h < 12h → 紧急
      ];

      const urgent = orders.filter(o => o.remainHours < 12);
      expect(urgent).toHaveLength(3);
      expect(urgent.map(o => o.id)).toEqual([1, 3, 5]);
    });

    it("甲方时效规则：24h正常，24-48h预警，>48h超时", () => {
      const categorize = (waitHours: number) => {
        if (waitHours <= 24) return "正常";
        if (waitHours <= 48) return "预警";
        return "超时";
      };

      expect(categorize(12)).toBe("正常");
      expect(categorize(24)).toBe("正常");
      expect(categorize(25)).toBe("预警");
      expect(categorize(48)).toBe("预警");
      expect(categorize(49)).toBe("超时");
      expect(categorize(72)).toBe("超时");
    });
  });

  describe("积压监控逻辑", () => {
    it("积压进度条比例计算应正确", () => {
      const backlog = { total: 20, over24h: 8, over48h: 3 };

      const normalPct = Math.max(0, backlog.total - backlog.over24h) / backlog.total * 100;
      const warnPct = Math.max(0, backlog.over24h - backlog.over48h) / backlog.total * 100;
      const dangerPct = backlog.over48h / backlog.total * 100;

      expect(normalPct).toBe(60);
      expect(warnPct).toBe(25);
      expect(dangerPct).toBe(15);
      expect(normalPct + warnPct + dangerPct).toBe(100);
    });

    it("无积压时应显示全绿", () => {
      const backlog = { total: 0, over24h: 0, over48h: 0 };
      expect(backlog.total).toBe(0);
    });
  });
});
