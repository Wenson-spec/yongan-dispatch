/**
 * 回单超期分级通知定时任务
 * 三级提醒：
 *   黄色预警（≤5天）：每3天推送一次，通知相应调度员
 *   橙色警告（5-10天）：每天推送一次，通知调度员 + 财务助理
 *   红色紧急（≥15天）：每天推送一次 + 加急标记，通知调度员 + 财务助理 + 外请主管
 */
import { getDb, getThreshold, CONFIG_KEYS } from "./db";
import { podRecords, orders, users, overdueNotifications } from "../drizzle/schema";
import { eq, or, and, inArray, desc, gte } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

// 分级标签
export const LEVEL_LABELS = {
  yellow: { label: "黄色预警", emoji: "🟡", pushIntervalDays: 3 },
  orange: { label: "橙色警告", emoji: "🟠", pushIntervalDays: 1 },
  red: { label: "红色紧急", emoji: "🔴", pushIntervalDays: 1 },
} as const;

// 默认阈值（天数）
export const DEFAULT_POD_THRESHOLDS = { yellow: 5, orange: 15, red: 15 };
export const DEFAULT_SELF_POD_THRESHOLDS = { yellow: 3, orange: 7, red: 15 };

export type OverdueLevel = "yellow" | "orange" | "red";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = DAY_MS; // 24小时
const INITIAL_DELAY_MS = 60 * 1000; // 启动后1分钟

// 从数据库读取超期回单阈值
export async function loadPodThresholds(): Promise<{ yellow: number; orange: number; red: number }> {
  try {
    const [yellow, orange, red] = await Promise.all([
      getThreshold(CONFIG_KEYS.POD_OVERDUE_YELLOW),
      getThreshold(CONFIG_KEYS.POD_OVERDUE_ORANGE),
      getThreshold(CONFIG_KEYS.POD_OVERDUE_RED),
    ]);
    return { yellow, orange, red };
  } catch {
    return { ...DEFAULT_POD_THRESHOLDS };
  }
}

// 根据超期天数判断级别（动态阈值）
export function getOverdueLevel(overdueDays: number, thresholds = DEFAULT_POD_THRESHOLDS): OverdueLevel | null {
  if (overdueDays >= thresholds.red) return "red";
  if (overdueDays >= thresholds.orange) return "orange";
  if (overdueDays >= 0) return "yellow";
  return null;
}

// 获取某级别需要通知的角色列表
export function getRolesForLevel(level: OverdueLevel): string[] {
  switch (level) {
    case "yellow":
      return ["dispatcher"]; // 相应调度员
    case "orange":
      return ["dispatcher", "finance_assistant"]; // 调度员 + 财务助理
    case "red":
      return ["dispatcher", "finance_assistant", "cs_manager"]; // 调度员 + 财务助理 + 外请主管
    default:
      return [];
  }
}

type PodOverdueBaseSnapshot = {
  createdAt: Date | string | null;
};

type OrderOverdueBaseSnapshot = {
  businessType?: string | null;
  signedDate?: Date | string | null;
};

export function getOverdueBaseAt(
  pod: PodOverdueBaseSnapshot,
  order?: OrderOverdueBaseSnapshot | null,
): Date | null {
  if (order?.businessType === "self") {
    if (!order.signedDate) return null;
    const signedAt = new Date(order.signedDate);
    return Number.isNaN(signedAt.getTime()) ? null : signedAt;
  }
  if (!pod.createdAt) return null;
  const createdAt = new Date(pod.createdAt);
  return Number.isNaN(createdAt.getTime()) ? null : createdAt;
}

export function getOverdueDaysFromBase(baseAt: Date | null, now = Date.now()): number | null {
  if (!baseAt) return null;
  return Math.floor((now - baseAt.getTime()) / DAY_MS);
}

export function getBusinessOverdueLevel(
  overdueDays: number,
  businessType?: string | null,
  thresholds = DEFAULT_POD_THRESHOLDS,
  selfThresholds = DEFAULT_SELF_POD_THRESHOLDS,
): OverdueLevel | null {
  if (businessType === "self") {
    if (overdueDays >= selfThresholds.red) return "red";
    if (overdueDays >= selfThresholds.orange) return "orange";
    if (overdueDays >= selfThresholds.yellow) return "yellow";
    return null;
  }
  return getOverdueLevel(overdueDays, thresholds);
}

// 记录已发送的通知
async function recordNotification(db: any, podId: number, orderId: number, level: OverdueLevel, recipientRole: string, recipientUserId: number | null, overdueDays: number) {
  await db.insert(overdueNotifications).values({
    podId,
    orderId,
    level,
    recipientRole,
    recipientUserId,
    overdueDays,
  });
}

export interface OverdueItem {
  podId: number;
  orderId: number;
  overdueDays: number;
  level: OverdueLevel;
  orderNumber: string | null;
  systemCode: string | null;
  customerName: string | null;
  driverName: string | null;
  plateNumber: string | null;
  originCity: string | null;
  destinationCity: string | null;
  assignedDispatcherId: number | null;
  businessType: string | null;
  signedDate: Date | null;
  overdueBaseAt: Date | null;
}

export interface CheckResult {
  notified: number;
  yellow: number;
  orange: number;
  red: number;
  items: OverdueItem[];
  notifications: Array<{ level: OverdueLevel; role: string; count: number }>;
}

export async function checkOverduePods(): Promise<CheckResult> {
  const result: CheckResult = {
    notified: 0, yellow: 0, orange: 0, red: 0,
    items: [], notifications: [],
  };

  try {
    const db = await getDb();
    if (!db) {
      console.log("[PodOverdueChecker] 数据库不可用，跳过检查");
      return result;
    }

    // 查找所有 originalStatus 为 pending 或 sent 的责任回单（未回收的）
    const allPending = await db.select().from(podRecords).where(
      and(
        eq(podRecords.podOwnership, "current_order" as any),
        or(
          eq(podRecords.originalStatus, "pending"),
          eq(podRecords.originalStatus, "sent"),
        )
      )
    );

    if (allPending.length === 0) {
      console.log("[PodOverdueChecker] 没有待回收的回单");
      return result;
    }

    const now = Date.now();

    // 批量获取所有关联订单（一次查询）
    const orderIds = Array.from(new Set(allPending.map(p => p.orderId)));
      const orderRows = orderIds.length > 0
      ? await db.select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          systemCode: orders.systemCode,
          customerName: orders.customerName,
          driverName: orders.driverName,
          plateNumber: orders.plateNumber,
          originCity: orders.originCity,
          destinationCity: orders.destinationCity,
          assignedDispatcherId: orders.assignedDispatcherId,
          businessType: orders.businessType,
          signedDate: orders.signedDate,
        }).from(orders).where(and(
          inArray(orders.id, orderIds),
          eq(orders.podOwnership, "current_order" as any),
        ))
      : [];

    const orderMap = new Map(orderRows.map(o => [o.id, o]));

    // 构建超期列表
    const overdueItems: OverdueItem[] = [];
    for (const pod of allPending) {
      const order = orderMap.get(pod.orderId) || null;
      if (!order) continue;
      const overdueBaseAt = getOverdueBaseAt(pod, order);
      const overdueDays = getOverdueDaysFromBase(overdueBaseAt, now);
      if (overdueDays === null) continue;
      const level = getBusinessOverdueLevel(overdueDays, order?.businessType || null);
      if (!level) continue;

      overdueItems.push({
        podId: pod.id,
        orderId: pod.orderId,
        overdueDays,
        level,
        orderNumber: order?.orderNumber || null,
        systemCode: order?.systemCode || null,
        customerName: order?.customerName || null,
        driverName: order?.driverName || null,
        plateNumber: order?.plateNumber || null,
        originCity: order?.originCity || null,
        destinationCity: order?.destinationCity || null,
        assignedDispatcherId: order?.assignedDispatcherId || null,
        businessType: order?.businessType || null,
        signedDate: order?.signedDate || null,
        overdueBaseAt,
      });
    }

    if (overdueItems.length === 0) {
      console.log("[PodOverdueChecker] 没有超期回单");
      return result;
    }

    // 按级别分组
    const yellowItems = overdueItems.filter(i => i.level === "yellow");
    const orangeItems = overdueItems.filter(i => i.level === "orange");
    const redItems = overdueItems.filter(i => i.level === "red");

    result.yellow = yellowItems.length;
    result.orange = orangeItems.length;
    result.red = redItems.length;
    result.items = overdueItems;

    console.log(`[PodOverdueChecker] 发现超期回单: 黄色${yellowItems.length}个, 橙色${orangeItems.length}个, 红色${redItems.length}个`);

    // 批量获取最近的通知记录（一次查询代替N次查询）
    const podIds = overdueItems.map(i => i.podId);
    // 查询最短频率间隔内的所有通知记录（黄色3天，橙/红1天，取最短1天）
    const minCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3天内的所有记录
    const recentNotifications = podIds.length > 0
      ? await db.select().from(overdueNotifications).where(
          and(
            inArray(overdueNotifications.podId, podIds),
            gte(overdueNotifications.sentAt, minCutoff),
          )
        )
      : [];

    // 构建已通知的快速查找集合: key = `${podId}_${level}_${recipientRole}`
    const notifiedSet = new Map<string, Date>();
    for (const n of recentNotifications) {
      const key = `${n.podId}_${n.level}_${n.recipientRole}`;
      const existing = notifiedSet.get(key);
      if (!existing || new Date(n.sentAt) > existing) {
        notifiedSet.set(key, new Date(n.sentAt));
      }
    }

    // 频率控制检查（内存中完成，不再查数据库）
    const shouldPushFast = (podId: number, level: OverdueLevel, recipientRole: string): boolean => {
      const config = LEVEL_LABELS[level];
      const intervalMs = config.pushIntervalDays * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - intervalMs;
      const key = `${podId}_${level}_${recipientRole}`;
      const lastSent = notifiedSet.get(key);
      if (!lastSent) return true;
      return lastSent.getTime() < cutoffTime;
    };

    // 获取所有财务助理和外请主管的用户列表
    const financeUsers = await db.select({ id: users.id, name: users.name, username: users.username })
      .from(users)
      .where(and(eq(users.role, "finance_assistant"), eq(users.isActive, true)));

    const csManagerUsers = await db.select({ id: users.id, name: users.name, username: users.username })
      .from(users)
      .where(and(eq(users.role, "cs_manager"), eq(users.isActive, true)));

    // 通知统计
    const notificationStats: Record<string, Record<string, number>> = {
      yellow: {}, orange: {}, red: {},
    };

    // 批量收集需要插入的通知记录
    const toInsert: Array<{
      podId: number; orderId: number; level: OverdueLevel;
      recipientRole: string; recipientUserId: number | null; overdueDays: number;
    }> = [];

    // 处理每个超期回单的通知
    for (const item of overdueItems) {
      const roles = getRolesForLevel(item.level);

      for (const role of roles) {
        if (role === "dispatcher") {
          if (!item.assignedDispatcherId) continue;
          const roleKey = `dispatcher_${item.assignedDispatcherId}`;
          if (shouldPushFast(item.podId, item.level, roleKey)) {
            toInsert.push({
              podId: item.podId, orderId: item.orderId, level: item.level,
              recipientRole: roleKey, recipientUserId: item.assignedDispatcherId, overdueDays: item.overdueDays,
            });
            notificationStats[item.level][roleKey] = (notificationStats[item.level][roleKey] || 0) + 1;
            result.notified++;
          }
        } else if (role === "finance_assistant") {
          for (const fu of financeUsers) {
            const roleKey = `finance_${fu.id}`;
            if (shouldPushFast(item.podId, item.level, roleKey)) {
              toInsert.push({
                podId: item.podId, orderId: item.orderId, level: item.level,
                recipientRole: roleKey, recipientUserId: fu.id, overdueDays: item.overdueDays,
              });
              notificationStats[item.level][roleKey] = (notificationStats[item.level][roleKey] || 0) + 1;
              result.notified++;
            }
          }
        } else if (role === "cs_manager") {
          for (const cm of csManagerUsers) {
            const roleKey = `cs_manager_${cm.id}`;
            if (shouldPushFast(item.podId, item.level, roleKey)) {
              toInsert.push({
                podId: item.podId, orderId: item.orderId, level: item.level,
                recipientRole: roleKey, recipientUserId: cm.id, overdueDays: item.overdueDays,
              });
              notificationStats[item.level][roleKey] = (notificationStats[item.level][roleKey] || 0) + 1;
              result.notified++;
            }
          }
        }
      }
    }

    // 批量插入通知记录（分批，每批50条）
    if (toInsert.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < toInsert.length; i += batchSize) {
        const batch = toInsert.slice(i, i + batchSize);
        await db.insert(overdueNotifications).values(batch);
      }
    }

    // 汇总通知统计
    for (const [level, roleMap] of Object.entries(notificationStats)) {
      for (const [role, count] of Object.entries(roleMap)) {
        if (count > 0) {
          result.notifications.push({ level: level as OverdueLevel, role, count });
        }
      }
    }

    // 构建汇总通知发送给项目所有者（notifyOwner）
    if (result.notified > 0) {
      try {
        const buildSection = (items: OverdueItem[], config: { label: string; emoji: string }) => {
          if (items.length === 0) return "";
          const lines = items
            .sort((a, b) => b.overdueDays - a.overdueDays)
            .slice(0, 15)
            .map(item => {
              const orderNo = item.orderNumber || item.systemCode || `#${item.orderId}`;
              const customer = item.customerName || "未知客户";
              const route = `${item.originCity || "?"} → ${item.destinationCity || "?"}`;
              return `  ${config.emoji} ${orderNo}（${customer}，${route}）超期 ${item.overdueDays} 天`;
            });
          return `\n【${config.label}】共 ${items.length} 个：\n${lines.join("\n")}${items.length > 15 ? `\n  ...及其他 ${items.length - 15} 个` : ""}`;
        };

        const title = redItems.length > 0
          ? `🚨 紧急：${redItems.length} 个回单超期≥15天未回收`
          : orangeItems.length > 0
            ? `⚠️ 警告：${orangeItems.length} 个回单超期5-15天未回收`
            : `🟡 提醒：${yellowItems.length} 个回单超期≤5天未回收`;

        const content = `回单超期分级提醒汇总：${buildSection(redItems, LEVEL_LABELS.red)}${buildSection(orangeItems, LEVEL_LABELS.orange)}${buildSection(yellowItems, LEVEL_LABELS.yellow)}\n\n共 ${overdueItems.length} 个超期回单，已向相关人员推送 ${result.notified} 条通知。`;

        await notifyOwner({ title, content });
        console.log(`[PodOverdueChecker] 汇总通知已发送`);
      } catch (e) {
        console.warn("[PodOverdueChecker] 汇总通知发送失败:", e);
      }
    }

    console.log(`[PodOverdueChecker] 完成检查，共推送 ${result.notified} 条通知`);
    return result;
  } catch (error) {
    console.error("[PodOverdueChecker] 检查失败:", error);
    return result;
  }
}

// 获取超期回单列表（带分级信息）- 优化为批量查询
export async function getOverdueList(overdueDays: number = 0, businessType?: string): Promise<OverdueItem[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const allPending = await db.select().from(podRecords).where(
      and(
        eq(podRecords.podOwnership, "current_order" as any),
        or(
          eq(podRecords.originalStatus, "pending"),
          eq(podRecords.originalStatus, "sent"),
        )
      )
    );

    const now = Date.now();
    const thresholdMs = overdueDays * DAY_MS;

    // 先批量获取关联订单，再按业务口径计算超期基准
    const allOrderIds = Array.from(new Set(allPending.map(p => p.orderId)));
    if (allOrderIds.length === 0) return [];
    const orderConditions = [
      inArray(orders.id, allOrderIds),
      eq(orders.podOwnership, "current_order" as any),
    ];
    if (businessType) {
      orderConditions.push(eq(orders.businessType, businessType as any));
    }
    const orderRows = await db.select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      systemCode: orders.systemCode,
      customerName: orders.customerName,
      driverName: orders.driverName,
      originCity: orders.originCity,
      destinationCity: orders.destinationCity,
      assignedDispatcherId: orders.assignedDispatcherId,
      plateNumber: orders.plateNumber,
      businessType: orders.businessType,
      signedDate: orders.signedDate,
    }).from(orders).where(and(...orderConditions));
    const orderMap = new Map(orderRows.map(o => [o.id, o]));

    // 先筛选达到阈值且符合业务类型的回单
    const filteredPods = allPending.filter(pod => {
      const order = orderMap.get(pod.orderId) || null;
      if (!order) return false;
      const overdueBaseAt = getOverdueBaseAt(pod, order);
      if (!overdueBaseAt) return false;
      return (now - overdueBaseAt.getTime()) > thresholdMs;
    });

    if (filteredPods.length === 0) return [];

    // orderMap 已按 businessType 过滤，这里直接复用即可
    const items: OverdueItem[] = filteredPods.map(pod => {
      const order = orderMap.get(pod.orderId) || null;
      const overdueBaseAt = getOverdueBaseAt(pod, order);
      const days = getOverdueDaysFromBase(overdueBaseAt, now);
      const level = days === null ? null : getBusinessOverdueLevel(days, order?.businessType || null);

      return {
        podId: pod.id,
        orderId: pod.orderId,
        overdueDays: days ?? 0,
        level: level as OverdueLevel,
        orderNumber: order?.orderNumber || null,
        systemCode: order?.systemCode || null,
        customerName: order?.customerName || null,
        driverName: order?.driverName || null,
        plateNumber: order?.plateNumber || null,
        originCity: order?.originCity || null,
        destinationCity: order?.destinationCity || null,
        assignedDispatcherId: order?.assignedDispatcherId || null,
        businessType: order?.businessType || null,
        signedDate: order?.signedDate || null,
        overdueBaseAt,
      };
    }).filter(i => i.level !== null)
      .filter(i => orderMap.has(i.orderId)); // 当按businessType筛选时，过滤掉不匹配的订单

    return items.sort((a, b) => b.overdueDays - a.overdueDays);
  } catch (error) {
    console.error("[PodOverdueChecker] getOverdueList失败:", error);
    return [];
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startPodOverdueChecker() {
  console.log(`[PodOverdueChecker] 分级通知定时任务已启动（黄色≤5天/橙色5-15天/红色≥15天）`);

  setTimeout(() => {
    checkOverduePods();
  }, INITIAL_DELAY_MS);

  intervalId = setInterval(() => {
    checkOverduePods();
  }, CHECK_INTERVAL_MS);
}

export function stopPodOverdueChecker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[PodOverdueChecker] 定时任务已停止");
  }
}
