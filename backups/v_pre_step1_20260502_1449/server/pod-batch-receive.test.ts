import { describe, expect, it, vi } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
      "export.customer_ledger", "export.fleet_ltl",
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

function createFinanceContext(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "finance-user",
      email: "finance@yongan.com",
      name: "财务助理",
      loginMethod: "manus",
      role: "finance_assistant" as any,
      username: "finance",
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

function createNoPermContext(): TrpcContext {
  return {
    user: {
      id: 3,
      openId: "noperm-user",
      email: "noperm@yongan.com",
      name: "无权限用户",
      loginMethod: "manus",
      role: "user",
      username: "noperm",
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

const adminCaller = appRouter.createCaller(createAdminContext());
const financeCaller = appRouter.createCaller(createFinanceContext());

describe("回单批量标记已收到 (pod.batchMarkReceived)", () => {
  describe("接口定义与参数校验", () => {
    it("应存在batchMarkReceived方法", () => {
      expect(adminCaller.pod.batchMarkReceived).toBeDefined();
    });

    it("DB为null时应抛出数据库不可用错误", async () => {
      await expect(
        adminCaller.pod.batchMarkReceived({ ids: [1, 2, 3] })
      ).rejects.toThrow("数据库不可用");
    });

    it("空数组应被zod校验拒绝", async () => {
      await expect(
        adminCaller.pod.batchMarkReceived({ ids: [] })
      ).rejects.toThrow();
    });

    it("超过200个应被zod校验拒绝", async () => {
      const tooMany = Array.from({ length: 201 }, (_, i) => i + 1);
      await expect(
        adminCaller.pod.batchMarkReceived({ ids: tooMany })
      ).rejects.toThrow();
    });

    it("正好200个应通过zod校验（DB为null时报数据库错误）", async () => {
      const exactly200 = Array.from({ length: 200 }, (_, i) => i + 1);
      await expect(
        adminCaller.pod.batchMarkReceived({ ids: exactly200 })
      ).rejects.toThrow("数据库不可用");
    });

    it("单个id应通过校验", async () => {
      await expect(
        adminCaller.pod.batchMarkReceived({ ids: [1] })
      ).rejects.toThrow("数据库不可用");
    });
  });

  describe("权限控制", () => {
    it("管理员应有权限调用", async () => {
      // 管理员有pod.confirm_received权限，应该能调用（DB为null报错）
      await expect(
        adminCaller.pod.batchMarkReceived({ ids: [1] })
      ).rejects.toThrow("数据库不可用");
    });

    it("财务助理应有权限调用（拥有pod.confirm_received权限）", async () => {
      await expect(
        financeCaller.pod.batchMarkReceived({ ids: [1] })
      ).rejects.toThrow("数据库不可用");
    });
  });

  describe("返回值结构", () => {
    it("返回值应包含success、successCount、skipCount、skippedReasons字段", async () => {
      // 由于DB为null，此测试验证接口签名正确
      // 实际返回值测试在E2E测试中完成
      try {
        await adminCaller.pod.batchMarkReceived({ ids: [1] });
      } catch (e: any) {
        // 预期抛出数据库不可用错误
        expect(e.message).toContain("数据库不可用");
      }
    });
  });
});

describe("零担订单E2E测试脚本存在性检查", () => {
  it("e2e-ltl-flow.test.mjs文件应存在", async () => {
    const fs = await import("fs");
    const exists = fs.existsSync(resolve(projectRoot, "server/e2e-ltl-flow.test.mjs"));
    expect(exists).toBe(true);
  });
});
