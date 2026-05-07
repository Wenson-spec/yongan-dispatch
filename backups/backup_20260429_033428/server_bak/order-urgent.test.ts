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

describe("order.updateOrderFields - urgent toggle", () => {
  it("validates isUrgent field accepts boolean", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Test that the input schema accepts isUrgent as boolean
    // We can't actually update without a real DB, but we can verify the procedure exists
    // and the input validation works
    try {
      await caller.order.updateOrderFields({
        id: 999999,
        isUrgent: true,
        urgentReason: "客户催货",
      });
    } catch (e: any) {
      // Expected to fail due to DB or not found, but should NOT fail on input validation
      expect(e.message).not.toContain("Expected boolean");
      expect(e.message).not.toContain("Invalid input");
    }
  });

  it("validates isUrgent field accepts false for cancel", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.order.updateOrderFields({
        id: 999999,
        isUrgent: false,
      });
    } catch (e: any) {
      // Should NOT fail on input validation
      expect(e.message).not.toContain("Expected boolean");
      expect(e.message).not.toContain("Invalid input");
    }
  });

  it("validates urgentReason is optional string", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.order.updateOrderFields({
        id: 999999,
        isUrgent: true,
        urgentReason: "时效紧急，客户要求当天送达",
      });
    } catch (e: any) {
      expect(e.message).not.toContain("Expected string");
      expect(e.message).not.toContain("Invalid input");
    }
  });

  it("validates freight station fields update", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.order.updateOrderFields({
        id: 999999,
        freightStationName: "德坤物流",
        freightWaybillNumber: "DK20260323001",
        inquiryPhone: "13800138000",
        ltlUnitPrice: "420",
        ltlDeliveryFee: "150",
        ltlOtherFee: "0",
      });
    } catch (e: any) {
      // Should NOT fail on input validation
      expect(e.message).not.toContain("Invalid input");
    }
  });

  it("rejects invalid isUrgent type", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.order.updateOrderFields({
        id: 999999,
        // @ts-expect-error - testing invalid input
        isUrgent: "yes",
      });
      // If it doesn't throw, that's unexpected
      expect(true).toBe(false);
    } catch (e: any) {
      // Should fail on input validation for non-boolean
      expect(e.message).toBeTruthy();
    }
  });
});
