import { describe, expect, it } from "vitest";

import {
  getApprovalApplicants,
  getApprovalTypeLabel,
  getApprovalTypeSummary,
  getCommandGroupGuide,
  getGroupCustomerCargoSummary,
  getGroupRouteSummary,
  getMergedChildBusinessTypeLockReason,
  getMergedChildDeleteLockReason,
  getMergedChildRollbackLockReason,
  isFindVehicleAlignedCommandTab,
  isMergedChildOrder,
} from "../client/src/lib/commandGroupRules";
import {
  flattenSingleItemCommandGroups,
  shouldShowCommandGroupHeader,
} from "../client/src/lib/commandGrouping";

describe("commandGroupRules", () => {
  it("为三个指挥台页签返回支持整组与批量操作的组合单提示", () => {
    expect(getCommandGroupGuide("pricing")).toMatchObject({
      titlePrefix: "整理单参考批次",
      badgeText: "支持整组定价/加急/退回/删除",
      childHint: "子订单仅随主订单整组操作，不支持单独定价、加急、退回或删除",
    });
    expect(getCommandGroupGuide("pricing").hintText).toContain("批量加急、退回、删除");

    expect(getCommandGroupGuide("manual")).toMatchObject({
      titlePrefix: "待分配参考批次",
      badgeText: "支持整组分配/加急/退回/删除",
      childHint: "子订单仅随主订单整组操作，不支持单独分配、加急、退回或删除",
    });
    expect(getCommandGroupGuide("manual").hintText).toContain("批量加急、退回、删除");

    expect(getCommandGroupGuide("approval")).toMatchObject({
      titlePrefix: "待审批参考批次",
      badgeText: "支持整组审批/加急/退回/删除",
      childHint: "子订单仅随主订单整组操作，不支持单独审批、加急、退回或删除",
    });
    expect(getCommandGroupGuide("approval").hintText).toContain("批量加急、退回、删除");
  });

  it("将找车台六个目标页签纳入与指挥台一致的组合单展示对齐范围", () => {
    expect(isFindVehicleAlignedCommandTab("pricing")).toBe(true);
    expect(isFindVehicleAlignedCommandTab("manual-assign")).toBe(true);
    expect(isFindVehicleAlignedCommandTab("approval")).toBe(true);
    expect(isFindVehicleAlignedCommandTab("pending")).toBe(true);
    expect(isFindVehicleAlignedCommandTab("dispatched")).toBe(true);
    expect(isFindVehicleAlignedCommandTab("pod-tracking")).toBe(true);
    expect(isFindVehicleAlignedCommandTab("deposit_pending")).toBe(true);
    expect(isFindVehicleAlignedCommandTab("deposit_done")).toBe(true);
    expect(isFindVehicleAlignedCommandTab("overdue_outsource")).toBe(false);
    expect(isFindVehicleAlignedCommandTab(null)).toBe(false);
  });

  it("聚合组合单客户货物与路线摘要", () => {
    const orders = [
      { customerName: "客户A", cargoName: "钢材", originCity: "上海", destinationCity: "苏州" },
      { customerName: "客户A", cargoName: "钢材", originCity: "上海", destinationCity: "杭州" },
      { customerName: "客户B", cargoName: "配件", originCity: "上海", destinationCity: "杭州" },
    ];

    expect(getGroupCustomerCargoSummary(orders)).toBe("客户A/客户B · 钢材/配件");
    expect(getGroupRouteSummary(orders)).toBe("上海 → 苏州、杭州");
    expect(getGroupRouteSummary([{ originCity: "上海", destinationCity: "苏州" }, { originCity: "上海", destinationCity: "杭州" }, { originCity: "上海", destinationCity: "无锡" }])).toBe("上海 → 苏州等3地");
  });

  it("识别真实已合并子订单并允许前段外请待定价订单继续单独操作", () => {
    expect(isMergedChildOrder({ parentId: 88, mergedPlanNumber: "MP-001", status: "merged" })).toBe(true);
    expect(isMergedChildOrder({ mergedPlanNumber: "MP-001", status: "merged", isMerged: false })).toBe(true);
    expect(isMergedChildOrder({ parentId: 88, mergedPlanNumber: null, status: "pending_price" })).toBe(false);
    expect(isMergedChildOrder({ parentId: 88, mergedPlanNumber: null, status: "pending_assign" })).toBe(false);
    expect(isMergedChildOrder({ parentId: 88, mergedPlanNumber: "MP-001", status: "pending_price" })).toBe(false);
    expect(isMergedChildOrder({ mergedPlanNumber: "MP-001", status: "pending_price", isMerged: true })).toBe(false);
    expect(isMergedChildOrder({ orderNumber: "NO-GROUP" })).toBe(false);
  });

  it("仅真实合并子单才返回删除、退回和业务类型锁定原因", () => {
    const mergedChild = { parentId: 88, mergedPlanNumber: "MP-001", status: "merged" };
    const pickupSubchain = { parentId: 88, mergedPlanNumber: null, status: "pending_price" };
    const mainMergedOrder = { mergedPlanNumber: "MP-001", status: "merged", isMerged: true };

    expect(getMergedChildDeleteLockReason(mergedChild)).toContain("主订单统一删除整组合并单");
    expect(getMergedChildRollbackLockReason(mergedChild)).toContain("主订单统一退回整组合并单");
    expect(getMergedChildBusinessTypeLockReason(mergedChild)).toBe("当前是合并子订单，业务类型只能在主订单统一修改。");

    expect(getMergedChildDeleteLockReason(pickupSubchain)).toBeNull();
    expect(getMergedChildRollbackLockReason(pickupSubchain)).toBeNull();
    expect(getMergedChildBusinessTypeLockReason(pickupSubchain)).toBeNull();
    expect(getMergedChildDeleteLockReason(mainMergedOrder)).toBeNull();
  });

  it("显式标记为合并子单的记录即使不在 merged 状态也会继续锁定高风险操作", () => {
    const mergedChild = { mergedPlanNumber: "MP-002", status: "pending_price", isMerged: false };

    expect(isMergedChildOrder(mergedChild)).toBe(true);
    expect(getMergedChildDeleteLockReason(mergedChild)).toContain("当前是合并子订单");
    expect(getMergedChildRollbackLockReason(mergedChild)).toContain("当前是合并子订单");
  });

  it("普通独立订单不会被共享锁定规则误伤", () => {
    const independentOrder = { id: 501, orderNumber: "SOLO-001", status: "pending_assign" };

    expect(isMergedChildOrder(independentOrder)).toBe(false);
    expect(getMergedChildDeleteLockReason(independentOrder)).toBeNull();
    expect(getMergedChildRollbackLockReason(independentOrder)).toBeNull();
    expect(getMergedChildBusinessTypeLockReason(independentOrder)).toBeNull();
  });

  it("聚合审批类型与申请人，供组头整组审批显示", () => {
    const items = [
      { approvalType: "initial_price", applicantName: "张三" },
      { approvalType: "vehicle_quote", applicantName: "李四" },
      { approvalType: "initial_price", applicantName: "张三" },
      { approvalType: "surcharge", applicantName: null },
    ];

    expect(getApprovalTypeLabel("initial_price")).toBe("初始定价");
    expect(getApprovalTypeLabel("vehicle_quote")).toBe("车辆报价");
    expect(getApprovalTypeLabel("surcharge")).toBe("加价");
    expect(getApprovalTypeSummary(items)).toBe("初始定价 / 车辆报价 / 加价");
    expect(getApprovalApplicants(items)).toBe("张三/李四");
  });

  it("单条记录且不存在真实子订单预览时不应显示组合单组头", () => {
    expect(shouldShowCommandGroupHeader([{ id: 501 }], new Set<number>())).toBe(false);

    const flattened = flattenSingleItemCommandGroups(
      {
        groups: new Map([["前段外请主单#4", [{ id: 501 }]]]),
        ungrouped: [],
      },
      new Set<number>(),
    );

    expect(flattened?.groups.size).toBe(0);
    expect(flattened?.ungrouped).toEqual([{ id: 501 }]);
  });

  it("单条记录即使存在真实子订单预览也不再显示组合单组头", () => {
    expect(shouldShowCommandGroupHeader([{ id: 601 }], new Set<number>([601]))).toBe(false);

    const flattened = flattenSingleItemCommandGroups(
      {
        groups: new Map([["前段外请主单#7", [{ id: 601 }]]]),
        ungrouped: [],
      },
      new Set<number>([601]),
    );

    expect(flattened?.groups.size).toBe(0);
    expect(flattened?.ungrouped).toEqual([{ id: 601 }]);
  });
});
