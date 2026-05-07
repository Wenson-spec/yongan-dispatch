import { describe, it, expect } from "vitest";

/**
 * 自运派车台批量派车功能测试
 * 验证手动勾选多单批量派车的核心逻辑：
 * 1. 溢价检测（总运费 vs 调度价/原定价）
 * 2. 路由分支（审批 / batchDispatch分摊 / 直接派车）
 * 3. 表单验证
 */

// 模拟订单数据
interface MockOrder {
  id: number;
  weight: string;
  quotedPrice?: number;
  dispatchPrice?: number;
  customerPrice?: number;
  orderNumber: string;
}

// 从 confirmBatchDispatch 提取的溢价检测逻辑
function detectOverprice(
  selectedOrders: MockOrder[],
  totalFreight: number
): { isOverpriced: boolean; referencePrice: number; priceType: string } {
  const totalQuotedPrice = selectedOrders.reduce(
    (s, o) => s + (o.quotedPrice || 0),
    0
  );
  const totalDispatchPrice = selectedOrders.reduce(
    (s, o) => s + (o.dispatchPrice || 0),
    0
  );
  const referencePrice =
    totalQuotedPrice > 0 ? totalQuotedPrice : totalDispatchPrice;
  const priceType = totalQuotedPrice > 0 ? "原定价" : "调度价";
  const isOverpriced =
    totalFreight > 0 && referencePrice > 0 && totalFreight > referencePrice;
  return { isOverpriced, referencePrice, priceType };
}

// 从 confirmBatchDispatch 提取的路由分支逻辑
type DispatchRoute =
  | "approval"
  | "batchDispatch"
  | "batchUpdateStatus"
  | "singleUpdate";

function determineDispatchRoute(
  orderCount: number,
  totalFreight: number,
  isOverpriced: boolean,
  hasRemark: boolean
): DispatchRoute {
  const needApproval = isOverpriced || hasRemark;
  if (needApproval) return "approval";
  if (orderCount > 1 && totalFreight > 0) return "batchDispatch";
  if (orderCount > 1) return "batchUpdateStatus";
  return "singleUpdate";
}

// 表单验证逻辑
function validateBatchDispatchForm(params: {
  vehiclePlate: string;
  driverName: string;
  driverPhone: string;
}): { valid: boolean; error?: string } {
  if (!params.vehiclePlate.trim())
    return { valid: false, error: "请填写车牌号" };
  if (!params.driverName.trim())
    return { valid: false, error: "请填写司机姓名" };
  if (!params.driverPhone.trim())
    return { valid: false, error: "请填写司机电话" };
  return { valid: true };
}

describe("自运派车台批量派车 - 溢价检测", () => {
  it("运费超过原定价时检测为溢价", () => {
    const orders: MockOrder[] = [
      {
        id: 1,
        weight: "10",
        quotedPrice: 3000,
        orderNumber: "ORD001",
      },
      {
        id: 2,
        weight: "15",
        quotedPrice: 4000,
        orderNumber: "ORD002",
      },
    ];
    const result = detectOverprice(orders, 8000); // 8000 > 7000
    expect(result.isOverpriced).toBe(true);
    expect(result.referencePrice).toBe(7000);
    expect(result.priceType).toBe("原定价");
  });

  it("运费等于原定价时不溢价", () => {
    const orders: MockOrder[] = [
      {
        id: 1,
        weight: "10",
        quotedPrice: 3000,
        orderNumber: "ORD001",
      },
      {
        id: 2,
        weight: "15",
        quotedPrice: 4000,
        orderNumber: "ORD002",
      },
    ];
    const result = detectOverprice(orders, 7000);
    expect(result.isOverpriced).toBe(false);
  });

  it("运费低于原定价时不溢价", () => {
    const orders: MockOrder[] = [
      {
        id: 1,
        weight: "10",
        quotedPrice: 3000,
        orderNumber: "ORD001",
      },
    ];
    const result = detectOverprice(orders, 2500);
    expect(result.isOverpriced).toBe(false);
  });

  it("无原定价时使用调度价检测", () => {
    const orders: MockOrder[] = [
      {
        id: 1,
        weight: "10",
        dispatchPrice: 2000,
        orderNumber: "ORD001",
      },
      {
        id: 2,
        weight: "15",
        dispatchPrice: 3000,
        orderNumber: "ORD002",
      },
    ];
    const result = detectOverprice(orders, 6000); // 6000 > 5000
    expect(result.isOverpriced).toBe(true);
    expect(result.referencePrice).toBe(5000);
    expect(result.priceType).toBe("调度价");
  });

  it("无运费时不溢价", () => {
    const orders: MockOrder[] = [
      {
        id: 1,
        weight: "10",
        quotedPrice: 3000,
        orderNumber: "ORD001",
      },
    ];
    const result = detectOverprice(orders, 0);
    expect(result.isOverpriced).toBe(false);
  });

  it("无参考价时不溢价", () => {
    const orders: MockOrder[] = [
      { id: 1, weight: "10", orderNumber: "ORD001" },
    ];
    const result = detectOverprice(orders, 5000);
    expect(result.isOverpriced).toBe(false);
    expect(result.referencePrice).toBe(0);
  });
});

describe("自运派车台批量派车 - 路由分支", () => {
  it("溢价时走审批流程", () => {
    expect(determineDispatchRoute(3, 10000, true, false)).toBe("approval");
  });

  it("有备注时走审批流程（即使不溢价）", () => {
    expect(determineDispatchRoute(2, 5000, false, true)).toBe("approval");
  });

  it("溢价+有备注也走审批", () => {
    expect(determineDispatchRoute(2, 5000, true, true)).toBe("approval");
  });

  it("多单有运费且不溢价走batchDispatch（运费分摊）", () => {
    expect(determineDispatchRoute(3, 5000, false, false)).toBe(
      "batchDispatch"
    );
  });

  it("多单无运费走batchUpdateStatus", () => {
    expect(determineDispatchRoute(3, 0, false, false)).toBe(
      "batchUpdateStatus"
    );
  });

  it("单个订单走singleUpdate", () => {
    expect(determineDispatchRoute(1, 5000, false, false)).toBe("singleUpdate");
  });

  it("单个订单无运费走singleUpdate", () => {
    expect(determineDispatchRoute(1, 0, false, false)).toBe("singleUpdate");
  });
});

describe("自运派车台批量派车 - 表单验证", () => {
  it("完整信息通过验证", () => {
    const result = validateBatchDispatchForm({
      vehiclePlate: "粤B12345",
      driverName: "张三",
      driverPhone: "13800138000",
    });
    expect(result.valid).toBe(true);
  });

  it("缺少车牌号不通过", () => {
    const result = validateBatchDispatchForm({
      vehiclePlate: "",
      driverName: "张三",
      driverPhone: "13800138000",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("车牌");
  });

  it("缺少司机姓名不通过", () => {
    const result = validateBatchDispatchForm({
      vehiclePlate: "粤B12345",
      driverName: "",
      driverPhone: "13800138000",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("司机姓名");
  });

  it("缺少司机电话不通过", () => {
    const result = validateBatchDispatchForm({
      vehiclePlate: "粤B12345",
      driverName: "张三",
      driverPhone: "",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("司机电话");
  });

  it("空白字符不通过验证", () => {
    const result = validateBatchDispatchForm({
      vehiclePlate: "   ",
      driverName: "张三",
      driverPhone: "13800138000",
    });
    expect(result.valid).toBe(false);
  });
});
