import { describe, expect, it } from "vitest";
import {
  extractCityFromText,
  resolveDashboardRouteDestination,
  resolveDashboardRouteOrigin,
} from "./dashboardRoute.utils";

describe("dashboardRoute utils", () => {
  it("prefers stored originCity when it is available", () => {
    expect(resolveDashboardRouteOrigin({
      originCity: "西安市",
      originAddress: "陕西省咸阳市秦都区某园区",
      warehouseName: "咸阳北站仓库",
    })).toBe("西安市");
  });

  it("falls back to city extracted from originAddress when originCity is missing", () => {
    expect(resolveDashboardRouteOrigin({
      originCity: "",
      originAddress: "安徽省蚌埠市龙子湖区解放路88号",
    })).toBe("蚌埠市");
  });

  it("falls back to warehouseName and shippingNote when origin fields are missing", () => {
    expect(resolveDashboardRouteOrigin({
      warehouseName: "南京江宁仓库",
    })).toBe("南京");

    expect(resolveDashboardRouteOrigin({
      shippingNote: "泰州市发出，下午装车",
    })).toBe("泰州市");
  });

  it("resolves destination from destinationCity or deliveryAddress fallback", () => {
    expect(resolveDashboardRouteDestination({
      destinationCity: "郑州市",
      deliveryAddress: "河南省开封市龙亭区东京大道1号",
    })).toBe("郑州市");

    expect(resolveDashboardRouteDestination({
      destinationCity: "",
      deliveryAddress: "江苏省滁州市琅琊区某工业园",
    })).toBe("滁州市");
  });

  it("extractCityFromText keeps municipality names and long city prefixes intact", () => {
    expect(extractCityFromText("上海市浦东新区世纪大道100号")).toBe("上海市");
    expect(extractCityFromText("内蒙古自治区鄂尔多斯市东胜区铜川镇")).toBe("鄂尔多斯市");
  });

  it("returns question mark only when no route clues are available", () => {
    expect(resolveDashboardRouteOrigin({})).toBe("?");
    expect(resolveDashboardRouteDestination({ remarks: "未备注线路" })).toBe("?");
  });
});
