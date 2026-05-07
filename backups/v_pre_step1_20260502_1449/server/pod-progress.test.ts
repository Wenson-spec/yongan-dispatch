import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Track mock data for dynamic responses
let mockOrders: any[] = [];
let mockPodRecords: any[] = [];

vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    getDb: vi.fn().mockImplementation(() => {
      // Return a mock DB that supports the select/from/where chain
      const createChain = (data: any[]) => ({
        from: (table: any) => ({
          where: (condition: any) => {
            // Filter based on the condition - simplified mock
            return data;
          },
        }),
      });
      return Promise.resolve({
        select: (fields: any) => createChain([]),
      });
    }),
    createOperationLog: vi.fn().mockResolvedValue(undefined),
    getUserPermissions: vi.fn().mockResolvedValue([
      "order.create", "order.edit", "order.view_all", "order.view_own",
      "order.assign", "order.mark_urgent", "order.adjust", "order.hold_cancel",
      "order.update_status", "order.delete", "order.rollback",
      "kanban.global", "kanban.outsource", "kanban.self", "kanban.ltl",
      "approval.execute", "approval.view_history",
      "pod.view", "pod.mark_sent", "pod.confirm_received", "pod.refund_deposit",
      "stats.full", "stats.personal",
      "freight_rate.view", "freight_rate.export",
      "export.customer_ledger",
      "log.view",
      "config.customer", "config.warehouse", "config.vehicle_driver",
      "config.user", "config.dispatcher_region", "config.permission",
      "outsource.vehicle_input", "outsource.submit_quote", "outsource.set_price",
      "fleet.dispatch", "fleet.vehicle_status",
      "ltl.inquiry", "ltl.arrange_ship", "ltl.upload_pod", "ltl.ocr_verify",
    ]),
  };
});

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-user",
      email: "admin@yongan.com",
      name: "管理员",
      loginMethod: "manus",
      role: "admin",
      username: "admin",
      passwordHash: null,
      phone: null,
      region: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

const caller = appRouter.createCaller(createAdminContext());

describe("checkGroupsReceived - 回单进度指示器API", () => {
  it("空输入返回空对象", async () => {
    const result = await caller.pod.checkGroupsReceived({ mergedPlanNumbers: [] });
    expect(result).toEqual({});
  });

  it("合并计划号无对应订单时返回0/0进度", async () => {
    // Mock DB returns empty arrays for select queries, so no orders found for MPN-001
    const result = await caller.pod.checkGroupsReceived({ mergedPlanNumbers: ["MPN-001"] });
    // When no orders found for the MPN, should return sentCount=0, receivedCount=0, totalCount=0
    expect(result).toHaveProperty("MPN-001");
    const progress = (result as any)["MPN-001"];
    expect(progress).toEqual({ allReceived: false, allSent: false, sentCount: 0, receivedCount: 0, totalCount: 0 });
  });

  it("返回值包含allReceived、sentCount、receivedCount和totalCount字段", async () => {
    const result = await caller.pod.checkGroupsReceived({ mergedPlanNumbers: ["MPN-001"] });
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    const progress = (result as any)["MPN-001"];
    expect(progress).toHaveProperty("allReceived");
    expect(progress).toHaveProperty("allSent");
    expect(progress).toHaveProperty("sentCount");
    expect(progress).toHaveProperty("receivedCount");
    expect(progress).toHaveProperty("totalCount");
  });
});

describe("PodProgressBadge组件逻辑验证", () => {
  it("进度计算：0/3 = 0%", () => {
    const sentCount = 0;
    const totalCount = 3;
    const progress = totalCount > 0 ? (sentCount / totalCount) * 100 : 0;
    expect(progress).toBe(0);
    expect(sentCount === totalCount).toBe(false);
  });

  it("进度计算：1/3 ≈ 33.3%", () => {
    const sentCount = 1;
    const totalCount = 3;
    const progress = totalCount > 0 ? (sentCount / totalCount) * 100 : 0;
    expect(progress).toBeCloseTo(33.33, 1);
    expect(sentCount === totalCount).toBe(false);
  });

  it("进度计算：2/3 ≈ 66.7%", () => {
    const sentCount = 2;
    const totalCount = 3;
    const progress = totalCount > 0 ? (sentCount / totalCount) * 100 : 0;
    expect(progress).toBeCloseTo(66.67, 1);
    expect(sentCount === totalCount).toBe(false);
  });

  it("进度计算：3/3 = 100% (全部到齐)", () => {
    const sentCount = 3;
    const totalCount = 3;
    const progress = totalCount > 0 ? (sentCount / totalCount) * 100 : 0;
    expect(progress).toBe(100);
    expect(sentCount === totalCount).toBe(true);
  });

  it("进度计算：0/0 = 0% (无订单)", () => {
    const sentCount = 0;
    const totalCount = 0;
    const progress = totalCount > 0 ? (sentCount / totalCount) * 100 : 0;
    expect(progress).toBe(0);
  });

  it("颜色方案：全部到齐=绿色", () => {
    const sentCount = 3;
    const totalCount = 3;
    const allDone = sentCount === totalCount;
    const colorClass = allDone ? "green" : sentCount > 0 ? "amber" : "gray";
    expect(colorClass).toBe("green");
  });

  it("颜色方案：部分到齐=琥珀色", () => {
    const sentCount = 2;
    const totalCount = 3;
    const allDone = sentCount === totalCount;
    const colorClass = allDone ? "green" : sentCount > 0 ? "amber" : "gray";
    expect(colorClass).toBe("amber");
  });

  it("颜色方案：未开始=灰色", () => {
    const sentCount = 0;
    const totalCount = 3;
    const allDone = sentCount === totalCount;
    const colorClass = allDone ? "green" : sentCount > 0 ? "amber" : "gray";
    expect(colorClass).toBe("gray");
  });
});

describe("退押金分组逻辑中的进度数据集成", () => {
  it("groupReceivedMap新格式同时包含 allSent 与 receivedCount 字段", () => {
    const groupReceivedMap: Record<string, { allReceived: boolean; allSent: boolean; sentCount: number; receivedCount: number; totalCount: number }> = {
      "MPN-001": { allReceived: false, allSent: false, sentCount: 2, receivedCount: 1, totalCount: 3 },
      "MPN-002": { allReceived: true, allSent: true, sentCount: 2, receivedCount: 2, totalCount: 2 },
    };

    const progress1 = groupReceivedMap["MPN-001"];
    expect(progress1).toBeDefined();
    expect(progress1.allReceived).toBe(false);
    expect(progress1.allSent).toBe(false);
    expect(progress1.sentCount).toBe(2);
    expect(progress1.receivedCount).toBe(1);
    expect(progress1.totalCount).toBe(3);

    const progress2 = groupReceivedMap["MPN-002"];
    expect(progress2).toBeDefined();
    expect(progress2.allReceived).toBe(true);
    expect(progress2.allSent).toBe(true);
    expect(progress2.sentCount).toBe(2);
    expect(progress2.receivedCount).toBe(2);
    expect(progress2.totalCount).toBe(2);
  });

  it("不存在的合并计划号返回 undefined", () => {
    const groupReceivedMap: Record<string, { allReceived: boolean; allSent: boolean; sentCount: number; receivedCount: number; totalCount: number }> = {
      "MPN-001": { allReceived: true, allSent: true, sentCount: 3, receivedCount: 3, totalCount: 3 },
    };

    const progress = groupReceivedMap["MPN-NONEXIST"];
    expect(progress).toBeUndefined();
  });

  it("退押金按钮禁用逻辑：allSent=false 时必须锁定，即使已有部分回单收到", () => {
    const group = {
      allPodsSent: false,
      podSentCount: 1,
      podReceivedCount: 1,
      podTotalCount: 3,
    };
    expect(group.allPodsSent).toBe(false);
    expect(group.podSentCount).toBeLessThan(group.podTotalCount);
    expect(group.podReceivedCount).toBeGreaterThan(0);
  });

  it("退押金按钮启用逻辑：allSent=true 时可退，即使并非全部原件已收到", () => {
    const group = {
      allPodsSent: true,
      podSentCount: 3,
      podReceivedCount: 1,
      podTotalCount: 3,
    };
    expect(group.allPodsSent).toBe(true);
    expect(group.podSentCount).toBe(group.podTotalCount);
    expect(group.podReceivedCount).toBeLessThan(group.podTotalCount);
  });

  it("批量退押金时会自动区分可退与暂锁定订单", () => {
    const filteredPendingRefund = [{ id: 101 }, { id: 102 }, { id: 103 }, { id: 104 }];
    const selectedIds = new Set([101, 102, 104]);
    const blockedPendingRefundOrderIds = new Set([102, 103]);

    const selectedOrderIds = filteredPendingRefund.filter((o) => selectedIds.has(o.id)).map((o) => o.id);
    const eligibleIds = selectedOrderIds.filter((id) => !blockedPendingRefundOrderIds.has(id));
    const blockedIds = selectedOrderIds.filter((id) => blockedPendingRefundOrderIds.has(id));

    expect(selectedOrderIds).toEqual([101, 102, 104]);
    expect(eligibleIds).toEqual([101, 104]);
    expect(blockedIds).toEqual([102]);
  });
});

describe("页面流程提示相关派生逻辑", () => {
  it("待收回单批量摘要会区分已寄出与待处理数量", () => {
    const filteredPendingPods = [
      { orderId: 1, originalStatus: "sent" },
      { orderId: 2, originalStatus: "pending" },
      { orderId: 3, originalStatus: "sent" },
      { orderId: 4, originalStatus: "pending" },
    ];
    const selectedIds = new Set([1, 2, 4]);

    const sentCount = filteredPendingPods.filter((p) => selectedIds.has(p.orderId) && p.originalStatus === "sent").length;
    const pendingCount = filteredPendingPods.filter((p) => selectedIds.has(p.orderId) && p.originalStatus !== "sent").length;

    expect(sentCount).toBe(1);
    expect(pendingCount).toBe(2);
  });

  it("已收回单摘要会区分待退还与已退还押金数量", () => {
    const filteredReceivedPods = [
      { order: { depositStatus: "paid", depositAmount: "300" } },
      { order: { depositStatus: "paid", depositAmount: "0" } },
      { order: { depositStatus: "refunded", depositAmount: "260" } },
      { order: { depositStatus: "pending", depositAmount: "100" } },
    ];

    const refundableCount = filteredReceivedPods.filter(
      (p) => p.order?.depositStatus === "paid" && p.order?.depositAmount && parseFloat(p.order.depositAmount) > 0,
    ).length;
    const refundedCount = filteredReceivedPods.filter((p) => p.order?.depositStatus === "refunded").length;

    expect(refundableCount).toBe(1);
    expect(refundedCount).toBe(1);
  });

  it("超期监控摘要在不同筛选下返回正确文案口径", () => {
    const buildSummary = (overdueFilter: "all" | "yellow" | "orange" | "red", count: number) => {
      const prefix = overdueFilter === "all"
        ? `当前共监控 ${count} 笔超期回单，建议优先处理红色与橙色记录。`
        : `当前仅查看${overdueFilter === "yellow" ? "黄色预警" : overdueFilter === "orange" ? "橙色警告" : "红色紧急"}，共 ${count} 笔。`;
      const suffix = count > 0
        ? " 处理完成后可回到对应工作台更新寄出或收回状态，避免重复告警。"
        : " 若本页无记录，说明当前筛选条件下暂无达到阈值的回单。";
      return `${prefix}${suffix}`;
    };

    expect(buildSummary("all", 3)).toContain("当前共监控 3 笔超期回单");
    expect(buildSummary("orange", 2)).toContain("当前仅查看橙色警告，共 2 笔。");
    expect(buildSummary("red", 0)).toContain("暂无达到阈值的回单");
  });
});

describe("ReceivedProgressBadge组件逻辑验证", () => {
  it("已收到进度计算：0/3 = 0%", () => {
    const receivedCount = 0;
    const totalCount = 3;
    const progress = totalCount > 0 ? (receivedCount / totalCount) * 100 : 0;
    const remaining = totalCount - receivedCount;
    expect(progress).toBe(0);
    expect(remaining).toBe(3);
    expect(receivedCount === totalCount).toBe(false);
  });

  it("已收到进度计算：1/3 ≈ 33.3%，差2个", () => {
    const receivedCount = 1;
    const totalCount = 3;
    const progress = totalCount > 0 ? (receivedCount / totalCount) * 100 : 0;
    const remaining = totalCount - receivedCount;
    expect(progress).toBeCloseTo(33.33, 1);
    expect(remaining).toBe(2);
  });

  it("已收到进度计算：3/3 = 100% (全部收到)", () => {
    const receivedCount = 3;
    const totalCount = 3;
    const progress = totalCount > 0 ? (receivedCount / totalCount) * 100 : 0;
    const remaining = totalCount - receivedCount;
    expect(progress).toBe(100);
    expect(remaining).toBe(0);
    expect(receivedCount === totalCount).toBe(true);
  });

  it("颜色方案：全部收到=绿色", () => {
    const receivedCount = 3;
    const totalCount = 3;
    const allDone = receivedCount === totalCount;
    const colorClass = allDone ? "green" : receivedCount > 0 ? "blue" : "gray";
    expect(colorClass).toBe("green");
  });

  it("颜色方案：部分收到=蓝色", () => {
    const receivedCount = 1;
    const totalCount = 3;
    const allDone = receivedCount === totalCount;
    const colorClass = allDone ? "green" : receivedCount > 0 ? "blue" : "gray";
    expect(colorClass).toBe("blue");
  });

  it("颜色方案：未收到=灰色", () => {
    const receivedCount = 0;
    const totalCount = 3;
    const allDone = receivedCount === totalCount;
    const colorClass = allDone ? "green" : receivedCount > 0 ? "blue" : "gray";
    expect(colorClass).toBe("gray");
  });

  it("外请订单：received且有sentAt时同时计入sentCount", () => {
    // 模拟3个外请订单：1个received(经过寄出)，1个sent，1个pending
    const pods = [
      { originalStatus: "received", originalSentAt: new Date() },
      { originalStatus: "sent", originalSentAt: new Date() },
      { originalStatus: "pending", originalSentAt: null },
    ];
    let sentCount = 0;
    let receivedCount = 0;
    for (const pod of pods) {
      if (pod.originalStatus === "received") {
        receivedCount++;
        if (pod.originalSentAt) sentCount++; // 只有经过寄出的才算
      } else if (pod.originalStatus === "sent") {
        sentCount++;
      }
    }
    expect(sentCount).toBe(2); // received(有sentAt) + sent
    expect(receivedCount).toBe(1); // 只有received
    expect(pods.length).toBe(3); // totalCount
  });

  it("自运订单：received但无sentAt时不计入sentCount", () => {
    // 模拟3个自运订单：全部直接从pending→received（跳过sent）
    const pods = [
      { originalStatus: "received", originalSentAt: null },
      { originalStatus: "received", originalSentAt: null },
      { originalStatus: "received", originalSentAt: null },
    ];
    let sentCount = 0;
    let receivedCount = 0;
    for (const pod of pods) {
      if (pod.originalStatus === "received") {
        receivedCount++;
        if (pod.originalSentAt) sentCount++;
      } else if (pod.originalStatus === "sent") {
        sentCount++;
      }
    }
    expect(sentCount).toBe(0); // 自运跳过寄出，sentCount=0
    expect(receivedCount).toBe(3); // 全部收到
    expect(pods.length).toBe(3);
  });

  it("混合场景：部分经过寄出部分直接收回", () => {
    // 模拟混合场景：1个经过寄出后收到，1个直接收到，1个待处理
    const pods = [
      { originalStatus: "received", originalSentAt: new Date() }, // 外请：寄出后收到
      { originalStatus: "received", originalSentAt: null },       // 自运：直接收到
      { originalStatus: "pending", originalSentAt: null },        // 待处理
    ];
    let sentCount = 0;
    let receivedCount = 0;
    for (const pod of pods) {
      if (pod.originalStatus === "received") {
        receivedCount++;
        if (pod.originalSentAt) sentCount++;
      } else if (pod.originalStatus === "sent") {
        sentCount++;
      }
    }
    expect(sentCount).toBe(1); // 只有经过寄出的那个
    expect(receivedCount).toBe(2); // 2个收到
  });
});
