import { z } from "zod";
import { protectedProcedure, permissionProcedure } from "../_core/trpc";
import { router } from "../_core/trpc";
import { getDb, createOperationLog } from "../db";
import { approvals, orders, podRecords } from "../../drizzle/schema";
import { eq, and, desc, asc, count, inArray, isNull } from "drizzle-orm";
import { safeParseFloat } from "@shared/safeParseFloat";

type ApprovalOrderSnapshot = {
  id: number;
  status: string | null;
  mergedPlanNumber?: string | null;
  actualFreight?: string | null;
};

type GroupApprovalSnapshot = {
  id: number;
  orderId: number;
  status: string | null;
  approvalType: string | null;
  previousStatus: string | null;
  requestedAmount?: string | null;
  approvedAmount?: string | null;
};

export function hasLinkedApprovalOrder(row: { linkedOrderId?: number | null }) {
  return typeof row.linkedOrderId === "number" && row.linkedOrderId > 0;
}

async function resolveApprovalGroupOrderIds(db: any, orderId: number) {
  const currentOrderRows = await db.select({
    id: orders.id,
    mergedPlanNumber: orders.mergedPlanNumber,
  }).from(orders).where(eq(orders.id, orderId)).limit(1);

  const currentOrder = currentOrderRows[0];
  if (!currentOrder) return [] as number[];
  if (!currentOrder.mergedPlanNumber) return [currentOrder.id];

  const groupRows = await db.select({ id: orders.id })
    .from(orders)
    .where(eq(orders.mergedPlanNumber, currentOrder.mergedPlanNumber));

  return groupRows.length > 0 ? groupRows.map((row: { id: number }) => row.id) : [currentOrder.id];
}

async function listPendingGroupApprovals(db: any, orderId: number, approvalType: string) {
  const groupOrderIds = await resolveApprovalGroupOrderIds(db, orderId);
  if (groupOrderIds.length === 0) {
    return { groupOrderIds: [] as number[], pendingApprovals: [] as GroupApprovalSnapshot[] };
  }

  const pendingApprovals = await db.select({
    id: approvals.id,
    orderId: approvals.orderId,
    status: approvals.status,
    approvalType: approvals.approvalType,
    previousStatus: approvals.previousStatus,
    requestedAmount: approvals.requestedAmount,
    approvedAmount: approvals.approvedAmount,
  }).from(approvals).where(and(
    inArray(approvals.orderId, groupOrderIds),
    eq(approvals.status, "pending"),
    eq(approvals.approvalType, approvalType as any),
  )) as GroupApprovalSnapshot[];

  return { groupOrderIds, pendingApprovals };
}

async function resolveGroupApprovals(
  db: any,
  pendingApprovals: GroupApprovalSnapshot[],
  params: {
    action: "approve" | "reject";
    approverId: number;
    approverName: string | null;
    approverComment?: string | null;
    approvedAmount?: string | null;
  },
) {
  const approvalIds = pendingApprovals.map((item) => item.id);
  if (approvalIds.length === 0) return [] as number[];

  const updateData: Record<string, any> = {
    status: params.action === "approve" ? "approved" : "rejected",
    approverComment: params.approverComment || null,
    approverId: params.approverId,
    approverName: params.approverName,
  };

  if (params.approvedAmount !== undefined) {
    updateData.approvedAmount = params.approvedAmount;
  }

  await db.update(approvals).set(updateData).where(inArray(approvals.id, approvalIds));
  return approvalIds;
}

// 重新计算订单总费用并存入数据库
async function recalcTotalCost(db: any, orderId: number) {
  const row = await db.select({
    actualFreight: orders.actualFreight,
    deliveryFee: orders.deliveryFee,
    extraFee: orders.extraFee,
    ltlDeliveryFee: orders.ltlDeliveryFee,
    ltlOtherFee: orders.ltlOtherFee,
  }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!row[0]) return;
  const o = row[0];
  const total = safeParseFloat(o.actualFreight)
    + safeParseFloat(o.deliveryFee)
    + safeParseFloat(o.extraFee)
    + safeParseFloat(o.ltlDeliveryFee)
    + safeParseFloat(o.ltlOtherFee);
  await db.update(orders).set({ totalCost: String(total) }).where(eq(orders.id, orderId));
}

async function ensurePodRecord(db: any, orderId: number) {
  const orderRow = await db.select({
    id: orders.id,
    podOwnership: orders.podOwnership,
  }).from(orders).where(eq(orders.id, orderId)).limit(1);

  const order = orderRow[0];
  if (!order) return;

  const existingPod = await db.select({
    id: podRecords.id,
    originalStatus: podRecords.originalStatus,
    podOwnership: podRecords.podOwnership,
  }).from(podRecords).where(eq(podRecords.orderId, orderId)).limit(1);

  if (order.podOwnership !== "current_order") {
    if (existingPod[0] && existingPod[0].originalStatus === "pending") {
      await db.delete(podRecords).where(eq(podRecords.id, existingPod[0].id));
    }
    return;
  }

  if (existingPod[0]) {
    if (existingPod[0].podOwnership !== "current_order") {
      await db.update(podRecords).set({ podOwnership: "current_order" }).where(eq(podRecords.id, existingPod[0].id));
    }
    return;
  }

  await db.insert(podRecords).values({
    orderId,
    originalStatus: "pending",
    podOwnership: "current_order",
  });
}

async function finalizeApprovedOrders(db: any, orderIds: number[]) {
  const uniqueOrderIds = Array.from(new Set(orderIds));
  for (const oid of uniqueOrderIds) {
    try {
      await recalcTotalCost(db, oid);
    } catch (e) {
      console.error(`Recalc totalCost failed for order ${oid}:`, e);
    }
    try {
      await ensurePodRecord(db, oid);
    } catch (e) {
      console.error(`Auto-create pod record failed for order ${oid}:`, e);
    }
  }
}

async function applyApprovalSuccess(
  db: any,
  params: {
    orderId: number;
    approvalType: string;
    approvedAmount?: string | null;
    pendingApprovals?: GroupApprovalSnapshot[];
  },
) {
  const currentOrderRows = await db.select({
    id: orders.id,
    status: orders.status,
    mergedPlanNumber: orders.mergedPlanNumber,
    actualFreight: orders.actualFreight,
  }).from(orders).where(eq(orders.id, params.orderId)).limit(1);

  const currentOrder = currentOrderRows[0] as ApprovalOrderSnapshot | undefined;
  if (!currentOrder) {
    return { affectedOrderIds: [] as number[], alreadyProcessed: true };
  }

  if (params.approvalType === "surcharge") {
    const updateData: Record<string, any> = {
      status: "dispatched",
      dispatchDate: new Date(),
      approvalDate: new Date(),
    };
    if (params.approvedAmount) updateData.extraFee = params.approvedAmount;
    await db.update(orders).set(updateData).where(eq(orders.id, params.orderId));
    return { affectedOrderIds: [params.orderId], alreadyProcessed: false };
  }

  const preferredOrderIds = params.pendingApprovals && params.pendingApprovals.length > 0
    ? Array.from(new Set(params.pendingApprovals.map((item) => item.orderId)))
    : [params.orderId];

  const groupOrders = await db.select({
    id: orders.id,
    status: orders.status,
    actualFreight: orders.actualFreight,
  }).from(orders).where(inArray(orders.id, preferredOrderIds)) as ApprovalOrderSnapshot[];

  const pendingGroupOrders = groupOrders.filter((order: ApprovalOrderSnapshot) => order.status === "pending_approval");
  if (currentOrder.status !== "pending_approval" && pendingGroupOrders.length === 0) {
    return {
      affectedOrderIds: preferredOrderIds,
      alreadyProcessed: true,
    };
  }

  const targetOrders = pendingGroupOrders.length > 0 ? pendingGroupOrders : [currentOrder];
  const approvedAt = new Date();
  const baseUpdateData: Record<string, any> = {
    status: "dispatched",
    dispatchDate: approvedAt,
    approvalDate: approvedAt,
  };
  if (params.approvalType === "vehicle_quote") {
    baseUpdateData.depositStatus = "paid";
  }

  const approvedAmountNum = safeParseFloat(params.approvedAmount);
  const totalActualFreight = targetOrders.reduce((sum, order) => sum + safeParseFloat(order.actualFreight), 0);
  const approvedDispatchPriceMap = new Map<number, string>();

  if (approvedAmountNum > 0) {
    if (targetOrders.length === 1) {
      approvedDispatchPriceMap.set(targetOrders[0].id, String(Math.round(approvedAmountNum * 100) / 100));
    } else {
      const totalApprovedCents = Math.round(approvedAmountNum * 100);
      const useActualRatio = totalActualFreight > 0;
      let allocatedCents = 0;

      for (let i = 0; i < targetOrders.length; i++) {
        const order = targetOrders[i];
        let shareCents = 0;
        if (i === targetOrders.length - 1) {
          shareCents = totalApprovedCents - allocatedCents;
        } else if (useActualRatio) {
          shareCents = Math.round((safeParseFloat(order.actualFreight) / totalActualFreight) * totalApprovedCents);
          allocatedCents += shareCents;
        } else {
          shareCents = Math.round(totalApprovedCents / targetOrders.length);
          allocatedCents += shareCents;
        }
        approvedDispatchPriceMap.set(order.id, String(shareCents / 100));
      }
    }
  }

  for (const order of targetOrders) {
    const perOrderUpdate: Record<string, any> = { ...baseUpdateData };
    const actualFreight = safeParseFloat(order.actualFreight);
    const approvedDispatchPrice = approvedDispatchPriceMap.get(order.id);

    if (approvedDispatchPrice) {
      perOrderUpdate.dispatchPrice = approvedDispatchPrice;
      if (targetOrders.length === 1 && actualFreight <= 0) {
        perOrderUpdate.actualFreight = approvedDispatchPrice;
      }
    } else if (actualFreight > 0) {
      perOrderUpdate.dispatchPrice = order.actualFreight;
    }

    await db.update(orders).set(perOrderUpdate).where(eq(orders.id, order.id));
  }

  return {
    affectedOrderIds: targetOrders.map((order: ApprovalOrderSnapshot) => order.id),
    alreadyProcessed: false,
  };
}

async function applyApprovalReject(
  db: any,
  params: {
    orderId: number;
    approvalType: string;
    previousStatus?: string | null;
    pendingApprovals?: GroupApprovalSnapshot[];
  },
) {
  if (params.approvalType === "surcharge") {
    await db.update(orders).set({ extraFee: null, approvalDate: new Date() }).where(eq(orders.id, params.orderId));
    try {
      await recalcTotalCost(db, params.orderId);
    } catch (e) {
      console.error("Recalc totalCost after surcharge reject:", e);
    }
    return [params.orderId];
  }

  const rollbackPairs = params.pendingApprovals && params.pendingApprovals.length > 0
    ? params.pendingApprovals.map((item) => ({
        orderId: item.orderId,
        previousStatus: item.previousStatus || params.previousStatus || "pending_vehicle",
      }))
    : [{ orderId: params.orderId, previousStatus: params.previousStatus || "pending_vehicle" }];

  const targetOrderIds = Array.from(new Set(rollbackPairs.map((item) => item.orderId)));
  const targetOrders = await db.select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(inArray(orders.id, targetOrderIds)) as ApprovalOrderSnapshot[];

  const rollbackStatusMap = new Map<number, string>(
    rollbackPairs.map((item) => [item.orderId, item.previousStatus || "pending_vehicle"]),
  );

  const pendingOrders = targetOrders.filter((order: ApprovalOrderSnapshot) => order.status === "pending_approval");
  const rollbackTargets = pendingOrders.length > 0
    ? pendingOrders
    : targetOrders.filter((order: ApprovalOrderSnapshot) => order.id === params.orderId);

  const rejectedAt = new Date();
  for (const order of rollbackTargets) {
    await db.update(orders).set({
      status: (rollbackStatusMap.get(order.id) || params.previousStatus || "pending_vehicle") as any,
      approvalDate: rejectedAt,
    }).where(eq(orders.id, order.id));
  }

  return rollbackTargets.map((order: ApprovalOrderSnapshot) => order.id);
}

export const approvalRouter = router({
  // 提交审批申请
  submit: protectedProcedure.input(
    z.object({
      orderId: z.number(),
      approvalType: z.enum(["initial_price", "vehicle_quote", "surcharge"]),
      requestedAmount: z.string().optional(),
      reason: z.string().optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");

    // 查询当前订单状态，记录审批前状态（用于驳回时精准回退）
    const currentOrder = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, input.orderId)).limit(1);
    const prevStatus = currentOrder[0]?.status || "pending_vehicle";

    const result = await db.insert(approvals).values({
      orderId: input.orderId,
      approvalType: input.approvalType,
      status: "pending",
      previousStatus: prevStatus,  // 记录审批前订单状态
      requestedAmount: input.requestedAmount || null,
      reason: input.reason || null,
      applicantId: ctx.user!.id,
      applicantName: ctx.user!.name || ctx.user!.username || null,
    });

    await db.update(orders).set({ status: "pending_approval" as any }).where(eq(orders.id, input.orderId));

    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: "submit_approval",
      targetType: "approval",
      targetId: String(result[0].insertId),
      description: `提交${input.approvalType === "initial_price" ? "初始定价" : input.approvalType === "vehicle_quote" ? "车辆报价" : input.approvalType === "surcharge" ? "加价" : "垫付"}审批，订单#${input.orderId}`,
    });

    return { id: result[0].insertId };
  }),

  // 审批列表
  list: protectedProcedure.input(
    z.object({
      page: z.number().default(1),
      pageSize: z.number().default(50),
      status: z.string().optional(),
      approvalType: z.string().optional(),
    }),
  ).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return { items: [], total: 0 };

    const conditions: any[] = [];
    if (input.status) conditions.push(eq(approvals.status, input.status as any));
    if (input.approvalType) conditions.push(eq(approvals.approvalType, input.approvalType as any));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const orphanWhereClause = whereClause ? and(whereClause, isNull(orders.id)) : isNull(orders.id);

    const orphanApprovalRows = await db.select({ id: approvals.id })
      .from(approvals)
      .leftJoin(orders, eq(approvals.orderId, orders.id))
      .where(orphanWhereClause);

    const orphanApprovalIds = orphanApprovalRows
      .map((item: any) => item.id)
      .filter((id: unknown): id is number => typeof id === "number");

    if (orphanApprovalIds.length > 0) {
      await db.delete(approvals).where(inArray(approvals.id, orphanApprovalIds));
    }

    const [items, totalResult] = await Promise.all([
      db.select({
        id: approvals.id,
        orderId: approvals.orderId,
        linkedOrderId: orders.id,
        approvalType: approvals.approvalType,
        status: approvals.status,
        requestedAmount: approvals.requestedAmount,
        reason: approvals.reason,
        applicantId: approvals.applicantId,
        applicantName: approvals.applicantName,
        approverId: approvals.approverId,
        approverName: approvals.approverName,
        approvedAmount: approvals.approvedAmount,
        approverComment: approvals.approverComment,
        previousStatus: approvals.previousStatus,
        createdAt: approvals.createdAt,
        // 订单详情
        orderNumber: orders.orderNumber,
        systemCode: orders.systemCode,
        mergedPlanNumber: orders.mergedPlanNumber,
        customerName: orders.customerName,
        cargoName: orders.cargoName,
        weight: orders.weight,
        originCity: orders.originCity,
        warehouseName: orders.warehouseName,
        destinationCity: orders.destinationCity,
        deliveryAddress: orders.deliveryAddress,
        receiverName: orders.receiverName,
        receiverPhone: orders.receiverPhone,
        shippingNote: orders.shippingNote,
        receivingNote: orders.receivingNote,
        receivingStatus: orders.receivingStatus,
        expectedReceiveAt: orders.expectedReceiveAt,
        nextFollowUpAt: orders.nextFollowUpAt,
        receivingReason: orders.receivingReason,
        customerPrice: orders.customerPrice,
        quotedPrice: orders.quotedPrice,
        dispatchPrice: orders.dispatchPrice,
        isLargeSlab: orders.isLargeSlab,
        cargoSpec: orders.cargoSpec,
        chargeableWeight: orders.chargeableWeight,
        packageCount: orders.packageCount,
        palletCount: orders.palletCount,
        specialRequirements: orders.specialRequirements,
        remarks: orders.remarks,
        isUrgent: orders.isUrgent,
        urgentReason: orders.urgentReason,
        businessType: orders.businessType,
      })
        .from(approvals)
        .innerJoin(orders, eq(approvals.orderId, orders.id))
        .where(whereClause)
        .orderBy(desc(approvals.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      db.select({ cnt: count() })
        .from(approvals)
        .innerJoin(orders, eq(approvals.orderId, orders.id))
        .where(whereClause),
    ]);

    return {
      items,
      total: totalResult[0]?.cnt ?? 0,
    };
  }),

  // 执行审批（通过/驳回）
  execute: permissionProcedure("approval.execute").input(
    z.object({
      id: z.number(),
      action: z.enum(["approve", "reject"]),
      approvedAmount: z.string().optional(),
      approverComment: z.string().optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");

    // 驳回时必须填写驳回原因
    if (input.action === "reject" && (!input.approverComment || input.approverComment.trim() === "")) {
      throw new Error("驳回时必须填写驳回原因");
    }

    const rows = await db.select().from(approvals).where(eq(approvals.id, input.id)).limit(1);
    if (!rows[0]) throw new Error("审批记录不存在");
    if (rows[0].status !== "pending") throw new Error("该审批已处理");

    const ap = rows[0];
    const { pendingApprovals } = await listPendingGroupApprovals(db, ap.orderId, ap.approvalType);
    if (pendingApprovals.length === 0) throw new Error("该审批已处理");

    const effectiveApprovedAmount = input.action === "approve"
      ? (input.approvedAmount ?? ap.requestedAmount ?? null)
      : undefined;

    await resolveGroupApprovals(db, pendingApprovals, {
      action: input.action,
      approverId: ctx.user!.id,
      approverName: ctx.user!.name || ctx.user!.username || null,
      approverComment: input.approverComment || null,
      approvedAmount: effectiveApprovedAmount,
    });

    // 更新订单状态
    if (input.action === "approve") {
      const { affectedOrderIds, alreadyProcessed } = await applyApprovalSuccess(db, {
        orderId: ap.orderId,
        approvalType: ap.approvalType,
        approvedAmount: effectiveApprovedAmount,
        pendingApprovals,
      });
      if (affectedOrderIds.length === 0) {
        console.warn(`[approval.execute] 订单 ${ap.orderId} 不存在，跳过`);
        return { success: true };
      }
      if (alreadyProcessed) {
        console.log(`[approval.execute] 订单 ${ap.orderId} 已被同组审批处理，跳过重复状态更新`);
      }
      await finalizeApprovedOrders(db, affectedOrderIds.length > 0 ? affectedOrderIds : [ap.orderId]);
    } else {
      await applyApprovalReject(db, {
        orderId: ap.orderId,
        approvalType: ap.approvalType,
        previousStatus: ap.previousStatus,
        pendingApprovals,
      });
    }

    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: input.action === "approve" ? "approve" : "reject",
      targetType: "approval",
      targetId: String(input.id),
      description: `${input.action === "approve" ? "通过" : "驳回"}审批 #${input.id}`,
    });

    return { success: true };
  }),

  // 批量审批（指挥台分组批量操作）
  batchExecute: permissionProcedure("approval.execute").input(
    z.object({
      ids: z.array(z.number()).min(1),
      action: z.enum(["approve", "reject"]),
      approverComment: z.string().optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");

    if (input.action === "reject" && (!input.approverComment || input.approverComment.trim() === "")) {
      throw new Error("批量驳回时必须填写驳回原因");
    }

    let successCount = 0;
    for (const id of input.ids) {
      try {
        const rows = await db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
        if (!rows[0] || rows[0].status !== "pending") continue;

        const ap = rows[0];
        const { pendingApprovals } = await listPendingGroupApprovals(db, ap.orderId, ap.approvalType);
        if (pendingApprovals.length === 0) continue;

        const effectiveApprovedAmount = input.action === "approve"
          ? (ap.approvedAmount ?? ap.requestedAmount ?? null)
          : undefined;

        await resolveGroupApprovals(db, pendingApprovals, {
          action: input.action,
          approverId: ctx.user!.id,
          approverName: ctx.user!.name || ctx.user!.username || null,
          approverComment: input.approverComment || null,
          approvedAmount: effectiveApprovedAmount,
        });

        if (input.action === "approve") {
          const { affectedOrderIds, alreadyProcessed } = await applyApprovalSuccess(db, {
            orderId: ap.orderId,
            approvalType: ap.approvalType,
            approvedAmount: effectiveApprovedAmount,
            pendingApprovals,
          });
          if (alreadyProcessed) {
            console.log(`[batchExecute] 订单 ${ap.orderId} 已被同组审批处理，跳过重复状态更新`);
          }
          await finalizeApprovedOrders(db, affectedOrderIds.length > 0 ? affectedOrderIds : [ap.orderId]);
        } else {
          await applyApprovalReject(db, {
            orderId: ap.orderId,
            approvalType: ap.approvalType,
            previousStatus: ap.previousStatus,
            pendingApprovals,
          });
        }

        successCount++;
      } catch (e) {
        console.error(`Batch approval failed for id ${id}:`, e);
      }
    }

    await createOperationLog({
      userId: ctx.user!.id,
      userName: ctx.user!.name || ctx.user!.username || undefined,
      action: input.action === "approve" ? "batch_approve" : "batch_reject",
      targetType: "approval",
      targetId: input.ids.join(","),
      description: `批量${input.action === "approve" ? "通过" : "驳回"}审批 ${successCount}/${input.ids.length} 个`,
    });

    return { success: true, count: successCount, total: input.ids.length };
  }),

  // 待审批数量
  pendingCount: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return 0;
    const result = await db.select({ cnt: count() })
      .from(approvals)
      .innerJoin(orders, eq(approvals.orderId, orders.id))
      .where(eq(approvals.status, "pending"));
    return result[0]?.cnt ?? 0;
  }),

  // 查询某订单或组合订单的完整审批对话历史
  getHistory: protectedProcedure.input(
    z.object({
      orderId: z.number(),
    }),
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];

    const records = await db
      .select({
        id: approvals.id,
        orderId: approvals.orderId,
        approvalType: approvals.approvalType,
        status: approvals.status,
        requestedAmount: approvals.requestedAmount,
        approvedAmount: approvals.approvedAmount,
        reason: approvals.reason,
        approverComment: approvals.approverComment,
        applicantId: approvals.applicantId,
        applicantName: approvals.applicantName,
        approverId: approvals.approverId,
        approverName: approvals.approverName,
        createdAt: approvals.createdAt,
        updatedAt: approvals.updatedAt,
      })
      .from(approvals)
      .where(eq(approvals.orderId, input.orderId))
      .orderBy(asc(approvals.createdAt), asc(approvals.id));
    return records;
  }),
});
