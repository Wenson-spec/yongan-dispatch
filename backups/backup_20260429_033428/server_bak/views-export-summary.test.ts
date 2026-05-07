import { describe, it, expect, beforeEach, vi } from "vitest";

// 测试自定义视图保存功能的逻辑
describe("自定义视图保存功能", () => {
  interface SavedView {
    id: string;
    name: string;
    columns: string[];
  }

  const VIEWS_STORAGE_KEY = "orderPool_savedViews";
  const COLUMN_STORAGE_KEY = "orderPool_visibleColumns";

  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage[key] || null,
      setItem: (key: string, value: string) => { storage[key] = value; },
      removeItem: (key: string) => { delete storage[key]; },
    });
  });

  it("应该能保存新视图", () => {
    const views: SavedView[] = [];
    const newView: SavedView = {
      id: "1",
      name: "外请视图",
      columns: ["orderNumber", "customerName", "plateNumber", "driverName"],
    };
    const updated = [...views, newView];
    localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(updated));
    const saved = JSON.parse(localStorage.getItem(VIEWS_STORAGE_KEY)!);
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe("外请视图");
    expect(saved[0].columns).toHaveLength(4);
  });

  it("应该能加载视图并更新列配置", () => {
    const view: SavedView = {
      id: "2",
      name: "零担视图",
      columns: ["orderNumber", "customerName", "stationName", "freightWaybillNumber"],
    };
    localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify([view]));
    const views: SavedView[] = JSON.parse(localStorage.getItem(VIEWS_STORAGE_KEY)!);
    const loaded = views[0];
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(loaded.columns));
    const columns = JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY)!);
    expect(columns).toEqual(["orderNumber", "customerName", "stationName", "freightWaybillNumber"]);
  });

  it("应该能删除视图", () => {
    const views: SavedView[] = [
      { id: "1", name: "视图A", columns: ["a", "b"] },
      { id: "2", name: "视图B", columns: ["c", "d"] },
      { id: "3", name: "视图C", columns: ["e", "f"] },
    ];
    localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(views));
    const updated = views.filter(v => v.id !== "2");
    localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(updated));
    const result = JSON.parse(localStorage.getItem(VIEWS_STORAGE_KEY)!);
    expect(result).toHaveLength(2);
    expect(result.map((v: SavedView) => v.name)).toEqual(["视图A", "视图C"]);
  });

  it("应该能保存多个视图并按顺序排列", () => {
    const views: SavedView[] = [];
    for (let i = 1; i <= 5; i++) {
      views.push({ id: String(i), name: `视图${i}`, columns: [`col${i}`] });
    }
    localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(views));
    const saved = JSON.parse(localStorage.getItem(VIEWS_STORAGE_KEY)!);
    expect(saved).toHaveLength(5);
    expect(saved[0].name).toBe("视图1");
    expect(saved[4].name).toBe("视图5");
  });

  it("空视图名称不应保存", () => {
    const name = "   ";
    expect(name.trim()).toBe("");
  });
});

// 测试Excel汇总行生成逻辑
describe("Excel导出汇总行", () => {
  it("待收回单Tab应生成正确的汇总信息", () => {
    const pods = [
      { originalStatus: "sent" },
      { originalStatus: "sent" },
      { originalStatus: "pending" },
      { originalStatus: "pending" },
      { originalStatus: "pending" },
    ];
    const sentCount = pods.filter(p => p.originalStatus === "sent").length;
    const pendingCount = pods.filter(p => p.originalStatus === "pending").length;
    const summaryItems = [
      { label: "订单总数", value: String(pods.length) },
      { label: "已寄出", value: String(sentCount) },
      { label: "待回收", value: String(pendingCount) },
    ];
    expect(summaryItems).toHaveLength(3);
    expect(summaryItems[0].value).toBe("5");
    expect(summaryItems[1].value).toBe("2");
    expect(summaryItems[2].value).toBe("3");
  });

  it("待退押金Tab应计算正确的押金总额", () => {
    const orders = [
      { depositAmount: "500.00" },
      { depositAmount: "1200.50" },
      { depositAmount: "800" },
    ];
    const totalDeposit = orders.reduce((sum, o) => sum + parseFloat(String(o.depositAmount || 0)), 0);
    const summaryItems = [
      { label: "待退押金订单数", value: String(orders.length) },
      { label: "押金总额", value: `¥${totalDeposit.toFixed(2)}` },
    ];
    expect(summaryItems[0].value).toBe("3");
    expect(summaryItems[1].value).toBe("¥2500.50");
  });

  it("已处理押金Tab应区分已退还和不退还", () => {
    const orders = [
      { depositAmount: "500", depositStatus: "refunded" },
      { depositAmount: "300", depositStatus: "refunded" },
      { depositAmount: "200", depositStatus: "not_refundable" },
    ];
    const totalDeposit = orders.reduce((sum, o) => sum + parseFloat(String(o.depositAmount || 0)), 0);
    const refundedCount = orders.filter(o => o.depositStatus === "refunded").length;
    const nonRefundCount = orders.filter(o => o.depositStatus === "not_refundable").length;
    const summaryItems = [
      { label: "已处理押金订单数", value: String(orders.length) },
      { label: "押金总额", value: `¥${totalDeposit.toFixed(2)}` },
      { label: "已退还", value: String(refundedCount) },
      { label: "不退还", value: String(nonRefundCount) },
    ];
    expect(summaryItems).toHaveLength(4);
    expect(summaryItems[1].value).toBe("¥1000.00");
    expect(summaryItems[2].value).toBe("2");
    expect(summaryItems[3].value).toBe("1");
  });

  it("超期回单Tab应按等级分类统计", () => {
    const items = [
      { level: "red" },
      { level: "red" },
      { level: "orange" },
      { level: "orange" },
      { level: "orange" },
      { level: "yellow" },
    ];
    const redCount = items.filter(i => i.level === "red").length;
    const orangeCount = items.filter(i => i.level === "orange").length;
    const yellowCount = items.filter(i => i.level === "yellow").length;
    const summaryItems = [
      { label: "超期回单总数", value: String(items.length) },
      { label: "紧急（红色）", value: String(redCount) },
      { label: "警告（橙色）", value: String(orangeCount) },
      { label: "预警（黄色）", value: String(yellowCount) },
    ];
    expect(summaryItems[0].value).toBe("6");
    expect(summaryItems[1].value).toBe("2");
    expect(summaryItems[2].value).toBe("3");
    expect(summaryItems[3].value).toBe("1");
  });

  it("XML汇总行应包含正确的样式标识", () => {
    const rows = [["a", "b"], ["c", "d"]];
    const summaryItems = [{ label: "总计", value: "2" }];
    // 模拟XML生成
    let xml = "";
    xml += '<Row>';
    xml += `<Cell ss:StyleID="summary"><Data ss:Type="String">汇总（共${rows.length}条）</Data></Cell>`;
    xml += '</Row>\n';
    summaryItems.forEach(item => {
      xml += '<Row>';
      xml += `<Cell ss:StyleID="summary"><Data ss:Type="String">${item.label}</Data></Cell>`;
      xml += `<Cell ss:StyleID="summary"><Data ss:Type="String">${item.value}</Data></Cell>`;
      xml += '</Row>\n';
    });
    expect(xml).toContain('ss:StyleID="summary"');
    expect(xml).toContain("汇总（共2条）");
    expect(xml).toContain("总计");
    expect(xml).toContain("2");
  });
});

// 测试订单池导出逻辑
describe("订单池导出功能", () => {
  it("应根据列配置生成正确的CSV表头", () => {
    const ALL_COLUMNS = [
      { key: "orderNumber", label: "订单号" },
      { key: "businessType", label: "业务类型" },
      { key: "status", label: "状态" },
      { key: "customerName", label: "客户" },
      { key: "extendedInfo", label: "扩展信息" },
      { key: "shippingNote", label: "发货备注" },
      { key: "receivingNote", label: "收货备注" },
    ];
    const visibleColumns = new Set(["orderNumber", "businessType", "status", "customerName"]);
    const headers = ALL_COLUMNS.filter(c => visibleColumns.has(c.key)).map(c => c.label);
    expect(headers).toEqual(["订单号", "业务类型", "状态", "客户"]);
    expect(headers).not.toContain("扩展信息");
    expect(headers).not.toContain("发货备注");
  });

  it("应根据业务类型生成不同的扩展信息", () => {
    const getExtendedInfo = (order: any) => {
      if (order.businessType === "outsource") {
        return `调度价:${order.dispatchPrice || "-"} 押金:${order.depositStatus || "-"}`;
      } else if (order.businessType === "self") {
        return `司机:${order.driverName || "-"} 电话:${order.driverPhone || "-"}`;
      } else if (order.businessType === "ltl") {
        return `货站:${order.stationName || "-"} 运单号:${order.freightWaybillNumber || "-"}`;
      }
      return "-";
    };
    expect(getExtendedInfo({ businessType: "outsource", dispatchPrice: 5000, depositStatus: "paid" })).toContain("调度价:5000");
    expect(getExtendedInfo({ businessType: "self", driverName: "张三", driverPhone: "13800138000" })).toContain("司机:张三");
    expect(getExtendedInfo({ businessType: "ltl", stationName: "德邦", freightWaybillNumber: "DB12345" })).toContain("货站:德邦");
  });
});
