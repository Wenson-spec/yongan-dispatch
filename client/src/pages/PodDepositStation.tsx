import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";

import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText, Search, RefreshCw, ArrowRight,
  CheckCircle2, Clock, AlertTriangle, Trash2, Undo2, Bell,
  Info, ShieldAlert, Siren, Download, MoreHorizontal,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useState, useMemo, useCallback, useEffect } from "react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PodProgressBadge, ReceivedProgressBadge } from "@/components/PodProgressBadge";
import { TablePagination } from "@/components/TablePagination";
import { parsePodDepositQuery } from "./ltlWorkflow.utils";
import { useLocation } from "wouter";
import { getMergedChildDeleteLockReason, getMergedChildRollbackLockReason } from "@/lib/commandGroupRules";

type PodDepositTab = "overdue_monitor" | "pending_receipt" | "pending_dispatch_refund" | "received" | "self_monthly_unreceived";

export default function PodDepositStation() {
  const { hasPermission } = usePermissions();
  const [location] = useLocation();
  const routePreset = useMemo(
    () => parsePodDepositQuery(typeof window !== "undefined" ? window.location.search : ""),
    [location],
  );
  const [search, setSearch] = useState(routePreset.keyword || "");
  const [activeTab, setActiveTab] = useState<PodDepositTab>(
    (((routePreset.tab as string | undefined) || "overdue_monitor") as PodDepositTab),
  );
  const [overdueFilter, setOverdueFilter] = useState<"all" | "yellow" | "orange" | "red">("all");
  const [selfMonthlySelectedMonth, setSelfMonthlySelectedMonth] = useState(routePreset.month || "");


  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [rollbackTargetId, setRollbackTargetId] = useState<number | null>(null);
  const [rollbackReason, setRollbackReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchRollbackOpen, setBatchRollbackOpen] = useState(false);
  const [batchRollbackReason, setBatchRollbackReason] = useState("");
  const [batchReceiveConfirmOpen, setBatchReceiveConfirmOpen] = useState(false);
  // 筛选状态
  const [dateFrom, setDateFrom] = useState(routePreset.dateFrom || "");
  const [dateTo, setDateTo] = useState(routePreset.dateTo || "");
  const [podStatusFilter, setPodStatusFilter] = useState<string>("all");

  const [businessTypeFilter, setBusinessTypeFilter] = useState<string>(routePreset.businessType || "all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // 分页状态
  const [pendingPodPage, setPendingPodPage] = useState(1);
  const [pendingPodPageSize, setPendingPodPageSize] = useState(100);
  const [receivedPodPage, setReceivedPodPage] = useState(1);
  const [receivedPodPageSize, setReceivedPodPageSize] = useState(100);
  const [overduePodPage, setOverduePodPage] = useState(1);
  const [overduePodPageSize, setOverduePodPageSize] = useState(100);
  const [selfMonthlyPage, setSelfMonthlyPage] = useState(1);
  const [selfMonthlyPageSize, setSelfMonthlyPageSize] = useState(100);

  useEffect(() => {
    if (routePreset.tab) {
      setActiveTab(routePreset.tab as PodDepositTab);
    }
    if (routePreset.businessType) setBusinessTypeFilter(routePreset.businessType);
    if (routePreset.keyword !== undefined) setSearch(routePreset.keyword);
    if (routePreset.dateFrom !== undefined) setDateFrom(routePreset.dateFrom);
    if (routePreset.dateTo !== undefined) setDateTo(routePreset.dateTo);
    if (routePreset.month !== undefined) setSelfMonthlySelectedMonth(routePreset.month);
  }, [routePreset]);

  useEffect(() => {
    if (activeTab === "self_monthly_unreceived" && businessTypeFilter !== "self") {
      setBusinessTypeFilter("self");
    }
  }, [activeTab, businessTypeFilter]);

  const isSelfBusiness = (businessType?: string | null) => businessType === "self" || businessType === "self_owned";

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      return next;
    });
  };

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
  const openRollbackDialog = useCallback((order: any, orderId?: number | null) => {
    const lockReason = getRollbackLockReason(order);
    if (lockReason) {
      toast.error(lockReason);
      return;
    }
    const resolvedId = orderId ?? order?.orderId ?? order?.id;
    if (!resolvedId) return;
    setRollbackTargetId(resolvedId);
    setRollbackReason("");
  }, [getRollbackLockReason]);

  const updatePodStatus = trpc.pod.updateStatus.useMutation();
  const checkOverdueMut = trpc.pod.checkOverdueAndNotify.useMutation();
  const rollbackMutation = trpc.order.rollbackStatus.useMutation({
    onSuccess: (res) => {
      refetchAll();
      toast.success(`订单已退回：${res.fromLabel} → ${res.toLabel}`);
      setRollbackTargetId(null);
      setRollbackReason("");
    },
    onError: (err: any) => toast.error(err.message),
  });
  const batchMarkReceivedMutation = trpc.pod.batchMarkReceived.useMutation({
    onSuccess: (res) => {
      refetchAll();
      const msg = res.skipCount > 0 ? `成功标记 ${res.successCount} 个已收到，${res.skipCount} 个跳过` : `成功标记 ${res.successCount} 个回单为已收到`;
      toast.success(msg);
      setSelectedIds(new Set());
      setBatchReceiveConfirmOpen(false);
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
  const deleteMutation = trpc.order.delete.useMutation({
    onSuccess: () => {
      refetchAll();
      toast.success("订单已删除");
      setDeleteTargetId(null);
    },
    onError: (err) => toast.error(err.message),
  });
  const utils = trpc.useUtils();

  // 稳定搜索参数，避免无限循环
  // 改动3: pageSize:1000 确保获取全量数据（待收回单数据源从orders表查询）
  const podSearchParams = useMemo(() => ({
    keyword: search || undefined,
    pageSize: 1000,
  }), [search]);

  // 回单列表（支持搜索）
  const { data: podData, isLoading: podLoading, refetch: refetchPod } = trpc.pod.list.useQuery(
    podSearchParams,
    { refetchInterval: 10000 }
  );

  // 超期回单分级统计
  const { data: overdueStats, refetch: refetchOverdue } = trpc.pod.overdueStats.useQuery(
    undefined,
    { refetchInterval: 15000 }
  );

  // 超期回单分级数据
  const overdueData = useMemo(() => {
    if (!overdueStats) return { yellow: 0, orange: 0, red: 0, total: 0, items: [] as any[] };
    const items = overdueStats.items || [];
    const yellow = items.filter((i: any) => i.level === "yellow").length;
    const orange = items.filter((i: any) => i.level === "orange").length;
    const red = items.filter((i: any) => i.level === "red").length;
    return { yellow, orange, red, total: yellow + orange + red, items };
  }, [overdueStats]);

  const selfMonthlyQueryInput = useMemo(() => ({
    month: selfMonthlySelectedMonth || undefined,
  }), [selfMonthlySelectedMonth]);

  const { data: selfMonthlyStats, refetch: refetchSelfMonthlyStats } = trpc.pod.selfMonthlyUnreceivedStats.useQuery(
    selfMonthlyQueryInput,
    { refetchInterval: 15000 },
  );

  // 按筛选等级过滤的超期回单
  const filteredOverdueItems = useMemo(() => {
    if (!overdueData.items.length) return [];
    let items = overdueData.items;
    if (overdueFilter !== "all") items = items.filter((i: any) => i.level === overdueFilter);
    if (businessTypeFilter !== "all") items = items.filter((i: any) => i.businessType === businessTypeFilter);
    return items;
  }, [overdueData.items, overdueFilter, businessTypeFilter]);

  // 日期筛选过滤函数
  const filterByDate = useCallback((items: any[], dateField: string = "createdAt") => {
    if (!dateFrom && !dateTo) return items;
    return items.filter((item: any) => {
      const rawDate = item[dateField] || item.createdAt;
      if (!rawDate) return false;
      const d = new Date(rawDate);
      if (Number.isNaN(d.getTime())) return false;
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo) { const end = new Date(dateTo); end.setHours(23, 59, 59, 999); if (d > end) return false; }
      return true;
    });
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!selfMonthlySelectedMonth && selfMonthlyStats?.selectedMonth) {
      setSelfMonthlySelectedMonth(selfMonthlyStats.selectedMonth);
    }
  }, [selfMonthlySelectedMonth, selfMonthlyStats?.selectedMonth]);

  const selfMonthlySummary = useMemo(() => selfMonthlyStats?.summary ?? {
    month: selfMonthlyStats?.selectedMonth || selfMonthlySelectedMonth || "",
    signedTotalCount: 0,
    receivedCount: 0,
    unreceivedCount: 0,
    pendingCount: 0,
    sentCount: 0,
    lostCount: 0,
    overdueCount: 0,
    yellowCount: 0,
    orangeCount: 0,
    redCount: 0,
    vehicleCount: 0,
    customerCount: 0,
    oldestSignedDate: null,
  }, [selfMonthlySelectedMonth, selfMonthlyStats]);

  const getPendingPodOverdueMeta = useCallback((pod: any) => {
    const order = pod.order;
    const selfOwned = order?.businessType === "self" || order?.businessType === "self_owned";
    const baseValue = selfOwned ? order?.signedDate : pod.createdAt;
    const baseDate = baseValue ? new Date(baseValue) : null;
    if (!baseDate || Number.isNaN(baseDate.getTime())) {
      return {
        days: 0,
        level: null as "yellow" | "orange" | "red" | null,
        basisLabel: selfOwned ? "签收后" : "创建后",
        basisDateText: "-",
      };
    }
    const days = Math.max(0, Math.floor((Date.now() - baseDate.getTime()) / 86400000));
    const level = selfOwned
      ? (days >= 15 ? "red" : days >= 7 ? "orange" : days >= 3 ? "yellow" : null)
      : (days >= 15 ? "red" : days >= 5 ? "orange" : "yellow");
    return {
      days,
      level,
      basisLabel: selfOwned ? "签收后" : "创建后",
      basisDateText: baseDate.toLocaleDateString("zh-CN"),
    };
  }, []);

  const filteredSelfMonthlyItems = useMemo(() => {
    let items = filterByDate(selfMonthlyStats?.items ?? [], "signedDate");
    const keyword = search.trim().toLowerCase();
    if (keyword) {
      items = items.filter((item: any) => [
        item.orderNumber,
        item.systemCode,
        item.customerName,
        item.plateNumber,
        item.driverName,
      ].some((value) => String(value || "").toLowerCase().includes(keyword)));
    }
    if (overdueFilter !== "all") {
      items = items.filter((item: any) => item.level === overdueFilter);
    }
    return items;
  }, [filterByDate, overdueFilter, search, selfMonthlyStats?.items]);

  // CSV导出函数
  const exportCSV = useCallback((headers: string[], rows: string[][], filename: string) => {
    const BOM = "\uFEFF";
    const csv = BOM + [headers.join(","), ...rows.map(r => r.map(c => `"${String(c || "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${rows.length} 条记录`);
  }, []);

  // Excel导出函数（纯XML方式生成.xlsx兼容格式，带汇总行）
  const exportExcel = useCallback((headers: string[], rows: string[][], filename: string, summaryItems?: { label: string; value: string }[]) => {
    const escXml = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<?mso-application progid="Excel.Sheet"?>\n';
    xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
    xml += '<Styles>';
    xml += '<Style ss:ID="header"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#E2EFDA" ss:Pattern="Solid"/></Style>';
    xml += '<Style ss:ID="summary"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/></Style>';
    xml += '</Styles>\n';
    xml += '<Worksheet ss:Name="Sheet1"><Table>\n';
    // 表头
    xml += '<Row>';
    headers.forEach(h => { xml += `<Cell ss:StyleID="header"><Data ss:Type="String">${escXml(h)}</Data></Cell>`; });
    xml += '</Row>\n';
    // 数据行
    rows.forEach(row => {
      xml += '<Row>';
      row.forEach(cell => {
        const isNum = /^-?\d+(\.\d+)?$/.test(String(cell || "").trim());
        xml += `<Cell><Data ss:Type="${isNum ? "Number" : "String"}">${escXml(cell)}</Data></Cell>`;
      });
      xml += '</Row>\n';
    });
    // 汇总行
    xml += '<Row>';
    xml += `<Cell ss:StyleID="summary"><Data ss:Type="String">汇总（共${rows.length}条）</Data></Cell>`;
    for (let i = 1; i < headers.length; i++) xml += '<Cell ss:StyleID="summary"><Data ss:Type="String"></Data></Cell>';
    xml += '</Row>\n';
    // 详细汇总信息
    if (summaryItems && summaryItems.length > 0) {
      summaryItems.forEach(item => {
        xml += '<Row>';
        xml += `<Cell ss:StyleID="summary"><Data ss:Type="String">${escXml(item.label)}</Data></Cell>`;
        xml += `<Cell ss:StyleID="summary"><Data ss:Type="String">${escXml(item.value)}</Data></Cell>`;
        for (let i = 2; i < headers.length; i++) xml += '<Cell><Data ss:Type="String"></Data></Cell>';
        xml += '</Row>\n';
      });
    }
    xml += '</Table></Worksheet></Workbook>';
    const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename.replace(/\.csv$/, ".xls"); a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出Excel ${rows.length} 条记录`);
  }, []);

  const exportPendingPods = () => {
    const headers = ["订单号", "客户名", "发货地", "目的地", "车牌号", "司机", "回单状态", "寄出时间", "超时基准", "超时天数"];
    const rows = filteredPendingPods.map((pod: any) => {
      const o = pod.order;
      const overdueMeta = getPendingPodOverdueMeta(pod);
      return [
        o?.orderNumber || o?.systemCode || `#${pod.orderId}`,
        o?.customerName || "",
        o?.originCity || "",
        o?.destinationCity || "",
        o?.plateNumber || "",
        o?.driverName || "",
        pod.originalStatus === "sent" ? "已寄出" : (isSelfBusiness(o?.businessType) ? "待上交" : "待回收"),
        pod.originalSentAt ? new Date(pod.originalSentAt).toLocaleDateString("zh-CN") : "",
        `${overdueMeta.basisLabel}${overdueMeta.basisDateText}`,
        String(overdueMeta.days),
      ];
    });
    exportCSV(headers, rows, `待收回单_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportReceivedPods = () => {
    const headers = ["订单号", "客户名", "发货地", "目的地", "车牌号", "司机", "收到时间"];
    const rows = filteredReceivedPods.map((pod: any) => {
      const o = pod.order;
      return [o?.orderNumber || o?.systemCode || `#${pod.orderId}`, o?.customerName || "", o?.originCity || "", o?.destinationCity || "", o?.plateNumber || "", o?.driverName || "", pod.originalReceivedAt ? new Date(pod.originalReceivedAt).toLocaleDateString("zh-CN") : ""];
    });
    exportCSV(headers, rows, `已收回单_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportOverdueItems = () => {
    const headers = ["订单号", "客户名", "发货地", "目的地", "超期等级", "超期天数", "调度员", "车牌号", "司机"];
    const rows = filteredOverdueItems.map((i: any) => [i.orderNumber || i.systemCode || `#${i.orderId}`, i.customerName || "", i.originCity || "", i.destinationCity || "", i.level === "red" ? "紧急" : i.level === "orange" ? "警告" : "预警", String(i.overdueDays), i.dispatcherName || "", i.plateNumber || "", i.driverName || ""]);
    exportCSV(headers, rows, `超期回单_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportSelfMonthlyItems = () => {
    const headers = ["统计月份", "订单号", "客户名", "发货地", "目的地", "车牌号", "司机", "签收日期", "未收状态", "预警等级", "超时基准", "超时天数"];
    const rows = filteredSelfMonthlyItems.map((item: any) => [
      selfMonthlySummary.month || selfMonthlyStats?.selectedMonth || "-",
      item.orderNumber || item.systemCode || `#${item.orderId}`,
      item.customerName || "",
      item.originCity || "",
      item.destinationCity || "",
      item.plateNumber || "",
      item.driverName || "",
      item.signedDate ? new Date(item.signedDate).toLocaleDateString("zh-CN") : "",
      item.originalStatus === "sent" ? "已寄出" : item.originalStatus === "lost" ? "已遗失" : "待上交",
      item.level === "red" ? "紧急" : item.level === "orange" ? "警告" : item.level === "yellow" ? "预警" : "正常",
      item.overdueBaseAt ? new Date(item.overdueBaseAt).toLocaleDateString("zh-CN") : "",
      String(item.overdueDays ?? 0),
    ]);
    exportCSV(headers, rows, `自运月度未收统计_${selfMonthlySummary.month || new Date().toISOString().slice(0, 7)}.csv`);
  };

  const allPodItems = podData?.items ?? [];
  const pendingPods = allPodItems.filter((p: any) => p.originalStatus === "pending" || p.originalStatus === "sent");

  // 分组函数：优先按正式外请分组展示，未形成正式分组时回退按同车次结果展示
  const groupPods = useCallback((pods: any[]) => {
    const groups: Map<string, any[]> = new Map();
    for (const pod of pods) {
      const o = pod.order;
      let key = `single_${pod.id}`; // 默认单独一组
      const visibleDispatchGroup =
        o?.dispatchRecordLabel ||
        o?.dispatchGroupLabel ||
        o?.dispatchRecordNumber ||
        o?.dispatchRecordCode ||
        null;
      if (visibleDispatchGroup) {
        key = `dispatch_${visibleDispatchGroup}`;
      } else if (o?.plateNumber && o?.dispatchDate) {
        const dateStr = new Date(o.dispatchDate).toISOString().slice(0, 10);
        key = `plate_${o.plateNumber}_${dateStr}`;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(pod);
    }
    return Array.from(groups.entries()).map(([key, items]) => {
      const primaryOrder = items[0]?.order;
      const visibleDispatchGroup =
        primaryOrder?.dispatchRecordLabel ||
        primaryOrder?.dispatchGroupLabel ||
        primaryOrder?.dispatchRecordNumber ||
        primaryOrder?.dispatchRecordCode ||
        null;
      const vehicleTripLabel = [primaryOrder?.plateNumber, primaryOrder?.driverName].filter(Boolean).join(" / ") || "待补车次信息";
      const referenceBatch = primaryOrder?.mergedPlanNumber && visibleDispatchGroup !== primaryOrder?.mergedPlanNumber
        ? `参考批次：${primaryOrder?.mergedPlanNumber} · `
        : "";
      return {
        key,
        items,
        isMerged: items.length > 1,
        plateNumber: items[0]?.order?.plateNumber || "-",
        driverName: items[0]?.order?.driverName || "-",
        dispatchDate: items[0]?.order?.dispatchDate,
        totalDeposit: items.reduce((sum: number, p: any) => sum + parseFloat(p.order?.depositAmount || "0"), 0),
        totalFreight: items.reduce((sum: number, p: any) => sum + parseFloat(p.order?.actualFreight || "0"), 0),
        customerNames: Array.from(new Set(items.map((p: any) => p.order?.customerName).filter(Boolean))).join("、"),
        routes: Array.from(new Set(items.map((p: any) => `${p.order?.originCity || "?"}→${p.order?.destinationCity || "?"}`))).join("、"),
        businessType: items[0]?.order?.businessType || "outsource",
        visibleDispatchGroup,
        groupHeadline: visibleDispatchGroup ? `正式外请分组：${visibleDispatchGroup}` : `回退车次：${vehicleTripLabel}`,
        pendingGroupSubline: visibleDispatchGroup
          ? `${referenceBatch}待收回单与回单进度优先按正式外请分组汇总。`
          : `当前未形成正式外请分组，待收回单暂按同车次展示：${vehicleTripLabel}`,
        receivedGroupSubline: visibleDispatchGroup
          ? `${referenceBatch}财务确认收到与回单归档优先按正式外请分组处理。`
          : `当前未形成正式外请分组，财务确认与归档暂按同车次处理：${vehicleTripLabel}`,
      };
    });

  }, []);

  // 筛选后的待收回单
  const filteredPendingPods = useMemo(() => {
    let items = pendingPods;
    items = filterByDate(items);
    if (podStatusFilter !== "all") items = items.filter((p: any) => p.originalStatus === podStatusFilter);
    if (businessTypeFilter !== "all") items = items.filter((p: any) => p.order?.businessType === businessTypeFilter);
    return items;
  }, [pendingPods, filterByDate, podStatusFilter, businessTypeFilter]);
  const receivedPods = allPodItems.filter((p: any) => p.originalStatus === "received");

  // 筛选后的已收回单
  const filteredReceivedPods = useMemo(() => {
    let items = filterByDate(receivedPods);
    if (businessTypeFilter !== "all") items = items.filter((p: any) => p.order?.businessType === businessTypeFilter);
    return items;
  }, [receivedPods, filterByDate, businessTypeFilter]);

  // 分组后的待收回单
  const groupedPendingPods = useMemo(() => groupPods(filteredPendingPods), [filteredPendingPods, groupPods]);
  // 分组后的已收回单
  const groupedReceivedPods = useMemo(() => groupPods(filteredReceivedPods), [filteredReceivedPods, groupPods]);
  const selectedPendingPodIds = useMemo(
    () => filteredPendingPods.filter((p: any) => selectedIds.has(p.orderId)).map((p: any) => p.id),
    [filteredPendingPods, selectedIds],
  );
  const selectedReceivedOrderIds = useMemo(
    () => filteredReceivedPods.filter((p: any) => selectedIds.has(p.orderId)).map((p: any) => p.orderId),
    [filteredReceivedPods, selectedIds],
  );
  const selectedRollbackCount = activeTab === "received" ? selectedReceivedOrderIds.length : selectedIds.size;
  // 查询各合并组的回单寄出进度
  const podMpns = useMemo(() => {
    const mpns = new Set<string>();
    for (const g of groupedPendingPods) {
      const mpn = g.items[0]?.order?.mergedPlanNumber;
      if (mpn) mpns.add(mpn);
    }
    for (const g of groupedReceivedPods) {
      const mpn = g.items[0]?.order?.mergedPlanNumber;
      if (mpn) mpns.add(mpn);
    }
    return Array.from(mpns);
  }, [groupedPendingPods, groupedReceivedPods]);
  const { data: podProgressMap } = trpc.pod.checkGroupsReceived.useQuery(
    { mergedPlanNumbers: podMpns },
    { enabled: podMpns.length > 0, refetchInterval: 15000 }
  );

  const handleCheckOverdue = async () => {
    try {
      const res = await checkOverdueMut.mutateAsync();
      if (res.notified > 0) {
        const parts = [];
        if (res.red > 0) parts.push(`🔴紧急${res.red}个`);
        if (res.orange > 0) parts.push(`🟠警告${res.orange}个`);
        if (res.yellow > 0) parts.push(`🟡预警${res.yellow}个`);
        toast.success(`分级通知已发送：${parts.join("、")}，共推送${res.notified}条`);
      } else {
        toast.info("当前没有需要推送的超期回单通知");
      }
    } catch (e: any) {
      toast.error(e.message || "通知发送失败");
    }
  };

  const refetchAll = () => {
    refetchPod();
    refetchOverdue();
    refetchSelfMonthlyStats();
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* 顶部标题 */}
        <div className="flex items-center justify-between">
          <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                财务回单确认台
              </h1>

            <p className="text-sm text-muted-foreground mt-0.5">
              回单原件跟踪 → 确认收回 → 寄出状态维护 → 超期监控
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 改动7: 右上角三个按钮（批量确认收到、更多流程操作、超期通知）已删除，只保留刷新 */}
            <Button variant="outline" size="sm" onClick={refetchAll}>
              <RefreshCw className="h-4 w-4 mr-1" />
              刷新
            </Button>
          </div>
        </div>

        {businessTypeFilter === "ltl" && (
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
            当前已切换为<strong className="mx-1">零担业务</strong>视图，仅展示当前负责回单流转的责任单；若零担主单已转后段外请负责，则请在对应外请责任单下继续处理待收回单、已收回单与超期监控。
          </div>
        )}
        {businessTypeFilter === "self" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            当前已切换为<strong className="mx-1">自运业务</strong>视图：司机送货签收后会先从自运派车台流转到这里，显示为“待上交”；财务在本页点击“确认收到”后，即完成“回单收到”标记。若需按签收月份查看未收汇总与超时预警，可切换到“自运月度未收统计”页签。
          </div>
        )}

        {/* 超期回单醒目预警横幅 */}
        {overdueData.total > 0 && (
          <div
            className="rounded-lg border-2 border-red-400 bg-gradient-to-r from-red-50 via-orange-50 to-yellow-50 p-3 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setActiveTab("overdue_monitor")}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-red-100 animate-pulse">
                  <Siren className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <div className="font-semibold text-red-800 text-sm">超期回单警报：共 {overdueData.total} 单未回收</div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {overdueData.red > 0 && <span className="text-xs text-red-600 font-medium">🔴 紧急 {overdueData.red} 单</span>}
                    {overdueData.orange > 0 && <span className="text-xs text-orange-600 font-medium">🟠 警告 {overdueData.orange} 单</span>}
                    {overdueData.yellow > 0 && <span className="text-xs text-yellow-600 font-medium">🟡 预警 {overdueData.yellow} 单</span>}
                  </div>
                </div>
              </div>
              <Button size="sm" variant="destructive" className="text-xs" onClick={(e) => { e.stopPropagation(); setActiveTab("overdue_monitor"); }}>
                立即查看
              </Button>
            </div>
          </div>
        )}

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100">
                <Clock className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">待收回单</div>
                <div className="text-lg font-bold text-orange-700">{pendingPods.length}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">已收回单</div>
                <div className="text-lg font-bold text-green-700">{receivedPods.length}</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50/30">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <Siren className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">超期回单</div>
                <div className="text-lg font-bold text-red-700">{overdueData.total} 单</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 搜索和筛选栏 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索订单号、客户名、车牌号、司机名、P开头合并订单号..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={businessTypeFilter} onValueChange={setBusinessTypeFilter}>
            <SelectTrigger className="h-9 w-[100px] text-xs">
              <SelectValue placeholder="业务类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="outsource">外请</SelectItem>
              <SelectItem value="self">自运</SelectItem>
              <SelectItem value="ltl">零担</SelectItem>
            </SelectContent>
          </Select>
          {activeTab === "self_monthly_unreceived" && (
            <Select
              value={selfMonthlySelectedMonth || selfMonthlyStats?.selectedMonth || selfMonthlyStats?.currentMonth || ""}
              onValueChange={setSelfMonthlySelectedMonth}
            >
              <SelectTrigger className="h-9 w-[140px] text-xs">
                <SelectValue placeholder="统计月份" />
              </SelectTrigger>
              <SelectContent>
                {((selfMonthlyStats?.months?.length ?? 0) > 0
                  ? selfMonthlyStats?.months
                  : [{ month: selfMonthlyStats?.currentMonth || new Date().toISOString().slice(0, 7) }]
                )?.map((item: any) => (
                  <SelectItem key={item.month} value={item.month}>{item.month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(activeTab === "pending_receipt" || activeTab === "received") && (
            <Select value={podStatusFilter} onValueChange={setPodStatusFilter}>
              <SelectTrigger className="h-9 w-[100px] text-xs">
                <SelectValue placeholder="回单状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="pending">待回收</SelectItem>
                <SelectItem value="sent">已寄出</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-1">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-[130px] text-xs" />
            <span className="text-xs text-muted-foreground">至</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-[130px] text-xs" />
          </div>
          {(dateFrom || dateTo || podStatusFilter !== "all" || businessTypeFilter !== "all") && (
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setDateFrom(""); setDateTo(""); setPodStatusFilter("all"); setBusinessTypeFilter("all"); }}>
              清除筛选
            </Button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-9" onClick={() => {
              if (activeTab === "pending_receipt") exportPendingPods();
              else if (activeTab === "received") exportReceivedPods();
              else if (activeTab === "self_monthly_unreceived") exportSelfMonthlyItems();
              else if (activeTab === "overdue_monitor") exportOverdueItems();
            }}>
              <Download className="h-4 w-4 mr-1" />
              导出CSV
            </Button>
            <Button variant="default" size="sm" className="h-9 bg-green-600 hover:bg-green-700" onClick={() => {
              const getHeadersAndRows = () => {
                if (activeTab === "pending_receipt") {
                  const headers = ["订单号", "客户名", "发货地", "目的地", "车牌号", "司机", "回单状态", "寄出时间", "超时基准", "超时天数"];
                  const rows = filteredPendingPods.map((pod: any) => {
                    const o = pod.order;
                    const overdueMeta = getPendingPodOverdueMeta(pod);
                    return [o?.orderNumber || o?.systemCode || `#${pod.orderId}`, o?.customerName || "", o?.originCity || "", o?.destinationCity || "", o?.plateNumber || "", o?.driverName || "", pod.originalStatus === "sent" ? "已寄出" : (isSelfBusiness(o?.businessType) ? "待上交" : "待回收"), pod.originalSentAt ? new Date(pod.originalSentAt).toLocaleDateString("zh-CN") : "", `${overdueMeta.basisLabel}${overdueMeta.basisDateText}`, String(overdueMeta.days)];
                  });
                  return { headers, rows, name: "待收回单" };
                } else if (activeTab === "received") {
                  const headers = ["订单号", "客户名", "发货地", "目的地", "车牌号", "司机", "收到时间"];
                  const rows = filteredReceivedPods.map((pod: any) => {
                    const o = pod.order;
                    return [o?.orderNumber || o?.systemCode || `#${pod.orderId}`, o?.customerName || "", o?.originCity || "", o?.destinationCity || "", o?.plateNumber || "", o?.driverName || "", pod.originalReceivedAt ? new Date(pod.originalReceivedAt).toLocaleDateString("zh-CN") : ""];
                  });
                  return { headers, rows, name: "已收回单" };
                } else if (activeTab === "self_monthly_unreceived") {
                  const headers = ["统计月份", "订单号", "客户名", "发货地", "目的地", "车牌号", "司机", "签收日期", "未收状态", "预警等级", "超时基准", "超时天数"];
                  const rows = filteredSelfMonthlyItems.map((item: any) => [selfMonthlySummary.month || selfMonthlyStats?.selectedMonth || "-", item.orderNumber || item.systemCode || `#${item.orderId}`, item.customerName || "", item.originCity || "", item.destinationCity || "", item.plateNumber || "", item.driverName || "", item.signedDate ? new Date(item.signedDate).toLocaleDateString("zh-CN") : "", item.originalStatus === "sent" ? "已寄出" : item.originalStatus === "lost" ? "已遗失" : "待上交", item.level === "red" ? "紧急" : item.level === "orange" ? "警告" : item.level === "yellow" ? "预警" : "正常", item.overdueBaseAt ? new Date(item.overdueBaseAt).toLocaleDateString("zh-CN") : "", String(item.overdueDays ?? 0)]);
                  return { headers, rows, name: `自运月度未收统计_${selfMonthlySummary.month || selfMonthlyStats?.selectedMonth || ""}` };
                } else if (activeTab === "pending_dispatch_refund") {
                  const headers = ["工作台", "说明"];
                  const rows = [["待调度退押金", "退押金请回找车台“回单处理”页签继续办理；财务回单确认台仅负责确认收到与回单状态维护。"]];
                  return { headers, rows, name: "待调度退押金说明" };
                } else {
                  const headers = ["订单号", "客户名", "发货地", "目的地", "超期等级", "超期天数", "调度员", "车牌号", "司机"];
                  const rows = filteredOverdueItems.map((i: any) => [i.orderNumber || i.systemCode || `#${i.orderId}`, i.customerName || "", i.originCity || "", i.destinationCity || "", i.level === "red" ? "紧急" : i.level === "orange" ? "警告" : "预警", String(i.overdueDays), i.dispatcherName || "", i.plateNumber || "", i.driverName || ""]);
                  return { headers, rows, name: "超期回单" };
                }
              };
              const { headers, rows, name } = getHeadersAndRows();
              // 根据Tab生成汇总信息
              let summaryItems: { label: string; value: string }[] = [];
              if (activeTab === "pending_receipt") {
                const sentCount = filteredPendingPods.filter((p: any) => p.originalStatus === "sent").length;
                const pendingCount = filteredPendingPods.filter((p: any) => p.originalStatus === "pending").length;
                summaryItems = [
                  { label: "订单总数", value: String(rows.length) },
                  { label: "已寄出", value: String(sentCount) },
                  { label: "待回收", value: String(pendingCount) },
                ];
              } else if (activeTab === "received") {
                summaryItems = [{ label: "已收回单总数", value: String(rows.length) }];
              } else if (activeTab === "self_monthly_unreceived") {
                summaryItems = [
                  { label: "统计月份", value: selfMonthlySummary.month || selfMonthlyStats?.selectedMonth || "-" },
                  { label: "签收总数", value: String(selfMonthlySummary.signedTotalCount) },
                  { label: "未收回单", value: String(selfMonthlySummary.unreceivedCount) },
                  { label: "超时预警", value: String(selfMonthlySummary.overdueCount) },
                  { label: "紧急（红色）", value: String(selfMonthlySummary.redCount) },
                ];
              } else if (activeTab === "pending_dispatch_refund") {
                summaryItems = [
                  { label: "工作台说明", value: "财务回单确认台只读提示" },
                ];
              } else if (activeTab === "overdue_monitor") {
                const redCount = filteredOverdueItems.filter((i: any) => i.level === "red").length;
                const orangeCount = filteredOverdueItems.filter((i: any) => i.level === "orange").length;
                const yellowCount = filteredOverdueItems.filter((i: any) => i.level === "yellow").length;
                summaryItems = [
                  { label: "超期回单总数", value: String(rows.length) },
                  { label: "紧急（红色）", value: String(redCount) },
                  { label: "警告（橙色）", value: String(orangeCount) },
                  { label: "预警（黄色）", value: String(yellowCount) },
                ];
              }
              exportExcel(headers, rows, `${name}_${new Date().toISOString().slice(0, 10)}.xls`, summaryItems);
            }}>
              <Download className="h-4 w-4 mr-1" />
              导出Excel
            </Button>
          </div>
        </div>

        {/* Tab切换 */}
        <Tabs value={activeTab} onValueChange={(value) => {
          const nextTab = value as PodDepositTab;
          setActiveTab(nextTab);
          if (nextTab === "self_monthly_unreceived") {
            setBusinessTypeFilter("self");
            if (!selfMonthlySelectedMonth && selfMonthlyStats?.selectedMonth) {
              setSelfMonthlySelectedMonth(selfMonthlyStats.selectedMonth);
            }
          }
        }}>
          <TabsList>
            <TabsTrigger value="overdue_monitor">
              <Siren className="h-4 w-4 mr-1 text-red-500" />
              超期回单监控 {overdueData.total > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px] animate-pulse">{overdueData.total}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="pending_receipt">
              待收回单 {pendingPods.length > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">{pendingPods.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="pending_dispatch_refund">
              待调度退押金
            </TabsTrigger>
            <TabsTrigger value="self_monthly_unreceived">
              自运月度未收统计 {selfMonthlySummary.unreceivedCount > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] bg-amber-100 text-amber-700">{selfMonthlySummary.unreceivedCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="received">
              已收回单 {receivedPods.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{receivedPods.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* 待收回单 - 改动1:卡片简洁两行风格 改动2:右上角业务类型标签 改动4:确认收到/撤销 改动5:子单逐个确认后自动合并 改动6:P开头合并搜索 改动8:字体间距放大 */}
          <TabsContent value="pending_receipt">
            {(() => {
              try {
                const _biz = businessTypeFilter;
                let _items: any[] = Array.isArray(pendingPods) ? pendingPods.slice() : [];
                if (_biz !== "all") _items = _items.filter((it: any) => (it.order?.businessType) === _biz);
                // 改动6: 支持P开头合并订单号搜索 - 按mergedPlanNumber分组
                const _groupMap = new Map<string, any>();
                const _groupList: any[] = [];
                for (const _it of _items) {
                  const _mpn = _it.order?.mergedPlanNumber;
                  const _key = _mpn || ("__single_" + _it.id);
                  if (_mpn && _groupMap.has(_key)) {
                    const _g = _groupMap.get(_key)!;
                    _g._children.push(_it);
                    _g._totalWeight += parseFloat(String(_it.order?.weight || "0")) || 0;
                    _g._totalDeposit += parseFloat(String(_it.order?.depositAmount || "0")) || 0;
                  } else {
                    const _base = { ..._it,
                      _children: [_it],
                      _totalWeight: parseFloat(String(_it.order?.weight || "0")) || 0,
                      _totalDeposit: parseFloat(String(_it.order?.depositAmount || "0")) || 0,
                      _mergedPlanNumber: _mpn || null,
                      _groupKey: _key,
                    };
                    _groupMap.set(_key, _base);
                    _groupList.push(_base);
                  }
                }
                // 改动6: 关键词搜索（支持P开头合并订单号）
                const _kw = String(search || "").trim().toLowerCase();
                const _kws = _kw ? _kw.split(/[\s,，;；\n\r]+/).map((s: string) => s.trim()).filter(Boolean) : [];
                const _filtered = _kws.length === 0 ? _groupList : _groupList.filter((it: any) => {
                  const _allChildren: any[] = it._children || [it];
                  const _hay = [
                    it._mergedPlanNumber,
                    ..._allChildren.flatMap((__c: any) => [
                      __c.orderNumber, __c.systemCode,
                      __c.order?.orderNumber, __c.order?.systemCode, __c.order?.mergedPlanNumber,
                      __c.order?.customerName, __c.order?.plateNumber, __c.order?.driverName,
                      __c.order?.originCity, __c.order?.destinationCity, __c.trackingNumber,
                    ])
                  ].map((v: any) => String(v || "").toLowerCase()).join(" | ");
                  return _kws.some((kw: string) => _hay.includes(kw));
                });
                const _cnt = _filtered.length;
                const _fmtDate = (d: any) => { if (!d) return "-"; try { return new Date(d).toLocaleDateString("zh-CN"); } catch(e) { return String(d); } };
                // 改动2: 业务类型标签辅助函数
                const _bizLabel = (bt: string) => { if (bt === "self" || bt === "self_owned") return "自运"; if (bt === "ltl") return "零担"; return "外请"; };
                const _bizColor = (bt: string) => { if (bt === "self" || bt === "self_owned") return "bg-sky-100 text-sky-700"; if (bt === "ltl") return "bg-purple-100 text-purple-700"; return "bg-amber-100 text-amber-700"; };
                // 改动4: 确认收到（单个或整组）
                const _confirmOne = async (it: any) => {
                  if (!window.confirm("确认收到该回单原件？")) return;
                  try { await updatePodStatus.mutateAsync({ id: it.id, originalStatus: "received", operationType: "confirm_received" }); toast.success("已确认收到"); refetchAll(); }
                  catch(e: any) { toast.error(e.message || "操作失败"); }
                };
                const _confirmGroup = async (it: any) => {
                  const __pending = (it._children || [it]).filter((__c: any) => __c.originalStatus !== "received");
                  if (__pending.length === 0) { toast.error("该组所有子单已确认收到"); return; }
                  if (!window.confirm("确认收到该组共 " + __pending.length + " 单的回单原件？")) return;
                  try {
                    // 改动5: 子单逐个确认后自动合并
                    for (const __c of __pending) { await updatePodStatus.mutateAsync({ id: __c.id, originalStatus: "received", operationType: "confirm_received" }); }
                    toast.success("已确认收到 " + __pending.length + " 单"); refetchAll();
                  } catch(e: any) { toast.error(e.message || "操作失败"); }
                };
                return (
                  <div className="space-y-3">
                    {podLoading && <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>}
                    {!podLoading && _cnt === 0 && (
                      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                        {_kw ? "未找到匹配的回单" : "暂无待确认收到的回单"}
                      </div>
                    )}
                    {!podLoading && _cnt > 0 && (
                      <div className="text-xs text-slate-500 px-1">共 {_cnt} 条</div>
                    )}
                    {/* 改动1: 卡片简洁两行风格，改动8: 字体间距放大 */}
                    <div className="space-y-3">
                      {_filtered.map((it: any) => {
                        const o = it.order || {};
                        const bt = o.businessType || "outsource";
                        const __children: any[] = it._children || [it];
                        const __isMerged = __children.length > 1;
                        const __pendingChildren = __children.filter((__c: any) => __c.originalStatus !== "received");
                        const __receivedCount = __children.filter((__c: any) => __c.originalStatus === "received").length;
                        const __totalCount = __children.length;
                        const __orderLabel = __isMerged
                          ? (it._mergedPlanNumber || "组合")
                          : (it.orderNumber || o.orderNumber || it.systemCode || "#" + it.orderId);
                        const __customerLabel = __isMerged
                          ? Array.from(new Set(__children.map((__c: any) => __c.order?.customerName).filter(Boolean))).join("、") || "-"
                          : (o.customerName || "-");
                        const __routeLabel = __isMerged
                          ? Array.from(new Set(__children.map((__c: any) => ((__c.order?.originCity || "?") + "→" + (__c.order?.destinationCity || "?"))))).join("、")
                          : ((o.originCity || "?") + "→" + (o.destinationCity || "?"));
                        const __plateDriver = (o.plateNumber || "-") + " · " + (o.driverName || "-");
                        const __trackingNums = Array.from(new Set(__children.map((__c: any) => __c.trackingNumber).filter(Boolean)));
                        const __sentDate = __children.map((__c: any) => __c.sentAt || __c.originalSentAt).filter(Boolean)[0];
                        const __dispatchDate = o.dispatchDate;
                        const __expanded = expandedGroups.has(it._groupKey);
                        return (
                          <div key={it._groupKey} className="rounded-xl border border-slate-200 bg-white shadow-sm" style={{ borderLeft: "4px solid #3b82f6" }}>
                            {/* 改动1: 第一行：订单号·客户·路线，改动2: 右上角业务类型标签 */}
                            <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 flex-1 text-base leading-relaxed">
                                <span className="font-mono text-[15px] font-bold text-slate-900">{__orderLabel}</span>
                                {__isMerged && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">合并{__children.length}单</span>}
                                <span className="text-slate-300">·</span>
                                <span className="text-[14px] text-slate-700">{__customerLabel}</span>
                                <span className="text-slate-300">·</span>
                                <span className="text-[14px] text-slate-600">{__routeLabel}</span>
                                {!__isMerged && <><span className="text-slate-300">·</span><span className="text-[14px] text-slate-500">{__plateDriver}</span></>}
                              </div>
                              {/* 改动2: 右上角业务类型标签 */}
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className={"rounded px-2 py-0.5 text-xs font-medium " + _bizColor(bt)}>{_bizLabel(bt)}</span>
                                <span className="text-[11px] text-slate-500">{__receivedCount}/{__totalCount} 已收</span>
                              </div>
                            </div>
                            {/* 改动1: 第二行：派车日期·寄出日期·快递单号 + 确认收到按钮 */}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-2">
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500 leading-relaxed">
                                <span>派车：{_fmtDate(__dispatchDate)}</span>
                                <span>寄出：{__sentDate ? _fmtDate(__sentDate) : "-"}</span>
                                <span>快递：{(__trackingNums as string[]).length > 0 ? (__trackingNums as string[]).join(", ") : "-"}</span>
                                {__isMerged && (
                                  <button type="button" className="text-blue-600 hover:underline text-xs"
                                    onClick={() => toggleGroup(it._groupKey)}>
                                    {__expanded ? "收起明细" : "展开明细(" + __children.length + ")"}
                                  </button>
                                )}
                              </div>
                              {/* 改动4: 确认收到按钮 */}
                              <button
                                type="button"
                                disabled={updatePodStatus.isPending || __pendingChildren.length === 0}
                                onClick={() => { __isMerged ? _confirmGroup(it) : _confirmOne(it); }}
                                className="rounded-lg bg-green-600 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {__isMerged ? "确认收到原件(" + __pendingChildren.length + "单)" : "确认收到原件"}
                              </button>
                            </div>
                            {/* 改动5: 展开子单，逐个确认后自动合并 */}
                            {__expanded && __isMerged && (
                              <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2">
                                <div className="space-y-1.5">
                                  {__pendingChildren.map((__c: any) => {
                                    const __co = __c.order || {};
                                    return (
                                      <div key={__c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                                          <span className="font-mono font-semibold text-slate-700">{__c.orderNumber || __co.orderNumber || __c.systemCode || "#" + __c.orderId}</span>
                                          <span className="text-slate-300">·</span>
                                          <span className="text-slate-600">{__co.customerName || "-"}</span>
                                          <span className="text-slate-300">·</span>
                                          <span className="text-slate-500">{(__co.originCity || "?") + "→" + (__co.destinationCity || "?")}</span>
                                          <span className="text-slate-300">·</span>
                                          <span className="text-slate-500">{(__co.plateNumber || "-") + " · " + (__co.driverName || "-")}</span>
                                        </div>
                                        <button type="button" disabled={updatePodStatus.isPending}
                                          onClick={() => _confirmOne(__c)}
                                          className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">
                                          确认收到
                                        </button>
                                      </div>
                                    );
                                  })}
                                  {__receivedCount > 0 && (
                                    <div className="text-xs text-emerald-700 px-1">已收到 {__receivedCount} 单，待确认 {__pendingChildren.length} 单</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              } catch(e: any) {
                return <div className="text-red-500 text-sm p-4">渲染错误：{e.message}</div>;
              }
            })()}
          </TabsContent>

          <TabsContent value="pending_dispatch_refund">
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              当前页面保留“待调度退押金”只读入口，用于提醒财务与站点人员：退押金请回找车台“回单处理”页签继续办理；财务回单确认台仅负责确认收到、回单状态维护和超期监控，不再直接执行退押金。
            </div>
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Info className="h-4 w-4 text-amber-600" />
                    待调度退押金
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    该页签仅保留职责拆分后的提示入口，不提供退押金按钮。退押金请回找车台“回单处理”页签，由调度在完成“标记原件已寄出 → 等待财务确认收到 → 退还押金”闭环后继续处理。
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    如当前订单已在财务台确认收到回单，但仍需办理押金，请通知对应调度在找车工作台继续完成后续动作。
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 自运月度未收统计 */}
          <TabsContent value="self_monthly_unreceived">
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              该视图按自运订单的签收月份聚合未收回单，并按“签收后 3 / 7 / 15 天”显示黄色、橙色、红色预警，便于财务月度催收与异常追踪。
            </div>
            <div className="grid gap-3 md:grid-cols-4 mb-4">
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">统计月份</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{selfMonthlySummary.month || selfMonthlyStats?.selectedMonth || "-"}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">签收总数 {selfMonthlySummary.signedTotalCount} 单</div>
                </CardContent>
              </Card>
              <Card className="border-orange-200 bg-orange-50/50">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">月度未收回单</div>
                  <div className="mt-1 text-lg font-semibold text-orange-700">{selfMonthlySummary.unreceivedCount}</div>
                  <div className="text-[11px] text-orange-700/80 mt-1">待上交 {selfMonthlySummary.pendingCount} · 已寄出 {selfMonthlySummary.sentCount}</div>
                </CardContent>
              </Card>
              <Card className="border-red-200 bg-red-50/40">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">超时预警</div>
                  <div className="mt-1 text-lg font-semibold text-red-700">{selfMonthlySummary.overdueCount}</div>
                  <div className="text-[11px] text-red-700/80 mt-1">红 {selfMonthlySummary.redCount} · 橙 {selfMonthlySummary.orangeCount} · 黄 {selfMonthlySummary.yellowCount}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">涉及车辆 / 客户</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{selfMonthlySummary.vehicleCount} / {selfMonthlySummary.customerCount}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">最早签收 {selfMonthlySummary.oldestSignedDate ? new Date(selfMonthlySummary.oldestSignedDate).toLocaleDateString("zh-CN") : "-"}</div>
                </CardContent>
              </Card>
            </div>
            {(selfMonthlyStats?.months?.length ?? 0) > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {selfMonthlyStats?.months.map((month: any) => (
                  <button
                    key={month.month}
                    type="button"
                    onClick={() => setSelfMonthlySelectedMonth(month.month)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${selfMonthlySelectedMonth === month.month ? "border-amber-400 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700 hover:border-amber-200 hover:bg-amber-50/40"}`}
                  >
                    <div className="text-sm font-semibold">{month.month}</div>
                    <div className="text-[11px] text-muted-foreground">未收 {month.unreceivedCount} / 超时 {month.overdueCount} / 已收 {month.receivedCount}</div>
                  </button>
                ))}
              </div>
            )}
            {overdueFilter !== "all" && (
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className={`text-xs ${
                  overdueFilter === "yellow" ? "border-yellow-400 text-yellow-700 bg-yellow-50" :
                  overdueFilter === "orange" ? "border-orange-400 text-orange-700 bg-orange-50" :
                  "border-red-400 text-red-700 bg-red-50"
                }`}>
                  当前筛选：{overdueFilter === "yellow" ? "黄色预警" : overdueFilter === "orange" ? "橙色警告" : "红色紧急"}
                  · {filteredSelfMonthlyItems.length}条
                </Badge>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setOverdueFilter("all")}>清除筛选</Button>
              </div>
            )}
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              当前月份共有 {selfMonthlySummary.unreceivedCount} 笔自运回单未收，其中超时预警 {selfMonthlySummary.overdueCount} 笔。
              {filteredSelfMonthlyItems.length > 0 ? " 可直接在本页确认收单，完成后月度统计会自动回落。" : " 当前筛选条件下暂无未收回单记录。"}
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>订单号</TableHead>
                      <TableHead>客户 · 路线</TableHead>
                      <TableHead>车牌 · 司机</TableHead>
                      <TableHead>签收日期</TableHead>
                      <TableHead>未收状态</TableHead>
                      <TableHead>预警等级</TableHead>
                      <TableHead>超时基准</TableHead>
                      <TableHead>超时天数</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSelfMonthlyItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          {selfMonthlySummary.month ? `${selfMonthlySummary.month} 暂无匹配的自运未收回单。` : "暂无自运月度未收回单数据。"}
                        </TableCell>
                      </TableRow>
                    ) : filteredSelfMonthlyItems.map((item: any) => (
                      <TableRow key={item.podId}>
                        <TableCell className="font-mono text-xs">{item.orderNumber || item.systemCode || `#${item.orderId}`}</TableCell>
                        <TableCell>
                          <div className="text-sm">{item.customerName || "-"}</div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">{item.originCity || "?"} <ArrowRight className="h-3 w-3" /> {item.destinationCity || "?"}</div>
                        </TableCell>
                        <TableCell className="text-xs"><div>{item.plateNumber || "-"}</div><div className="text-muted-foreground">{item.driverName || "-"}</div></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.signedDate ? new Date(item.signedDate).toLocaleDateString("zh-CN") : "-"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={item.originalStatus === "sent" ? "bg-blue-100 text-blue-700" : item.originalStatus === "lost" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}>
                            {item.originalStatus === "sent" ? "已寄出" : item.originalStatus === "lost" ? "已遗失" : "待上交"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.level === "red" ? <Badge variant="destructive" className="text-[10px]">紧急</Badge>
                          : item.level === "orange" ? <Badge className="text-[10px] bg-orange-500 text-white">警告</Badge>
                          : item.level === "yellow" ? <Badge className="text-[10px] bg-yellow-400 text-yellow-900">预警</Badge>
                          : <span className="text-xs text-muted-foreground">正常</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.overdueBaseAt ? new Date(item.overdueBaseAt).toLocaleDateString("zh-CN") : "-"}</TableCell>
                        <TableCell>
                          {item.level === "red" ? <Badge variant="destructive" className="text-[10px]">签收后{item.overdueDays}天</Badge>
                          : item.level === "orange" ? <Badge className="text-[10px] bg-orange-500 text-white">签收后{item.overdueDays}天</Badge>
                          : item.level === "yellow" ? <Badge className="text-[10px] bg-yellow-400 text-yellow-900">签收后{item.overdueDays}天</Badge>
                          : <span className="text-xs text-muted-foreground">签收后{item.overdueDays}天</span>}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" onClick={async () => {
                            try {
                              await updatePodStatus.mutateAsync({ id: item.podId, originalStatus: "received", operationType: "confirm_received" });
                              toast.success("已标记为已收到");
                              refetchAll();
                            } catch (e: any) {
                              toast.error(e.message || "操作失败");
                            }
                          }}>确认收到</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination total={filteredSelfMonthlyItems.length} page={selfMonthlyPage} pageSize={selfMonthlyPageSize} onPageChange={setSelfMonthlyPage} onPageSizeChange={setSelfMonthlyPageSize} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* 已收回单 - 改动1:卡片简洁两行风格 改动2:右上角业务类型标签 改动4:撤销收到功能 改动8:字体间距放大 */}
          <TabsContent value="received">
            {(() => {
              try {
                const _biz = businessTypeFilter;
                let _rawItems: any[] = Array.isArray(receivedPods) ? receivedPods.slice() : [];
                if (_biz !== "all") _rawItems = _rawItems.filter((it: any) => (it.order?.businessType) === _biz);
                // 按 mergedPlanNumber 分组（改动6: P开头合并订单号）
                const _groupMap = new Map<string, any>();
                const _groupList: any[] = [];
                for (const _it of _rawItems) {
                  const _mpn = _it.order?.mergedPlanNumber;
                  const _key = _mpn || ("__single_" + _it.id);
                  if (_mpn && _groupMap.has(_key)) {
                    const _g = _groupMap.get(_key)!;
                    _g._children.push(_it);
                    _g._totalWeight += parseFloat(String(_it.order?.weight || "0")) || 0;
                  } else {
                    const _base = { ..._it,
                      _children: [_it],
                      _totalWeight: parseFloat(String(_it.order?.weight || "0")) || 0,
                      _mergedPlanNumber: _mpn || null,
                      _groupKey: _key,
                    };
                    _groupMap.set(_key, _base);
                    _groupList.push(_base);
                  }
                }
                // 搜索过滤（支持P开头合并订单号）
                const _kw = String(search || "").trim().toLowerCase();
                const _kws = _kw ? _kw.split(/[\s,，;；\n\r]+/).map((s: string) => s.trim()).filter(Boolean) : [];
                let _filtered = _kws.length === 0 ? _groupList : _groupList.filter((it: any) => {
                  const _allChildren: any[] = it._children || [it];
                  const _hay = [
                    it._mergedPlanNumber,
                    ..._allChildren.flatMap((__c: any) => [
                      __c.orderNumber, __c.systemCode,
                      __c.order?.orderNumber, __c.order?.systemCode, __c.order?.mergedPlanNumber,
                      __c.order?.customerName, __c.order?.plateNumber, __c.order?.driverName,
                      __c.order?.originCity, __c.order?.destinationCity, __c.trackingNumber,
                    ])
                  ].map((v: any) => String(v || "").toLowerCase()).join(" | ");
                  return _kws.some((kw: string) => _hay.includes(kw));
                });
                // 按收到时间倒序
                _filtered.sort((a1: any, b1: any) => {
                  const ta = new Date(a1.originalReceivedAt || a1.receivedAt || a1.updatedAt || 0).getTime();
                  const tb = new Date(b1.originalReceivedAt || b1.receivedAt || b1.updatedAt || 0).getTime();
                  return tb - ta;
                });
                const _cnt = _filtered.length;
                const _fmtDate = (d: any) => { if (!d) return "-"; try { return new Date(d).toLocaleDateString("zh-CN"); } catch(e) { return String(d); } };
                // 改动2: 业务类型标签
                const _bizLabel = (bt: string) => { if (bt === "self" || bt === "self_owned") return "自运"; if (bt === "ltl") return "零担"; return "外请"; };
                const _bizColor = (bt: string) => { if (bt === "self" || bt === "self_owned") return "bg-sky-100 text-sky-700"; if (bt === "ltl") return "bg-purple-100 text-purple-700"; return "bg-amber-100 text-amber-700"; };
                // 改动4: 撤销收到功能
                const _revertOne = async (it: any) => {
                  if (!window.confirm("确认撤销该回单的收到记录？")) return;
                  try { await updatePodStatus.mutateAsync({ id: it.id, originalStatus: "pending", operationType: "revert_received" }); toast.success("已撤销收到"); refetchAll(); }
                  catch(e: any) { toast.error(e.message || "操作失败"); }
                };
                const _revertGroup = async (it: any) => {
                  const __children = it._children || [it];
                  if (!window.confirm("确认撤销该组共 " + __children.length + " 单的收到记录？")) return;
                  try {
                    for (const __c of __children) { await updatePodStatus.mutateAsync({ id: __c.id, originalStatus: "pending", operationType: "revert_received" }); }
                    toast.success("已撤销 " + __children.length + " 单"); refetchAll();
                  } catch(e: any) { toast.error(e.message || "操作失败"); }
                };
                return (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-500 px-1">共 {_cnt} 条（已确认收到，历史留存）</div>
                    {_cnt === 0 && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">暂无已收回单记录</div>}
                    {/* 改动1: 卡片简洁两行风格，改动8: 字体间距放大 */}
                    <div className="space-y-3">
                      {_filtered.map((it: any) => {
                        const o = it.order || {};
                        const bt = o.businessType || "outsource";
                        const __children: any[] = it._children || [it];
                        const __isMerged = __children.length > 1;
                        const __orderLabel = __isMerged
                          ? (it._mergedPlanNumber || "组合")
                          : (it.orderNumber || o.orderNumber || it.systemCode || "#" + it.orderId);
                        const __customerLabel = __isMerged
                          ? Array.from(new Set(__children.map((__c: any) => __c.order?.customerName).filter(Boolean))).join("、") || "-"
                          : (o.customerName || "-");
                        const __routeLabel = __isMerged
                          ? Array.from(new Set(__children.map((__c: any) => ((__c.order?.originCity || "?") + "→" + (__c.order?.destinationCity || "?"))))).join("、")
                          : ((o.originCity || "?") + "→" + (o.destinationCity || "?"));
                        const __plateDriver = (o.plateNumber || "-") + " · " + (o.driverName || "-");
                        const __trackingNums = Array.from(new Set(__children.map((__c: any) => __c.trackingNumber).filter(Boolean)));
                        const __sentDate = __children.map((__c: any) => __c.sentAt || __c.originalSentAt).filter(Boolean)[0];
                        const __receivedDate = __children.map((__c: any) => __c.originalReceivedAt || __c.receivedAt || __c.updatedAt).filter(Boolean)[0];
                        const __expanded = expandedGroups.has(it._groupKey);
                        return (
                          <div key={it._groupKey} className="rounded-xl border border-slate-200 bg-white shadow-sm" style={{ borderLeft: "4px solid #10b981" }}>
                            {/* 改动1: 第一行：订单号·客户·路线，改动2: 右上角业务类型标签 */}
                            <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 flex-1 text-base leading-relaxed">
                                <span className="font-mono text-[15px] font-bold text-slate-900">{__orderLabel}</span>
                                {__isMerged && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">合并{__children.length}单</span>}
                                <span className="text-slate-300">·</span>
                                <span className="text-[14px] text-slate-700">{__customerLabel}</span>
                                <span className="text-slate-300">·</span>
                                <span className="text-[14px] text-slate-600">{__routeLabel}</span>
                                {!__isMerged && <><span className="text-slate-300">·</span><span className="text-[14px] text-slate-500">{__plateDriver}</span></>}
                              </div>
                              {/* 改动2: 右上角业务类型标签 */}
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className={"rounded px-2 py-0.5 text-xs font-medium " + _bizColor(bt)}>{_bizLabel(bt)}</span>
                                <span className="text-[11px] text-emerald-700 font-medium">✓ 已收到</span>
                              </div>
                            </div>
                            {/* 改动1: 第二行：派车日期·寄出日期·收到日期 + 撤销收到按钮 */}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-2">
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500 leading-relaxed">
                                <span>派车：{_fmtDate(o.dispatchDate)}</span>
                                <span>寄出：{__sentDate ? _fmtDate(__sentDate) : "-"}</span>
                                <span className="text-emerald-700 font-medium">✓ 收到：{_fmtDate(__receivedDate)}</span>
                                {(__trackingNums as string[]).length > 0 && <span>快递：{(__trackingNums as string[]).join(", ")}</span>}
                                {__isMerged && (
                                  <button type="button" className="text-blue-600 hover:underline text-xs"
                                    onClick={() => toggleGroup(it._groupKey)}>
                                    {__expanded ? "收起明细" : "展开明细(" + __children.length + ")"}
                                  </button>
                                )}
                              </div>
                              {/* 改动4: 撤销收到按钮 */}
                              <button
                                type="button"
                                disabled={updatePodStatus.isPending}
                                onClick={() => { __isMerged ? _revertGroup(it) : _revertOne(it); }}
                                className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {__isMerged ? "撤销收到(" + __children.length + "单)" : "撤销收到"}
                              </button>
                            </div>
                            {/* 展开子单明细 */}
                            {__expanded && __isMerged && (
                              <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2">
                                <div className="space-y-1.5">
                                  {__children.map((__c: any) => {
                                    const __co = __c.order || {};
                                    const __cReceivedDate = __c.originalReceivedAt || __c.receivedAt || __c.updatedAt;
                                    return (
                                      <div key={__c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                                          <span className="font-mono font-semibold text-slate-700">{__c.orderNumber || __co.orderNumber || __c.systemCode || "#" + __c.orderId}</span>
                                          <span className="text-slate-300">·</span>
                                          <span className="text-slate-600">{__co.customerName || "-"}</span>
                                          <span className="text-slate-300">·</span>
                                          <span className="text-slate-500">{(__co.originCity || "?") + "→" + (__co.destinationCity || "?")}</span>
                                          <span className="text-emerald-700 font-medium">✓ {_fmtDate(__cReceivedDate)}</span>
                                        </div>
                                        <button type="button" disabled={updatePodStatus.isPending}
                                          onClick={() => _revertOne(__c)}
                                          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                                          单独撤销
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              } catch(e: any) {
                return <div className="text-red-500 text-sm p-4">渲染错误：{e.message}</div>;
              }
            })()}
          </TabsContent>
          {/* 超期回单监控 */}
          <TabsContent value="overdue_monitor">
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              超期回单监控仅统计已进入回单跟踪阶段且当前负责回单流转的记录。若当前为空，可先确认订单是否已签收并已进入回单流程；若零担主单已转后段外请负责，则需到对应责任单下查看预警；达到预警阈值后，系统才会在此生成提醒。
            </div>
            {/* 三色卡片概览 */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div
                className={`relative rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md ${overdueFilter === "yellow" ? "ring-2 ring-yellow-500" : ""}`}
                style={{ background: "linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)" }}
                onClick={() => setOverdueFilter(overdueFilter === "yellow" ? "all" : "yellow")}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-yellow-200/80">
                    <Info className="h-4 w-4 text-yellow-700" />
                  </div>
                  <span className="text-xs font-medium text-yellow-800">黄色预警</span>
                </div>
                <div className="text-3xl font-bold text-yellow-700">{overdueData.yellow}</div>
                <div className="text-[11px] text-yellow-600/80 mt-1">≤5天 · 每3天通知调度员</div>
                {overdueData.yellow > 0 && (
                  <div className="absolute top-2 right-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500"></span>
                    </span>
                  </div>
                )}
              </div>

              <div
                className={`relative rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md ${overdueFilter === "orange" ? "ring-2 ring-orange-500" : ""}`}
                style={{ background: "linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)" }}
                onClick={() => setOverdueFilter(overdueFilter === "orange" ? "all" : "orange")}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-orange-200/80">
                    <ShieldAlert className="h-4 w-4 text-orange-700" />
                  </div>
                  <span className="text-xs font-medium text-orange-800">橙色警告</span>
                </div>
                <div className="text-3xl font-bold text-orange-700">{overdueData.orange}</div>
                <div className="text-[11px] text-orange-600/80 mt-1">5-15天 · 每天通知调度+财务</div>
                {overdueData.orange > 0 && (
                  <div className="absolute top-2 right-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500"></span>
                    </span>
                  </div>
                )}
              </div>

              <div
                className={`relative rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md ${overdueFilter === "red" ? "ring-2 ring-red-500" : ""}`}
                style={{ background: "linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)" }}
                onClick={() => setOverdueFilter(overdueFilter === "red" ? "all" : "red")}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-red-200/80">
                    <Siren className="h-4 w-4 text-red-700" />
                  </div>
                  <span className="text-xs font-medium text-red-800">红色紧急</span>
                </div>
                <div className="text-3xl font-bold text-red-700">{overdueData.red}</div>
                <div className="text-[11px] text-red-600/80 mt-1">≥15天 · 每天通知全员+加急</div>
                {overdueData.red > 0 && (
                  <div className="absolute top-2 right-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 筛选提示 */}
            {overdueFilter !== "all" && (
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className={`text-xs ${
                  overdueFilter === "yellow" ? "border-yellow-400 text-yellow-700 bg-yellow-50" :
                  overdueFilter === "orange" ? "border-orange-400 text-orange-700 bg-orange-50" :
                  "border-red-400 text-red-700 bg-red-50"
                }`}>
                  当前筛选：{overdueFilter === "yellow" ? "黄色预警" : overdueFilter === "orange" ? "橙色警告" : "红色紧急"}
                  · {filteredOverdueItems.length}条
                </Badge>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setOverdueFilter("all")}>清除筛选</Button>
              </div>
            )}
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              {overdueFilter === "all"
                ? `当前共监控 ${filteredOverdueItems.length} 笔超期回单，建议优先处理红色与橙色记录。`
                : `当前仅查看${overdueFilter === "yellow" ? "黄色预警" : overdueFilter === "orange" ? "橙色警告" : "红色紧急"}，共 ${filteredOverdueItems.length} 笔。`}
              {filteredOverdueItems.length > 0
                ? " 处理完成后可回到对应工作台更新寄出或收回状态，避免重复告警。"
                : " 若本页无记录，说明当前筛选条件下暂无达到阈值的回单。"}
            </div>

            {/* 超期回单明细表格 */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>订单号</TableHead>
                      <TableHead>客户</TableHead>
                      <TableHead>路线</TableHead>
                      <TableHead>超期等级</TableHead>
                      <TableHead>超期天数</TableHead>
                      <TableHead>调度员</TableHead>
                      <TableHead>车牌 · 司机</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOverdueItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-400" />
                          {overdueFilter === "all"
                            ? "所有回单均在正常回收周期内；若有已签收订单尚未出现在这里，请先确认其是否已进入回单跟踪阶段。"
                            : "该等级暂无超期回单，可切换其他等级或返回全部查看。"}
                        </TableCell>
                      </TableRow>
                    ) : filteredOverdueItems
                      .sort((a: any, b: any) => b.overdueDays - a.overdueDays)
                      .map((item: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-xs">{item.orderNumber || item.systemCode || `#${item.orderId}`}</TableCell>
                        <TableCell className="text-sm">{item.customerName || "未知客户"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs">
                            {item.originCity || "?"} <ArrowRight className="h-3 w-3" /> {item.destinationCity || "?"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                            item.level === "red" ? "bg-red-100 text-red-700 border-red-200" :
                            item.level === "orange" ? "bg-orange-100 text-orange-700 border-orange-200" :
                            "bg-yellow-100 text-yellow-700 border-yellow-200"
                          }`}>
                            {item.level === "red" ? "紧急" : item.level === "orange" ? "警告" : "预警"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive" className={`text-[10px] px-1.5 py-0 ${
                            item.level === "red" ? "bg-red-600" : item.level === "orange" ? "bg-orange-500" : "bg-yellow-500"
                          }`}>
                            超期{item.overdueDays}天
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{item.dispatcherName || "-"}</TableCell>
                        <TableCell className="text-xs">
                          <div>{item.plateNumber || "-"}</div>
                          <div className="text-muted-foreground">{item.driverName || "-"}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination total={filteredOverdueItems.length} page={overduePodPage} pageSize={overduePodPageSize} onPageChange={setOverduePodPage} onPageSizeChange={setOverduePodPageSize} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>


    {/* 删除确认弹窗 */}
    <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>确定要删除这个订单吗？删除后不可恢复。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deleteTargetId && deleteMutation.mutate({ id: deleteTargetId })}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "删除中..." : "确认删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {/* 批量确认收到弹窗 */}
    <Dialog open={batchReceiveConfirmOpen} onOpenChange={(open) => { if (!open) setBatchReceiveConfirmOpen(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            批量确认收到
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">将批量标记 <span className="font-bold text-foreground">{selectedPendingPodIds.length}</span> 个回单为“已收到”。</p>
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm">
            <p className="text-green-800 font-medium mb-1">操作说明：</p>
            <ul className="text-green-700 space-y-1 text-xs list-disc list-inside">
              <li>已是“已收到”或“已遗失”状态的回单将自动跳过</li>
              <li>回单收到后，对应订单状态将自动同步更新</li>
              <li>此操作不可撤销，请确认无误</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchReceiveConfirmOpen(false)}>取消</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={batchMarkReceivedMutation.isPending || selectedPendingPodIds.length === 0} onClick={() => {
              if (selectedPendingPodIds.length === 0) { toast.error("没有可操作的待收回单"); return; }
              batchMarkReceivedMutation.mutate({ ids: selectedPendingPodIds });
            }}>
              {batchMarkReceivedMutation.isPending ? "处理中..." : `确认收到 ${selectedPendingPodIds.length}个`}
            </Button>

          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
    {/* 批量退回确认弹窗 */}
    <Dialog open={batchRollbackOpen} onOpenChange={(open) => { if (!open) { setBatchRollbackOpen(false); setBatchRollbackReason(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-orange-500" />
            批量退回上一步
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">已选择 <span className="font-medium text-foreground">{selectedIds.size}</span> 个订单，将全部退回到上一个流程节点。</p>
          <div>
            <Label>退回原因 *</Label>
            <Textarea value={batchRollbackReason} onChange={(e) => setBatchRollbackReason(e.target.value)} placeholder="请说明批量退回原因" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBatchRollbackOpen(false); setBatchRollbackReason(""); }}>取消</Button>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white" disabled={!batchRollbackReason.trim() || batchRollbackMutation.isPending} onClick={() => { if (batchRollbackReason.trim()) batchRollbackMutation.mutate({ ids: Array.from(selectedIds), reason: batchRollbackReason.trim() }); }}>
              {batchRollbackMutation.isPending ? "退回中..." : `确认退回 ${selectedIds.size} 个`}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
    {/* 退回确认弹窗 */}
    <Dialog open={rollbackTargetId !== null} onOpenChange={(open) => { if (!open) { setRollbackTargetId(null); setRollbackReason(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-orange-500" />
            退回上一步
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">订单将被退回到上一个流程节点，请填写退回原因。</p>
          <div>
            <Label>退回原因 *</Label>
            <Textarea value={rollbackReason} onChange={(e) => setRollbackReason(e.target.value)} placeholder="请说明退回原因" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRollbackTargetId(null); setRollbackReason(""); }}>取消</Button>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white" disabled={!rollbackReason.trim() || rollbackMutation.isPending} onClick={() => { if (rollbackTargetId && rollbackReason.trim()) rollbackMutation.mutate({ id: rollbackTargetId, reason: rollbackReason.trim() }); }}>
              {rollbackMutation.isPending ? "退回中..." : "确认退回"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
    </DashboardLayout>
  );
}
