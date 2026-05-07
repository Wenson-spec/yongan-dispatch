import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
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

describe("freight rate database", () => {
  it("freightRates query returns expected structure with date range", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Query with a specific month range
    const result = await caller.stats.freightRates({
      startDate: "2026-01-01",
      endDate: "2026-02-01",
    });

    // Verify structure
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("period");
    expect(result).toHaveProperty("momPeriod");
    expect(result).toHaveProperty("yoyPeriod");
    expect(Array.isArray(result.items)).toBe(true);

    // Verify period strings are populated
    expect(result.period).toBeTruthy();
    expect(result.momPeriod).toBeTruthy();
    expect(result.yoyPeriod).toBeTruthy();

    // Verify yoy period references previous year
    expect(result.yoyPeriod).toContain("2025");
  });

  it("freightRates query works with full year range", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Query with full year range (simulating "按年查看" mode)
    const result = await caller.stats.freightRates({
      startDate: "2026-01-01",
      endDate: "2027-01-01",
    });

    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.period).toBeTruthy();
  });

  it("freightRates query works without date range (defaults to current month)", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stats.freightRates({});

    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.period).toBeTruthy();
    expect(result.momPeriod).toBeTruthy();
    expect(result.yoyPeriod).toBeTruthy();
  });

  it("freightRates items have mom and yoy change data when available", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stats.freightRates({
      startDate: "2026-02-01",
      endDate: "2026-03-01",
    });

    // If there are items, verify they have the correct structure
    for (const item of result.items) {
      expect(item).toHaveProperty("originCity");
      expect(item).toHaveProperty("destinationCity");
      expect(item).toHaveProperty("mom");
      expect(item).toHaveProperty("yoy");
      expect(item.mom).toHaveProperty("tier1");
      expect(item.mom).toHaveProperty("tier2");
      expect(item.mom).toHaveProperty("tier3");
      expect(item.mom).toHaveProperty("tier4");
      expect(item.mom).toHaveProperty("tier5");
      expect(item.yoy).toHaveProperty("tier1");
      expect(item.yoy).toHaveProperty("tier2");
      expect(item.yoy).toHaveProperty("tier3");
      expect(item.yoy).toHaveProperty("tier4");
      expect(item.yoy).toHaveProperty("tier5");
    }
  });

  it("freightRates supports business type filter", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Query with outsource filter
    const outsourceResult = await caller.stats.freightRates({
      businessType: "outsource",
      startDate: "2026-01-01",
      endDate: "2026-02-01",
    });

    expect(outsourceResult).toHaveProperty("items");
    expect(Array.isArray(outsourceResult.items)).toBe(true);

    // Query with ltl filter
    const ltlResult = await caller.stats.freightRates({
      businessType: "ltl",
      startDate: "2026-01-01",
      endDate: "2026-02-01",
    });

    expect(ltlResult).toHaveProperty("items");
    expect(Array.isArray(ltlResult.items)).toBe(true);
  });

  it("largeSlabRates query returns expected structure", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stats.largeSlabRates({
      startDate: "2026-01-01",
      endDate: "2026-02-01",
    });

    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
  });
});

describe("overdue pod monitoring", () => {
  it("overdueStats returns expected structure", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pod.overdueStats({});

    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("outsourceOverdueStats returns expected structure with level counts", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pod.outsourceOverdueStats({});

    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("yellow");
    expect(result).toHaveProperty("orange");
    expect(result).toHaveProperty("red");
    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe("number");
    expect(typeof result.yellow).toBe("number");
    expect(typeof result.orange).toBe("number");
    expect(typeof result.red).toBe("number");
    // total should equal sum of levels
    expect(result.total).toBe(result.yellow + result.orange + result.red);
  });
});
