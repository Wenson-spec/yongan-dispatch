import React, { useState, useMemo } from "react";
import { TableHead } from "@/components/ui/table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc" | null;

export interface SortState {
  key: string;
  direction: SortDirection;
}

/**
 * 通用排序 hook
 * @param data 原始数据数组
 * @param getters 字段取值函数映射（key -> 从数据项中取出排序值的函数）
 * @param defaultSort 默认排序（可选）
 */
export function useTableSort<T>(
  data: T[],
  getters: Record<string, (item: T) => string | number | boolean | null | undefined>,
  defaultSort?: SortState
) {
  const [sort, setSort] = useState<SortState>(defaultSort ?? { key: "", direction: null });

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      if (prev.direction === "desc") return { key: "", direction: null };
      return { key, direction: "asc" };
    });
  };

  const sorted = useMemo(() => {
    if (!sort.key || !sort.direction || !getters[sort.key]) return data;
    const getter = getters[sort.key];
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      // null/undefined 排最后
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      // 数字比较
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      // 布尔比较
      if (typeof va === "boolean" && typeof vb === "boolean") return ((va ? 1 : 0) - (vb ? 1 : 0)) * dir;
      // 字符串比较
      return String(va).localeCompare(String(vb), "zh-CN") * dir;
    });
  }, [data, sort, getters]);

  return { sorted, sort, toggleSort };
}

/**
 * 可排序表头单元格
 */
interface SortableHeaderProps {
  sortKey: string;
  currentSort: SortState;
  onToggle: (key: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function SortableHeader({ sortKey, currentSort, onToggle, children, className }: SortableHeaderProps) {
  const isActive = currentSort.key === sortKey && currentSort.direction !== null;
  return (
    <TableHead
      className={cn("cursor-pointer select-none hover:bg-muted/50 transition-colors", className)}
      onClick={() => onToggle(sortKey)}
    >
      <div className="flex items-center gap-1">
        <span>{children}</span>
        {isActive ? (
          currentSort.direction === "asc" ? (
            <ArrowUp className="h-3 w-3 text-foreground" />
          ) : (
            <ArrowDown className="h-3 w-3 text-foreground" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
        )}
      </div>
    </TableHead>
  );
}
