import { describe, it, expect } from "vitest";
import { z } from "zod";
import { optionalDecimal, requiredDecimal, optionalWeight, optionalPositiveInt } from "@shared/validators";

// Helper: 用schema解析值并返回结果
function parse(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  return result;
}

describe("optionalDecimal - 可选金额字段校验", () => {
  const schema = z.object({ amount: optionalDecimal() });

  it("允许 undefined（未传值）", () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("允许空字符串（视为未填写）", () => {
    const result = schema.safeParse({ amount: "" });
    expect(result.success).toBe(true);
  });

  it("允许正整数", () => {
    const result = schema.safeParse({ amount: "100" });
    expect(result.success).toBe(true);
  });

  it("允许零", () => {
    const result = schema.safeParse({ amount: "0" });
    expect(result.success).toBe(true);
  });

  it("允许正小数（1位）", () => {
    const result = schema.safeParse({ amount: "99.5" });
    expect(result.success).toBe(true);
  });

  it("允许正小数（4位）", () => {
    const result = schema.safeParse({ amount: "123.4567" });
    expect(result.success).toBe(true);
  });

  it("允许负数（退款场景）", () => {
    const result = schema.safeParse({ amount: "-500" });
    expect(result.success).toBe(true);
  });

  it("允许负小数", () => {
    const result = schema.safeParse({ amount: "-0.5" });
    expect(result.success).toBe(true);
  });

  it("允许大金额（10位整数）", () => {
    const result = schema.safeParse({ amount: "9999999999.9999" });
    expect(result.success).toBe(true);
  });

  it("拒绝非数字字符串 'abc'", () => {
    const result = schema.safeParse({ amount: "abc" });
    expect(result.success).toBe(false);
  });

  it("拒绝带货币符号 '¥100'", () => {
    const result = schema.safeParse({ amount: "¥100" });
    expect(result.success).toBe(false);
  });

  it("拒绝带单位 '100元'", () => {
    const result = schema.safeParse({ amount: "100元" });
    expect(result.success).toBe(false);
  });

  it("拒绝超过4位小数", () => {
    const result = schema.safeParse({ amount: "100.12345" });
    expect(result.success).toBe(false);
  });

  it("拒绝超过10位整数", () => {
    const result = schema.safeParse({ amount: "99999999999" });
    expect(result.success).toBe(false);
  });

  it("拒绝含空格 '100 .5'", () => {
    const result = schema.safeParse({ amount: "100 .5" });
    expect(result.success).toBe(false);
  });

  it("拒绝多个小数点 '1.2.3'", () => {
    const result = schema.safeParse({ amount: "1.2.3" });
    expect(result.success).toBe(false);
  });

  it("拒绝特殊字符 '12@34'", () => {
    const result = schema.safeParse({ amount: "12@34" });
    expect(result.success).toBe(false);
  });

  it("拒绝emoji '💰100'", () => {
    const result = schema.safeParse({ amount: "💰100" });
    expect(result.success).toBe(false);
  });
});

describe("requiredDecimal - 必填金额字段校验", () => {
  const schema = z.object({ price: requiredDecimal() });

  it("允许正整数", () => {
    const result = schema.safeParse({ price: "4200" });
    expect(result.success).toBe(true);
  });

  it("允许小数", () => {
    const result = schema.safeParse({ price: "131.25" });
    expect(result.success).toBe(true);
  });

  it("拒绝空字符串", () => {
    const result = schema.safeParse({ price: "" });
    expect(result.success).toBe(false);
  });

  it("拒绝非数字", () => {
    const result = schema.safeParse({ price: "abc" });
    expect(result.success).toBe(false);
  });

  it("拒绝 undefined", () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("optionalWeight - 可选重量字段校验（只允许正数，拒绝负数和零）", () => {
  const schema = z.object({ weight: optionalWeight() });

  it("允许 undefined", () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("允许空字符串", () => {
    const result = schema.safeParse({ weight: "" });
    expect(result.success).toBe(true);
  });

  it("允许正数", () => {
    const result = schema.safeParse({ weight: "27.4" });
    expect(result.success).toBe(true);
  });

  it("拒绝零（重量必须为正数）", () => {
    const result = schema.safeParse({ weight: "0" });
    expect(result.success).toBe(false);
  });

  it("拒绝负数", () => {
    const result = schema.safeParse({ weight: "-5" });
    expect(result.success).toBe(false);
  });

  it("拒绝非数字", () => {
    const result = schema.safeParse({ weight: "abc" });
    expect(result.success).toBe(false);
  });

  it("拒绝超过5位小数", () => {
    const result = schema.safeParse({ weight: "1.234567" });
    expect(result.success).toBe(false);
  });
});

describe("optionalPositiveInt - 可选正整数字段校验", () => {
  const schema = z.object({ count: optionalPositiveInt() });

  it("允许 undefined", () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("允许空字符串", () => {
    const result = schema.safeParse({ count: "" });
    expect(result.success).toBe(true);
  });

  it("允许正整数", () => {
    const result = schema.safeParse({ count: "5" });
    expect(result.success).toBe(true);
  });

  it("拒绝零", () => {
    const result = schema.safeParse({ count: "0" });
    expect(result.success).toBe(false);
  });

  it("拒绝负数", () => {
    const result = schema.safeParse({ count: "-1" });
    expect(result.success).toBe(false);
  });

  it("拒绝小数", () => {
    const result = schema.safeParse({ count: "1.5" });
    expect(result.success).toBe(false);
  });

  it("拒绝非数字", () => {
    const result = schema.safeParse({ count: "abc" });
    expect(result.success).toBe(false);
  });
});

describe("金额校验在实际业务场景中的表现", () => {
  it("运费定价场景：4200元", () => {
    const schema = z.object({ dispatchPrice: requiredDecimal() });
    expect(schema.safeParse({ dispatchPrice: "4200" }).success).toBe(true);
  });

  it("运费定价场景：131.25元/吨", () => {
    const schema = z.object({ dispatchPrice: requiredDecimal() });
    expect(schema.safeParse({ dispatchPrice: "131.25" }).success).toBe(true);
  });

  it("押金场景：2000元", () => {
    const schema = z.object({ depositAmount: optionalDecimal() });
    expect(schema.safeParse({ depositAmount: "2000" }).success).toBe(true);
  });

  it("零担询价场景：420元/吨 + 送货费150", () => {
    const schema = z.object({
      ltlUnitPrice: optionalDecimal(),
      ltlDeliveryFee: optionalDecimal(),
      ltlOtherFee: optionalDecimal(),
    });
    const result = schema.safeParse({
      ltlUnitPrice: "420",
      ltlDeliveryFee: "150",
      ltlOtherFee: "0",
    });
    expect(result.success).toBe(true);
  });

  it("重量场景：27.4吨", () => {
    const schema = z.object({ weight: optionalWeight() });
    expect(schema.safeParse({ weight: "27.4" }).success).toBe(true);
  });

  it("架数场景：5架", () => {
    const schema = z.object({ packageCount: optionalPositiveInt() });
    expect(schema.safeParse({ packageCount: "5" }).success).toBe(true);
  });

  it("混合非法输入全部被拒绝", () => {
    const schema = z.object({
      customerPrice: optionalDecimal(),
      weight: optionalWeight(),
    });
    expect(schema.safeParse({ customerPrice: "abc", weight: "27.4" }).success).toBe(false);
    expect(schema.safeParse({ customerPrice: "100", weight: "-5" }).success).toBe(false);
    expect(schema.safeParse({ customerPrice: "100元", weight: "27.4" }).success).toBe(false);
  });
});
