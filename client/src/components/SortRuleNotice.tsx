import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SortState } from "@/components/SortableTable";

interface SortRuleNoticeProps {
  defaultText: string;
  currentSort?: SortState;
  sortLabels?: Record<string, string>;
  emptyText?: string;
  className?: string;
}

function getDirectionLabel(direction: SortState["direction"]) {
  if (direction === "asc") return "升序";
  if (direction === "desc") return "倒序";
  return "默认";
}

export default function SortRuleNotice({
  defaultText,
  currentSort,
  sortLabels = {},
  emptyText = "当前使用系统默认排序",
  className,
}: SortRuleNoticeProps) {
  const activeKey = currentSort?.key || "";
  const hasCustomSort = Boolean(activeKey && currentSort?.direction);
  const currentSortText = hasCustomSort
    ? `${sortLabels[activeKey] || activeKey} · ${getDirectionLabel(currentSort?.direction ?? null)}`
    : emptyText;

  return (
    <div className={cn("mb-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-slate-300 bg-white text-[10px] text-slate-700">
          排序说明
        </Badge>
        <span>默认按{defaultText}显示</span>
      </div>
      <div className="mt-1 text-[11px] text-slate-500">当前排序：{currentSortText}</div>
    </div>
  );
}
