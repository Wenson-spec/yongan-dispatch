import { describe, expect, it } from "vitest";
import {
  getApprovalGroupPriceSnapshot,
  getApprovalGroupRequestedPrice,
  getApprovalOriginalPrice,
  getApprovalOriginalPriceLabel,
  getApprovalPriceDelta,
  getApprovalRequestedPrice,
} from "../shared/approvalPricing";

describe("approvalPricing helpers", () => {
  it("优先使用 quotedPrice 作为原定价", () => {
    const item = {
      quotedPrice: "180",
      dispatchPrice: "160",
      requestedAmount: "220",
    };

    expect(getApprovalOriginalPrice(item)).toBe(180);
    expect(getApprovalOriginalPriceLabel(item)).toBe("原定价");
    expect(getApprovalRequestedPrice(item)).toBe(220);
    expect(getApprovalPriceDelta(item)).toBe(40);
  });

  it("当 quotedPrice 缺失时回退到 dispatchPrice 作为原调度价", () => {
    const item = {
      quotedPrice: null,
      dispatchPrice: "210",
      requestedAmount: "220",
    };

    expect(getApprovalOriginalPrice(item)).toBe(210);
    expect(getApprovalOriginalPriceLabel(item)).toBe("原调度价");
    expect(getApprovalPriceDelta(item)).toBe(10);
  });

  it("当原价或申请价缺失时不计算差额", () => {
    expect(getApprovalOriginalPriceLabel({ quotedPrice: null, dispatchPrice: null })).toBe("原参考价");
    expect(getApprovalPriceDelta({ quotedPrice: null, dispatchPrice: null, requestedAmount: "220" })).toBeNull();
    expect(getApprovalPriceDelta({ quotedPrice: "180", dispatchPrice: null, requestedAmount: null })).toBeNull();
  });

  it("组合单子项重复携带整组申请价时，不应重复累加", () => {
    const items = [
      {
        quotedPrice: "500",
        requestedAmount: "1100",
        reason: "整组派车审批：车牌沪A12345 司机张三 整组申请报价¥1100",
      },
      {
        quotedPrice: "500",
        requestedAmount: "1100",
        reason: "整组派车审批：车牌沪A12345 司机张三 整组申请报价¥1100",
      },
    ];

    expect(getApprovalGroupRequestedPrice(items)).toBe(1100);

    const snapshot = getApprovalGroupPriceSnapshot(items);
    expect(snapshot.originalPrice).toBe(1000);
    expect(snapshot.requestedPrice).toBe(1100);
    expect(snapshot.priceDelta).toBe(100);
    expect(snapshot.deltaRate).toBe(10);
  });

  it("普通组合单的子项申请价不同且无整组口径时，应按子项求和", () => {
    const items = [
      {
        quotedPrice: "450",
        requestedAmount: "500",
        reason: "子单一申请报价¥500",
      },
      {
        quotedPrice: "550",
        requestedAmount: "600",
        reason: "子单二申请报价¥600",
      },
    ];

    expect(getApprovalGroupRequestedPrice(items)).toBe(1100);

    const snapshot = getApprovalGroupPriceSnapshot(items);
    expect(snapshot.originalPrice).toBe(1000);
    expect(snapshot.requestedPrice).toBe(1100);
    expect(snapshot.priceDelta).toBe(100);
    expect(snapshot.deltaRate).toBe(10);
  });
});
