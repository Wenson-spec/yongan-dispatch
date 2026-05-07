import { describe, expect, it } from "vitest";
import { normalizeLtlWeightField, resolveWeightInTons, shouldAutoConvertLtlWeightFromKg } from "@shared/ltlWeight";

describe("零担重量单位 KG/吨 回归", () => {
  it("零担录入 3372.06 时应按 KG 自动转为 3.37206 吨", () => {
    expect(shouldAutoConvertLtlWeightFromKg("3372.06")).toBe(true);
    expect(normalizeLtlWeightField("3372.06")).toBe("3.37206");
    expect(resolveWeightInTons("ltl", "3372.06")).toBe(3.37206);
  });

  it("零担录入 5 时应继续视为 5 吨，不做二次换算", () => {
    expect(shouldAutoConvertLtlWeightFromKg("5")).toBe(false);
    expect(normalizeLtlWeightField("5")).toBe("5");
    expect(resolveWeightInTons("ltl", "5")).toBe(5);
  });

  it("零担运费计算应始终使用归一化后的吨位，避免 KG 被当成吨导致费用放大", () => {
    const unitPrice = 420;
    const normalizedWeight = resolveWeightInTons("ltl", "3372.06");
    const freight = Math.round(unitPrice * normalizedWeight * 100) / 100;
    expect(freight).toBe(1416.27);
    expect(freight).not.toBe(1416265.2);
  });

  it("非零担业务保留原始重量数值，不做 KG 自动转吨", () => {
    expect(resolveWeightInTons("outsource", "3372.06")).toBe(3372.06);
    expect(resolveWeightInTons("self", "3372.06")).toBe(3372.06);
  });
});
