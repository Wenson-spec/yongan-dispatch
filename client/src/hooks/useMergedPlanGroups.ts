import { useState, useMemo, useCallback } from "react";

/**
 * 通用合并计划号分组Hook
 * 用于在各工位中实现合并计划号的展开/折叠分组显示
 */
export function useMergedPlanGroups<T extends { mergedPlanNumber?: string | null }>(
  items: T[] | undefined,
  enabled: boolean = true
) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // 分组逻辑
  const groupedData = useMemo(() => {
    if (!enabled || !items) return null;
    const groups = new Map<string, T[]>();
    const ungrouped: T[] = [];
    for (const item of items) {
      if (item.mergedPlanNumber) {
        const key = item.mergedPlanNumber;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      } else {
        ungrouped.push(item);
      }
    }
    return { groups, ungrouped };
  }, [enabled, items]);

  // 是否有分组数据
  const hasGroups = useMemo(() => {
    if (!groupedData) return false;
    return groupedData.groups.size > 0;
  }, [groupedData]);

  // 切换展开/折叠
  const toggleGroup = useCallback((planNumber: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(planNumber)) next.delete(planNumber);
      else next.add(planNumber);
      return next;
    });
  }, []);

  // 全部展开
  const expandAll = useCallback(() => {
    if (!groupedData) return;
    setExpandedGroups(new Set(Array.from(groupedData.groups.keys())));
  }, [groupedData]);

  // 全部折叠
  const collapseAll = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  // 列表模式下的合并计划号索引（用于视觉标识）
  const planNumberIndex = useMemo(() => {
    if (!items) return new Map<string, number[]>();
    const index = new Map<string, number[]>();
    items.forEach((item, idx) => {
      if (item.mergedPlanNumber) {
        if (!index.has(item.mergedPlanNumber)) index.set(item.mergedPlanNumber, []);
        index.get(item.mergedPlanNumber)!.push(idx);
      }
    });
    return index;
  }, [items]);

  // 为合并计划号分配颜色
  const PLAN_COLORS = [
    { bg: "bg-blue-50/60", border: "border-l-blue-500", text: "text-blue-700", badge: "bg-blue-100 text-blue-700 border-blue-300" },
    { bg: "bg-indigo-50/60", border: "border-l-indigo-500", text: "text-indigo-700", badge: "bg-indigo-100 text-indigo-700 border-indigo-300" },
    { bg: "bg-violet-50/60", border: "border-l-violet-500", text: "text-violet-700", badge: "bg-violet-100 text-violet-700 border-violet-300" },
    { bg: "bg-cyan-50/60", border: "border-l-cyan-500", text: "text-cyan-700", badge: "bg-cyan-100 text-cyan-700 border-cyan-300" },
    { bg: "bg-teal-50/60", border: "border-l-teal-500", text: "text-teal-700", badge: "bg-teal-100 text-teal-700 border-teal-300" },
  ];

  const planColorMap = useMemo(() => {
    const map = new Map<string, typeof PLAN_COLORS[0]>();
    let colorIdx = 0;
    planNumberIndex.forEach((_, planNum) => {
      map.set(planNum, PLAN_COLORS[colorIdx % PLAN_COLORS.length]);
      colorIdx++;
    });
    return map;
  }, [planNumberIndex]);

  return {
    groupedData,
    hasGroups,
    expandedGroups,
    toggleGroup,
    expandAll,
    collapseAll,
    planNumberIndex,
    planColorMap,
    PLAN_COLORS,
  };
}
