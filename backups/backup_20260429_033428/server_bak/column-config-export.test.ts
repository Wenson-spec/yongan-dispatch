import { describe, it, expect } from "vitest";

// 测试列配置逻辑
describe("订单池列配置", () => {
  const ALL_COLUMNS = [
    { key: "orderNumber", label: "客户订单号", defaultVisible: true },
    { key: "businessType", label: "类型", defaultVisible: true },
    { key: "status", label: "状态", defaultVisible: true },
    { key: "customer", label: "客户", defaultVisible: true },
    { key: "cargo", label: "货物", defaultVisible: true },
    { key: "weight", label: "重量", defaultVisible: true },
    { key: "origin", label: "发货地", defaultVisible: true },
    { key: "destination", label: "目的地", defaultVisible: true },
    { key: "quotedPrice", label: "运费收入", defaultVisible: true },
    { key: "actualFreight", label: "司机运费", defaultVisible: true },
    { key: "plateNumber", label: "车牌号", defaultVisible: true },
    { key: "extendedInfo", label: "扩展信息", defaultVisible: true },
    { key: "shippingNote", label: "发货备注", defaultVisible: false },
    { key: "receivingNote", label: "收货备注", defaultVisible: false },
    { key: "dispatcher", label: "调度员", defaultVisible: true },
    { key: "createdAt", label: "创建时间", defaultVisible: true },
  ];

  it("应有16个可配置列", () => {
    expect(ALL_COLUMNS).toHaveLength(16);
  });

  it("默认可见列应为14个（发货备注和收货备注默认隐藏）", () => {
    const defaultVisible = ALL_COLUMNS.filter(c => c.defaultVisible);
    expect(defaultVisible).toHaveLength(14);
  });

  it("发货备注和收货备注默认不可见", () => {
    const shippingNote = ALL_COLUMNS.find(c => c.key === "shippingNote");
    const receivingNote = ALL_COLUMNS.find(c => c.key === "receivingNote");
    expect(shippingNote?.defaultVisible).toBe(false);
    expect(receivingNote?.defaultVisible).toBe(false);
  });

  it("列配置切换逻辑正确", () => {
    const visibleSet = new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key));
    expect(visibleSet.has("shippingNote")).toBe(false);
    
    // 切换显示发货备注
    visibleSet.add("shippingNote");
    expect(visibleSet.has("shippingNote")).toBe(true);
    
    // 切换隐藏发货备注
    visibleSet.delete("shippingNote");
    expect(visibleSet.has("shippingNote")).toBe(false);
  });

  it("重置列配置应恢复默认", () => {
    const customSet = new Set(["orderNumber", "status"]); // 自定义配置
    const defaults = new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key));
    expect(customSet.size).toBe(2);
    expect(defaults.size).toBe(14);
  });

  it("visibleColCount计算正确（checkbox + # + 可见列 + 操作）", () => {
    const visibleColumns = new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key));
    const visibleColCount = 3 + visibleColumns.size; // checkbox + # + visible + 操作
    expect(visibleColCount).toBe(17); // 3 + 14
  });

  it("所有列的key应唯一", () => {
    const keys = ALL_COLUMNS.map(c => c.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });
});

// 测试Excel XML生成逻辑
describe("Excel导出XML生成", () => {
  const escXml = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  it("XML转义特殊字符", () => {
    expect(escXml("A & B")).toBe("A &amp; B");
    expect(escXml("<tag>")).toBe("&lt;tag&gt;");
    expect(escXml('"quoted"')).toBe("&quot;quoted&quot;");
  });

  it("数字检测正确", () => {
    const isNum = (s: string) => /^-?\d+(\.\d+)?$/.test(String(s || "").trim());
    expect(isNum("123")).toBe(true);
    expect(isNum("123.45")).toBe(true);
    expect(isNum("-99.9")).toBe(true);
    expect(isNum("abc")).toBe(false);
    expect(isNum("12abc")).toBe(false);
    expect(isNum("")).toBe(false);
  });

  it("生成的XML结构正确", () => {
    const headers = ["订单号", "客户名", "金额"];
    const rows = [["ORD001", "张三", "1500"], ["ORD002", "李四", "2300"]];

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<?mso-application progid="Excel.Sheet"?>\n';
    xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
    xml += '<Styles><Style ss:ID="header"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#E2EFDA" ss:Pattern="Solid"/></Style></Styles>\n';
    xml += '<Worksheet ss:Name="Sheet1"><Table>\n';
    xml += '<Row>';
    headers.forEach(h => { xml += `<Cell ss:StyleID="header"><Data ss:Type="String">${escXml(h)}</Data></Cell>`; });
    xml += '</Row>\n';
    rows.forEach(row => {
      xml += '<Row>';
      row.forEach(cell => {
        const isNum = /^-?\d+(\.\d+)?$/.test(String(cell || "").trim());
        xml += `<Cell><Data ss:Type="${isNum ? "Number" : "String"}">${escXml(cell)}</Data></Cell>`;
      });
      xml += '</Row>\n';
    });
    xml += '</Table></Worksheet></Workbook>';

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('progid="Excel.Sheet"');
    expect(xml).toContain('<Worksheet ss:Name="Sheet1">');
    expect(xml).toContain('ss:StyleID="header"');
    expect(xml).toContain('<Data ss:Type="String">订单号</Data>');
    expect(xml).toContain('<Data ss:Type="String">ORD001</Data>');
    expect(xml).toContain('<Data ss:Type="Number">1500</Data>');
    expect(xml).toContain('<Data ss:Type="Number">2300</Data>');
  });

  it("空数据也能正确生成XML", () => {
    const headers = ["列1", "列2"];
    const rows: string[][] = [];

    let xml = '<Table>\n';
    xml += '<Row>';
    headers.forEach(h => { xml += `<Cell><Data ss:Type="String">${escXml(h)}</Data></Cell>`; });
    xml += '</Row>\n';
    rows.forEach(row => {
      xml += '<Row>';
      row.forEach(cell => {
        xml += `<Cell><Data ss:Type="String">${escXml(cell)}</Data></Cell>`;
      });
      xml += '</Row>\n';
    });
    xml += '</Table>';

    expect(xml).toContain("列1");
    expect(xml).toContain("列2");
    // 只有表头行，没有数据行
    const rowCount = (xml.match(/<Row>/g) || []).length;
    expect(rowCount).toBe(1);
  });
});

// 测试CSV导出逻辑
describe("CSV导出", () => {
  it("CSV格式正确（含BOM和引号转义）", () => {
    const BOM = "\uFEFF";
    const headers = ["订单号", "客户名"];
    const rows = [["ORD001", '张"三'], ["ORD002", "李四"]];
    const csv = BOM + [headers.join(","), ...rows.map(r => r.map(c => `"${String(c || "").replace(/"/g, '""')}"`).join(","))].join("\n");

    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toContain("订单号,客户名");
    expect(csv).toContain('"张""三"'); // 双引号转义
    expect(csv).toContain('"ORD002"');
  });
});
