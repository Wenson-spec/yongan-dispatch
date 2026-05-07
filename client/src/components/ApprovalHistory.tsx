import { useMemo, useState } from "react";
import { skipToken } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronUp, Clock, MessageCircle, Package2, User, Wallet, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface ApprovalHistoryChildRef {
  orderId: number;
  orderNumber?: string | null;
  systemCode?: string | null;
  customerName?: string | null;
  cargoName?: string | null;
  originCity?: string | null;
  warehouseName?: string | null;
  destinationCity?: string | null;
  deliveryAddress?: string | null;
  receivingAddress?: string | null;
  unloadingAddress?: string | null;
  weight?: string | number | null;
  referencePrice?: string | number | null;
  actualFreight?: string | number | null;
  dispatchPrice?: string | number | null;
}

interface ApprovalHistoryProps {
  orderId?: number;
  childOrderRefs?: ApprovalHistoryChildRef[];
}

const ACTION_CONFIG = {
  submit: {
    label: "提交",
    badgeClassName: "border-blue-200 bg-blue-50 text-blue-700",
    panelClassName: "border-blue-100 bg-blue-50/50",
  },
  approved: {
    label: "通过",
    badgeClassName: "border-green-200 bg-green-50 text-green-700",
    panelClassName: "border-green-100 bg-green-50/50",
  },
  rejected: {
    label: "退回",
    badgeClassName: "border-red-200 bg-red-50 text-red-700",
    panelClassName: "border-red-100 bg-red-50/50",
  },
} as const;

function normalizeText(value?: string | null) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeAmount(raw?: string | number | null) {
  if (raw === null || raw === undefined || raw === "") return null;
  const text = String(raw).replace(/,/g, "").trim();
  return text || null;
}

function formatTime(value?: string | Date | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractGroupRequestedAmount(record: { requestedAmount?: string | number | null; reason?: string | null }) {
  const reasonText = normalizeText(record.reason);
  const patterns = [
    /(?:总运费|整组运费|整组总价|申请总价|审批总价|主单申请报价|申请报价)[：:]?\s*¥?\s*([0-9,]+(?:\.[0-9]+)?)/,
    /分摊运费[：:]?\s*¥?\s*[0-9,]+(?:\.[0-9]+)?\s*\((?:总运费|整组运费|总价)[：:]?\s*¥?\s*([0-9,]+(?:\.[0-9]+)?)/,
  ];

  for (const pattern of patterns) {
    const match = reasonText.match(pattern);
    if (match?.[1]) {
      return normalizeAmount(match[1]);
    }
  }

  return normalizeAmount(record.requestedAmount);
}

function sanitizeGroupReason(reason?: string | null) {
  const normalized = normalizeText(reason);
  if (!normalized) return "";

  return normalized
    .replace(/备注[：:].*$/g, "")
    .replace(/分摊运费[：:]?\s*¥?\s*([0-9,]+(?:\.[0-9]+)?)\s*\((?:总运费|整组运费|总价)[：:]?\s*¥?\s*([0-9,]+(?:\.[0-9]+)?)([^)]*)\)/g, "整组运费¥$2$3")
    .replace(/分摊运费[：:]?\s*¥?\s*[0-9,]+(?:\.[0-9]+)?/g, "")
    .replace(/申请报价[：:]?\s*¥?\s*[0-9,]+(?:\.[0-9]+)?(?=.*(?:总运费|整组运费|整组总价))/g, "")
    .replace(/；\s*；/g, "；")
    .trim();
}

function formatOrderLabel(child: ApprovalHistoryChildRef) {
  return child.orderNumber || child.systemCode || `#${child.orderId}`;
}

function formatWeight(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(parsed)) {
    return `${parsed.toFixed(3)}t`;
  }
  return `${value}t`;
}

function getChildDeliveryAddress(child: ApprovalHistoryChildRef) {
  return [child.deliveryAddress, child.receivingAddress, child.unloadingAddress].find(
    (value) => typeof value === "string" && value.trim(),
  ) || null;
}

function getChildReferencePrice(child: ApprovalHistoryChildRef) {
  return child.referencePrice ?? child.actualFreight ?? child.dispatchPrice ?? null;
}

export default function ApprovalHistory({ orderId, childOrderRefs = [] }: ApprovalHistoryProps) {
  const { data: history, isLoading } = trpc.approval.getHistory.useQuery(
    typeof orderId === "number" ? { orderId } : skipToken,
  );
  const childOrders = useMemo(
    () => childOrderRefs.filter((item) => typeof item.orderId === "number"),
    [childOrderRefs],
  );
  const [childrenExpanded, setChildrenExpanded] = useState(false);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <MessageCircle className="h-4 w-4 text-slate-700" />
              <span>第二层 · 审批沟通记录</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {history?.length ?? 0} 次申请
            </Badge>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 animate-spin" />
            加载审批记录...
          </div>
        ) : !history || history.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm text-slate-500">
            暂无审批沟通记录
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {history.map((record, index) => {
              const requestedAmount = extractGroupRequestedAmount(record);
              const submitComment = sanitizeGroupReason(record.reason) || "未填写审批意见";
              const hasApproverAction = record.status === "approved" || record.status === "rejected";
              const submitAction = ACTION_CONFIG.submit;
              const approverAction = record.status === "approved" ? ACTION_CONFIG.approved : ACTION_CONFIG.rejected;

              return (
                <div key={record.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {`第${index + 1}次申请`}
                    </Badge>
                    {requestedAmount && (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-xs text-amber-700">
                        具体申请金额：{formatMoney(requestedAmount)}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 space-y-3">
                    <div className={`rounded-lg border p-3 ${submitAction.panelClassName}`}>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-900">
                          <User className="h-3.5 w-3.5" />
                          {record.applicantName || "调度员"}
                        </span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${submitAction.badgeClassName}`}>
                          {submitAction.label}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatTime(record.createdAt)}</span>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-700 break-words text-wrap-safe">
                        {submitComment}
                      </div>
                    </div>

                    {hasApproverAction && (
                      <div className={`rounded-lg border p-3 ${approverAction.panelClassName}`}>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                          <span className="inline-flex items-center gap-1 font-medium text-slate-900">
                            {record.status === "approved" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-700" /> : <XCircle className="h-3.5 w-3.5 text-red-700" />}
                            {record.approverName || "主管"}
                          </span>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${approverAction.badgeClassName}`}>
                            {approverAction.label}
                          </span>
                          <span className="text-xs text-muted-foreground">{formatTime(record.updatedAt)}</span>
                          {record.status === "approved" && record.approvedAmount && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-white px-2 py-0.5 text-xs text-green-700">
                              <Wallet className="h-3 w-3" />
                              批准金额：{formatMoney(String(record.approvedAmount))}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-700 break-words text-wrap-safe">
                          {record.approverComment || (record.status === "approved" ? "审批通过，未填写补充意见。" : "已退回，未填写补充意见。")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {childOrders.length > 0 && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Package2 className="h-4 w-4 text-blue-700" />
                <span>第三层 · 子单信息</span>
              </div>
              <Badge variant="outline" className="border-blue-200 bg-white text-xs text-blue-700">
                {childOrders.length} 个子单
              </Badge>
            </div>
            <button
              type="button"
              onClick={() => setChildrenExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50"
            >
              {childrenExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {childrenExpanded ? "收起子单信息" : "展开子单信息"}
            </button>
          </div>

          {childrenExpanded && (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {childOrders.map((child, index) => {
                const childAddress = getChildDeliveryAddress(child);
                const referencePrice = getChildReferencePrice(child);
                return (
                  <div key={child.orderId} className="rounded-xl border border-blue-100 bg-white/90 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-blue-700">子单 {index + 1}</div>
                        <div className="mt-1 font-mono text-xs font-semibold text-slate-800 break-all">
                          {formatOrderLabel(child)}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        子单
                      </Badge>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg bg-slate-50 px-3 py-2.5 shadow-sm">
                        <div className="text-[11px] text-slate-500">客户</div>
                        <div className="mt-1 text-sm text-slate-800 break-words text-wrap-safe">{child.customerName || "-"}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2.5 shadow-sm">
                        <div className="text-[11px] text-slate-500">货物简称</div>
                        <div className="mt-1 text-sm text-slate-800 break-words text-wrap-safe">{child.cargoName || "-"}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2.5 shadow-sm">
                        <div className="text-[11px] text-slate-500">发货仓库</div>
                        <div className="mt-1 text-sm text-slate-800 break-words text-wrap-safe">{child.warehouseName || child.originCity || "-"}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2.5 shadow-sm">
                        <div className="text-[11px] text-slate-500">重量</div>
                        <div className="mt-1 text-sm font-semibold text-slate-800">{formatWeight(child.weight)}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2.5 shadow-sm sm:col-span-2">
                        <div className="text-[11px] text-slate-500">收货地址</div>
                        <div className="mt-1 text-sm leading-6 text-slate-800 break-words text-wrap-safe">
                          {[child.destinationCity, childAddress].filter(Boolean).join(" · ") || child.destinationCity || "待补收货地址"}
                        </div>
                      </div>
                      <div className="rounded-lg bg-emerald-50 px-3 py-2.5 shadow-sm sm:col-span-2">
                        <div className="text-[11px] text-emerald-700">参考计价</div>
                        <div className="mt-1 text-sm font-semibold text-emerald-700">
                          {referencePrice !== null && referencePrice !== undefined && referencePrice !== ""
                            ? formatMoney(String(referencePrice))
                            : "-"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
