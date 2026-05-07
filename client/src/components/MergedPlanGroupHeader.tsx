import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, ChevronDown, ChevronRight, Layers, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/orderStatus";

const STAGE_BADGE_TONE: Record<string, string> = {
  pending_assign: "border-yellow-200 bg-yellow-50 text-yellow-800",
  pending_price: "border-blue-200 bg-blue-50 text-blue-700",
  pending_dispatch: "border-orange-200 bg-orange-50 text-orange-700",
  pending_vehicle: "border-violet-200 bg-violet-50 text-violet-700",
  pending_approval: "border-amber-200 bg-amber-50 text-amber-700",
  pending_inquiry: "border-cyan-200 bg-cyan-50 text-cyan-700",
  inquiry_confirmed: "border-sky-200 bg-sky-50 text-sky-700",
  priced: "border-indigo-200 bg-indigo-50 text-indigo-700",
  dispatched: "border-blue-200 bg-blue-50 text-blue-700",
  in_transit: "border-emerald-200 bg-emerald-50 text-emerald-700",
  delivered: "border-green-200 bg-green-50 text-green-700",
  signed: "border-lime-200 bg-lime-50 text-lime-700",
  settled: "border-teal-200 bg-teal-50 text-teal-700",
  on_hold: "border-amber-200 bg-amber-50 text-amber-700",
  cancelled: "border-slate-200 bg-slate-50 text-slate-600",
};

type OrderLike = {
  id?: number | string | null;
  orderNumber?: string | null;
  mergedPlanNumber?: string | null;
  status?: string | null;
  weight?: string | number | null;
  destinationCity?: string | null;
  isUrgent?: boolean | null;
  urgentReason?: string | null;
  urgentRemark?: string | null;
  urgentDescription?: string | null;
  [key: string]: any;
};

interface SummaryField {
  label: string;
  value: React.ReactNode;
  emphasize?: boolean;
  className?: string;
}

export interface MergedPlanGroupHeaderProps {
  groupKey: string;
  orders: OrderLike[];
  isExpanded: boolean;
  onToggle: () => void;
  totalColumns: number;
  leadingCells?: React.ReactNode;
  leadingCellCount?: number;
  groupTypeLabel?: string;
  groupLabel?: string;
  groupModeLabel?: string;
  stageText?: React.ReactNode;
  keyTimeLabel?: string;
  keyTimeValue?: React.ReactNode;
  mainAction?: React.ReactNode;
  subtitle?: React.ReactNode;
  secondaryContent?: React.ReactNode;
  summaryFields?: SummaryField[];
  className?: string;
  tone?: "plan" | "dispatch" | "approval" | "neutral";
}

function formatWeight(value: number) {
  return `${value.toFixed(3)}t`;
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getPrimaryOrderNumber(orders: OrderLike[]) {
  return orders.find((item) => item.orderNumber)?.orderNumber || "-";
}

function getStageSummary(orders: OrderLike[]) {
  const counts = new Map<string, number>();
  orders.forEach((order) => {
    const key = order.status || "unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const [first, second] = sorted;
  if (!first) {
    return "-";
  }
  const firstLabel = STATUS_LABELS[first[0]] || first[0];
  if (!second) {
    return `${firstLabel}${first[1] > 1 ? ` ×${first[1]}` : ""}`;
  }
  const secondLabel = STATUS_LABELS[second[0]] || second[0];
  return `${firstLabel} ×${first[1]}，${secondLabel} ×${second[1]}`;
}

function getStageTone(orders: OrderLike[]) {
  const status = orders.find((item) => item.status)?.status || "";
  return STAGE_BADGE_TONE[status] || "border-slate-200 bg-slate-50 text-slate-700";
}

function getUrgentReasonText(orders: OrderLike[]) {
  const reasons = Array.from(
    new Set(
      orders
        .flatMap((order) => [order.urgentReason, order.urgentRemark, order.urgentDescription])
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
  return reasons.join("；");
}

function getToneClasses(tone: MergedPlanGroupHeaderProps["tone"], urgent: boolean) {
  if (urgent) {
    return {
      row: "bg-red-50/60 hover:bg-red-100/80 border-l-red-500",
      panel: "border-red-200 bg-gradient-to-r from-red-50/90 via-white to-red-50/50",
      accent: "text-red-700",
      modeBadge: "border-red-200 bg-white/90 text-red-700",
    };
  }
  if (tone === "dispatch") {
    return {
      row: "bg-violet-50/70 hover:bg-violet-100/80 border-l-violet-500",
      panel: "border-violet-200 bg-gradient-to-r from-violet-50/80 via-white to-violet-50/50",
      accent: "text-violet-700",
      modeBadge: "border-violet-200 bg-white/90 text-violet-700",
    };
  }
  if (tone === "approval") {
    return {
      row: "bg-amber-50/70 hover:bg-amber-100/80 border-l-amber-500",
      panel: "border-amber-200 bg-gradient-to-r from-amber-50/80 via-white to-amber-50/50",
      accent: "text-amber-700",
      modeBadge: "border-amber-200 bg-white/90 text-amber-700",
    };
  }
  if (tone === "neutral") {
    return {
      row: "bg-slate-50 hover:bg-slate-100/80 border-l-slate-400",
      panel: "border-slate-200 bg-gradient-to-r from-slate-50/80 via-white to-slate-50/40",
      accent: "text-slate-700",
      modeBadge: "border-slate-200 bg-white/90 text-slate-700",
    };
  }
  return {
    row: "bg-blue-50/80 hover:bg-blue-100/80 border-l-blue-500",
    panel: "border-blue-200 bg-gradient-to-r from-blue-50/85 via-white to-blue-50/55",
    accent: "text-blue-700",
    modeBadge: "border-blue-200 bg-white/90 text-blue-700",
  };
}

export default function MergedPlanGroupHeader({
  groupKey,
  orders,
  isExpanded,
  onToggle,
  totalColumns,
  leadingCells,
  leadingCellCount = 0,
  groupTypeLabel = "组合标识",
  groupLabel,
  groupModeLabel,
  stageText,
  keyTimeLabel = "关键时间",
  keyTimeValue,
  mainAction,
  subtitle,
  secondaryContent,
  summaryFields,
  className,
  tone = "plan",
}: MergedPlanGroupHeaderProps) {
  const urgentCount = orders.filter((item) => item.isUrgent).length;
  const isAllUrgent = orders.length > 0 && urgentCount === orders.length;
  const hasUrgent = urgentCount > 0;
  const destinations = Array.from(new Set(orders.map((item) => item.destinationCity).filter(Boolean)));
  const totalWeight = orders.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const urgentReasonText = getUrgentReasonText(orders);
  const tones = getToneClasses(tone, hasUrgent);
  const resolvedSummaryFields = summaryFields ?? [
    { label: "主单号", value: getPrimaryOrderNumber(orders) },
    { label: "子单数", value: `${orders.length} 单` },
    {
      label: "加急统计",
      value: hasUrgent ? (isAllUrgent ? "全组加急" : `含加急 ${urgentCount} 单`) : "普通优先级",
      emphasize: hasUrgent,
      className: hasUrgent ? "text-red-700" : undefined,
    },
    { label: "目的地统计", value: destinations.length > 0 ? `${destinations.length} 地` : "-" },
    { label: "总重量", value: formatWeight(totalWeight), emphasize: true },
    {
      label: "当前阶段",
      value: stageText || getStageSummary(orders),
      className: cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
        hasUrgent ? "border-red-200 bg-red-100 text-red-700" : getStageTone(orders),
      ),
    },
    { label: keyTimeLabel, value: keyTimeValue ?? formatDateTime(orders[0]?.updatedAt || orders[0]?.createdAt) },
  ];

  const summaryColSpan = Math.max(1, totalColumns - leadingCellCount - 1);

  return (
    <TableRow className={cn("cursor-pointer border-l-2 transition-colors", tones.row, className)} onClick={onToggle}>
      {leadingCells}
      <TableCell className="w-10 text-center align-top">
        {isExpanded ? (
          <ChevronDown className={cn("mx-auto mt-1 h-4 w-4", tones.accent)} />
        ) : (
          <ChevronRight className={cn("mx-auto mt-1 h-4 w-4", tones.accent)} />
        )}
      </TableCell>
      <TableCell colSpan={summaryColSpan} className="py-3">
        <div className={cn("rounded-lg border px-3 py-3 shadow-sm", tones.panel)}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {tone === "dispatch" ? (
                  <Truck className={cn("h-4 w-4 shrink-0", tones.accent)} />
                ) : (
                  <Layers className={cn("h-4 w-4 shrink-0", tones.accent)} />
                )}
                <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", tones.modeBadge)}>
                  {groupTypeLabel}
                </Badge>
                <span className={cn("font-mono text-sm font-semibold", tones.accent)}>{groupLabel || groupKey}</span>
                {groupModeLabel ? (
                  <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", tones.modeBadge)}>
                    {groupModeLabel}
                  </Badge>
                ) : null}
                {hasUrgent ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className="h-5 gap-1 bg-red-100 px-1.5 text-[10px] text-red-700 hover:bg-red-100">
                        <AlertTriangle className="h-3 w-3" />
                        {isAllUrgent ? "全组加急" : `含加急 ${urgentCount} 单`}
                      </Badge>
                    </TooltipTrigger>
                    {urgentReasonText ? (
                      <TooltipContent sideOffset={6} className="max-w-xs whitespace-pre-wrap text-left leading-5">
                        加急原因：{urgentReasonText}
                      </TooltipContent>
                    ) : null}
                  </Tooltip>
                ) : null}
              </div>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {resolvedSummaryFields.map((field) => (
                  <div key={field.label} className={cn("rounded-md border border-border/60 bg-white/70 px-2.5 py-2", field.className)}>
                    <div className="text-[10px] text-muted-foreground">{field.label}</div>
                    <div className={cn("mt-1 text-sm text-foreground", field.emphasize && "font-semibold")}>{field.value}</div>
                  </div>
                ))}
              </div>

              {(subtitle || urgentReasonText) ? (
                <div className="rounded-md border border-dashed border-border/70 bg-white/70 px-2.5 py-2 text-xs leading-5 text-muted-foreground">
                  {subtitle ? <div>{subtitle}</div> : null}
                  {!subtitle && urgentReasonText ? <div>加急原因：{urgentReasonText}</div> : null}
                </div>
              ) : null}

              {secondaryContent ? (
                <div className="rounded-md border border-border/70 bg-white/80 px-2.5 py-2">
                  {secondaryContent}
                </div>
              ) : null}
            </div>

            {mainAction ? (
              <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
                {mainAction}
              </div>
            ) : null}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
