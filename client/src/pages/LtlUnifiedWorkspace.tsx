import DashboardLayout from "@/components/DashboardLayout";
import { fmtDate } from "@/lib/dateUtils";
import { trpc } from "@/lib/trpc";
import { fmtAmount } from "@/lib/format";
import { formatMoney } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Package, Search, RefreshCw, ArrowRight, Plus, Clock, Camera, Upload,
  CheckCircle2, Truck, AlertTriangle, Undo2, Trash2, Download, Phone,
  FileSpreadsheet, FileText, Eye, Edit2, Loader2, Pencil,
  ImageIcon, Flame, Layers, ChevronDown, ChevronRight, MoreHorizontal, HelpCircle,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import StationAutocomplete from "@/components/StationAutocomplete";
import ReceivingNoteDialog from "@/components/ReceivingNoteDialog";
import React, { useState, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import LtlDispatchWorkspace from "@/components/ltl/LtlDispatchWorkspace";
import { useMergedPlanGroups } from "@/hooks/useMergedPlanGroups";
import { TablePagination, usePagination } from "@/components/TablePagination";
import { useTableSort, SortableHeader } from "@/components/SortableTable";
import SortRuleNotice from "@/components/SortRuleNotice";
import {
  appendStructuredNote,
  buildLtlTimeline,
  buildPodDepositRoute,
  buildStructuredNote,
  deriveLtlAnomaly,
  buildLtlPendingInquiryDisplaySummary,
  filterExceptionOrders,
  filterOrdersByDateRange,
  summarizeLtlMonthly,
  type LtlMonthlyGroupBy,
} from "./ltlWorkflow.utils";
import { buildLtlSubchainCreatePath } from "./ltlSubchainPrefill";
import { getMergedChildDeleteLockReason, getMergedChildRollbackLockReason } from "@/lib/commandGroupRules";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  ROLLBACK_MAP,
  BUSINESS_TYPE_LABELS,
  SETTLEMENT_LABELS,
  RECEIVING_STATUS_LABELS,
} from "@/lib/orderStatus";

const LEDGER_GROUP_OPTIONS: Array<{ value: LtlMonthlyGroupBy; label: string }> = [
  { value: "destination_station", label: "按目的站" },
  { value: "freight_station", label: "按货站" },
  { value: "customer", label: "按客户" },
];

const ANOMALY_LEVEL_OPTIONS = ["红色异常", "橙色关注"];
const ROLLBACK_CATEGORY_OPTIONS = ["客户暂缓自提", "目的站预约失败", "送货地址变更", "收货人无法联系", "货损/少件待核实", "票据资料不齐", "其他"];
const RESPONSIBILITY_OPTIONS = ["客户", "目的站货站", "发运货站", "调度", "司机/送货方", "待复核"];
const LTL_CUSTOMER_PICKUP_TAG = "【零担后段客户自提】";
const LTL_CUSTOMER_SELF_DELIVER_TAG = "【零担前段客户自送到站】";

type LtlFrontSegmentMode = "self_transport" | "pickup_outsource" | "customer_self_deliver" | "unknown";
type LtlBackSegmentMode = "station_delivery" | "delivery_outsource" | "customer_pickup" | "unknown";

function hasLtlTag(remarks?: string | null, tag?: string) {
  return Boolean(tag) && String(remarks || "").includes(String(tag));
}

function hasPickupDispatchRecord(order: any) {
  return Boolean(order?.dispatchDate || order?.plateNumber || order?.driverName);
}

function deriveLtlSegmentModes(order: any, options?: { pickupSubchain?: any; deliverySubchain?: any }) {
  const frontMode: LtlFrontSegmentMode = options?.pickupSubchain
    ? "pickup_outsource"
    : hasLtlTag(order?.remarks, LTL_CUSTOMER_SELF_DELIVER_TAG)
      ? "customer_self_deliver"
      : hasPickupDispatchRecord(order)
        ? "self_transport"
        : "unknown";
  const backMode: LtlBackSegmentMode = hasLtlTag(order?.remarks, LTL_CUSTOMER_PICKUP_TAG)
    ? "customer_pickup"
    : options?.deliverySubchain
      ? "delivery_outsource"
      : (order?.receivingConfirmedAt || order?.ltlFinalStation || ["dispatched", "shipped", "in_transit", "delivered", "signed", "settled"].includes(String(order?.status || "")))
        ? "station_delivery"
        : "unknown";
  return { frontMode, backMode };
}

function getFrontModeLabel(mode: LtlFrontSegmentMode) {
  return {
    self_transport: "前段：自运",
    pickup_outsource: "前段：外请",
    customer_self_deliver: "前段：客户自送",
    unknown: "前段：待推断",
  }[mode];
}

function getBackModeLabel(mode: LtlBackSegmentMode) {
  return {
    station_delivery: "后段：货站包送",
    delivery_outsource: "后段：外请送货",
    customer_pickup: "后段：客户自提",
    unknown: "后段：待推断",
  }[mode];
}

function getModeBadgeClass(mode: LtlFrontSegmentMode | LtlBackSegmentMode) {
  if (mode === "pickup_outsource" || mode === "delivery_outsource") return "border-sky-200 bg-sky-50 text-sky-700";
  if (mode === "customer_self_deliver" || mode === "customer_pickup") return "border-amber-200 bg-amber-50 text-amber-700";
  if (mode === "self_transport" || mode === "station_delivery") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function LtlModeBadges({ order, pickupSubchain, deliverySubchain }: { order: any; pickupSubchain?: any; deliverySubchain?: any }) {
  const { frontMode, backMode } = deriveLtlSegmentModes(order, { pickupSubchain, deliverySubchain });
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      <Badge variant="outline" className={`text-[10px] ${getModeBadgeClass(frontMode)}`}>{getFrontModeLabel(frontMode)}</Badge>
      <Badge variant="outline" className={`text-[10px] ${getModeBadgeClass(backMode)}`}>{getBackModeLabel(backMode)}</Badge>
    </div>
  );
}

function LtlTimelinePreview({ order }: { order: any }) {
  const nodes = buildLtlTimeline(order);

  return (
    <div className="rounded-md border border-dashed bg-muted/30 px-2 py-1.5">
      <div className="grid grid-cols-5 gap-1">
        {nodes.map((node, index) => (
          <div key={node.key} className="min-w-0">
            <div className="flex items-center gap-1">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${node.completed ? "bg-emerald-500" : "bg-slate-300"}`} />
              {index < nodes.length - 1 && (
                <span className={`h-px flex-1 ${node.completed ? "bg-emerald-300" : "bg-slate-200"}`} />
              )}
            </div>
            <div className="mt-1 text-[10px] font-medium leading-none">{node.label}</div>
            <div
              className="mt-0.5 truncate text-[10px] text-muted-foreground"
              title={node.time ? fmtDate(node.time) : node.hint || "未完成"}
            >
              {node.time ? fmtDate(node.time) : "待更新"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LtlAnomalyBadge({ order }: { order: any }) {
  const anomaly = deriveLtlAnomaly(order);
  const className = anomaly.level === "critical"
    ? "border-red-200 bg-red-100 text-red-700"
    : anomaly.level === "warning"
      ? "border-amber-200 bg-amber-100 text-amber-700"
      : "border-slate-200 bg-slate-100 text-slate-600";

  return (
    <Badge variant="outline" className={className} title={anomaly.reasons.join("；") || "当前无异常"}>
      {anomaly.label}
      {anomaly.reasons.length > 0 ? ` · ${anomaly.reasons.length}` : ""}
    </Badge>
  );
}

export default function LtlUnifiedWorkspace() {
  const { hasPermission, role } = usePermissions();
  const isAdmin = role === "admin";
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [, navigate] = useLocation();

  // ===== 询价相关状态 =====
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [dragOverOrderId, setDragOverOrderId] = useState<number | null>(null);
  const [showInquiryDialog, setShowInquiryDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [inquiryForm, setInquiryForm] = useState({
    stationName: "",
    stationPhone: "",
    unitPrice: "",
    deliveryFee: "",
    otherFee: "",
    remark: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // OCR识别弹窗状态（询价发运台用）
  const [showOcrConfirmDialog, setShowOcrConfirmDialog] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [ocrUploadedUrl, setOcrUploadedUrl] = useState("");
  const [ocrWaybillNumber, setOcrWaybillNumber] = useState("");
  const [ocrIsProcessing, setOcrIsProcessing] = useState(false);
  const [ocrActualWeight, setOcrActualWeight] = useState("");
  const [ocrActualFreight, setOcrActualFreight] = useState("");
  const [ocrAdjustDeliveryFee, setOcrAdjustDeliveryFee] = useState("");
  const [ocrAdjustOtherFee, setOcrAdjustOtherFee] = useState("");
  const [ocrEnableFreightAdjust, setOcrEnableFreightAdjust] = useState(false);
  // 查看照片弹窗
  const [showViewImageDialog, setShowViewImageDialog] = useState(false);
  const [viewImageUrl, setViewImageUrl] = useState("");

  // 编辑运单号弹窗
  const [showEditWaybillDialog, setShowEditWaybillDialog] = useState(false);
  const [editWaybillOrder, setEditWaybillOrder] = useState<any>(null);
  const [editWaybillNumber, setEditWaybillNumber] = useState("");

  // ===== 退回/删除/批量 =====
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [rollbackOrder, setRollbackOrder] = useState<any>(null);
  const [rollbackReason, setRollbackReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchRollbackOpen, setBatchRollbackOpen] = useState(false);
  const [batchRollbackReason, setBatchRollbackReason] = useState("");
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const getDeleteLockReason = useCallback((order: any) => getMergedChildDeleteLockReason(order), []);
  const getRollbackLockReason = useCallback((order: any) => getMergedChildRollbackLockReason(order), []);
  const openDeleteDialog = useCallback((order: any, orderId?: number | null) => {
    const lockReason = getDeleteLockReason(order);
    if (lockReason) {
      toast.error(lockReason);
      return;
    }
    const resolvedId = orderId ?? order?.orderId ?? order?.id;
    if (!resolvedId) return;
    setDeleteTargetId(resolvedId);
  }, [getDeleteLockReason]);
  const openRollbackDialog = useCallback((order: any) => {
    const lockReason = getRollbackLockReason(order);
    if (lockReason) {
      toast.error(lockReason);
      return;
    }
    if (!order?.id && !order?.orderId) return;
    setRollbackOrder(order);
    setRollbackReason("");
    setRollbackCategory("");
    setRollbackOwner("");
  }, [getRollbackLockReason]);

  // ===== 综合工作台状态 =====
  // 编辑货站信息
  const [editOrder, setEditOrder] = useState<any>(null);
  const [editFields, setEditFields] = useState<any>({});
  const [receivingNoteOrder, setReceivingNoteOrder] = useState<any>(null);
  // 台账筛选
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [ledgerGroupBy, setLedgerGroupBy] = useState<LtlMonthlyGroupBy>("destination_station");
  const [ledgerExceptionOnly, setLedgerExceptionOnly] = useState(false);
  const [reviewOrder, setReviewOrder] = useState<any>(null);
  const [reviewForm, setReviewForm] = useState({ level: "橙色关注", reason: "", owner: "", note: "" });
  const [rollbackCategory, setRollbackCategory] = useState("");
  const [rollbackOwner, setRollbackOwner] = useState("");

  // 分页状态
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState(100);
  const [confirmedPage, setConfirmedPage] = useState(1);
  const [confirmedPageSize, setConfirmedPageSize] = useState(100);
  const [activePage, setActivePage] = useState(1);
  const [activePageSize, setActivePageSize] = useState(100);
  const [completedPage, setCompletedPage] = useState(1);
  const [completedPageSize, setCompletedPageSize] = useState(100);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(100);

  // 加急切换弹窗
  const [urgentToggleOrder, setUrgentToggleOrder] = useState<any>(null);
  const [urgentReason, setUrgentReason] = useState("");

  // 货站列表（用于自动匹配）
  const { data: stationList } = trpc.freightStation.list.useQuery();
  const [showStationSuggestions, setShowStationSuggestions] = useState(false);
  const stationSuggestions = useMemo(() => {
    if (!stationList || !inquiryForm.stationName.trim()) return [];
    const keyword = inquiryForm.stationName.trim().toLowerCase();
    return stationList.filter((s: any) => s.name.toLowerCase().includes(keyword)).slice(0, 8);
  }, [stationList, inquiryForm.stationName]);

  // ===== Mutations =====
  const utils = trpc.useUtils();
  const updateStatus = trpc.order.updateStatus.useMutation();
  const ocrReceipt = trpc.smartPaste.ocrFreightReceipt.useMutation();
  const updateOrderFields = trpc.order.updateOrderFields.useMutation();
  const updateFieldsMutation = trpc.order.updateOrderFields.useMutation({
    onSuccess: () => {
      toast.success("保存成功");
      setEditOrder(null);
      setEditFields({});
      utils.order.list.invalidate();
      utils.stats.customerLedger.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const rollbackMutation = trpc.order.rollbackStatus.useMutation({
    onSuccess: (res) => {
      refetchAll();
      toast.success(`订单已退回：${res.fromLabel} → ${res.toLabel}`);
      setRollbackOrder(null);
      setRollbackReason("");
      setRollbackCategory("");
      setRollbackOwner("");
    },
    onError: (err: any) => toast.error(err.message),
  });
  const revertStatusMutation = trpc.order.revertStatus.useMutation({
    onSuccess: (res) => {
      refetchAll();
      toast.success(`订单已退回：${res.fromLabel} → ${res.toLabel}`);
      setRollbackOrder(null);
      setRollbackReason("");
      setRollbackCategory("");
      setRollbackOwner("");
    },
    onError: (err: any) => toast.error(err.message),
  });
  const batchRollbackMutation = trpc.order.batchRollback.useMutation({
    onSuccess: (res) => {
      refetchAll();
      const msg = res.skipCount > 0 ? `成功退回 ${res.successCount} 个，${res.skipCount} 个跳过` : `成功退回 ${res.successCount} 个订单`;
      toast.success(msg);
      setSelectedIds(new Set()); setBatchRollbackOpen(false); setBatchRollbackReason("");
    },
    onError: (err: any) => toast.error(err.message),
  });
  const batchStatusMutation = trpc.order.batchUpdateStatus.useMutation();
  const deleteMutation = trpc.order.delete.useMutation({
    onSuccess: () => {
      refetchAll();
      toast.success("订单已删除");
      setDeleteTargetId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // ===== Queries =====
  // 待询价订单
  const { data: pendingData, isLoading: pendingLoading, refetch: refetchPending } = trpc.order.list.useQuery(
    { page: 1, pageSize: 100, status: "pending_inquiry", businessType: "ltl", keyword: search || undefined },
    { refetchInterval: 10000 }
  );
  const pendingParentIds = useMemo(
    () => Array.from(new Set((pendingData?.items ?? []).map((item: any) => Number(item.id)).filter((id) => Number.isFinite(id)))),
    [pendingData?.items],
  );
  const { data: pickupSubchainStatus, isFetching: pickupSubchainStatusLoading } = trpc.order.getLtlPickupSubchainStatus.useQuery(
    { parentIds: pendingParentIds },
    { enabled: pendingParentIds.length > 0, refetchInterval: 10000 },
  );
  // 已询价/已发运
  const { data: confirmedData, isLoading: confirmedLoading, refetch: refetchConfirmed } = trpc.order.list.useQuery(
    { page: 1, pageSize: 100, status: "inquiry_confirmed", businessType: "ltl", keyword: search || undefined },
    { refetchInterval: 15000 }
  );
  // 零担全部订单（进行中+已完成）
  const { data: ltlData, isLoading: ltlLoading, refetch: refetchLtl } = trpc.order.list.useQuery(
    { page: 1, pageSize: 200, businessType: "ltl", keyword: search || undefined },
    { refetchInterval: 10000 }
  );
  // 运输中
  const { data: transitData, refetch: refetchTransit } = trpc.order.list.useQuery(
    { page: 1, pageSize: 100, status: "in_transit", businessType: "ltl", keyword: search || undefined },
    { refetchInterval: 15000 }
  );
  // 客户台账数据
  const ledgerInput = useMemo(() => ({
    keyword: search || undefined,
    businessType: "ltl" as const,
    startDate: filterStartDate || undefined,
    endDate: filterEndDate || undefined,
  }), [search, filterStartDate, filterEndDate]);
  const { data: ledgerData, isLoading: ledgerLoading, refetch: refetchLedger } = trpc.stats.customerLedger.useQuery(ledgerInput);

  const pendingOrders = pendingData?.items ?? [];
  const confirmedOrders = confirmedData?.items ?? [];
  const transitOrders = transitData?.items?.filter(o => o.businessType === "ltl") ?? [];
  const pickupSubchainByParentId = useMemo(() => {
    const map = new Map<number, { id: number; label: string; status: string | null }>();
    (pickupSubchainStatus?.items ?? []).forEach((item) => {
      const label = item.orderNumber || item.mergedPlanNumber || `外请子链#${item.id}`;
      item.relatedParentIds.forEach((parentId) => {
        if (!map.has(parentId)) {
          map.set(parentId, { id: item.id, label, status: item.status });
        }
      });
    });
    return map;
  }, [pickupSubchainStatus]);
  const selectedPendingOrders = useMemo(
    () => pendingOrders.filter((order: any) => selectedIds.has(order.id)),
    [pendingOrders, selectedIds],
  );

  // 筛选零担订单
  const allOrders = (ltlData?.items ?? []).filter(o => o.businessType === "ltl");
  // 进行中：dispatched/shipped/in_transit/delivered（已送达但未签收仍在进行中，需要标记签收）
  // 排除：pending_inquiry/inquiry_confirmed（在前面的Tab）、signed/settled/cancelled（已完成）
  const activeOrders = filterOrdersByDateRange(
    allOrders.filter(o => ["dispatched", "shipped", "in_transit", "delivered"].includes(o.status)),
    filterStartDate || undefined,
    filterEndDate || undefined,
  );
  const activeParentIds = useMemo(
    () => Array.from(new Set(activeOrders.map((item: any) => Number(item.id)).filter((id) => Number.isFinite(id)))),
    [activeOrders],
  );
  const { data: deliverySubchainStatus, isFetching: deliverySubchainStatusLoading } = trpc.order.getLtlDeliverySubchainStatus.useQuery(
    { parentIds: activeParentIds },
    { enabled: activeParentIds.length > 0, refetchInterval: 10000 },
  );
  const deliverySubchainByParentId = useMemo(() => {
    const map = new Map<number, { id: number; label: string; status: string | null }>();
    (deliverySubchainStatus?.items ?? []).forEach((item) => {
      const label = item.orderNumber || item.mergedPlanNumber || `外请子链#${item.id}`;
      item.relatedParentIds.forEach((parentId) => {
        if (!map.has(parentId)) {
          map.set(parentId, { id: item.id, label, status: item.status });
        }
      });
    });
    return map;
  }, [deliverySubchainStatus]);
  // 已完成：signed + settled
  const completedOrders = filterOrdersByDateRange(
    allOrders.filter(o => ["signed", "settled"].includes(o.status)),
    filterStartDate || undefined,
    filterEndDate || undefined,
  );
  const filteredLedgerData = useMemo(
    () => filterExceptionOrders(ledgerData ?? [], ledgerExceptionOnly),
    [ledgerData, ledgerExceptionOnly],
  );
  const monthlySummary = useMemo(
    () => summarizeLtlMonthly(filteredLedgerData as any[], ledgerGroupBy),
    [filteredLedgerData, ledgerGroupBy],
  );

  // 排序 getter 定义
  const sortGetters = useMemo(() => ({
    createdAt: (o: any) => o.createdAt ? new Date(o.createdAt).getTime() : 0,
    updatedAt: (o: any) => o.updatedAt ? new Date(o.updatedAt).getTime() : 0,
    progressAt: (o: any) => {
      const candidate = o.updatedAt || o.signedDate || o.deliveryDate || o.createdAt;
      return candidate ? new Date(candidate).getTime() : 0;
    },
    completedAt: (o: any) => {
      const candidate = o.signedDate || o.deliveryDate || o.updatedAt || o.createdAt;
      return candidate ? new Date(candidate).getTime() : 0;
    },
    customerName: (o: any) => o.customerName || "",
    originCity: (o: any) => o.originCity || "",
    destinationCity: (o: any) => o.destinationCity || "",
    weight: (o: any) => parseFloat(o.weight || "0"),
    totalCost: (o: any) => parseFloat(o.totalCost || o.actualFreight || "0"),
    unitPrice: (o: any) => parseFloat(o.ltlUnitPrice || "0"),
    status: (o: any) => o.status || "",
    isUrgent: (o: any) => o.isUrgent ? 1 : 0,
    stationName: (o: any) => o.freightStationName || "",
  }), []);

  // 各Tab排序
  const { sorted: sortedConfirmed, sort: confirmedSort, toggleSort: toggleConfirmedSort } = useTableSort(confirmedOrders, sortGetters, { key: "updatedAt", direction: "desc" });
  const { sorted: sortedActive, sort: activeSort, toggleSort: toggleActiveSort } = useTableSort(activeOrders, sortGetters, { key: "progressAt", direction: "desc" });
  const { sorted: sortedCompleted, sort: completedSort, toggleSort: toggleCompletedSort } = useTableSort(completedOrders, sortGetters, { key: "completedAt", direction: "desc" });

  // 台账排序
  const ledgerSortGetters = useMemo(() => ({
    createdAt: (o: any) => o.createdAt ? new Date(o.createdAt).getTime() : 0,
    customerName: (o: any) => o.customerName || "",
    route: (o: any) => `${o.originCity || ""}-${o.destinationCity || ""}`,
    weight: (o: any) => parseFloat(o.weight || "0"),
    actualFreight: (o: any) => parseFloat(o.actualFreight || "0"),
    totalCost: (o: any) => parseFloat(o.totalCost || "0"),
    status: (o: any) => o.status || "",
  }), []);
  const { sorted: sortedLedger, sort: ledgerSort, toggleSort: toggleLedgerSort } = useTableSort(filteredLedgerData, ledgerSortGetters, { key: "createdAt", direction: "desc" });

  // 分页切片（基于排序后的数据）
  const paginatedConfirmed = sortedConfirmed.slice((confirmedPage - 1) * confirmedPageSize, confirmedPage * confirmedPageSize);
  const paginatedActive = sortedActive.slice((activePage - 1) * activePageSize, activePage * activePageSize);
  const paginatedCompleted = sortedCompleted.slice((completedPage - 1) * completedPageSize, completedPage * completedPageSize);
  const paginatedLedger = sortedLedger.slice((ledgerPage - 1) * ledgerPageSize, ledgerPage * ledgerPageSize);

  // 待询价队列合并计划号分组
  const [groupByPlan, setGroupByPlan] = useState(true);
  const { groupedData: pendingGrouped, expandedGroups: pendingExpanded, toggleGroup: togglePendingGroup } = useMergedPlanGroups(pendingOrders, groupByPlan);
  const pendingInquirySummary = useMemo(
    () => buildLtlPendingInquiryDisplaySummary(pendingOrders as any[]),
    [pendingOrders],
  );

  // 整组询价
  const [groupInquiryOrders, setGroupInquiryOrders] = useState<any[]>([]);
  const [groupInquiryProgress, setGroupInquiryProgress] = useState(0);

  // ===== 统计 =====
  const stats = {
    pendingInquiry: pendingOrders.length,
    confirmed: confirmedOrders.length,
    inTransit: allOrders.filter(o => ["dispatched", "shipped", "in_transit", "delivered"].includes(o.status)).length,
    delivered: allOrders.filter(o => ["signed", "settled"].includes(o.status)).length,
    total: allOrders.length,
  };

  const canRollback = (status: string) => status !== "pending_assign" && status !== "pending_inquiry" && ROLLBACK_MAP[status] !== undefined && ROLLBACK_MAP[status] !== "";

  // ===== 台账汇总 =====
  const ledgerSummary = useMemo(() => {
    if (!filteredLedgerData.length) return null;
    const ltlItems = filteredLedgerData;
    const totalFreight = ltlItems.reduce((sum: number, d: any) => sum + parseFloat(d.actualFreight || "0"), 0);
    const totalCost = ltlItems.reduce((sum: number, d: any) => sum + parseFloat(d.totalCost || "0"), 0);
    const totalDeliveryFee = ltlItems.reduce((sum: number, d: any) => sum + parseFloat(d.ltlDeliveryFee || d.deliveryFee || "0"), 0);
    const exceptionCount = ltlItems.filter((item: any) => deriveLtlAnomaly(item).level !== "none").length;
    return { count: ltlItems.length, totalFreight, totalCost, totalDeliveryFee, exceptionCount };
  }, [filteredLedgerData]);

  // ===== 计算函数 =====
  const calcFreight = (unitPrice: string, weight: number) => {
    const up = parseFloat(unitPrice || "0");
    return Math.round(up * weight * 100) / 100;
  };
  const calcTotal = (unitPrice: string, deliveryFee: string, otherFee: string, weight: number) => {
    const freight = calcFreight(unitPrice, weight);
    const df = parseFloat(deliveryFee || "0");
    const of2 = parseFloat(otherFee || "0");
    return Math.round((freight + df + of2) * 100) / 100;
  };

  // ===== 刷新 =====
  const refetchAll = () => {
    refetchPending();
    refetchConfirmed();
    refetchTransit();
    refetchLtl();
    refetchLedger();
  };

  const buildSubchainSeed = (order: any) => ({
    id: order.id,
    systemCode: order.systemCode,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    settlementType: order.settlementType,
    cargoName: order.cargoName,
    weight: order.weight,
    originCity: order.originCity,
    destinationCity: order.destinationCity,
    deliveryAddress: order.deliveryAddress,
    receiverName: order.receiverName,
    receiverPhone: order.receiverPhone,
    mergedPlanNumber: order.mergedPlanNumber,
    department: order.department,
  });

  const getPickupSubchainRecord = (order: any) => {
    const parentId = Number(order?.id);
    return Number.isFinite(parentId) ? pickupSubchainByParentId.get(parentId) : undefined;
  };
  const getDeliverySubchainRecord = (order: any) => {
    const parentId = Number(order?.id);
    return Number.isFinite(parentId) ? deliverySubchainByParentId.get(parentId) : undefined;
  };
  const canCreatePickupSubchain = (order: any) => order?.status === "pending_inquiry" && !getPickupSubchainRecord(order);
  const canCreateDeliverySubchain = (order: any) => ["shipped", "in_transit"].includes(order?.status) && !getDeliverySubchainRecord(order);

  const handleToggleCustomerSelfDeliver = async (order: any, nextValue: boolean) => {
    if (!order?.id) {
      toast.error("当前主单缺少编号，暂时无法更新前段模式");
      return;
    }
    const existingSubchain = getPickupSubchainRecord(order);
    if (nextValue && existingSubchain) {
      toast.error(`该主单已转入前段外请：${existingSubchain.label}，请先取消外请子链后再标记客户自送`);
      return;
    }
    if (nextValue && hasPickupDispatchRecord(order)) {
      toast.error("该主单已存在前段派车记录，当前会自动按前段自运处理");
      return;
    }
    try {
      await updateOrderFields.mutateAsync({ id: order.id, ltlCustomerSelfDeliverConfirmed: nextValue });
      toast.success(nextValue ? "已确认客户自送到站，前段模式将按客户自送处理" : "已取消客户自送到站确认，前段模式将按实际操作重新推断");
      refetchAll();
    } catch (error: any) {
      toast.error(error?.message || "更新客户自送到站确认失败");
    }
  };

  const handleToggleCustomerPickup = async (order: any, nextValue: boolean) => {
    if (!order?.id) {
      toast.error("当前主单缺少编号，暂时无法更新后段模式");
      return;
    }
    const existingSubchain = getDeliverySubchainRecord(order);
    if (nextValue && existingSubchain) {
      toast.error(`该主单已转入后段外请：${existingSubchain.label}，请先取消外请子链后再标记客户自提`);
      return;
    }
    try {
      await updateOrderFields.mutateAsync({ id: order.id, ltlCustomerPickup: nextValue });
      toast.success(nextValue ? "已标记客户自提，系统将停止为该主单生成回单并自动清理既有回单记录" : "已取消客户自提，系统将恢复后段回单规则");
      refetchAll();
    } catch (error: any) {
      toast.error(error?.message || "更新客户自提标记失败");
    }
  };

  const renderPickupSubchainButton = (order: any) => {
    if (order?.status !== "pending_inquiry") return null;
    const existingSubchain = getPickupSubchainRecord(order);
    const button = (
      <Button
        size="sm"
        variant="outline"
        className="border-sky-200 text-sky-700 hover:bg-sky-50 disabled:border-slate-200 disabled:text-slate-400"
        onClick={() => handleCreatePickupSubchain(order)}
        disabled={pickupSubchainStatusLoading || Boolean(existingSubchain)}
      >
        {pickupSubchainStatusLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Truck className="h-3 w-3 mr-1" />}
        {pickupSubchainStatusLoading ? "校验中" : existingSubchain ? "已转前段外请" : "前段外请车"}
      </Button>
    );

    if (existingSubchain) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>已存在前段外请子链：{existingSubchain.label}</TooltipContent>
        </Tooltip>
      );
    }

    return button;
  };

  const renderDeliverySubchainButton = (order: any) => {
    if (!["shipped", "in_transit"].includes(order?.status)) return null;
    const existingSubchain = getDeliverySubchainRecord(order);
    const button = (
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-sky-200 px-2 text-xs text-sky-700 hover:bg-sky-50 disabled:border-slate-200 disabled:text-slate-400"
        onClick={() => handleCreateDeliverySubchain(order)}
        disabled={deliverySubchainStatusLoading || Boolean(existingSubchain)}
      >
        {deliverySubchainStatusLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Truck className="mr-1 h-3 w-3" />}
        {deliverySubchainStatusLoading ? "校验中" : existingSubchain ? "已转后段外请" : "后段外请车"}
      </Button>
    );

    if (existingSubchain) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>已存在后段外请子链：{existingSubchain.label}</TooltipContent>
        </Tooltip>
      );
    }

    return button;
  };

  const handleCreatePickupSubchain = (order: any) => {
    if (!order?.id) {
      toast.error("当前主单缺少编号，暂时无法创建前段外请子链");
      return;
    }
    const existingSubchain = getPickupSubchainRecord(order);
    if (existingSubchain) {
      toast.error(`该主单已转入前段外请：${existingSubchain.label}`);
      return;
    }
    navigate(buildLtlSubchainCreatePath(buildSubchainSeed(order), "pickup", "/station/ltl-workspace"));
  };

  const handleCreateCombinedPickupSubchain = () => {
    if (selectedPendingOrders.length < 2) {
      toast.error("请至少选择 2 个待询价零担主单后再发起合车外请");
      return;
    }
    if (pickupSubchainStatusLoading) {
      toast.error("正在同步前段外请建链状态，请稍后再试");
      return;
    }
    const blockedOrders = selectedPendingOrders.filter((order: any) => getPickupSubchainRecord(order));
    if (blockedOrders.length > 0) {
      const labels = blockedOrders.slice(0, 4).map((order: any) => order.orderNumber || order.systemCode).filter(Boolean).join("、");
      toast.error(`所选订单中存在已建前段外请子链的主单：${labels}`);
      return;
    }
    navigate(buildLtlSubchainCreatePath(selectedPendingOrders.map((order: any) => buildSubchainSeed(order)), "pickup", "/station/ltl-workspace"));
  };

  const handleCreateDeliverySubchain = (order: any) => {
    if (!order?.id) {
      toast.error("当前主单缺少编号，暂时无法创建后段外请子链");
      return;
    }
    const existingSubchain = getDeliverySubchainRecord(order);
    if (existingSubchain) {
      toast.error(`该主单已转入后段外请：${existingSubchain.label}`);
      return;
    }
    navigate(buildLtlSubchainCreatePath(buildSubchainSeed(order), "delivery", "/station/ltl-workspace"));
  };

  const handleCreateCombinedDeliverySubchain = () => {
    const selectedActiveOrders = activeOrders.filter((order: any) => selectedIds.has(order.id));
    if (selectedActiveOrders.length < 2) {
      toast.error("请至少选择 2 个在途零担主单后再发起后段合车外请");
      return;
    }
    if (deliverySubchainStatusLoading) {
      toast.error("正在同步后段外请建链状态，请稍后再试");
      return;
    }
    const invalidOrders = selectedActiveOrders.filter((order: any) => !["shipped", "in_transit"].includes(order?.status));
    if (invalidOrders.length > 0) {
      toast.error("所选订单中包含不可发起后段外请的状态，请仅选择已发运或运输中的零担主单");
      return;
    }
    const blockedOrders = selectedActiveOrders.filter((order: any) => getDeliverySubchainRecord(order));
    if (blockedOrders.length > 0) {
      const labels = blockedOrders.slice(0, 4).map((order: any) => order.orderNumber || order.systemCode).filter(Boolean).join("、");
      toast.error(`所选订单中存在已建后段外请子链的主单：${labels}`);
      return;
    }
    navigate(buildLtlSubchainCreatePath(selectedActiveOrders.map((order: any) => buildSubchainSeed(order)), "delivery", "/station/ltl-workspace"));
  };

  // ===== 询价相关 =====
  const handleOpenInquiry = (order: any) => {
    setSelectedOrder(order);
    setGroupInquiryOrders([]);
    setInquiryForm({
      stationName: order.freightStationName || "",
      stationPhone: order.inquiryPhone || "",
      unitPrice: order.ltlUnitPrice ? String(order.ltlUnitPrice) : "",
      deliveryFee: order.ltlDeliveryFee ? String(order.ltlDeliveryFee) : "",
      otherFee: order.ltlOtherFee ? String(order.ltlOtherFee) : "",
      remark: "",
    });
    setShowInquiryDialog(true);
  };

  const handleGroupInquiry = (orders: any[]) => {
    setGroupInquiryOrders(orders);
    setSelectedOrder(orders[0]);
    setInquiryForm({
      stationName: orders[0]?.freightStationName || "",
      stationPhone: orders[0]?.inquiryPhone || "",
      unitPrice: orders[0]?.ltlUnitPrice ? String(orders[0].ltlUnitPrice) : "",
      deliveryFee: orders[0]?.ltlDeliveryFee ? String(orders[0].ltlDeliveryFee) : "",
      otherFee: orders[0]?.ltlOtherFee ? String(orders[0].ltlOtherFee) : "",
      remark: "",
    });
    setShowInquiryDialog(true);
  };

  const handleConfirmInquiry = async () => {
    if (!selectedOrder) return;
    if (!inquiryForm.stationName || !inquiryForm.unitPrice) {
      toast.error("请填写货站名称和单价");
      return;
    }
    const weight = parseFloat(String(selectedOrder.weight || 0));
    const freight = calcFreight(inquiryForm.unitPrice, weight);
    const total = calcTotal(inquiryForm.unitPrice, inquiryForm.deliveryFee, inquiryForm.otherFee, weight);
    try {
      await updateStatus.mutateAsync({
        id: selectedOrder.id,
        status: "inquiry_confirmed",
        freightStationName: inquiryForm.stationName,
        inquiryPhone: inquiryForm.stationPhone || undefined,
        ltlUnitPrice: inquiryForm.unitPrice,
        ltlDeliveryFee: inquiryForm.deliveryFee || "0",
        ltlOtherFee: inquiryForm.otherFee || "0",
        actualFreight: String(freight),
        dispatchPrice: String(total),
      });
      toast.success(`询价确认成功！运费 ¥${freight} + 送货费 ¥${inquiryForm.deliveryFee || 0} = 总价 ¥${total}`);
      setShowInquiryDialog(false);
      refetchPending();
      refetchConfirmed();
    } catch (e: any) {
      toast.error(e.message || "操作失败");
    }
  };

  const handleConfirmGroupInquiry = async () => {
    if (groupInquiryOrders.length === 0) return;
    if (!inquiryForm.stationName || !inquiryForm.unitPrice) {
      toast.error("请填写货站名称和单价");
      return;
    }
    setGroupInquiryProgress(0);
    let successCount = 0;
    for (let i = 0; i < groupInquiryOrders.length; i++) {
      const order = groupInquiryOrders[i];
      const weight = parseFloat(String(order.weight || 0));
      const freight = calcFreight(inquiryForm.unitPrice, weight);
      const total = calcTotal(inquiryForm.unitPrice, inquiryForm.deliveryFee, inquiryForm.otherFee, weight);
      try {
        await updateStatus.mutateAsync({
          id: order.id,
          status: "inquiry_confirmed",
          freightStationName: inquiryForm.stationName,
          inquiryPhone: inquiryForm.stationPhone || undefined,
          ltlUnitPrice: inquiryForm.unitPrice,
          ltlDeliveryFee: inquiryForm.deliveryFee || "0",
          ltlOtherFee: inquiryForm.otherFee || "0",
          actualFreight: String(freight),
          dispatchPrice: String(total),
        });
        successCount++;
      } catch (e: any) {
        toast.error(`订单 ${order.orderNumber} 询价失败: ${e.message}`);
      }
      setGroupInquiryProgress(i + 1);
    }
    if (successCount > 0) {
      toast.success(`按整理批次询价完成，成功 ${successCount}/${groupInquiryOrders.length} 单`);
    }
    setShowInquiryDialog(false);
    setGroupInquiryOrders([]);
    setGroupInquiryProgress(0);
    refetchPending();
    refetchConfirmed();
  };

  // ===== OCR上传（询价发运台用） =====
  const handleOpenUpload = (order: any) => {
    setSelectedOrder(order);
    setShowUploadDialog(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOrder) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setOcrIsProcessing(true);
        const base64 = (reader.result as string).split(",")[1];
        const result = await ocrReceipt.mutateAsync({ fileBase64: base64, fileName: file.name });
        setOcrUploadedUrl(result.url);
        setOcrResult(result.ocrResult);
        setOcrWaybillNumber(result.ocrResult?.waybillNumber || "");
        setOcrActualWeight(result.ocrResult?.weight ? String(parseFloat(result.ocrResult.weight)) : "");
        setOcrActualFreight(result.ocrResult?.freightAmount ? String(parseFloat(result.ocrResult.freightAmount)) : "");
        setOcrEnableFreightAdjust(false);
        setOcrIsProcessing(false);
        setShowUploadDialog(false);
        setShowOcrConfirmDialog(true);
      } catch (err: any) {
        setOcrIsProcessing(false);
        toast.error(err.message || "上传失败");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleOcrConfirm = async () => {
    if (!selectedOrder) return;
    try {
      const updatePayload: any = {
        id: selectedOrder.id,
        stationReceiptUrl: ocrUploadedUrl,
        freightWaybillNumber: ocrWaybillNumber.trim() || undefined,
      };
      if (ocrEnableFreightAdjust) {
        const totalFreight = parseFloat(ocrActualFreight);
        const actualWeight = parseFloat(ocrActualWeight);
        const adjDeliveryFee = parseFloat(ocrAdjustDeliveryFee) || 0;
        const adjOtherFee = parseFloat(ocrAdjustOtherFee) || 0;
        if (!isNaN(totalFreight) && totalFreight > 0) {
          const pureFreight = Math.round((totalFreight - adjDeliveryFee - adjOtherFee) * 100) / 100;
          updatePayload.actualFreight = String(Math.max(pureFreight, 0));
          updatePayload.ltlDeliveryFee = String(adjDeliveryFee);
          updatePayload.ltlOtherFee = String(adjOtherFee);
          if (!isNaN(actualWeight) && actualWeight > 0) {
            const newUnitPrice = Math.round((Math.max(pureFreight, 0) / actualWeight) * 10000) / 10000;
            updatePayload.ltlUnitPrice = String(newUnitPrice);
            updatePayload.weight = String(actualWeight);
          }
          updatePayload.dispatchPrice = String(totalFreight);
        }
      }
      await updateOrderFields.mutateAsync(updatePayload);
      const msgs: string[] = ["货站开单上传成功"];
      if (ocrWaybillNumber.trim()) msgs.push(`运单号：${ocrWaybillNumber.trim()}`);
      if (ocrEnableFreightAdjust && updatePayload.dispatchPrice) {
        const parts: string[] = [`总运费¥${updatePayload.dispatchPrice}`];
        if (updatePayload.ltlUnitPrice) parts.push(`单价${updatePayload.ltlUnitPrice}元/吨`);
        if (parseFloat(updatePayload.ltlDeliveryFee || "0") > 0) parts.push(`送货费¥${updatePayload.ltlDeliveryFee}`);
        if (parseFloat(updatePayload.ltlOtherFee || "0") > 0) parts.push(`其他费¥${updatePayload.ltlOtherFee}`);
        msgs.push(`运费已校准：${parts.join("、")}`);
      }
      toast.success(msgs.join("，"));
      resetOcrState();
      utils.order.list.invalidate();
    } catch (err: any) {
      toast.error(err.message || "保存失败");
    }
  };

  const resetOcrState = () => {
    setShowOcrConfirmDialog(false);
    setOcrResult(null);
    setOcrUploadedUrl("");
    setOcrWaybillNumber("");
    setOcrActualWeight("");
    setOcrActualFreight("");
    setOcrAdjustDeliveryFee("");
    setOcrAdjustOtherFee("");
    setOcrEnableFreightAdjust(false);
  };

  // ===== 编辑运单号 =====
  const handleSaveWaybillNumber = async () => {
    if (!editWaybillOrder) return;
    try {
      await updateOrderFields.mutateAsync({
        id: editWaybillOrder.id,
        freightWaybillNumber: editWaybillNumber.trim() || undefined,
      });
      toast.success("运单号已更新");
      setShowEditWaybillDialog(false);
      setEditWaybillOrder(null);
      setEditWaybillNumber("");
      utils.order.list.invalidate();
    } catch (err: any) {
      toast.error(err.message || "保存失败");
    }
  };



  // ===== 编辑货站信息 =====
  const startEdit = (order: any) => {
    setEditOrder(order);
    setEditFields({
      freightWaybillNumber: order.freightWaybillNumber || "",
      inquiryPhone: order.inquiryPhone || "",
      freightStationName: order.freightStationName || "",
      ltlFinalStation: order.ltlFinalStation || "",
      shippingNote: order.shippingNote || "",
      ltlUnitPrice: order.ltlUnitPrice || "",
      ltlDeliveryFee: order.ltlDeliveryFee || "",
      ltlOtherFee: order.ltlOtherFee || "",
    });
  };

  const saveEdit = () => {
    if (!editOrder) return;
    const updates: any = { id: editOrder.id };
    for (const [k, v] of Object.entries(editFields)) {
      if (v !== "" && v !== undefined) updates[k] = v;
    }
    updateFieldsMutation.mutate(updates);
  };

  const openManualReview = (order: any) => {
    const anomaly = deriveLtlAnomaly(order);
    const latestReview = anomaly.latestReview;
    setReviewOrder(order);
    setReviewForm({
      level: latestReview?.fields["异常等级"] || latestReview?.fields["等级"] || (anomaly.level === "critical" ? "红色异常" : "橙色关注"),
      reason: latestReview?.fields["异常原因"] || latestReview?.fields["原因"] || anomaly.reasons[0] || "",
      owner: latestReview?.fields["责任归属"] || "",
      note: latestReview?.fields["复盘备注"] || latestReview?.fields["备注"] || "",
    });
  };

  const handleSaveReview = async () => {
    if (!reviewOrder) return;
    if (!reviewForm.reason.trim()) {
      toast.error("请先填写异常原因或复核结论");
      return;
    }
    try {
      await updateOrderFields.mutateAsync({
        id: reviewOrder.id,
        dispatcherRemark: appendStructuredNote(reviewOrder.dispatcherRemark, "异常复核", {
          异常等级: reviewForm.level,
          异常原因: reviewForm.reason.trim(),
          责任归属: reviewForm.owner.trim() || "待复核",
          复盘备注: reviewForm.note.trim() || undefined,
        }),
      });
      toast.success("异常复核已记录");
      setReviewOrder(null);
      setReviewForm({ level: "橙色关注", reason: "", owner: "", note: "" });
      utils.order.list.invalidate();
      utils.stats.customerLedger.invalidate();
      refetchAll();
    } catch (err: any) {
      toast.error(err.message || "保存失败");
    }
  };

  const handleConfirmRollback = async () => {
    if (!rollbackOrder) return;
    if (!rollbackCategory.trim()) {
      toast.error("请选择回退原因分类");
      return;
    }
    if (!rollbackOwner.trim()) {
      toast.error("请选择责任归属");
      return;
    }

    const rollbackFields = {
      回退原因: rollbackCategory.trim(),
      责任归属: rollbackOwner.trim(),
      补充说明: rollbackReason.trim() || undefined,
    };

    try {
      await updateOrderFields.mutateAsync({
        id: rollbackOrder.id,
        receivingNote: appendStructuredNote(rollbackOrder.receivingNote, "目的站回退", rollbackFields),
      });
      await revertStatusMutation.mutateAsync({
        id: rollbackOrder.id,
        targetStatus: ROLLBACK_MAP[rollbackOrder.status],
        reason: buildStructuredNote("目的站回退", rollbackFields),
      });
      utils.order.list.invalidate();
      utils.stats.customerLedger.invalidate();
    } catch (err: any) {
      toast.error(err.message || "退回失败");
    }
  };

  // ===== 加急切换 =====
  const handleToggleUrgent = async () => {
    if (!urgentToggleOrder) return;
    const newUrgent = !urgentToggleOrder.isUrgent;
    try {
      await updateOrderFields.mutateAsync({
        id: urgentToggleOrder.id,
        isUrgent: newUrgent,
        urgentReason: newUrgent ? urgentReason.trim() || undefined : undefined,
      });
      toast.success(newUrgent ? "已标记为加急" : "已取消加急");
      setUrgentToggleOrder(null);
      setUrgentReason("");
      utils.order.list.invalidate();
    } catch (err: any) {
      toast.error(err.message || "操作失败");
    }
  };

  // ===== 导出 =====
  const exportCSV = (data: any[], filename: string, type: "active" | "completed" | "ledger") => {
    if (!data.length) { toast.error("没有可导出的数据"); return; }
    let headers: string[];
    let rows: string[][];
    if (type === "ledger") {
      headers = ["客户订单号", "业务类型", "客户名称", "货物名称", "重量(吨)", "发货城市", "目的城市", "收货人", "收货电话", "货站名称", "货站运单号", "查货电话", "单价(元/吨)", "运费", "送货费", "其他费", "总费用", "报价", "车牌号", "大板", "状态", "日期"];
      rows = data.map((item: any) => [
        item.orderNumber || item.systemCode || "", BUSINESS_TYPE_LABELS[item.businessType] || item.businessType,
        item.customerName || "", item.cargoName || "", item.weight || "",
        item.originCity || "", item.destinationCity || "", item.receiverName || "", item.receiverPhone || "",
        item.freightStationName || "", item.freightWaybillNumber || "", item.inquiryPhone || "",
        item.ltlUnitPrice || "", item.actualFreight || "",
        item.ltlDeliveryFee || item.deliveryFee || "", item.ltlOtherFee || item.extraFee || "",
        item.totalCost || "", item.quotedPrice || "", item.plateNumber || "",
        item.isLargeSlab ? "大板" : "", STATUS_LABELS[item.status] || item.status,
        fmtDate(item.orderDate) !== "-" ? fmtDate(item.orderDate) : "",
      ]);
    } else {
      headers = ["客户订单号", "客户名称", "货物名称", "重量(吨)", "发货城市", "目的城市", "货站名称", "货站运单号", "查货电话", "单价(元/吨)", "运费", "送货费", "其他费", "总费用", "车牌号", "大板", "加急", "状态", "日期"];
      rows = data.map((item: any) => [
        item.orderNumber || item.systemCode || "", item.customerName || "",
        item.cargoName || "", item.weight || "", item.originCity || "", item.destinationCity || "",
        item.freightStationName || "", item.freightWaybillNumber || "", item.inquiryPhone || "",
        item.ltlUnitPrice || "", item.actualFreight || "",
        item.ltlDeliveryFee || item.deliveryFee || "", item.ltlOtherFee || item.extraFee || "",
        item.totalCost || "", item.plateNumber || "",
        item.isLargeSlab ? "大板" : "", item.isUrgent ? "加急" : "",
        STATUS_LABELS[item.status] || item.status,
        fmtDate(item.orderDate) !== "-" ? fmtDate(item.orderDate) : "",
      ]);
    }
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${data.length} 条数据`);
  };

  const exportExcel = (data: any[], filename: string, type: "active" | "completed" | "ledger") => {
    if (!data.length) { toast.error("没有可导出的数据"); return; }
    let headers: string[];
    let rows: string[][];
    if (type === "ledger") {
      headers = ["客户订单号", "业务类型", "客户名称", "货物名称", "重量(吨)", "发货城市", "目的城市", "收货人", "收货电话", "货站名称", "货站运单号", "查货电话", "单价(元/吨)", "运费", "送货费", "其他费", "总费用", "报价", "车牌号", "大板", "状态", "日期"];
      rows = data.map((item: any) => [
        item.orderNumber || item.systemCode || "", BUSINESS_TYPE_LABELS[item.businessType] || item.businessType,
        item.customerName || "", item.cargoName || "", String(item.weight || ""),
        item.originCity || "", item.destinationCity || "", item.receiverName || "", item.receiverPhone || "",
        item.freightStationName || "", item.freightWaybillNumber || "", item.inquiryPhone || "",
        String(item.ltlUnitPrice || ""), String(item.actualFreight || ""),
        String(item.ltlDeliveryFee || item.deliveryFee || ""), String(item.ltlOtherFee || item.extraFee || ""),
        String(item.totalCost || ""), String(item.quotedPrice || ""),
        item.plateNumber || "", item.isLargeSlab ? "大板" : "",
        STATUS_LABELS[item.status] || item.status,
        fmtDate(item.orderDate) !== "-" ? fmtDate(item.orderDate) : "",
      ]);
    } else {
      headers = ["客户订单号", "客户名称", "货物名称", "重量(吨)", "发货城市", "目的城市", "货站名称", "货站运单号", "查货电话", "单价(元/吨)", "运费", "送货费", "其他费", "总费用", "车牌号", "大板", "加急", "状态", "日期"];
      rows = data.map((item: any) => [
        item.orderNumber || item.systemCode || "", item.customerName || "",
        item.cargoName || "", String(item.weight || ""), item.originCity || "", item.destinationCity || "",
        item.freightStationName || "", item.freightWaybillNumber || "", item.inquiryPhone || "",
        String(item.ltlUnitPrice || ""), String(item.actualFreight || ""),
        String(item.ltlDeliveryFee || item.deliveryFee || ""), String(item.ltlOtherFee || item.extraFee || ""),
        String(item.totalCost || ""), item.plateNumber || "",
        item.isLargeSlab ? "大板" : "", item.isUrgent ? "加急" : "",
        STATUS_LABELS[item.status] || item.status,
        fmtDate(item.orderDate) !== "-" ? fmtDate(item.orderDate) : "",
      ]);
    }
    const escXml = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n';
    xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
    xml += '<Styles><Style ss:ID="header"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#E2EFDA" ss:Pattern="Solid"/></Style>';
    xml += '<Style ss:ID="summary"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/></Style></Styles>\n';
    xml += '<Worksheet ss:Name="Sheet1"><Table>\n';
    xml += '<Row>';
    headers.forEach(h => { xml += `<Cell ss:StyleID="header"><Data ss:Type="String">${escXml(h)}</Data></Cell>`; });
    xml += '</Row>\n';
    rows.forEach(row => {
      xml += '<Row>';
      row.forEach(cell => {
        const isNum = /^-?\d+(\.\d+)?$/.test(String(cell || "").trim());
        xml += `<Cell><Data ss:Type="${isNum ? "Number" : "String"}">${escXml(cell)}</Data></Cell>`;
      });
      xml += '</Row>\n';
    });
    xml += '<Row>';
    xml += `<Cell ss:StyleID="summary"><Data ss:Type="String">汇总（共${rows.length}条）</Data></Cell>`;
    for (let i = 1; i < headers.length; i++) xml += '<Cell ss:StyleID="summary"><Data ss:Type="String"></Data></Cell>';
    xml += '</Row>\n';
    const totalFreight = data.reduce((s: number, d: any) => s + parseFloat(d.actualFreight || "0"), 0);
    const totalCost = data.reduce((s: number, d: any) => s + parseFloat(d.totalCost || "0"), 0);
    const totalDeliveryFee = data.reduce((s: number, d: any) => s + parseFloat(d.ltlDeliveryFee || d.deliveryFee || "0"), 0);
    const totalOtherFee = data.reduce((s: number, d: any) => s + parseFloat(d.ltlOtherFee || d.extraFee || "0"), 0);
    const totalWeight = data.reduce((s: number, d: any) => s + parseFloat(d.weight || "0"), 0);
    const summaryItems = [
      { label: "订单总数", value: String(rows.length) },
      { label: "总重量(吨)", value: totalWeight.toFixed(2) },
      { label: "运费总额", value: `¥${totalFreight.toFixed(2)}` },
      { label: "送货费总额", value: `¥${totalDeliveryFee.toFixed(2)}` },
      { label: "其他费总额", value: `¥${totalOtherFee.toFixed(2)}` },
      { label: "总费用", value: `¥${totalCost.toFixed(2)}` },
    ];
    summaryItems.forEach(item => {
      xml += '<Row>';
      xml += `<Cell ss:StyleID="summary"><Data ss:Type="String">${escXml(item.label)}</Data></Cell>`;
      xml += `<Cell ss:StyleID="summary"><Data ss:Type="String">${escXml(item.value)}</Data></Cell>`;
      for (let i = 2; i < headers.length; i++) xml += '<Cell><Data ss:Type="String"></Data></Cell>';
      xml += '</Row>\n';
    });
    xml += '</Table></Worksheet></Workbook>';
    const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename.replace(/\.csv$/, ".xls"); a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出Excel ${data.length} 条数据`);
  };

  const getExportFilename = () => {
    const dateStr = new Date().toLocaleDateString("zh-CN");
    if (activeTab === "ledger") return `零担台账_${dateStr}.csv`;
    if (activeTab === "active") return `零担进行中_${dateStr}.csv`;
    if (activeTab === "completed") return `零担已完成_${dateStr}.csv`;
    return `零担导出_${dateStr}.csv`;
  };

  const getCurrentExportData = () => {
    if (activeTab === "ledger") return (ledgerData || []).filter((d: any) => d.businessType === "ltl");
    if (activeTab === "active") return activeOrders;
    if (activeTab === "completed") return completedOrders;
    return [];
  };

  const navigateToPodTab = (tab: "pending_receipt" | "received" | "overdue_monitor", keyword?: string) => {
    navigate(buildPodDepositRoute(tab, {
      businessType: "ltl",
      keyword: keyword || search || undefined,
      dateFrom: filterStartDate || undefined,
      dateTo: filterEndDate || undefined,
    }));
  };

  // ===== 加急按钮组件 =====
  const UrgentToggleButton = ({ order }: { order: any }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 w-7 p-0 ${order.isUrgent ? "text-red-500 hover:bg-red-50" : "text-muted-foreground hover:bg-orange-50 hover:text-orange-500"}`}
          disabled={updateOrderFields.isPending}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            setUrgentToggleOrder(order);
            setUrgentReason(order.urgentReason || "");
          }}
        >
          <Flame className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{order.isUrgent ? "取消加急" : "标记加急"}</TooltipContent>
    </Tooltip>
  );

  // ===== 渲染 =====
  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* 顶部标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              零担统一工作台
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              纯零担先做内部整理与询价；前段外请、后段外请会继续挂在零担主单下流转，不与正式外请整组混用。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refetchAll}>
              <RefreshCw className="h-4 w-4 mr-1" />
              刷新
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/station/entry")}>
              <Plus className="h-4 w-4 mr-1" />
              前往录单台
            </Button>
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    更多操作
                    <ChevronDown className="ml-1 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={selectedIds.size === 0}
                    className="text-orange-600 focus:text-orange-700"
                    onClick={() => {
                      if (selectedIds.size === 0) return;
                      setBatchRollbackOpen(true);
                      setBatchRollbackReason("");
                    }}
                  >
                    <Undo2 className="mr-2 h-4 w-4" />
                    批量退回{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger asChild>
            <button className="group flex w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-slate-100/80 transition-colors">
              <HelpCircle className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>操作指引（纯零担主链 / 前段外请子链 / 后段外请子链 — 点击展开）</span>
              <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 md:grid-cols-3">
              <div className="rounded-lg bg-white/80 p-3 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">纯零担主链</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">只做内部整理、询价、货站发运与台账跟踪。页面优先展示车号、货站、班线、目的站等执行结果，参考批次仅用于内部对照，不额外生成正式外请分组。</p>
              </div>
              <div className="rounded-lg bg-white/80 p-3 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">前段外请子链</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">如需先由外请车提货并送至货站，请在零担主单下承接前段外请动作；前段完成后，仍回到零担主链继续货站发运与后续运作。</p>
              </div>
              <div className="rounded-lg bg-white/80 p-3 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">后段外请子链</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">如货物到达目的站后需要自提送货、预约卸货或末端配送，请继续在零担主单下承接后段外请与目的站收货确认，不把后段结果误当成纯零担整理记录。</p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* 统计横条 */}
        <div className="flex items-center gap-0 rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="flex flex-1 items-center gap-2 px-4 py-2 border-r border-slate-100">
            <div className="h-2 w-2 rounded-full bg-cyan-500"></div>
            <span className="text-xs text-muted-foreground">待询价</span>
            <span className="ml-auto text-base font-bold text-cyan-700">{stats.pendingInquiry}</span>
          </div>
          <div className="flex flex-1 items-center gap-2 px-4 py-2 border-r border-slate-100">
            <div className="h-2 w-2 rounded-full bg-teal-500"></div>
            <span className="text-xs text-muted-foreground">已询价待派车</span>
            <span className="ml-auto text-base font-bold text-teal-700">{stats.confirmed}</span>
          </div>
          <div className="flex flex-1 items-center gap-2 px-4 py-2 border-r border-slate-100">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span className="text-xs text-muted-foreground">运作中</span>
            <span className="ml-auto text-base font-bold text-green-700">{stats.inTransit}</span>
          </div>
          <div className="flex flex-1 items-center gap-2 px-4 py-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
            <span className="text-xs text-muted-foreground">已送达</span>
            <span className="ml-auto text-base font-bold text-emerald-700">{stats.delivered}</span>
          </div>
        </div>

        {/* 全局搜索+日期筛选+导出 */}
        <div className="flex flex-wrap items-center gap-2 bg-muted/20 rounded-lg p-3 border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索订单号、客户名、目的地..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 w-56 text-sm"
            />
          </div>
          {(activeTab === "ledger" || activeTab === "active" || activeTab === "completed") && (
            <>
              <Input type="date" className="h-8 w-36 text-xs" value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)} />
              <span className="text-xs text-muted-foreground">至</span>
              <Input type="date" className="h-8 w-36 text-xs" value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)} />
            </>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
            setSearch(""); setFilterStartDate(""); setFilterEndDate("");
          }}>清除筛选</Button>
          {(activeTab === "ledger" || activeTab === "active" || activeTab === "completed") && (
            <div className="ml-auto flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8" onClick={() => exportCSV(getCurrentExportData(), getExportFilename(), activeTab as any)} disabled={getCurrentExportData().length === 0}>
                <Download className="h-3.5 w-3.5 mr-1" />导出CSV
              </Button>
              <Button variant="default" size="sm" className="h-8 bg-green-600 hover:bg-green-700" onClick={() => exportExcel(getCurrentExportData(), getExportFilename(), activeTab as any)} disabled={getCurrentExportData().length === 0}>
                <Download className="h-3.5 w-3.5 mr-1" />导出Excel
              </Button>
            </div>
          )}
        </div>

        {/* Tab切换 */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedIds(new Set()); }}>
          <TabsList>
            <TabsTrigger value="pending">
              待询价 {pendingOrders.length > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">{pendingOrders.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="confirmed">
              已询价 {confirmedOrders.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{confirmedOrders.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="ltl_dispatch">
              <Truck className="h-3.5 w-3.5 mr-1" />
              零担派车
            </TabsTrigger>
            <TabsTrigger value="active">
              进行中 {activeOrders.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{activeOrders.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="completed">
              已完成 {completedOrders.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{completedOrders.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="ledger">
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
              零担台账
            </TabsTrigger>
          </TabsList>

          {/* ===== 待询价 Tab ===== */}
          <TabsContent value="pending">
            <Card>
              <CardContent className="p-0">
                <div className="border-b border-cyan-100 bg-cyan-50/80 px-4 py-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <Badge variant="outline" className="border-cyan-200 bg-white/90 text-cyan-700">
                      {pendingInquirySummary.emphasisLabel}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-cyan-900">{pendingInquirySummary.headline}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {pendingInquirySummary.chips.map((chip) => (
                          <Badge key={chip} variant="secondary" className="bg-white/90 text-cyan-700 hover:bg-white">
                            {chip}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-cyan-800">{pendingInquirySummary.detail}</p>
                    </div>
                  </div>
                </div>
                {selectedPendingOrders.length > 0 && (
                  <div className="flex flex-col gap-3 border-b border-cyan-100 bg-cyan-50/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-cyan-900">已选 {selectedPendingOrders.length} 个待询价零担主单</div>
                      <p className="text-xs leading-5 text-cyan-800">
                        如同一台车需要承接多个零担主单，可直接发起同一条前段外请询价链路；已建前段外请子链的主单会自动禁止重复创建。
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>清空选择</Button>
                      <Button
                        size="sm"
                        className="bg-sky-600 hover:bg-sky-700"
                        onClick={handleCreateCombinedPickupSubchain}
                        disabled={selectedPendingOrders.length < 2 || pickupSubchainStatusLoading}
                      >
                        {pickupSubchainStatusLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Truck className="h-4 w-4 mr-1" />}
                        {selectedPendingOrders.length >= 2 ? `合车前段外请 (${selectedPendingOrders.length}单)` : "至少选择2单合车外请"}
                      </Button>
                    </div>
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"><Checkbox checked={pendingOrders.length > 0 && pendingOrders.every((o: any) => selectedIds.has(o.id))} onCheckedChange={() => { if (pendingOrders.every((o: any) => selectedIds.has(o.id))) { const next = new Set(selectedIds); pendingOrders.forEach((o: any) => next.delete(o.id)); setSelectedIds(next); } else { const next = new Set(selectedIds); pendingOrders.forEach((o: any) => next.add(o.id)); setSelectedIds(next); } }} /></TableHead>
                      <TableHead>客户订单号</TableHead>
                      <TableHead>客户 · 货物</TableHead>
                      <TableHead>路线</TableHead>
                      <TableHead>吨位</TableHead>
                      <TableHead>备注</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingLoading ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
                    ) : pendingOrders.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">暂无待询价订单。纯零担内部整理会优先展示目的站、货站与后续车次执行结果，参考批次号仅用于内部对照，不作为正式外请分组；如需前段外请到货站或后段目的站送货，请继续在零担主单下承接对应子链动作。</TableCell></TableRow>
                    ) : (
                      <>
                        {/* 有合并计划号的分组 */}
                        {pendingGrouped && Array.from(pendingGrouped.groups.entries()).map(([planNumber, groupOrders]) => {
                          const isExpanded = pendingExpanded.has(planNumber);
                          const totalWeight = groupOrders.reduce((s: number, o: any) => s + parseFloat(String(o.weight || 0)), 0);
                          const groupDisplaySummary = buildLtlPendingInquiryDisplaySummary(groupOrders as any[]);
                          return (
                            <React.Fragment key={planNumber}>
                              <TableRow
                                className="bg-blue-50/80 hover:bg-blue-100/80 cursor-pointer border-l-3 border-l-blue-500"
                                onClick={() => togglePendingGroup(planNumber)}
                              >
                                <TableCell onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={groupOrders.every((o: any) => selectedIds.has(o.id))}
                                    onCheckedChange={() => {
                                      const allSelected = groupOrders.every((o: any) => selectedIds.has(o.id));
                                      const next = new Set(selectedIds);
                                      groupOrders.forEach((o: any) => allSelected ? next.delete(o.id) : next.add(o.id));
                                      setSelectedIds(next);
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="font-mono text-xs font-bold">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1">
                                      {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                      <Layers className="h-3 w-3 text-blue-500" />
                                      <span className="text-blue-700 font-semibold">{groupDisplaySummary.headline}</span>
                                      <Badge variant="secondary" className="text-[10px] ml-1">{groupOrders.length}单</Badge>
                                      <Badge variant="outline" className="border-blue-200 bg-white/90 text-[10px] text-blue-700">
                                        {groupDisplaySummary.emphasisLabel}
                                      </Badge>
                                    </div>
                                    <div className="pl-4 pt-1 text-[10px] font-normal text-blue-700/80">
                                      <div className="flex flex-wrap gap-1">
                                        {groupDisplaySummary.chips.map((chip) => (
                                          <span key={chip} className="rounded-full border border-blue-200 bg-white/80 px-1.5 py-0.5 text-[10px] text-blue-700">
                                            {chip}
                                          </span>
                                        ))}
                                      </div>
                                      <div className="mt-1">{groupDisplaySummary.detail}</div>
                                      <div className="mt-1 text-blue-700/70">内部整理参考批次：{planNumber}</div>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{groupOrders[0]?.customerName || "-"}</TableCell>
                                <TableCell className="text-xs">
                                  <span className="flex items-center gap-1">
                                    {groupOrders[0]?.originCity} <ArrowRight className="h-3 w-3" /> {groupOrders[0]?.destinationCity}
                                  </span>
                                </TableCell>
                                <TableCell className="text-xs font-bold">{totalWeight.toFixed(3)}t</TableCell>
                                <TableCell></TableCell>
                                <TableCell><Badge className={STATUS_COLORS.pending_inquiry} variant="secondary">待询价</Badge></TableCell>
                                <TableCell onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                  <Button size="sm" onClick={() => handleGroupInquiry(groupOrders)}>
                                    <Phone className="h-3 w-3 mr-1" />按整理批次询价
                                  </Button>
                                </TableCell>
                              </TableRow>
                              {isExpanded && groupOrders.map((order: any) => (
                                <TableRow key={order.id} className="bg-blue-50/30 border-l-2 border-l-blue-200">
                                  <TableCell><Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} /></TableCell>
                                  <TableCell className="font-mono text-xs">
                                    <span className="text-muted-foreground pl-4">└</span> {order.orderNumber || order.systemCode}
                                  </TableCell>
                                  <TableCell><div className="text-xs text-muted-foreground">{order.cargoName || "-"}</div></TableCell>
                                  <TableCell className="text-xs">
                                    <span className="flex items-center gap-1">
                                      {order.originCity || "?"} <ArrowRight className="h-3 w-3" /> {order.destinationCity || "?"}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-xs">{order.weight ? `${order.weight}t` : "-"}</TableCell>
                                  <TableCell className="text-xs max-w-[120px] truncate" title={order.dispatcherRemark || ""}>{order.dispatcherRemark || <span className="text-muted-foreground">-</span>}</TableCell>
                                  <TableCell><Badge className={STATUS_COLORS.pending_inquiry} variant="secondary">待询价</Badge></TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      <Button size="sm" variant="outline" onClick={() => handleOpenInquiry(order)}>
                                        <Phone className="h-3 w-3 mr-1" />询价 / 确认报价
                                      </Button>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                            <MoreHorizontal className="h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem
                                            disabled={pickupSubchainStatusLoading || Boolean(getPickupSubchainRecord(order))}
                                            onClick={() => handleCreatePickupSubchain(order)}
                                          >
                                            <Truck className="mr-2 h-4 w-4" />
                                            {pickupSubchainStatusLoading ? "前段外请校验中" : getPickupSubchainRecord(order) ? "前段外请车（已转）" : "前段外请车"}
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleToggleCustomerSelfDeliver(order, !hasLtlTag(order?.remarks, LTL_CUSTOMER_SELF_DELIVER_TAG))}>
                                            <Package className="mr-2 h-4 w-4" />
                                            {hasLtlTag(order?.remarks, LTL_CUSTOMER_SELF_DELIVER_TAG) ? "取消客户自送到站确认" : "客户自送到站确认"}
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => { setUrgentToggleOrder(order); setUrgentReason(order.urgentReason || ""); }}>
                                            <Flame className="mr-2 h-4 w-4" />
                                            {order.isUrgent ? "取消加急" : "标记加急"}
                                          </DropdownMenuItem>
                                          {hasPermission("order.rollback") && (
                                            <DropdownMenuItem onClick={() => openRollbackDialog(order)}>
                                              <Undo2 className="mr-2 h-4 w-4" />
                                              退回
                                            </DropdownMenuItem>
                                          )}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </React.Fragment>
                          );
                        })}
                        {/* 无合并计划号的单独订单 */}
                        {(pendingGrouped?.ungrouped ?? []).map((order: any) => (
                          <TableRow key={order.id} className={`${selectedIds.has(order.id) ? "bg-primary/5" : order.isUrgent ? "bg-red-50/60 border-l-4 border-l-red-500" : ""} transition-colors`}>
                            <TableCell><Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} /></TableCell>
                            <TableCell className="font-mono text-xs">
                              <div className="flex items-center gap-1">
                                {order.isUrgent && <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" title="加急"></span>}
                                {order.isUrgent && <Badge variant="destructive" className="text-[9px] h-4 px-1 leading-none">急</Badge>}
                                {order.orderNumber || order.systemCode}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{order.customerName || "-"}</div>
                              <div className="text-xs text-muted-foreground">{order.cargoName || "-"}</div>
                              <div className="mt-1 text-[10px] text-cyan-700">
                                {(order.freightStationName && `货站：${order.freightStationName}`)
                                  || (order.ltlFinalStation && `目的站：${order.ltlFinalStation}`)
                                  || (order.plateNumber && `车号：${order.plateNumber}`)
                                  || "当前优先按线路整理执行结果，待补货站/车次"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 text-xs">
                                {order.originCity || "?"} <ArrowRight className="h-3 w-3" /> {order.destinationCity || "?"}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">{order.weight ? `${order.weight}t` : "-"}</TableCell>
                            <TableCell className="text-xs max-w-[120px] truncate" title={order.dispatcherRemark || ""}>{order.dispatcherRemark || <span className="text-muted-foreground">-</span>}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {order.isUrgent && <Badge variant="destructive" className="text-[10px] px-1 py-0 mr-1"><Flame className="h-2.5 w-2.5 mr-0.5" />加急</Badge>}
                                <Badge className={STATUS_COLORS.pending_inquiry} variant="secondary">待询价</Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button size="sm" onClick={() => handleOpenInquiry(order)}>
                                  <Phone className="h-3 w-3 mr-1" />询价 / 确认报价
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      disabled={pickupSubchainStatusLoading || Boolean(getPickupSubchainRecord(order))}
                                      onClick={() => handleCreatePickupSubchain(order)}
                                    >
                                      <Truck className="mr-2 h-4 w-4" />
                                      {pickupSubchainStatusLoading ? "前段外请校验中" : getPickupSubchainRecord(order) ? "前段外请车（已转）" : "前段外请车"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setUrgentToggleOrder(order); setUrgentReason(order.urgentReason || ""); }}>
                                      <Flame className="mr-2 h-4 w-4" />
                                      {order.isUrgent ? "取消加急" : "标记加急"}
                                    </DropdownMenuItem>
                                    {hasPermission("order.rollback") && (
                                      <DropdownMenuItem onClick={() => openRollbackDialog(order)}>
                                        <Undo2 className="mr-2 h-4 w-4" />
                                        退回
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </TableBody>
                </Table>
                <TablePagination total={pendingOrders.length} page={pendingPage} pageSize={pendingPageSize} onPageChange={setPendingPage} onPageSizeChange={setPendingPageSize} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== 已询价待发运 Tab ===== */}
          <TabsContent value="confirmed">
            <Card>
              <CardContent className="p-0">
                <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex flex-wrap items-center gap-2 text-sm text-blue-700">
                  <Truck className="h-4 w-4" />
                  <span>询价完成后，请进入下一步的零担派车环节统一创建派车批次（支持批量派车）。</span>
                  <Button size="sm" variant="link" className="text-blue-700 underline p-0 h-auto" onClick={() => setActiveTab("ltl_dispatch")}>进入下一步：零担派车</Button>
                  {(() => {
                    const confirmedSelectedCount = confirmedOrders.filter((o: any) => selectedIds.has(o.id)).length;
                    if (confirmedSelectedCount === 0) return null;
                    return (
                      <div className="ml-auto flex items-center gap-2">
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-700" onClick={() => setSelectedIds(new Set())}>取消选择</Button>
                        <Button
                          size="sm"
                          className="h-7 bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => {
                            try {
                              const ids = confirmedOrders.filter((o: any) => selectedIds.has(o.id)).map((o: any) => o.id);
                              sessionStorage.setItem("ltl_dispatch_preselect_ids", JSON.stringify(ids));
                            } catch { /* ignore */ }
                            setActiveTab("ltl_dispatch");
                          }}
                        >
                          <Truck className="h-3.5 w-3.5 mr-1" />派车 ({confirmedSelectedCount}单)
                        </Button>
                      </div>
                    );
                  })()}
                </div>
                <div className="px-4 pt-4">
                  <SortRuleNotice
                    defaultText="最近询价更新时间倒序显示"
                    currentSort={confirmedSort}
                    sortLabels={{ customerName: "客户", originCity: "路线", stationName: "货站", totalCost: "运费", updatedAt: "询价更新时间" }}
                    emptyText="当前使用系统默认排序（最近询价更新时间倒序）"
                  />
                </div>
                {/* 表格列表：按目的站分组 */}
                {confirmedLoading ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
                ) : paginatedConfirmed.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">暂无已询价订单</div>
                ) : (() => {
                  const groupMap = new Map<string, any[]>();
                  paginatedConfirmed.forEach((o: any) => {
                    const key = o.destinationCity || o.destinationProvince || "未填目的地";
                    if (!groupMap.has(key)) groupMap.set(key, []);
                    groupMap.get(key)!.push(o);
                  });
                  const groups = Array.from(groupMap.entries())
                    .map(([key, orders]) => ({
                      key,
                      orders,
                      totalWeight: orders.reduce((s, o) => s + (Number(o.weight) || 0), 0),
                      totalAmount: orders.reduce((s, o) => s + (Number(o.dispatchPrice) || 0), 0),
                    }))
                    .sort((a, b) => b.totalWeight - a.totalWeight);
                  const totalGroupPackages = (orders: any[]) => orders.reduce((s, o) => s + (Number(o.packageCount) || 0), 0);
                  const CONFIRMED_COL_COUNT = 7;
                  return (
                    <div className="px-4 py-4">
                      <div className="rounded-lg border bg-card overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-8"></TableHead>
                              <TableHead>客户订单号</TableHead>
                              <TableHead>客户·货物</TableHead>
                              <TableHead>路线·货站</TableHead>
                              <TableHead>重量架数</TableHead>
                              <TableHead>运费明细</TableHead>
                              <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {groups.map(group => {
                              const groupAllSelected = group.orders.length > 0 && group.orders.every((o: any) => selectedIds.has(o.id));
                              const groupSomeSelected = group.orders.some((o: any) => selectedIds.has(o.id));
                              const groupTotalPackages = totalGroupPackages(group.orders);
                              return (
                                <React.Fragment key={group.key}>
                                  {/* 分组标题行 */}
                                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                                    <TableCell colSpan={CONFIRMED_COL_COUNT} className="py-2">
                                      <div className="flex items-center gap-3 flex-wrap">
                                        <Checkbox
                                          checked={groupAllSelected}
                                          data-state={groupAllSelected ? "checked" : groupSomeSelected ? "indeterminate" : "unchecked"}
                                          onCheckedChange={() => {
                                            const next = new Set(selectedIds);
                                            if (groupAllSelected) {
                                              group.orders.forEach((o: any) => next.delete(o.id));
                                            } else {
                                              group.orders.forEach((o: any) => next.add(o.id));
                                            }
                                            setSelectedIds(next);
                                          }}
                                        />
                                        <span className="font-semibold text-base text-slate-800">📍 {group.key}</span>
                                        <Badge variant="secondary" className="text-xs">{group.orders.length}单</Badge>
                                        {group.totalWeight > 0 && (
                                          <Badge variant="outline" className="text-xs text-orange-700 border-orange-400 bg-orange-100 font-semibold">
                                            总{group.totalWeight.toFixed(2)}吨
                                          </Badge>
                                        )}
                                        {groupTotalPackages > 0 && (
                                          <Badge variant="outline" className="text-xs text-purple-700 border-purple-300 bg-purple-50">
                                            共{groupTotalPackages}架
                                          </Badge>
                                        )}
                                        {group.totalAmount > 0 && (
                                          <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">
                                            运费／{group.totalAmount.toFixed(0)}
                                          </Badge>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                  {/* 订单行 */}
                                  {group.orders.map((order: any) => {
                                    const selected = selectedIds.has(order.id);
                                    return (
                                      <TableRow
                                        key={order.id}
                                        className={`cursor-pointer ${selected ? "bg-primary/5" : order.isUrgent ? "bg-red-50/60" : ""}`}
                                        onClick={() => toggleSelect(order.id)}
                                      >
                                        <TableCell className="w-8" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                          <Checkbox
                                            checked={selected}
                                            onCheckedChange={() => toggleSelect(order.id)}
                                          />
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex items-center gap-1.5">
                                            {order.isUrgent && <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" title="加急"></span>}
                                            <span className="font-mono text-xs font-semibold">{order.orderNumber || order.systemCode}</span>
                                            {order.isUrgent && <Badge variant="destructive" className="text-[9px] h-4 px-1 leading-none">急</Badge>}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <div className="text-sm font-medium truncate">{order.customerName || "-"}</div>
                                          <div className="text-xs text-muted-foreground truncate">{order.cargoName || "-"}</div>
                                          <LtlModeBadges order={order} pickupSubchain={getPickupSubchainRecord(order)} deliverySubchain={getDeliverySubchainRecord(order)} />
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          <div className="flex items-center gap-1 text-slate-700">
                                            <span className="text-muted-foreground">路线：</span>
                                            {order.originCity || "?"} <ArrowRight className="h-3 w-3 inline" /> {order.destinationCity || "?"}
                                          </div>
                                          <div className="text-slate-700 mt-0.5">
                                            <span className="text-muted-foreground">货站：</span>{order.freightStationName || "-"}
                                          </div>
                                          <div className="text-slate-700 mt-0.5">
                                            <span className="text-muted-foreground">运单号：</span>
                                            {order.freightWaybillNumber ? (
                                              <span className="inline-flex items-center gap-1">
                                                <span className="font-mono text-blue-600">{order.freightWaybillNumber}</span>
                                                <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setEditWaybillOrder(order); setEditWaybillNumber(order.freightWaybillNumber || ""); setShowEditWaybillDialog(true); }}>
                                                  <Pencil className="h-3 w-3 text-muted-foreground" />
                                                </Button>
                                              </span>
                                            ) : <span className="text-muted-foreground">-</span>}
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          <div><span className="text-muted-foreground">重量：</span><span className="font-medium">{order.weight || "-"}吨</span></div>
                                          {order.packageCount && (
                                            <div className="mt-0.5"><span className="text-muted-foreground">架数：</span>{order.packageCount}</div>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          {order.dispatchPrice ? (
                                            <>
                                              <div className="font-semibold text-orange-600 text-sm">￥{Number(order.dispatchPrice).toFixed(0)}</div>
                                              {order.ltlUnitPrice && (
                                                <div className="text-[10px] text-muted-foreground">
                                                  {order.ltlUnitPrice}元/吨×{order.weight || 0}吨
                                                  {order.ltlDeliveryFee && parseFloat(String(order.ltlDeliveryFee)) > 0 ? `+送${order.ltlDeliveryFee}` : ""}
                                                  {order.ltlOtherFee && parseFloat(String(order.ltlOtherFee)) > 0 ? `+其他${order.ltlOtherFee}` : ""}
                                                </div>
                                              )}
                                            </>
                                          ) : <span className="text-muted-foreground">-</span>}
                                          {order.dispatcherRemark && (
                                            <div className="text-xs text-muted-foreground mt-1 truncate" title={order.dispatcherRemark}>备注：{order.dispatcherRemark}</div>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                          <div className="flex flex-wrap gap-1 justify-end">
                                            <UrgentToggleButton order={order} />
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600 hover:bg-green-50" onClick={() => startEdit(order)}>
                                                  <Edit2 className="h-3.5 w-3.5" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>编辑信息</TooltipContent>
                                            </Tooltip>
                                            <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                                </Button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                                <DropdownMenuItem onClick={() => handleToggleCustomerSelfDeliver(order, !hasLtlTag(order?.remarks, LTL_CUSTOMER_SELF_DELIVER_TAG))}>
                                                  <Package className="mr-2 h-4 w-4" />
                                                  {hasLtlTag(order?.remarks, LTL_CUSTOMER_SELF_DELIVER_TAG) ? "取消客户自送到站确认" : "客户自送到站确认"}
                                                </DropdownMenuItem>
                                              </DropdownMenuContent>
                                            </DropdownMenu>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  );
                })()}
                <TablePagination total={confirmedOrders.length} page={confirmedPage} pageSize={confirmedPageSize} onPageChange={setConfirmedPage} onPageSizeChange={setConfirmedPageSize} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== 零担派车 Tab ===== */}
          <TabsContent value="ltl_dispatch">
            <LtlDispatchWorkspace />
          </TabsContent>

          {/* ===== 进行中 Tab ===== */}
          <TabsContent value="active">
            <Card>
              <CardContent className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
                  <div>
                    进行中页优先承接运输跟踪动作；异常复核、资料查看与编辑等辅助操作已收纳到“更多”菜单，避免主流程被非执行任务打断。
                  </div>
                </div>
                <div className="px-4 pt-4">
                  <SortRuleNotice
                    defaultText="最近状态推进时间倒序显示"
                    currentSort={activeSort}
                    sortLabels={{ customerName: "客户", originCity: "路线", stationName: "货站", totalCost: "运费", progressAt: "状态推进时间", status: "状态" }}
                    emptyText="当前使用系统默认排序（最近状态推进时间倒序）"
                  />
                </div>
                {/* 批量操作栏 */}
                {selectedIds.size > 0 && (() => {
                  const selectedActive = activeOrders.filter((o: any) => selectedIds.has(o.id));
                  const canBatchDeliver = selectedActive.filter((o: any) => ["dispatched", "shipped", "in_transit"].includes(o.status));
                  const canBatchSign = selectedActive.filter((o: any) => o.status === "delivered");
                  const canCombinedDelivery = selectedActive.filter((o: any) => ["shipped", "in_transit"].includes(o.status));
                  return (
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border-b">
                      <span className="text-sm font-medium text-blue-700">已选 {selectedActive.length} 条</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {canCombinedDelivery.length > 1 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-sky-300 text-sky-700 hover:bg-sky-50"
                            disabled={deliverySubchainStatusLoading}
                            onClick={handleCreateCombinedDeliverySubchain}
                          >
                            {deliverySubchainStatusLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Truck className="mr-1 h-3.5 w-3.5" />}
                            合车后段外请 ({canCombinedDelivery.length})
                          </Button>
                        )}
                        {canBatchDeliver.length > 0 && (
                          <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            disabled={batchStatusMutation.isPending}
                            onClick={() => {
                              if (!confirm(`确认将 ${canBatchDeliver.length} 条订单标记为已送达？`)) return;
                              batchStatusMutation.mutate(
                                { orderIds: canBatchDeliver.map((o: any) => o.id), status: "delivered" },
                                { onSuccess: () => { toast.success(`已批量标记 ${canBatchDeliver.length} 条为已送达`); setSelectedIds(new Set()); refetchAll(); }, onError: (err) => toast.error(err.message) }
                              );
                            }}>
                            <Truck className="h-3.5 w-3.5 mr-1" /> 批量送达 ({canBatchDeliver.length})
                          </Button>
                        )}
                        {canBatchSign.length > 0 && (
                          <Button size="sm" variant="outline" className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                            disabled={batchStatusMutation.isPending}
                            onClick={() => {
                              if (!confirm(`确认将 ${canBatchSign.length} 条订单标记为已签收？`)) return;
                              batchStatusMutation.mutate(
                                { orderIds: canBatchSign.map((o: any) => o.id), status: "signed" },
                                { onSuccess: () => { toast.success(`已批量标记 ${canBatchSign.length} 条为已签收`); setSelectedIds(new Set()); refetchAll(); }, onError: (err) => toast.error(err.message) }
                              );
                            }}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> 批量签收 ({canBatchSign.length})
                          </Button>
                        )}
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={() => setSelectedIds(new Set())}>
                        取消选择
                      </Button>
                    </div>
                  );
                })()}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox checked={activeOrders.length > 0 && activeOrders.every((o: any) => selectedIds.has(o.id))} onCheckedChange={() => {
                          if (activeOrders.every((o: any) => selectedIds.has(o.id))) {
                            const next = new Set(selectedIds); activeOrders.forEach((o: any) => next.delete(o.id)); setSelectedIds(next);
                          } else {
                            const next = new Set(selectedIds); activeOrders.forEach((o: any) => next.add(o.id)); setSelectedIds(next);
                          }
                        }} />
                      </TableHead>
                      <TableHead>客户订单号</TableHead>
                      <SortableHeader sortKey="customerName" currentSort={activeSort} onToggle={toggleActiveSort}>客户 · 货物</SortableHeader>
                      <SortableHeader sortKey="originCity" currentSort={activeSort} onToggle={toggleActiveSort}>路线</SortableHeader>
                      <SortableHeader sortKey="weight" currentSort={activeSort} onToggle={toggleActiveSort}>吨位</SortableHeader>
                      <SortableHeader sortKey="stationName" currentSort={activeSort} onToggle={toggleActiveSort}>货站信息</SortableHeader>
                      <TableHead>货站运单号</TableHead>
                      <SortableHeader sortKey="totalCost" currentSort={activeSort} onToggle={toggleActiveSort}>运费明细</SortableHeader>
                      <TableHead>备注</TableHead>
                      <SortableHeader sortKey="status" currentSort={activeSort} onToggle={toggleActiveSort}>状态</SortableHeader>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ltlLoading ? (
                      <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
                    ) : paginatedActive.length === 0 ? (
                      <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">暂无进行中的订单</TableCell></TableRow>
                    ) : (() => {
                      const grpMap = new Map<string, any[]>();
                      paginatedActive.forEach((o: any) => {
                        const key = o.destinationCity || o.destinationProvince || "未填目的地";
                        if (!grpMap.has(key)) grpMap.set(key, []);
                        grpMap.get(key)!.push(o);
                      });
                      const grps = Array.from(grpMap.entries())
                        .map(([key, orders]) => ({
                          key, orders,
                          totalWeight: orders.reduce((s: number, o: any) => s + (Number(o.weight) || 0), 0),
                          totalPackages: orders.reduce((s: number, o: any) => s + (Number(o.packageCount) || 0), 0),
                          totalAmount: orders.reduce((s: number, o: any) => s + (Number(o.totalCost || o.dispatchPrice) || 0), 0),
                        }))
                        .sort((a, b) => b.totalWeight - a.totalWeight);
                      return grps.flatMap((grp) => {
                        const grpAllSelected = grp.orders.length > 0 && grp.orders.every((o: any) => selectedIds.has(o.id));
                        const grpSomeSelected = grp.orders.some((o: any) => selectedIds.has(o.id));
                        return [
                          (
                            <TableRow key={`grp-${grp.key}`} className="bg-emerald-50 hover:bg-emerald-50 border-l-4 border-l-emerald-400">
                              <TableCell>
                                <Checkbox
                                  checked={grpAllSelected}
                                  data-state={grpAllSelected ? "checked" : grpSomeSelected ? "indeterminate" : "unchecked"}
                                  onCheckedChange={() => {
                                    const next = new Set(selectedIds);
                                    if (grpAllSelected) grp.orders.forEach((o: any) => next.delete(o.id));
                                    else grp.orders.forEach((o: any) => next.add(o.id));
                                    setSelectedIds(next);
                                  }}
                                />
                              </TableCell>
                              <TableCell colSpan={10}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-base text-emerald-900">📍 {grp.key}</span>
                                  <Badge variant="secondary" className="text-xs">{grp.orders.length}单</Badge>
                                  {grp.totalWeight > 0 && (
                                    <Badge variant="outline" className="text-xs text-orange-700 border-orange-400 bg-orange-100 font-semibold">总{grp.totalWeight.toFixed(2)}吨</Badge>
                                  )}
                                  {grp.totalPackages > 0 && (
                                    <Badge variant="outline" className="text-xs text-purple-700 border-purple-300 bg-purple-50">共{grp.totalPackages}架</Badge>
                                  )}
                                  {grp.totalAmount > 0 && (
                                    <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">运费￥{grp.totalAmount.toFixed(0)}</Badge>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ),
                          ...grp.orders.map((order: any) => {
                          const isDragOver = dragOverOrderId === order.id;
                          const rowBg = isDragOver
                            ? "bg-blue-50 ring-2 ring-blue-300 ring-inset"
                            : selectedIds.has(order.id)
                              ? "bg-primary/5"
                              : order.isUrgent
                                ? "bg-red-50/60 border-l-4 border-l-red-500"
                                : "";
                          return (
                      <TableRow key={order.id} className={`${rowBg} transition-colors`}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dragOverOrderId !== order.id) setDragOverOrderId(order.id); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverOrderId(prev => prev === order.id ? null : prev); }}
                        onDrop={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          setDragOverOrderId(null);
                          const file = e.dataTransfer.files[0];
                          if (file && file.type.startsWith("image/")) {
                            setSelectedOrder(order);
                            setShowUploadDialog(true);
                            // Trigger file upload via the shared upload dialog
                            const dt = new DataTransfer(); dt.items.add(file);
                            setTimeout(() => {
                              if (fileInputRef.current) { fileInputRef.current.files = dt.files; fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true })); }
                            }, 100);
                          } else { toast.error("请拖入图片文件"); }
                        }}
                      >
                        <TableCell><Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} /></TableCell>
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-1">
                            {order.isUrgent && <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" title="加急"></span>}
                            {order.isUrgent && <Badge variant="destructive" className="text-[9px] h-4 px-1 leading-none">急</Badge>}
                            {order.isLargeSlab && <Badge variant="outline" className="text-[9px] px-1 py-0 border-purple-300 text-purple-600">大板</Badge>}
                            {order.orderNumber || order.systemCode}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{order.customerName || "-"}</div>
                          <div className="text-xs text-muted-foreground">{order.cargoName || "-"}</div>
                          <LtlModeBadges order={order} pickupSubchain={getPickupSubchainRecord(order)} deliverySubchain={getDeliverySubchainRecord(order)} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs">
                            {order.originCity || "?"} <ArrowRight className="h-3 w-3" /> {order.destinationCity || "?"}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{order.weight ? `${order.weight}t` : "-"}</TableCell>
                        <TableCell>
                          <div className="text-xs space-y-0.5">
                            {order.freightStationName && <div className="text-blue-600">发运货站：{order.freightStationName}</div>}
                            {order.ltlFinalStation && <div className="text-emerald-600">目的站：{order.ltlFinalStation}</div>}
                            {order.inquiryPhone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{order.inquiryPhone}</div>}
                            {!order.freightStationName && !order.ltlFinalStation && !order.inquiryPhone && <span className="text-muted-foreground">-</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {order.freightWaybillNumber ? (
                            <span className="font-mono text-blue-600">{order.freightWaybillNumber}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs space-y-0.5">
                            {order.ltlUnitPrice && <div>单价: ¥{fmtAmount(order.ltlUnitPrice)}/吨</div>}
                            {order.actualFreight && <div>运费: ¥{fmtAmount(order.actualFreight)}</div>}
                            {(order.ltlDeliveryFee || order.deliveryFee) && <div>送货: ¥{fmtAmount(order.ltlDeliveryFee || order.deliveryFee)}</div>}
                            {order.totalCost && <div className="font-medium text-blue-700">总计: ¥{fmtAmount(order.totalCost)}</div>}
                            {!order.ltlUnitPrice && !order.actualFreight && <span className="text-muted-foreground">-</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[240px] space-y-1 text-xs">
                            <LtlTimelinePreview order={order} />
                            <div className="flex flex-wrap items-center gap-1">
                              <LtlAnomalyBadge order={order} />
                            </div>
                            {order.receivingStatus && <div className="text-amber-700">收货确认：{RECEIVING_STATUS_LABELS[order.receivingStatus] || order.receivingStatus}</div>}
                            {order.receivingNote && <div className="truncate" title={order.receivingNote}>收货：{order.receivingNote}</div>}
                            {order.shippingNote && <div className="truncate text-sky-700" title={order.shippingNote}>发运：{order.shippingNote}</div>}
                            {order.dispatcherRemark && <div className="truncate text-muted-foreground" title={order.dispatcherRemark}>调度：{order.dispatcherRemark}</div>}
                            {hasLtlTag(order?.remarks, LTL_CUSTOMER_PICKUP_TAG) && <div className="text-amber-700">回单：客户自提，不生成回单</div>}
                            {order.podOwnership === "delivery_outsource" && <div className="text-amber-700">回单：已转后段外请负责，主单不再进入财务收单</div>}
                            {!order.receivingStatus && !order.receivingNote && !order.shippingNote && !order.dispatcherRemark && !hasLtlTag(order?.remarks, LTL_CUSTOMER_PICKUP_TAG) && order.podOwnership !== "delivery_outsource" && <span className="text-muted-foreground">-</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {order.isUrgent && <Badge variant="destructive" className="text-[9px] px-1 py-0">急</Badge>}
                            <Badge className={STATUS_COLORS[order.status] || "bg-gray-100 text-gray-700"} variant="secondary">
                              {STATUS_LABELS[order.status] || order.status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* 外层仅保留 2 个核心按钮：状态流转 + 查看照片 */}
                            {order.status !== "delivered" && order.status !== "signed" && (
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    if (!order.ltlFinalStation?.trim()) {
                                      toast.error("请先填写目的站点/自提送货站点，再标记已送达");
                                      return;
                                    }
                                    if (!order.receivingStatus && !order.receivingNote?.trim()) {
                                      toast.error("请先填写结构化收货确认，再标记已送达");
                                      return;
                                    }
                                    updateStatus.mutate({ id: order.id, status: "delivered" }, { onSuccess: () => { toast.success("已标记为已送达"); refetchAll(); }, onError: (err) => toast.error(err.message) });
                                  }}
                                  disabled={updateStatus.isPending}>
                                  <Truck className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent>标记已送达</TooltipContent></Tooltip>
                            )}
                            {order.status === "delivered" && (
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600 hover:bg-green-50"
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    updateStatus.mutate({ id: order.id, status: "signed" }, { onSuccess: () => { toast.success("已标记为已签收"); refetchAll(); }, onError: (err) => toast.error(err.message) });
                                  }}
                                  disabled={updateStatus.isPending}>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent>标记已签收</TooltipContent></Tooltip>
                            )}
                            {/* 查看照片（常驻）：有照片时查看，无照片时作为上传入口显性化拖拽提示 */}
                            {order.stationReceiptUrl ? (
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-purple-600 hover:bg-purple-50"
                                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); setViewImageUrl(order.stationReceiptUrl || ""); setShowViewImageDialog(true); }}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent>查看照片</TooltipContent></Tooltip>
                            ) : (
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleOpenUpload(order); }}>
                                  <Upload className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent>上传开单照片（亦可拖拽图片到本行）</TooltipContent></Tooltip>
                            )}
                            {/* 所有次级操作收纳进下拉菜单 */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                {["shipped", "in_transit"].includes(order?.status) && (
                                  <DropdownMenuItem disabled={deliverySubchainStatusLoading || Boolean(getDeliverySubchainRecord(order))} onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleCreateDeliverySubchain(order); }}>
                                    <Truck className="mr-2 h-4 w-4 text-sky-600" />
                                    {getDeliverySubchainRecord(order) ? "已转后段外请" : "后段外请车"}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem disabled={updateOrderFields.isPending} onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleToggleCustomerPickup(order, !hasLtlTag(order?.remarks, LTL_CUSTOMER_PICKUP_TAG)); }}>
                                  <Package className="mr-2 h-4 w-4 text-amber-600" />
                                  {hasLtlTag(order?.remarks, LTL_CUSTOMER_PICKUP_TAG) ? "取消客户自提标记" : "标记客户自提"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); setReceivingNoteOrder(order); }}>
                                  <Pencil className="mr-2 h-4 w-4 text-amber-600" />
                                  目的站收货确认
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleOpenUpload(order); }}>
                                  <Camera className="mr-2 h-4 w-4" />
                                  上传开单
                                </DropdownMenuItem>
                                {order.stationReceiptUrl && (
                                  <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); setViewImageUrl(order.stationReceiptUrl || ""); setShowViewImageDialog(true); }}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    查看照片
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); openManualReview(order); }}>
                                  <AlertTriangle className="mr-2 h-4 w-4 text-red-600" />
                                  异常复核
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); startEdit(order); }}>
                                  <Edit2 className="mr-2 h-4 w-4 text-green-600" />
                                  编辑信息
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={updateOrderFields.isPending} onClick={(e: React.MouseEvent) => { e.stopPropagation(); setUrgentToggleOrder(order); setUrgentReason(order.urgentReason || ""); }}>
                                  <Flame className="mr-2 h-4 w-4 text-orange-600" />
                                  {order.isUrgent ? "取消加急" : "标记加急"}
                                </DropdownMenuItem>
                                {canRollback(order.status) && hasPermission("order.rollback") && (
                                  <DropdownMenuItem disabled={rollbackMutation.isPending} onClick={(e: React.MouseEvent) => { e.stopPropagation(); openRollbackDialog(order); }}>
                                    <Undo2 className="mr-2 h-4 w-4 text-orange-600" />
                                    退回
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                          );
                        }),
                        ];
                      });
                    })()}
                  </TableBody>
                </Table>
                <TablePagination total={activeOrders.length} page={activePage} pageSize={activePageSize} onPageChange={setActivePage} onPageSizeChange={setActivePageSize} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== 已完成 Tab ===== */}
          <TabsContent value="completed">
            <Card>
              <CardContent className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
                  <div>
                    已签收零担在本页仅保留回单状态查看入口，涉及财务收单、已收回单与超期监控的动作统一跳转到回单押金台处理；若主单已转后段外请负责，则此处会明确提示责任已转移。
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 border-amber-300 bg-white/80 text-amber-900 hover:bg-amber-100" onClick={() => navigateToPodTab("pending_receipt")}>
                      <FileText className="mr-1 h-3.5 w-3.5" />前往回单押金台：待收回单
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 border-amber-300 bg-white/80 text-amber-900 hover:bg-amber-100" onClick={() => navigateToPodTab("received")}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />前往回单押金台：已收回单
                    </Button>
                  </div>
                </div>
                <div className="px-4 pt-4">
                  <SortRuleNotice
                    defaultText="签收或结算时间倒序显示"
                    currentSort={completedSort}
                    sortLabels={{ customerName: "客户", originCity: "路线", stationName: "货站", totalCost: "运费", completedAt: "签收/结算时间", status: "状态" }}
                    emptyText="当前使用系统默认排序（签收或结算时间倒序）"
                  />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>客户订单号</TableHead>
                      <SortableHeader sortKey="customerName" currentSort={completedSort} onToggle={toggleCompletedSort}>客户 · 货物</SortableHeader>
                      <SortableHeader sortKey="originCity" currentSort={completedSort} onToggle={toggleCompletedSort}>路线</SortableHeader>
                      <SortableHeader sortKey="stationName" currentSort={completedSort} onToggle={toggleCompletedSort}>货站信息</SortableHeader>
                      <TableHead>货站运单号</TableHead>
                      <SortableHeader sortKey="totalCost" currentSort={completedSort} onToggle={toggleCompletedSort}>运费明细</SortableHeader>
                      <TableHead>备注</TableHead>
                      <SortableHeader sortKey="status" currentSort={completedSort} onToggle={toggleCompletedSort}>状态</SortableHeader>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCompleted.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">暂无已完成订单</TableCell></TableRow>
                    ) : (() => {
                      const cgrpMap = new Map<string, any[]>();
                      paginatedCompleted.forEach((o: any) => {
                        const key = o.destinationCity || o.destinationProvince || "未填目的地";
                        if (!cgrpMap.has(key)) cgrpMap.set(key, []);
                        cgrpMap.get(key)!.push(o);
                      });
                      const cgrps = Array.from(cgrpMap.entries())
                        .map(([key, orders]) => ({
                          key, orders,
                          totalWeight: orders.reduce((s: number, o: any) => s + (Number(o.weight) || 0), 0),
                          totalPackages: orders.reduce((s: number, o: any) => s + (Number(o.packageCount) || 0), 0),
                          totalAmount: orders.reduce((s: number, o: any) => s + (Number(o.totalCost) || 0), 0),
                        }))
                        .sort((a, b) => b.totalWeight - a.totalWeight);
                      return cgrps.flatMap((cgrp) => [
                        (
                          <TableRow key={`cgrp-${cgrp.key}`} className="bg-amber-50 hover:bg-amber-50 border-l-4 border-l-amber-400">
                            <TableCell colSpan={9}>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-base text-amber-900">📍 {cgrp.key}</span>
                                <Badge variant="secondary" className="text-xs">{cgrp.orders.length}单</Badge>
                                {cgrp.totalWeight > 0 && (
                                  <Badge variant="outline" className="text-xs text-orange-700 border-orange-400 bg-orange-100 font-semibold">总{cgrp.totalWeight.toFixed(2)}吨</Badge>
                                )}
                                {cgrp.totalPackages > 0 && (
                                  <Badge variant="outline" className="text-xs text-purple-700 border-purple-300 bg-purple-50">共{cgrp.totalPackages}架</Badge>
                                )}
                                {cgrp.totalAmount > 0 && (
                                  <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">运费￥{cgrp.totalAmount.toFixed(0)}</Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ),
                        ...cgrp.orders.map((order: any) => (
                      <TableRow key={order.id} className={`${order.isUrgent ? "bg-red-50/60 border-l-4 border-l-red-500" : ""} transition-colors`}>
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-1">
                            {order.isUrgent && <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" title="加急"></span>}
                            {order.isUrgent && <Badge variant="destructive" className="text-[9px] h-4 px-1 leading-none">急</Badge>}
                            {order.isLargeSlab && <Badge variant="outline" className="text-[9px] px-1 py-0 border-purple-300 text-purple-600">大板</Badge>}
                            {order.orderNumber || order.systemCode}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{order.customerName || "-"}</div>
                          <div className="text-xs text-muted-foreground">{order.cargoName || "-"}</div>
                          <LtlModeBadges order={order} pickupSubchain={getPickupSubchainRecord(order)} deliverySubchain={getDeliverySubchainRecord(order)} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs">
                            {order.originCity || "?"} <ArrowRight className="h-3 w-3" /> {order.destinationCity || "?"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs space-y-0.5">
                            {order.freightStationName && <div className="text-blue-600">发运货站：{order.freightStationName}</div>}
                            {order.ltlFinalStation && <div className="text-emerald-600">目的站：{order.ltlFinalStation}</div>}
                            {order.inquiryPhone && <div>{order.inquiryPhone}</div>}
                            {!order.freightStationName && !order.ltlFinalStation && !order.inquiryPhone && <span className="text-muted-foreground">-</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {order.freightWaybillNumber ? (
                            <span className="font-mono text-blue-600">{order.freightWaybillNumber}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs space-y-0.5">
                            {order.ltlUnitPrice && <div>¥{fmtAmount(order.ltlUnitPrice)}/吨</div>}
                            {order.actualFreight && <div>运费: ¥{fmtAmount(order.actualFreight)}</div>}
                            {order.totalCost && <div className="font-medium">总计: ¥{fmtAmount(order.totalCost)}</div>}
                            {!order.totalCost && <span className="text-muted-foreground">-</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[240px] space-y-1 text-xs">
                            <LtlTimelinePreview order={order} />
                            <div className="flex flex-wrap items-center gap-1">
                              <LtlAnomalyBadge order={order} />
                            </div>
                            {order.receivingStatus && <div className="text-amber-700">收货确认：{RECEIVING_STATUS_LABELS[order.receivingStatus] || order.receivingStatus}</div>}
                            {order.receivingNote && <div className="truncate" title={order.receivingNote}>收货：{order.receivingNote}</div>}
                            {order.shippingNote && <div className="truncate text-sky-700" title={order.shippingNote}>发运：{order.shippingNote}</div>}
                            {order.dispatcherRemark && <div className="truncate text-muted-foreground" title={order.dispatcherRemark}>调度：{order.dispatcherRemark}</div>}
                            {hasLtlTag(order?.remarks, LTL_CUSTOMER_PICKUP_TAG) && <div className="text-amber-700">回单：客户自提，不生成回单</div>}
                            {order.podOwnership === "delivery_outsource" && <div className="text-amber-700">回单：已转后段外请负责，主单不再进入财务收单</div>}
                            {!order.receivingStatus && !order.receivingNote && !order.shippingNote && !order.dispatcherRemark && !hasLtlTag(order?.remarks, LTL_CUSTOMER_PICKUP_TAG) && order.podOwnership !== "delivery_outsource" && <span className="text-muted-foreground">-</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[order.status] || "bg-gray-100 text-gray-700"} variant="secondary">
                            {STATUS_LABELS[order.status] || order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* 外层仅保留 2 个核心按钮：前往回单台 + 查看照片 */}
                            <Tooltip><TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-7 w-7 p-0 ${hasLtlTag(order?.remarks, LTL_CUSTOMER_PICKUP_TAG) ? "text-slate-400 hover:bg-slate-50" : order.podOwnership === "delivery_outsource" ? "text-amber-600 hover:bg-amber-50" : "text-sky-600 hover:bg-sky-50"}`}
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  if (hasLtlTag(order?.remarks, LTL_CUSTOMER_PICKUP_TAG)) {
                                    toast.info("该零担主单已标记客户自提，不生成回单");
                                    return;
                                  }
                                  if (order.podOwnership === "delivery_outsource") {
                                    toast.info("该零担主单的回单已转由后段外请负责，请到对应外请责任单跟踪回单");
                                    return;
                                  }
                                  navigateToPodTab(order.status === "settled" ? "received" : "pending_receipt", order.orderNumber || order.systemCode);
                                }}>
                                <FileText className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger><TooltipContent>{hasLtlTag(order?.remarks, LTL_CUSTOMER_PICKUP_TAG) ? "客户自提不生成回单" : order.podOwnership === "delivery_outsource" ? "回单已转后段外请负责" : order.status === "settled" ? "前往回单押金台查看已收回单" : "前往回单押金台查看待收回单"}</TooltipContent></Tooltip>
                            {order.stationReceiptUrl && (
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-purple-600 hover:bg-purple-50"
                                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); setViewImageUrl(order.stationReceiptUrl || ""); setShowViewImageDialog(true); }}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent>查看照片</TooltipContent></Tooltip>
                            )}
                            {/* 所有次级操作收纳进下拉菜单 */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); openManualReview(order); }}>
                                  <AlertTriangle className="mr-2 h-4 w-4 text-red-600" />
                                  异常复核
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); setReceivingNoteOrder(order); }}>
                                  <Pencil className="mr-2 h-4 w-4 text-amber-600" />
                                  查看收货确认
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); startEdit(order); }}>
                                  <Edit2 className="mr-2 h-4 w-4 text-green-600" />
                                  编辑信息
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={updateOrderFields.isPending} onClick={(e: React.MouseEvent) => { e.stopPropagation(); setUrgentToggleOrder(order); setUrgentReason(order.urgentReason || ""); }}>
                                  <Flame className="mr-2 h-4 w-4 text-orange-600" />
                                  {order.isUrgent ? "取消加急" : "标记加急"}
                                </DropdownMenuItem>
                                {canRollback(order.status) && hasPermission("order.rollback") && (
                                  <DropdownMenuItem disabled={rollbackMutation.isPending} onClick={(e: React.MouseEvent) => { e.stopPropagation(); openRollbackDialog(order); }}>
                                    <Undo2 className="mr-2 h-4 w-4 text-orange-600" />
                                    退回
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                        )),
                      ]);
                    })()}
                  </TableBody>
                </Table>
                <TablePagination total={completedOrders.length} page={completedPage} pageSize={completedPageSize} onPageChange={setCompletedPage} onPageSizeChange={setCompletedPageSize} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== 零担台账 Tab ===== */}
          <TabsContent value="ledger">
            <div className="space-y-3">
              {ledgerSummary && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-blue-600">零担订单</div>
                    <div className="text-xl font-bold text-blue-700">{ledgerSummary.count}</div>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-amber-600">异常单</div>
                    <div className="text-xl font-bold text-amber-700">{ledgerSummary.exceptionCount}</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-green-600">总运费</div>
                    <div className="text-xl font-bold text-green-700">¥{ledgerSummary.totalFreight.toFixed(0)}</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-purple-600">总送货费</div>
                    <div className="text-xl font-bold text-purple-700">¥{ledgerSummary.totalDeliveryFee.toFixed(0)}</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-red-600">总费用</div>
                    <div className="text-xl font-bold text-red-700">¥{ledgerSummary.totalCost.toFixed(0)}</div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
                <div>
                  零担台账已按零担业务单独聚合，可结合当前筛选条件跳转到回单押金台查看待收回单、已收回单与超期监控，支撑月底统一对账。
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8 border-cyan-300 bg-white/80 text-cyan-900 hover:bg-cyan-100" onClick={() => navigateToPodTab("pending_receipt")}>
                    <FileText className="mr-1 h-3.5 w-3.5" />前往回单押金台：待收回单
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 border-cyan-300 bg-white/80 text-cyan-900 hover:bg-cyan-100" onClick={() => navigateToPodTab("received")}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />前往回单押金台：已收回单
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 border-cyan-300 bg-white/80 text-cyan-900 hover:bg-cyan-100" onClick={() => navigateToPodTab("overdue_monitor")}>
                    <AlertTriangle className="mr-1 h-3.5 w-3.5" />前往回单押金台：超期监控
                  </Button>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border bg-background px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="max-w-3xl text-sm text-muted-foreground">
                    异常单会依据节点时效、到站后未签收、等通知超时、暂不收货等规则自动判定，并以红色异常或橙色关注显示；如需人工确认，可点击订单行“异常复核”补录责任归属与复盘备注。
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {LEDGER_GROUP_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        size="sm"
                        variant={ledgerGroupBy === option.value ? "default" : "outline"}
                        className="h-8"
                        onClick={() => setLedgerGroupBy(option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant={ledgerExceptionOnly ? "default" : "outline"}
                      className="h-8"
                      onClick={() => { setLedgerExceptionOnly((prev) => !prev); setLedgerPage(1); }}
                    >
                      {ledgerExceptionOnly ? "查看全部订单" : "仅看异常单"}
                    </Button>
                  </div>
                </div>
                {monthlySummary.length > 0 ? (
                  <div className="overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead>月份</TableHead>
                          <TableHead>{LEDGER_GROUP_OPTIONS.find((item) => item.value === ledgerGroupBy)?.label || "维度"}</TableHead>
                          <TableHead className="text-right">订单数</TableHead>
                          <TableHead className="text-right">已签收</TableHead>
                          <TableHead className="text-right text-amber-700">异常单</TableHead>
                          <TableHead className="text-right">运费</TableHead>
                          <TableHead className="text-right">总费用</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthlySummary.slice(0, 8).map((row) => (
                          <TableRow key={`${row.month}-${row.groupValue}`}>
                            <TableCell>{row.month}</TableCell>
                            <TableCell>{row.groupValue}</TableCell>
                            <TableCell className="text-right">{row.orderCount}</TableCell>
                            <TableCell className="text-right">{row.signedCount}</TableCell>
                            <TableCell className="text-right text-amber-700">{row.exceptionCount}</TableCell>
                            <TableCell className="text-right">¥{formatMoney(row.totalFreight)}</TableCell>
                            <TableCell className="text-right">¥{formatMoney(row.totalCost)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                    当前筛选条件下暂无可汇总的月度台账数据。
                  </div>
                )}
              </div>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="w-8">#</TableHead>
                          <TableHead className="w-28">客户订单号</TableHead>
                          <SortableHeader sortKey="customerName" currentSort={ledgerSort} onToggle={toggleLedgerSort}>客户</SortableHeader>
                          <TableHead>货物</TableHead>
                          <SortableHeader sortKey="weight" currentSort={ledgerSort} onToggle={toggleLedgerSort} className="w-14 text-right">重量</SortableHeader>
                          <SortableHeader sortKey="route" currentSort={ledgerSort} onToggle={toggleLedgerSort}>路线</SortableHeader>
                          <TableHead>货站名称</TableHead>
                          <TableHead>货站运单号</TableHead>
                          <TableHead>查货电话</TableHead>
                          <TableHead className="w-16 text-right">单价</TableHead>
                          <SortableHeader sortKey="actualFreight" currentSort={ledgerSort} onToggle={toggleLedgerSort} className="w-16 text-right">运费</SortableHeader>
                          <TableHead className="w-16 text-right">送货费</TableHead>
                          <SortableHeader sortKey="totalCost" currentSort={ledgerSort} onToggle={toggleLedgerSort} className="w-16 text-right">总费用</SortableHeader>
                          <TableHead className="w-16">车牌号</TableHead>
                          <TableHead className="w-10">大板</TableHead>
                          <TableHead>备注</TableHead>
                          <TableHead className="w-10">加急</TableHead>
                          <SortableHeader sortKey="status" currentSort={ledgerSort} onToggle={toggleLedgerSort} className="w-16 text-center">状态</SortableHeader>
                          <SortableHeader sortKey="createdAt" currentSort={ledgerSort} onToggle={toggleLedgerSort} className="w-20">日期</SortableHeader>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledgerLoading ? (
                          <TableRow><TableCell colSpan={19} className="text-center py-12 text-muted-foreground">加载中...</TableCell></TableRow>
                        ) : !paginatedLedger?.length ? (
                          <TableRow><TableCell colSpan={19} className="text-center py-12 text-muted-foreground">暂无数据</TableCell></TableRow>
                        ) : (
                          paginatedLedger.map((item: any, idx: number) => (
                            <TableRow key={item.id} className={`hover:bg-muted/30 ${item.isUrgent ? "bg-red-50" : ""}`}>
                              <TableCell className="text-xs text-muted-foreground">{(ledgerPage - 1) * ledgerPageSize + idx + 1}</TableCell>
                              <TableCell className="font-mono text-xs">{item.orderNumber || item.systemCode}</TableCell>
                              <TableCell className="text-sm truncate max-w-[100px]">{item.customerName}</TableCell>
                              <TableCell className="text-sm truncate max-w-[80px]">{item.cargoName || "-"}</TableCell>
                              <TableCell className="text-right text-sm">{item.weight ? `${item.weight}t` : "-"}</TableCell>
                              <TableCell className="text-xs">{item.originCity} → {item.destinationCity}</TableCell>
                              <TableCell className="text-xs text-blue-600">{item.freightStationName || "-"}</TableCell>
                              <TableCell className="text-xs font-mono">{item.freightWaybillNumber || "-"}</TableCell>
                              <TableCell className="text-xs">{item.inquiryPhone || "-"}</TableCell>
                              <TableCell className="text-right text-xs">{item.ltlUnitPrice ? `¥${fmtAmount(item.ltlUnitPrice)}` : "-"}</TableCell>
                              <TableCell className="text-right text-xs">{item.actualFreight ? `¥${fmtAmount(item.actualFreight)}` : "-"}</TableCell>
                              <TableCell className="text-right text-xs">{(item.ltlDeliveryFee || item.deliveryFee) ? `¥${fmtAmount(item.ltlDeliveryFee || item.deliveryFee)}` : "-"}</TableCell>
                              <TableCell className="text-right text-xs font-medium">{item.totalCost ? `¥${fmtAmount(item.totalCost)}` : "-"}</TableCell>
                              <TableCell className="text-xs">{item.plateNumber || "-"}</TableCell>
                              <TableCell className="text-xs text-center">{item.isLargeSlab ? <Badge variant="outline" className="text-[9px] px-1 py-0 border-purple-300 text-purple-600">大板</Badge> : "-"}</TableCell>
                              <TableCell className="text-xs max-w-[100px] truncate" title={item.dispatcherRemark || ""}>{item.dispatcherRemark || <span className="text-muted-foreground">-</span>}</TableCell>
                              <TableCell className="text-center">
                                {item.isUrgent ? <Badge variant="destructive" className="text-[9px] px-1 py-0">加急</Badge> : <span className="text-muted-foreground">-</span>}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[item.status] || item.status}</Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {fmtDate(item.orderDate)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    <TablePagination total={(ledgerData ?? []).length} page={ledgerPage} pageSize={ledgerPageSize} onPageChange={setLedgerPage} onPageSizeChange={setLedgerPageSize} pageSizeOptions={[50, 100, 200, 500, 1000]} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* 查看照片弹窗 */}
      <Dialog open={showViewImageDialog} onOpenChange={setShowViewImageDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              货站开单照片
            </DialogTitle>
          </DialogHeader>
          {viewImageUrl && (
            <div className="flex justify-center">
              <img src={viewImageUrl} alt="货站开单" className="max-h-[70vh] object-contain rounded-lg border" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowViewImageDialog(false)}>关闭</Button>
            {viewImageUrl && <Button onClick={() => window.open(viewImageUrl, "_blank")}><Eye className="h-4 w-4 mr-1" />新窗口打开</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 询价弹窗 */}
      <Dialog open={showInquiryDialog} onOpenChange={setShowInquiryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              零担询价
              {selectedOrder?.isUrgent && <Badge variant="destructive" className="text-[10px]">加急</Badge>}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-medium">{selectedOrder.orderNumber || selectedOrder.systemCode}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline">零担</Badge>
                    {selectedOrder.isLargeSlab && <Badge className="bg-purple-100 text-purple-700 border-purple-300">大板</Badge>}
                  </div>
                </div>
                {selectedOrder.mergedPlanNumber && (
                    <div className="text-blue-600 text-xs">内部整理参考批次：{selectedOrder.mergedPlanNumber}（非正式外请组）</div>
                )}
                <div className="text-muted-foreground">
                  {selectedOrder.customerName}{selectedOrder.customerPhone ? ` (${selectedOrder.customerPhone})` : ""} · {selectedOrder.cargoName || "货物"} · {selectedOrder.weight ? `${selectedOrder.weight}吨` : "-"}
                </div>
                {selectedOrder.cargoSpec && <div className="text-xs text-muted-foreground">规格：{selectedOrder.cargoSpec}</div>}
                {selectedOrder.specialRequirements && <div className="text-xs text-orange-600">特殊要求：{selectedOrder.specialRequirements}</div>}
                {selectedOrder.orderDate && <div className="text-xs text-muted-foreground">下单时间：{fmtDate(selectedOrder.orderDate)}</div>}
                {selectedOrder.settlementType && <div className="text-xs text-muted-foreground">结算方式：{selectedOrder.settlementType === 'monthly' ? '月结' : selectedOrder.settlementType === 'cash' ? '现付' : '到付'}</div>}
              </div>

              {selectedOrder.isLargeSlab && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5 text-sm space-y-1">
                  <div className="flex items-center gap-1.5 text-purple-700 font-medium text-xs">大板信息</div>
                  <div className="flex gap-4 text-xs">
                    {selectedOrder.chargeableWeight && <span>计费重量：<span className="font-medium">{selectedOrder.chargeableWeight}吨</span></span>}
                    {selectedOrder.packageCount && <span>架数：<span className="font-medium">{selectedOrder.packageCount}架</span></span>}
                  </div>
                </div>
              )}

              <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                <div>
                  <span className="text-muted-foreground">发货地：</span>
                  <span>{selectedOrder.originCity}{selectedOrder.warehouseName ? ` · ${selectedOrder.warehouseName}` : ""}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">卸货地：</span>
                  <span>{selectedOrder.destinationCity}</span>
                  {selectedOrder.deliveryAddress && <div className="text-xs text-muted-foreground ml-12">{selectedOrder.deliveryAddress}</div>}
                </div>
                <div>
                  <span className="text-muted-foreground">收货人：</span>
                  <span>{selectedOrder.receiverName || "-"} {selectedOrder.receiverPhone ? `(${selectedOrder.receiverPhone})` : ""}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-wrap text-sm">
                {selectedOrder.customerPrice && <span>客户报价：<span className="font-bold text-green-600">{formatMoney(selectedOrder.customerPrice)}</span></span>}
                {selectedOrder.dispatchPrice && <span>调度价：<span className="font-bold text-orange-600">{formatMoney(selectedOrder.dispatchPrice)}</span></span>}
              </div>

              {selectedOrder.remarks && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2">
                  <span className="text-xs font-medium text-amber-700">订单备注：</span>
                  <span className="text-sm text-amber-800 ml-1">{selectedOrder.remarks}</span>
                </div>
              )}

              {selectedOrder.isUrgent && selectedOrder.urgentReason && (
                <div className="bg-red-50 border border-red-200 rounded p-2">
                  <span className="text-xs font-medium text-red-700">加急原因：</span>
                  <span className="text-sm text-red-800 ml-1">{selectedOrder.urgentReason}</span>
                </div>
              )}

              <div className="border-t pt-3 space-y-3">
                <div>
                  <Label>货站名称 *</Label>
                  <StationAutocomplete
                    value={inquiryForm.stationName}
                    onChange={(v) => setInquiryForm(f => ({ ...f, stationName: v }))}
                    onSelect={(s) => setInquiryForm(f => ({ ...f, stationName: s.name, stationPhone: s.phone || f.stationPhone }))}
                  />
                </div>
                <div>
                  <Label>查货电话</Label>
                  <Input placeholder="货站查货电话" value={inquiryForm.stationPhone} onChange={(e) => setInquiryForm(f => ({ ...f, stationPhone: e.target.value }))} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>单价（元/吨）*</Label>
                    <Input type="number" placeholder="如 420" value={inquiryForm.unitPrice} onChange={(e) => setInquiryForm(f => ({ ...f, unitPrice: e.target.value }))} />
                  </div>
                  <div>
                    <Label>送货费（元）</Label>
                    <Input type="number" placeholder="如 150" value={inquiryForm.deliveryFee} onChange={(e) => setInquiryForm(f => ({ ...f, deliveryFee: e.target.value }))} />
                  </div>
                  <div>
                    <Label>其他费（元）</Label>
                    <Input type="number" placeholder="如 0" value={inquiryForm.otherFee} onChange={(e) => setInquiryForm(f => ({ ...f, otherFee: e.target.value }))} />
                  </div>
                </div>
                {inquiryForm.unitPrice && selectedOrder?.weight && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                    <div className="text-xs font-medium text-blue-700">自动计算：</div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">运费 = </span>
                      <span className="font-medium">{inquiryForm.unitPrice}元/吨 × {selectedOrder.weight}吨 = </span>
                      <span className="font-bold text-blue-600">¥{calcFreight(inquiryForm.unitPrice, parseFloat(String(selectedOrder.weight)))}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">总价 = </span>
                      <span className="font-medium">运费 + 送货费¥{inquiryForm.deliveryFee || 0} + 其他费¥{inquiryForm.otherFee || 0} = </span>
                      <span className="font-bold text-green-600">¥{calcTotal(inquiryForm.unitPrice, inquiryForm.deliveryFee, inquiryForm.otherFee, parseFloat(String(selectedOrder.weight)))}</span>
                    </div>
                  </div>
                )}
                <div>
                  <Label>备注</Label>
                  <Textarea placeholder="其他备注信息..." value={inquiryForm.remark} onChange={(e) => setInquiryForm(f => ({ ...f, remark: e.target.value }))} rows={2} />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowInquiryDialog(false)}>取消</Button>
                <Button
                  onClick={groupInquiryOrders.length > 0 ? handleConfirmGroupInquiry : handleConfirmInquiry}
                  disabled={updateStatus.isPending}
                >
                  {updateStatus.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {updateStatus.isPending
                    ? (groupInquiryOrders.length > 0 ? `提交中(${groupInquiryProgress}/${groupInquiryOrders.length})...` : "提交中...")
                    : (groupInquiryOrders.length > 0 ? `按整理批次询价（${groupInquiryOrders.length}单）` : "确认询价")
                  }
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 上传货站开单弹窗 */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              上传货站开单
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div className="font-medium">{selectedOrder.orderNumber || selectedOrder.systemCode}</div>
                <div className="text-muted-foreground">
                  {selectedOrder.customerName} · {selectedOrder.originCity} → {selectedOrder.destinationCity}
                </div>
              </div>
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center transition-colors hover:border-primary/50 cursor-pointer"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add("border-primary", "bg-primary/5"); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove("border-primary", "bg-primary/5"); }}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  e.currentTarget.classList.remove("border-primary", "bg-primary/5");
                  const file = e.dataTransfer.files[0];
                  if (file && file.type.startsWith("image/")) {
                    const dt = new DataTransfer(); dt.items.add(file);
                    if (fileInputRef.current) { fileInputRef.current.files = dt.files; fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true })); }
                  } else { toast.error("请拖入图片文件"); }
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-1">拖拽图片到此处，或点击选择文件</p>
                <p className="text-xs text-muted-foreground">支持货站开单图片（如德坤物流电子托运单）</p>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
              </div>
              {(ocrReceipt.isPending || ocrIsProcessing) && (
                <div className="text-center space-y-2">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                  <div className="text-sm text-muted-foreground">上传并识别中，请稍候...</div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* OCR识别结果确认弹窗（询价发运台用） */}
      <Dialog open={showOcrConfirmDialog} onOpenChange={(open) => { if (!open) resetOcrState(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              货站运单号确认
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div className="font-medium">{selectedOrder.orderNumber || selectedOrder.systemCode}</div>
                <div className="text-muted-foreground">{selectedOrder.customerName} · {selectedOrder.originCity} → {selectedOrder.destinationCity}</div>
              </div>
              {ocrUploadedUrl && (
                <div className="border rounded-lg overflow-hidden">
                  <img src={ocrUploadedUrl} alt="货站开单" className="w-full max-h-48 object-contain bg-gray-50" />
                </div>
              )}
              {ocrResult && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5">
                  <div className="text-xs font-medium text-blue-700 flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> AI识别结果</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {ocrResult.stationName && <div><span className="text-muted-foreground">货站：</span>{ocrResult.stationName}</div>}
                    {ocrResult.waybillNumber && <div><span className="text-muted-foreground">运单号：</span><span className="font-mono font-medium">{ocrResult.waybillNumber}</span></div>}
                    {ocrResult.inquiryPhone && <div><span className="text-muted-foreground">电话：</span>{ocrResult.inquiryPhone}</div>}
                    {ocrResult.freightAmount && <div><span className="text-muted-foreground">运费：</span>¥{ocrResult.freightAmount}</div>}
                    {ocrResult.weight && <div><span className="text-muted-foreground">重量：</span>{ocrResult.weight}</div>}
                  </div>
                </div>
              )}

              {/* 运费校准区域 */}
              <div className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium flex items-center gap-1.5">运费校准</div>
                  <Button size="sm" variant={ocrEnableFreightAdjust ? "default" : "outline"} className="h-7 text-xs"
                    onClick={() => {
                      const next = !ocrEnableFreightAdjust;
                      setOcrEnableFreightAdjust(next);
                      if (next && selectedOrder) {
                        if (!ocrActualWeight && selectedOrder.weight) setOcrActualWeight(selectedOrder.weight);
                        if (!ocrAdjustDeliveryFee && selectedOrder.ltlDeliveryFee) setOcrAdjustDeliveryFee(String(selectedOrder.ltlDeliveryFee));
                        if (!ocrAdjustOtherFee && selectedOrder.ltlOtherFee) setOcrAdjustOtherFee(String(selectedOrder.ltlOtherFee));
                      }
                    }}>
                    {ocrEnableFreightAdjust ? "已开启校准" : "开启运费校准"}
                  </Button>
                </div>
                <div className="bg-muted/50 rounded p-2 text-xs grid grid-cols-4 gap-2">
                  <div><span className="text-muted-foreground">询价单价：</span><span className="font-medium">{selectedOrder.ltlUnitPrice ? `${selectedOrder.ltlUnitPrice}元/吨` : "-"}</span></div>
                  <div><span className="text-muted-foreground">重量：</span><span className="font-medium">{selectedOrder.weight ? `${selectedOrder.weight}吨` : "-"}</span></div>
                  <div><span className="text-muted-foreground">送货费：</span><span className="font-medium">{selectedOrder.ltlDeliveryFee && parseFloat(String(selectedOrder.ltlDeliveryFee)) > 0 ? `¥${selectedOrder.ltlDeliveryFee}` : "-"}</span></div>
                  <div><span className="text-muted-foreground">总运费：</span><span className="font-medium text-orange-600">{selectedOrder.dispatchPrice ? `¥${Number(selectedOrder.dispatchPrice).toFixed(0)}` : "-"}</span></div>
                </div>
                {ocrEnableFreightAdjust && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs font-medium text-red-600">货站开单总运费（元）*</Label>
                        <Input type="number" step="0.01" value={ocrActualFreight} onChange={(e) => setOcrActualFreight(e.target.value)} placeholder="货站开单的总运费金额" className="h-8 text-sm border-red-200 focus:border-red-400" />
                      </div>
                      <div>
                        <Label className="text-xs">实际重量（吨）</Label>
                        <Input type="number" step="0.001" value={ocrActualWeight} onChange={(e) => setOcrActualWeight(e.target.value)} placeholder="货站实称重量" className="h-8 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">其中送货费（元）</Label>
                        <Input type="number" step="0.01" value={ocrAdjustDeliveryFee} onChange={(e) => setOcrAdjustDeliveryFee(e.target.value)} placeholder="0" className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">其中其他费（元）</Label>
                        <Input type="number" step="0.01" value={ocrAdjustOtherFee} onChange={(e) => setOcrAdjustOtherFee(e.target.value)} placeholder="0" className="h-8 text-sm" />
                      </div>
                    </div>
                    {ocrActualFreight && (
                      <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-700 space-y-1">
                        {(() => {
                          const total = parseFloat(ocrActualFreight) || 0;
                          const df = parseFloat(ocrAdjustDeliveryFee) || 0;
                          const of2 = parseFloat(ocrAdjustOtherFee) || 0;
                          const pure = Math.max(total - df - of2, 0);
                          const w = parseFloat(ocrActualWeight) || 0;
                          const unitP = w > 0 ? (pure / w) : 0;
                          return (
                            <>
                              <div>总运费 ¥{total.toFixed(0)} = 纯运费 ¥{pure.toFixed(0)}{df > 0 ? ` + 送货费 ¥${df}` : ""}{of2 > 0 ? ` + 其他费 ¥${of2}` : ""}</div>
                              {w > 0 && <div>反算单价：¥{pure.toFixed(0)} ÷ {w}吨 = <span className="font-bold">{unitP.toFixed(4)}元/吨</span></div>}
                            </>
                          );
                        })()}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">填写货站开单的总运费，系统自动拆分为单价、送货费、其他费</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">货站运单号</Label>
                  {ocrResult?.waybillNumber && <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-200">AI识别</Badge>}
                </div>
                <Input value={ocrWaybillNumber} onChange={(e) => setOcrWaybillNumber(e.target.value)} placeholder="请确认或输入货站运单号" className="font-mono" />
                {selectedOrder.freightWaybillNumber && ocrWaybillNumber && ocrWaybillNumber !== selectedOrder.freightWaybillNumber && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    该订单已有运单号「{selectedOrder.freightWaybillNumber}」，确认后将替换为新号
                  </div>
                )}
                <p className="text-xs text-muted-foreground">请仔细核对运单号是否正确，确认后将保存到订单中</p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={resetOcrState}>取消</Button>
                <Button onClick={handleOcrConfirm} disabled={updateOrderFields.isPending}>
                  {updateOrderFields.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {updateOrderFields.isPending ? "保存中..." : "确认保存"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 编辑运单号弹窗 */}
      <Dialog open={showEditWaybillDialog} onOpenChange={(open) => { if (!open) { setShowEditWaybillDialog(false); setEditWaybillOrder(null); setEditWaybillNumber(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              编辑货站运单号
            </DialogTitle>
          </DialogHeader>
          {editWaybillOrder && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div className="font-medium">{editWaybillOrder.orderNumber || editWaybillOrder.systemCode}</div>
                <div className="text-muted-foreground">{editWaybillOrder.customerName} · {editWaybillOrder.originCity} → {editWaybillOrder.destinationCity}</div>
              </div>
              <div>
                <Label>货站运单号</Label>
                <Input value={editWaybillNumber} onChange={(e) => setEditWaybillNumber(e.target.value)} placeholder="输入货站运单号" className="font-mono" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowEditWaybillDialog(false); setEditWaybillOrder(null); setEditWaybillNumber(""); }}>取消</Button>
                <Button onClick={handleSaveWaybillNumber} disabled={updateOrderFields.isPending}>
                  {updateOrderFields.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {updateOrderFields.isPending ? "保存中..." : "保存"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>



      {/* 编辑货站信息弹窗 */}
      <Dialog open={!!editOrder} onOpenChange={(open) => { if (!open) { setEditOrder(null); setEditFields({}); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-primary" />
              编辑订单信息
            </DialogTitle>
          </DialogHeader>
          {editOrder && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div className="font-medium">{editOrder.orderNumber || editOrder.systemCode}</div>
                <div className="text-muted-foreground">{editOrder.customerName} · {editOrder.originCity} → {editOrder.destinationCity}</div>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>货站名称</Label>
                    <Input value={editFields.freightStationName || ""} onChange={(e) => setEditFields((f: any) => ({ ...f, freightStationName: e.target.value }))} placeholder="发运货站名称" />
                  </div>
                  <div>
                    <Label>目的站点 / 自提站点</Label>
                    <Input value={editFields.ltlFinalStation || ""} onChange={(e) => setEditFields((f: any) => ({ ...f, ltlFinalStation: e.target.value }))} placeholder="例如：临沂西郊货站、自提后再送工地" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>货站运单号</Label>
                    <Input value={editFields.freightWaybillNumber || ""} onChange={(e) => setEditFields((f: any) => ({ ...f, freightWaybillNumber: e.target.value }))} placeholder="货站运单号" className="font-mono" />
                  </div>
                  <div>
                    <Label>查货电话</Label>
                    <Input value={editFields.inquiryPhone || ""} onChange={(e) => setEditFields((f: any) => ({ ...f, inquiryPhone: e.target.value }))} placeholder="查货电话" />
                  </div>
                </div>
                <div>
                  <Label>发运备注</Label>
                  <Textarea value={editFields.shippingNote || ""} onChange={(e) => setEditFields((f: any) => ({ ...f, shippingNote: e.target.value }))} placeholder="例如：外请车先提货，再带派车单到货站发运；到站后由收货人自提或联系送货" rows={2} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>单价（元/吨）</Label>
                    <Input type="number" value={editFields.ltlUnitPrice || ""} onChange={(e) => setEditFields((f: any) => ({ ...f, ltlUnitPrice: e.target.value }))} placeholder="单价" />
                  </div>
                  <div>
                    <Label>送货费（元）</Label>
                    <Input type="number" value={editFields.ltlDeliveryFee || ""} onChange={(e) => setEditFields((f: any) => ({ ...f, ltlDeliveryFee: e.target.value }))} placeholder="送货费" />
                  </div>
                  <div>
                    <Label>其他费（元）</Label>
                    <Input type="number" value={editFields.ltlOtherFee || ""} onChange={(e) => setEditFields((f: any) => ({ ...f, ltlOtherFee: e.target.value }))} placeholder="其他费" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">后段目的站点自提、预约卸货、等通知等信息，请点击列表中的“目的站收货确认”继续填写结构化收货确认。</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setEditOrder(null); setEditFields({}); }}>取消</Button>
                <Button onClick={saveEdit} disabled={updateFieldsMutation.isPending}>
                  {updateFieldsMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />保存中...</> : "保存"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReceivingNoteDialog
        order={receivingNoteOrder}
        open={!!receivingNoteOrder}
        onClose={() => setReceivingNoteOrder(null)}
        onSaved={() => {
          setReceivingNoteOrder(null);
          refetchAll();
        }}
      />

      <Dialog open={!!reviewOrder} onOpenChange={(open) => { if (!open) { setReviewOrder(null); setReviewForm({ level: "橙色关注", reason: "", owner: "", note: "" }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              异常单复核
            </DialogTitle>
            <DialogDescription>
              记录异常等级、责任归属和复盘备注后，后续在零担台账中可直接按异常单筛选并用于月底复盘。
            </DialogDescription>
          </DialogHeader>
          {reviewOrder && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <div className="font-medium">{reviewOrder.orderNumber || reviewOrder.systemCode}</div>
                <div className="text-muted-foreground">{reviewOrder.customerName} · {reviewOrder.originCity} → {reviewOrder.destinationCity}</div>
                <div className="mt-2"><LtlAnomalyBadge order={reviewOrder} /></div>
              </div>
              <div className="space-y-2">
                <Label>异常等级</Label>
                <div className="flex flex-wrap gap-2">
                  {ANOMALY_LEVEL_OPTIONS.map((option) => (
                    <Button key={option} type="button" size="sm" variant={reviewForm.level === option ? "default" : "outline"} onClick={() => setReviewForm((prev) => ({ ...prev, level: option }))}>
                      {option}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label>异常原因 / 复核结论</Label>
                <Textarea value={reviewForm.reason} onChange={(e) => setReviewForm((prev) => ({ ...prev, reason: e.target.value }))} placeholder="例如：到站后48小时未签收，客户临时延期自提" rows={3} />
              </div>
              <div>
                <Label>责任归属</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {RESPONSIBILITY_OPTIONS.map((option) => (
                    <Button key={option} type="button" size="sm" variant={reviewForm.owner === option ? "default" : "outline"} onClick={() => setReviewForm((prev) => ({ ...prev, owner: option }))}>
                      {option}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label>复盘备注</Label>
                <Textarea value={reviewForm.note} onChange={(e) => setReviewForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="补充处理经过、整改建议或后续跟进动作" rows={3} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setReviewOrder(null); setReviewForm({ level: "橙色关注", reason: "", owner: "", note: "" }); }}>取消</Button>
                <Button onClick={handleSaveReview} disabled={updateOrderFields.isPending}>
                  {updateOrderFields.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {updateOrderFields.isPending ? "保存中..." : "保存复核"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 加急切换弹窗 */}
      <Dialog open={!!urgentToggleOrder} onOpenChange={(open) => { if (!open) { setUrgentToggleOrder(null); setUrgentReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flame className={`h-5 w-5 ${urgentToggleOrder?.isUrgent ? "text-muted-foreground" : "text-red-500"}`} />
              {urgentToggleOrder?.isUrgent ? "取消加急" : "标记加急"}
            </DialogTitle>
          </DialogHeader>
          {urgentToggleOrder && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div className="font-medium">{urgentToggleOrder.orderNumber || urgentToggleOrder.systemCode}</div>
                <div className="text-muted-foreground">{urgentToggleOrder.customerName} · {urgentToggleOrder.originCity} → {urgentToggleOrder.destinationCity}</div>
                {urgentToggleOrder.isUrgent && urgentToggleOrder.urgentReason && (
                  <div className="mt-1 text-xs text-red-600">当前加急原因：{urgentToggleOrder.urgentReason}</div>
                )}
              </div>
              {!urgentToggleOrder.isUrgent && (
                <div>
                  <Label>加急原因（可选）</Label>
                  <Textarea value={urgentReason} onChange={(e) => setUrgentReason(e.target.value)} placeholder="如：客户催货、时效紧急..." rows={2} />
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => { setUrgentToggleOrder(null); setUrgentReason(""); }}>取消</Button>
                <Button
                  variant={urgentToggleOrder.isUrgent ? "outline" : "destructive"}
                  onClick={handleToggleUrgent}
                  disabled={updateOrderFields.isPending}
                >
                  {updateOrderFields.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {urgentToggleOrder.isUrgent ? "确认取消加急" : "确认标记加急"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 退回确认弹窗 */}
      <AlertDialog open={!!rollbackOrder} onOpenChange={(open) => { if (!open) { setRollbackOrder(null); setRollbackReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-orange-500" />
              退回订单确认
            </AlertDialogTitle>
            <AlertDialogDescription>
              {rollbackOrder && (
                <span>
                  确定要将订单 <span className="font-mono font-medium">{rollbackOrder.orderNumber || rollbackOrder.systemCode}</span> 从
                  「{STATUS_LABELS[rollbackOrder.status] || rollbackOrder.status}」退回到上一步吗？
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>回退原因分类</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {ROLLBACK_CATEGORY_OPTIONS.map((option) => (
                  <Button key={option} type="button" size="sm" variant={rollbackCategory === option ? "default" : "outline"} onClick={() => setRollbackCategory(option)}>
                    {option}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>责任归属</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {RESPONSIBILITY_OPTIONS.map((option) => (
                  <Button key={option} type="button" size="sm" variant={rollbackOwner === option ? "default" : "outline"} onClick={() => setRollbackOwner(option)}>
                    {option}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>补充说明</Label>
              <Textarea value={rollbackReason} onChange={(e) => setRollbackReason(e.target.value)} placeholder="可补充无法联系、改约时间、责任说明等细节" rows={2} />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-600 hover:bg-orange-700"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmRollback();
              }}
              disabled={revertStatusMutation.isPending || updateOrderFields.isPending}
            >
              {revertStatusMutation.isPending || updateOrderFields.isPending ? "退回中..." : "确认退回"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量退回弹窗 */}
      <AlertDialog open={batchRollbackOpen} onOpenChange={(open) => { if (!open) { setBatchRollbackOpen(false); setBatchRollbackReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-orange-500" />
              批量退回确认
            </AlertDialogTitle>
            <AlertDialogDescription>
              确定要将选中的 {selectedIds.size} 个订单退回到上一步吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label>退回原因（可选）</Label>
            <Textarea value={batchRollbackReason} onChange={(e) => setBatchRollbackReason(e.target.value)} placeholder="请输入退回原因..." rows={2} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-600 hover:bg-orange-700"
              onClick={() => {
                batchRollbackMutation.mutate({ ids: Array.from(selectedIds), reason: batchRollbackReason.trim() || "" });
              }}
              disabled={batchRollbackMutation.isPending}
            >
              {batchRollbackMutation.isPending ? "退回中..." : `确认退回 ${selectedIds.size} 个`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除确认弹窗 */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              确认删除
            </AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销，确定要删除该订单吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteTargetId) deleteMutation.mutate({ id: deleteTargetId });
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
// build-$(date +%s)
