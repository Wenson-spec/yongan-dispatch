import { describe, expect, it } from "vitest";
import {
  buildOutsourceInspectionStats,
  getOutsourceInspectionFocus,
} from "../client/src/pages/AdminDashboard";

describe("管理驾驶舱外请链路专项巡检统计", () => {
  it("只统计外请链路关键节点，并按原件确认后才进入可退押金队列", () => {
    const stats = buildOutsourceInspectionStats([
      { businessType: "outsource", status: "pending_price", podEffectiveStatus: "none", depositStatus: "none", depositAmount: "0", isUrgent: true },
      { businessType: "outsource", status: "pending_vehicle", podEffectiveStatus: "none", depositStatus: "paid", depositAmount: "300", isUrgent: true },
      { businessType: "outsource", status: "pending_approval", podEffectiveStatus: "none", depositStatus: "paid", depositAmount: "800", isUrgent: false },
      { businessType: "outsource", status: "signed", podEffectiveStatus: "none", depositStatus: "paid", depositAmount: "600", isUrgent: false },
      { businessType: "outsource", status: "signed", podEffectiveStatus: "original_sent", podOriginalStatus: "sent", depositStatus: "paid", depositAmount: "700", isUrgent: false },
      { businessType: "outsource", status: "signed", podEffectiveStatus: "original_received", podOriginalStatus: "received", depositStatus: "paid", depositAmount: "900", isUrgent: false },
      { businessType: "outsource", status: "settled", podEffectiveStatus: "original_received", podOriginalStatus: "received", depositStatus: "refunded", depositAmount: "500", isUrgent: false },
      { businessType: "self", status: "pending_dispatch", podEffectiveStatus: "original_received", podOriginalStatus: "received", depositStatus: "paid", depositAmount: "1000", isUrgent: true },
    ]);

    expect(stats).toEqual({
      total: 7,
      pendingPricing: 1,
      pendingVehicle: 1,
      pendingApproval: 1,
      awaitingOriginalSend: 1,
      originalInTransit: 1,
      originalReceived: 2,
      refundableDeposit: 1,
      refundedDeposit: 1,
      urgentOpen: 2,
    });
  });

  it("零数据时返回稳定焦点，避免空库态误导巡检优先级", () => {
    const focus = getOutsourceInspectionFocus({
      total: 0,
      pendingPricing: 0,
      pendingVehicle: 0,
      pendingApproval: 0,
      awaitingOriginalSend: 0,
      originalInTransit: 0,
      originalReceived: 0,
      refundableDeposit: 0,
      refundedDeposit: 0,
      urgentOpen: 0,
    });

    expect(focus).toEqual({ key: "stable", label: "整体平稳", count: 0 });
  });

  it("有数据时返回当前最大的堵点作为巡检焦点", () => {
    const focus = getOutsourceInspectionFocus({
      total: 12,
      pendingPricing: 2,
      pendingVehicle: 5,
      pendingApproval: 3,
      awaitingOriginalSend: 1,
      originalInTransit: 4,
      originalReceived: 6,
      refundableDeposit: 2,
      refundedDeposit: 1,
      urgentOpen: 2,
    });

    expect(focus).toEqual({ key: "pendingVehicle", label: "外请调度找车", count: 5 });
  });
});
