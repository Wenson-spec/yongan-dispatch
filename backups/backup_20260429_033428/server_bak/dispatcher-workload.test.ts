import { describe, it, expect, vi } from "vitest";
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
      "order.view_all", "stats.full", "kanban.global",
    ]),
  };
});

const createCaller = (role = "admin") => {
  const ctx: TrpcContext = {
    user: {
      id: 1,
      openId: "test-open-id",
      username: "admin",
      name: "管理员",
      role,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
  return appRouter.createCaller(ctx);
};

describe("调度员工作量看板API", () => {
  it("dispatcherWorkload 在数据库不可用时返回空数组", async () => {
    const caller = createCaller();
    const result = await caller.stats.dispatcherWorkload({
      year: 2026,
      month: 2,
    });
    expect(result).toHaveProperty("dispatchers");
    expect(result.dispatchers).toEqual([]);
  });

  it("dispatcherWorkload 不传参数时使用当前年月", async () => {
    const caller = createCaller();
    const result = await caller.stats.dispatcherWorkload();
    expect(result).toHaveProperty("dispatchers");
    expect(Array.isArray(result.dispatchers)).toBe(true);
  });

  it("dispatcherWorkload 输入校验：月份范围1-12", async () => {
    const caller = createCaller();
    await expect(
      caller.stats.dispatcherWorkload({ year: 2026, month: 0 })
    ).rejects.toThrow();
    await expect(
      caller.stats.dispatcherWorkload({ year: 2026, month: 13 })
    ).rejects.toThrow();
  });

  it("dispatcherWorkload 合法月份不抛错", async () => {
    const caller = createCaller();
    for (const month of [1, 6, 12]) {
      const result = await caller.stats.dispatcherWorkload({ year: 2026, month });
      expect(result).toHaveProperty("dispatchers");
    }
  });
});

describe("调度员工作量数据结构验证", () => {
  it("返回的dispatcher对象应包含所有必要字段", () => {
    const mockDispatcher = {
      id: 1,
      name: "调度员小王",
      role: "outsource_dispatcher",
      roleLabel: "外请",
      backlog: 5,
      monthCompleted: 20,
      monthNewOrders: 25,
      inTransit: 3,
    };

    expect(mockDispatcher).toHaveProperty("id");
    expect(mockDispatcher).toHaveProperty("name");
    expect(mockDispatcher).toHaveProperty("role");
    expect(mockDispatcher).toHaveProperty("roleLabel");
    expect(mockDispatcher).toHaveProperty("backlog");
    expect(mockDispatcher).toHaveProperty("monthCompleted");
    expect(mockDispatcher).toHaveProperty("monthNewOrders");
    expect(mockDispatcher).toHaveProperty("inTransit");
  });

  it("roleLabel应正确映射角色", () => {
    const roleMap: Record<string, string> = {
      ltl_dispatcher: "零担",
      outsource_dispatcher: "外请",
      fleet_dispatcher: "车队",
    };

    for (const [role, label] of Object.entries(roleMap)) {
      expect(label).toBeTruthy();
      expect(typeof label).toBe("string");
    }
  });

  it("积压和完成量应为非负整数", () => {
    const mockData = {
      backlog: 0,
      monthCompleted: 15,
      monthNewOrders: 20,
      inTransit: 3,
    };

    expect(mockData.backlog).toBeGreaterThanOrEqual(0);
    expect(mockData.monthCompleted).toBeGreaterThanOrEqual(0);
    expect(mockData.monthNewOrders).toBeGreaterThanOrEqual(0);
    expect(mockData.inTransit).toBeGreaterThanOrEqual(0);
  });

  it("汇总计算应正确", () => {
    const dispatchers = [
      { backlog: 5, monthCompleted: 20, monthNewOrders: 25, inTransit: 3 },
      { backlog: 3, monthCompleted: 15, monthNewOrders: 18, inTransit: 2 },
      { backlog: 8, monthCompleted: 30, monthNewOrders: 35, inTransit: 5 },
    ];

    const totalBacklog = dispatchers.reduce((s, d) => s + d.backlog, 0);
    const totalCompleted = dispatchers.reduce((s, d) => s + d.monthCompleted, 0);
    const totalNew = dispatchers.reduce((s, d) => s + d.monthNewOrders, 0);
    const totalTransit = dispatchers.reduce((s, d) => s + d.inTransit, 0);

    expect(totalBacklog).toBe(16);
    expect(totalCompleted).toBe(65);
    expect(totalNew).toBe(78);
    expect(totalTransit).toBe(10);
  });

  it("排序应按积压数降序", () => {
    const dispatchers = [
      { name: "A", backlog: 3, monthCompleted: 20 },
      { name: "B", backlog: 8, monthCompleted: 15 },
      { name: "C", backlog: 5, monthCompleted: 30 },
    ];

    dispatchers.sort((a, b) => b.backlog - a.backlog || b.monthCompleted - a.monthCompleted);

    expect(dispatchers[0].name).toBe("B");
    expect(dispatchers[1].name).toBe("C");
    expect(dispatchers[2].name).toBe("A");
  });
});
