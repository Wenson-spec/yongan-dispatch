import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 格式化金额显示：统一保疙2位小数
 * 900.0000 → ¥900.00
 * 4200.5000 → ¥4200.50
 * 578.4000 → ¥578.40
 * 123.45 → ¥123.45
 */
export function formatMoney(value: string | number | null | undefined, prefix = "¥"): string {
  if (value === null || value === undefined || value === "") return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return `${prefix}${num.toFixed(2)}`;
}

/**
 * 合并计划号分组工具
 * 将订单按合并计划号分组，没有合并计划号的单独一组
 * 返回 OrderGroup[] 数组，每个 group 包含：
 *  - planNumber: 合并计划号（null 表示无合并计划号的单独订单）
 *  - orders: 该组下的所有订单
 *  - totalWeight: 总重量
 *  - orderCount: 子单数量
 */
export interface OrderGroup<T = any> {
  planNumber: string | null;
  orders: T[];
  totalWeight: number;
  orderCount: number;
}

export function groupOrdersByPlan<T extends { mergedPlanNumber?: string | null; weight?: string | number | null }>(orders: T[]): OrderGroup<T>[] {
  const planMap = new Map<string, T[]>();
  const ungrouped: T[] = [];

  for (const order of orders) {
    if (order.mergedPlanNumber) {
      const key = order.mergedPlanNumber;
      if (!planMap.has(key)) planMap.set(key, []);
      planMap.get(key)!.push(order);
    } else {
      ungrouped.push(order);
    }
  }

  const groups: OrderGroup<T>[] = [];

  // 先添加有合并计划号的组
  planMap.forEach((groupOrders, planNumber) => {
    const totalWeight = groupOrders.reduce((sum, o) => {
      const w = typeof o.weight === 'string' ? parseFloat(o.weight) : (o.weight || 0);
      return sum + (isNaN(w) ? 0 : w);
    }, 0);
    groups.push({
      planNumber,
      orders: groupOrders,
      totalWeight,
      orderCount: groupOrders.length,
    });
  });

  // 再添加没有合并计划号的单独订单（每个单独一组）
  for (const order of ungrouped) {
    const w = typeof order.weight === 'string' ? parseFloat(order.weight) : (order.weight || 0);
    groups.push({
      planNumber: null,
      orders: [order],
      totalWeight: isNaN(w) ? 0 : w,
      orderCount: 1,
    });
  }

  return groups;
}

/** 合并计划号颜色方案 */
export const PLAN_GROUP_COLORS = [
  { bg: "bg-blue-50/60", border: "border-l-blue-500", text: "text-blue-700", badge: "bg-blue-100 text-blue-700 border-blue-300" },
  { bg: "bg-indigo-50/60", border: "border-l-indigo-500", text: "text-indigo-700", badge: "bg-indigo-100 text-indigo-700 border-indigo-300" },
  { bg: "bg-violet-50/60", border: "border-l-violet-500", text: "text-violet-700", badge: "bg-violet-100 text-violet-700 border-violet-300" },
  { bg: "bg-cyan-50/60", border: "border-l-cyan-500", text: "text-cyan-700", badge: "bg-cyan-100 text-cyan-700 border-cyan-300" },
  { bg: "bg-teal-50/60", border: "border-l-teal-500", text: "text-teal-700", badge: "bg-teal-100 text-teal-700 border-teal-300" },
];

export function getPlanColor(planNumber: string, planColorMap: Map<string, typeof PLAN_GROUP_COLORS[0]>) {
  if (planColorMap.has(planNumber)) return planColorMap.get(planNumber)!;
  const idx = planColorMap.size % PLAN_GROUP_COLORS.length;
  const color = PLAN_GROUP_COLORS[idx];
  planColorMap.set(planNumber, color);
  return color;
}
