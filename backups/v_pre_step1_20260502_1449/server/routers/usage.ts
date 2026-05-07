import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { users, operationLogs, orders } from "../../drizzle/schema";
import { eq, sql, desc, gte, and, count } from "drizzle-orm";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "cs_manager") {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员和客服经理可查看" });
  }
  return next({ ctx });
});

export const usageRouter = router({
  // 用户活跃度统计
  getUserActivity: adminProcedure.input(
    z.object({
      days: z.number().min(1).max(365).default(30),
    }).optional(),
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库不可用" });

    const days = input?.days || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // 获取所有用户
    const allUsers = await db.select({
      id: users.id,
      name: users.name,
      username: users.username,
      role: users.role,
      isActive: users.isActive,
      lastSignedIn: users.lastSignedIn,
      createdAt: users.createdAt,
    }).from(users);

    // 获取每个用户的操作次数
    const opCounts = await db.select({
      userId: operationLogs.userId,
      count: count(),
    })
      .from(operationLogs)
      .where(gte(operationLogs.createdAt, since))
      .groupBy(operationLogs.userId);

    const opCountMap = new Map(opCounts.map(o => [o.userId, o.count]));

    // 获取每个用户创建的订单数
    const orderCounts = await db.select({
      createdBy: orders.createdBy,
      count: count(),
    })
      .from(orders)
      .where(gte(orders.createdAt, since))
      .groupBy(orders.createdBy);

    const orderCountMap = new Map(orderCounts.map(o => [o.createdBy ?? 0, o.count]));

    // 获取每个用户的操作类型分布
    const opTypes = await db.select({
      userId: operationLogs.userId,
      action: operationLogs.action,
      count: count(),
    })
      .from(operationLogs)
      .where(gte(operationLogs.createdAt, since))
      .groupBy(operationLogs.userId, operationLogs.action);

    const opTypeMap = new Map<number, Record<string, number>>();
    for (const row of opTypes) {
      const uid = row.userId ?? 0;
      if (!opTypeMap.has(uid)) opTypeMap.set(uid, {});
      opTypeMap.get(uid)![row.action] = row.count;
    }

    return allUsers.map(u => ({
      id: u.id,
      name: u.name || u.username || "未知",
      role: u.role,
      isActive: u.isActive,
      lastSignedIn: u.lastSignedIn,
      createdAt: u.createdAt,
      operationCount: opCountMap.get(u.id) || 0,
      orderCount: orderCountMap.get(u.id) || 0,
      actionBreakdown: opTypeMap.get(u.id) || {},
    })).sort((a, b) => b.operationCount - a.operationCount);
  }),

  // 系统整体使用趋势（按天）
  getDailyTrend: adminProcedure.input(
    z.object({
      days: z.number().min(7).max(90).default(30),
    }).optional(),
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库不可用" });

    const days = input?.days || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // 每日操作量
    const dailyOps = await db.select({
      date: sql<string>`DATE(${operationLogs.createdAt})`.as("date"),
      count: count(),
    })
      .from(operationLogs)
      .where(gte(operationLogs.createdAt, since))
      .groupBy(sql`DATE(${operationLogs.createdAt})`)
      .orderBy(sql`DATE(${operationLogs.createdAt})`);

    // 每日新建订单数
    const dailyOrders = await db.select({
      date: sql<string>`DATE(${orders.createdAt})`.as("date"),
      count: count(),
    })
      .from(orders)
      .where(gte(orders.createdAt, since))
      .groupBy(sql`DATE(${orders.createdAt})`)
      .orderBy(sql`DATE(${orders.createdAt})`);

    // 活跃用户数（每日有操作的不同用户）
    const dailyActiveUsers = await db.select({
      date: sql<string>`DATE(${operationLogs.createdAt})`.as("date"),
      count: sql<number>`COUNT(DISTINCT ${operationLogs.userId})`.as("count"),
    })
      .from(operationLogs)
      .where(gte(operationLogs.createdAt, since))
      .groupBy(sql`DATE(${operationLogs.createdAt})`)
      .orderBy(sql`DATE(${operationLogs.createdAt})`);

    return {
      dailyOperations: dailyOps,
      dailyOrders: dailyOrders,
      dailyActiveUsers: dailyActiveUsers,
    };
  }),

  // 操作类型统计
  getActionStats: adminProcedure.input(
    z.object({
      days: z.number().min(1).max(365).default(30),
    }).optional(),
  ).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库不可用" });

    const days = input?.days || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const actionStats = await db.select({
      action: operationLogs.action,
      count: count(),
    })
      .from(operationLogs)
      .where(gte(operationLogs.createdAt, since))
      .groupBy(operationLogs.action)
      .orderBy(desc(count()));

    return actionStats;
  }),
});
