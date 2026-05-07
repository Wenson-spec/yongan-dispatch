import { describe, expect, it } from "vitest";
import {
  buildLtlSubchainCreatePath,
  parseLtlSubchainSearch,
} from "./ltlSubchainPrefill";

describe("ltlSubchainPrefill", () => {
  it("buildLtlSubchainCreatePath encodes main-order seed for pickup outsource subchain", () => {
    const path = buildLtlSubchainCreatePath(
      {
        id: 42,
        systemCode: "SYS-001",
        orderNumber: "YA-2026-001",
        customerName: "永安客户",
        customerPhone: "13800138000",
        settlementType: "cash",
        cargoName: "钢卷",
        weight: 18.6,
        originCity: "西安",
        destinationCity: "郑州",
        deliveryAddress: "西安灞桥货场",
        receiverName: "张三",
        receiverPhone: "13900139000",
        mergedPlanNumber: "MP-001",
        department: "零担事业部",
      },
      "pickup",
      "/station/ltl-workspace?tab=pending",
    );

    const url = new URL(path, "https://example.com");

    expect(url.pathname).toBe("/orders/create");
    expect(url.searchParams.get("subchain")).toBe("ltl_outsource");
    expect(url.searchParams.get("stage")).toBe("pickup");
    expect(url.searchParams.get("parentId")).toBe("42");
    expect(url.searchParams.get("parentSystemCode")).toBe("SYS-001");
    expect(url.searchParams.get("parentOrderNumber")).toBe("YA-2026-001");
    expect(url.searchParams.get("returnPath")).toBe("/station/ltl-workspace?tab=pending");
    expect(url.searchParams.get("customerName")).toBe("永安客户");
    expect(url.searchParams.get("weight")).toBe("18.6");
  });

  it("parseLtlSubchainSearch returns pickup defaults and helper copy for main-order sourced prefill", () => {
    const parsed = parseLtlSubchainSearch(
      "?mode=manual&subchain=ltl_outsource&stage=pickup&parentId=42&parentSystemCode=SYS-001&parentOrderNumber=YA-2026-001&customerName=永安客户&customerPhone=13800138000&settlementType=cash&cargoName=钢卷&weight=18.6&originCity=西安&destinationCity=郑州&deliveryAddress=西安灞桥货场&receiverName=张三&receiverPhone=13900139000&mergedPlanNumber=MP-001&department=零担事业部&returnPath=%2Fstation%2Fltl-workspace",
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.stage).toBe("pickup");
    expect(parsed?.stageLabel).toBe("前段外请车");
    expect(parsed?.sourceLabel).toBe("SYS-001");
    expect(parsed?.parentId).toBe(42);
    expect(parsed?.returnPath).toBe("/station/ltl-workspace");
    expect(parsed?.helperText).toContain("前段外请子链");
    expect(parsed?.queueHint).toContain("接入货站");
    expect(parsed?.defaults).toMatchObject({
      businessType: "outsource",
      orderNumber: "YA-2026-001-前段外请",
      customerName: "永安客户",
      settlementType: "cash",
      cargoName: "钢卷",
      weight: "18.6",
      originCity: "西安",
      destinationCity: "郑州",
      deliveryAddress: "西安灞桥货场",
      receiverName: "张三",
      receiverPhone: "13900139000",
      mergedPlanNumber: "MP-001",
      department: "零担事业部",
    });
    expect(parsed?.defaults.remarks).toContain("【零担前段外请子链】");
    expect(parsed?.defaults.remarks).toContain("来源主单：SYS-001");
    expect(parsed?.defaults.shippingNote).toContain("零担主链前段外请");
  });

  it("parseLtlSubchainSearch falls back to monthly settlement and generated delivery label when parent code is absent", () => {
    const parsed = parseLtlSubchainSearch(
      "?subchain=ltl_outsource&stage=delivery&parentId=99&destinationCity=宝鸡&receiverName=李四",
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.stage).toBe("delivery");
    expect(parsed?.stageLabel).toBe("后段外请车");
    expect(parsed?.sourceLabel).toBe("主单ID 99");
    expect(parsed?.defaults.settlementType).toBe("monthly");
    expect(parsed?.defaults.orderNumber).toBe("LTL-99-后段外请");
    expect(parsed?.defaults.destinationCity).toBe("宝鸡");
    expect(parsed?.defaults.receiverName).toBe("李四");
    expect(parsed?.defaults.remarks).toContain("【零担后段外请子链】");
    expect(parsed?.defaults.shippingNote).toContain("零担主链后段外请");
    expect(parsed?.helperText).toContain("后段外请子链");
  });

  it("buildLtlSubchainCreatePath encodes combined-load pickup outsource params for multiple main orders", () => {
    const path = buildLtlSubchainCreatePath(
      [
        {
          id: 11,
          systemCode: "SYS-011",
          orderNumber: "YA-2026-011",
          customerName: "客户甲",
          customerPhone: "13800000011",
          settlementType: "monthly",
          cargoName: "钢卷",
          weight: 10.5,
          originCity: "西安",
          destinationCity: "郑州",
          deliveryAddress: "西安港务区1号库",
          receiverName: "张三",
          receiverPhone: "13900000011",
          department: "零担事业部",
        },
        {
          id: 12,
          systemCode: "SYS-012",
          orderNumber: "YA-2026-012",
          customerName: "客户乙",
          customerPhone: "13800000012",
          settlementType: "monthly",
          cargoName: "铝材",
          weight: "8.25",
          originCity: "西安",
          destinationCity: "郑州",
          deliveryAddress: "西安港务区2号库",
          receiverName: "李四",
          receiverPhone: "13900000012",
          department: "零担事业部",
        },
        {
          id: 13,
          systemCode: "SYS-013",
          orderNumber: "YA-2026-013",
          customerName: "客户丙",
          customerPhone: "13800000013",
          settlementType: "monthly",
          cargoName: "钢卷",
          weight: 6,
          originCity: "咸阳",
          destinationCity: "洛阳",
          deliveryAddress: "咸阳货场",
          receiverName: "王五",
          receiverPhone: "13900000013",
          department: "零担事业部",
        },
      ],
      "pickup",
      "/station/ltl-workspace?tab=pending",
    );

    const url = new URL(path, "https://example.com");

    expect(url.searchParams.get("parentId")).toBe("11");
    expect(url.searchParams.get("parentIds")).toBe("11,12,13");
    expect(url.searchParams.get("sourceCount")).toBe("3");
    expect(url.searchParams.get("sourceOrderNumbers")).toBe("YA-2026-011||YA-2026-012||YA-2026-013");
    expect(url.searchParams.get("customerName")).toBe("客户甲 / 客户乙 / 客户丙");
    expect(url.searchParams.get("cargoName")).toBe("钢卷、铝材");
    expect(url.searchParams.get("weight")).toBe("24.75");
    expect(url.searchParams.get("originCity")).toBe("西安 / 咸阳");
    expect(url.searchParams.get("destinationCity")).toBe("郑州 / 洛阳");
    expect(url.searchParams.get("sourceLabel")).toContain("3个零担主单合车");
  });

  it("parseLtlSubchainSearch returns combined-load pickup copy and defaults for multiple parent orders", () => {
    const path = buildLtlSubchainCreatePath(
      [
        {
          id: 11,
          systemCode: "SYS-011",
          orderNumber: "YA-2026-011",
          customerName: "客户甲",
          settlementType: "monthly",
          cargoName: "钢卷",
          weight: 10.5,
          originCity: "西安",
          destinationCity: "郑州",
          deliveryAddress: "西安港务区1号库",
          receiverName: "张三",
          receiverPhone: "13900000011",
          department: "零担事业部",
        },
        {
          id: 12,
          systemCode: "SYS-012",
          orderNumber: "YA-2026-012",
          customerName: "客户乙",
          settlementType: "monthly",
          cargoName: "铝材",
          weight: 8.25,
          originCity: "西安",
          destinationCity: "郑州",
          deliveryAddress: "西安港务区2号库",
          receiverName: "李四",
          receiverPhone: "13900000012",
          department: "零担事业部",
        },
        {
          id: 13,
          systemCode: "SYS-013",
          orderNumber: "YA-2026-013",
          customerName: "客户丙",
          settlementType: "monthly",
          cargoName: "钢卷",
          weight: 6,
          originCity: "咸阳",
          destinationCity: "洛阳",
          deliveryAddress: "咸阳货场",
          receiverName: "王五",
          receiverPhone: "13900000013",
          department: "零担事业部",
        },
      ],
      "pickup",
      "/station/ltl-workspace?tab=pending",
    );

    const parsed = parseLtlSubchainSearch(new URL(path, "https://example.com").search);

    expect(parsed).not.toBeNull();
    expect(parsed?.stage).toBe("pickup");
    expect(parsed?.isCombinedLoad).toBe(true);
    expect(parsed?.sourceCount).toBe(3);
    expect(parsed?.parentId).toBe(11);
    expect(parsed?.parentIds).toEqual([11, 12, 13]);
    expect(parsed?.sourceOrders).toHaveLength(3);
    expect(parsed?.sourceLabel).toContain("3个零担主单合车");
    expect(parsed?.returnPath).toBe("/station/ltl-workspace?tab=pending");
    expect(parsed?.helperText).toContain("多个零担主单合并为同一条前段外请子链");
    expect(parsed?.queueHint).toContain("吨位汇总");
    expect(parsed?.defaults).toMatchObject({
      businessType: "outsource",
      orderNumber: "YA-2026-011等3单-前段外请",
      customerName: "客户甲 / 客户乙 / 客户丙",
      settlementType: "monthly",
      cargoName: "钢卷、铝材",
      weight: "24.75",
      originCity: "西安 / 咸阳",
      destinationCity: "郑州 / 洛阳",
      department: "零担事业部",
    });
    expect(parsed?.defaults.remarks).toContain("【关联主单IDs】11,12,13");
    expect(parsed?.defaults.remarks).toContain("合车主单：YA-2026-011、YA-2026-012、YA-2026-013");
    expect(parsed?.defaults.shippingNote).toContain("本次为3单合车处理");
  });

  it("parseLtlSubchainSearch returns combined-load delivery copy and defaults for multiple parent orders", () => {
    const path = buildLtlSubchainCreatePath(
      [
        {
          id: 21,
          systemCode: "SYS-021",
          orderNumber: "YA-2026-021",
          customerName: "客户甲",
          settlementType: "monthly",
          cargoName: "钢卷",
          weight: 12.5,
          originCity: "西安",
          destinationCity: "宝鸡",
          deliveryAddress: "宝鸡陈仓仓库",
          receiverName: "赵六",
          receiverPhone: "13900000021",
          department: "零担事业部",
        },
        {
          id: 22,
          systemCode: "SYS-022",
          orderNumber: "YA-2026-022",
          customerName: "客户乙",
          settlementType: "monthly",
          cargoName: "铝材",
          weight: 7.2,
          originCity: "西安",
          destinationCity: "宝鸡",
          deliveryAddress: "宝鸡高新仓",
          receiverName: "孙七",
          receiverPhone: "13900000022",
          department: "零担事业部",
        },
      ],
      "delivery",
      "/station/ltl-workspace?tab=active",
    );

    const parsed = parseLtlSubchainSearch(new URL(path, "https://example.com").search);

    expect(parsed).not.toBeNull();
    expect(parsed?.stage).toBe("delivery");
    expect(parsed?.stageLabel).toBe("后段外请车");
    expect(parsed?.isCombinedLoad).toBe(true);
    expect(parsed?.sourceCount).toBe(2);
    expect(parsed?.parentIds).toEqual([21, 22]);
    expect(parsed?.returnPath).toBe("/station/ltl-workspace?tab=active");
    expect(parsed?.sourceLabel).toContain("2个零担主单合车");
    expect(parsed?.helperText).toContain("多个零担主单合并为同一条后段外请子链");
    expect(parsed?.queueHint).toContain("统一询价与派车");
    expect(parsed?.defaults).toMatchObject({
      businessType: "outsource",
      orderNumber: "YA-2026-021等2单-后段外请",
      customerName: "客户甲 / 客户乙",
      cargoName: "钢卷、铝材",
      weight: "19.7",
      destinationCity: "宝鸡",
      department: "零担事业部",
    });
    expect(parsed?.defaults.remarks).toContain("【零担后段外请子链】");
    expect(parsed?.defaults.remarks).toContain("【关联主单IDs】21,22");
    expect(parsed?.defaults.shippingNote).toContain("零担主链后段外请");
    expect(parsed?.defaults.shippingNote).toContain("本次为2单合车处理");
  });

  it("5 单到广州货站后应支持分别生成后段配送子链创建入口", () => {
    const stationOrders = [
      { id: 501, orderNumber: "LTL-GZ-001", destinationCity: "广州市白云区", weight: "0.8", packageCount: "10", customerName: "客户A" },
      { id: 502, orderNumber: "LTL-GZ-002", destinationCity: "广州市天河区", weight: "1.2", packageCount: "12", customerName: "客户B" },
      { id: 503, orderNumber: "LTL-GZ-003", destinationCity: "佛山市南海区", weight: "0.6", packageCount: "8", customerName: "客户C" },
      { id: 504, orderNumber: "LTL-GZ-004", destinationCity: "中山市小榄镇", weight: "0.9", packageCount: "9", customerName: "客户D" },
      { id: 505, orderNumber: "LTL-GZ-005", destinationCity: "江门市蓬江区", weight: "1.1", packageCount: "11", customerName: "客户E" },
    ];

    const paths = stationOrders.map((order) => buildLtlSubchainCreatePath(order, "delivery"));

    expect(new Set(paths).size).toBe(5);
    stationOrders.forEach((order, index) => {
      const path = paths[index] || "";
      const url = new URL(path, "https://example.com");
      expect(url.pathname).toBe("/orders/create");
      expect(url.searchParams.get("subchain")).toBe("ltl_outsource");
      expect(url.searchParams.get("stage")).toBe("delivery");
      expect(url.searchParams.get("parentId")).toBe(String(order.id));
      expect(url.searchParams.get("destinationCity")).toBe(order.destinationCity);
      expect(url.searchParams.get("weight")).toBe(order.weight);
      expect(url.searchParams.get("parentOrderNumber")).toBe(order.orderNumber);
    });
  });

  it("parseLtlSubchainSearch ignores unrelated or invalid search params", () => {
    expect(parseLtlSubchainSearch("?stage=pickup")).toBeNull();
    expect(parseLtlSubchainSearch("?subchain=ltl_outsource&stage=unknown")).toBeNull();
  });
});
