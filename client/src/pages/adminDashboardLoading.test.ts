import { describe, expect, it } from "vitest";
import { shouldShowAdminDashboardLoadingState } from "./adminDashboardLoading";

describe("shouldShowAdminDashboardLoadingState", () => {
  it("在订单与看板数据都尚未返回且至少一个请求仍在加载时显示加载态", () => {
    expect(shouldShowAdminDashboardLoadingState({
      orderDataReady: false,
      dashboardDataReady: false,
      isOrderLoading: true,
      isDashboardLoading: false,
    })).toBe(true);

    expect(shouldShowAdminDashboardLoadingState({
      orderDataReady: false,
      dashboardDataReady: false,
      isOrderLoading: false,
      isDashboardLoading: true,
    })).toBe(true);
  });

  it("任一核心数据已返回时不再显示误导性的首屏全零加载态", () => {
    expect(shouldShowAdminDashboardLoadingState({
      orderDataReady: true,
      dashboardDataReady: false,
      isOrderLoading: false,
      isDashboardLoading: true,
    })).toBe(false);

    expect(shouldShowAdminDashboardLoadingState({
      orderDataReady: false,
      dashboardDataReady: true,
      isOrderLoading: true,
      isDashboardLoading: false,
    })).toBe(false);
  });

  it("当请求都已结束时即使数据为空也不再停留在加载态", () => {
    expect(shouldShowAdminDashboardLoadingState({
      orderDataReady: false,
      dashboardDataReady: false,
      isOrderLoading: false,
      isDashboardLoading: false,
    })).toBe(false);
  });
});
