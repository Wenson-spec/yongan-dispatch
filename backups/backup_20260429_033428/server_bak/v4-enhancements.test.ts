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
            mergedPlanNumber: "P0000050961",
            customerPrice: "1200",
            cargoName: "托装",
            weight: "5.5",
            originCity: "清远",
            destinationCity: "南昌市",
            deliveryAddress: "江西省南昌市新建区XX路",
            receiverName: "张三",
            receiverPhone: "13800138000",
            shippingNote: "2700×1200, 5托, 120片, 铁架",
            remarks: "",
            isUrgent: false,
            urgentReason: "",
            isLargeSlab: true,
            chargeableWeight: "32",
            packageCount: "3",
            confidence: {
              customerName: "high",
              warehouseName: "high",
              orderNumber: "high",
              mergedPlanNumber: "high",
              customerPrice: "medium",
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
          }, {
            customerName: "测试客户",
            warehouseName: "清远青龙仓",
            orderNumber: "F0001234568",
            mergedPlanNumber: "P0000050961",
            customerPrice: "800",
            cargoName: "散装",
            weight: "3.2",
            originCity: "清远",
            destinationCity: "赣州市",
            deliveryAddress: "江西省赣州市章贡区YY路",
            receiverName: "李四",
            receiverPhone: "13900139000",
            shippingNote: "800×800, 3托, 50件",
            remarks: "下午送达",
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
              customerPrice: "low",
              cargoName: "high",
              weight: "high",
              originCity: "high",
              destinationCity: "high",
              deliveryAddress: "medium",
              receiverName: "high",
              receiverPhone: "high",
              shippingNote: "medium",
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

describe("V4 Enhancements", () => {
  describe("1. SmartPaste shippingNote extraction", () => {
    it("returns shippingNote field in parsed orders", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.smartPaste.parse({
        text: "合并计划号P0000050961\nF0001234567 清远青龙仓---江西省南昌市新建区XX路 2700×1200 5托 120片 铁架 5.5吨\nF0001234568 清远青龙仓---江西省赣州市章贡区YY路 800×800 3托 50件 3.2吨",
      });
      expect(result).toBeDefined();
      expect(result.orders).toBeDefined();
      expect(Array.isArray(result.orders)).toBe(true);
      // Verify shippingNote field exists in each order
      if (result.orders.length > 0) {
        result.orders.forEach((order: any) => {
          expect(order).toHaveProperty("shippingNote");
          expect(typeof order.shippingNote).toBe("string");
        });
      }
    });

    it("returns mergedPlanNumber for grouped orders", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.smartPaste.parse({
        text: "合并计划号P0000050961\nF0001234567 5.5吨\nF0001234568 3.2吨",
      });
      expect(result.orders).toBeDefined();
      if (result.orders.length > 0) {
        result.orders.forEach((order: any) => {
          expect(order).toHaveProperty("mergedPlanNumber");
        });
      }
    });

    it("returns isLargeSlab and chargeableWeight for large slab orders", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.smartPaste.parse({
        text: "2700×1200大板 按32吨算 3架 清远发南昌",
      });
      expect(result.orders).toBeDefined();
      if (result.orders.length > 0) {
        result.orders.forEach((order: any) => {
          expect(order).toHaveProperty("isLargeSlab");
          expect(order).toHaveProperty("chargeableWeight");
          expect(order).toHaveProperty("packageCount");
        });
      }
    });
  });

  describe("2. Note change logs route", () => {
    it("getNoteChangeLogs route exists and accepts orderId", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      // DB is mocked to null, so it returns empty array
      const result = await caller.order.getNoteChangeLogs({ orderId: 1 });
      expect(result).toEqual([]);
    });

    it("getNoteChangeLogs returns array type", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.order.getNoteChangeLogs({ orderId: 999 });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("3. Router structure validation", () => {
    it("order router has getNoteChangeLogs procedure", () => {
      const caller = appRouter.createCaller(createAdminContext());
      expect(caller.order.getNoteChangeLogs).toBeDefined();
    });

    it("order router has updateOrderFields procedure", () => {
      const caller = appRouter.createCaller(createAdminContext());
      expect(caller.order.updateOrderFields).toBeDefined();
    });

    it("smartPaste router has parse procedure", () => {
      const caller = appRouter.createCaller(createAdminContext());
      expect(caller.smartPaste.parse).toBeDefined();
    });
  });

  describe("4. Schema validation for shippingNote in confidence", () => {
    it("LLM response includes shippingNote confidence", async () => {
      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.smartPaste.parse({
        text: "测试文本 5吨 清远发南昌 2700×1200 5托",
      });
      if (result.orders.length > 0) {
        result.orders.forEach((order: any) => {
          if (order.confidence) {
            expect(order.confidence).toHaveProperty("shippingNote");
            expect(["high", "medium", "low"]).toContain(order.confidence.shippingNote);
          }
        });
      }
    });
  });
});
