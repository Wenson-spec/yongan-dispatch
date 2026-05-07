import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { createOperationLog, getDb } from "./db";

vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(null),
    createOperationLog: vi.fn().mockResolvedValue(undefined),
    getUserPermissions: vi.fn().mockResolvedValue([
      "order.delete",
      "order.rollback",
      "ltl.arrange_ship",
      "order.view_all",
      "order.view_own",
    ]),
  };
});

type SelectOutput =
  | { mode: "limit"; value: unknown[] }
  | { mode: "rows"; value: unknown[] };

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

function createTransactionalDb(options: {
  selectOutputs: SelectOutput[];
  deleteResults?: unknown[];
  updateResults?: unknown[];
}) {
  const selectOutputs = [...options.selectOutputs];
  const deleteResults = [...(options.deleteResults ?? [])];
  const updateResults = [...(options.updateResults ?? [])];

  const db: any = {
    transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(db)),
    select: vi.fn(() => {
      const next = selectOutputs.shift() ?? { mode: "rows", value: [] };
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => {
            if (next.mode === "limit") {
              return {
                limit: vi.fn(async () => next.value),
              };
            }
            return Promise.resolve(next.value);
          }),
        })),
      };
    }),
    delete: vi.fn(() => {
      const next = deleteResults.shift() ?? { affectedRows: 1 };
      return {
        where: vi.fn(async () => next),
      };
    }),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => updateResults.shift() ?? { affectedRows: 1 }),
      })),
    })),
  };

  return db;
}

afterEach(() => {
  vi.mocked(getDb).mockResolvedValue(null);
  vi.mocked(createOperationLog).mockResolvedValue(undefined);
  vi.clearAllMocks();
});

describe("Order concurrency guards", () => {
  it("order.delete returns conflict when the guarded delete affects no rows", async () => {
    const db = createTransactionalDb({
      selectOutputs: [
        {
          mode: "limit",
          value: [{
            id: 101,
            orderNumber: "YA-DEL-101",
            status: "pending_assign",
            parentId: null,
            isMerged: false,
            mergedPlanNumber: null,
          }],
        },
        { mode: "rows", value: [] },
        { mode: "rows", value: [] },
        { mode: "rows", value: [] },
      ],
      deleteResults: [{ affectedRows: 1 }, { affectedRows: 1 }, { affectedRows: 0 }],
    });
    vi.mocked(getDb).mockResolvedValue(db);

    const caller = appRouter.createCaller(createAdminContext());
    await expect(caller.order.delete({ id: 101 })).rejects.toThrow(
      "订单已被其他人处理或状态已变化，请刷新后重试。",
    );
    expect(createOperationLog).not.toHaveBeenCalled();
    expect(db.delete).toHaveBeenCalledTimes(3);
  });

  it("order.rollbackStatus returns conflict when the guarded status update affects no rows", async () => {
    const db = createTransactionalDb({
      selectOutputs: [
        {
          mode: "limit",
          value: [{
            id: 202,
            orderNumber: "YA-ROLL-202",
            status: "dispatched",
          }],
        },
      ],
      deleteResults: [{ affectedRows: 0 }],
      updateResults: [{ affectedRows: 0 }],
    });
    vi.mocked(getDb).mockResolvedValue(db);

    const caller = appRouter.createCaller(createAdminContext());
    await expect(caller.order.rollbackStatus({ id: 202, reason: "并发测试" })).rejects.toThrow(
      "订单已被其他人处理或状态已变化，请刷新后重试。",
    );
    expect(createOperationLog).not.toHaveBeenCalled();
  });

  it("order.revertStatus returns conflict when the guarded target-status update affects no rows", async () => {
    const db = createTransactionalDb({
      selectOutputs: [
        {
          mode: "limit",
          value: [{
            id: 303,
            orderNumber: "YA-REVERT-303",
            status: "delivered",
          }],
        },
      ],
      deleteResults: [{ affectedRows: 0 }],
      updateResults: [{ affectedRows: 0 }],
    });
    vi.mocked(getDb).mockResolvedValue(db);

    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.order.revertStatus({ id: 303, targetStatus: "pending_vehicle", reason: "并发测试" }),
    ).rejects.toThrow("订单已被其他人处理或状态已变化，请刷新后重试。");
    expect(createOperationLog).not.toHaveBeenCalled();
  });

  it("order.removeOrderFromLtlBatch returns conflict when the batch relation is already removed", async () => {
    const db = createTransactionalDb({
      selectOutputs: [
        {
          mode: "limit",
          value: [{ orderId: 404 }],
        },
        {
          mode: "rows",
          value: [{
            id: 404,
            orderNumber: "YA-LTL-404",
            status: "inquiry_confirmed",
          }],
        },
        { mode: "rows", value: [] },
      ],
      deleteResults: [{ affectedRows: 0 }, { affectedRows: 0 }],
      updateResults: [{ affectedRows: 1 }],
    });
    vi.mocked(getDb).mockResolvedValue(db);

    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.order.removeOrderFromLtlBatch({ batchId: 88, orderId: 404 }),
    ).rejects.toThrow("零担批次已被其他人修改，请刷新后重试。");
    expect(createOperationLog).not.toHaveBeenCalled();
  });
});
