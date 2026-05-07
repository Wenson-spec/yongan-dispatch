import DashboardLayout from "@/components/DashboardLayout";
import ApprovalHistory from "@/components/ApprovalHistory";
import { fmtFull } from "@/lib/dateUtils";
import InlineEdit from "@/components/InlineEdit";
import { trpc } from "@/lib/trpc";
import { usePermissions } from "@/hooks/usePermissions";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Search,
  AlertTriangle,
  MoreHorizontal,
  Eye,
  Edit2,
  Truck,
  Pause,
  XCircle,
  Volume2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Layers,
  List,
  ChevronDown,
  ChevronUp,
  Trash2,
  Undo2,
  UserPlus,
  Settings2,
  Download,
  RefreshCcw,
  Filter,
  SlidersHorizontal,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { TablePagination } from "@/components/TablePagination";
import { getMergedChildDeleteLockReason, getMergedChildRollbackLockReason } from "@/lib/commandGroupRules";
import { useMergedPlanGroups } from "@/hooks/useMergedPlanGroups";
import MergedPlanGroupHeader from "@/components/MergedPlanGroupHeader";
import {
  getOrderOwnerLabel,
  getOrderPrimaryStatusLabel,
  getOrderPublicViewReason,
  getOrderWorkbenchMeta,
} from "./entryStationTotalTable.utils";

// 将在组件内定义 updateOrderFields mutation

const STATUS_LABELS: Record<string, string> = {
  pending_assign: "待指派",
  pending_dispatch: "待调度",
  pending_price: "待定价",
  priced: "已定价",
  pending_vehicle: "待找车",
  pending_approval: "待审批",
  pending_inquiry: "待询价",
  inquiry_confirmed: "已询价", shipped: "已发运",
  dispatched: "已调度",
  in_transit: "运输中",
  delivered: "已送达",
  signed: "已签收",
  settled: "已结算",
  on_hold: "等通知",
  cancelled: "已取消",
};

const STATUS_COLORS: Record<string, string> = {
  pending_assign: "bg-yellow-100 text-yellow-800",
  pending_dispatch: "bg-orange-100 text-orange-800",
  pending_price: "bg-blue-100 text-blue-800",
  priced: "bg-indigo-100 text-indigo-800",
  pending_vehicle: "bg-purple-100 text-purple-800",
  pending_approval: "bg-amber-100 text-amber-800",
  pending_inquiry: "bg-cyan-100 text-cyan-800",
  inquiry_confirmed: "bg-teal-100 text-teal-800",
  dispatched: "bg-green-100 text-green-800",
  in_transit: "bg-emerald-100 text-emerald-800",
  delivered: "bg-lime-100 text-lime-800",
  signed: "bg-green-200 text-green-900",
  settled: "bg-green-200 text-green-900",
  on_hold: "bg-slate-100 text-slate-800",
  cancelled: "bg-red-100 text-red-800",
};

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  outsource: "外请",
  self: "自运",
  ltl: "零担",
};

const BUSINESS_TYPE_COLORS: Record<string, string> = {
  outsource: "bg-blue-50 text-blue-700 border-blue-200",
  self: "bg-green-50 text-green-700 border-green-200",
  ltl: "bg-purple-50 text-purple-700 border-purple-200",
};

// 列配置定义
interface ColumnConfig {
  key: string;
  label: string;
  defaultVisible: boolean;
}

const ALL_COLUMNS: ColumnConfig[] = [
  { key: "orderNumber", label: "客户订单号", defaultVisible: true },
  { key: "businessType", label: "类型", defaultVisible: true },
  { key: "status", label: "状态", defaultVisible: true },
  { key: "customer", label: "客户", defaultVisible: true },
  { key: "cargo", label: "货物", defaultVisible: true },
  { key: "weight", label: "重量", defaultVisible: true },
  { key: "origin", label: "发货地", defaultVisible: true },
  { key: "destination", label: "目的地", defaultVisible: true },
  { key: "quotedPrice", label: "运费收入", defaultVisible: true },
  { key: "actualFreight", label: "司机运费", defaultVisible: true },
  { key: "plateNumber", label: "车牌号", defaultVisible: true },
  { key: "extendedInfo", label: "扩展信息", defaultVisible: true },
  { key: "shippingNote", label: "发货备注", defaultVisible: false },
  { key: "receivingNote", label: "收货备注", defaultVisible: false },
  { key: "dispatcher", label: "调度员", defaultVisible: true },
  { key: "createdAt", label: "创建时间", defaultVisible: true },
];

const COLUMN_STORAGE_KEY = "orderPool_visibleColumns";
const VIEWS_STORAGE_KEY = "orderPool_savedViews";

interface SavedView {
  id: string;
  name: string;
  columns: string[];
}

function getInitialVisibleColumns(): Set<string> {
  try {
    const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (saved) return new Set(JSON.parse(saved));
  } catch {}
  return new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key));
}

function getSavedViews(): SavedView[] {
  try {
    const saved = localStorage.getItem(VIEWS_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

export default function OrderPool() {
  const [, setLocation] = useLocation();
  const { hasPermission, role } = usePermissions();
  const utils = trpc.useUtils();
  const isAdmin = role === "admin";
  const getWorkspaceRoute = useCallback((order: any) => {
    const currentStatus = order?.status;
    if (["pending_vehicle", "pending_approval"].includes(currentStatus)) return "/station/find-vehicle";
    if (["pending_inquiry", "inquiry_confirmed", "shipped"].includes(currentStatus)) return "/station/ltl-workspace";
    if (["dispatched", "in_transit", "delivered"].includes(currentStatus)) return "/station/dispatch-vehicle";
    if (["signed", "settled"].includes(currentStatus)) return "/station/pod-deposit";
    return "/station/entry";
  }, []);
  const navigateToOrderWorkspace = useCallback((order: any) => {
    setLocation(getWorkspaceRoute(order));
  }, [getWorkspaceRoute, setLocation]);

  // 筛选状态
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [businessType, setBusinessType] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [groupByPlan, setGroupByPlan] = useState(true);
  const [dispatcherFilter, setDispatcherFilter] = useState<string>("");
  // 高级搜索
  const [showAdvSearch, setShowAdvSearch] = useState(false);
  const [advStartDate, setAdvStartDate] = useState("");
  const [advEndDate, setAdvEndDate] = useState("");
  const [advOriginCity, setAdvOriginCity] = useState("");
  const [advDestCity, setAdvDestCity] = useState("");
  const [advFreightMin, setAdvFreightMin] = useState("");
  const [advFreightMax, setAdvFreightMax] = useState("");
  const [advPlateNumber, setAdvPlateNumber] = useState("");
  const [advCustomerName, setAdvCustomerName] = useState("");
  // 选中状态（批量操作）
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [rollbackTargetId, setRollbackTargetId] = useState<number | null>(null);
  const [rollbackReason, setRollbackReason] = useState("");
  const [revertTargetStatus, setRevertTargetStatus] = useState("pending_assign");
  // 重新分配调度员
  const [reassignDialog, setReassignDialog] = useState<any>(null);
  const [reassignDispatcherId, setReassignDispatcherId] = useState("");
  // 详情弹窗窗
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // 列配置
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(getInitialVisibleColumns);
  const [savedViews, setSavedViews] = useState<SavedView[]>(getSavedViews);
  const [activeViewId, setActiveViewId] = useState<string>("");
  const [newViewName, setNewViewName] = useState("");
  const [showSaveView, setShowSaveView] = useState(false);

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
    setActiveViewId(""); // 手动改列时取消视图选中
  };
  const resetColumns = () => {
    const defaults = new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key));
    setVisibleColumns(defaults);
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(Array.from(defaults)));
    setActiveViewId("");
  };
  const saveView = () => {
    if (!newViewName.trim()) { toast.error("请输入视图名称"); return; }
    const view: SavedView = { id: Date.now().toString(), name: newViewName.trim(), columns: Array.from(visibleColumns) };
    const updated = [...savedViews, view];
    setSavedViews(updated);
    localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(updated));
    setActiveViewId(view.id);
    setNewViewName("");
    setShowSaveView(false);
    toast.success(`视图「${view.name}」已保存`);
  };
  const loadView = (view: SavedView) => {
    setVisibleColumns(new Set(view.columns));
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(view.columns));
    setActiveViewId(view.id);
    toast.success(`已切换到视图「${view.name}」`);
  };
  const deleteView = (viewId: string) => {
    const updated = savedViews.filter(v => v.id !== viewId);
    setSavedViews(updated);
    localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(updated));
    if (activeViewId === viewId) setActiveViewId("");
    toast.success("视图已删除");
  };
  const updateView = (viewId: string) => {
    const updated = savedViews.map(v => v.id === viewId ? { ...v, columns: Array.from(visibleColumns) } : v);
    setSavedViews(updated);
    localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(updated));
    const view = updated.find(v => v.id === viewId);
    toast.success(`视图「${view?.name}」已更新为当前列配置`);
  };
  const isColVisible = (key: string) => visibleColumns.has(key);
  const visibleColCount = 3 + visibleColumns.size; // checkbox + # + visible columns + 操作

  // 加急声音提醒（需用户交互激活 AudioContext）
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const prevUrgentCountRef = useRef(0);

  // 用户首次交互时解锁 AudioContext（解决浏览器自动播放策略限制）
  useEffect(() => {
    const unlockAudio = () => {
      if (audioUnlockedRef.current) return;
      try {
        const ctx = new AudioContext();
        // 播放一个静音的短音来解锁
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        audioCtxRef.current = ctx;
        audioUnlockedRef.current = true;
      } catch (e) {
        // 忽略
      }
    };
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const queryInput = useMemo(() => ({
    page,
    pageSize,
    businessType: businessType ? businessType as any : undefined,
    status: status || undefined,
    keyword: keyword || undefined,
    isUrgent: urgentOnly ? true : undefined,
    assignedDispatcherId: dispatcherFilter ? parseInt(dispatcherFilter) : undefined,
    startDate: advStartDate || undefined,
    endDate: advEndDate || undefined,
    originCity: advOriginCity || undefined,
    destinationCity: advDestCity || undefined,
    freightMin: advFreightMin ? parseFloat(advFreightMin) : undefined,
    freightMax: advFreightMax ? parseFloat(advFreightMax) : undefined,
    plateNumber: advPlateNumber || undefined,
  }), [page, pageSize, businessType, status, keyword, urgentOnly, dispatcherFilter, advStartDate, advEndDate, advOriginCity, advDestCity, advFreightMin, advFreightMax, advPlateNumber]);

  const { data, isLoading, refetch } = trpc.order.list.useQuery(queryInput, {
    refetchInterval: 10000, // 10秒自动刷新（设计方案规定）
  });

  const { data: orderDetail } = trpc.order.getById.useQuery(
    { id: detailId! },
    { enabled: !!detailId }
  );

  const { data: statsData } = trpc.order.stats.useQuery();

  // 加急订单声音提醒（复用已解锁的 AudioContext，避免每次新建）
  useEffect(() => {
    if (data?.items) {
      const urgentCount = data.items.filter((o) => o.isUrgent && !["cancelled"].includes(o.status)).length;
      if (urgentCount > prevUrgentCountRef.current && prevUrgentCountRef.current > 0) {
        // 新增了加急订单，播放提示音
        try {
          const ctx = audioCtxRef.current || new AudioContext();
          if (ctx.state === 'suspended') ctx.resume();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 800;
          gain.gain.value = 0.3;
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
          setTimeout(() => {
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.frequency.value = 1000;
            gain2.gain.value = 0.3;
            osc2.start();
            osc2.stop(ctx.currentTime + 0.3);
          }, 350);
          toast.warning("有新的加急订单！", { duration: 5000 });
        } catch (e) {
          // 浏览器可能阻止自动播放，仅显示 toast
          toast.warning("有新的加急订单！", { duration: 5000 });
        }
      }
      prevUrgentCountRef.current = urgentCount;
    }
  }, [data?.items]);

  const handleSearch = () => {
    setKeyword(searchInput);
    setPage(1);
  };

  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);

  const {
    groupedData,
    expandedGroups,
    toggleGroup,
    planNumberIndex,
    planColorMap,
  } = useMergedPlanGroups(data?.items, groupByPlan);

  // 渲染订单行单元格（复用于分组视图和普通视图）
  const renderOrderCells = (order: any) => (
    <>
      {isColVisible("orderNumber") && <TableCell className="font-mono text-xs">
        <div className="flex items-center gap-1">
          {order.isUrgent && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
          {order.orderNumber || "-"}
        </div>
      </TableCell>}
      {isColVisible("businessType") && <TableCell className="text-center">
        <Badge variant="outline" className={`text-[10px] px-1.5 ${BUSINESS_TYPE_COLORS[order.businessType] || ""}`}>
          {BUSINESS_TYPE_LABELS[order.businessType] || order.businessType}
        </Badge>
      </TableCell>}
      {isColVisible("status") && <TableCell className="text-center">
        <div className="flex flex-col items-center gap-1">
          <Badge className={`text-[10px] px-1.5 ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-800"}`}>
            {getOrderPrimaryStatusLabel(order)}
          </Badge>
          <span className="max-w-[180px] text-[11px] leading-4 text-muted-foreground" title={getOrderPublicViewReason(order, "pool")}>
            {getOrderPublicViewReason(order, "pool")}
          </span>
        </div>
      </TableCell>}
      {isColVisible("customer") && <TableCell className="text-sm truncate max-w-[120px]" title={order.customerName || ""}>
        {order.customerName || "-"}
      </TableCell>}
      {isColVisible("cargo") && <TableCell className="text-sm truncate max-w-[100px]" title={order.cargoName || ""}>
        {order.cargoName || "-"}
      </TableCell>}
      {isColVisible("weight") && <TableCell className="text-right text-sm">
        {order.weight ? `${order.weight}t` : "-"}
      </TableCell>}
      {isColVisible("origin") && <TableCell className="text-sm">{order.originCity || "-"}</TableCell>}
      {isColVisible("destination") && <TableCell className="text-sm font-medium">{order.destinationCity || "-"}</TableCell>}
      {isColVisible("quotedPrice") && <TableCell className="text-right text-sm">{formatMoney(order.quotedPrice)}</TableCell>}
      {isColVisible("actualFreight") && <TableCell className="text-right text-sm">{formatMoney(order.actualFreight)}</TableCell>}
      {isColVisible("plateNumber") && <TableCell className="text-sm">{order.plateNumber || "-"}</TableCell>}
      {isColVisible("extendedInfo") && <TableCell className="text-xs">
        {order.businessType === "outsource" && (
          <div className="space-y-0.5">
            {order.dispatchPrice && <div>调度价: {formatMoney(order.dispatchPrice)}</div>}
            {order.depositAmount && <div>押金: {formatMoney(order.depositAmount)} <span className={order.depositStatus === "paid" ? "text-green-600" : order.depositStatus === "refunded" ? "text-blue-600" : "text-muted-foreground"}>({order.depositStatus === "paid" ? "已付" : order.depositStatus === "refunded" ? "已退" : order.depositStatus === "not_refundable" ? "不退" : "无"})</span></div>}
            {order.driverName && <div>司机: {order.driverName}{order.driverPhone ? ` ${order.driverPhone}` : ""}</div>}
            {!order.dispatchPrice && !order.depositAmount && !order.driverName && <span className="text-muted-foreground">-</span>}
          </div>
        )}
        {order.businessType === "self" && (
          <div className="space-y-0.5">
            {order.driverName && <div>司机: {order.driverName}</div>}
            {order.driverPhone && <div>电话: {order.driverPhone}</div>}
            {order.deliveryFee && <div>送货费: {formatMoney(order.deliveryFee)}</div>}
            {!order.driverName && !order.driverPhone && <span className="text-muted-foreground">-</span>}
          </div>
        )}
        {order.businessType === "ltl" && (
          <div className="space-y-0.5">
            {order.freightStationName && <div className="text-blue-600">{order.freightStationName}</div>}
            {order.freightWaybillNumber && <div>运单号: {order.freightWaybillNumber}</div>}
            {order.inquiryPhone && <div>查货: {order.inquiryPhone}</div>}
            {order.ltlUnitPrice && <div>单价: ¥{order.ltlUnitPrice}/吨</div>}
            {!order.freightStationName && !order.freightWaybillNumber && <span className="text-muted-foreground">-</span>}
          </div>
        )}
      </TableCell>}
      {isColVisible("shippingNote") && <TableCell className="text-xs max-w-[120px]">
        <div className="truncate" title={(order as any).shippingNote || order.remarks || ""}>
          {(order as any).shippingNote || order.remarks || <span className="text-muted-foreground">-</span>}
        </div>
      </TableCell>}
      {isColVisible("receivingNote") && <TableCell className="text-xs max-w-[120px]">
        <div className="truncate" title={(order as any).receivingNote || ""}>
          {(order as any).receivingNote || <span className="text-muted-foreground">-</span>}
        </div>
      </TableCell>}
      {isColVisible("dispatcher") && <TableCell className="text-sm text-muted-foreground">
        <div className="space-y-1">
          <div className="font-medium text-foreground">主归属工作台：{getOrderWorkbenchMeta(order).label}</div>
          <div className="text-[11px] text-muted-foreground">责任显示：{getOrderOwnerLabel(order)}</div>
        </div>
      </TableCell>}
      {isColVisible("createdAt") && <TableCell className="text-xs text-muted-foreground">
        {order.createdAt ? new Date(order.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
      </TableCell>}
      <TableCell className="text-center" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            <DropdownMenuItem onClick={() => { setDetailId(order.id); setDetailOpen(true); }}>
              <Eye className="h-4 w-4 mr-2" />
              查看详情
            </DropdownMenuItem>
            {hasPermission(["order.create", "order.edit"]) && (
              <DropdownMenuItem onClick={() => setLocation(`/orders/edit/${order.id}?from=${encodeURIComponent(getWorkspaceRoute(order))}`)}>
                <Edit2 className="h-4 w-4 mr-2" />
                编辑
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigateToOrderWorkspace(order)}>
              <Layers className="h-4 w-4 mr-2" />
              跳转到所属工作台
            </DropdownMenuItem>
            {(hasPermission("order.rollback") || hasPermission("order.delete")) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Settings2 className="h-4 w-4 mr-2" />
                    高级操作
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {hasPermission("order.rollback") && !["pending_assign", "cancelled"].includes(order.status) && (
                      <DropdownMenuItem
                        className="text-orange-600"
                        onClick={() => openRollbackDialog(order)}
                        disabled={Boolean(getRollbackLockReason(order))}
                        title={getRollbackLockReason(order) || "退回上一步"}
                      >
                        <Undo2 className="h-4 w-4 mr-2" />
                        退回上一步
                      </DropdownMenuItem>
                    )}
                    {hasPermission("order.delete") && (
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDeleteSingle(order)}
                        disabled={Boolean(getDeleteLockReason(order))}
                        title={getDeleteLockReason(order) || "删除"}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        删除
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </>
  );

  const updateOrderFields = trpc.order.updateOrderFields.useMutation({
    onSuccess: () => {
      utils.order.list.invalidate();
      toast.success("备注已更新");
    },
    onError: (err: any) => toast.error(err.message || "更新失败"),
  });

  const updateStatusMutation = trpc.order.updateStatus.useMutation({
    onSuccess: () => {
      utils.order.list.invalidate();
      utils.order.stats.invalidate();
      toast.success("状态更新成功");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.order.delete.useMutation({
    onSuccess: () => {
      utils.order.list.invalidate();
      utils.order.stats.invalidate();
      toast.success("订单已删除");
      setDeleteTargetId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const rollbackMutation = trpc.order.rollbackStatus.useMutation({
    onSuccess: (res) => {
      utils.order.list.invalidate();
      utils.order.stats.invalidate();
      toast.success(`订单已退回：${res.fromLabel} → ${res.toLabel}`);
      setRollbackTargetId(null);
      setRollbackReason("");
    },
    onError: (err: any) => toast.error(err.message),
  });
  // 指定目标状态退回（增强版：强制清空派车信息+清理回单+重置押金）
  const revertMutation = trpc.order.revertStatus.useMutation({
    onSuccess: (res) => {
      utils.order.list.invalidate();
      utils.order.stats.invalidate();
      toast.success(`订单已退回：${res.fromLabel} → ${res.toLabel}`);
      setRollbackTargetId(null);
      setRollbackReason("");
      setRevertTargetStatus("pending_assign");
    },
    onError: (err: any) => toast.error(err.message),
  });
  const batchDeleteMutation = trpc.order.batchDelete.useMutation({
    onSuccess: (res) => {
      utils.order.list.invalidate();
      utils.order.stats.invalidate();
      toast.success(`已删除 ${res.count} 个订单`);
      setSelectedIds(new Set());
      setDeleteConfirmOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const [batchRollbackOpen, setBatchRollbackOpen] = useState(false);
  const [batchRollbackReason, setBatchRollbackReason] = useState("");
  // 获取外请调度员列表（用于重新分配）
  const { data: dispatcherList } = trpc.order.getDispatchers.useQuery();
  const outsourceDispatchers = useMemo(() => {
    return (dispatcherList ?? []).filter((u: any) => u.role === "outsource_dispatcher");
  }, [dispatcherList]);

  const reassignMutation = trpc.order.reassignDispatcher.useMutation({
    onSuccess: () => {
      utils.order.list.invalidate();
      utils.order.stats.invalidate();
      toast.success("调度员重新指派成功");
      setReassignDialog(null);
      setReassignDispatcherId("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const assignMutation = trpc.order.assignDispatcher.useMutation({
    onSuccess: () => {
      utils.order.list.invalidate();
      utils.order.stats.invalidate();
      toast.success("调度员指派成功");
      setReassignDialog(null);
      setReassignDispatcherId("");
    },
    onError: (err: any) => toast.error(err.message),
  });


  // 批量状态推进
  const [batchStatusOpen, setBatchStatusOpen] = useState(false);
  const [batchTargetStatus, setBatchTargetStatus] = useState("");
  const batchStatusMutation = trpc.order.batchUpdateStatus.useMutation({
    onSuccess: (res) => {
      utils.order.list.invalidate();
      utils.order.stats.invalidate();
      toast.success(`批量推进成功：${res.count}/${res.total} 个订单`);
      setSelectedIds(new Set());
      setBatchStatusOpen(false);
      setBatchTargetStatus("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const BATCH_STATUS_OPTIONS = [
    { value: "delivered", label: "已送达", color: "text-teal-600 border-teal-300 hover:bg-teal-50" },
    { value: "signed", label: "已签收", color: "text-green-600 border-green-300 hover:bg-green-50" },
    { value: "on_hold", label: "等通知", color: "text-amber-600 border-amber-300 hover:bg-amber-50" },
    { value: "cancelled", label: "已取消", color: "text-red-600 border-red-300 hover:bg-red-50" },
  ];

  const batchRollbackMutation = trpc.order.batchRollback.useMutation({
    onSuccess: (res) => {
      utils.order.list.invalidate();
      utils.order.stats.invalidate();
      const msg = res.skipCount > 0
        ? `成功退回 ${res.successCount} 个订单，${res.skipCount} 个不支持退回已跳过`
        : `成功退回 ${res.successCount} 个订单`;
      toast.success(msg);
      setSelectedIds(new Set());
      setBatchRollbackOpen(false);
      setBatchRollbackReason("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!data?.items) return;
    if (selectedIds.size === data.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.items.map(o => o.id)));
    }
  };

  const getDeleteLockReason = useCallback((order: any) => getMergedChildDeleteLockReason(order), []);
  const getRollbackLockReason = useCallback((order: any) => getMergedChildRollbackLockReason(order), []);
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
  const handleDeleteSingle = useCallback((order: any, orderId?: number | null) => {
    const lockReason = getDeleteLockReason(order);
    if (lockReason) {
      toast.error(lockReason);
      return;
    }
    const resolvedId = orderId ?? order?.orderId ?? order?.id;
    if (!resolvedId) return;
    setDeleteTargetId(resolvedId);
  }, [getDeleteLockReason]);

  const confirmDeleteSingle = () => {
    if (deleteTargetId) {
      deleteMutation.mutate({ id: deleteTargetId });
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) {
      toast.error("请先选择要删除的订单");
      return;
    }
    setDeleteConfirmOpen(true);
  };

  const confirmBatchDelete = () => {
    batchDeleteMutation.mutate({ ids: Array.from(selectedIds) });
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* 头部统计卡片 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { label: "全部", value: statsData?.total ?? 0, color: "text-foreground" },
            { label: "待处理", value: statsData?.pendingAssign ?? 0, color: "text-yellow-600" },
            { label: "调度中", value: statsData?.dispatching ?? 0, color: "text-blue-600" },
            { label: "已调度", value: statsData?.inTransit ?? 0, color: "text-green-600" },
            { label: "已送达", value: statsData?.delivered ?? 0, color: "text-emerald-600" },
            { label: "加急", value: statsData?.urgent ?? 0, color: "text-red-600" },
            { label: "今日新增", value: statsData?.todayNew ?? 0, color: "text-purple-600" },
          ].map((item) => (
            <div key={item.label} className="bg-card rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className={`text-xl font-bold mt-0.5 ${item.color}`}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && selectedIds.size > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="text-slate-700 border-slate-300 hover:bg-slate-50">
                  <Settings2 className="h-4 w-4 mr-1" />
                  管理员批量操作 ({selectedIds.size})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[220px]">
                {hasPermission("order.delete") && (
                  <DropdownMenuItem className="text-destructive" onClick={handleBatchDelete}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    批量删除
                  </DropdownMenuItem>
                )}
                {hasPermission("order.rollback") && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="text-orange-600">
                      <Undo2 className="h-4 w-4 mr-2" />
                      批量退回
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => { setBatchRollbackOpen(true); setBatchRollbackReason(""); }}>
                        退回上一步
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {hasPermission("order.update_status") && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="text-purple-600">
                      <ChevronRight className="h-4 w-4 mr-2" />
                      批量状态推进
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-[180px]">
                      {BATCH_STATUS_OPTIONS.map(opt => (
                        <DropdownMenuItem
                          key={opt.value}
                          className={opt.color}
                          onClick={() => { setBatchTargetStatus(opt.value); setBatchStatusOpen(true); }}
                        >
                          {opt.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="flex items-center gap-1 ml-auto">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="搜索订单号/客户/收货人"
                className="pl-8 h-8 w-48 text-sm"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>

            <Select value={businessType} onValueChange={(v) => { setBusinessType(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue placeholder="类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="outsource">外请</SelectItem>
                <SelectItem value="self">自运</SelectItem>
                <SelectItem value="ltl">零担</SelectItem>
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={dispatcherFilter} onValueChange={(v) => { setDispatcherFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue placeholder="调度员" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部调度员</SelectItem>
                {outsourceDispatchers.map((d: any) => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={urgentOnly ? "destructive" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => { setUrgentOnly(!urgentOnly); setPage(1); }}
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              加急
            </Button>

            <Button
              variant={showAdvSearch ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setShowAdvSearch(!showAdvSearch)}
            >
              <SlidersHorizontal className="h-3 w-3 mr-1" />
              高级搜索
              {(advStartDate || advEndDate || advOriginCity || advDestCity || advFreightMin || advFreightMax || advPlateNumber || advCustomerName) && (
                <span className="ml-1 bg-blue-500 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center">
                  {[advStartDate, advEndDate, advOriginCity, advDestCity, advFreightMin, advFreightMax, advPlateNumber, advCustomerName].filter(Boolean).length}
                </span>
              )}
            </Button>

            <Button
              variant={groupByPlan ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setGroupByPlan(!groupByPlan)}
            >
              {groupByPlan ? <Layers className="h-3 w-3 mr-1" /> : <List className="h-3 w-3 mr-1" />}
              {groupByPlan ? "分组" : "列表"}
            </Button>

            <Button variant="outline" size="sm" className="h-8" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  <Settings2 className="h-3 w-3 mr-1" />
                  列配置
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="end">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">显示列</span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600" onClick={resetColumns}>重置默认</Button>
                  </div>
                  <div className="border-t pt-2 space-y-1 max-h-48 overflow-y-auto">
                    {ALL_COLUMNS.map(col => (
                      <label key={col.key} className="flex items-center gap-2 py-0.5 px-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
                        <Checkbox checked={isColVisible(col.key)} onCheckedChange={() => toggleColumn(col.key)} />
                        {col.label}
                      </label>
                    ))}
                  </div>

                  {/* 自定义视图 */}
                  <div className="border-t pt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-muted-foreground">保存的视图</span>
                      <Button variant="ghost" size="sm" className="h-5 text-xs text-green-600" onClick={() => setShowSaveView(!showSaveView)}>
                        <Plus className="h-3 w-3 mr-0.5" />保存当前
                      </Button>
                    </div>
                    {showSaveView && (
                      <div className="flex items-center gap-1 mb-2">
                        <Input
                          placeholder="视图名称..."
                          value={newViewName}
                          onChange={(e) => setNewViewName(e.target.value)}
                          className="h-7 text-xs"
                          onKeyDown={(e) => e.key === "Enter" && saveView()}
                        />
                        <Button size="sm" className="h-7 text-xs px-2" onClick={saveView}>保存</Button>
                      </div>
                    )}
                    {savedViews.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-1">暂无保存的视图</p>
                    ) : (
                      <div className="space-y-0.5 max-h-32 overflow-y-auto">
                        {savedViews.map(v => (
                          <div key={v.id} className={`flex items-center justify-between py-1 px-1.5 rounded text-xs cursor-pointer hover:bg-muted/50 ${activeViewId === v.id ? "bg-blue-50 text-blue-700 border border-blue-200" : ""}`}>
                            <span className="truncate flex-1" onClick={() => loadView(v)}>{v.name}
                              <span className="text-muted-foreground ml-1">({v.columns.length}列)</span>
                            </span>
                            <div className="flex items-center gap-0.5">
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-blue-400 hover:text-blue-600" title="覆盖更新为当前列配置" onClick={(e) => { e.stopPropagation(); updateView(v.id); }}>
                                <RefreshCcw className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400 hover:text-red-600" title="删除视图" onClick={(e) => { e.stopPropagation(); deleteView(v.id); }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
              const items = data?.items;
              if (!items?.length) { toast.error("没有可导出的数据"); return; }
              const headers = ALL_COLUMNS.filter(c => visibleColumns.has(c.key)).map(c => c.label);
              const rows = items.map((o: any) => ALL_COLUMNS.filter(c => visibleColumns.has(c.key)).map(c => {
                switch (c.key) {
                  case "orderNumber": return o.orderNumber || o.systemCode || "";
                  case "businessType": return BUSINESS_TYPE_LABELS[o.businessType] || o.businessType;
                  case "status": return STATUS_LABELS[o.status] || o.status;
                  case "customer": return o.customerName || "";
                  case "cargo": return o.cargoName || "";
                  case "weight": return o.weight || "";
                  case "origin": return o.originCity || "";
                  case "destination": return o.destinationCity || "";
                  case "quotedPrice": return o.quotedPrice || "";
                  case "actualFreight": return o.actualFreight || "";
                  case "plateNumber": return o.plateNumber || "";
                  case "extendedInfo":
                    if (o.businessType === "outsource") return `调度价:${o.dispatchPrice || "-"} 押金:${o.depositStatus === "returned" ? "已退" : o.depositStatus === "not_returned" ? "不退" : "待退"}`;
                    if (o.businessType === "self") return `司机:${o.driverName || "-"} ${o.driverPhone || ""}`;
                    if (o.businessType === "ltl") return `货站:${o.freightStationName || "-"} 运单:${o.freightWaybillNumber || "-"}`;
                    return "";
                  case "shippingNote": return o.shippingNote || "";
                  case "receivingNote": return o.receivingNote || "";
                  case "dispatcher": return o.assignedDispatcherName || "";
                  case "createdAt": return o.createdAt ? new Date(o.createdAt).toLocaleDateString("zh-CN") : "";
                  default: return "";
                }
              }));
              const csv = [headers.join(","), ...rows.map((r: string[]) => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
              const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = `订单池_${new Date().toLocaleDateString("zh-CN")}.csv`; a.click();
              URL.revokeObjectURL(url);
              toast.success(`已导出 ${items.length} 条数据`);
            }} disabled={!data?.items?.length}>
              <Download className="h-3 w-3 mr-1" />导出CSV
            </Button>

            <Button variant="default" size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700" onClick={() => {
              const items = data?.items;
              if (!items?.length) { toast.error("没有可导出的数据"); return; }
              const headers = ALL_COLUMNS.filter(c => visibleColumns.has(c.key)).map(c => c.label);
              const rows = items.map((o: any) => ALL_COLUMNS.filter(c => visibleColumns.has(c.key)).map(c => {
                switch (c.key) {
                  case "orderNumber": return o.orderNumber || o.systemCode || "";
                  case "businessType": return BUSINESS_TYPE_LABELS[o.businessType] || o.businessType;
                  case "status": return STATUS_LABELS[o.status] || o.status;
                  case "customer": return o.customerName || "";
                  case "cargo": return o.cargoName || "";
                  case "weight": return String(o.weight || "");
                  case "origin": return o.originCity || "";
                  case "destination": return o.destinationCity || "";
                  case "quotedPrice": return String(o.quotedPrice || "");
                  case "actualFreight": return String(o.actualFreight || "");
                  case "plateNumber": return o.plateNumber || "";
                  case "extendedInfo":
                    if (o.businessType === "outsource") return `调度价:${o.dispatchPrice || "-"} 押金:${o.depositStatus === "returned" ? "已退" : o.depositStatus === "not_returned" ? "不退" : "待退"}`;
                    if (o.businessType === "self") return `司机:${o.driverName || "-"} ${o.driverPhone || ""}`;
                    if (o.businessType === "ltl") return `货站:${o.freightStationName || "-"} 运单:${o.freightWaybillNumber || "-"}`;
                    return "";
                  case "shippingNote": return o.shippingNote || "";
                  case "receivingNote": return o.receivingNote || "";
                  case "dispatcher": return o.assignedDispatcherName || "";
                  case "createdAt": return o.createdAt ? new Date(o.createdAt).toLocaleDateString("zh-CN") : "";
                  default: return "";
                }
              }));
              const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
              let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n';
              xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
              xml += '<Styles><Style ss:ID="hd"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#E2EFDA" ss:Pattern="Solid"/></Style>';
              xml += '<Style ss:ID="sm"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/></Style></Styles>\n';
              xml += '<Worksheet ss:Name="订单池"><Table>\n<Row>';
              headers.forEach(h => { xml += `<Cell ss:StyleID="hd"><Data ss:Type="String">${esc(h)}</Data></Cell>`; });
              xml += '</Row>\n';
              rows.forEach((row: string[]) => {
                xml += '<Row>';
                row.forEach(cell => {
                  const isNum = /^-?\d+(\.\d+)?$/.test(String(cell || "").trim());
                  xml += `<Cell><Data ss:Type="${isNum ? "Number" : "String"}">${esc(cell)}</Data></Cell>`;
                });
                xml += '</Row>\n';
              });
              xml += '<Row>';
              xml += `<Cell ss:StyleID="sm"><Data ss:Type="String">汇总（共${rows.length}条）</Data></Cell>`;
              for (let i = 1; i < headers.length; i++) xml += '<Cell ss:StyleID="sm"><Data ss:Type="String"></Data></Cell>';
              xml += '</Row>\n';
              // 详细汇总信息
              const totalQuoted = items.reduce((s: number, o: any) => s + parseFloat(o.quotedPrice || "0"), 0);
              const totalActual = items.reduce((s: number, o: any) => s + parseFloat(o.actualFreight || "0"), 0);
              const totalWeight = items.reduce((s: number, o: any) => s + parseFloat(o.weight || "0"), 0);
              const outsourceCount = items.filter((o: any) => o.businessType === "outsource").length;
              const selfCount = items.filter((o: any) => o.businessType === "self").length;
              const ltlCount = items.filter((o: any) => o.businessType === "ltl").length;
              const urgentCount = items.filter((o: any) => o.isUrgent).length;
              const summaryItems = [
                { label: "订单总数", value: String(rows.length) },
                { label: "外请订单", value: String(outsourceCount) },
                { label: "自运订单", value: String(selfCount) },
                { label: "零担订单", value: String(ltlCount) },
                { label: "加急订单", value: String(urgentCount) },
                { label: "总重量(吨)", value: totalWeight.toFixed(2) },
                { label: "运费收入总额", value: `¥${totalQuoted.toFixed(2)}` },
                { label: "司机运费总额", value: `¥${totalActual.toFixed(2)}` },
                { label: "毛利润", value: `¥${(totalQuoted - totalActual).toFixed(2)}` },
              ];
              summaryItems.forEach(item => {
                xml += '<Row>';
                xml += `<Cell ss:StyleID="sm"><Data ss:Type="String">${esc(item.label)}</Data></Cell>`;
                xml += `<Cell ss:StyleID="sm"><Data ss:Type="String">${esc(item.value)}</Data></Cell>`;
                for (let i = 2; i < headers.length; i++) xml += '<Cell><Data ss:Type="String"></Data></Cell>';
                xml += '</Row>\n';
              });
              xml += '</Table></Worksheet></Workbook>';
              const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = `订单池_${new Date().toLocaleDateString("zh-CN")}.xls`; a.click();
              URL.revokeObjectURL(url);
              toast.success(`已导出Excel ${items.length} 条数据`);
            }} disabled={!data?.items?.length}>
              <Download className="h-3 w-3 mr-1" />导出Excel
            </Button>
          </div>
        </div>

        {/* 高级搜索面板 */}
        {showAdvSearch && (
          <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">高级搜索</h4>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => {
                setAdvStartDate(""); setAdvEndDate(""); setAdvOriginCity(""); setAdvDestCity("");
                setAdvFreightMin(""); setAdvFreightMax(""); setAdvPlateNumber(""); setAdvCustomerName("");
                setPage(1);
              }}>清除条件</Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">开始日期</label>
                <Input type="date" className="h-8 text-sm" value={advStartDate} onChange={(e) => { setAdvStartDate(e.target.value); setPage(1); }} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">结束日期</label>
                <Input type="date" className="h-8 text-sm" value={advEndDate} onChange={(e) => { setAdvEndDate(e.target.value); setPage(1); }} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">发货地</label>
                <Input placeholder="输入发货城市" className="h-8 text-sm" value={advOriginCity} onChange={(e) => { setAdvOriginCity(e.target.value); setPage(1); }} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">目的地</label>
                <Input placeholder="输入目的城市" className="h-8 text-sm" value={advDestCity} onChange={(e) => { setAdvDestCity(e.target.value); setPage(1); }} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">运费最低(元)</label>
                <Input type="number" placeholder="最低金额" className="h-8 text-sm" value={advFreightMin} onChange={(e) => { setAdvFreightMin(e.target.value); setPage(1); }} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">运费最高(元)</label>
                <Input type="number" placeholder="最高金额" className="h-8 text-sm" value={advFreightMax} onChange={(e) => { setAdvFreightMax(e.target.value); setPage(1); }} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">车牌号</label>
                <Input placeholder="输入车牌号" className="h-8 text-sm" value={advPlateNumber} onChange={(e) => { setAdvPlateNumber(e.target.value); setPage(1); }} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">客户名称</label>
                <Input placeholder="输入客户名称" className="h-8 text-sm" value={advCustomerName} onChange={(e) => { setAdvCustomerName(e.target.value); setPage(1); }} />
              </div>
            </div>
            {(advStartDate || advEndDate || advOriginCity || advDestCity || advFreightMin || advFreightMax || advPlateNumber || advCustomerName) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground">当前条件：</span>
                {advStartDate && <Badge variant="secondary" className="text-xs">从 {advStartDate}</Badge>}
                {advEndDate && <Badge variant="secondary" className="text-xs">到 {advEndDate}</Badge>}
                {advOriginCity && <Badge variant="secondary" className="text-xs">发货:{advOriginCity}</Badge>}
                {advDestCity && <Badge variant="secondary" className="text-xs">目的:{advDestCity}</Badge>}
                {advFreightMin && <Badge variant="secondary" className="text-xs">运费≥{advFreightMin}</Badge>}
                {advFreightMax && <Badge variant="secondary" className="text-xs">运费≤{advFreightMax}</Badge>}
                {advPlateNumber && <Badge variant="secondary" className="text-xs">车牌:{advPlateNumber}</Badge>}
                {advCustomerName && <Badge variant="secondary" className="text-xs">客户:{advCustomerName}</Badge>}
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900">
          <div className="font-medium">订单池为公共视图，不代表唯一归属工位。</div>
          <div className="mt-1 text-sky-800">
            列表中已同时展示订单当前主状态、主归属工作台与公共池展示原因；如需继续处理，请优先使用“跳转到所属工作台”进入正式责任工位。
          </div>
        </div>

        {/* 订单表格 */}
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-8 text-center">
                  <Checkbox
                    checked={data?.items?.length ? selectedIds.size === data.items.length : false}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-8 text-center">#</TableHead>
                {isColVisible("orderNumber") && <TableHead className="w-32">客户订单号</TableHead>}
                {isColVisible("businessType") && <TableHead className="w-16 text-center">类型</TableHead>}
                {isColVisible("status") && <TableHead className="w-16 text-center">状态</TableHead>}
                {isColVisible("customer") && <TableHead>客户</TableHead>}
                {isColVisible("cargo") && <TableHead>货物</TableHead>}
                {isColVisible("weight") && <TableHead className="w-16 text-right">重量</TableHead>}
                {isColVisible("origin") && <TableHead>发货地</TableHead>}
                {isColVisible("destination") && <TableHead>目的地</TableHead>}
                {isColVisible("quotedPrice") && <TableHead className="w-20 text-right">运费收入</TableHead>}
                {isColVisible("actualFreight") && <TableHead className="w-20 text-right">司机运费</TableHead>}
                {isColVisible("plateNumber") && <TableHead className="w-20">车牌号</TableHead>}
                {isColVisible("extendedInfo") && <TableHead className="w-28">扩展信息</TableHead>}
                {isColVisible("shippingNote") && <TableHead className="w-28">📦 发货备注</TableHead>}
                {isColVisible("receivingNote") && <TableHead className="w-28">📌 收货备注</TableHead>}
                {isColVisible("dispatcher") && <TableHead className="w-20">调度员</TableHead>}
                {isColVisible("createdAt") && <TableHead className="w-28">创建时间</TableHead>}
                <TableHead className="w-10 text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={visibleColCount} className="text-center py-12 text-muted-foreground">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : !data?.items?.length ? (
                <TableRow>
                  <TableCell colSpan={visibleColCount} className="text-center py-12 text-muted-foreground">
                    暂无订单数据
                  </TableCell>
                </TableRow>
              ) : groupByPlan && groupedData ? (
                <>
                  {/* 分组视图：有合并计划号的订单分组显示 */}
                  {Array.from(groupedData.groups.entries()).map(([planNumber, groupOrders]) => {
                    const isExpanded = expandedGroups.has(planNumber);
                    const totalWeight = groupOrders.reduce((sum, o) => sum + parseFloat(o.weight || "0"), 0);
                    const totalCustomerPrice = groupOrders.reduce((sum, o) => sum + parseFloat(o.customerPrice || "0"), 0);
                    const totalFreight = groupOrders.reduce((sum, o) => sum + parseFloat(o.actualFreight || "0"), 0);
                    const totalQuotedPrice = groupOrders.reduce((sum, o) => sum + parseFloat(o.quotedPrice || "0"), 0);
                    // 汇总目的地（去重）
                    const destinations = Array.from(new Set(groupOrders.map(o => o.destinationCity).filter(Boolean)));
                    // 汇总状态分布
                    const statusCounts: Record<string, number> = {};
                    groupOrders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
                    return (
                      <React.Fragment key={planNumber}>
                        <MergedPlanGroupHeader
                          groupKey={planNumber}
                          groupLabel={planNumber}
                          groupTypeLabel="组合标识"
                          groupModeLabel="订单池汇总"
                          orders={groupOrders}
                          isExpanded={isExpanded}
                          onToggle={() => toggleGroup(planNumber)}
                          totalColumns={visibleColCount}
                          leadingCellCount={1}
                          leadingCells={(
                            <TableCell className="text-center align-top" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                              <Checkbox
                                checked={groupOrders.every(o => selectedIds.has(o.id))}
                                onCheckedChange={() => {
                                  const allSelected = groupOrders.every(o => selectedIds.has(o.id));
                                  setSelectedIds(prev => {
                                    const next = new Set(prev);
                                    groupOrders.forEach(o => allSelected ? next.delete(o.id) : next.add(o.id));
                                    return next;
                                  });
                                }}
                              />
                            </TableCell>
                          )}
                          keyTimeLabel="最近建单"
                          keyTimeValue={groupOrders[0]?.createdAt ? new Date(groupOrders[0].createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                          summaryFields={[
                            { label: "主单号", value: groupOrders[0]?.orderNumber || "-" },
                            { label: "子单数", value: `${groupOrders.length} 单` },
                            {
                              label: "加急统计",
                              value: groupOrders.every(o => o.isUrgent)
                                ? "全组加急"
                                : groupOrders.some(o => o.isUrgent)
                                  ? `含加急 ${groupOrders.filter(o => o.isUrgent).length} 单`
                                  : "普通优先级",
                              className: groupOrders.some(o => o.isUrgent) ? "text-red-700" : undefined,
                            },
                            {
                              label: "目的地统计",
                              value: destinations.length <= 2 ? (destinations.join("、") || "-") : `${destinations[0]}等${destinations.length}地`,
                            },
                            { label: "总重量", value: `${totalWeight.toFixed(3)}t`, emphasize: true },
                            {
                              label: "当前阶段",
                              value: (
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(statusCounts).map(([st, cnt]) => (
                                    <Badge key={st} className={`text-[9px] px-1 py-0 ${STATUS_COLORS[st] || "bg-gray-100 text-gray-600"}`}>
                                      {STATUS_LABELS[st] || st}{cnt > 1 ? `×${cnt}` : ""}
                                    </Badge>
                                  ))}
                                </div>
                              ),
                            },
                            {
                              label: "关键时间",
                              value: groupOrders[0]?.createdAt ? new Date(groupOrders[0].createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-",
                            },
                          ]}
                          subtitle={(
                            <div className="space-y-1">
                              <div>{groupOrders[0]?.originCity || "-"} → {destinations.length <= 2 ? destinations.join("、") : `${destinations[0]}等${destinations.length}地`}</div>
                              <div>客户：{groupOrders[0]?.customerName || "-"}；货物：{groupOrders.map(o => o.cargoName).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join("/") || "-"}</div>
                            </div>
                          )}
                          secondaryContent={(
                            <div className="grid gap-3 md:grid-cols-3 text-xs text-muted-foreground">
                              <div>总客户价：<span className="font-medium text-green-700">{totalCustomerPrice > 0 ? `¥${totalCustomerPrice.toFixed(0)}` : (totalQuotedPrice > 0 ? `¥${totalQuotedPrice.toFixed(0)}` : "-")}</span></div>
                              <div>总调度价：<span className="font-medium text-orange-700">{totalFreight > 0 ? `¥${totalFreight.toFixed(0)}` : "-"}</span></div>
                              <div>负责人：{groupOrders[0]?.dispatcherName || "-"}</div>
                            </div>
                          )}
                          mainAction={(
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setDetailId(groupOrders[0]?.id ?? null); setDetailOpen(true); }}>
                              <Eye className="mr-1 h-3.5 w-3.5" />查看主单
                            </Button>
                          )}
                        />
                        {/* 分组子订单 */}
                        {isExpanded && groupOrders.map((order) => (
                          <TableRow
                            key={order.id}
                            className={`
                              ${order.isUrgent ? "bg-red-50/50 hover:bg-red-100/50" : "bg-blue-50/30 hover:bg-blue-50/60"}
                              cursor-pointer transition-colors border-l-2 border-l-blue-200
                            `}
                            onClick={() => { setDetailId(order.id); setDetailOpen(true); }}
                          >
                            <TableCell className="text-center" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                              <Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} />
                            </TableCell>
                            <TableCell className="text-center text-xs text-muted-foreground pl-6">└</TableCell>
                            {renderOrderCells(order)}
                          </TableRow>
                        ))}
                      </React.Fragment>
                    );
                  })}
                  {/* 未分组的订单 */}
                  {groupedData.ungrouped.map((order) => (
                    <TableRow
                      key={order.id}
                      className={`
                        ${order.isUrgent ? "bg-red-50 hover:bg-red-100/80 border-l-2 border-l-red-500" : "hover:bg-muted/30"}
                        cursor-pointer transition-colors
                      `}
                      onClick={() => { setDetailId(order.id); setDetailOpen(true); }}
                    >
                      <TableCell className="text-center" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} />
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">·</TableCell>
                      {renderOrderCells(order)}
                    </TableRow>
                  ))}
                </>
              ) : (
                data.items.map((order, idx) => {
                  const planNum = order.mergedPlanNumber;
                  const planColor = planNum ? planColorMap.get(planNum) : null;
                  const planGroup = planNum ? planNumberIndex.get(planNum) : null;
                  const isFirstInGroup = planGroup ? planGroup[0] === idx : false;
                  const groupSize = planGroup ? planGroup.length : 0;
                  return (
                    <TableRow
                      key={order.id}
                      className={`
                        ${order.isUrgent ? "bg-red-50 hover:bg-red-100/80 border-l-2 border-l-red-500" : planColor ? `${planColor.bg} border-l-2 ${planColor.border} hover:bg-opacity-80` : "hover:bg-muted/30"}
                        cursor-pointer transition-colors
                      `}
                      onClick={() => { setDetailId(order.id); setDetailOpen(true); }}
                    >
                      <TableCell className="text-center" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} />
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {(page - 1) * pageSize + idx + 1}
                      </TableCell>
                      {isColVisible("orderNumber") && <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-1">
                          {order.isUrgent && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                          <span>{order.orderNumber || "-"}</span>
                          {planNum && isFirstInGroup && groupSize > 1 && (
                            <Badge variant="outline" className={`text-[9px] px-1 py-0 ml-1 ${planColor?.badge || ""}`}>
                              <Layers className="h-2.5 w-2.5 mr-0.5" />
                              {planNum} ({groupSize}单)
                            </Badge>
                          )}
                          {planNum && !isFirstInGroup && groupSize > 1 && (
                            <span className={`text-[9px] ${planColor?.text || "text-blue-600"}`}>┗ {planNum}</span>
                          )}
                        </div>
                      </TableCell>}
                      {isColVisible("businessType") && <TableCell className="text-center">
                        <Badge variant="outline" className={`text-[10px] px-1.5 ${BUSINESS_TYPE_COLORS[order.businessType] || ""}`}>
                          {BUSINESS_TYPE_LABELS[order.businessType] || order.businessType}
                        </Badge>
                      </TableCell>}
                      {isColVisible("status") && <TableCell className="text-center">
                        <Badge className={`text-[10px] px-1.5 ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-800"}`}>
                          {STATUS_LABELS[order.status] || order.status}
                        </Badge>
                      </TableCell>}
                      {isColVisible("customer") && <TableCell className="text-sm truncate max-w-[120px]" title={order.customerName || ""}>
                        {order.customerName || "-"}
                      </TableCell>}
                      {isColVisible("cargo") && <TableCell className="text-sm truncate max-w-[100px]" title={order.cargoName || ""}>
                        {order.cargoName || "-"}
                      </TableCell>}
                      {isColVisible("weight") && <TableCell className="text-right text-sm">
                        {order.weight ? `${order.weight}t` : "-"}
                      </TableCell>}
                      {isColVisible("origin") && <TableCell className="text-sm">{order.originCity || "-"}</TableCell>}
                      {isColVisible("destination") && <TableCell className="text-sm font-medium">{order.destinationCity || "-"}</TableCell>}
                      {isColVisible("quotedPrice") && <TableCell className="text-right text-sm">{formatMoney(order.quotedPrice)}</TableCell>}
                      {isColVisible("actualFreight") && <TableCell className="text-right text-sm">{formatMoney(order.actualFreight)}</TableCell>}
                      {isColVisible("plateNumber") && <TableCell className="text-sm">{order.plateNumber || "-"}</TableCell>}
                      {isColVisible("extendedInfo") && <TableCell className="text-xs">
                        {order.businessType === "outsource" && (
                          <div className="space-y-0.5">
                            {order.dispatchPrice && <div>调度价: {formatMoney(order.dispatchPrice)}</div>}
                            {order.depositAmount && <div>押金: {formatMoney(order.depositAmount)} <span className={order.depositStatus === "paid" ? "text-green-600" : order.depositStatus === "refunded" ? "text-blue-600" : "text-muted-foreground"}>({order.depositStatus === "paid" ? "已付" : order.depositStatus === "refunded" ? "已退" : order.depositStatus === "not_refundable" ? "不退" : "无"})</span></div>}
                            {order.driverName && <div>司机: {order.driverName}{order.driverPhone ? ` ${order.driverPhone}` : ""}</div>}
                            {!order.dispatchPrice && !order.depositAmount && !order.driverName && <span className="text-muted-foreground">-</span>}
                          </div>
                        )}
                        {order.businessType === "self" && (
                          <div className="space-y-0.5">
                            {order.driverName && <div>司机: {order.driverName}</div>}
                            {order.driverPhone && <div>电话: {order.driverPhone}</div>}
                            {order.deliveryFee && <div>送货费: {formatMoney(order.deliveryFee)}</div>}
                            {!order.driverName && !order.driverPhone && <span className="text-muted-foreground">-</span>}
                          </div>
                        )}
                        {order.businessType === "ltl" && (
                          <div className="space-y-0.5">
                            {order.freightStationName && <div className="text-blue-600">{order.freightStationName}</div>}
                            {order.freightWaybillNumber && <div>运单号: {order.freightWaybillNumber}</div>}
                            {order.inquiryPhone && <div>查货: {order.inquiryPhone}</div>}
                            {order.ltlUnitPrice && <div>单价: ¥{order.ltlUnitPrice}/吨</div>}
                            {!order.freightStationName && !order.freightWaybillNumber && <span className="text-muted-foreground">-</span>}
                          </div>
                        )}
                      </TableCell>}
                      {isColVisible("shippingNote") && <TableCell className="text-xs max-w-[120px]">
                        <div className="truncate" title={(order as any).shippingNote || order.remarks || ""}>
                          {(order as any).shippingNote || order.remarks || <span className="text-muted-foreground">-</span>}
                        </div>
                      </TableCell>}
                      {isColVisible("receivingNote") && <TableCell className="text-xs max-w-[120px]">
                        <div className="truncate" title={(order as any).receivingNote || ""}>
                          {(order as any).receivingNote || <span className="text-muted-foreground">-</span>}
                        </div>
                      </TableCell>}
                      {isColVisible("dispatcher") && <TableCell className="text-sm text-muted-foreground">
        <div className="space-y-1">
          <div className="font-medium text-foreground">主归属工作台：{getOrderWorkbenchMeta(order).label}</div>
          <div className="text-[11px] text-muted-foreground">责任显示：{getOrderOwnerLabel(order)}</div>
        </div>
      </TableCell>}
                      {isColVisible("createdAt") && <TableCell className="text-xs text-muted-foreground">
                        {order.createdAt ? new Date(order.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                      </TableCell>}
                      <TableCell className="text-center" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[180px]">
                            <DropdownMenuItem onClick={() => { setDetailId(order.id); setDetailOpen(true); }}>
                              <Eye className="h-4 w-4 mr-2" />
                              查看详情
                            </DropdownMenuItem>
                            {hasPermission(["order.create", "order.edit"]) && (
                              <DropdownMenuItem onClick={() => setLocation(`/orders/edit/${order.id}?from=${encodeURIComponent(getWorkspaceRoute(order))}`)}>
                                <Edit2 className="h-4 w-4 mr-2" />
                                编辑
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => navigateToOrderWorkspace(order)}>
                              <Layers className="h-4 w-4 mr-2" />
                              跳转到所属工作台
                            </DropdownMenuItem>
                            {(hasPermission("order.rollback") || hasPermission("order.delete")) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>
                                    <Settings2 className="h-4 w-4 mr-2" />
                                    高级操作
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    {hasPermission("order.rollback") && !["pending_assign", "cancelled"].includes(order.status) && (
                                      <DropdownMenuItem
                                        className="text-orange-600"
                                        onClick={() => openRollbackDialog(order)}
                                        disabled={Boolean(getRollbackLockReason(order))}
                                        title={getRollbackLockReason(order) || "退回上一步"}
                                      >
                                        <Undo2 className="h-4 w-4 mr-2" />
                                        退回上一步
                                      </DropdownMenuItem>
                                    )}
                                    {hasPermission("order.delete") && (
                                      <DropdownMenuItem
                                        className="text-destructive"
                                        onClick={() => handleDeleteSingle(order)}
                                        disabled={Boolean(getDeleteLockReason(order))}
                                        title={getDeleteLockReason(order) || "删除"}
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        删除
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* 分页 */}
        <TablePagination total={data?.total ?? 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </div>

      {/* 订单详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              订单详情
              {orderDetail?.isUrgent && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  加急
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {orderDetail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">客户订单号：</span>
                  <span className="font-mono font-medium">{orderDetail.orderNumber || "-"}</span>
                </div>
                {orderDetail.mergedPlanNumber && (
                  <div>
                    <span className="text-muted-foreground">合并计划号：</span>
                    <span className="font-mono text-blue-600">{orderDetail.mergedPlanNumber}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">业务类型：</span>
                  <Badge variant="outline" className={BUSINESS_TYPE_COLORS[orderDetail.businessType]}>
                    {BUSINESS_TYPE_LABELS[orderDetail.businessType]}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">状态：</span>
                  <Badge className={STATUS_COLORS[orderDetail.status]}>
                    {STATUS_LABELS[orderDetail.status]}
                  </Badge>
                </div>
              </div>

              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-2">客户信息</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">客户：</span>{orderDetail.customerName || "-"}</div>
                  <div><span className="text-muted-foreground">电话：</span>{orderDetail.customerPhone || "-"}</div>
                  <div><span className="text-muted-foreground">部门：</span>{orderDetail.department || "-"}</div>
                  <div><span className="text-muted-foreground">结算：</span>{orderDetail.settlementType === "monthly" ? "月结" : orderDetail.settlementType === "cash" ? "现付" : "到付"}</div>
                </div>
              </div>

              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-2">货物信息</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">货物：</span>{orderDetail.cargoName || "-"}</div>
                  <div><span className="text-muted-foreground">重量：</span>{orderDetail.weight ? `${orderDetail.weight}吨` : "-"}</div>
                  <div><span className="text-muted-foreground">包装：</span>{orderDetail.packagingType === "pallet" ? "托盘" : orderDetail.packagingType === "loose" ? "散装" : "带板装"}</div>
                  <div><span className="text-muted-foreground">规格：</span>{orderDetail.cargoSpec || "-"}</div>
                </div>
                {orderDetail.specialRequirements && (
                  <div className="text-sm mt-1">
                    <span className="text-muted-foreground">特殊要求：</span>{orderDetail.specialRequirements}
                  </div>
                )}
              </div>

              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-2">运输信息</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">发货地：</span>{orderDetail.originCity || "-"} {orderDetail.warehouseName ? `(${orderDetail.warehouseName})` : ""}</div>
                  <div><span className="text-muted-foreground">目的地：</span>{orderDetail.destinationCity || "-"}</div>
                  <div><span className="text-muted-foreground">收货人：</span>{orderDetail.receiverName || "-"}</div>
                  <div><span className="text-muted-foreground">收货电话：</span>{orderDetail.receiverPhone || "-"}</div>
                  <div className="col-span-2"><span className="text-muted-foreground">收货地址：</span>{orderDetail.deliveryAddress || "-"}</div>
                </div>
              </div>

              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-2">费用信息</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">运费收入：</span>{formatMoney(orderDetail.customerPrice)}</div>
                  <div><span className="text-muted-foreground">报价单价：</span>{formatMoney(orderDetail.quotedPrice)}</div>
                  <div><span className="text-muted-foreground">调度价：</span>{formatMoney(orderDetail.dispatchPrice)}</div>
                  <div><span className="text-muted-foreground">司机运费：</span>{formatMoney(orderDetail.actualFreight)}</div>
                  <div><span className="text-muted-foreground">送货费：</span>{formatMoney(orderDetail.deliveryFee)}</div>
                  <div><span className="text-muted-foreground">附加费：</span>{formatMoney(orderDetail.extraFee)}</div>
                  <div><span className="text-muted-foreground font-medium">总费用：</span><span className="font-medium">{formatMoney(orderDetail.totalCost)}</span></div>
                </div>
              </div>

              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-2">调度信息</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">车牌号：</span>{orderDetail.plateNumber || "-"}</div>
                  <div><span className="text-muted-foreground">司机：</span>{orderDetail.driverName || "-"} {orderDetail.driverPhone ? `(${orderDetail.driverPhone})` : ""}</div>
                  <div><span className="text-muted-foreground">货站：</span>{orderDetail.freightStationName || "-"}</div>
                  <div><span className="text-muted-foreground">自动分派区域：</span>{orderDetail.autoAssignedRegion || "-"}</div>
                  <div><span className="text-muted-foreground">调度员：</span>{(orderDetail as any).dispatcherName || "-"}</div>
                </div>
              </div>

              <div className="border-t pt-3 space-y-2">
                <div>
                  <h4 className="text-sm font-medium mb-1">📦 发货备注</h4>
                  <InlineEdit
                    value={(orderDetail as any).shippingNote || orderDetail.remarks || ""}
                    placeholder="点击添加发货备注（货物规格、多少托/板等）"
                    onSave={(val) => updateOrderFields.mutate({ id: orderDetail.id, shippingNote: val })}
                    multiline
                  />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-orange-800 mb-1">📌 收货备注</h4>
                  <InlineEdit
                    value={(orderDetail as any).receivingNote || ""}
                    placeholder="点击添加收货备注（卸货时间、联系人等）"
                    onSave={(val) => updateOrderFields.mutate({ id: orderDetail.id, receivingNote: val })}
                    highlight
                    multiline
                  />
                </div>
              </div>

              {/* 时间线 */}
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-2">⏱ 时间线</h4>
                <div className="space-y-1 text-xs">
                  {[
                    { label: "下单日期", date: orderDetail.orderDate },
                    { label: "录入时间", date: orderDetail.createdAt },
                    { label: "派车日期", date: orderDetail.dispatchDate },
                    { label: "审批日期", date: (orderDetail as any).approvalDate },
                    { label: "发车日期", date: (orderDetail as any).transitDate },
                    { label: "送货日期", date: orderDetail.deliveryDate },
                    { label: "签收日期", date: (orderDetail as any).signedDate },
                    { label: "退押日期", date: (orderDetail as any).depositRefundDate },
                  ].filter(item => item.date).map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                      <span className="text-muted-foreground w-16">{item.label}</span>
                      <span>{fmtFull(item.date)}</span>
                    </div>
                  ))}
                  {![orderDetail.orderDate, orderDetail.createdAt, orderDetail.dispatchDate, (orderDetail as any).approvalDate, (orderDetail as any).transitDate, orderDetail.deliveryDate, (orderDetail as any).signedDate, (orderDetail as any).depositRefundDate].some(Boolean) && (
                    <div className="text-muted-foreground">暂无时间记录</div>
                  )}
                </div>
              </div>

              {/* 审批对话记录 */}
              <div className="border-t pt-3">
                <ApprovalHistory orderId={orderDetail.id} />
              </div>

              {/* 状态推进按钮 */}
              {hasPermission("order.update_status") && ["dispatched", "in_transit", "delivered"].includes(orderDetail.status) && (
                <div className="border-t pt-3 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">状态推进：</span>
                  {(orderDetail.status === "dispatched" || orderDetail.status === "in_transit") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 border-green-300 hover:bg-green-50"
                      disabled={updateStatusMutation.isPending}
                      onClick={() => {
                        updateStatusMutation.mutate({ id: orderDetail.id, status: "delivered" });
                        setDetailOpen(false);
                      }}
                    >
                      <Truck className="h-4 w-4 mr-1" />
                      标记已送达
                    </Button>
                  )}
                  {orderDetail.status === "delivered" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                      disabled={updateStatusMutation.isPending}
                      onClick={() => {
                        updateStatusMutation.mutate({ id: orderDetail.id, status: "signed" });
                        setDetailOpen(false);
                      }}
                    >
                      <Truck className="h-4 w-4 mr-1" />
                      标记已签收
                    </Button>
                  )}
                </div>
              )}

              <div className="border-t pt-3 text-xs text-muted-foreground">
                创建时间：{orderDetail.createdAt ? new Date(orderDetail.createdAt).toLocaleString("zh-CN") : "-"}
                {" \u00b7 "}
                更新时间：{orderDetail.updatedAt ? new Date(orderDetail.updatedAt).toLocaleString("zh-CN") : "-"}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">加载中...</div>
          )}
        </DialogContent>
      </Dialog>

      {/* 单条删除确认 */}
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
              onClick={confirmDeleteSingle}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量删除确认 */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除选中的 {selectedIds.size} 个订单吗？删除后不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmBatchDelete}
              disabled={batchDeleteMutation.isPending}
            >
              {batchDeleteMutation.isPending ? "删除中..." : `确认删除 ${selectedIds.size} 个`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
            <p className="text-sm text-muted-foreground">
              已选择 <span className="font-medium text-foreground">{selectedIds.size}</span> 个订单，将全部退回到上一个流程节点。不支持退回的订单将自动跳过。
            </p>
            <div>
              <Label>退回原因 *</Label>
              <Textarea
                value={batchRollbackReason}
                onChange={(e) => setBatchRollbackReason(e.target.value)}
                placeholder="请说明批量退回原因，如：价格有误需重新定价、车辆信息填写错误等"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setBatchRollbackOpen(false); setBatchRollbackReason(""); }}>
                取消
              </Button>
              <Button
                className="bg-orange-500 hover:bg-orange-600 text-white"
                disabled={!batchRollbackReason.trim() || batchRollbackMutation.isPending}
                onClick={() => {
                  if (batchRollbackReason.trim()) {
                    batchRollbackMutation.mutate({ ids: Array.from(selectedIds), reason: batchRollbackReason.trim() });
                  }
                }}
              >
                {batchRollbackMutation.isPending ? "退回中..." : `确认退回 ${selectedIds.size} 个`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 批量状态推进确认弹窗 */}
      <AlertDialog open={batchStatusOpen} onOpenChange={setBatchStatusOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量状态推进</AlertDialogTitle>
            <AlertDialogDescription>
              确定要将选中的 <span className="font-bold text-foreground">{selectedIds.size}</span> 个订单推进到
              <span className="font-bold text-foreground">「{BATCH_STATUS_OPTIONS.find(o => o.value === batchTargetStatus)?.label || batchTargetStatus}」</span>状态吗？
              不符合状态转换规则的订单将自动跳过。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={batchStatusMutation.isPending}
              onClick={() => {
                batchStatusMutation.mutate({
                  orderIds: Array.from(selectedIds),
                  status: batchTargetStatus,
                });
              }}
            >
              {batchStatusMutation.isPending ? "推进中..." : `确认推进 ${selectedIds.size} 个`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 退回确认弹窗（增强版：支持指定目标状态） */}
      <Dialog open={rollbackTargetId !== null} onOpenChange={(open) => { if (!open) { setRollbackTargetId(null); setRollbackReason(""); setRevertTargetStatus("pending_assign"); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-orange-500" />
              退回订单
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              订单将被退回到指定状态，派车信息、押金和回单将被自动清理。
            </p>
            <div>
              <Label>退回目标状态 *</Label>
              <Select value={revertTargetStatus} onValueChange={setRevertTargetStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_assign">待指派</SelectItem>
                  <SelectItem value="pending_price">待定价</SelectItem>
                  <SelectItem value="priced">已定价</SelectItem>
                  <SelectItem value="pending_vehicle">待找车</SelectItem>
                  <SelectItem value="pending_dispatch">待派车</SelectItem>
                  <SelectItem value="pending_inquiry">待询价</SelectItem>
                  <SelectItem value="dispatched">已调度</SelectItem>
                  <SelectItem value="delivered">已送达</SelectItem>
                  <SelectItem value="on_hold">等通知</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>退回原因 *</Label>
              <Textarea
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                placeholder="请说明退回原因，如：价格有误需重新定价、车辆信息填写错误等"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setRollbackTargetId(null); setRollbackReason(""); setRevertTargetStatus("pending_assign"); }}>
                取消
              </Button>
              <Button
                className="bg-orange-500 hover:bg-orange-600 text-white"
                disabled={!rollbackReason.trim() || revertMutation.isPending}
                onClick={() => {
                  if (rollbackTargetId && rollbackReason.trim()) {
                    revertMutation.mutate({ id: rollbackTargetId, targetStatus: revertTargetStatus, reason: rollbackReason.trim() });
                  }
                }}
              >
                {revertMutation.isPending ? "退回中..." : "确认退回"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 指派/重新指派调度员弹窗 */}
      <Dialog open={!!reassignDialog} onOpenChange={(open) => { if (!open) { setReassignDialog(null); setReassignDispatcherId(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-500" />
              {reassignDialog?.assignedDispatcherId ? "重新指派调度" : "指派调度员"}
            </DialogTitle>
          </DialogHeader>
          {reassignDialog && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">订单号</span>
                  <span className="font-medium">{reassignDialog.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">路线</span>
                  <span>{reassignDialog.originCity} → {reassignDialog.destinationCity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">当前状态</span>
                  <Badge className={STATUS_COLORS[reassignDialog.status] || ""}>{STATUS_LABELS[reassignDialog.status] || reassignDialog.status}</Badge>
                </div>
                {reassignDialog.dispatcherName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">当前调度员</span>
                    <span className="text-orange-600 font-medium">{reassignDialog.dispatcherName}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>{reassignDialog.assignedDispatcherId ? "选择新调度员 *" : "选择调度员 *"}</Label>
                <Select value={reassignDispatcherId} onValueChange={setReassignDispatcherId}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择调度员" />
                  </SelectTrigger>
                  <SelectContent>
                    {outsourceDispatchers.map((d: any) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name || d.username}
                        {d.id === reassignDialog.assignedDispatcherId && " (当前)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {reassignDialog.assignedDispatcherId && (
                  <p className="text-xs text-muted-foreground">重新指派后订单将回到“待找车”状态</p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setReassignDialog(null); setReassignDispatcherId(""); }}>取消</Button>
                <Button
                  disabled={!reassignDispatcherId || reassignMutation.isPending || Number(reassignDispatcherId) === reassignDialog.assignedDispatcherId}
                  onClick={() => {
                    if (reassignDialog && reassignDispatcherId) {
                      if (reassignDialog.assignedDispatcherId) {
                        reassignMutation.mutate({ orderId: reassignDialog.id, dispatcherId: Number(reassignDispatcherId) });
                      } else {
                        assignMutation.mutate({ orderId: reassignDialog.id, dispatcherId: Number(reassignDispatcherId) });
                      }
                    }
                  }}
                >
                  {(reassignMutation.isPending || assignMutation?.isPending) ? "分配中..." : (reassignDialog.assignedDispatcherId ? "确认重新指派" : "确认指派")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


    </DashboardLayout>
  );
}
