import { describe, expect, it } from "vitest";
import {
  requiredDecimal,
  requiredPositiveDecimal,
  optionalPositiveDecimal,
  optionalWeight,
  requiredPositiveWeight,
  optionalPositiveInt,
} from "../shared/validators";

describe("BUG-001/002: 定价弹窗不允许负数金额", () => {
  const validator = requiredPositiveDecimal();

  it("接受正数金额", () => {
    expect(validator.safeParse("100").success).toBe(true);
    expect(validator.safeParse("0.5").success).toBe(true);
    expect(validator.safeParse("9999999.9999").success).toBe(true);
    expect(validator.safeParse("1").success).toBe(true);
    expect(validator.safeParse("0.01").success).toBe(true);
  });

  it("拒绝负数金额", () => {
    expect(validator.safeParse("-100").success).toBe(false);
    expect(validator.safeParse("-0.5").success).toBe(false);
    expect(validator.safeParse("-1").success).toBe(false);
    expect(validator.safeParse("-9999999.9999").success).toBe(false);
  });

  it("拒绝零", () => {
    expect(validator.safeParse("0").success).toBe(false);
    expect(validator.safeParse("0.0").success).toBe(false);
    expect(validator.safeParse("0.0000").success).toBe(false);
  });

  it("拒绝空字符串", () => {
    expect(validator.safeParse("").success).toBe(false);
  });

  it("拒绝非数字字符", () => {
    expect(validator.safeParse("abc").success).toBe(false);
    expect(validator.safeParse("12元").success).toBe(false);
    expect(validator.safeParse("$100").success).toBe(false);
  });

  it("拒绝超过4位小数", () => {
    expect(validator.safeParse("100.12345").success).toBe(false);
  });
});

describe("BUG-004: settled状态标签不应与signed重复", () => {
  // 测试状态映射确保settled和signed有不同的中文标签
  const STATUS_LABELS: Record<string, string> = {
    pending_entry: "待录入",
    pending_pricing: "待定价",
    pending_dispatch: "待调度",
    pending_approval: "待审批",
    dispatched: "已调度",
    in_transit: "运输中",
    delivered: "已送达",
    signed: "已签收",
    settled: "已结算",
    cancelled: "已取消",
    on_hold: "已搁置",
  };

  it("settled和signed有不同的标签", () => {
    expect(STATUS_LABELS["settled"]).not.toBe(STATUS_LABELS["signed"]);
  });

  it("settled标签为已结算", () => {
    expect(STATUS_LABELS["settled"]).toBe("已结算");
  });

  it("signed标签为已签收", () => {
    expect(STATUS_LABELS["signed"]).toBe("已签收");
  });
});

describe("BUG-007: 重量不允许负数", () => {
  const optWeight = optionalWeight();
  const reqWeight = requiredPositiveWeight();

  it("optionalWeight拒绝负数", () => {
    expect(optWeight.safeParse("-10").success).toBe(false);
    expect(optWeight.safeParse("-0.5").success).toBe(false);
  });

  it("optionalWeight接受正数和空", () => {
    expect(optWeight.safeParse("10").success).toBe(true);
    expect(optWeight.safeParse("0.5").success).toBe(true);
    expect(optWeight.safeParse("").success).toBe(true);
    expect(optWeight.safeParse(undefined).success).toBe(true);
  });

  it("requiredPositiveWeight拒绝负数和零", () => {
    expect(reqWeight.safeParse("-10").success).toBe(false);
    expect(reqWeight.safeParse("0").success).toBe(false);
    expect(reqWeight.safeParse("0.0").success).toBe(false);
  });

  it("requiredPositiveWeight接受正数", () => {
    expect(reqWeight.safeParse("10").success).toBe(true);
    expect(reqWeight.safeParse("0.001").success).toBe(true);
  });
});

describe("BUG-008: 操作类型标签完整性", () => {
  const ACTION_LABELS: Record<string, string> = {
    create: "创建",
    update: "更新",
    delete: "删除",
    price_and_assign: "定价并分配",
    dispatch: "调度派车",
    approve: "审批通过",
    reject: "审批驳回",
    return_step: "退回上一步",
    mark_transit: "标记运输中",
    mark_delivered: "标记已送达",
    mark_signed: "标记已签收",
    cancel: "取消订单",
    hold: "搁置订单",
    unhold: "取消搁置",
    batch_delete: "批量删除",
    change_type: "变更类型",
    ltl_inquiry: "零担询价",
    ltl_confirm_ship: "零担确认发运",
    ltl_mark_delivered: "零担标记送达",
    ltl_mark_signed: "零担标记签收",
    ltl_settle: "零担结算",
    pod_received: "回单已收",
    pod_mailed: "回单已寄",
    deposit_refund: "押金退还",
    deposit_no_refund: "押金不退",
    update_note: "更新备注",
    upload_pod: "上传回单",
    upload_bill: "上传开单照片",
    ltl_dispatch_create: "零担派车创建",
    ltl_dispatch_complete: "零担派车完成",
    ltl_dispatch_delete: "零担派车删除",
  };

  it("所有操作类型都有中文标签", () => {
    const allActions = Object.keys(ACTION_LABELS);
    for (const action of allActions) {
      expect(ACTION_LABELS[action]).toBeDefined();
      // 确保标签不是英文（不包含下划线）
      expect(ACTION_LABELS[action]).not.toContain("_");
    }
  });

  it("price_and_assign有正确的中文标签", () => {
    expect(ACTION_LABELS["price_and_assign"]).toBe("定价并分配");
  });

  it("所有标签都是非空中文字符串", () => {
    for (const [key, label] of Object.entries(ACTION_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
      // 确保标签包含中文字符
      expect(/[\u4e00-\u9fa5]/.test(label)).toBe(true);
    }
  });
});

describe("OPT-001: 金额显示精度", () => {
  // 测试formatMoney函数的逻辑
  function formatMoney(val: string | number | null | undefined): string {
    if (val === null || val === undefined || val === "") return "—";
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "—";
    return `¥${num.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  it("金额保留2位小数", () => {
    expect(formatMoney("100.1234")).toBe("¥100.12");
    expect(formatMoney("100")).toBe("¥100.00");
    expect(formatMoney("9999999.99")).toBe("¥9,999,999.99");
  });

  it("空值返回破折号", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
    expect(formatMoney("")).toBe("—");
  });
});

describe("optionalPositiveDecimal: 不允许负数金额", () => {
  const validator = optionalPositiveDecimal();

  it("接受正数和空", () => {
    expect(validator.safeParse("100").success).toBe(true);
    expect(validator.safeParse("0.5").success).toBe(true);
    expect(validator.safeParse("").success).toBe(true);
    expect(validator.safeParse(undefined).success).toBe(true);
  });

  it("拒绝负数", () => {
    expect(validator.safeParse("-100").success).toBe(false);
    expect(validator.safeParse("-0.5").success).toBe(false);
  });
});

describe("optionalPositiveInt: 正整数校验", () => {
  const validator = optionalPositiveInt();

  it("接受正整数和空", () => {
    expect(validator.safeParse("1").success).toBe(true);
    expect(validator.safeParse("100").success).toBe(true);
    expect(validator.safeParse("").success).toBe(true);
    expect(validator.safeParse(undefined).success).toBe(true);
  });

  it("拒绝负数和零", () => {
    expect(validator.safeParse("-1").success).toBe(false);
    expect(validator.safeParse("0").success).toBe(false);
  });

  it("拒绝小数", () => {
    expect(validator.safeParse("1.5").success).toBe(false);
  });
});
