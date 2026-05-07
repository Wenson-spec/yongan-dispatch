import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Helper to create admin context for testing
function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-user",
      email: "admin@example.com",
      name: "Admin",
      loginMethod: "password",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createNonAdminContext(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "user-2",
      email: "user@example.com",
      name: "Regular User",
      loginMethod: "password",
      role: "entry_clerk",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Batch Import - Customer", () => {
  it("should batch import customers successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.customer.batchImport({
      items: [
        { name: "测试客户A", phone: "13800001111", salesperson: "张三", settlementType: "monthly" },
        { name: "测试客户B", phone: "13800002222", salesperson: "李四", settlementType: "cash" },
        { name: "测试客户C", phone: "13800003333" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
  });

  it("should reject empty batch import", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.customer.batchImport({ items: [] })
    ).rejects.toThrow();
  });

  it("should reject batch import with invalid customer name", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.customer.batchImport({ items: [{ name: "" }] })
    ).rejects.toThrow();
  });
});

describe("Batch Import - Warehouse", () => {
  it("should batch import warehouses successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.warehouse.batchImport({
      items: [
        { name: "测试仓库A", city: "广州", address: "天河区" },
        { name: "测试仓库B", city: "深圳", address: "南山区" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });
});

describe("Batch Import - Freight Station", () => {
  it("should batch import freight stations successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.freightStation.batchImport({
      items: [
        { name: "测试货站A", city: "广州", address: "白云区", contactPerson: "王五", contactPhone: "13900001111" },
        { name: "测试货站B", city: "深圳" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });
});

describe("Batch Import - Vehicle", () => {
  it("should batch import vehicles successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.vehicle.batchImport({
      items: [
        { plateNumber: "粤TEST001", vehicleType: "own", maxLoad: "20" },
        { plateNumber: "粤TEST002", vehicleType: "outsource", maxLoad: "10" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });
});

describe("Batch Import - Driver", () => {
  it("should batch import drivers successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.driver.batchImport({
      items: [
        { name: "测试司机A", phone: "13700001111", idNumber: "440100199001011234" },
        { name: "测试司机B", phone: "13700002222" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });
});

describe("Batch Import - Department", () => {
  it("should batch import departments successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.department.batchImport({
      items: [
        { name: "测试部门A" },
        { name: "测试部门B" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });
});

describe("Batch Import - Cargo Type", () => {
  it("should batch import cargo types successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.cargoType.batchImport({
      items: [
        { name: "测试货物A" },
        { name: "测试货物B" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });
});

describe("Batch Import - Dispatcher Region", () => {
  it("should batch import dispatcher regions successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dispatcherRegion.batchImport({
      items: [
        { dispatcherId: 1, province: "测试省A", city: "测试市A" },
        { dispatcherId: 1, province: "测试省B" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });
});

describe("Batch Delete - Customer", () => {
  it("should batch delete customers successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // First create some test customers
    const importResult = await caller.customer.batchImport({
      items: [
        { name: "待删除客户A" },
        { name: "待删除客户B" },
      ],
    });
    expect(importResult.success).toBe(true);

    // Get the list to find IDs
    const list = await caller.customer.list({ activeOnly: false });
    const toDelete = list.filter((c: any) => c.name.startsWith("待删除客户")).map((c: any) => c.id);

    if (toDelete.length > 0) {
      const deleteResult = await caller.customer.batchDelete({ ids: toDelete });
      expect(deleteResult.success).toBe(true);
      expect(deleteResult.count).toBe(toDelete.length);
    }
  });

  it("should reject empty batch delete", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.customer.batchDelete({ ids: [] })
    ).rejects.toThrow();
  });
});

describe("Batch Delete - Dispatcher Region", () => {
  it("should batch delete dispatcher regions successfully", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // First import some test regions
    const importResult = await caller.dispatcherRegion.batchImport({
      items: [
        { dispatcherId: 1, province: "待删除省A" },
        { dispatcherId: 1, province: "待删除省B" },
      ],
    });
    expect(importResult.success).toBe(true);

    // Get the list to find IDs
    const list = await caller.dispatcherRegion.list();
    const toDelete = list.filter((r: any) => r.province?.startsWith("待删除省")).map((r: any) => r.id);

    if (toDelete.length > 0) {
      const deleteResult = await caller.dispatcherRegion.batchDelete({ ids: toDelete });
      expect(deleteResult.success).toBe(true);
      expect(deleteResult.count).toBe(toDelete.length);
    }
  });
});

describe("Batch Operations - Permission Check", () => {
  it("should reject batch import from non-admin user without permission", async () => {
    const ctx = createNonAdminContext();
    const caller = appRouter.createCaller(ctx);

    // entry_clerk should not have CONFIG_CUSTOMER permission
    await expect(
      caller.customer.batchImport({
        items: [{ name: "未授权导入" }],
      })
    ).rejects.toThrow();
  });

  it("should reject batch delete from non-admin user without permission", async () => {
    const ctx = createNonAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.customer.batchDelete({ ids: [999] })
    ).rejects.toThrow();
  });
});
