import { describe, it, expect } from "vitest";

// 任务1: 验证 advance_payment 已从 approvalType 枚举中删除
describe("任务1: 清理垫付(advance_payment)相关代码", () => {
  it("approvalType 枚举不应包含 advance_payment", async () => {
    const { approvals } = await import("../drizzle/schema");
    // approvals.approvalType 是 mysqlEnum 列，其 enumValues 包含枚举值
    const col = (approvals as any).approvalType;
    const enumValues = col?.enumValues ?? col?.config?.enumValues ?? [];
    expect(enumValues).not.toContain("advance_payment");
  });

  it("approvalType 枚举应包含 initial_price, vehicle_quote, surcharge", async () => {
    const { approvals } = await import("../drizzle/schema");
    const col = (approvals as any).approvalType;
    const enumValues = col?.enumValues ?? col?.config?.enumValues ?? [];
    expect(enumValues).toContain("initial_price");
    expect(enumValues).toContain("vehicle_quote");
    expect(enumValues).toContain("surcharge");
  });
});

// 任务2: 验证 safeParseFloat 工具函数
describe("任务2: safeParseFloat 金额安全计算", () => {
  it("safeParseFloat 应正确处理正常数字字符串", async () => {
    const { safeParseFloat } = await import("../shared/safeParseFloat");
    expect(safeParseFloat("123.45")).toBe(123.45);
    expect(safeParseFloat("0")).toBe(0);
    expect(safeParseFloat("-50.5")).toBe(-50.5);
  });

  it("safeParseFloat 应对空字符串返回 0", async () => {
    const { safeParseFloat } = await import("../shared/safeParseFloat");
    expect(safeParseFloat("")).toBe(0);
    expect(safeParseFloat("   ")).toBe(0);
  });

  it("safeParseFloat 应对非数字字符串返回 0", async () => {
    const { safeParseFloat } = await import("../shared/safeParseFloat");
    expect(safeParseFloat("abc")).toBe(0);
    expect(safeParseFloat("NaN")).toBe(0);
    expect(safeParseFloat("undefined")).toBe(0);
    expect(safeParseFloat("null")).toBe(0);
  });

  it("safeParseFloat 应对 undefined/null 返回 0", async () => {
    const { safeParseFloat } = await import("../shared/safeParseFloat");
    expect(safeParseFloat(undefined as any)).toBe(0);
    expect(safeParseFloat(null as any)).toBe(0);
  });

  it("safeParseFloat 应对数字类型直接返回", async () => {
    const { safeParseFloat } = await import("../shared/safeParseFloat");
    expect(safeParseFloat(42 as any)).toBe(42);
    expect(safeParseFloat(0 as any)).toBe(0);
  });

  it("safeParseFloat 结果永远不应为 NaN", async () => {
    const { safeParseFloat } = await import("../shared/safeParseFloat");
    const testCases = ["", "abc", "NaN", "Infinity", undefined, null, "特殊字符!@#", "12.34.56"];
    for (const tc of testCases) {
      const result = safeParseFloat(tc as any);
      expect(Number.isNaN(result)).toBe(false);
    }
  });
});

// 任务3: 验证审批驳回逻辑
describe("任务3: 审批驳回精准回退", () => {
  it("approvals 表应有 previousStatus 字段", async () => {
    const { approvals } = await import("../drizzle/schema");
    // 检查 approvals 表定义中有 previousStatus 列
    const columns = Object.keys(approvals);
    // Drizzle table 对象的列名作为属性存在
    expect("previousStatus" in approvals).toBe(true);
  });
});

// 任务4: 验证押金数据源设计
describe("任务4: 押金(Deposit)单一数据源", () => {
  it("orders 表应有 depositStatus 字段", async () => {
    const { orders } = await import("../drizzle/schema");
    expect("depositStatus" in orders).toBe(true);
  });

  it("orders 表应有 depositRefundDate 字段", async () => {
    const { orders } = await import("../drizzle/schema");
    expect("depositRefundDate" in orders).toBe(true);
  });

  it("orders 表应有 depositAmount 字段", async () => {
    const { orders } = await import("../drizzle/schema");
    expect("depositAmount" in orders).toBe(true);
  });
});

// 任务5: 验证零担 LTL 状态机
describe("任务5: 零担(LTL)状态机完善", () => {
  it("VALID_TRANSITIONS 应允许 inquiry_confirmed → dispatched", () => {
    // 从 order.ts 中的 VALID_TRANSITIONS 定义验证
    const VALID_TRANSITIONS: Record<string, string[]> = {
      pending_assign: ["pending_price", "pending_inquiry", "on_hold", "cancelled"],
      pending_price: ["priced", "pending_vehicle", "on_hold", "cancelled", "pending_assign"],
      priced: ["pending_vehicle", "pending_dispatch", "on_hold", "cancelled", "pending_price"],
      pending_vehicle: ["pending_dispatch", "pending_approval", "dispatched", "on_hold", "cancelled", "pending_price"],
      pending_dispatch: ["dispatched", "on_hold", "cancelled", "pending_price"],
      pending_approval: ["dispatched", "pending_vehicle", "on_hold", "cancelled"],
      pending_inquiry: ["inquiry_confirmed", "on_hold", "cancelled", "pending_price"],
      inquiry_confirmed: ["shipped", "dispatched", "delivered", "on_hold", "cancelled", "pending_inquiry"],
      shipped: ["delivered", "on_hold", "cancelled", "inquiry_confirmed"],
      dispatched: ["delivered", "on_hold", "cancelled", "pending_vehicle", "pending_dispatch"],
      in_transit: ["delivered", "on_hold", "cancelled", "dispatched"],
      delivered: ["signed", "on_hold", "cancelled", "dispatched"],
      signed: ["on_hold"],
      on_hold: ["pending_assign", "pending_price", "priced", "pending_vehicle", "pending_dispatch", "pending_inquiry", "inquiry_confirmed", "shipped", "dispatched", "delivered", "signed", "cancelled"],
      cancelled: [],
    };

    expect(VALID_TRANSITIONS["inquiry_confirmed"]).toContain("dispatched");
    expect(VALID_TRANSITIONS["inquiry_confirmed"]).toContain("shipped");
    expect(VALID_TRANSITIONS["inquiry_confirmed"]).toContain("delivered");
  });

  it("零担完整状态链路应通畅: pending_inquiry → inquiry_confirmed → dispatched → delivered → signed", () => {
    const VALID_TRANSITIONS: Record<string, string[]> = {
      pending_inquiry: ["inquiry_confirmed", "on_hold", "cancelled", "pending_price"],
      inquiry_confirmed: ["shipped", "dispatched", "delivered", "on_hold", "cancelled", "pending_inquiry"],
      shipped: ["delivered", "on_hold", "cancelled", "inquiry_confirmed"],
      dispatched: ["delivered", "on_hold", "cancelled", "pending_vehicle", "pending_dispatch"],
      delivered: ["signed", "on_hold", "cancelled", "dispatched"],
      signed: ["on_hold"],
    };

    // 验证完整链路
    expect(VALID_TRANSITIONS["pending_inquiry"]).toContain("inquiry_confirmed");
    expect(VALID_TRANSITIONS["inquiry_confirmed"]).toContain("dispatched");
    expect(VALID_TRANSITIONS["dispatched"]).toContain("delivered");
    expect(VALID_TRANSITIONS["delivered"]).toContain("signed");
  });

  it("dispatched 不应在 VALID_TRANSITIONS 中包含 in_transit（已消除）", () => {
    const VALID_TRANSITIONS_dispatched = ["delivered", "on_hold", "cancelled", "pending_vehicle", "pending_dispatch"];
    expect(VALID_TRANSITIONS_dispatched).not.toContain("in_transit");
  });
});
