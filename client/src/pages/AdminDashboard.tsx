import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  LayoutDashboard, Package, Truck, Users, DollarSign,
  ArrowRight, RefreshCw, AlertTriangle, Clock, CheckCircle2,
  TrendingUp, Activity, FileText, Info, ShieldAlert, Siren,
  Timer, Gauge, BarChart3, Zap, CircleAlert, Trophy, Medal, Award, Star, Download,
} from "lucide-react";
import { useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays } from "lucide-react";
import { resolveDashboardRouteDestination, resolveDashboardRouteOrigin } from "./dashboardRoute.utils";
import { shouldShowAdminDashboardLoadingState } from "./adminDashboardLoading";

const STATUS_LABELS: Record<string, string> = {
  pending_assign: "待分配", pending_price: "待定价", pending_dispatch: "待调度",
  pending_approval: "待审批", pending_vehicle: "待找车", pending_inquiry: "待询价",
  inquiry_confirmed: "询价确认", shipped: "已发运", dispatched: "已调度", in_transit: "运输中",
  delivered: "已送达", signed: "已签收", cancelled: "已取消",
  settled: "已结算",
  on_hold: "搁置",
};

const BIZ_LABELS: Record<string, string> = {
  outsource: "外请", self: "自运", ltl: "零担",
};

type DashboardTrendPoint = {
  date: string;
  cnt: number;
};

type DashboardStats = {
  total: number;
  byStatus: Record<string, number>;
  byBiz: Record<string, number>;
  urgentCount: number;
  inProgressCount: number;
  completedCount: number;
  todayNew: number;
  pendingApprovals: number;
  pendingPods: number;
  dailyTrend: DashboardTrendPoint[];
};

type DashboardOrderSnapshot = {
  businessType?: string | null;
  status?: string | null;
  podEffectiveStatus?: string | null;
  podOriginalStatus?: string | null;
  depositStatus?: string | null;
  depositAmount?: string | number | null;
  isUrgent?: boolean | null;
};

type OutsourceInspectionStats = {
  total: number;
  pendingPricing: number;
  pendingVehicle: number;
  pendingApproval: number;
  awaitingOriginalSend: number;
  originalInTransit: number;
  originalReceived: number;
  refundableDeposit: number;
  refundedDeposit: number;
  urgentOpen: number;
};

export function buildOutsourceInspectionStats(orders: DashboardOrderSnapshot[]): OutsourceInspectionStats {
  return orders.reduce<OutsourceInspectionStats>((acc, order) => {
    if (order.businessType !== "outsource") return acc;

    const status = String(order.status || "");
    const effectivePodStatus = String(order.podEffectiveStatus || "none");
    const originalPodStatus = String(order.podOriginalStatus || "");
    const hasOriginalBeenSent = originalPodStatus === "sent"
      || originalPodStatus === "received"
      || ["original_sent", "original_received"].includes(effectivePodStatus);
    const isOriginalReceived = originalPodStatus === "received" || effectivePodStatus === "original_received";
    const depositStatus = String(order.depositStatus || "none");
    const depositAmount = Number(order.depositAmount || 0);

    acc.total += 1;

    if (status === "pending_price") acc.pendingPricing += 1;
    if (status === "pending_vehicle") acc.pendingVehicle += 1;
    if (status === "pending_approval") acc.pendingApproval += 1;
    if (status === "signed" && !hasOriginalBeenSent) {
      acc.awaitingOriginalSend += 1;
    }
    if (originalPodStatus === "sent" || effectivePodStatus === "original_sent") acc.originalInTransit += 1;
    if (isOriginalReceived) acc.originalReceived += 1;
    if (isOriginalReceived && depositStatus === "paid" && Number.isFinite(depositAmount) && depositAmount > 0) {
      acc.refundableDeposit += 1;
    }
    if (depositStatus === "refunded") acc.refundedDeposit += 1;
    if (order.isUrgent && ["pending_price", "pending_vehicle", "pending_approval"].includes(status)) {
      acc.urgentOpen += 1;
    }

    return acc;
  }, {
    total: 0,
    pendingPricing: 0,
    pendingVehicle: 0,
    pendingApproval: 0,
    awaitingOriginalSend: 0,
    originalInTransit: 0,
    originalReceived: 0,
    refundableDeposit: 0,
    refundedDeposit: 0,
    urgentOpen: 0,
  });
}

export function getOutsourceInspectionFocus(stats: OutsourceInspectionStats) {
  const focusStages = [
    { key: "pendingPricing", label: "主管整理/定价", count: stats.pendingPricing },
    { key: "pendingVehicle", label: "外请调度找车", count: stats.pendingVehicle },
    { key: "pendingApproval", label: "主管审批放行", count: stats.pendingApproval },
    { key: "awaitingOriginalSend", label: "司机寄出原件", count: stats.awaitingOriginalSend },
    { key: "originalInTransit", label: "财务确认收原件", count: stats.originalInTransit },
    { key: "refundableDeposit", label: "找车台退押金处理", count: stats.refundableDeposit },
  ];

  const topStage = focusStages.sort((a, b) => b.count - a.count)[0];
  if (!topStage || topStage.count <= 0) {
    return { key: "stable", label: "整体平稳", count: 0 };
  }
  return topStage;
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();

  // 年月筛选
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<string>(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>(String(now.getMonth() + 1));

  // 根据年月计算日期范围
  const dateRange = useMemo(() => {
    if (selectedMonth === "all") {
      return {
        startDate: `${selectedYear}-01-01`,
        endDate: `${selectedYear}-12-31`,
      };
    }
    const y = parseInt(selectedYear);
    const m = parseInt(selectedMonth);
    const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { startDate, endDate };
  }, [selectedYear, selectedMonth]);

  const {
    data: orderData,
    refetch,
    isLoading: isOrderLoading,
  } = trpc.order.list.useQuery(
    { page: 1, pageSize: 500, startDate: dateRange.startDate, endDate: dateRange.endDate },
    { refetchInterval: 15000 }
  );

  const {
    data: dashboardData,
    refetch: refetchDashboard,
    isLoading: isDashboardLoading,
  } = trpc.stats.dashboard.useQuery(
    { startDate: dateRange.startDate, endDate: dateRange.endDate },
    { refetchInterval: 15000 }
  );

  // 调度效率分析
  const { data: efficiencyData, refetch: refetchEfficiency } = trpc.stats.dispatchEfficiency.useQuery(
    undefined,
    { refetchInterval: 30000 }
  );

  // 调度员工作量看板
  const { data: workloadData, refetch: refetchWorkload } = trpc.stats.dispatcherWorkload.useQuery(
    { year: parseInt(selectedYear), month: selectedMonth === "all" ? undefined : parseInt(selectedMonth) },
    { refetchInterval: 30000 }
  );

  // 调度员绩效排名
  const [perfPeriod, setPerfPeriod] = useState<"today" | "week" | "month">("today");
  const { data: perfData, refetch: refetchPerf } = trpc.stats.dispatcherPerformance.useQuery(
    { period: perfPeriod },
    { refetchInterval: 30000 }
  );

  const orders = orderData?.items ?? [];

  const stats = useMemo<DashboardStats>(() => {
    const fallbackByStatus: Record<string, number> = {};
    const fallbackByBiz: Record<string, number> = {};
    let fallbackUrgentCount = 0;

    orders.forEach((o: any) => {
      fallbackByStatus[o.status] = (fallbackByStatus[o.status] || 0) + 1;
      fallbackByBiz[o.businessType] = (fallbackByBiz[o.businessType] || 0) + 1;
      if (o.isUrgent) fallbackUrgentCount++;
    });

    const realByStatus: Record<string, number> = Object.fromEntries(
      (dashboardData?.byStatus ?? []).map((item: any) => [item.status, Number(item.cnt || 0)]),
    ) as Record<string, number>;
    const realByBiz: Record<string, number> = Object.fromEntries(
      (dashboardData?.byType ?? []).map((item: any) => [item.businessType, Number(item.cnt || 0)]),
    ) as Record<string, number>;
    const byStatus: Record<string, number> = Object.keys(realByStatus).length > 0 ? realByStatus : fallbackByStatus;
    const byBiz: Record<string, number> = Object.keys(realByBiz).length > 0 ? realByBiz : fallbackByBiz;
    const total = Object.values(byStatus as Record<string, number>).reduce((sum, count) => sum + Number(count || 0), 0) || orders.length;
    const urgentCount = Number(dashboardData?.urgentCount ?? fallbackUrgentCount ?? 0);
    const inProgressCount = ["pending_assign", "pending_price", "pending_dispatch", "pending_approval", "pending_vehicle", "pending_inquiry", "inquiry_confirmed", "shipped", "dispatched", "in_transit"].reduce(
      (sum, status) => sum + Number(byStatus[status] || 0),
      0,
    );
    const completedCount = ["delivered", "signed", "settled"].reduce(
      (sum, status) => sum + Number(byStatus[status] || 0),
      0,
    );

    return {
      total: Number(total || 0),
      byStatus,
      byBiz,
      urgentCount,
      inProgressCount,
      completedCount,
      todayNew: Number(dashboardData?.todayNew ?? 0),
      pendingApprovals: Number(dashboardData?.pendingApprovals ?? 0),
      pendingPods: Number(dashboardData?.pendingPods ?? 0),
      dailyTrend: ((dashboardData?.dailyTrend ?? []) as any[]).map((item) => ({
        date: String(item.date ?? ""),
        cnt: Number(item.cnt ?? 0),
      })),
    };
  }, [orders, dashboardData]);

  // 流水线各工位积压情况
  const pipeline = useMemo(() => [
    { name: "录单台", desc: "待分配", count: stats.byStatus["pending_assign"] || 0, color: "bg-yellow-500" },
    { name: "指挥台", desc: "待定价+待审批", count: (stats.byStatus["pending_price"] || 0) + (stats.byStatus["pending_approval"] || 0), color: "bg-orange-500" },
    { name: "找车台", desc: "待找车", count: stats.byStatus["pending_vehicle"] || 0, color: "bg-blue-500" },
    { name: "派车台", desc: "待调度", count: stats.byStatus["pending_dispatch"] || 0, color: "bg-indigo-500" },
    { name: "询价台", desc: "待询价", count: (stats.byStatus["pending_inquiry"] || 0) + (stats.byStatus["inquiry_confirmed"] || 0), color: "bg-purple-500" },
    { name: "已调度", desc: "已调度", count: (stats.byStatus["dispatched"] || 0) + (stats.byStatus["in_transit"] || 0), color: "bg-green-500" },
    { name: "已完成", desc: "送达+签收", count: stats.completedCount, color: "bg-emerald-500" },
  ], [stats]);

  // 最近加急订单
  const urgentOrders = useMemo(() =>
    orders.filter(o => o.isUrgent && !["cancelled"].includes(o.status)).slice(0, 10),
    [orders]
  );

  const outsourceInspection = useMemo(
    () => buildOutsourceInspectionStats(orders as DashboardOrderSnapshot[]),
    [orders],
  );

  const outsourceFocus = useMemo(
    () => getOutsourceInspectionFocus(outsourceInspection),
    [outsourceInspection],
  );

  const showPrimaryDashboardLoading = shouldShowAdminDashboardLoadingState({
    orderDataReady: Array.isArray(orderData?.items),
    dashboardDataReady: dashboardData !== undefined && dashboardData !== null,
    isOrderLoading,
    isDashboardLoading,
  });

  const outsourceInspectionCards = useMemo(() => [
    {
      title: "待整理/定价",
      value: outsourceInspection.pendingPricing,
      description: "录单后的外请单需在指挥台完成整理单与主管定价。",
      path: "/station/command",
      actionLabel: "查看指挥台",
      icon: Gauge,
      iconWrapClass: "bg-amber-100",
      iconClass: "text-amber-600",
      surfaceClass: "border-amber-200 bg-amber-50/80 hover:border-amber-300",
      valueClass: "text-amber-800",
    },
    {
      title: "待找车",
      value: outsourceInspection.pendingVehicle,
      description: "已定价并完成分配，正等待外请调度找车承接。",
      path: "/station/find-vehicle",
      actionLabel: "查看找车台",
      icon: Truck,
      iconWrapClass: "bg-blue-100",
      iconClass: "text-blue-600",
      surfaceClass: "border-blue-200 bg-blue-50/80 hover:border-blue-300",
      valueClass: "text-blue-800",
    },
    {
      title: "待审批",
      value: outsourceInspection.pendingApproval,
      description: "司机报价与押金已提交，等待主管审批后方可放行。",
      path: "/station/command",
      actionLabel: "处理审批",
      icon: ShieldAlert,
      iconWrapClass: "bg-violet-100",
      iconClass: "text-violet-600",
      surfaceClass: "border-violet-200 bg-violet-50/80 hover:border-violet-300",
      valueClass: "text-violet-800",
    },
    {
      title: "已签收待寄原件",
      value: outsourceInspection.awaitingOriginalSend,
      description: "司机签完单后需尽快寄出原件，当前仍未进入寄送状态。",
      path: "/station/find-vehicle",
      actionLabel: "跟进原件寄出",
      icon: FileText,
      iconWrapClass: "bg-orange-100",
      iconClass: "text-orange-600",
      surfaceClass: "border-orange-200 bg-orange-50/80 hover:border-orange-300",
      valueClass: "text-orange-800",
    },
    {
      title: "原件寄出待财务确认",
      value: outsourceInspection.originalInTransit,
      description: "原件已寄出但财务尚未确认收件，此阶段仍不可退押金。",
      path: "/station/pod-deposit",
      actionLabel: "查看回单台",
      icon: Clock,
      iconWrapClass: "bg-cyan-100",
      iconClass: "text-cyan-700",
      surfaceClass: "border-cyan-200 bg-cyan-50/80 hover:border-cyan-300",
      valueClass: "text-cyan-800",
    },
    {
      title: "确认原件后可退押金",
      value: outsourceInspection.refundableDeposit,
      description: "仅财务确认原件已收齐且押金未退的外请单进入该队列。",
      path: "/station/pod-deposit",
      actionLabel: "执行退押金",
      icon: DollarSign,
      iconWrapClass: "bg-green-100",
      iconClass: "text-green-600",
      surfaceClass: "border-green-200 bg-green-50/80 hover:border-green-300",
      valueClass: "text-green-800",
    },
  ], [outsourceInspection]);

  const readonlyDrilldownCards = useMemo(() => [
    {
      title: "操作日志",
      description: "查看系统操作留痕与关键变更记录，仅用于追踪与复盘。",
      path: "/operation-logs",
      actionLabel: "打开日志页",
      icon: FileText,
      surfaceClass: "border-slate-200 bg-white/90 hover:border-slate-300",
      iconWrapClass: "bg-slate-100",
      iconClass: "text-slate-700",
    },
    {
      title: "异常清单",
      description: "下钻到只读监控视图，集中查看超期与异常催收线索。",
      path: "/station/pod-deposit?tab=overdue_monitor",
      actionLabel: "打开异常监控",
      icon: AlertTriangle,
      surfaceClass: "border-amber-200 bg-amber-50/80 hover:border-amber-300",
      iconWrapClass: "bg-amber-100",
      iconClass: "text-amber-700",
    },
    {
      title: "工作台",
      description: "跳转到正式业务工作台入口，便于只读查看当前一线处理队列。",
      path: "/station/entry",
      actionLabel: "打开录单台",
      icon: LayoutDashboard,
      surfaceClass: "border-sky-200 bg-sky-50/80 hover:border-sky-300",
      iconWrapClass: "bg-sky-100",
      iconClass: "text-sky-700",
    },
  ], []);

  const handleRefresh = () => {
    refetch();
    refetchDashboard();
    refetchEfficiency();
    refetchPerf();
    refetchWorkload();
  };

  // 本月导出报表功能
  const exportMonthlyReport = useCallback(() => {
    if (!orders.length) { toast.error("没有可导出的数据"); return; }
    const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const monthLabel = selectedMonth === "all" ? `${selectedYear}年全年` : `${selectedYear}年${selectedMonth}月`;

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n';
    xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
    xml += '<Styles>';
    xml += '<Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/><Interior ss:Color="#4472C4" ss:Pattern="Solid"/><Font ss:Color="#FFFFFF" ss:Bold="1" ss:Size="14"/></Style>';
    xml += '<Style ss:ID="hd"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#E2EFDA" ss:Pattern="Solid"/></Style>';
    xml += '<Style ss:ID="sm"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/></Style>';
    xml += '<Style ss:ID="sec"><Font ss:Bold="1" ss:Size="12"/><Interior ss:Color="#D6E4F0" ss:Pattern="Solid"/></Style>';
    xml += '</Styles>\n';

    // === Sheet 1: 月度概览 ===
    xml += '<Worksheet ss:Name="月度概览"><Table>\n';
    xml += `<Row><Cell ss:StyleID="title" ss:MergeAcross="3"><Data ss:Type="String">永安物流 ${monthLabel} 运营报表</Data></Cell></Row>\n`;
    xml += '<Row></Row>\n';

    // 订单概览
    xml += '<Row><Cell ss:StyleID="sec" ss:MergeAcross="3"><Data ss:Type="String">一、订单概览</Data></Cell></Row>\n';
    const overviewItems = [
      ["订单总数", String(stats.total)],
      ["进行中", String(stats.inProgressCount)],
      ["已完成", String(stats.completedCount)],
      ["加急订单", String(stats.urgentCount)],
    ];
    overviewItems.forEach(([label, value]) => {
      xml += `<Row><Cell ss:StyleID="hd"><Data ss:Type="String">${esc(label)}</Data></Cell><Cell><Data ss:Type="Number">${value}</Data></Cell></Row>\n`;
    });
    xml += '<Row></Row>\n';

    // 业务类型分布
    xml += '<Row><Cell ss:StyleID="sec" ss:MergeAcross="3"><Data ss:Type="String">二、业务类型分布</Data></Cell></Row>\n';
    xml += '<Row><Cell ss:StyleID="hd"><Data ss:Type="String">业务类型</Data></Cell><Cell ss:StyleID="hd"><Data ss:Type="String">订单数</Data></Cell><Cell ss:StyleID="hd"><Data ss:Type="String">占比</Data></Cell></Row>\n';
    Object.entries(stats.byBiz as Record<string, number>).forEach(([biz, rawCount]) => {
      const bizCount = Number(rawCount || 0);
      const pct = stats.total > 0 ? ((bizCount / stats.total) * 100).toFixed(1) + "%" : "0%";
      xml += `<Row><Cell><Data ss:Type="String">${esc(BIZ_LABELS[biz] || biz)}</Data></Cell><Cell><Data ss:Type="Number">${bizCount}</Data></Cell><Cell><Data ss:Type="String">${pct}</Data></Cell></Row>\n`;
    });
    xml += '<Row></Row>\n';

    // 工位积压情况
    xml += '<Row><Cell ss:StyleID="sec" ss:MergeAcross="3"><Data ss:Type="String">三、工位积压情况</Data></Cell></Row>\n';
    xml += '<Row><Cell ss:StyleID="hd"><Data ss:Type="String">工位</Data></Cell><Cell ss:StyleID="hd"><Data ss:Type="String">积压数</Data></Cell><Cell ss:StyleID="hd"><Data ss:Type="String">说明</Data></Cell></Row>\n';
    pipeline.forEach(stage => {
      xml += `<Row><Cell><Data ss:Type="String">${esc(stage.name)}</Data></Cell><Cell><Data ss:Type="Number">${stage.count}</Data></Cell><Cell><Data ss:Type="String">${esc(stage.desc)}</Data></Cell></Row>\n`;
    });
    xml += '<Row></Row>\n';

    // 财务汇总
    const totalQuoted = orders.reduce((s, o: any) => s + parseFloat(o.quotedPrice || "0"), 0);
    const totalActual = orders.reduce((s, o: any) => s + parseFloat(o.actualFreight || "0"), 0);
    const totalWeight = orders.reduce((s, o: any) => s + parseFloat(o.weight || "0"), 0);
    const totalDeposit = orders.reduce((s, o: any) => s + parseFloat(o.depositAmount || "0"), 0);
    xml += '<Row><Cell ss:StyleID="sec" ss:MergeAcross="3"><Data ss:Type="String">四、财务汇总</Data></Cell></Row>\n';
    const finItems = [
      ["运费收入总额", `¥${totalQuoted.toFixed(2)}`],
      ["司机运费总额", `¥${totalActual.toFixed(2)}`],
      ["毛利润", `¥${(totalQuoted - totalActual).toFixed(2)}`],
      ["总重量(吨)", totalWeight.toFixed(2)],
      ["押金总额", `¥${totalDeposit.toFixed(2)}`],
    ];
    finItems.forEach(([label, value]) => {
      xml += `<Row><Cell ss:StyleID="hd"><Data ss:Type="String">${esc(label)}</Data></Cell><Cell><Data ss:Type="String">${esc(value)}</Data></Cell></Row>\n`;
    });

    xml += '</Table></Worksheet>\n';

    // === Sheet 2: 订单明细 ===
    xml += '<Worksheet ss:Name="订单明细"><Table>\n';
    const detailHeaders = ["订单号", "业务类型", "状态", "客户", "货物", "重量(吨)", "发货地", "目的地", "运费收入", "司机运费", "车牌号", "加急", "日期"];
    xml += '<Row>';
    detailHeaders.forEach(h => { xml += `<Cell ss:StyleID="hd"><Data ss:Type="String">${esc(h)}</Data></Cell>`; });
    xml += '</Row>\n';
    orders.forEach((o: any) => {
      xml += '<Row>';
      const cells = [
        o.orderNumber || o.systemCode || "",
        BIZ_LABELS[o.businessType] || o.businessType,
        STATUS_LABELS[o.status] || o.status,
        o.customerName || "",
        o.cargoName || "",
        String(o.weight || ""),
        o.originCity || "",
        o.destinationCity || "",
        String(o.quotedPrice || ""),
        String(o.actualFreight || ""),
        o.plateNumber || "",
        o.isUrgent ? "加急" : "",
        o.orderDate ? new Date(o.orderDate).toLocaleDateString("zh-CN") : "",
      ];
      cells.forEach(cell => {
        const isNum = /^-?\d+(\.\d+)?$/.test(String(cell || "").trim());
        xml += `<Cell><Data ss:Type="${isNum ? "Number" : "String"}">${esc(cell)}</Data></Cell>`;
      });
      xml += '</Row>\n';
    });
    // 订单明细汇总行
    xml += '<Row>';
    xml += `<Cell ss:StyleID="sm"><Data ss:Type="String">汇总（共${orders.length}条）</Data></Cell>`;
    for (let i = 1; i < detailHeaders.length; i++) xml += '<Cell ss:StyleID="sm"><Data ss:Type="String"></Data></Cell>';
    xml += '</Row>\n';
    const detailSummary = [
      ["订单总数", String(orders.length)],
      ["总重量(吨)", totalWeight.toFixed(2)],
      ["运费收入总额", `¥${totalQuoted.toFixed(2)}`],
      ["司机运费总额", `¥${totalActual.toFixed(2)}`],
      ["毛利润", `¥${(totalQuoted - totalActual).toFixed(2)}`],
    ];
    detailSummary.forEach(([label, value]) => {
      xml += '<Row>';
      xml += `<Cell ss:StyleID="sm"><Data ss:Type="String">${esc(label)}</Data></Cell>`;
      xml += `<Cell ss:StyleID="sm"><Data ss:Type="String">${esc(value)}</Data></Cell>`;
      for (let i = 2; i < detailHeaders.length; i++) xml += '<Cell><Data ss:Type="String"></Data></Cell>';
      xml += '</Row>\n';
    });
    xml += '</Table></Worksheet>\n';

    // === Sheet 3: 调度员工作量 ===
    const dispatchers = (workloadData as any)?.dispatchers;
    if (dispatchers?.length) {
      xml += '<Worksheet ss:Name="调度员工作量"><Table>\n';
      const wHeaders = ["调度员", "处理订单数", "外请", "自运", "零担"];
      xml += '<Row>';
      wHeaders.forEach(h => { xml += `<Cell ss:StyleID="hd"><Data ss:Type="String">${esc(h)}</Data></Cell>`; });
      xml += '</Row>\n';
      (dispatchers as any[]).forEach((d: any) => {
        xml += '<Row>';
        xml += `<Cell><Data ss:Type="String">${esc(d.name || "")}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="Number">${(d.outsource || 0) + (d.self || 0) + (d.ltl || 0)}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="Number">${d.outsource || 0}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="Number">${d.self || 0}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="Number">${d.ltl || 0}</Data></Cell>`;
        xml += '</Row>\n';
      });
      xml += '</Table></Worksheet>\n';
    }

    xml += '</Workbook>';
    const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `永安物流_${monthLabel}_运营报表.xls`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出${monthLabel}运营报表`);
  }, [orders, stats, pipeline, workloadData, selectedYear, selectedMonth]);

  if (showPrimaryDashboardLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <LayoutDashboard className="h-5 w-5 text-primary" />
                管理驾驶舱
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                全局统计 · 流水线监控 · 系统管理
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg px-2 py-1">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="h-7 w-[80px] text-xs border-0 bg-transparent shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i)).map(y => (
                      <SelectItem key={y} value={y}>{y}年</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="h-7 w-[75px] text-xs border-0 bg-transparent shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全年</SelectItem>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(m => (
                      <SelectItem key={m} value={m}>{m}月</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="default" size="sm" className="bg-green-600 hover:bg-green-700" onClick={exportMonthlyReport}>
                <Download className="h-4 w-4 mr-1" />
                导出报表
              </Button>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-1" />
                刷新
              </Button>
            </div>
          </div>

          <Card className="border-sky-200 bg-sky-50/60">
            <CardContent className="p-5 space-y-4">
              <div>
                <div className="text-sm font-medium text-slate-900">正在加载当前筛选范围的统计数据</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  当前为 {selectedYear} 年{selectedMonth === "all" ? "全年" : `${selectedMonth} 月`}，数据返回后将自动显示真实统计结果。
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                {Array.from({ length: 7 }).map((_, index) => (
                  <div key={index} className="rounded-xl border bg-white/90 p-4 shadow-sm">
                    <div className="animate-pulse space-y-3">
                      <div className="h-3 w-16 rounded bg-slate-200" />
                      <div className="h-8 w-12 rounded bg-slate-300" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <div className="rounded-xl border border-dashed bg-white/80 p-4 text-xs leading-5 text-muted-foreground">
                  首屏不再先显示“0”，避免把尚未返回的数据误读为当月没有业务。
                </div>
                <div className="rounded-xl border border-dashed bg-white/80 p-4 text-xs leading-5 text-muted-foreground">
                  一旦订单列表或看板统计返回成功，页面会自动切换为真实数值。
                </div>
                <div className="rounded-xl border border-dashed bg-white/80 p-4 text-xs leading-5 text-muted-foreground">
                  如长时间停留在此状态，可点击右上角“刷新”重试当前筛选范围查询。
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* 顶部标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-primary" />
              管理驾驶舱
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              全局统计 · 流水线监控 · 系统管理
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg px-2 py-1">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="h-7 w-[80px] text-xs border-0 bg-transparent shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i)).map(y => (
                    <SelectItem key={y} value={y}>{y}年</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="h-7 w-[75px] text-xs border-0 bg-transparent shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全年</SelectItem>
                  {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(m => (
                    <SelectItem key={m} value={m}>{m}月</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="default" size="sm" className="bg-green-600 hover:bg-green-700" onClick={exportMonthlyReport}>
              <Download className="h-4 w-4 mr-1" />
              导出报表
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-1" />
              刷新
            </Button>
          </div>
        </div>

        {/* 全局统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-100">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">总订单</div>
                <div className="text-2xl font-bold">{stats.total}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sky-100">
                <Clock className="h-5 w-5 text-sky-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">今日新增</div>
                <div className="text-2xl font-bold text-sky-700">{stats.todayNew}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100">
                <Activity className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">进行中</div>
                <div className="text-2xl font-bold text-amber-700">{stats.inProgressCount}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-violet-100">
                <ShieldAlert className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">待审批</div>
                <div className="text-2xl font-bold text-violet-700">{stats.pendingApprovals}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-100">
                <FileText className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">待回单</div>
                <div className="text-2xl font-bold text-orange-700">{stats.pendingPods}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">已完成</div>
                <div className="text-2xl font-bold text-green-700">{stats.completedCount}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">加急</div>
                <div className="text-2xl font-bold text-red-700">{stats.urgentCount}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-sky-200/70 bg-gradient-to-br from-sky-50 via-white to-cyan-50">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-sky-600" />
                  外请链路专项巡检
                  <Badge variant="secondary" className="ml-1 text-[10px]">管理驾驶舱</Badge>
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  围绕整理单/定价、找车审批、原件寄送与财务退押金四段关键闭环做日常巡检，所有数字均基于当前筛选范围。
                </p>
              </div>
              <div className="rounded-xl border border-sky-200 bg-white/85 px-4 py-3 text-right shadow-sm">
                <div className="text-[11px] text-muted-foreground">当前筛选范围外请单</div>
                <div className="text-2xl font-bold text-slate-900">{outsourceInspection.total}</div>
                <div className="text-[11px] text-sky-700">
                  占全部订单 {stats.total > 0 ? ((outsourceInspection.total / stats.total) * 100).toFixed(1) : "0.0"}%
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3">
              {outsourceInspectionCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.title}
                    type="button"
                    onClick={() => setLocation(card.path)}
                    className={`group rounded-xl border px-4 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${card.surfaceClass}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={`rounded-xl p-2.5 ${card.iconWrapClass}`}>
                        <Icon className={`h-4 w-4 ${card.iconClass}`} />
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                    </div>
                    <div className="mt-4">
                      <div className="text-xs text-muted-foreground">{card.title}</div>
                      <div className={`mt-1 text-3xl font-bold ${card.valueClass}`}>{card.value}</div>
                      <div className="mt-2 text-[11px] leading-5 text-slate-600">{card.description}</div>
                    </div>
                    <div className="mt-4 text-[11px] font-medium text-sky-700">{card.actionLabel}</div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {readonlyDrilldownCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.title}
                    type="button"
                    onClick={() => setLocation(card.path)}
                    className={`group rounded-xl border px-4 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${card.surfaceClass}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={`rounded-xl p-2.5 ${card.iconWrapClass}`}>
                        <Icon className={`h-4 w-4 ${card.iconClass}`} />
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                    </div>
                    <div className="mt-4 text-sm font-medium text-slate-900">{card.title}</div>
                    <div className="mt-2 text-[11px] leading-5 text-slate-600">{card.description}</div>
                    <div className="mt-4 text-[11px] font-medium text-sky-700">{card.actionLabel}</div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white/90 px-4 py-3">
                <div className="text-xs text-slate-500">当前最大堵点</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{outsourceFocus.label}</div>
                <div className="mt-1 text-[11px] text-slate-600">当前共有 {outsourceFocus.count} 单，建议优先查看对应工位并逐单清理。</div>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                <div className="text-xs text-rose-700">加急外请待处理</div>
                <div className="mt-1 text-lg font-semibold text-rose-900">{outsourceInspection.urgentOpen}</div>
                <div className="mt-1 text-[11px] text-rose-700">覆盖待定价、待找车、待审批三个节点，建议作为晨会优先巡检项。</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="text-xs text-emerald-700">押金闭环进度</div>
                <div className="mt-1 text-lg font-semibold text-emerald-900">已收原件 {outsourceInspection.originalReceived} 单 · 已退押金 {outsourceInspection.refundedDeposit} 单</div>
                <div className="mt-1 text-[11px] text-emerald-700">财务当前还可继续处理 {outsourceInspection.refundableDeposit} 单退押金，调度侧已寄出的原件在途 {outsourceInspection.originalInTransit} 单。</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.7fr] gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Timer className="h-4 w-4 text-sky-600" />
                近7日接单趋势
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.dailyTrend.length > 0 ? (() => {
                const maxTrendCount = Math.max(...stats.dailyTrend.map((item: any) => Number(item.cnt || 0)), 1);
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-7 gap-2 items-end h-40">
                      {stats.dailyTrend.map((item: any) => {
                        const value = Number(item.cnt || 0);
                        const height = Math.max(value > 0 ? 14 : 6, (value / maxTrendCount) * 100);
                        return (
                          <div key={item.date} className="flex flex-col items-center justify-end gap-2">
                            <div className="text-[11px] font-semibold text-slate-700">{value}</div>
                            <div className="w-full rounded-t-md bg-gradient-to-t from-sky-600 to-cyan-400" style={{ height: `${height}%` }} />
                            <div className="text-[10px] text-muted-foreground">{String(item.date).slice(5)}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="rounded-lg border bg-sky-50/60 px-3 py-2 text-xs text-sky-700">
                      最近 7 天共接单 {stats.dailyTrend.reduce((sum: number, item: any) => sum + Number(item.cnt || 0), 0)} 单，当前筛选范围内今日新增 {stats.todayNew} 单。
                    </div>
                  </div>
                );
              })() : (
                <div className="text-center py-10 text-sm text-muted-foreground">最近 7 天暂无接单趋势数据</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Siren className="h-4 w-4 text-rose-600" />
                关键预警
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-3">
                <div className="text-xs text-violet-700">待审批堆积</div>
                <div className="mt-1 text-2xl font-bold text-violet-800">{stats.pendingApprovals}</div>
                <div className="mt-1 text-[11px] text-violet-600">含溢价派车与价格例外，需要指挥台尽快处理。</div>
              </div>
              <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-3">
                <div className="text-xs text-orange-700">待回单堆积</div>
                <div className="mt-1 text-2xl font-bold text-orange-800">{stats.pendingPods}</div>
                <div className="mt-1 text-[11px] text-orange-600">回单未收齐将直接影响押金退回与完结节奏。</div>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3">
                <div className="text-xs text-red-700">加急订单</div>
                <div className="mt-1 text-2xl font-bold text-red-800">{stats.urgentCount}</div>
                <div className="mt-1 text-[11px] text-red-600">建议优先检查已进入待审批、待找车和运输中的加急单。</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 流水线工位监控 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              流水线工位监控
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1">
              {pipeline.map((stage, i) => (
                <div key={stage.name} className="flex items-center">
                  <div className="flex flex-col items-center min-w-[80px]">
                    <div className={`w-full h-2 rounded-full ${stage.color} opacity-${stage.count > 0 ? '100' : '30'}`} />
                    <div className="mt-2 text-center">
                      <div className="text-xs font-medium">{stage.name}</div>
                      <div className={`text-lg font-bold ${stage.count > 5 ? 'text-red-600' : stage.count > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {stage.count}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{stage.desc}</div>
                    </div>
                  </div>
                  {i < pipeline.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-muted-foreground mx-0.5 mt-[-16px]" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 业务类型分布 + 加急订单（重要信息前置） */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 业务类型分布 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="h-4 w-4" />
                业务类型分布
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(stats.byBiz as Record<string, number>).map(([biz, rawCount]) => {
                  const count = Number(rawCount || 0);
                  return (
                  <div key={biz} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{BIZ_LABELS[biz] || biz}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${biz === 'outsource' ? 'bg-blue-500' : biz === 'self' ? 'bg-green-500' : 'bg-purple-500'}`}
                          style={{ width: `${stats.total > 0 ? (Number(count || 0) / stats.total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                    </div>
                  </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 加急订单 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                加急订单
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>订单号</TableHead>
                    <TableHead>路线</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {urgentOrders.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground text-sm">暂无加急订单</TableCell></TableRow>
                  ) : urgentOrders.map(o => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.orderNumber || o.systemCode}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs">
                          {resolveDashboardRouteOrigin(o)} <ArrowRight className="h-3 w-3" /> {resolveDashboardRouteDestination(o)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {STATUS_LABELS[o.status] || o.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>


        {/* 调度员工作量看板 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-500" />
              调度员工作量看板
              <Badge variant="outline" className="ml-1 text-[10px]">
                {selectedMonth === "all" ? `${selectedYear}年` : `${selectedYear}年${selectedMonth}月`}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {workloadData && workloadData.dispatchers.length > 0 ? (() => {
              const ds = workloadData.dispatchers;
              const maxBacklog = Math.max(...ds.map(d => d.backlog), 1);
              const maxCompleted = Math.max(...ds.map(d => d.monthCompleted), 1);
              return (
                <div className="space-y-5">
                  {/* 汇总指标 */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center p-2.5 rounded-lg bg-red-50 border border-red-100">
                      <div className="text-lg font-bold text-red-700">{ds.reduce((s, d) => s + d.backlog, 0)}</div>
                      <div className="text-[10px] text-red-600/80">总积压</div>
                    </div>
                    <div className="text-center p-2.5 rounded-lg bg-green-50 border border-green-100">
                      <div className="text-lg font-bold text-green-700">{ds.reduce((s, d) => s + d.monthCompleted, 0)}</div>
                      <div className="text-[10px] text-green-600/80">{selectedMonth === "all" ? "年" : "月"}完成</div>
                    </div>
                    <div className="text-center p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                      <div className="text-lg font-bold text-blue-700">{ds.reduce((s, d) => s + d.monthNewOrders, 0)}</div>
                      <div className="text-[10px] text-blue-600/80">{selectedMonth === "all" ? "年" : "月"}新接</div>
                    </div>
                    <div className="text-center p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                      <div className="text-lg font-bold text-amber-700">{ds.reduce((s, d) => s + d.inTransit, 0)}</div>
                       <div className="text-[10px] text-amber-600/80">已调度</div>
                    </div>
                  </div>

                  {/* 双柱对比图 */}
                  <div>
                    <div className="flex items-center gap-4 mb-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400"></span> 当前积压</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span> {selectedMonth === "all" ? "年" : "月"}完成量</span>
                    </div>
                    <div className="space-y-2.5">
                      {ds.map(d => (
                        <div key={d.id} className="flex items-center gap-2">
                          {/* 名字 + 预警标识 */}
                          <div className="w-24 shrink-0 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-xs font-medium truncate">{d.name}</span>
                              {d.backlog >= 15 && <span className="shrink-0 w-2 h-2 rounded-full bg-red-500 animate-pulse" title="红色紧急：积压≥15单" />}
                              {d.backlog >= 10 && d.backlog < 15 && <span className="shrink-0 w-2 h-2 rounded-full bg-orange-500 animate-pulse" title="橙色预警：积压≥10单" />}
                              {d.backlog >= 5 && d.backlog < 10 && <span className="shrink-0 w-2 h-2 rounded-full bg-yellow-500" title="黄色提醒：积压≥5单" />}
                            </div>
                            <div className="text-[9px] text-muted-foreground">{d.roleLabel}</div>
                          </div>
                          {/* 双柱 */}
                          <div className="flex-1 space-y-1">
                            {/* 积压柱 */}
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-4 bg-muted/50 rounded overflow-hidden">
                                <div
                                  className={`h-full rounded flex items-center pl-1.5 text-[9px] font-medium text-white ${d.backlog > 5 ? 'bg-red-500' : d.backlog > 0 ? 'bg-red-400' : 'bg-red-200'}`}
                                  style={{ width: `${Math.max(d.backlog > 0 ? 8 : 0, d.backlog / maxBacklog * 100)}%`, transition: 'width 0.5s ease' }}
                                >
                                  {d.backlog > 0 ? d.backlog : ''}
                                </div>
                              </div>
                              <span className="text-[10px] font-mono w-6 text-right text-red-600">{d.backlog}</span>
                            </div>
                            {/* 完成柱 */}
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-4 bg-muted/50 rounded overflow-hidden">
                                <div
                                  className="h-full rounded bg-emerald-500 flex items-center pl-1.5 text-[9px] font-medium text-white"
                                  style={{ width: `${Math.max(d.monthCompleted > 0 ? 8 : 0, d.monthCompleted / maxCompleted * 100)}%`, transition: 'width 0.5s ease' }}
                                >
                                  {d.monthCompleted > 0 ? d.monthCompleted : ''}
                                </div>
                              </div>
                              <span className="text-[10px] font-mono w-6 text-right text-emerald-600">{d.monthCompleted}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 预警图例 */}
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground bg-muted/30 rounded-md px-3 py-1.5">
                    <span className="font-medium">积压预警：</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span> ≥5单</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> ≥10单</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> ≥15单</span>
                    <span className="ml-auto text-[9px]">每2小时自动检查并通知</span>
                  </div>

                  {/* 详细数据表 */}
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-xs py-2">调度员</TableHead>
                          <TableHead className="text-xs py-2 text-center">类型</TableHead>
                          <TableHead className="text-xs py-2 text-center">积压</TableHead>
                          <TableHead className="text-xs py-2 text-center">已调度</TableHead>
                          <TableHead className="text-xs py-2 text-center">新接</TableHead>
                          <TableHead className="text-xs py-2 text-center">完成</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ds.map(d => (
                          <TableRow key={d.id}>
                            <TableCell className="text-xs py-1.5 font-medium">{d.name}</TableCell>
                            <TableCell className="text-center py-1.5">
                              <Badge variant="outline" className="text-[9px] px-1 py-0">{d.roleLabel}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-center py-1.5">
                              <span className={`inline-flex items-center gap-1 font-semibold ${
                                d.backlog >= 15 ? 'text-red-600' : d.backlog >= 10 ? 'text-orange-600' : d.backlog >= 5 ? 'text-yellow-600' : d.backlog > 0 ? 'text-amber-600' : 'text-muted-foreground'
                              }`}>
                                {d.backlog >= 5 && <span className={`w-1.5 h-1.5 rounded-full ${
                                  d.backlog >= 15 ? 'bg-red-500 animate-pulse' : d.backlog >= 10 ? 'bg-orange-500 animate-pulse' : 'bg-yellow-500'
                                }`} />}
                                {d.backlog}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-center py-1.5 text-blue-600 font-medium">{d.inTransit}</TableCell>
                            <TableCell className="text-xs text-center py-1.5">{d.monthNewOrders}</TableCell>
                            <TableCell className="text-xs text-center py-1.5 text-emerald-600 font-semibold">{d.monthCompleted}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })() : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Users className="h-7 w-7 mx-auto mb-1.5 text-muted-foreground/50" />
                暂无调度员工作量数据
              </div>
            )}
          </CardContent>
        </Card>

        {/* 调度效率分析 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 工位积压监控 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Gauge className="h-4 w-4" />
                工位积压监控
              </CardTitle>
            </CardHeader>
            <CardContent>
              {efficiencyData?.stationBacklog && efficiencyData.stationBacklog.length > 0 ? (
                <div className="space-y-3">
                  {efficiencyData.stationBacklog.map((s: any) => (
                    <div key={s.station}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{s.station}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {s.total}单
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {s.over48h > 0 && (
                            <Badge variant="destructive" className="text-[9px] px-1 py-0">
                              {">"}48h: {s.over48h}
                            </Badge>
                          )}
                          {s.over24h > 0 && s.over24h > s.over48h && (
                            <Badge className="text-[9px] px-1 py-0 bg-amber-100 text-amber-700 border-amber-200" variant="outline">
                              {">"}24h: {s.over24h - s.over48h}
                            </Badge>
                          )}
                          {s.maxWaitHours > 0 && (
                            <span className="text-[10px] text-muted-foreground">最长{s.maxWaitHours}h</span>
                          )}
                        </div>
                      </div>
                      <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                        {s.total > 0 && (
                          <>
                            <div className="bg-green-500" style={{ width: `${Math.max(0, s.total - s.over24h) / s.total * 100}%` }} />
                            <div className="bg-amber-500" style={{ width: `${Math.max(0, s.over24h - s.over48h) / s.total * 100}%` }} />
                            <div className="bg-red-500" style={{ width: `${s.over48h / s.total * 100}%` }} />
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> ≤24h</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> 24-48h</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> {">"}48h</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-7 w-7 mx-auto mb-1.5 text-green-400" />
                  各工位无积压
                </div>
              )}
            </CardContent>
          </Card>

          {/* 处理效率对比 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                处理效率对比
              </CardTitle>
            </CardHeader>
            <CardContent>
              {efficiencyData ? (
                <div className="space-y-4">
                  {/* 各工位平均处理时间 */}
                  {Object.keys(efficiencyData.stationAvgHours).length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-2">各工位平均处理时间（小时）</div>
                      <div className="space-y-2">
                        {Object.entries(efficiencyData.stationAvgHours).map(([station, hours]: [string, any]) => {
                          const maxHours = Math.max(...Object.values(efficiencyData.stationAvgHours).map(Number), 1);
                          return (
                            <div key={station} className="flex items-center gap-2">
                              <span className="text-xs w-14 text-right">{station}</span>
                              <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full flex items-center pl-2 text-[10px] text-white font-medium ${
                                    Number(hours) > 24 ? 'bg-red-500' : Number(hours) > 12 ? 'bg-amber-500' : 'bg-blue-500'
                                  }`}
                                  style={{ width: `${Math.min(100, Number(hours) / maxHours * 100)}%`, minWidth: '30px' }}
                                >
                                  {Number(hours) === 0 ? '暂无数据' : `${hours}h`}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 今日vs昨日 / 本周vs上周 */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                    <div className="rounded-xl p-3 bg-muted/50">
                      <div className="text-[11px] text-muted-foreground mb-1">今日处理量</div>
                      <div className="flex items-end gap-2">
                        <span className="text-xl font-bold">{efficiencyData.comparison.todayProcessed}</span>
                        {efficiencyData.comparison.todayProcessed === 0 ? (
                          <span className="text-xs text-muted-foreground mb-0.5">暂无数据</span>
                        ) : efficiencyData.comparison.todayChange !== null && (
                          <span className={`text-xs font-medium mb-0.5 ${
                            efficiencyData.comparison.todayChange >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {efficiencyData.comparison.todayChange >= 0 ? '↑' : '↓'}{Math.abs(efficiencyData.comparison.todayChange)}%
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">昨日: {efficiencyData.comparison.yesterdayProcessed}</div>
                    </div>
                    <div className="rounded-xl p-3 bg-muted/50">
                      <div className="text-[11px] text-muted-foreground mb-1">本周处理量</div>
                      <div className="flex items-end gap-2">
                        <span className="text-xl font-bold">{efficiencyData.comparison.thisWeekProcessed}</span>
                        {efficiencyData.comparison.thisWeekProcessed === 0 ? (
                          <span className="text-xs text-muted-foreground mb-0.5">暂无数据</span>
                        ) : efficiencyData.comparison.weekChange !== null && (
                          <span className={`text-xs font-medium mb-0.5 ${
                            efficiencyData.comparison.weekChange >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {efficiencyData.comparison.weekChange >= 0 ? '↑' : '↓'}{Math.abs(efficiencyData.comparison.weekChange)}%
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">上周: {efficiencyData.comparison.lastWeekProcessed}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">加载中...</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 调度员绩效排名 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                调度员绩效排名
                {perfData?.summary && (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    共{perfData.summary.totalDispatchers}人
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-1">
                {(["today", "week", "month"] as const).map(p => (
                  <Button
                    key={p}
                    variant={perfPeriod === p ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setPerfPeriod(p)}
                  >
                    {p === "today" ? "今日" : p === "week" ? "本周" : "本月"}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {perfData && perfData.rankings.length > 0 ? (
              <div className="space-y-4">
                {/* 汇总指标 */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                    <div className="text-lg font-bold text-blue-700">{perfData.summary.totalProcessed}</div>
                    <div className="text-[10px] text-blue-600/80">总处理量</div>
                  </div>
                  <div className="text-center p-2.5 rounded-lg bg-green-50 border border-green-100">
                    <div className="text-lg font-bold text-green-700">{perfData.summary.avgResponseHours}h</div>
                    <div className="text-[10px] text-green-600/80">平均响应</div>
                  </div>
                  <div className="text-center p-2.5 rounded-lg bg-purple-50 border border-purple-100">
                    <div className="text-lg font-bold text-purple-700">{perfData.summary.totalDispatchers}</div>
                    <div className="text-[10px] text-purple-600/80">在线调度员</div>
                  </div>
                </div>

                {/* 排名列表 */}
                <div className="space-y-2">
                  {perfData.rankings.map((r, idx) => {
                    const RankIcon = idx === 0 ? Trophy : idx === 1 ? Medal : idx === 2 ? Award : Star;
                    const rankColor = idx === 0 ? "text-amber-500" : idx === 1 ? "text-gray-400" : idx === 2 ? "text-amber-700" : "text-muted-foreground";
                    const bgColor = idx === 0 ? "bg-amber-50 border-amber-200" : idx === 1 ? "bg-gray-50 border-gray-200" : idx === 2 ? "bg-orange-50 border-orange-200" : "bg-background border-border";

                    return (
                      <div key={r.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${bgColor} transition-all hover:shadow-sm`}>
                        {/* 排名 */}
                        <div className="flex items-center justify-center w-8 h-8 shrink-0">
                          {idx < 3 ? (
                            <RankIcon className={`h-5 w-5 ${rankColor}`} />
                          ) : (
                            <span className="text-sm font-bold text-muted-foreground">{idx + 1}</span>
                          )}
                        </div>

                        {/* 名字和角色 */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">{r.name}</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                              {r.roleLabel}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                            <span>处理 <strong className="text-foreground">{r.processed}</strong> 单</span>
                            <span>·</span>
                            <span>完成率 <strong className="text-foreground">{r.completionRate}%</strong></span>
                            {r.backlog > 0 && (
                              <>
                                <span>·</span>
                                <span className="text-amber-600">积压 {r.backlog}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* 响应时间 */}
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold">
                            {r.avgResponseHours !== null ? (
                              <span className={r.avgResponseHours < 6 ? "text-green-600" : r.avgResponseHours < 12 ? "text-amber-600" : "text-red-600"}>
                                {r.avgResponseHours}h
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                          <div className="text-[9px] text-muted-foreground">平均响应</div>
                        </div>

                        {/* 处理量柱状图 */}
                        <div className="w-16 shrink-0">
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${idx === 0 ? "bg-amber-500" : idx === 1 ? "bg-gray-400" : idx === 2 ? "bg-amber-700" : "bg-primary/60"}`}
                              style={{ width: `${perfData.rankings[0]?.processed > 0 ? Math.min(100, r.processed / perfData.rankings[0].processed * 100) : 0}%` }}
                            />
                          </div>
                          <div className="text-[9px] text-center text-muted-foreground mt-0.5">
                            评分 {r.totalScore}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 评分说明 */}
                <div className="text-[10px] text-muted-foreground bg-muted/50 rounded-md p-2">
                  <Info className="h-3 w-3 inline mr-1" />
                  综合评分 = 处理量(40%) + 响应速度(30%) + 完成率(30%)。响应速度评分：{"<"}2h=100分, 2-6h=80分, 6-12h=60分, 12-24h=40分, {">"}24h=20分。
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                暂无调度员绩效数据
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
}
