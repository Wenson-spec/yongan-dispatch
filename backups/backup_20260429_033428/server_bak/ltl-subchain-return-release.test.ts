import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(null),
    createOperationLog: vi.fn().mockResolvedValue(undefined),
    getUserPermissions: vi.fn().mockResolvedValue([
      "order.create",
      "order.view_all",
      "order.view_own",
      "order.rollback",
      "kanban.ltl",
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

type MockSubchainRow = {
  id: number;
  parentId: number | null;
  orderNumber: string | null;
  mergedPlanNumber?: string | null;
  status: string | null;
  remarks: string | null;
};

function createSubchainQueryDb(rows: MockSubchainRow[]) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => rows),
      })),
    })),
  };
}

function createOrderCreateDb(existingSubchains: MockSubchainRow[]) {
  const insertedRows: Array<Record<string, unknown>> = [];
  let selectCall = 0;

  const db = {
    select: vi.fn(() => {
      selectCall += 1;
      if (selectCall === 1) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => []),
            })),
          })),
        };
      }
      return {
        from: vi.fn(() => ({
          where: vi.fn(async () => existingSubchains),
        })),
      };
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (payload: Record<string, unknown>) => {
        insertedRows.push(payload);
        return [{ insertId: 801 }];
      }),
    })),
  };

  return { db, insertedRows };
}

type TransactionalSelectOutput =
  | { mode: "limit"; value: unknown[] }
  | { mode: "rows"; value: unknown[] };

function createSubchainRollbackDb(options: {
  transitionOrder: {
    id: number;
    orderNumber: string | null;
    status: string | null;
    parentId: number | null;
    remarks: string | null;
  };
  candidateRows: MockSubchainRow[];
  parentOrders: Array<{
    id: number;
    status: string | null;
    depositAmount: string | null;
    podOwnership: string | null;
  }>;
  existingPods?: Array<{
    id: number;
    orderId: number;
    originalStatus: string;
  }>;
}) {
  const selectOutputs: TransactionalSelectOutput[] = [
    { mode: "limit", value: [options.transitionOrder] },
    { mode: "rows", value: options.candidateRows },
    { mode: "rows", value: options.parentOrders },
    { mode: "rows", value: options.existingPods ?? [] },
  ];
  const updatePayloads: Array<Record<string, unknown>> = [];

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
    update: vi.fn(() => ({
      set: vi.fn((payload: Record<string, unknown>) => {
        updatePayloads.push(payload);
        return {
          where: vi.fn(async () => ({ affectedRows: 1 })),
        };
      }),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => ({ affectedRows: 1 })),
    })),
  };

  return { db, updatePayloads };
}

afterEach(async () => {
  const { getDb, createOperationLog } = await import("./db");
  vi.mocked(getDb).mockResolvedValue(null);
  vi.mocked(createOperationLog).mockResolvedValue(undefined);
  vi.clearAllMocks();
});

describe("LTL outsource subchain rollback release", () => {
  it("getLtlPickupSubchainStatus excludes pickup subchains already rolled back to pending_assign", async () => {
    const { getDb } = await import("./db");
    const db = createSubchainQueryDb([
      {
        id: 31,
        parentId: 101,
        orderNumber: "PICKUP-RETURNED",
        mergedPlanNumber: null,
        status: "pending_assign",
        remarks: "【零担前段外请子链】\n【关联主单IDs】,101,102,",
      },
      {
        id: 32,
        parentId: 102,
        orderNumber: "PICKUP-ACTIVE",
        mergedPlanNumber: null,
        status: "pending_price",
        remarks: "【零担前段外请子链】\n【关联主单IDs】,102,",
      },
      {
        id: 33,
        parentId: 103,
        orderNumber: "PICKUP-CANCELLED",
        mergedPlanNumber: null,
        status: "cancelled",
        remarks: "【零担前段外请子链】\n【关联主单IDs】,103,",
      },
    ]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.order.getLtlPickupSubchainStatus({ parentIds: [101, 102, 103] });

    expect(result.parentIds).toEqual([102]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 32,
      orderNumber: "PICKUP-ACTIVE",
      status: "pending_price",
      relatedParentIds: [102],
    });
  });

  it("create allows rebuilding a pickup subchain after the previous one rolled back to pending_assign", async () => {
    const { getDb } = await import("./db");
    const { db, insertedRows } = createOrderCreateDb([
      {
        id: 41,
        parentId: 201,
        orderNumber: "PICKUP-ROLLED-BACK",
        mergedPlanNumber: null,
        status: "pending_assign",
        remarks: "【零担前段外请子链】\n【关联主单IDs】,201,",
      },
    ]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    const caller = appRouter.createCaller(createAdminContext());
    await caller.order.create({
      orderNumber: "PICKUP-REOPEN",
      businessType: "outsource",
      parentId: 201,
      parentIds: [201],
      subchainStage: "pickup",
      remarks: "【零担前段外请子链】\n退回后重新发起前段外请",
    } as any);

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      businessType: "outsource",
      status: "pending_assign",
      parentId: 201,
    });
    expect(String(insertedRows[0].remarks || "")).toContain("【零担前段外请子链】");
    expect(String(insertedRows[0].remarks || "")).toContain("【关联主单IDs】,201,");
  });

  it("rollbackStatus releases parent pod ownership when a delivery outsource subchain rolls back to pending_assign", async () => {
    const { getDb } = await import("./db");
    const { db, updatePayloads } = createSubchainRollbackDb({
      transitionOrder: {
        id: 71,
        orderNumber: "DELIVERY-SUBCHAIN-71",
        status: "pending_inquiry",
        parentId: 501,
        remarks: "【零担后段外请子链】\n【关联主单IDs】,501,502,",
      },
      candidateRows: [
        {
          id: 71,
          parentId: 501,
          orderNumber: "DELIVERY-SUBCHAIN-71",
          mergedPlanNumber: null,
          status: "pending_assign",
          remarks: "【零担后段外请子链】\n【关联主单IDs】,501,502,",
        },
      ],
      parentOrders: [
        { id: 501, status: "pending_assign", depositAmount: null, podOwnership: "delivery_outsource" },
        { id: 502, status: "pending_assign", depositAmount: null, podOwnership: "delivery_outsource" },
      ],
    });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.order.rollbackStatus({ id: 71, reason: "退回释放主单" });

    expect(result).toMatchObject({
      success: true,
      fromStatus: "pending_inquiry",
      toStatus: "pending_assign",
    });
    expect(updatePayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "pending_assign" }),
        expect.objectContaining({ podOwnership: "current_order" }),
      ]),
    );
  });

  it("revertStatus releases parent pod ownership when a delivery outsource subchain is reverted to pending_assign", async () => {
    const { getDb } = await import("./db");
    const { db, updatePayloads } = createSubchainRollbackDb({
      transitionOrder: {
        id: 81,
        orderNumber: "DELIVERY-SUBCHAIN-81",
        status: "inquiry_confirmed",
        parentId: 601,
        remarks: "【零担后段外请子链】\n【关联主单IDs】,601,602,",
      },
      candidateRows: [
        {
          id: 81,
          parentId: 601,
          orderNumber: "DELIVERY-SUBCHAIN-81",
          mergedPlanNumber: null,
          status: "pending_assign",
          remarks: "【零担后段外请子链】\n【关联主单IDs】,601,602,",
        },
      ],
      parentOrders: [
        { id: 601, status: "pending_assign", depositAmount: null, podOwnership: "delivery_outsource" },
        { id: 602, status: "pending_assign", depositAmount: null, podOwnership: "delivery_outsource" },
      ],
    });
    vi.mocked(getDb).mockResolvedValue(db as any);

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.order.revertStatus({ id: 81, targetStatus: "pending_assign", reason: "释放后重走" });

    expect(result).toMatchObject({
      success: true,
      fromStatus: "inquiry_confirmed",
      toStatus: "pending_assign",
    });
    expect(updatePayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "pending_assign" }),
        expect.objectContaining({ podOwnership: "current_order" }),
      ]),
    );
  });
});
