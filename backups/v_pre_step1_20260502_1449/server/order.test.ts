import { describe, expect, it, vi, beforeEach } from "vitest";
import { afterEach } from "vitest";
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

function createDispatcherContext(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "dispatcher-user",
      email: "dispatcher@yongan.com",
      name: "外请调度",
      loginMethod: "manus",
      role: "outsource_dispatcher",
      username: "dispatcher1",
      passwordHash: null,
      phone: null,
      region: "华东",
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

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("Order Router", () => {
  describe("order.list", () => {
    it("returns empty list when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.order.list({ page: 1, pageSize: 10 });
      expect(result).toEqual({ items: [], total: 0 });
    });

    it("accepts all filter parameters without error", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.order.list({
        page: 1,
        pageSize: 10,
        businessType: "outsource",
        status: "pending_assign",
        isUrgent: true,
        keyword: "YA",
        destinationCity: "上海",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      expect(result).toEqual({ items: [], total: 0 });
    });

    it("rejects unauthenticated requests", async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      await expect(caller.order.list({ page: 1 })).rejects.toThrow();
    });
  });

  describe("order.getById", () => {
    it("returns null when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.order.getById({ id: 999 });
      expect(result).toBeNull();
    });
  });

  describe("order.stats", () => {
    it("returns default stats when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.order.stats();
      expect(result).toEqual({
        total: 0,
        pendingAssign: 0,
        dispatching: 0,
        inTransit: 0,
        delivered: 0,
        urgent: 0,
        todayNew: 0,
      });
    });

    it("rejects unauthenticated requests", async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      await expect(caller.order.stats()).rejects.toThrow();
    });
  });
});

describe("Approval Router", () => {
  describe("approval.list", () => {
    it("returns empty list when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.approval.list({ page: 1, pageSize: 10 });
      expect(result).toEqual({ items: [], total: 0 });
    });

    it("accepts status filter", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.approval.list({ page: 1, pageSize: 10, status: "pending" });
      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe("approval.pendingCount", () => {
    it("returns 0 when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.approval.pendingCount();
      expect(result).toBe(0);
    });
  });
});

describe("Stats Router", () => {
  describe("stats.dashboard", () => {
    it("returns null when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.dashboard();
      expect(result).toBeNull();
    });

    it("accepts date range filter", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.dashboard({
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      expect(result).toBeNull();
    });
  });

  describe("stats.freightRates", () => {
    it("returns empty list with period info when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.freightRates({});
      expect(result.items).toEqual([]);
      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('momPeriod');
      expect(result).toHaveProperty('yoyPeriod');
    });

    it("accepts all filter parameters including province/city", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.freightRates({
        originProvince: "广东",
        originCity: "广州",
        destinationProvince: "浙江",
        destinationCity: "杭州",
        businessType: "outsource",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      expect(result.items).toEqual([]);
      // DB is null in test, so periods are empty strings
      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('momPeriod');
      expect(result).toHaveProperty('yoyPeriod');
    });

    it("accepts ltl business type filter", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.freightRates({
        businessType: "ltl",
      });
      expect(result.items).toEqual([]);
    });

    it("returns correct structure with YoY/MoM fields when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.freightRates({
        startDate: "2026-02-01",
        endDate: "2026-02-28",
      });
      // DB is null so items empty and periods are empty strings
      expect(result.items).toEqual([]);
      expect(typeof result.period).toBe('string');
      expect(typeof result.momPeriod).toBe('string');
      expect(typeof result.yoyPeriod).toBe('string');
    });
  });

  describe("stats.largeSlabRates", () => {
    it("returns empty list when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.largeSlabRates({});
      expect(result).toEqual({ items: [] });
    });

    it("accepts all filter parameters", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.largeSlabRates({
        originProvince: "广东",
        originCity: "佛山",
        destinationProvince: "江苏",
        destinationCity: "南京",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      expect(result).toEqual({ items: [] });
    });
  });

  describe("stats.freightRateDetails", () => {
    it("returns empty list when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.freightRateDetails({
        originCity: "广州",
        destinationCity: "上海",
      });
      expect(result).toEqual({ items: [], total: 0 });
    });

    it("accepts date range and pagination", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.freightRateDetails({
        originCity: "广州",
        destinationCity: "上海",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        page: 1,
        pageSize: 20,
      });
      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe("stats.freightRateTrend", () => {
    it("returns empty series when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.freightRateTrend({
        routes: [{ originCity: "广州", destinationCity: "上海" }],
        tier: "tier5",
        months: 6,
      });
      expect(result).toEqual({ series: [] });
    });

    it("accepts multiple routes for comparison", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.freightRateTrend({
        routes: [
          { originCity: "广州", destinationCity: "上海" },
          { originCity: "深圳", destinationCity: "北京" },
        ],
        tier: "tier3",
        months: 12,
      });
      expect(result).toEqual({ series: [] });
    });

    it("validates routes array - min 1 route", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        caller.stats.freightRateTrend({
          routes: [],
          tier: "tier5",
          months: 6,
        })
      ).rejects.toThrow();
    });

    it("validates months range - min 3", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        caller.stats.freightRateTrend({
          routes: [{ originCity: "广州", destinationCity: "上海" }],
          tier: "tier5",
          months: 1,
        })
      ).rejects.toThrow();
    });

    it("validates months range - max 24", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        caller.stats.freightRateTrend({
          routes: [{ originCity: "广州", destinationCity: "上海" }],
          tier: "tier5",
          months: 36,
        })
      ).rejects.toThrow();
    });

    it("validates tier enum values", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        caller.stats.freightRateTrend({
          routes: [{ originCity: "广州", destinationCity: "上海" }],
          tier: "invalid" as any,
          months: 6,
        })
      ).rejects.toThrow();
    });

    it("accepts all valid tier values", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      for (const tier of ["tier1", "tier2", "tier3", "tier4", "tier5"] as const) {
        const result = await caller.stats.freightRateTrend({
          routes: [{ originCity: "广州", destinationCity: "上海" }],
          tier,
          months: 6,
        });
        expect(result).toEqual({ series: [] });
      }
    });
  });

  describe("stats.availableRoutes", () => {
    it("returns empty array when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.availableRoutes();
      expect(result).toEqual([]);
    });
  });

  describe("stats.customerLedger", () => {
    it("returns empty list when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.customerLedger({});
      expect(result).toEqual([]);
    });

    it("accepts customer name filter", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.customerLedger({
        customerName: "测试客户",
      });
      expect(result).toEqual([]);
    });
  });

  describe("stats.operationLogs", () => {
    it("returns empty list when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.stats.operationLogs({
        page: 1,
        pageSize: 10,
      });
      expect(result).toEqual({ items: [], total: 0 });
    });
  });
});

describe("POD Router", () => {
  describe("pod.list", () => {
    it("returns empty list when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.pod.list({ page: 1, pageSize: 10 });
      expect(result).toEqual({ items: [], total: 0 });
    });
  });
});

describe("LTL Inquiry Router", () => {
  describe("ltlInquiry.listByOrder", () => {
    it("returns empty list when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.ltlInquiry.listByOrder({ orderId: 1 });
      expect(result).toEqual([]);
    });
  });
});

describe("Auth protection", () => {
  it("all protected routes reject unauthenticated users", async () => {
    const caller = appRouter.createCaller(createUnauthContext());

    // Test a selection of protected routes
    await expect(caller.order.list({ page: 1 })).rejects.toThrow();
    await expect(caller.order.stats()).rejects.toThrow();
    await expect(caller.approval.list({ page: 1 })).rejects.toThrow();
    await expect(caller.approval.pendingCount()).rejects.toThrow();
    await expect(caller.stats.dashboard()).rejects.toThrow();
    await expect(caller.pod.list({ page: 1 })).rejects.toThrow();
    await expect(caller.ltlInquiry.listByOrder({ orderId: 1 })).rejects.toThrow();
  });
});

describe("Order - Batch Rollback", () => {
  it("batchRollback requires authentication", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.order.batchRollback({ ids: [1, 2, 3], reason: "测试批量退回" })
    ).rejects.toThrow();
  });

  it("batchRollback validates input - requires at least 1 id", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.order.batchRollback({ ids: [], reason: "测试" })
    ).rejects.toThrow();
  });

  it("batchRollback validates input - reason is required", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.order.batchRollback({ ids: [1], reason: "" })
    ).rejects.toThrow();
  });

  it("batchRollback throws when DB is unavailable", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.order.batchRollback({ ids: [1, 2], reason: "测试退回" })
    ).rejects.toThrow("数据库不可用");
  });

  it("batchRollback rejects more than 50 ids", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const ids = Array.from({ length: 51 }, (_, i) => i + 1);
    await expect(
      caller.order.batchRollback({ ids, reason: "批量退回测试" })
    ).rejects.toThrow();
  });
});

describe("Router structure", () => {
  it("appRouter has all expected sub-routers", () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Verify all sub-routers exist
    expect(caller.order).toBeDefined();
    expect(caller.approval).toBeDefined();
    expect(caller.pod).toBeDefined();
    expect(caller.ltlInquiry).toBeDefined();
    expect(caller.stats).toBeDefined();
    expect(caller.customer).toBeDefined();
    expect(caller.warehouse).toBeDefined();
    expect(caller.freightStation).toBeDefined();
    expect(caller.vehicle).toBeDefined();
    expect(caller.driver).toBeDefined();
    expect(caller.department).toBeDefined();
    expect(caller.cargoType).toBeDefined();
    expect(caller.dispatcherRegion).toBeDefined();
    expect(caller.user).toBeDefined();
    expect(caller.permission).toBeDefined();
    expect(caller.auth).toBeDefined();
    expect(caller.system).toBeDefined();
  });
});

describe("Entry Station workflow contracts", () => {
  afterEach(async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
  });

  function createPendingAssignDb(insertIds: number[] = [1]) {
    const insertedRows: Array<Record<string, unknown>> = [];
    let nextIndex = 0;

    const insertImpl = async (payload: Record<string, unknown>) => {
      insertedRows.push(payload);
      const insertId = insertIds[nextIndex] ?? nextIndex + 1;
      nextIndex += 1;
      return [{ insertId }];
    };

    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(insertImpl),
      })),
      transaction: vi.fn(async (callback: (tx: any) => Promise<void>) =>
        callback({
          insert: vi.fn(() => ({
            values: vi.fn(insertImpl),
          })),
        }),
      ),
    };

    return { db, insertedRows };
  }

  it("listEntryQueue accepts returned view and falls back to empty list when DB is unavailable", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.order.listEntryQueue({
      page: 1,
      pageSize: 20,
      view: "returned",
      keyword: "退回",
    });

    expect(result).toEqual({ items: [], total: 0 });
  });

  it("create always inserts new orders into pending_assign before later branching", async () => {
    const { getDb } = await import("./db");
    const { db, insertedRows } = createPendingAssignDb([101, 102, 103]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    const caller = appRouter.createCaller(createAdminContext());
    for (const businessType of ["outsource", "self", "ltl"] as const) {
      await caller.order.create({
        orderNumber: `ENTRY-${businessType}`,
        businessType,
      });
    }

    expect(insertedRows).toHaveLength(3);
    expect(insertedRows.map((row) => row.status)).toEqual([
      "pending_assign",
      "pending_assign",
      "pending_assign",
    ]);
    expect(insertedRows.map((row) => row.businessType)).toEqual([
      "outsource",
      "self",
      "ltl",
    ]);
  });

  it("batchCreate keeps every imported order in pending_assign before entry-station routing", async () => {
    const { getDb } = await import("./db");
    const { db, insertedRows } = createPendingAssignDb([201, 202, 203]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.order.batchCreate({
      orders: [
        { orderNumber: "B-OUT", businessType: "outsource" },
        { orderNumber: "B-SELF", businessType: "self" },
        { orderNumber: "B-LTL", businessType: "ltl" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
    expect(insertedRows).toHaveLength(3);
    expect(insertedRows.every((row) => row.status === "pending_assign")).toBe(true);
    expect(insertedRows.map((row) => row.businessType)).toEqual([
      "outsource",
      "self",
      "ltl",
    ]);
  });
});
