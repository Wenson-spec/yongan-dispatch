/**
 * 调度员积压预警定时任务
 * 三级预警：
 *   黄色预警（积压≥5单）：每天通知一次
 *   橙色预警（积压≥10单）：每天通知一次，通知调度员 + 客服经理
 *   红色预警（积压≥15单）：每天通知一次，通知调度员 + 客服经理 + 管理员
 */
import { getDb, getThreshold, CONFIG_KEYS } from "./db";
import { orders, users } from "../drizzle/schema";
import { eq, and, or, inArray, isNotNull, count } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

// 分级阈值标签（min值从数据库动态读取）
export const BACKLOG_LABELS = {
  yellow: { label: "黄色预警", emoji: "🟡" },
  orange: { label: "橙色预警", emoji: "🟠" },
  red: { label: "红色紧急", emoji: "🔴" },
} as const;

// 默认阈值（数据库无配置时的兜底值）
export const DEFAULT_BACKLOG_THRESHOLDS = { yellow: 5, orange: 10, red: 15 };

export type BacklogLevel = "yellow" | "orange" | "red" | null;

const CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000; // 每2小时检查一次
const INITIAL_DELAY_MS = 2 * 60 * 1000; // 启动后2分钟
const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 同一调度员同一级别24小时内不重复通知

// 从数据库读取阈值
export async function loadThresholds(): Promise<{ yellow: number; orange: number; red: number }> {
  try {
    const [yellow, orange, red] = await Promise.all([
      getThreshold(CONFIG_KEYS.BACKLOG_YELLOW),
      getThreshold(CONFIG_KEYS.BACKLOG_ORANGE),
      getThreshold(CONFIG_KEYS.BACKLOG_RED),
    ]);
    return { yellow, orange, red };
  } catch {
    return { ...DEFAULT_BACKLOG_THRESHOLDS };
  }
}

// 根据积压数判断级别（使用动态阈值）
export function getBacklogLevel(backlogCount: number, thresholds = DEFAULT_BACKLOG_THRESHOLDS): BacklogLevel {
  if (backlogCount >= thresholds.red) return "red";
  if (backlogCount >= thresholds.orange) return "orange";
  if (backlogCount >= thresholds.yellow) return "yellow";
  return null;
}

// 获取级别对应的通知目标
export function getNotifyTargets(level: BacklogLevel): string[] {
  switch (level) {
    case "yellow":
      return ["owner"]; // 仅通知项目所有者
    case "orange":
      return ["owner", "cs_manager"]; // 通知所有者 + 客服经理
    case "red":
      return ["owner", "cs_manager", "admin"]; // 通知所有者 + 客服经理 + 管理员
    default:
      return [];
  }
}

export interface BacklogAlertItem {
  dispatcherId: number;
  dispatcherName: string;
  role: string;
  roleLabel: string;
  backlogCount: number;
  level: BacklogLevel;
}

export interface BacklogCheckResult {
  checked: number;
  alerted: number;
  yellow: number;
  orange: number;
  red: number;
  items: BacklogAlertItem[];
}

// 通知冷却记录（内存中，服务重启后重置）
const lastNotifyMap = new Map<string, number>(); // key: `${dispatcherId}_${level}`, value: timestamp

function shouldNotify(dispatcherId: number, level: string): boolean {
  const key = `${dispatcherId}_${level}`;
  const lastTime = lastNotifyMap.get(key);
  if (!lastTime) return true;
  return Date.now() - lastTime >= NOTIFY_COOLDOWN_MS;
}

function recordNotify(dispatcherId: number, level: string) {
  const key = `${dispatcherId}_${level}`;
  lastNotifyMap.set(key, Date.now());
}

export async function checkDispatcherBacklog(overrideThresholds?: { yellow: number; orange: number; red: number }): Promise<BacklogCheckResult> {
  const result: BacklogCheckResult = {
    checked: 0, alerted: 0,
    yellow: 0, orange: 0, red: 0,
    items: [],
  };

  try {
    const db = await getDb();
    if (!db) {
      console.log("[BacklogChecker] 数据库不可用，跳过检查");
      return result;
    }

    // 1. 获取所有活跃调度员
    const dispatcherRows = await db.select({
      id: users.id,
      name: users.name,
      role: users.role,
    }).from(users).where(
      and(
        or(
          eq(users.role, "ltl_dispatcher"),
          eq(users.role, "outsource_dispatcher"),
          eq(users.role, "fleet_dispatcher"),
        ),
        eq(users.isActive, true),
      )
    );

    if (dispatcherRows.length === 0) {
      console.log("[BacklogChecker] 没有活跃调度员，跳过检查");
      return result;
    }

    // 从数据库读取阈值
    const thresholds = overrideThresholds ?? await loadThresholds();

    result.checked = dispatcherRows.length;
    const dIds = dispatcherRows.map(d => d.id);

    // 角色→businessType映射：确保每个调度员只统计对应分流类型的订单
    const ROLE_BT_MAP: Record<string, string> = {
      outsource_dispatcher: "outsource",
      ltl_dispatcher: "ltl",
      fleet_dispatcher: "self",
    };
    const dispatcherRoleMap = new Map(dispatcherRows.map(d => [d.id, d.role]));

    // 2. 查询各调度员积压订单数（未完成状态）- 按businessType分组
    const pendingStatuses = [
      "pending_price", "pending_approval", "pending_vehicle",
      "pending_dispatch", "pending_inquiry", "inquiry_confirmed",
    ] as const;

    const backlogRows = await db.select({
      dispatcherId: orders.assignedDispatcherId,
      businessType: orders.businessType,
      backlogCount: count(),
    }).from(orders).where(
      and(
        inArray(orders.assignedDispatcherId, dIds),
        isNotNull(orders.assignedDispatcherId),
        inArray(orders.status, pendingStatuses),
      )
    ).groupBy(orders.assignedDispatcherId, orders.businessType);

    // 按角色过滤后汇总积压数
    const backlogMap = new Map<number, number>();
    for (const r of backlogRows) {
      if (!r.dispatcherId) continue;
      const role = dispatcherRoleMap.get(r.dispatcherId);
      const expectedBt = role ? ROLE_BT_MAP[role] : null;
      // 只统计与调度员角色匹配的businessType订单
      if (expectedBt && (r as any).businessType !== expectedBt) continue;
      backlogMap.set(r.dispatcherId, (backlogMap.get(r.dispatcherId) || 0) + Number(r.backlogCount));
    }

    // 3. 检查每个调度员的积压情况
    const alertItems: BacklogAlertItem[] = [];

    for (const d of dispatcherRows) {
      const backlog = backlogMap.get(d.id) || 0;
      const level = getBacklogLevel(backlog, thresholds);
      if (!level) continue;

      const roleLabel = d.role === "ltl_dispatcher" ? "零担" :
        d.role === "outsource_dispatcher" ? "外请" :
        d.role === "fleet_dispatcher" ? "车队" : "调度";

      alertItems.push({
        dispatcherId: d.id,
        dispatcherName: d.name || `调度员${d.id}`,
        role: d.role!,
        roleLabel,
        backlogCount: backlog,
        level,
      });
    }

    if (alertItems.length === 0) {
      console.log("[BacklogChecker] 所有调度员积压正常，无需预警");
      return result;
    }

    // 按积压数降序排列
    alertItems.sort((a, b) => b.backlogCount - a.backlogCount);
    result.items = alertItems;

    // 统计各级别
    const yellowItems = alertItems.filter(i => i.level === "yellow");
    const orangeItems = alertItems.filter(i => i.level === "orange");
    const redItems = alertItems.filter(i => i.level === "red");
    result.yellow = yellowItems.length;
    result.orange = orangeItems.length;
    result.red = redItems.length;

    console.log(`[BacklogChecker] 发现积压预警: 黄色${yellowItems.length}人, 橙色${orangeItems.length}人, 红色${redItems.length}人`);

    // 4. 发送汇总通知（冷却控制）
    const needNotifyItems = alertItems.filter(item =>
      shouldNotify(item.dispatcherId, item.level!)
    );

    if (needNotifyItems.length === 0) {
      console.log("[BacklogChecker] 所有预警均在冷却期内，跳过通知");
      return result;
    }

    // 构建汇总通知
    const buildSection = (items: BacklogAlertItem[], config: { label: string; emoji: string }) => {
      if (items.length === 0) return "";
      const lines = items.map(item =>
        `  ${config.emoji} ${item.dispatcherName}（${item.roleLabel}）积压 ${item.backlogCount} 单`
      );
      return `\n【${config.label}】共 ${items.length} 人：\n${lines.join("\n")}`;
    };

    const needNotifyRed = needNotifyItems.filter(i => i.level === "red");
    const needNotifyOrange = needNotifyItems.filter(i => i.level === "orange");
    const needNotifyYellow = needNotifyItems.filter(i => i.level === "yellow");

    const title = needNotifyRed.length > 0
      ? `🚨 紧急：${needNotifyRed.length} 名调度员积压≥${thresholds.red}单`
      : needNotifyOrange.length > 0
        ? `⚠️ 警告：${needNotifyOrange.length} 名调度员积压≥${thresholds.orange}单`
        : `📋 提醒：${needNotifyYellow.length} 名调度员积压≥${thresholds.yellow}单`;

    const content = [
      `调度员积压预警报告（${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}）`,
      buildSection(needNotifyRed, BACKLOG_LABELS.red),
      buildSection(needNotifyOrange, BACKLOG_LABELS.orange),
      buildSection(needNotifyYellow, BACKLOG_LABELS.yellow),
      `\n共 ${needNotifyItems.length} 人需要关注，请及时协调分配订单。`,
    ].filter(Boolean).join("\n");

    try {
      await notifyOwner({ title, content });
      // 记录冷却
      for (const item of needNotifyItems) {
        recordNotify(item.dispatcherId, item.level!);
      }
      result.alerted = needNotifyItems.length;
      console.log(`[BacklogChecker] 预警通知已发送，涉及 ${needNotifyItems.length} 名调度员`);
    } catch (e) {
      console.warn("[BacklogChecker] 通知发送失败:", e);
    }

    return result;
  } catch (error) {
    console.error("[BacklogChecker] 检查失败:", error);
    return result;
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startBacklogChecker() {
  console.log(`[BacklogChecker] 积压预警定时任务已启动（阈值从数据库读取，每2小时检查）`);

  setTimeout(() => {
    checkDispatcherBacklog();
  }, INITIAL_DELAY_MS);

  intervalId = setInterval(() => {
    checkDispatcherBacklog();
  }, CHECK_INTERVAL_MS);
}

export function stopBacklogChecker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[BacklogChecker] 定时任务已停止");
  }
}
