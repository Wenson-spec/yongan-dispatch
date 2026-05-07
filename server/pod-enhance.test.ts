import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database module to avoid real DB calls
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(null),
    createOperationLog: vi.fn().mockResolvedValue(undefined),
    getUserPermissions: vi.fn().mockResolvedValue([
      "order.create", "order.edit", "order.view_all", "order.view_own",
      "order.assign", "order.mark_urgent", "order.adjust", "order.hold_cancel",
      "order.update_status", "order.delete", "order.rollback",
      "kanban.global", "kanban.outsource", "kanban.self", "kanban.ltl",
      "approval.execute", "approval.view_history",
      "pod.view", "pod.mark_sent", "pod.confirm_received", "pod.refund_deposit",
      "stats.full", "stats.personal",
      "freight_rate.view", "freight_rate.export",
      "export.customer_ledger",
      "log.view",
      "config.customer", "config.warehouse", "config.vehicle_driver",
      "config.user", "config.dispatcher_region", "config.permission",
      "outsource.vehicle_input", "outsource.submit_quote", "outsource.set_price",
      "fleet.dispatch", "fleet.vehicle_status",
      "ltl.inquiry", "ltl.arrange_ship", "ltl.upload_pod", "ltl.ocr_verify",
    ]),
  };
});

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-user",
      email: "admin@yongan.com",
      name: "管理员",
      loginMethod: "manus",
      role: "admin",
      username: "admin",
      passwordHash: null,
      phone: null,
      region: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

const caller = appRouter.createCaller(createAdminContext());

describe("财务回单确认台与回单处理流程增强", () => {
  describe("pod.list 搜索功能", () => {
    it("应支持keyword参数", async () => {
      // 当DB为null时，应返回空结果而非报错
      const result = await caller.pod.list({ keyword: "测试客户" });
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("无keyword时应返回所有回单", async () => {
      const result = await caller.pod.list({});
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
    });

    it("空字符串keyword应视为无搜索", async () => {
      const result = await caller.pod.list({ keyword: "" });
      expect(result).toHaveProperty("items");
      expect(result.items).toEqual([]);
    });

    it("支持分页参数", async () => {
      const result = await caller.pod.list({ page: 2, pageSize: 10 });
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
    });

    it("支持originalStatus过滤", async () => {
      const result = await caller.pod.list({ originalStatus: "pending" });
      expect(result).toHaveProperty("items");
    });

    it("支持keyword + originalStatus组合", async () => {
      const result = await caller.pod.list({ keyword: "张三", originalStatus: "sent" });
      expect(result).toHaveProperty("items");
    });
  });

  describe("pod.depositStats 押金统计", () => {
    it("应返回正确的统计结构", async () => {
      const result = await caller.pod.depositStats();
      expect(result).toHaveProperty("pendingTotal");
      expect(result).toHaveProperty("refundedTotal");
      expect(result).toHaveProperty("nonRefundableTotal");
      expect(result).toHaveProperty("pendingCount");
      expect(result).toHaveProperty("refundedCount");
      expect(result).toHaveProperty("nonRefundableCount");
    });

    it("DB为null时应返回零值", async () => {
      const result = await caller.pod.depositStats();
      expect(result.pendingTotal).toBe("0");
      expect(result.refundedTotal).toBe("0");
      expect(result.nonRefundableTotal).toBe("0");
      expect(result.pendingCount).toBe(0);
      expect(result.refundedCount).toBe(0);
      expect(result.nonRefundableCount).toBe(0);
    });
  });

  describe("pod.overdueList 超期回单列表", () => {
    it("应支持overdueDays参数", async () => {
      const result = await caller.pod.overdueList({ overdueDays: 5 });
      expect(Array.isArray(result)).toBe(true);
    });

    it("默认overdueDays为5", async () => {
      const result = await caller.pod.overdueList({});
      expect(Array.isArray(result)).toBe(true);
    });

    it("DB为null时应返回空数组", async () => {
      const result = await caller.pod.overdueList({ overdueDays: 5 });
      expect(result).toEqual([]);
    });
  });

  describe("pod.checkOverdueAndNotify 超期通知", () => {
    it("应返回通知结果", async () => {
      const result = await caller.pod.checkOverdueAndNotify();
      expect(result).toHaveProperty("notified");
      expect(typeof result.notified).toBe("number");
    });

    it("DB为null时应返回notified=0", async () => {
      const result = await caller.pod.checkOverdueAndNotify();
      expect(result.notified).toBe(0);
    });
  });

  describe("pod.selfMonthlyUnreceivedStats 自运月度未收统计", () => {
    it("DB为null时应返回完整的月度统计兜底结构", async () => {
      const result = await caller.pod.selfMonthlyUnreceivedStats();
      expect(result).toHaveProperty("currentMonth");
      expect(result).toHaveProperty("selectedMonth");
      expect(result).toHaveProperty("months");
      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("items");
      expect(Array.isArray(result.months)).toBe(true);
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.summary).toMatchObject({
        month: result.selectedMonth,
        signedTotalCount: 0,
        receivedCount: 0,
        unreceivedCount: 0,
        pendingCount: 0,
        sentCount: 0,
        lostCount: 0,
        overdueCount: 0,
        yellowCount: 0,
        orangeCount: 0,
        redCount: 0,
        vehicleCount: 0,
        customerCount: 0,
        oldestSignedDate: null,
      });
    });

    it("应支持指定统计月份并回传为 selectedMonth", async () => {
      const result = await caller.pod.selfMonthlyUnreceivedStats({ month: "2026-03" });
      expect(result.selectedMonth).toBe("2026-03");
      expect(result.summary.month).toBe("2026-03");
      expect(result.items).toEqual([]);
    });
  });

  describe("order.list 搜索增强", () => {
    it("keyword搜索应支持车牌号", async () => {
      // 验证API不报错（DB为null返回空结果）
      const result = await caller.order.list({ page: 1, pageSize: 10, keyword: "京A12345" });
      expect(result).toHaveProperty("items");
    });

    it("keyword搜索应支持司机名", async () => {
      const result = await caller.order.list({ page: 1, pageSize: 10, keyword: "张师傅" });
      expect(result).toHaveProperty("items");
    });
  });
});

describe("podOverdueChecker 定时任务模块", () => {
  it("checkOverduePods函数应可导入并执行", async () => {
    const { checkOverduePods } = await import("./podOverdueChecker");
    expect(typeof checkOverduePods).toBe("function");
    const result = await checkOverduePods();
    expect(result).toHaveProperty("notified");
    expect(result.notified).toBe(0); // DB为null
  });

  it("startPodOverdueChecker和stopPodOverdueChecker应可导入", async () => {
    const { startPodOverdueChecker, stopPodOverdueChecker } = await import("./podOverdueChecker");
    expect(typeof startPodOverdueChecker).toBe("function");
    expect(typeof stopPodOverdueChecker).toBe("function");
  });
});
