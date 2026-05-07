import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-admin",
    email: "admin@test.com",
    name: "Test Admin",
    loginMethod: "manus",
    role: "admin",
    phone: null,
    region: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createNonAdminContext(role: string = "order_entry"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "test-user",
    email: "user@test.com",
    name: "Test User",
    loginMethod: "manus",
    role: role as any,
    phone: null,
    region: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createAnonymousContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Config Router - Customer Management", () => {
  it("admin can list customers", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.customer.list({ activeOnly: true });
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin can create a customer", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.customer.create({
      name: "测试客户_" + Date.now(),
      phone: "13800138000",
      settlementType: "monthly",
    });
    expect(result).toHaveProperty("id");
    expect(typeof result.id).toBe("number");
  });

  it("anonymous user cannot list customers", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.customer.list({ activeOnly: true })).rejects.toThrow();
  });
});

describe("Config Router - Warehouse Management", () => {
  it("admin can list warehouses", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.warehouse.list({ activeOnly: true });
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin can create a warehouse", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.warehouse.create({
      name: "测试仓库_" + Date.now(),
      address: "广东省广州市",
    });
    expect(result).toHaveProperty("id");
  });
});

describe("Config Router - Freight Station Management", () => {
  it("admin can list freight stations", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.freightStation.list({ activeOnly: true });
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin can create a freight station", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.freightStation.create({
      name: "测试货站_" + Date.now(),
      coverageArea: "广东省深圳市",
    });
    expect(result).toHaveProperty("id");
  });
});

describe("Config Router - Vehicle Management", () => {
  it("admin can list vehicles", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.vehicle.list({ activeOnly: true });
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin can create a vehicle", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.vehicle.create({
      plateNumber: "粤A" + Math.floor(Math.random() * 100000).toString().padStart(5, "0"),
      vehicleType: "own",
      model: "9.6米平板",
      capacity: "25",
    });
    expect(result).toHaveProperty("id");
  });
});

describe("Config Router - Driver Management", () => {
  it("admin can list drivers", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.driver.list({ activeOnly: true });
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin can create a driver", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.driver.create({
      name: "测试司机_" + Date.now(),
      phone: "13900139000",
      driverType: "own",
    });
    expect(result).toHaveProperty("id");
  });
});

describe("Config Router - Department Management", () => {
  it("admin can list departments", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.department.list({ activeOnly: true });
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin can create a department", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.department.create({
      name: "测试部门_" + Date.now(),
    });
    expect(result).toHaveProperty("id");
  });
});

describe("Config Router - Cargo Type Management", () => {
  it("admin can list cargo types", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.cargoType.list({ activeOnly: true });
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin can create a cargo type", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.cargoType.create({
      name: "测试货物_" + Date.now(),
    });
    expect(result).toHaveProperty("id");
  });
});

describe("Config Router - User Management", () => {
  it("admin can list users", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.user.list({ activeOnly: true });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("Config Router - Permission Management", () => {
  it("admin can list permissions for a role", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.permission.listForRole({ role: "order_entry" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("authenticated user can get own permissions", async () => {
    const caller = appRouter.createCaller(createNonAdminContext("order_entry"));
    const result = await caller.permission.myPermissions();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("Auth - me endpoint", () => {
  it("returns user for authenticated context", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Test Admin");
    expect(result?.role).toBe("admin");
  });

  it("returns null for anonymous context", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });
});
