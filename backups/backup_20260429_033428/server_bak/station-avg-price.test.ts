import { describe, it, expect } from "vitest";

/**
 * 货站运费参考功能测试
 * 验证净单价计算逻辑：(actualFreight - extraFee - deliveryFee) / weight
 */

// 模拟后端 getStationAvgPrice 的净单价计算逻辑
interface StationOrder {
  actualFreight: number;
  extraFee: number;
  deliveryFee: number;
  weight: number;
}

function calculateNetUnitPrice(order: StationOrder): number {
  const netFreight = order.actualFreight - order.extraFee - order.deliveryFee;
  if (order.weight <= 0) return 0;
  return netFreight / order.weight;
}

function calculateStationAvgPrice(orders: StationOrder[]): number | null {
  // 过滤有效订单：有实际运费且有重量
  const validOrders = orders.filter(o => o.actualFreight > 0 && o.weight > 0);
  if (validOrders.length === 0) return null;

  // 计算总净运费和总重量
  let totalNetFreight = 0;
  let totalWeight = 0;
  for (const o of validOrders) {
    totalNetFreight += (o.actualFreight - o.extraFee - o.deliveryFee);
    totalWeight += o.weight;
  }

  if (totalWeight <= 0) return null;
  return totalNetFreight / totalWeight;
}

describe("净单价计算", () => {
  it("基本计算：(运费 - 其他费用 - 送货费) / 重量", () => {
    const price = calculateNetUnitPrice({
      actualFreight: 5000,
      extraFee: 500,
      deliveryFee: 300,
      weight: 20,
    });
    // (5000 - 500 - 300) / 20 = 210
    expect(price).toBe(210);
  });

  it("无其他费用和送货费时", () => {
    const price = calculateNetUnitPrice({
      actualFreight: 3000,
      extraFee: 0,
      deliveryFee: 0,
      weight: 15,
    });
    // 3000 / 15 = 200
    expect(price).toBe(200);
  });

  it("重量为0时返回0", () => {
    const price = calculateNetUnitPrice({
      actualFreight: 5000,
      extraFee: 500,
      deliveryFee: 300,
      weight: 0,
    });
    expect(price).toBe(0);
  });

  it("费用大于运费时净单价为负数", () => {
    const price = calculateNetUnitPrice({
      actualFreight: 1000,
      extraFee: 800,
      deliveryFee: 500,
      weight: 10,
    });
    // (1000 - 800 - 500) / 10 = -30
    expect(price).toBe(-30);
  });

  it("小数重量正确计算", () => {
    const price = calculateNetUnitPrice({
      actualFreight: 4200,
      extraFee: 200,
      deliveryFee: 0,
      weight: 16.5,
    });
    // (4200 - 200 - 0) / 16.5 ≈ 242.42
    expect(price).toBeCloseTo(242.42, 1);
  });
});

describe("货站平均净单价计算", () => {
  it("多个订单的加权平均", () => {
    const orders: StationOrder[] = [
      { actualFreight: 5000, extraFee: 500, deliveryFee: 300, weight: 20 },
      { actualFreight: 3000, extraFee: 200, deliveryFee: 100, weight: 10 },
      { actualFreight: 8000, extraFee: 1000, deliveryFee: 500, weight: 30 },
    ];
    const avg = calculateStationAvgPrice(orders);
    // 总净运费: (5000-500-300) + (3000-200-100) + (8000-1000-500) = 4200 + 2700 + 6500 = 13400
    // 总重量: 20 + 10 + 30 = 60
    // 平均: 13400 / 60 ≈ 223.33
    expect(avg).toBeCloseTo(223.33, 1);
  });

  it("单个订单时等于该订单的净单价", () => {
    const orders: StationOrder[] = [
      { actualFreight: 5000, extraFee: 500, deliveryFee: 300, weight: 20 },
    ];
    const avg = calculateStationAvgPrice(orders);
    expect(avg).toBe(210);
  });

  it("无有效订单时返回null", () => {
    const orders: StationOrder[] = [
      { actualFreight: 0, extraFee: 0, deliveryFee: 0, weight: 10 },
      { actualFreight: 5000, extraFee: 0, deliveryFee: 0, weight: 0 },
    ];
    const avg = calculateStationAvgPrice(orders);
    expect(avg).toBeNull();
  });

  it("空数组返回null", () => {
    const avg = calculateStationAvgPrice([]);
    expect(avg).toBeNull();
  });

  it("过滤掉运费为0的订单", () => {
    const orders: StationOrder[] = [
      { actualFreight: 0, extraFee: 0, deliveryFee: 0, weight: 10 },
      { actualFreight: 5000, extraFee: 500, deliveryFee: 300, weight: 20 },
    ];
    const avg = calculateStationAvgPrice(orders);
    // 只计算第二个订单: (5000-500-300) / 20 = 210
    expect(avg).toBe(210);
  });

  it("过滤掉重量为0的订单", () => {
    const orders: StationOrder[] = [
      { actualFreight: 5000, extraFee: 500, deliveryFee: 300, weight: 0 },
      { actualFreight: 3000, extraFee: 200, deliveryFee: 100, weight: 10 },
    ];
    const avg = calculateStationAvgPrice(orders);
    // 只计算第二个订单: (3000-200-100) / 10 = 270
    expect(avg).toBe(270);
  });

  it("大量订单的平均计算", () => {
    const orders: StationOrder[] = Array.from({ length: 100 }, (_, i) => ({
      actualFreight: 3000 + i * 10,
      extraFee: 200,
      deliveryFee: 100,
      weight: 15,
    }));
    const avg = calculateStationAvgPrice(orders);
    expect(avg).not.toBeNull();
    expect(avg!).toBeGreaterThan(0);
    // 平均净运费 = (3000 + 3990) / 2 - 200 - 100 = 3195
    // 平均净单价 = 3195 / 15 = 213
    expect(avg!).toBeCloseTo(213, 0);
  });
});

describe("前端展示逻辑", () => {
  // 模拟前端格式化逻辑
  function formatAvgPrice(avgPrice: number | null): string {
    if (avgPrice === null) return "";
    return `参考均价 ¥${avgPrice.toFixed(0)}/吨`;
  }

  it("正常价格格式化", () => {
    expect(formatAvgPrice(210)).toBe("参考均价 ¥210/吨");
  });

  it("小数价格四舍五入", () => {
    expect(formatAvgPrice(223.67)).toBe("参考均价 ¥224/吨");
  });

  it("null时返回空字符串", () => {
    expect(formatAvgPrice(null)).toBe("");
  });

  it("零价格格式化", () => {
    expect(formatAvgPrice(0)).toBe("参考均价 ¥0/吨");
  });

  it("大数值格式化", () => {
    expect(formatAvgPrice(1500.5)).toBe("参考均价 ¥1501/吨");
  });
});
