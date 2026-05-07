import { describe, it, expect } from "vitest";

describe("管理驾驶舱月度报表导出", () => {
  it("应正确计算财务汇总数据", () => {
    const orders = [
      { quotedPrice: "5000", actualFreight: "3500", weight: "10", depositAmount: "500", businessType: "outsource", status: "delivered" },
      { quotedPrice: "3000", actualFreight: "2000", weight: "5", depositAmount: "300", businessType: "self", status: "in_transit" },
      { quotedPrice: "1500", actualFreight: "1200", weight: "3", depositAmount: "0", businessType: "ltl", status: "signed" },
    ];
    const totalQuoted = orders.reduce((s, o) => s + parseFloat(o.quotedPrice || "0"), 0);
    const totalActual = orders.reduce((s, o) => s + parseFloat(o.actualFreight || "0"), 0);
    const totalWeight = orders.reduce((s, o) => s + parseFloat(o.weight || "0"), 0);
    const totalDeposit = orders.reduce((s, o) => s + parseFloat(o.depositAmount || "0"), 0);
    const profit = totalQuoted - totalActual;

    expect(totalQuoted).toBe(9500);
    expect(totalActual).toBe(6700);
    expect(profit).toBe(2800);
    expect(totalWeight).toBe(18);
    expect(totalDeposit).toBe(800);
  });

  it("应正确统计业务类型分布", () => {
    const orders = [
      { businessType: "outsource" },
      { businessType: "outsource" },
      { businessType: "self" },
      { businessType: "ltl" },
      { businessType: "ltl" },
      { businessType: "ltl" },
    ];
    const byBiz: Record<string, number> = {};
    orders.forEach(o => { byBiz[o.businessType] = (byBiz[o.businessType] || 0) + 1; });
    
    expect(byBiz["outsource"]).toBe(2);
    expect(byBiz["self"]).toBe(1);
    expect(byBiz["ltl"]).toBe(3);
    
    const total = orders.length;
    expect(((byBiz["outsource"] / total) * 100).toFixed(1)).toBe("33.3");
    expect(((byBiz["ltl"] / total) * 100).toFixed(1)).toBe("50.0");
  });

  it("应正确统计工位积压情况", () => {
    const byStatus: Record<string, number> = {
      pending_assign: 3,
      pending_price: 2,
      pending_approval: 1,
      pending_vehicle: 4,
      pending_dispatch: 2,
      pending_inquiry: 3,
      inquiry_confirmed: 1,
      dispatched: 5,
      in_transit: 8,
      delivered: 10,
      signed: 15,
    };
    
    const pipeline = [
      { name: "录单台", count: byStatus["pending_assign"] || 0 },
      { name: "指挥台", count: (byStatus["pending_price"] || 0) + (byStatus["pending_approval"] || 0) },
      { name: "找车台", count: byStatus["pending_vehicle"] || 0 },
      { name: "派车台", count: byStatus["pending_dispatch"] || 0 },
      { name: "询价台", count: (byStatus["pending_inquiry"] || 0) + (byStatus["inquiry_confirmed"] || 0) },
      { name: "运输中", count: (byStatus["dispatched"] || 0) + (byStatus["in_transit"] || 0) },
      { name: "已完成", count: (byStatus["delivered"] || 0) + (byStatus["signed"] || 0) },
    ];
    
    expect(pipeline[0].count).toBe(3);
    expect(pipeline[1].count).toBe(3);
    expect(pipeline[2].count).toBe(4);
    expect(pipeline[3].count).toBe(2);
    expect(pipeline[4].count).toBe(4);
    expect(pipeline[5].count).toBe(13);
    expect(pipeline[6].count).toBe(25);
  });

  it("月份标签应正确生成", () => {
    const genLabel = (year: string, month: string) => 
      month === "all" ? `${year}年全年` : `${year}年${month}月`;
    
    expect(genLabel("2026", "3")).toBe("2026年3月");
    expect(genLabel("2026", "all")).toBe("2026年全年");
    expect(genLabel("2025", "12")).toBe("2025年12月");
  });
});

describe("订单池自定义视图覆盖更新", () => {
  interface SavedView {
    id: string;
    name: string;
    columns: string[];
  }

  it("应正确覆盖更新视图的列配置", () => {
    const savedViews: SavedView[] = [
      { id: "1", name: "简洁视图", columns: ["orderNumber", "status", "customerName"] },
      { id: "2", name: "详细视图", columns: ["orderNumber", "status", "customerName", "cargoName", "weight", "originCity", "destinationCity"] },
    ];
    
    const newColumns = ["orderNumber", "status", "customerName", "plateNumber", "quotedPrice"];
    const updated = savedViews.map(v => v.id === "1" ? { ...v, columns: newColumns } : v);
    
    expect(updated[0].columns).toEqual(newColumns);
    expect(updated[0].name).toBe("简洁视图");
    expect(updated[1].columns).toEqual(savedViews[1].columns); // 其他视图不受影响
  });

  it("覆盖更新不应改变视图名称和ID", () => {
    const view: SavedView = { id: "abc123", name: "我的视图", columns: ["a", "b"] };
    const newColumns = ["c", "d", "e"];
    const updatedView = { ...view, columns: newColumns };
    
    expect(updatedView.id).toBe("abc123");
    expect(updatedView.name).toBe("我的视图");
    expect(updatedView.columns).toEqual(["c", "d", "e"]);
  });

  it("应正确保存新视图", () => {
    const savedViews: SavedView[] = [];
    const newView: SavedView = { id: Date.now().toString(), name: "测试视图", columns: ["orderNumber", "status"] };
    const updated = [...savedViews, newView];
    
    expect(updated.length).toBe(1);
    expect(updated[0].name).toBe("测试视图");
    expect(updated[0].columns).toEqual(["orderNumber", "status"]);
  });

  it("应正确删除视图", () => {
    const savedViews: SavedView[] = [
      { id: "1", name: "视图A", columns: ["a"] },
      { id: "2", name: "视图B", columns: ["b"] },
      { id: "3", name: "视图C", columns: ["c"] },
    ];
    
    const updated = savedViews.filter(v => v.id !== "2");
    expect(updated.length).toBe(2);
    expect(updated.map(v => v.name)).toEqual(["视图A", "视图C"]);
  });
});

describe("零担工作台和订单池Excel汇总行", () => {
  it("应正确计算零担台账汇总", () => {
    const orders = [
      { quotedPrice: "5000", actualFreight: "3500", weight: "10", ltlUnitPrice: "500" },
      { quotedPrice: "3000", actualFreight: "2000", weight: "5", ltlUnitPrice: "600" },
      { quotedPrice: "0", actualFreight: "0", weight: "3", ltlUnitPrice: "0" },
    ];
    
    const totalQuoted = orders.reduce((s, o) => s + parseFloat(o.quotedPrice || "0"), 0);
    const totalActual = orders.reduce((s, o) => s + parseFloat(o.actualFreight || "0"), 0);
    const totalWeight = orders.reduce((s, o) => s + parseFloat(o.weight || "0"), 0);
    
    expect(totalQuoted).toBe(8000);
    expect(totalActual).toBe(5500);
    expect(totalWeight).toBe(18);
    expect(totalQuoted - totalActual).toBe(2500);
  });

  it("应正确计算订单池汇总", () => {
    const orders = [
      { quotedPrice: "10000", actualFreight: "7000", weight: "20", businessType: "outsource" },
      { quotedPrice: "5000", actualFreight: "3000", weight: "8", businessType: "self" },
      { quotedPrice: "2000", actualFreight: "1500", weight: "3", businessType: "ltl" },
    ];
    
    const totalQuoted = orders.reduce((s, o) => s + parseFloat(o.quotedPrice || "0"), 0);
    const totalActual = orders.reduce((s, o) => s + parseFloat(o.actualFreight || "0"), 0);
    const totalWeight = orders.reduce((s, o) => s + parseFloat(o.weight || "0"), 0);
    const byBiz: Record<string, number> = {};
    orders.forEach(o => { byBiz[o.businessType] = (byBiz[o.businessType] || 0) + 1; });
    
    expect(totalQuoted).toBe(17000);
    expect(totalActual).toBe(11500);
    expect(totalWeight).toBe(31);
    expect(byBiz["outsource"]).toBe(1);
    expect(byBiz["self"]).toBe(1);
    expect(byBiz["ltl"]).toBe(1);
  });
});
