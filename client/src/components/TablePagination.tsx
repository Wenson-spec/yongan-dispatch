import { useState, useRef } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TablePaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

export function TablePagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [100, 200, 500, 1000],
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safeCurrentPage = Math.min(page, totalPages);

  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) pages.push("...");
      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (safeCurrentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-between px-2 py-3 border-t bg-muted/20">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>共 <span className="font-medium text-foreground">{total}</span> 条</span>
        <span className="text-muted-foreground/50">|</span>
        <span>每页</span>
        <Select value={String(pageSize)} onValueChange={(v) => { onPageSizeChange(Number(v)); onPageChange(1); }}>
          <SelectTrigger className="h-7 w-[70px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((s) => (
              <SelectItem key={s} value={String(s)}>{s} 条</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={safeCurrentPage <= 1} onClick={() => onPageChange(1)}>
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={safeCurrentPage <= 1} onClick={() => onPageChange(safeCurrentPage - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        {getPageNumbers().map((p, idx) =>
          p === "..." ? (
            <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">...</span>
          ) : (
            <Button
              key={p}
              variant={p === safeCurrentPage ? "default" : "ghost"}
              size="icon"
              className={`h-7 w-7 text-xs ${p === safeCurrentPage ? "pointer-events-none" : ""}`}
              onClick={() => onPageChange(p as number)}
            >
              {p}
            </Button>
          )
        )}

        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={safeCurrentPage >= totalPages} onClick={() => onPageChange(safeCurrentPage + 1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={safeCurrentPage >= totalPages} onClick={() => onPageChange(totalPages)}>
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Hook to manage pagination state and slice data */
export function usePagination<T>(data: T[], defaultPageSize = 100) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const total = data.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedData = data.slice((safePage - 1) * pageSize, safePage * pageSize);

  const prevTotalRef = useRef(total);
  if (Math.abs(prevTotalRef.current - total) > pageSize && page > 1) {
    prevTotalRef.current = total;
  }
  prevTotalRef.current = total;

  return {
    page: safePage,
    pageSize,
    setPage,
    setPageSize,
    total,
    totalPages,
    paginatedData,
  };
}
