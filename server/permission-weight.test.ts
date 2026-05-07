import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database module to avoid real DB calls
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(null),
    createOperationLog: vi.fn().mockResolvedValue(undefined),
    getUserPermissions: vi.fn().mockImplementation(async (role: string) => {
      // 根据角色返回对应的默认权限（简化版）
      const permMap: Record<string, string[]> = {
        admin: ["order.create", "order.edit", "order.view_all", "order.view_own",
          "order.assign", "order.mark_urgent", "order.adjust", "order.hold_cancel",
          "order.update_status", "order.delete", "order.rollback",
          "kanban.global", "kanban.outsource", "kanban.self", "kanban.ltl",
          "approval.execute", "approval.view_history",
          "pod.view", "pod.mark_sent", "pod.confirm_received", "pod.refund_deposit",
          "stats.full", "stats.personal", "freight_rate.view", "freight_rate.export",
          "export.customer_ledger", "log.view",
          "config.customer", "config.warehouse", "config.vehicle_driver",
          "config.user", "config.dispatcher_region", "config.permission",
          "outsource.vehicle_input", "outsource.submit_quote", "outsource.set_price",
          "fleet.dispatch", "fleet.vehicle_status",
          "ltl.inquiry", "ltl.arrange_ship", "ltl.upload_pod", "ltl.ocr_verify",
        ],
        outsource_dispatcher: [
          "order.view_own", "order.update_status",
          "kanban.outsource",
          "outsource.vehicle_input", "outsource.submit_quote",
          "approval.view_history",
          "pod.view", "pod.mark_sent",
          "stats.personal",
        ],
        fleet_dispatcher: [
          "order.view_own", "order.update_status",
          "kanban.self",
          "fleet.dispatch", "fleet.vehicle_status",
          "config.vehicle_driver",
          "export.fleet_ltl",
          "stats.personal",
        ],
        ltl_dispatcher: [
          "order.view_own", "order.update_status",
          "kanban.ltl",
          "ltl.inquiry", "ltl.arrange_ship", "ltl.upload_pod", "ltl.ocr_verify",
          "approval.view_history",
          "pod.view", "pod.mark_sent",
          "stats.personal",
        ],
        order_entry: [
          "order.create", "order.edit", "order.mark_urgent",
          "order.view_all", "order.view_own",
          "order.assign", "order.update_status",
          "kanban.global",
          "approval.view_history",
          "pod.view",
          "config.customer",
          "export.order_total",
          "stats.personal",
        ],
        cs_manager: [
          "order.create", "order.edit", "order.mark_urgent", "order.adjust",
          "order.view_all", "order.view_own", "order.assign",
          "order.hold_cancel", "order.update_status", "order.delete", "order.rollback",
          "kanban.global", "kanban.outsource", "kanban.self", "kanban.ltl",
          "outsource.vehicle_input", "outsource.set_price",
          "fleet.dispatch",
          "ltl.inquiry", "ltl.arrange_ship",
          "approval.execute", "approval.view_history",
          "pod.view", "pod.mark_sent",
          "config.customer", "config.dispatcher_region",
          "export.order_total", "export.outsource", "export.fleet_ltl", "export.customer_ledger",
          "freight_rate.view", "freight_rate.export",
          "stats.full", "stats.personal", "log.view",
        ],
        finance_assistant: [
          "pod.view", "pod.confirm_received", "pod.refund_deposit",
          "stats.personal",
        ],
        ltl_cs: [
          "order.create", "order.edit", "order.mark_urgent",
          "order.view_all", "order.view_own",
          "order.assign", "order.update_status",
          "kanban.global", "kanban.ltl",
          "ltl.inquiry",
          "approval.view_history",
          "pod.view",
          "export.fleet_ltl",
          "stats.personal",
        ],
      };
      return permMap[role] || [];
    }),
  };
});

function createContext(role: string, id = 1): TrpcContext {
  return {
    user: {
      id,
      openId: `${role}-user`,
      email: `${role}@yongan.com`,
      name: `${role}用户`,
      loginMethod: "manus",
      role: role as any,
      username: role,
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

// ============================================================
// 1. 重量校验测试
// ============================================================
describe("Weight Validation", () => {
  describe("order.create rejects invalid weight", () => {
    it("rejects negative weight", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      await expect(
        caller.order.create({
          orderNumber: "TEST-001",
          businessType: "outsource",
          weight: "-5",
        })
      ).rejects.toThrow(/重量必须为正数/);
    });

    it("rejects zero weight", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      await expect(
        caller.order.create({
          orderNumber: "TEST-002",
          businessType: "outsource",
          weight: "0",
        })
      ).rejects.toThrow(/重量必须为正数/);
    });

    it("rejects weight with non-numeric characters", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      await expect(
        caller.order.create({
          orderNumber: "TEST-003",
          businessType: "outsource",
          weight: "abc",
        })
      ).rejects.toThrow(/重量必须为正数/);
    });

    it("accepts valid positive weight", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      // DB is null so it will throw "数据库不可用", but zod validation passes
      await expect(
        caller.order.create({
          orderNumber: "TEST-004",
          businessType: "outsource",
          weight: "10.5",
        })
      ).rejects.toThrow("数据库不可用");
    });

    it("accepts empty weight (optional)", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      await expect(
        caller.order.create({
          orderNumber: "TEST-005",
          businessType: "outsource",
        })
      ).rejects.toThrow("数据库不可用");
    });

    it("rejects extremely large weight", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      await expect(
        caller.order.create({
          orderNumber: "TEST-006",
          businessType: "outsource",
          weight: "99999999999", // 11 digits, exceeds 10 digit limit
        })
      ).rejects.toThrow(/重量必须为正数/);
    });
  });

  describe("order.update rejects invalid weight", () => {
    it("rejects negative weight on update", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      await expect(
        caller.order.update({
          id: 1,
          weight: "-10",
        })
      ).rejects.toThrow(/重量必须为正数/);
    });

    it("rejects zero weight on update", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      await expect(
        caller.order.update({
          id: 1,
          weight: "0",
        })
      ).rejects.toThrow(/重量必须为正数/);
    });
  });
});

// ============================================================
// 2. updateStatus 权限细化测试
// ============================================================
describe("updateStatus Permission Enforcement", () => {
  describe("admin can push to any status", () => {
    it("admin can push to pending_approval", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      // DB is null → throws "数据库不可用" (past permission check)
      await expect(
        caller.order.updateStatus({ id: 1, status: "pending_approval" })
      ).rejects.toThrow("数据库不可用");
    });

    it("admin can push to pending_assign", async () => {
      const caller = appRouter.createCaller(createContext("admin"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "pending_assign" })
      ).rejects.toThrow("数据库不可用");
    });
  });

  describe("cs_manager can push to any status", () => {
    it("cs_manager can push to pending_approval", async () => {
      const caller = appRouter.createCaller(createContext("cs_manager"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "pending_approval" })
      ).rejects.toThrow("数据库不可用");
    });

    it("cs_manager can push to pending_assign", async () => {
      const caller = appRouter.createCaller(createContext("cs_manager"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "pending_assign" })
      ).rejects.toThrow("数据库不可用");
    });
  });

  describe("outsource_dispatcher role restrictions", () => {
    it("outsource_dispatcher CAN push to pending_approval", async () => {
      const caller = appRouter.createCaller(createContext("outsource_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "pending_approval" })
      ).rejects.toThrow("数据库不可用");
    });

    it("outsource_dispatcher CAN push to dispatched", async () => {
      const caller = appRouter.createCaller(createContext("outsource_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "dispatched" })
      ).rejects.toThrow("数据库不可用");
    });

    it("outsource_dispatcher CAN push to in_transit", async () => {
      const caller = appRouter.createCaller(createContext("outsource_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "in_transit" })
      ).rejects.toThrow("数据库不可用");
    });

    it("outsource_dispatcher CAN push to delivered", async () => {
      const caller = appRouter.createCaller(createContext("outsource_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "delivered" })
      ).rejects.toThrow("数据库不可用");
    });

    it("outsource_dispatcher CANNOT push to pending_assign", async () => {
      const caller = appRouter.createCaller(createContext("outsource_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "pending_assign" })
      ).rejects.toThrow(/无权/);
    });

    it("outsource_dispatcher CANNOT push to on_hold", async () => {
      const caller = appRouter.createCaller(createContext("outsource_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "on_hold" })
      ).rejects.toThrow(/无权/);
    });

    it("outsource_dispatcher CANNOT push to cancelled", async () => {
      const caller = appRouter.createCaller(createContext("outsource_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "cancelled" })
      ).rejects.toThrow(/无权/);
    });

    it("outsource_dispatcher CANNOT push to inquiry_confirmed", async () => {
      const caller = appRouter.createCaller(createContext("outsource_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "inquiry_confirmed" })
      ).rejects.toThrow(/无权/);
    });
  });

  describe("ltl_dispatcher role restrictions", () => {
    it("ltl_dispatcher CAN push to inquiry_confirmed", async () => {
      const caller = appRouter.createCaller(createContext("ltl_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "inquiry_confirmed" })
      ).rejects.toThrow("数据库不可用");
    });

    it("ltl_dispatcher CAN push to shipped", async () => {
      const caller = appRouter.createCaller(createContext("ltl_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "shipped" })
      ).rejects.toThrow("数据库不可用");
    });

    it("ltl_dispatcher CAN push to dispatched", async () => {
      const caller = appRouter.createCaller(createContext("ltl_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "dispatched" })
      ).rejects.toThrow("数据库不可用");
    });

    it("ltl_dispatcher CANNOT push to pending_approval", async () => {
      const caller = appRouter.createCaller(createContext("ltl_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "pending_approval" })
      ).rejects.toThrow(/无权/);
    });

    it("ltl_dispatcher CANNOT push to on_hold", async () => {
      const caller = appRouter.createCaller(createContext("ltl_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "on_hold" })
      ).rejects.toThrow(/无权/);
    });

    it("ltl_dispatcher CANNOT push to pending_assign", async () => {
      const caller = appRouter.createCaller(createContext("ltl_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "pending_assign" })
      ).rejects.toThrow(/无权/);
    });
  });

  describe("fleet_dispatcher role restrictions", () => {
    it("fleet_dispatcher CAN push to dispatched", async () => {
      const caller = appRouter.createCaller(createContext("fleet_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "dispatched" })
      ).rejects.toThrow("数据库不可用");
    });

    it("fleet_dispatcher CAN push to in_transit", async () => {
      const caller = appRouter.createCaller(createContext("fleet_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "in_transit" })
      ).rejects.toThrow("数据库不可用");
    });

    it("fleet_dispatcher CANNOT push to pending_approval", async () => {
      const caller = appRouter.createCaller(createContext("fleet_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "pending_approval" })
      ).rejects.toThrow(/无权/);
    });

    it("fleet_dispatcher CANNOT push to inquiry_confirmed", async () => {
      const caller = appRouter.createCaller(createContext("fleet_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "inquiry_confirmed" })
      ).rejects.toThrow(/无权/);
    });

    it("fleet_dispatcher CANNOT push to on_hold", async () => {
      const caller = appRouter.createCaller(createContext("fleet_dispatcher"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "on_hold" })
      ).rejects.toThrow(/无权/);
    });
  });

  describe("order_entry role restrictions", () => {
    it("order_entry CAN push to pending_price", async () => {
      const caller = appRouter.createCaller(createContext("order_entry"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "pending_price" })
      ).rejects.toThrow("数据库不可用");
    });

    it("order_entry CAN push to pending_dispatch", async () => {
      const caller = appRouter.createCaller(createContext("order_entry"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "pending_dispatch" })
      ).rejects.toThrow("数据库不可用");
    });

    it("order_entry CAN push to pending_inquiry", async () => {
      const caller = appRouter.createCaller(createContext("order_entry"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "pending_inquiry" })
      ).rejects.toThrow("数据库不可用");
    });

    it("order_entry CAN push to on_hold", async () => {
      const caller = appRouter.createCaller(createContext("order_entry"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "on_hold" })
      ).rejects.toThrow("数据库不可用");
    });

    it("order_entry CAN push to cancelled", async () => {
      const caller = appRouter.createCaller(createContext("order_entry"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "cancelled" })
      ).rejects.toThrow("数据库不可用");
    });

    it("order_entry CAN push to signed", async () => {
      const caller = appRouter.createCaller(createContext("order_entry"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "signed" })
      ).rejects.toThrow("数据库不可用");
    });

    it("order_entry CANNOT push to pending_approval", async () => {
      const caller = appRouter.createCaller(createContext("order_entry"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "pending_approval" })
      ).rejects.toThrow(/无权/);
    });

    it("order_entry CANNOT push to pending_assign", async () => {
      const caller = appRouter.createCaller(createContext("order_entry"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "pending_assign" })
      ).rejects.toThrow(/无权/);
    });
  });

  describe("finance_assistant has no updateStatus permission", () => {
    it("finance_assistant CANNOT call updateStatus at all", async () => {
      const caller = appRouter.createCaller(createContext("finance_assistant"));
      await expect(
        caller.order.updateStatus({ id: 1, status: "dispatched" })
      ).rejects.toThrow(/权限不足/);
    });
  });
});

// ============================================================
// 3. batchUpdateStatus 权限细化测试
// ============================================================
describe("batchUpdateStatus Permission Enforcement", () => {
  it("outsource_dispatcher CAN batch push to dispatched", async () => {
    const caller = appRouter.createCaller(createContext("outsource_dispatcher"));
    await expect(
      caller.order.batchUpdateStatus({ orderIds: [1, 2], status: "dispatched" })
    ).rejects.toThrow("数据库不可用");
  });

  it("outsource_dispatcher CANNOT batch push to on_hold", async () => {
    const caller = appRouter.createCaller(createContext("outsource_dispatcher"));
    await expect(
      caller.order.batchUpdateStatus({ orderIds: [1, 2], status: "on_hold" })
    ).rejects.toThrow(/无权/);
  });

  it("finance_assistant CANNOT call batchUpdateStatus", async () => {
    const caller = appRouter.createCaller(createContext("finance_assistant"));
    await expect(
      caller.order.batchUpdateStatus({ orderIds: [1], status: "dispatched" })
    ).rejects.toThrow(/权限不足/);
  });

  it("admin CAN batch push to any status", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(
      caller.order.batchUpdateStatus({ orderIds: [1], status: "pending_assign" })
    ).rejects.toThrow("数据库不可用");
  });
});

// ============================================================
// 4. 其他 procedure 权限升级测试
// ============================================================
describe("Other Procedure Permission Enforcement", () => {
  describe("markPodSent requires pod.mark_sent permission", () => {
    it("outsource_dispatcher CAN markPodSent", async () => {
      const caller = appRouter.createCaller(createContext("outsource_dispatcher"));
      await expect(
        caller.order.markPodSent({ orderId: 1 })
      ).rejects.toThrow("数据库不可用");
    });

    it("finance_assistant CANNOT markPodSent (no pod.mark_sent)", async () => {
      const caller = appRouter.createCaller(createContext("finance_assistant"));
      await expect(
        caller.order.markPodSent({ orderId: 1 })
      ).rejects.toThrow(/权限不足/);
    });
  });

  describe("refundDeposit requires pod.refund_deposit permission", () => {
    it("finance_assistant CAN refundDeposit", async () => {
      const caller = appRouter.createCaller(createContext("finance_assistant"));
      await expect(
        caller.order.refundDeposit({ id: 1 })
      ).rejects.toThrow("数据库不可用");
    });

    it("outsource_dispatcher CANNOT refundDeposit", async () => {
      const caller = appRouter.createCaller(createContext("outsource_dispatcher"));
      await expect(
        caller.order.refundDeposit({ id: 1 })
      ).rejects.toThrow(/权限不足/);
    });
  });

  describe("priceAndAssign requires outsource.set_price permission", () => {
    it("cs_manager CAN priceAndAssign", async () => {
      const caller = appRouter.createCaller(createContext("cs_manager"));
      await expect(
        caller.order.priceAndAssign({ orderId: 1, dispatchPrice: "100" })
      ).rejects.toThrow("数据库不可用");
    });

    it("outsource_dispatcher CANNOT priceAndAssign", async () => {
      const caller = appRouter.createCaller(createContext("outsource_dispatcher"));
      await expect(
        caller.order.priceAndAssign({ orderId: 1, dispatchPrice: "100" })
      ).rejects.toThrow(/权限不足/);
    });
  });

  describe("manualAssign requires order.assign permission", () => {
    it("cs_manager CAN manualAssign", async () => {
      const caller = appRouter.createCaller(createContext("cs_manager"));
      await expect(
        caller.order.manualAssign({ orderId: 1, dispatcherId: 2 })
      ).rejects.toThrow("数据库不可用");
    });

    it("outsource_dispatcher CANNOT manualAssign (no order.assign)", async () => {
      const caller = appRouter.createCaller(createContext("outsource_dispatcher"));
      await expect(
        caller.order.manualAssign({ orderId: 1, dispatcherId: 2 })
      ).rejects.toThrow(/权限不足/);
    });
  });

  describe("createLtlBatch requires ltl.arrange_ship permission", () => {
    it("ltl_dispatcher CAN createLtlBatch", async () => {
      const caller = appRouter.createCaller(createContext("ltl_dispatcher"));
      await expect(
        caller.order.createLtlBatch({
          plateNumber: "粤A12345",
          driverName: "张三",
          orderIds: [1],
        })
      ).rejects.toThrow("数据库不可用");
    });

    it("outsource_dispatcher CANNOT createLtlBatch", async () => {
      const caller = appRouter.createCaller(createContext("outsource_dispatcher"));
      await expect(
        caller.order.createLtlBatch({
          plateNumber: "粤A12345",
          driverName: "张三",
          orderIds: [1],
        })
      ).rejects.toThrow(/权限不足/);
    });
  });
});
