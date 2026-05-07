import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const readProjectFile = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf-8");

const dispatchVehicleSource = readProjectFile("client/src/pages/DispatchVehicle.tsx");

const entryStationSource = readProjectFile("client/src/pages/EntryStation.tsx");

const findVehicleSource = readProjectFile("client/src/pages/FindVehicle.tsx");

const commandCenterSource = readProjectFile("client/src/pages/CommandCenter.tsx");

const orderEditSource = readProjectFile("client/src/pages/OrderEdit.tsx");

const approvalRouterSource = readProjectFile("server/routers/approval.ts");

describe("页面流程闭环补强", () => {
  describe("自运派车台", () => {
    it("应提供运输中、待签收、已签收标签页", () => {
      expect(dispatchVehicleSource).toContain('TabsTrigger value="transit"');
      expect(dispatchVehicleSource).toContain('TabsTrigger value="delivered"');
      expect(dispatchVehicleSource).toContain('TabsTrigger value="signed"');
      expect(dispatchVehicleSource).toContain('运输中 {transitOrders.length}');
      expect(dispatchVehicleSource).toContain('待签收 {deliveredOrders.length}');
      expect(dispatchVehicleSource).toContain('已签收 {signedOrders.length}');
    });

    it("应展示完整运输节点时间摘要字段", () => {
      expect(dispatchVehicleSource).toContain('order.dispatchDate ? `派车 ${fmtDateTime(order.dispatchDate)}` : null');
      expect(dispatchVehicleSource).toContain('order.loadingDate ? `装货 ${fmtDateTime(order.loadingDate)}` : null');
      expect(dispatchVehicleSource).toContain('order.transitDate ? `发运 ${fmtDateTime(order.transitDate)}` : null');
      expect(dispatchVehicleSource).toContain('order.deliveryDate ? `送达 ${fmtDateTime(order.deliveryDate)}` : null');
      expect(dispatchVehicleSource).toContain('order.signedDate ? `签收 ${fmtDateTime(order.signedDate)}` : null');
    });

    it("应支持送达与签收的单条和整组推进", () => {
      expect(dispatchVehicleSource).toContain('handleGroupStatusUpdate(group, "delivered")');
      expect(dispatchVehicleSource).toContain('handleGroupStatusUpdate(group, "signed")');
      expect(dispatchVehicleSource).toContain('updateStatus.mutate({ id: order.id, status: "delivered" })');
      expect(dispatchVehicleSource).toContain('updateStatus.mutate({ id: order.id, status: "signed" })');
      expect(dispatchVehicleSource).toContain('已完成签收');
    });

    it("在状态变更后应刷新全部相关列表", () => {
      expect(dispatchVehicleSource.match(/refetchPending\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
      expect(dispatchVehicleSource.match(/refetchDispatched\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
      expect(dispatchVehicleSource.match(/refetchTransit\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
      expect(dispatchVehicleSource.match(/refetchDelivered\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
      expect(dispatchVehicleSource.match(/refetchSigned\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    });
  });

  describe("录单台", () => {
    it("查看详情入口应替换为真实页面跳转", () => {
      expect(entryStationSource).toContain('setLocation(`/orders/edit/${order.id}?from=/station/entry&view=detail`)');
      expect(entryStationSource).not.toContain('toast.info("功能开发中")');
    });
  });

  describe("找车台", () => {
    it("确认派车分组子行应保留组合单子订单预览入口", () => {
      expect(findVehicleSource).toContain('跟随当前分组/车次整组操作');
      expect(findVehicleSource).toContain('<div><span className="text-muted-foreground pl-2">└</span> {order.orderNumber || order.systemCode}</div>');
      expect(findVehicleSource).toContain('{renderOutsourceSuborderPreview(order)}');
    });

    it("待审批详情应接入共享审批沟通组件并映射动态子单基础字段", () => {
      expect(findVehicleSource).toContain('<ApprovalHistory');
      expect(findVehicleSource).toContain('orderId={itemOrderId}');
      expect(findVehicleSource).toContain('childOrderRefs={isGroupSummary ? summarySourceItems.map((currentItem) => ({');
      expect(findVehicleSource).toContain('referencePrice: currentItem.dispatchPrice ?? currentItem.quotedPrice ?? currentItem.actualFreight ?? null,');
      expect(findVehicleSource).toContain('warehouseName: currentItem.warehouseName ?? null,');
      expect(findVehicleSource).toContain('weight: currentItem.weight ?? currentItem.loadingWeight ?? null,');
    });

    it("待审批组合主单详情应按新三段式结构展示补充明细并移除重复说明", () => {
      expect(findVehicleSource).toContain('第一层 · 组合主单摘要');
      expect(findVehicleSource).toContain('客户');
      expect(findVehicleSource).toContain('货物简称');
      expect(findVehicleSource).toContain('发货仓库');
      expect(findVehicleSource).toContain('收货地址');
      expect(findVehicleSource).toContain('重量');
      expect(findVehicleSource).toContain('收货备注');
      expect(findVehicleSource).toContain('发货备注');
      expect(findVehicleSource).not.toContain('第二层 · 补充说明');
      expect(findVehicleSource).not.toContain('主单号');
      expect(findVehicleSource).not.toContain('主单承接审批');
      expect(findVehicleSource).not.toContain('应收运费金额');
      expect(findVehicleSource).not.toContain('定价金额');
      expect(findVehicleSource).not.toContain('申请金额');
      expect(findVehicleSource).not.toContain('当前组合待审批申请总额');
      expect(findVehicleSource).not.toContain('展开后查看');
      expect(findVehicleSource).not.toContain('第一层 · 主单基本信息');
      expect(findVehicleSource).not.toContain('第二层 · 主单决策卡');
      expect(findVehicleSource).not.toContain('第四层 · 两个子单基本信息');
    });

    it("待审批列表应将收货备注前移到审批重点，并将收入运费并入价格决策区域", () => {
      expect(findVehicleSource).toContain('const receivingSummary = summarizeApprovalTextList(');
      expect(findVehicleSource).toContain('items.map((currentItem) => getApprovalReceivingSummary(currentItem))');
      expect(findVehicleSource).toContain('text-[10px] font-medium text-orange-700">收货备注');
      expect(findVehicleSource).toContain('function getApprovalIncomeFreightValue(items: any[])');
      expect(findVehicleSource).toContain('{isGroupPrice ? "整组收入运费" : "收入运费"}');
      expect(findVehicleSource).toContain('font-semibold text-emerald-700">{totalIncomeFreightValue > 0 ? formatMoney(String(totalIncomeFreightValue)) : "-"}');
    });

    it("回单处理页签中的原件流转操作应仅允许当前回单责任单执行，并等待真实提交结果后反馈", () => {
      expect(findVehicleSource).toContain('const getOrderPodBusinessStatus = (order: any) => order?.podEffectiveStatus || "none";');
      expect(findVehicleSource).toContain('const isCurrentOrderPodOwner = (order: any) => getOrderPodOwnership(order) === "current_order";');
      expect(findVehicleSource).toContain('&& (businessStatus === "none" || businessStatus === "uploaded");');
      expect(findVehicleSource).toContain('const eligibleOrders = candidates.filter(canMarkPodAsSent);');
      expect(findVehicleSource).toContain('markPodSent.mutateAsync({ orderId: order.id })');
      expect(findVehicleSource).toContain('cancelPodSent.mutateAsync({ orderId: order.id })');
      expect(findVehicleSource).toContain('Promise.allSettled(');
      expect(findVehicleSource).toContain('请在负责回单原件流转的订单上操作');
      expect(findVehicleSource).not.toContain('order?.podStatus || "none"');
    });
  });

  describe("指挥台", () => {
    it("待审批详情应与找车台一致接入共享审批沟通组件并映射动态子单基础字段", () => {
      expect(commandCenterSource).toContain('<ApprovalHistory');
      expect(commandCenterSource).toContain('orderId={itemOrderId}');
      expect(commandCenterSource).toContain('childOrderRefs={isGroupSummary ? summarySourceItems.map((currentItem) => ({');
      expect(commandCenterSource).toContain('referencePrice: currentItem.dispatchPrice ?? currentItem.quotedPrice ?? currentItem.actualFreight ?? null,');
      expect(commandCenterSource).toContain('warehouseName: currentItem.warehouseName ?? null,');
      expect(commandCenterSource).toContain('weight: currentItem.weight ?? currentItem.loadingWeight ?? null,');
    });

    it("待审批组合主单详情应与找车台一致展示新三段式补充明细并移除重复说明", () => {
      expect(commandCenterSource).toContain('第一层 · 组合主单摘要');
      expect(commandCenterSource).toContain('客户');
      expect(commandCenterSource).toContain('货物简称');
      expect(commandCenterSource).toContain('发货仓库');
      expect(commandCenterSource).toContain('收货地址');
      expect(commandCenterSource).toContain('重量');
      expect(commandCenterSource).toContain('收货备注');
      expect(commandCenterSource).toContain('发货备注');
      expect(commandCenterSource).not.toContain('第二层 · 补充说明');
      expect(commandCenterSource).not.toContain('主单号');
      expect(commandCenterSource).not.toContain('主单承接审批');
      expect(commandCenterSource).not.toContain('应收运费金额');
      expect(commandCenterSource).not.toContain('定价金额');
      expect(commandCenterSource).not.toContain('申请金额');
      expect(commandCenterSource).not.toContain('当前组合待审批申请总额');
      expect(commandCenterSource).not.toContain('展开后查看');
      expect(commandCenterSource).not.toContain('第一层 · 主单基本信息');
      expect(commandCenterSource).not.toContain('第二层 · 主单决策卡');
      expect(commandCenterSource).not.toContain('第四层 · 两个子单基本信息');
    });

    it("待审批列表应将收货备注前移到审批重点，并将收入运费并入价格决策区域", () => {
      expect(commandCenterSource).toContain('const receivingSummary = summarizeApprovalTextList(');
      expect(commandCenterSource).toContain('items.map((currentItem) => getApprovalReceivingSummary(currentItem))');
      expect(commandCenterSource).toContain('text-[10px] font-medium text-orange-700">收货备注');
      expect(commandCenterSource).toContain('function getApprovalIncomeFreightValue(items: any[])');
      expect(commandCenterSource).toContain('{isGroupPrice ? "整组收入运费" : "收入运费"}');
      expect(commandCenterSource).toContain('font-semibold text-emerald-700">{totalIncomeFreightValue > 0 ? formatMoney(String(totalIncomeFreightValue)) : "-"}');
    });
  });

  describe("订单编辑页", () => {
    it("合并子订单应锁定业务类型，仅允许主订单统一修改", () => {
      expect(orderEditSource).toContain('if (isMergedChildOrder) {');
      expect(orderEditSource).toContain('当前是合并订单的子订单（指引单），业务类型只能在主订单统一修改，子订单不允许单独调整。');
      expect(orderEditSource).toContain('主订单修改业务类型后，会同步更新同一合并计划号下的子订单。');
    });
  });

  describe("审批列表字段映射", () => {
    it("待审批接口应返回第一层摘要所需的备注与运费收入字段", () => {
      expect(approvalRouterSource).toContain('shippingNote: orders.shippingNote,');
      expect(approvalRouterSource).toContain('receivingNote: orders.receivingNote,');
      expect(approvalRouterSource).toContain('receivingStatus: orders.receivingStatus,');
      expect(approvalRouterSource).toContain('expectedReceiveAt: orders.expectedReceiveAt,');
      expect(approvalRouterSource).toContain('nextFollowUpAt: orders.nextFollowUpAt,');
      expect(approvalRouterSource).toContain('receivingReason: orders.receivingReason,');
      expect(approvalRouterSource).toContain('customerPrice: orders.customerPrice,');
      expect(approvalRouterSource).toContain('quotedPrice: orders.quotedPrice,');
    });
  });
});
