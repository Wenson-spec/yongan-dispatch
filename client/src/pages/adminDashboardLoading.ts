export type AdminDashboardLoadingStateInput = {
  orderDataReady: boolean;
  dashboardDataReady: boolean;
  isOrderLoading: boolean;
  isDashboardLoading: boolean;
};

export function shouldShowAdminDashboardLoadingState(
  input: AdminDashboardLoadingStateInput,
): boolean {
  return (
    !input.orderDataReady
    && !input.dashboardDataReady
    && (input.isOrderLoading || input.isDashboardLoading)
  );
}
