import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database module
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(null),
    createOperationLog: vi.fn().mockResolvedValue(undefined),
    getUserPermissions: vi.fn().mockResolvedValue([
      "order.create", "order.edit", "order.view_all", "order.view_own",
      "order.assign", "order.mark_urgent", "order.adjust", "order.hold_cancel",
      "order.update_status",
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

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify([{
          customerName: "测试客户",
          cargoName: "电子产品",
          weight: "5",
          originCity: "深圳",
          destinationCity: "上海",
          receiverName: "张三",
          receiverPhone: "13800138000",
        }]),
      },
    }],
  }),
}));

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test.jpg", url: "https://example.com/test.jpg" }),
}));

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

describe("SmartPaste Router", () => {
  describe("smartPaste.parse", () => {
    it("accepts text input for parsing", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.smartPaste.parse({
        text: "客户: 测试客户\n货物: 电子产品\n重量: 5吨\n发货地: 深圳\n目的地: 上海",
      });
      expect(result).toBeDefined();
      expect(result).toHaveProperty("orders");
      expect(result).toHaveProperty("rawText");
    });

    it("rejects unauthenticated requests", async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      await expect(
        caller.smartPaste.parse({ text: "test" })
      ).rejects.toThrow();
    });
  });

  describe("smartPaste.tmsExport", () => {
    it("returns empty data when DB is unavailable", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.smartPaste.tmsExport({
        exportType: "full",
      });
      expect(result).toEqual({ columns: [], rows: [] });
    });

    it("accepts all export types", async () => {
      const caller = appRouter.createCaller(createAdminContext());

      for (const exportType of ["full", "outsource", "self", "ltl"] as const) {
        const result = await caller.smartPaste.tmsExport({ exportType });
        expect(result).toBeDefined();
        expect(result.columns).toBeDefined();
        expect(Array.isArray(result.columns)).toBe(true);
      }
    });

    it("accepts date range and customer filters", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.smartPaste.tmsExport({
        exportType: "full",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        customerId: 1,
      });
      expect(result).toEqual({ columns: [], rows: [] });
    });

    it("rejects unauthenticated requests", async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      await expect(
        caller.smartPaste.tmsExport({ exportType: "full" })
      ).rejects.toThrow();
    });
  });
});

describe("Operation Logs with keyword search", () => {
  it("accepts keyword parameter", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.stats.operationLogs({
      page: 1,
      pageSize: 10,
      keyword: "测试搜索",
    });
    expect(result).toEqual({ items: [], total: 0 });
  });

  it("accepts action and targetType filters", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.stats.operationLogs({
      page: 1,
      pageSize: 10,
      action: "create",
      targetType: "order",
    });
    expect(result).toEqual({ items: [], total: 0 });
  });
});

describe("Router structure - new routes", () => {
  it("appRouter has smartPaste sub-router", () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.smartPaste).toBeDefined();
  });
});
