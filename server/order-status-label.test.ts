import { describe, expect, it } from "vitest";
import { getOrderStatusLabel } from "../client/src/lib/orderStatus";

describe("orderStatus labels", () => {
  it("将已知订单状态码转换为中文文案", () => {
    expect(getOrderStatusLabel("pending_inquiry")).toBe("待询价");
    expect(getOrderStatusLabel("pending_vehicle")).toBe("待找车");
    expect(getOrderStatusLabel("signed")).toBe("已签收");
  });

  it("对空值与未知状态保持安全兜底", () => {
    expect(getOrderStatusLabel(undefined)).toBe("-");
    expect(getOrderStatusLabel(null)).toBe("-");
    expect(getOrderStatusLabel("custom_status")).toBe("custom_status");
  });
});
