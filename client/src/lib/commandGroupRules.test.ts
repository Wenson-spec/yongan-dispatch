import {
  formatGroupDistinctLabel,
  getApprovalTypeLabel,
  getApprovalTypeLabelFromItem,
  getApprovalTypeSummary,
  getGroupCustomerSummary,
  getGroupRouteSummary,
  getGroupWarehouseSummary,
} from "./commandGroupRules";

describe("commandGroupRules approval type helpers", () => {
  it("可将审批类型值映射为中文标签", () => {
    expect(getApprovalTypeLabel("initial_price")).toBe("初始定价");
    expect(getApprovalTypeLabel("vehicle_quote")).toBe("车辆报价");
    expect(getApprovalTypeLabel("surcharge")).toBe("加价");
  });

  it("可从审批对象安全提取审批类型标签，避免把整条对象直接作为渲染文本", () => {
    expect(
      getApprovalTypeLabelFromItem({
        id: 9001,
        approvalType: "vehicle_quote",
        applicantName: "测试调度",
      }),
    ).toBe("车辆报价");

    expect(
      getApprovalTypeLabelFromItem({
        id: 9002,
      }),
    ).toBe("-");

    expect(getApprovalTypeLabelFromItem(null)).toBe("-");
  });

  it("可对审批对象数组生成稳定的审批类型摘要", () => {
    expect(
      getApprovalTypeSummary([
        { id: 1, approvalType: "vehicle_quote" },
        { id: 2, approvalType: "vehicle_quote" },
        { id: 3, approvalType: "surcharge" },
      ]),
    ).toBe("车辆报价 / 加价");
  });
});

describe("commandGroupRules grouped summaries", () => {
  const groupedOrders = [
    {
      id: 1,
      customerName: "建海-刘海潮",
      warehouseName: "江西丰城仓",
      originCity: "宜春",
      destinationCity: "南昌",
    },
    {
      id: 2,
      customerName: "常青藤-马伟强",
      warehouseName: "丰城大板仓",
      originCity: "宜春",
      destinationCity: "九江",
    },
  ];

  it("可按统一格式输出多客户或多仓摘要", () => {
    expect(formatGroupDistinctLabel(["建海-刘海潮", "常青藤-马伟强"], "客户")).toBe("建海-刘海潮 / 常青藤-马伟强（2客户）");
    expect(getGroupCustomerSummary(groupedOrders)).toBe("建海-刘海潮 / 常青藤-马伟强（2客户）");
    expect(getGroupWarehouseSummary(groupedOrders)).toBe("江西丰城仓 / 丰城大板仓（2仓）");
  });

  it("可为整组审批列表生成多目的地路线摘要", () => {
    expect(getGroupRouteSummary(groupedOrders)).toBe("宜春 → 南昌 / 九江（2地）");
  });
});
