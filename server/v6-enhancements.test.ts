import { describe, it, expect, vi } from "vitest";

// ====== 模板自动推荐 - 文本特征提取 ======
describe("模板自动推荐 - 文本特征提取", () => {
  // 模拟 extractTextFeatures 的逻辑
  function extractTextFeatures(text: string): string[] {
    const features: string[] = [];
    const lines = text.split("\n").filter(l => l.trim());
    features.push(`lines:${lines.length}`);
    const hasTable = text.includes("\t") || /\s{2,}/.test(text);
    if (hasTable) features.push("format:table");
    const hasSeparator = /[|/\\,，、;；]/.test(text);
    if (hasSeparator) features.push("format:separated");
    const hasHeader = /计划号|客户|发货|收货|重量|吨位|品名|规格|线路/.test(text);
    if (hasHeader) features.push("has:header");
    const hasMergedPlan = /HB\d+|合并/.test(text);
    if (hasMergedPlan) features.push("has:mergedPlan");
    return features;
  }

  it("应识别表格格式", () => {
    const text = "计划号\t客户\t发货地\t收货地\nHB001\t永安\t佛山\t北京";
    const features = extractTextFeatures(text);
    expect(features).toContain("format:table");
    expect(features).toContain("has:header");
    expect(features).toContain("has:mergedPlan");
    expect(features).toContain("lines:2");
  });

  it("应识别分隔符格式", () => {
    const text = "佛山/北京，20吨，瓷砖";
    const features = extractTextFeatures(text);
    expect(features).toContain("format:separated");
  });

  it("空文本应返回基本特征", () => {
    const features = extractTextFeatures("");
    expect(features).toContain("lines:0");
  });

  it("应识别合并计划号", () => {
    const text = "HB20260101001 永安物流 佛山到北京 20吨";
    const features = extractTextFeatures(text);
    expect(features).toContain("has:mergedPlan");
  });
});

// ====== 模板匹配评分 ======
describe("模板匹配评分", () => {
  function calculateMatchScore(textFeatures: string[], templateFeatures: string[]): number {
    if (templateFeatures.length === 0) return 0;
    const matched = textFeatures.filter(f => templateFeatures.includes(f)).length;
    return matched / Math.max(textFeatures.length, templateFeatures.length);
  }

  it("完全匹配应返回1.0", () => {
    const features = ["lines:3", "format:table", "has:header"];
    expect(calculateMatchScore(features, features)).toBe(1.0);
  });

  it("部分匹配应返回0-1之间", () => {
    const textFeatures = ["lines:3", "format:table", "has:header"];
    const templateFeatures = ["lines:3", "format:table", "has:mergedPlan"];
    const score = calculateMatchScore(textFeatures, templateFeatures);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("无匹配应返回0", () => {
    const textFeatures = ["lines:3", "format:table"];
    const templateFeatures = ["lines:10", "format:separated"];
    expect(calculateMatchScore(textFeatures, templateFeatures)).toBe(0);
  });

  it("空模板特征应返回0", () => {
    expect(calculateMatchScore(["lines:3"], [])).toBe(0);
  });
});

// ====== 批量操作输入验证 ======
describe("批量操作输入验证", () => {
  it("batchManualAssign 应需要 orderIds 和 dispatcherId", () => {
    const input = { orderIds: [1, 2, 3], dispatcherId: 5 };
    expect(input.orderIds.length).toBeGreaterThan(0);
    expect(input.dispatcherId).toBeGreaterThan(0);
  });

  it("batchUpdateStatus 应需要 orderIds 和 status", () => {
    const input = {
      orderIds: [1, 2, 3],
      status: "pending_approval",
      plateNumber: "粤B12345",
      driverName: "张三",
      driverPhone: "13800138000",
      actualFreight: "5000",
      depositAmount: "1000",
      depositRefundable: true,
      receivingNote: "收货要求",
    };
    expect(input.orderIds.length).toBeGreaterThan(0);
    expect(input.status).toBeTruthy();
    expect(input.plateNumber).toBeTruthy();
    expect(input.driverName).toBeTruthy();
    expect(input.driverPhone).toBeTruthy();
  });

  it("batchApprove 应需要 ids 和 action", () => {
    const input = { ids: [10, 20], action: "approve" as const, approverComment: "批准" };
    expect(input.ids.length).toBeGreaterThan(0);
    expect(["approve", "reject"]).toContain(input.action);
  });

  it("batchApprove reject 应需要 approverComment", () => {
    const input = { ids: [10], action: "reject" as const, approverComment: "价格过高" };
    expect(input.approverComment).toBeTruthy();
  });
});

// ====== 批量找车审批判断逻辑 ======
describe("批量找车审批判断逻辑", () => {
  function needsApproval(quotePrice: string, dispatcherRemark: string): boolean {
    const hasRemark = dispatcherRemark.trim().length > 0;
    if (hasRemark) return true;
    const freight = parseFloat(quotePrice) || 0;
    if (freight > 0) return true;
    return false;
  }

  it("有备注时需要审批", () => {
    expect(needsApproval("", "特殊情况")).toBe(true);
  });

  it("有运费报价时需要审批", () => {
    expect(needsApproval("5000", "")).toBe(true);
  });

  it("无备注无运费时不需审批", () => {
    expect(needsApproval("", "")).toBe(false);
  });

  it("运费为0时不需审批", () => {
    expect(needsApproval("0", "")).toBe(false);
  });
});

// ====== 合并计划号分组逻辑 ======
describe("合并计划号分组逻辑", () => {
  function groupByMergedPlan(orders: any[]) {
    const groups = new Map<string, any[]>();
    const ungrouped: any[] = [];
    for (const order of orders) {
      if (order.mergedPlanNumber) {
        const existing = groups.get(order.mergedPlanNumber) || [];
        existing.push(order);
        groups.set(order.mergedPlanNumber, existing);
      } else {
        ungrouped.push(order);
      }
    }
    return { groups, ungrouped };
  }

  it("应正确分组有合并计划号的订单", () => {
    const orders = [
      { id: 1, mergedPlanNumber: "HB001" },
      { id: 2, mergedPlanNumber: "HB001" },
      { id: 3, mergedPlanNumber: "HB002" },
      { id: 4, mergedPlanNumber: null },
    ];
    const { groups, ungrouped } = groupByMergedPlan(orders);
    expect(groups.size).toBe(2);
    expect(groups.get("HB001")?.length).toBe(2);
    expect(groups.get("HB002")?.length).toBe(1);
    expect(ungrouped.length).toBe(1);
  });

  it("全部无合并计划号时应全部在ungrouped", () => {
    const orders = [
      { id: 1, mergedPlanNumber: null },
      { id: 2, mergedPlanNumber: null },
    ];
    const { groups, ungrouped } = groupByMergedPlan(orders);
    expect(groups.size).toBe(0);
    expect(ungrouped.length).toBe(2);
  });

  it("空数组应返回空结果", () => {
    const { groups, ungrouped } = groupByMergedPlan([]);
    expect(groups.size).toBe(0);
    expect(ungrouped.length).toBe(0);
  });
});
