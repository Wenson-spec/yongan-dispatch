import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { approvals } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  createOperationLogMock: vi.fn(),
  getUserPermissionsMock: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getDb: mocks.getDbMock,
    createOperationLog: mocks.createOperationLogMock,
    getUserPermissions: mocks.getUserPermissionsMock,
  };
});

type QueueState = {
  selectQueue?: any[];
  insertQueue?: any[];
  updateQueue?: any[];
  deleteQueue?: any[];
};

function createDbStub(initial: QueueState = {}) {
  const state = {
    selectQueue: [...(initial.selectQueue ?? [])],
    insertQueue: [...(initial.insertQueue ?? [])],
    updateQueue: [...(initial.updateQueue ?? [])],
    deleteQueue: [...(initial.deleteQueue ?? [])],
    insertCalls: [] as Array<{ table: unknown; values: unknown }>,
    updateCalls: [] as Array<{ table: unknown; values: Record<string, any> }>,
    deleteCalls: [] as Array<{ table: unknown }>,
  };

  const next = (queue: any[], fallback: any) => (queue.length > 0 ? queue.shift() : fallback);
  const makeQuery = (result: any) => {
    const query: any = {
      from: vi.fn(() => query),
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      limit: vi.fn(async () => result),
      offset: vi.fn(() => query),
    };
    query.then = (resolve: (value: any) => any, reject?: (reason: any) => any) => Promise.resolve(result).then(resolve, reject);
    return query;
  };

  const db = {
    select: vi.fn(() => makeQuery(next(state.selectQueue, []))),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (values: unknown) => {
        state.insertCalls.push({ table, values });
        return next(state.insertQueue, [{ insertId: 1 }]);
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, any>) => {
        state.updateCalls.push({ table, values });
        return {
          where: vi.fn(async () => next(state.updateQueue, { affectedRows: 1 })),
        };
      }),
    })),
    delete: vi.fn((table: unknown) => ({
      where: vi.fn(async () => {
        state.deleteCalls.push({ table });
        return next(state.deleteQueue, { affectedRows: 1 });
      }),
    })),
  };

  return { db, state };
}

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

beforeEach(() => {
  mocks.getDbMock.mockReset();
  mocks.createOperationLogMock.mockReset();
  mocks.getUserPermissionsMock.mockReset();
  mocks.getUserPermissionsMock.mockResolvedValue([
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
  ]);
  mocks.createOperationLogMock.mockResolvedValue(undefined);
});

describe("第六批零担专项回归", () => {
  it("异常签收应走显式业务命令并写入业务化字段", async () => {
    const { db, state } = createDbStub({
      selectQueue: [[{
        id: 101,
        status: "partial_delivered",
        signedBy: null,
        remainingQty: "2",
        deliveredQty: "8",
      }]],
    });
    mocks.getDbMock.mockResolvedValue(db);

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.order.handleSignException({
      orderId: 101,
      signExceptionType: "shortage",
      signedBy: "收货人甲",
      signedRemark: "到货短少 2 件",
      evidenceUrls: ["https://example.com/evidence-1.jpg"],
    });

    expect(result).toEqual({ success: true });
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0]?.values).toMatchObject({
      status: "signed",
      signedBy: "收货人甲",
      signedRemark: "到货短少 2 件",
      signExceptionType: "shortage",
      exceptionQty: "2",
      deliveredQty: "8",
      remainingQty: "2",
    });
    expect(mocks.createOperationLogMock).toHaveBeenCalledWith(expect.objectContaining({
      action: "sign_exception_handle",
      targetId: "101",
      description: expect.stringContaining("异常签收处理"),
    }));
  });

  it("取消零担订单时应释放待处理回单、删除审批并在批次清空后自动释放批次", async () => {
    const { db, state } = createDbStub({
      selectQueue: [
        [{
          id: 201,
          orderNumber: "LTL-201",
          status: "dispatched",
          businessType: "ltl",
          remarks: null,
          parentId: null,
          podOwnership: "dispatcher",
        }],
        [{
          id: 201,
          orderNumber: "LTL-201",
          status: "dispatched",
          businessType: "ltl",
          remarks: null,
          parentId: null,
          podOwnership: "dispatcher",
        }],
        [{ batchId: 9001, orderId: 201 }],
        [],
      ],
    });
    mocks.getDbMock.mockResolvedValue(db);

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.order.updateStatus({
      id: 201,
      status: "cancelled",
    });

    expect(result).toEqual({ success: true });
    expect(state.updateCalls[0]?.values).toMatchObject({
      status: "cancelled",
      plateNumber: null,
      driverName: null,
      driverPhone: null,
      depositStatus: "none",
      depositRefundable: true,
    });
    expect(state.deleteCalls.length).toBeGreaterThanOrEqual(5);
    expect(mocks.createOperationLogMock).toHaveBeenCalledWith(expect.objectContaining({
      action: "status_change",
      targetId: "201",
      description: expect.stringContaining("已取消"),
    }));
  });

  it("改派后段承运应作为独立业务命令重置待审批子链并记录改派原因", async () => {
    const { db, state } = createDbStub({
      selectQueue: [[{
        id: 301,
        status: "pending_approval",
        businessType: "outsource",
        remarks: "【零担后段外请子链】广州货站后段配送\n【关联主单IDs】11",
        plateNumber: "粤A11111",
        driverName: "旧司机",
        dispatcherRemark: "原承运商报价偏高",
      }], [{ id: 88 }], [{ id: 99 }]],
    });
    mocks.getDbMock.mockResolvedValue(db);

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.order.reassignLtlDeliveryCarrier({
      orderId: 301,
      plateNumber: "粤B22222",
      driverName: "新司机",
      driverPhone: "13800138000",
      actualFreight: "560",
      depositAmount: "100",
      depositRefundable: true,
      reassignReason: "广州货站改派后段配送承运商",
    });

    expect(result).toEqual({ success: true });
    expect(state.updateCalls[0]?.values).toMatchObject({
      status: "pending_vehicle",
      plateNumber: "粤B22222",
      driverName: "新司机",
      driverPhone: "13800138000",
      actualFreight: "560",
      depositAmount: "100",
      depositStatus: "paid",
      vehicleId: 88,
      driverId: 99,
    });
    expect(state.deleteCalls.length).toBeGreaterThanOrEqual(1);
    expect(mocks.createOperationLogMock).toHaveBeenCalledWith(expect.objectContaining({
      action: "reassign_ltl_delivery_carrier",
      targetId: "301",
      description: expect.stringContaining("改派后段承运"),
    }));
  });

  it("零担订单 createLtlBatch 派车到货站应直接进入批次发运，不触发整车外请审批记录", async () => {
    const { db, state } = createDbStub({
      selectQueue: [
        [],
        [],
        [{ cnt: 0 }],
        [{ id: 1, status: "inquiry_confirmed", depositAmount: "50" }],
        [],
        [{ id: 2, status: "shipped", depositAmount: null }],
        [],
      ],
      insertQueue: [
        [{ insertId: 11 }],
        [{ insertId: 12 }],
        [{ insertId: 8001 }],
        [{ insertId: 101 }],
        [{ insertId: 201 }],
        [{ insertId: 102 }],
        [{ insertId: 202 }],
      ],
    });
    mocks.getDbMock.mockResolvedValue(db);

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.order.createLtlBatch({
      plateNumber: "粤C33333",
      driverName: "货站司机",
      driverPhone: "13900139000",
      orderIds: [1, 2],
      remark: "广州货站干线外请",
    });

    expect(result).toMatchObject({
      batchId: 8001,
      statusUpdatedCount: 2,
      podCreatedCount: 2,
    });
    expect(state.updateCalls).toHaveLength(2);
    expect(state.updateCalls.map((item) => item.values.status)).toEqual(["dispatched", "dispatched"]);
    expect(state.insertCalls.some((call) => call.table === approvals)).toBe(false);
    expect(mocks.createOperationLogMock).toHaveBeenCalledWith(expect.objectContaining({
      action: "create",
      targetType: "ltl_dispatch_batch",
      description: expect.stringContaining("创建零担派车批次"),
    }));
  });
});
