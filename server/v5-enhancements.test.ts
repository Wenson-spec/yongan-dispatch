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
      "order.update_status", "order.rollback", "order.delete",
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
        content: JSON.stringify({
          orders: [{
            customerName: "测试客户",
            warehouseName: "清远青龙仓",
            orderNumber: "F0001234567",
            mergedPlanNumber: "",
            customerPrice: "1200",
            cargoName: "托装",
            weight: "5.5",
            originCity: "清远",
            destinationCity: "南昌市",
            deliveryAddress: "江西省南昌市新建区XX路",
            receiverName: "张三",
            receiverPhone: "13800138000",
            shippingNote: "2700×1200, 5托",
            remarks: "",
            isUrgent: false,
            urgentReason: "",
            isLargeSlab: false,
            chargeableWeight: "",
            packageCount: "",
            confidence: {
              customerName: "high",
              warehouseName: "high",
              orderNumber: "high",
              mergedPlanNumber: "high",
              customerPrice: "high",
              cargoName: "high",
              weight: "high",
              originCity: "high",
              destinationCity: "high",
              deliveryAddress: "high",
              receiverName: "high",
              receiverPhone: "high",
              shippingNote: "high",
              remarks: "high",
            },
          }],
        }),
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

describe("V5 Enhancements", () => {
  describe("1. Template memory - Router structure", () => {
    it("smartPaste router has saveTemplate procedure", () => {
      const caller = appRouter.createCaller(createAdminContext());
      expect(caller.smartPaste.saveTemplate).toBeDefined();
    });

    it("smartPaste router has listTemplates procedure", () => {
      const caller = appRouter.createCaller(createAdminContext());
      expect(caller.smartPaste.listTemplates).toBeDefined();
    });

    it("smartPaste router has deleteTemplate procedure", () => {
      const caller = appRouter.createCaller(createAdminContext());
      expect(caller.smartPaste.deleteTemplate).toBeDefined();
    });

    it("smartPaste router has applyTemplate procedure", () => {
      const caller = appRouter.createCaller(createAdminContext());
      expect(caller.smartPaste.applyTemplate).toBeDefined();
    });

    it("smartPaste router has recordTemplateSuccess procedure", () => {
      const caller = appRouter.createCaller(createAdminContext());
      expect(caller.smartPaste.recordTemplateSuccess).toBeDefined();
    });
  });

  describe("2. Template memory - listTemplates", () => {
    it("listTemplates returns empty array when db is null", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.smartPaste.listTemplates();
      expect(result).toEqual([]);
    });

    it("listTemplates accepts optional customerName filter", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.smartPaste.listTemplates({ customerName: "测试" });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("3. Template memory - saveTemplate validation", () => {
    it("saveTemplate rejects empty customerName", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        caller.smartPaste.saveTemplate({
          customerName: "",
          templateName: "测试模板",
          sampleText: "测试文本",
        })
      ).rejects.toThrow();
    });

    it("saveTemplate rejects empty templateName", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        caller.smartPaste.saveTemplate({
          customerName: "测试客户",
          templateName: "",
          sampleText: "测试文本",
        })
      ).rejects.toThrow();
    });

    it("saveTemplate rejects empty sampleText", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        caller.smartPaste.saveTemplate({
          customerName: "测试客户",
          templateName: "测试模板",
          sampleText: "",
        })
      ).rejects.toThrow();
    });
  });

  describe("4. Template memory - deleteTemplate", () => {
    it("deleteTemplate throws when db is null", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        caller.smartPaste.deleteTemplate({ id: 1 })
      ).rejects.toThrow("数据库不可用");
    });
  });

  describe("5. Template memory - recordTemplateSuccess", () => {
    it("recordTemplateSuccess returns matched false when db is null", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.smartPaste.recordTemplateSuccess({
        customerName: "测试客户",
        rawText: "测试文本",
      });
      expect(result).toEqual({ matched: false });
    });
  });

  describe("6. Template memory - applyTemplate", () => {
    it("applyTemplate throws when db is null", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        caller.smartPaste.applyTemplate({
          templateId: 1,
          text: "测试文本",
        })
      ).rejects.toThrow("数据库不可用");
    });
  });

  describe("7. Merged plan group hook", () => {
    it("useMergedPlanGroups hook file exists", async () => {
      // Verify the hook file can be imported (structure check)
      const fs = await import("fs");
      const hookPath = new URL("../client/src/hooks/useMergedPlanGroups.ts", import.meta.url);
      expect(fs.existsSync(hookPath)).toBe(true);
    });

    it("MergedPlanGroupHeader component file exists", async () => {
      const fs = await import("fs");
      const componentPath = new URL("../client/src/components/MergedPlanGroupHeader.tsx", import.meta.url);
      expect(fs.existsSync(componentPath)).toBe(true);
    });
  });
});
