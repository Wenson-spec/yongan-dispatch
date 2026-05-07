import DashboardLayout from "@/components/DashboardLayout";
import React from "react";
import { trpc } from "@/lib/trpc";
import { formatMoney, groupOrdersByPlan, type OrderGroup } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Truck, RefreshCw, ArrowRight, AlertTriangle, CheckCircle2, Trash2, Undo2, Loader2,
  ChevronDown, ChevronRight, Layers, MoreHorizontal,
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Textarea } from "@/components/ui/textarea";
import PlateAutocomplete from "@/components/PlateAutocomplete";
import DriverInfoPaste from "@/components/DriverInfoPaste";
import { TablePagination } from "@/components/TablePagination";
import { useTableSort, SortableHeader } from "@/components/SortableTable";
import { getMergedChildDeleteLockReason, getMergedChildRollbackLockReason } from "@/lib/commandGroupRules";

type DangerActionMenuProps = {
  onRollback?: () => void;
  rollbackDisabled?: boolean;
  rollbackLabel?: string;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  deleteLabel?: string;
  triggerLabel?: string;
  triggerClassName?: string;
};

function DangerActionMenu({
  onRollback,
  rollbackDisabled = false,
  rollbackLabel = "退回上一步",
  onDelete,
  deleteDisabled = false,
  deleteLabel = "删除订单",
  triggerLabel,
  triggerClassName,
}: DangerActionMenuProps) {
  if (!onRollback && !onDelete) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className={triggerClassName || (triggerLabel
            ? "h-7 border border-orange-300 px-2 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
            : "h-7 w-7 p-0 text-muted-foreground hover:text-foreground")}
        >
          <MoreHorizontal className={triggerLabel ? "mr-1 h-4 w-4" : "h-3.5 w-3.5"} />
          {triggerLabel || null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onRollback && (
          <DropdownMenuItem onClick={onRollback} disabled={rollbackDisabled}>
            <Undo2 className="mr-2 h-3.5 w-3.5 text-orange-600" />
            {rollbackLabel}
          </DropdownMenuItem>
        )}
        {onDelete && (
          <DropdownMenuItem onClick={onDelete} disabled={deleteDisabled}>
            <Trash2 className="mr-2 h-3.5 w-3.5 text-red-600" />
            {deleteLabel}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 车队调度员 / 现场管理员 派车台
 * 核心流程：待派车（自运订单 pending_dispatch）→ 选择自营车辆 → 整组派车
 * 自运内部整理参考批次的分组展示与批量操作
 */
export default function DispatchVehicle() {
  const { hasPermission } = usePermissions();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("pending");
  // 派车弹窗：存储整组订单
  const [dispatchGroup, setDispatchGroup] = useState<OrderGroup | null>(null);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [dispatcherRemark, setDispatcherRemark] = useState("");
  // 展开/收起状态
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  // 分页状态
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState(100);
  const [dispatchedPage, setDispatchedPage] = useState(1);
  const [dispatchedPageSize, setDispatchedPageSize] = useState(100);
  const [transitPage, setTransitPage] = useState(1);
  const [transitPageSize, setTransitPageSize] = useState(100);
  const [deliveredPage, setDeliveredPage] = useState(1);
  const [deliveredPageSize, setDeliveredPageSize] = useState(100);
  const [signedPage, setSignedPage] = useState(1);
  const [signedPageSize, setSignedPageSize] = useState(100);

  // 待派车：自运订单 pending_dispatch 状态
  const { data: pendingData, refetch: refetchPending } = trpc.order.list.useQuery(
    { status: "pending_dispatch", businessType: "self", pageSize: 100 },
    { refetchInterval: 10000 }
  );

  // 已派车
  const { data: dispatchedData, refetch: refetchDispatched } = trpc.order.list.useQuery(
    { status: "dispatched", businessType: "self", pageSize: 100 },
    { refetchInterval: 15000 }
  );

  // 运输中（兼容历史数据）
  const { data: transitData, refetch: refetchTransit } = trpc.order.list.useQuery(
    { status: "in_transit", businessType: "self", pageSize: 100 },
    { refetchInterval: 15000 }
  );

  // 已送达
  const { data: deliveredData, refetch: refetchDelivered } = trpc.order.list.useQuery(
    { status: "delivered", businessType: "self", pageSize: 100 },
    { refetchInterval: 15000 }
  );

  // 已签收
  const { data: signedData, refetch: refetchSigned } = trpc.order.list.useQuery(
    { status: "signed", businessType: "self", pageSize: 100 },
    { refetchInterval: 15000 }
  );

  // 车辆列表（自营车辆）
  const { data: vehicleList } = trpc.vehicle.list.useQuery({ activeOnly: true });

  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [rollbackTargetId, setRollbackTargetId] = useState<number | null>(null);
  const [rollbackReason, setRollbackReason] = useState("");
  const [revertTargetStatus, setRevertTargetStatus] = useState("pending_dispatch");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchRollbackOpen, setBatchRollbackOpen] = useState(false);
  const [batchRollbackReason, setBatchRollbackReason] = useState("");
  // 批量派车弹窗状态
  const [batchDispatchOpen, setBatchDispatchOpen] = useState(false);
  const [batchVehiclePlate, setBatchVehiclePlate] = useState("");
  const [batchDriverName, setBatchDriverName] = useState("");
  const [batchDriverPhone, setBatchDriverPhone] = useState("");
  const [batchTotalFreight, setBatchTotalFreight] = useState("");
  const [batchDepositAmount, setBatchDepositAmount] = useState("");
  const [batchDepositRefundable, setBatchDepositRefundable] = useState(true);
  const [batchDispatcherRemark, setBatchDispatcherRemark] = useState("");
  const vehicleSearch = trpc.vehicle.lookupByPlate.useMutation();
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  // 整组选择：选中/取消组内所有订单
  const toggleGroupSelect = (group: OrderGroup) => {
    const groupIds = group.orders.map((o: any) => o.id);
    const allSelected = groupIds.every((id: number) => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      groupIds.forEach((id: number) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const getDeleteLockReason = (order: any) => getMergedChildDeleteLockReason(order);
  const getRollbackLockReason = (order: any) => getMergedChildRollbackLockReason(order);
  const openDeleteDialog = (order: any, orderId?: number | null) => {
    const lockReason = getDeleteLockReason(order);
    if (lockReason) {
      toast.error(lockReason);
      return;
    }
    const resolvedId = orderId ?? order?.orderId ?? order?.id;
    if (!resolvedId) return;
    setDeleteTargetId(resolvedId);
  };
  const openRollbackDialog = (order: any, orderId?: number | null) => {
    const lockReason = getRollbackLockReason(order);
    if (lockReason) {
      toast.error(lockReason);
      return;
    }
    const resolvedId = orderId ?? order?.orderId ?? order?.id;
    if (!resolvedId) return;
    setRollbackTargetId(resolvedId);
    setRollbackReason("");
  };

  const rollbackMutation = trpc.order.rollbackStatus.useMutation({
    onSuccess: (res) => {
      refetchPending(); refetchDispatched(); refetchTransit(); refetchDelivered(); refetchSigned();
      toast.success(`订单已退回：${res.fromLabel} → ${res.toLabel}`);
      setRollbackTargetId(null);
      setRollbackReason("");
    },
    onError: (err: any) => toast.error(err.message),
  });
  // 已派车Tab撤销派车专用
  const dvRevertStatus = trpc.order.revertStatus.useMutation({
    onSuccess: () => {
      toast.success("已撤销派车，订单已回到待派车");
      refetchPending(); refetchDispatched(); refetchTransit();
    },
    onError: (err: any) => toast.error(err.message || "撤销派车失败"),
  });

  // 指定目标状态退回（增强版：强制清空派车信息+清理回单+重置押金）
  const revertMutation = trpc.order.revertStatus.useMutation({
    onSuccess: (res) => {
      refetchPending(); refetchDispatched(); refetchTransit(); refetchDelivered(); refetchSigned();
      toast.success(`订单已退回：${res.fromLabel} → ${res.toLabel}`);
      setRollbackTargetId(null);
      setRollbackReason("");
      setRevertTargetStatus("pending_dispatch");
    },
    onError: (err: any) => toast.error(err.message),
  });
  const batchRollbackMutation = trpc.order.batchRollback.useMutation({
    onSuccess: (res) => {
      refetchPending(); refetchDispatched(); refetchTransit(); refetchDelivered(); refetchSigned();
      const msg = res.skipCount > 0 ? `成功退回 ${res.successCount} 个，${res.skipCount} 个跳过` : `成功退回 ${res.successCount} 个订单`;
      toast.success(msg);
      setSelectedIds(new Set()); setBatchRollbackOpen(false); setBatchRollbackReason("");
    },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.order.delete.useMutation({
    onSuccess: () => {
      refetchPending(); refetchDispatched(); refetchTransit(); refetchDelivered(); refetchSigned();
      toast.success("订单已删除");
      setDeleteTargetId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // 单个订单状态更新
  const updateStatus = trpc.order.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("操作成功");
      setDispatchGroup(null);
      resetForm();
      refetchPending();
      refetchDispatched();
      refetchTransit();
      refetchDelivered();
      refetchSigned();
    },
    onError: (e) => toast.error(e.message),
  });

  // 批量派车（内部整理参考批次：运费分摊+押金防重）
  const batchDispatch = trpc.order.batchDispatch.useMutation({
    onSuccess: (res) => {
      toast.success(`批量派车成功，共 ${res.count} 个自运订单，运费已按内部配载结果分摊`);
      setDispatchGroup(null);
      resetForm();
      refetchPending();
      refetchDispatched();
      refetchTransit();
      refetchDelivered();
      refetchSigned();
    },
    onError: (e) => toast.error(e.message),
  });

  // 批量状态推进（非派车场景，如整组确认送达等）
  const batchUpdateStatus = trpc.order.batchUpdateStatus.useMutation({
    onSuccess: (res) => {
      toast.success(`成功处理 ${res.count} 个订单`);
      setDispatchGroup(null);
      resetForm();
      refetchPending();
      refetchDispatched();
      refetchTransit();
      refetchDelivered();
      refetchSigned();
    },
    onError: (e) => toast.error(e.message),
  });

  // 运费和押金 state（整组派车用）
  const [totalFreight, setTotalFreight] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositRefundable, setDepositRefundable] = useState(true);

  // 派车弹窗粘贴司机信息
  const [dvPasteText, setDvPasteText] = useState("");

  const parseDvDriverText = (text: string) => {
    const t: { plateNumber?: string; driverName?: string; driverPhone?: string } = {};
    const lines = text.split(/[\n\r]+/).map((n) => n.trim()).filter(Boolean);
    for (const n of lines) {
      const r = n.match(/(?:车号|车牌|车牌号)[：:\s]*([^\s,，]+)/);
      if (r) t.plateNumber = r[1];
      const i = n.match(/(?:司机|姓名|驾驶员|师傅)[：:\s]*([^\s,，0-9]{2,4})/);
      if (i) t.driverName = i[1];
      const o = n.match(/(?:电话|手机|联系方式|联系电话|Tel)[：:\s]*(1[3-9]\d{9})/i);
      if (o) t.driverPhone = o[1];
    }
    if (!t.plateNumber) {
      const m = text.match(/([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-Z][A-Z0-9]{5,6})/);
      if (m) t.plateNumber = m[1];
    }
    if (!t.driverPhone) {
      const m = text.match(/(1[3-9]\d{9})/);
      if (m) t.driverPhone = m[1];
    }
    return t;
  };

  const resetForm = () => {
    setVehiclePlate("");
    setDriverName("");
    setDriverPhone("");
    setDispatcherRemark("");
    setTotalFreight("");
    setDepositAmount("");
    setDepositRefundable(true);
    setDvPasteText("");
  };

  const resetBatchForm = () => {
    setBatchVehiclePlate("");
    setBatchDriverName("");
    setBatchDriverPhone("");
    setBatchTotalFreight("");
    setBatchDepositAmount("");
    setBatchDepositRefundable(true);
    setBatchDispatcherRemark("");
  };

  const getOrderPodEffectiveStatus = (order: any) => order?.podEffectiveStatus || "none";

  const getOrderPodOriginalStatus = (order: any) => order?.podOriginalStatus || null;

  const isPodReceived = (order: any) => {
    const effectiveStatus = getOrderPodEffectiveStatus(order);
    const originalStatus = getOrderPodOriginalStatus(order);
    return originalStatus === "received" || effectiveStatus === "original_received" || effectiveStatus === "received";
  };

  const goToPodDepositStation = (order: any, group?: OrderGroup) => {
    const params = new URLSearchParams({
      tab: "pending_receipt",
      businessType: "self",
    });
    const keyword = group?.planNumber || order?.mergedPlanNumber || order?.orderNumber || order?.systemCode || order?.plateNumber;
    if (keyword) params.set("keyword", keyword);
    setLocation(`/station/pod-deposit?${params.toString()}`);
  };

  // 打开批量派车弹窗
  const handleBatchDispatchOpen = () => {
    if (selectedIds.size === 0) {
      toast.error("请先勾选要派车的订单");
      return;
    }
    resetBatchForm();
    setBatchDispatchOpen(true);
  };

  // 批量派车确认
  const confirmBatchDispatch = () => {
    if (!batchVehiclePlate.trim() || !batchDriverName.trim() || !batchDriverPhone.trim()) {
      toast.error("请填写完整的车辆和司机信息");
      return;
    }
    const orderIdsList = Array.from(selectedIds);
    const selectedOrders = pendingOrders.filter((o: any) => selectedIds.has(o.id));
    const freight = parseFloat(batchTotalFreight) || 0;
    const hasRemark = batchDispatcherRemark.trim().length > 0;
    const isMultiple = orderIdsList.length > 1;

    // 溢价检测：比对总运费与总原定价/调度价
    const totalQuotedPrice = selectedOrders.reduce((s: number, o: any) => s + (parseFloat(String(o.quotedPrice)) || 0), 0);
    const totalDispatchPrice = selectedOrders.reduce((s: number, o: any) => s + (parseFloat(String(o.dispatchPrice)) || 0), 0);
    const referencePrice = totalQuotedPrice > 0 ? totalQuotedPrice : totalDispatchPrice;
    const isOverpriced = freight > 0 && referencePrice > 0 && freight > referencePrice;
    const needApproval = isOverpriced || hasRemark;

    if (needApproval) {
      if (isOverpriced) {
        toast.info(`运费¥${freight} 超出${totalQuotedPrice > 0 ? '原定价' : '调度价'}¥${referencePrice}，已转入审批流程`);
      }
      batchUpdateStatus.mutate({
        orderIds: orderIdsList,
        status: "pending_approval",
        plateNumber: batchVehiclePlate.trim(),
        driverName: batchDriverName.trim(),
        driverPhone: batchDriverPhone.trim(),
        actualFreight: batchTotalFreight.trim() || undefined,
        depositAmount: batchDepositAmount.trim() || undefined,
        depositRefundable: batchDepositRefundable,
        dispatcherRemark: batchDispatcherRemark.trim() || undefined,
      });
      setBatchDispatchOpen(false);
      setSelectedIds(new Set());
    } else if (isMultiple && freight > 0) {
      // 多单且有运费且未溢价：使用 batchDispatch 接口（运费分摊+押金防重）
      batchDispatch.mutate({
        orderIds: orderIdsList,
        plateNumber: batchVehiclePlate.trim(),
        driverName: batchDriverName.trim(),
        driverPhone: batchDriverPhone.trim(),
        totalFreight: batchTotalFreight.trim(),
        depositAmount: batchDepositAmount.trim() || undefined,
        depositRefundable: batchDepositRefundable,
        dispatcherRemark: batchDispatcherRemark.trim() || undefined,
      });
      setBatchDispatchOpen(false);
      setSelectedIds(new Set());
    } else {
      // 单个订单或无运费：逐个派车
      if (isMultiple) {
        // 多单无运费：使用batchUpdateStatus
        batchUpdateStatus.mutate({
          orderIds: orderIdsList,
          status: "dispatched",
          plateNumber: batchVehiclePlate.trim(),
          driverName: batchDriverName.trim(),
          driverPhone: batchDriverPhone.trim(),
          depositAmount: batchDepositAmount.trim() || undefined,
          depositRefundable: batchDepositRefundable,
          dispatcherRemark: batchDispatcherRemark.trim() || undefined,
        });
      } else {
        updateStatus.mutate({
          id: orderIdsList[0],
          status: "dispatched",
          plateNumber: batchVehiclePlate.trim(),
          driverName: batchDriverName.trim(),
          driverPhone: batchDriverPhone.trim(),
          actualFreight: batchTotalFreight.trim() || undefined,
          depositAmount: batchDepositAmount.trim() || undefined,
          depositRefundable: batchDepositRefundable,
          dispatcherRemark: batchDispatcherRemark.trim() || undefined,
        });
      }
      setBatchDispatchOpen(false);
      setSelectedIds(new Set());
    }
  };

  // 批量派车车牌查找司机
  const handleBatchPlateSelect = async (plate: string) => {
    setBatchVehiclePlate(plate);
    try {
      const result = await vehicleSearch.mutateAsync({ plateNumber: plate });
      if (result.driver) {
        setBatchDriverName(result.driver.name || "");
        setBatchDriverPhone(result.driver.phone || "");
      }
    } catch { /* ignore */ }
  };

  const pendingOrders = pendingData?.items ?? [];
  const dispatchedOrders = dispatchedData?.items ?? [];
  const transitOrders = transitData?.items ?? [];
  const deliveredOrders = deliveredData?.items ?? [];
  const signedOrders = signedData?.items ?? [];
  const vehicles = vehicleList ?? [];

  const fmtDateTime = (value: unknown) => {
    if (!value) return "-";
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const getTimelineSummary = (order: any, tabType: "pending" | "dispatched" | "transit" | "delivered" | "signed") => {
    const timeline = [
      order.dispatchDate ? `派车 ${fmtDateTime(order.dispatchDate)}` : null,
      order.loadingDate ? `装货 ${fmtDateTime(order.loadingDate)}` : null,
      order.transitDate ? `发运 ${fmtDateTime(order.transitDate)}` : null,
      order.deliveryDate ? `送达 ${fmtDateTime(order.deliveryDate)}` : null,
      order.signedDate ? `签收 ${fmtDateTime(order.signedDate)}` : null,
    ].filter(Boolean);

    if (timeline.length > 0) {
      return timeline.slice(-2).join(" · ");
    }

    if (tabType === "dispatched") return "已派车，待送达回传";
    if (tabType === "transit") return "运输中历史单，待送达";
    if (tabType === "delivered") return "已送达，待签收确认";
    if (tabType === "signed") return "已完成签收";
    return "暂无运输节点时间";
  };

  // 待派车排序
  const dvPendingSortGetters = useMemo(() => ({
    createdAt: (o: any) => o.createdAt ? new Date(o.createdAt).getTime() : 0,
    weight: (o: any) => parseFloat(o.weight) || 0,
    customerName: (o: any) => o.customerName || "",
    isUrgent: (o: any) => o.isUrgent ? 1 : 0,
  }), []);
  const { sorted: sortedPendingOrders, sort: dvPendingSort, toggleSort: toggleDvPendingSort } = useTableSort(pendingOrders, dvPendingSortGetters);

  // 按内部整理参考批次分组（仅自运内部配载使用）
  const pendingGroups = useMemo(() => groupOrdersByPlan(sortedPendingOrders), [sortedPendingOrders]);
  const dispatchedGroups = useMemo(() => groupOrdersByPlan(dispatchedOrders), [dispatchedOrders]);
  const transitGroups = useMemo(() => groupOrdersByPlan(transitOrders), [transitOrders]);
  const deliveredGroups = useMemo(() => groupOrdersByPlan(deliveredOrders), [deliveredOrders]);
  const signedGroups = useMemo(() => groupOrdersByPlan(signedOrders), [signedOrders]);

  const togglePlanExpand = (key: string) => {
    setExpandedPlans(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // 整组派车
  const handleGroupDispatch = (group: OrderGroup) => {
    setDispatchGroup(group);
    resetForm();
  };

  // 选择已有车辆
  const handleSelectVehicle = async (plate: string) => {
    setVehiclePlate(plate);
    try {
      const result = await vehicleSearch.mutateAsync({ plateNumber: plate });
      if (result.driver) {
        setDriverName(result.driver.name || "");
        setDriverPhone(result.driver.phone || "");
      }
    } catch { /* ignore */ }
  };

  // 手动输入车牌后查找
  const handlePlateBlur = async () => {
    if (!vehiclePlate.trim()) return;
    try {
      const result = await vehicleSearch.mutateAsync({ plateNumber: vehiclePlate.trim() });
      if (result.driver) {
        setDriverName(result.driver.name || "");
        setDriverPhone(result.driver.phone || "");
        toast.info("已匹配到司机信息");
      }
    } catch { /* new plate */ }
  };

  // 确认派车（整组）
  const confirmDispatch = () => {
    if (!dispatchGroup || !vehiclePlate || !driverName || !driverPhone) {
      toast.error("请填写完整的车辆和司机信息");
      return;
    }
    const ids = dispatchGroup.orders.map((o: any) => o.id);
    const isGrouped = ids.length > 1;
    const freight = parseFloat(totalFreight) || 0;
    const hasRemark = dispatcherRemark.trim().length > 0;

    // 溢价检测：比对总运费与总原定价/调度价
    const totalQuotedPrice = dispatchGroup.orders.reduce((s: number, o: any) => s + (parseFloat(String(o.quotedPrice)) || 0), 0);
    const totalDispatchPrice = dispatchGroup.orders.reduce((s: number, o: any) => s + (parseFloat(String(o.dispatchPrice)) || 0), 0);
    const referencePrice = totalQuotedPrice > 0 ? totalQuotedPrice : totalDispatchPrice;
    const isOverpriced = freight > 0 && referencePrice > 0 && freight > referencePrice;
    const needApproval = isOverpriced || hasRemark;

    if (needApproval) {
      // 溢价或有备注：走审批流程
      if (isOverpriced) {
        toast.info(`运费¥${freight} 超出${totalQuotedPrice > 0 ? '原定价' : '调度价'}¥${referencePrice}，已转入审批流程`);
      }
      batchUpdateStatus.mutate({
        orderIds: ids,
        status: "pending_approval",
        plateNumber: vehiclePlate.trim(),
        driverName: driverName.trim(),
        driverPhone: driverPhone.trim(),
        actualFreight: totalFreight.trim() || undefined,
        depositAmount: depositAmount.trim() || undefined,
        depositRefundable,
        dispatcherRemark: dispatcherRemark.trim() || undefined,
      });
    } else if (isGrouped) {
      // 合并订单且未溢价：使用 batchDispatch 接口（运费分摊+押金防重）
      if (!totalFreight || freight <= 0) {
        toast.error("请填写整车总运费");
        return;
      }
      batchDispatch.mutate({
        orderIds: ids,
        plateNumber: vehiclePlate.trim(),
        driverName: driverName.trim(),
        driverPhone: driverPhone.trim(),
        totalFreight: totalFreight.trim(),
        depositAmount: depositAmount.trim() || undefined,
        depositRefundable,
        dispatcherRemark: dispatcherRemark.trim() || undefined,
      });
    } else {
      // 单个订单且未溢价：直接派车
      updateStatus.mutate({
        id: ids[0],
        status: "dispatched",
        plateNumber: vehiclePlate.trim(),
        driverName: driverName.trim(),
        driverPhone: driverPhone.trim(),
        actualFreight: totalFreight.trim() || undefined,
        depositAmount: depositAmount.trim() || undefined,
        depositRefundable,
        dispatcherRemark: dispatcherRemark.trim() || undefined,
      });
    }
  };

  // 整组状态推进
  const handleGroupStatusUpdate = (group: OrderGroup, status: string) => {
    const ids = group.orders.map((o: any) => o.id);
    if (ids.length === 1) {
      updateStatus.mutate({ id: ids[0], status });
    } else {
      batchUpdateStatus.mutate({ orderIds: ids, status });
    }
  };

  // 整组退回
  const handleGroupRollback = (group: OrderGroup) => {
    const ids = group.orders.map((o: any) => o.id);
    ids.forEach(id => selectedIds.add(id));
    setSelectedIds(new Set(selectedIds));
    setBatchRollbackOpen(true);
    setBatchRollbackReason("");
  };

  // 渲染订单组的通用函数
  const renderOrderGroup = (
    group: OrderGroup,
    tabType: "pending" | "dispatched" | "transit" | "delivered" | "signed",
    gIdx: number,
  ) => {
    const isGrouped = group.planNumber !== null && group.orderCount > 1;
    const expandKey = `${tabType}-${group.planNumber || gIdx}`;
    const isExpanded = expandedPlans.has(expandKey);

    if (isGrouped) {
      const firstOrder = group.orders[0] as any;
      return (
        <React.Fragment key={expandKey}>
          {/* 组头行 */}
          <TableRow className="bg-blue-50/80 border-l-4 border-l-blue-500 hover:bg-blue-100/80">
            {tabType === "pending" && (
              <TableCell>
                <Checkbox
                  checked={group.orders.every((o: any) => selectedIds.has(o.id))}
                  onCheckedChange={() => toggleGroupSelect(group)}
                />
              </TableCell>
            )}
            <TableCell>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => togglePlanExpand(expandKey)}>
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            </TableCell>
            <TableCell colSpan={tabType === "pending" ? 2 : 1}>
              <div className="flex items-start gap-2">
                <Layers className="h-4 w-4 text-blue-600 mt-0.5" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-blue-700 text-xs">自运参考批次 {group.planNumber}</span>
                    <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-700 border-blue-300">
                      {group.orderCount}单
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground">仅用于自运内部配载整理，不形成正式外请分组</div>
                </div>
              </div>
            </TableCell>
            {tabType === "pending" && (
              <>
                <TableCell className="text-xs">
                  {firstOrder.originCity} <ArrowRight className="h-3 w-3 inline" /> {firstOrder.destinationCity}
                </TableCell>
                <TableCell className="text-xs font-semibold text-blue-700">{group.totalWeight.toFixed(3)}t</TableCell>
                <TableCell>
                  {group.orders.some((o: any) => o.isUrgent) && <Badge variant="destructive" className="text-[10px]">加急</Badge>}
                </TableCell>
              </>
            )}
            {tabType !== "pending" && (
              <>
                <TableCell className="text-xs">
                  <div>{firstOrder.originCity} → {firstOrder.destinationCity}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">{getTimelineSummary(firstOrder, tabType)}</div>
                </TableCell>
                <TableCell className="text-xs font-medium">{firstOrder.plateNumber || "-"}</TableCell>
                <TableCell className="text-xs">
                  <div>{firstOrder.driverName || "-"}</div>
                  <div className="text-[10px] text-muted-foreground">{firstOrder.driverPhone || "未登记电话"}</div>
                </TableCell>
              </>
            )}
            <TableCell>
              <div className="flex items-center gap-1">
                {tabType === "pending" && (
                  <Button size="sm" onClick={() => handleGroupDispatch(group)}>
                    <Truck className="h-3 w-3 mr-1" />
                    批量派车
                  </Button>
                )}
                {(tabType === "dispatched" || tabType === "transit") && (
                  <Button size="sm" variant="outline" onClick={() => handleGroupStatusUpdate(group, "delivered")}>
                    批量标记已送达
                  </Button>
                )}
                {tabType === "delivered" && (
                  <Button size="sm" variant="outline" onClick={() => handleGroupStatusUpdate(group, "signed")}>
                    批量标记已签收
                  </Button>
                )}
                {tabType === "signed" && (
                  <>
                    <Badge variant="outline" className={`text-[10px] ${isPodReceived(firstOrder) ? "border-emerald-300 text-emerald-600" : "border-amber-300 text-amber-700"}`}>
                      {isPodReceived(firstOrder) ? "财务已收到回单" : "司机待交单到财务"}
                    </Badge>
                    <Button
                      size="sm"
                      variant={isPodReceived(firstOrder) ? "outline" : "default"}
                      className={isPodReceived(firstOrder) ? "text-emerald-600 border-emerald-300 hover:bg-emerald-50" : "bg-amber-600 hover:bg-amber-700 text-white"}
                      onClick={() => goToPodDepositStation(firstOrder, group)}
                    >
                      {isPodReceived(firstOrder) ? "查看财务回单台" : "司机交单到财务"}
                    </Button>
                  </>
                )}
                <DangerActionMenu
                  onRollback={hasPermission("order.rollback") ? () => handleGroupRollback(group) : undefined}
                  rollbackLabel="整组退回"
                />
              </div>
            </TableCell>
          </TableRow>
          {/* 子运单行 */}
          {isExpanded && group.orders.map((order: any) => (
            <TableRow key={order.id} className={`bg-blue-50/30 ${order.isUrgent ? "bg-red-50/30" : ""}`}>
              {tabType === "pending" && (
                <TableCell>
                  <Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} />
                </TableCell>
              )}
              <TableCell className="text-xs text-muted-foreground pl-8">└</TableCell>
              <TableCell className="font-mono text-xs" colSpan={tabType === "pending" ? 2 : 1}>
                {order.isUrgent && <AlertTriangle className="h-3 w-3 text-red-500 inline mr-1" />}
                {order.orderNumber || order.systemCode}
                <span className="text-muted-foreground ml-1">({order.weight ? `${order.weight}t` : "-"})</span>
              </TableCell>
              {tabType === "pending" && (
                <>
                  <TableCell className="text-xs">{order.originCity} → {order.destinationCity}</TableCell>
                  <TableCell className="text-xs">{order.weight ? `${order.weight}t` : "-"}</TableCell>
                  <TableCell>
                    {order.isUrgent && <Badge variant="destructive" className="text-[10px]">加急</Badge>}
                  </TableCell>
                </>
              )}
              {tabType !== "pending" && (
                <>
                  <TableCell className="text-xs">
                    <div>{order.originCity} → {order.destinationCity}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{getTimelineSummary(order, tabType)}</div>
                  </TableCell>
                  <TableCell className="text-xs">{order.plateNumber || "-"}</TableCell>
                  <TableCell className="text-xs">
                    <div>{order.driverName || "-"}</div>
                    <div className="text-[10px] text-muted-foreground">{order.driverPhone || "未登记电话"}</div>
                  </TableCell>
                </>
              )}
              <TableCell>
                <div className="flex items-center gap-1">
                  <DangerActionMenu
                    onDelete={undefined}
                    deleteDisabled={Boolean(getDeleteLockReason(order))}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </React.Fragment>
      );
    }

    // 无合并计划号的单独订单
    const order = group.orders[0] as any;
    return (
      <TableRow key={order.id} className={order.isUrgent ? "bg-red-50/50" : ""}>
        {tabType === "pending" && (
          <TableCell><Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} /></TableCell>
        )}
        <TableCell className="font-mono text-xs" colSpan={tabType === "pending" ? 1 : 1}>
          {order.isUrgent && <AlertTriangle className="h-3 w-3 text-red-500 inline mr-1" />}
          {order.orderNumber || order.systemCode}
        </TableCell>
        {tabType === "pending" && (
          <>
            <TableCell>
              <div className="text-sm">{order.customerName}</div>
              <div className="text-xs text-muted-foreground">{order.cargoName}</div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1 text-xs">
                {order.originCity} <ArrowRight className="h-3 w-3" /> {order.destinationCity}
              </div>
            </TableCell>
            <TableCell className="text-xs">{order.weight ? `${order.weight}t` : "-"}</TableCell>
            <TableCell>
              {order.isUrgent && <Badge variant="destructive" className="text-[10px]">加急</Badge>}
            </TableCell>
          </>
        )}
        {tabType !== "pending" && (
          <>
            <TableCell className="text-xs">
              <div>{order.originCity} → {order.destinationCity}</div>
              <div className="mt-1 text-[10px] text-muted-foreground">{getTimelineSummary(order, tabType)}</div>
            </TableCell>
            <TableCell className="text-xs font-medium">{order.plateNumber || "-"}</TableCell>
            <TableCell className="text-xs">
              <div>{order.driverName || "-"}</div>
              <div className="text-[10px] text-muted-foreground">{order.driverPhone || "未登记电话"}</div>
            </TableCell>
          </>
        )}
        <TableCell>
          <div className="flex items-center gap-1">
            {tabType === "pending" && (
              <Button size="sm" onClick={() => handleGroupDispatch(group)}>
                <Truck className="h-3 w-3 mr-1" />
                派车
              </Button>
            )}
            {(tabType === "dispatched" || tabType === "transit") && (
              <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: order.id, status: "delivered" })}>
                标记已送达
              </Button>
            )}
            {tabType === "delivered" && (
              <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: order.id, status: "signed" })}>
                标记已签收
              </Button>
            )}
            {tabType === "signed" && (
              <>
                <Badge variant="outline" className={`text-[10px] ${isPodReceived(order) ? "border-emerald-300 text-emerald-600" : "border-amber-300 text-amber-700"}`}>
                  {isPodReceived(order) ? "财务已收到回单" : "司机待交单到财务"}
                </Badge>
                <Button
                  size="sm"
                  variant={isPodReceived(order) ? "outline" : "default"}
                  className={isPodReceived(order) ? "text-emerald-600 border-emerald-300 hover:bg-emerald-50" : "bg-amber-600 hover:bg-amber-700 text-white"}
                  onClick={() => goToPodDepositStation(order)}
                >
                  {isPodReceived(order) ? "查看财务回单台" : "司机交单到财务"}
                </Button>
              </>
            )}
            <DangerActionMenu
              onRollback={hasPermission("order.rollback") ? () => openRollbackDialog(order) : undefined}
              rollbackDisabled={Boolean(getRollbackLockReason(order))}
              onDelete={undefined}
              deleteDisabled={Boolean(getDeleteLockReason(order))}
            />
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              派车台
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              自运订单先做内部配载整理，再进入自营车辆派车 → 送达 → 签收 → 司机交单到财务 → 财务确认回单收到；参考批次仅用于内部配载，不形成正式外请分组。
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && activeTab === "pending" && (
              <Button size="sm" onClick={handleBatchDispatchOpen}>
                <Truck className="h-4 w-4 mr-1" />
                批量派车 ({selectedIds.size})
              </Button>
            )}
            {hasPermission("order.rollback") && selectedIds.size > 0 && (
              <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50" onClick={() => { setBatchRollbackOpen(true); setBatchRollbackReason(""); }}>
                <Undo2 className="h-4 w-4 mr-1" />
                批量退回 ({selectedIds.size})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => { refetchPending(); refetchDispatched(); refetchTransit(); }}>
              <RefreshCw className="h-4 w-4 mr-1" />
              刷新
            </Button>
          </div>
        </div>

        {/* 统计 */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-2">
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100">
                <Truck className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">待派车</div>
                <div className="text-lg font-bold text-orange-600">{pendingOrders.length}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Truck className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">已派车</div>
                <div className="text-lg font-bold text-blue-700">{dispatchedOrders.length + transitOrders.length}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex h-auto flex-wrap gap-1">
            <TabsTrigger value="pending">
              待派车
              {pendingOrders.length > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-4 min-w-4 text-[10px] px-1">
                  {pendingOrders.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="dispatched">已派车待录TMS {dispatchedOrders.length + transitOrders.length}</TabsTrigger>
          </TabsList>

          {/* 待派车 */}
          <TabsContent value="pending">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={pendingOrders.length > 0 && pendingOrders.every((o: any) => selectedIds.has(o.id))}
                          onCheckedChange={() => {
                            if (pendingOrders.every((o: any) => selectedIds.has(o.id))) {
                              const next = new Set(selectedIds);
                              pendingOrders.forEach((o: any) => next.delete(o.id));
                              setSelectedIds(next);
                            } else {
                              const next = new Set(selectedIds);
                              pendingOrders.forEach((o: any) => next.add(o.id));
                              setSelectedIds(next);
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>客户订单号</TableHead>
                      <SortableHeader sortKey="customerName" currentSort={dvPendingSort} onToggle={toggleDvPendingSort}>客户 · 货物</SortableHeader>
                      <TableHead>路线</TableHead>
                      <SortableHeader sortKey="weight" currentSort={dvPendingSort} onToggle={toggleDvPendingSort}>吨位</SortableHeader>
                      <SortableHeader sortKey="isUrgent" currentSort={dvPendingSort} onToggle={toggleDvPendingSort}>紧急</SortableHeader>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingGroups.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-400" />
                          暂无待派车订单，当前仅展示已完成自运内部配载整理的记录
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingGroups.slice((pendingPage - 1) * pendingPageSize, pendingPage * pendingPageSize).map((group, gIdx) => renderOrderGroup(group, "pending", gIdx))
                    )}
                  </TableBody>
                </Table>
                <TablePagination total={pendingGroups.length} page={pendingPage} pageSize={pendingPageSize} onPageChange={setPendingPage} onPageSizeChange={setPendingPageSize} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* 已派车待录TMS */}
          <TabsContent value="dispatched">
            <Card>
              <CardContent className="p-3">
                {dispatchedOrders.length === 0 && transitOrders.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">暂无已派车订单</div>
                ) : (
                  <div className="space-y-3">
                    {[...dispatchedOrders, ...transitOrders].map((order: any) => {
                      const _done = !!(order.plateNumber && order.driverName);
                      const borderClass = _done ? "border-green-400 border-l-4" : "border-amber-400 border-l-4";
                      const deliveryAddr = order.deliveryAddress || order.receivingAddress || order.destinationAddress;
                      return (
                        <div key={order.id} className={`rounded-lg border p-4 space-y-2.5 bg-white ${borderClass}`}>
                          {/* 第一行：订单号 + 操作按鈕 */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-base font-semibold text-gray-900">{order.orderNumber || order.systemCode || order.id}</span>
                              {order.isUrgent && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 border border-red-200">加急</span>}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button size="sm" variant="outline" className="h-7 text-xs border-blue-300 text-blue-600 hover:bg-blue-50" onClick={() => { setDispatchGroup({ orders: [order], planNumber: null, orderCount: 1, totalWeight: parseFloat(order.weight) || 0 }); resetForm(); setVehiclePlate(order.plateNumber || ""); setDriverName(order.driverName || ""); setDriverPhone(order.driverPhone || ""); }}>
                                <Truck className="h-3 w-3 mr-1" />改车牌
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50" onClick={() => { if (window.confirm("确认撤销派车？订单状态将回到“待派车”，车牌和司机信息会被清空。")) { dvRevertStatus.mutate({ id: order.id, targetStatus: "pending_dispatch", reason: "撤销派车" }); } }}>撤销派车</Button>
                              <Badge className={_done ? "bg-green-100 text-green-700 text-sm" : "bg-amber-100 text-amber-700 text-sm"}>{_done ? "已派车" : "待派车"}</Badge>
                            </div>
                          </div>
                          {/* 客户 */}
                          <div className="flex items-center gap-2 text-base text-gray-900">
                            <span className="text-gray-900 font-medium">客户</span>
                            <span>{order.customerName || "-"}</span>
                          </div>
                          {/* 发货 */}
                          <div className="flex items-center gap-1.5 text-base">
                            <span className="text-gray-900 font-medium">发货</span>
                            <span className="text-gray-900">{order.warehouseName || order.originCity || "-"}</span>
                          </div>
                          {/* 收货 + 地址 */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-base">
                              <span className="text-gray-900 font-medium">收货</span>
                              <span className="text-gray-900">{order.destinationCity || "-"}</span>
                            </div>
                            {deliveryAddr && <div className="text-base text-gray-700 ml-5">{deliveryAddr}</div>}
                          </div>
                          {/* 收货人 */}
                          {(order.receiverName || order.receiverPhone) && (
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                              <span className="text-gray-500 font-medium">收货人</span>
                              <span>{order.receiverName || "-"}</span>
                              {order.receiverPhone && <span className="font-mono">{order.receiverPhone}</span>}
                            </div>
                          )}
                          {/* 重量 */}
                          <div className="flex items-center gap-4 text-base">
                            <span className="flex items-center gap-1">
                              <span className="text-gray-900 font-medium">重量</span>
                              <span className="font-bold text-blue-600">{order.weight ? order.weight + "t" : "-"}</span>
                            </span>
                          </div>
                          {/* 已派车信息行 */}
                          {_done && (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-dashed border-slate-200 bg-green-50/50 rounded px-2 py-1.5">
                              <span className="flex items-center gap-1 text-sm font-medium text-gray-800">
                                <span className="text-gray-500">车牌</span>
                                <span className="font-mono font-bold text-green-700">{order.plateNumber || "-"}</span>
                              </span>
                              <span className="flex items-center gap-1 text-sm text-gray-700">
                                <span className="text-gray-500">司机</span>
                                <span className="font-medium">{order.driverName || "-"}</span>
                              </span>
                              {order.driverPhone && (
                                <span className="flex items-center gap-1 text-sm text-gray-700">
                                  <span className="text-gray-500">电话</span>
                                  <span className="font-mono">{order.driverPhone}</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 整组派车弹窗 */}
        <Dialog open={!!dispatchGroup} onOpenChange={(open) => { if (!open) { setDispatchGroup(null); setDvPasteText(""); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-green-500" />
                {dispatchGroup && dispatchGroup.orderCount > 1 ? (
                  <>
                    整组派车
                    <Badge variant="outline" className="ml-2 text-xs bg-blue-50 text-blue-700 border-blue-300">
                      {dispatchGroup.orderCount}单
                    </Badge>
                  </>
                ) : (
                  <>确认派车</>
                )}
                {dispatchGroup?.orders.some((o: any) => o.isUrgent) && <Badge variant="destructive" className="ml-2 text-xs">加急</Badge>}
              </DialogTitle>
            </DialogHeader>
            {dispatchGroup && (
              <div className="space-y-3">
                {/* 订单信息摘要 */}
                <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 space-y-1">
                  {dispatchGroup.orderCount > 1 ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-blue-700">参考批次：{dispatchGroup.planNumber}</span>
                        <Badge variant="secondary" className="h-5 bg-blue-100 text-blue-700">自运参考批次</Badge>
                      </div>
                      <div>{dispatchGroup.orders[0]?.originCity} → {Array.from(new Set(dispatchGroup.orders.map((o: any) => o.destinationCity).filter(Boolean))).join("、") || "待补目的地"}</div>
                      <div>车辆：{dispatchGroup.orders[0]?.plateNumber || "待补车牌"} · 司机：{dispatchGroup.orders[0]?.driverName || "待补司机"}</div>
                      <div>总吸重：{dispatchGroup.totalWeight.toFixed(3)}t · {dispatchGroup.orderCount}个订单</div>
                      {(() => { const addrs = Array.from(new Set(dispatchGroup.orders.map((o: any) => o.deliveryAddress || o.receivingAddress || o.destinationAddress || "").filter(Boolean))); return addrs.length > 0 ? <div className="text-[11px] text-gray-700">收货地址：{addrs.join(" / ")}</div> : null; })()}
                      <div className="text-[10px] text-muted-foreground">{dispatchGroup.orders.map((o: any) => o.orderNumber || o.systemCode).join("、")}</div>
                    </>
                  ) : (
                    <>
                      <div>{dispatchGroup.orders[0]?.orderNumber || dispatchGroup.orders[0]?.systemCode} · {dispatchGroup.orders[0]?.customerName} · {dispatchGroup.orders[0]?.originCity}→{dispatchGroup.orders[0]?.destinationCity}</div>
                      {(dispatchGroup.orders[0]?.deliveryAddress || dispatchGroup.orders[0]?.receivingAddress || dispatchGroup.orders[0]?.destinationAddress) && (
                        <div className="text-[11px] text-gray-700">收货地址：{dispatchGroup.orders[0]?.deliveryAddress || dispatchGroup.orders[0]?.receivingAddress || dispatchGroup.orders[0]?.destinationAddress}</div>
                      )}
                    </>
                  )}
                </div>
                {/* 订单详情：整组显示所有子运单 */}
                {dispatchGroup.orders.map((order: any, idx: number) => (
                  <div key={order.id} className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium">
                        {dispatchGroup.orderCount > 1 && <span className="text-blue-600 mr-1">#{idx + 1}</span>}
                        {order.orderNumber || order.systemCode}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline">自运</Badge>
                        {order.isLargeSlab && <Badge className="bg-purple-100 text-purple-700 border-purple-300">大板</Badge>}
                        {order.weight && <Badge variant="outline" className="text-[10px]">{order.weight}t</Badge>}
                      </div>
                    </div>
                    <div className="text-muted-foreground text-wrap-safe">
                      {order.customerName}{order.customerPhone ? ` (${order.customerPhone})` : ""} · {order.cargoName}
                      {order.packagingType === "pallet" ? " · 托盘" : order.packagingType === "loose" ? " · 散装" : order.packagingType === "pallet_loaded" ? " · 托盘装车" : ""}
                    </div>
                    {(order.isLargeSlab || order.cargoSpec || order.chargeableWeight || order.packageCount || order.palletCount || order.specialRequirements) && (
                      <div className="rounded-md border border-purple-200 bg-purple-50/70 p-2 space-y-1.5">
                        <div className="flex items-center gap-2 text-xs font-medium text-purple-800">
                          <span>大板信息摘要</span>
                          {order.isLargeSlab && <Badge className="bg-purple-100 text-purple-700 border-purple-300">大板订单</Badge>}
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <div>规格：{order.cargoSpec || "-"}</div>
                          <div>计费重量：{order.chargeableWeight || order.weight || "-"}</div>
                          <div>架数：{order.packageCount ?? "-"}</div>
                          <div>托数：{order.palletCount ?? "-"}</div>
                          <div className="col-span-2">特殊要求：{order.specialRequirements || (order.largeSlabShippingRequired ? "按大板发货要求执行" : "-")}</div>
                        </div>
                      </div>
                    )}
                    {/* 发货/卸货地址 */}
                    <div className="field-stack-readable text-xs">
                      <div className="text-wrap-safe">
                        <span className="text-muted-foreground">发货地：</span>
                        {order.originCity}{order.warehouseName ? ` · ${order.warehouseName}` : ""}
                      </div>
                      <div className="text-wrap-safe">
                        <span className="text-muted-foreground">卸货地：</span>
                        {order.destinationCity}
                      </div>
                      {order.deliveryAddress ? (
                        <div className="pl-11 text-muted-foreground text-wrap-keep-linebreaks">{order.deliveryAddress}</div>
                      ) : null}
                      <div className="text-wrap-safe">
                        <span className="text-muted-foreground">收货人：</span>
                        {order.receiverName || "-"} {order.receiverPhone ? `(${order.receiverPhone})` : ""}
                      </div>
                    </div>
                  </div>
                ))}

                {/* 发货备注（取第一个有备注的订单） */}
                {(() => {
                  const noteOrder = dispatchGroup.orders.find((o: any) => o.shippingNote || o.remarks);
                  if (!noteOrder) return null;
                  return (
                    <div className="note-panel-readable border border-blue-200 bg-blue-50">
                      <div className="field-label-muted text-blue-800">发货备注</div>
                      <div className="field-value-readable text-blue-900 text-wrap-keep-linebreaks">{(noteOrder as any).shippingNote || (noteOrder as any).remarks}</div>
                    </div>
                  );
                })()}

                {/* 客户报价汇总 */}
                {dispatchGroup.orders.some((o: any) => o.customerPrice) && (
                  <div className="flex items-center gap-4 flex-wrap text-sm">
                    {dispatchGroup.orders.map((o: any) => o.customerPrice ? (
                      <span key={o.id} className="text-xs">
                        {o.orderNumber}: <span className="font-bold text-green-600">{formatMoney(o.customerPrice)}</span>
                      </span>
                    ) : null)}
                  </div>
                )}

                <div className="border-t pt-3 space-y-3">
                  {/* 粘贴司机信息（自动识别） */}
                  <div className="border rounded-lg p-3 bg-blue-50/50 space-y-2">
                    <div className="text-xs font-medium text-blue-700">粘贴司机信息（自动识别）</div>
                    <Textarea
                      placeholder={"车号：粤W75646\n司机：张天祥\n身份证：445323199311281216\n电话：13026626316"}
                      value={dvPasteText}
                      onChange={(e) => setDvPasteText(e.target.value)}
                      rows={4}
                      className="text-xs bg-white"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          const parsed = parseDvDriverText(dvPasteText);
                          if (parsed.plateNumber) setVehiclePlate(parsed.plateNumber);
                          if (parsed.driverName) setDriverName(parsed.driverName);
                          if (parsed.driverPhone) setDriverPhone(parsed.driverPhone);
                          const filled: string[] = [];
                          if (parsed.plateNumber) filled.push("车牌");
                          if (parsed.driverName) filled.push("姓名");
                          if (parsed.driverPhone) filled.push("电话");
                          if (filled.length > 0) toast.success("已识别：" + filled.join("、"));
                          else toast.error("未识别到有效信息，请检查格式");
                        }}
                        disabled={!dvPasteText.trim()}
                      >识别并填充</Button>
                      {dvPasteText.trim() && (
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDvPasteText("")}>清空</Button>
                      )}
                    </div>
                  </div>
                  {/* 车牌号 */}
                  <div>
                    <Label className="text-xs">车牌号 <span className="text-red-500">*</span></Label>
                    <PlateAutocomplete
                      value={vehiclePlate}
                      onChange={setVehiclePlate}
                      onSelect={(v) => {
                        setVehiclePlate(v.plateNumber);
                        if (v.driverName) setDriverName(v.driverName);
                        if (v.driverPhone) setDriverPhone(v.driverPhone);
                        if (v.driverName || v.driverPhone) toast.info("已自动填充司机信息");
                      }}
                      placeholder="输入车牌号"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">司机姓名 <span className="text-red-500">*</span></Label>
                      <Input
                        placeholder="司机姓名"
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">司机电话 <span className="text-red-500">*</span></Label>
                      <Input
                        placeholder="联系电话"
                        value={driverPhone}
                        onChange={(e) => setDriverPhone(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  {/* 运费和押金 */}
                  <div className="border-t pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>{dispatchGroup && dispatchGroup.orderCount > 1 ? '整车总运费 *' : '运费'}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder={dispatchGroup && dispatchGroup.orderCount > 1 ? '整车总运费，后端按重量分摊' : '运费金额'}
                          value={totalFreight}
                          onChange={(e) => setTotalFreight(e.target.value)}
                          className="mt-1"
                        />
                        {dispatchGroup && dispatchGroup.orderCount > 1 && (
                          <p className="text-xs text-blue-600 mt-1">
                            ℹ️ 总运费将按各子单重量比例自动分摊
                          </p>
                        )}
                      </div>
                      <div>
                        <Label>押金（选填）</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="押金金额"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          className="mt-1"
                        />
                        {dispatchGroup && dispatchGroup.orderCount > 1 && parseFloat(depositAmount) > 0 && (
                          <p className="text-xs text-amber-600 mt-1">
                            ⚠️ 押金仅记录在首单，不会重复收取
                          </p>
                        )}
                      </div>
                    </div>
                    {parseFloat(depositAmount) > 0 && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="deposit-refundable"
                          checked={depositRefundable}
                          onCheckedChange={(v) => setDepositRefundable(!!v)}
                        />
                        <Label htmlFor="deposit-refundable" className="text-sm cursor-pointer">
                          押金可退还
                        </Label>
                      </div>
                    )}
                  </div>

                  {/* 调度员备注 */}
                  <div>
                    <Label>备注（选填）</Label>
                    <Textarea
                      placeholder="如有特殊要求请备注，如卸货马上付款、需要尾板等"
                      value={dispatcherRemark}
                      onChange={(e) => setDispatcherRemark(e.target.value)}
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDispatchGroup(null)}>取消</Button>
              <Button onClick={confirmDispatch} disabled={updateStatus.isPending || batchDispatch.isPending}>
                {(updateStatus.isPending || batchDispatch.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {(updateStatus.isPending || batchDispatch.isPending) ? "提交中..." : dispatchGroup && dispatchGroup.orderCount > 1 ? "确认整组派车" : "确认派车"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 批量派车弹窗（手动勾选多单） */}
      <Dialog open={batchDispatchOpen} onOpenChange={(open) => { if (!open) setBatchDispatchOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-green-500" />
              批量派车
              <Badge variant="outline" className="text-[10px]">
                {selectedIds.size}单 · {pendingOrders.filter((o: any) => selectedIds.has(o.id)).reduce((s: number, o: any) => s + (parseFloat(String(o.weight)) || 0), 0).toFixed(3)}t
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* 已选订单列表 */}
            <div className="max-h-48 overflow-y-auto space-y-2">
              {pendingOrders.filter((o: any) => selectedIds.has(o.id)).map((order: any, idx: number) => (
                <div key={order.id} className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium">
                      <span className="text-blue-600 mr-1">#{idx + 1}</span>
                      {order.orderNumber || order.systemCode}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline">自运</Badge>
                      {order.isLargeSlab && <Badge className="bg-purple-100 text-purple-700 border-purple-300">大板</Badge>}
                      {order.weight && <Badge variant="outline" className="text-[10px]">{order.weight}t</Badge>}
                      {order.isUrgent && <Badge variant="destructive">加急</Badge>}
                    </div>
                  </div>
                  <div className="text-muted-foreground text-xs text-wrap-safe leading-5">
                    {order.customerName} · {order.cargoName} · {order.originCity} → {order.destinationCity}
                  </div>
                  {(order.isLargeSlab || order.cargoSpec || order.chargeableWeight || order.packageCount || order.palletCount || order.specialRequirements) && (
                    <div className="rounded-md border border-purple-200 bg-purple-50/70 p-2 space-y-1 text-xs">
                      <div className="flex items-center gap-2 font-medium text-purple-800">
                        <span>大板信息摘要</span>
                        {order.isLargeSlab && <Badge className="bg-purple-100 text-purple-700 border-purple-300">大板订单</Badge>}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                        <div>规格：{order.cargoSpec || "-"}</div>
                        <div>计费重量：{order.chargeableWeight || order.weight || "-"}</div>
                        <div>架数：{order.packageCount ?? "-"}</div>
                        <div>托数：{order.palletCount ?? "-"}</div>
                        <div className="col-span-2">特殊要求：{order.specialRequirements || (order.largeSlabShippingRequired ? "按大板发货要求执行" : "-")}</div>
                      </div>
                    </div>
                  )}
                  {order.mergedPlanNumber && (
                    <div className="text-blue-600 text-xs">内部整理参考批次：{order.mergedPlanNumber}（非正式外请组）</div>
                  )}
                </div>
              ))}
            </div>

            {/* 发货备注 */}
            {(() => {
              const noteOrder = pendingOrders.filter((o: any) => selectedIds.has(o.id)).find((o: any) => o.shippingNote || o.remarks);
              if (!noteOrder) return null;
              return (
                <div className="note-panel-readable border border-blue-200 bg-blue-50">
                  <div className="field-label-muted text-blue-800">发货备注</div>
                  <div className="field-value-readable text-blue-900 text-wrap-keep-linebreaks">{noteOrder.shippingNote || noteOrder.remarks}</div>
                </div>
              );
            })()}

            {/* 客户报价汇总 */}
            {pendingOrders.filter((o: any) => selectedIds.has(o.id)).some((o: any) => o.customerPrice) && (
              <div className="flex items-center gap-4 flex-wrap text-sm">
                {pendingOrders.filter((o: any) => selectedIds.has(o.id)).map((o: any) => o.customerPrice ? (
                  <span key={o.id} className="text-xs">
                    {o.orderNumber}: <span className="font-bold text-green-600">{formatMoney(o.customerPrice)}</span>
                  </span>
                ) : null)}
              </div>
            )}

            <div className="border-t pt-3 space-y-3">
              {/* 智能粘贴司机信息 */}
              <DriverInfoPaste onParsed={(info) => {
                if (info.plateNumber) setBatchVehiclePlate(info.plateNumber);
                if (info.driverName) setBatchDriverName(info.driverName);
                if (info.driverPhone) setBatchDriverPhone(info.driverPhone);
              }} />
              {/* 选择自营车辆 */}
              <div>
                <Label>选择车辆（或手动输入车牌）</Label>
                {vehicles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
                    {vehicles.filter((v: any) => v.vehicleType === "own").map((v: any) => (
                      <Button
                        key={v.id}
                        size="sm"
                        variant={batchVehiclePlate === v.plateNumber ? "default" : "outline"}
                        className="text-xs h-7"
                        onClick={() => handleBatchPlateSelect(v.plateNumber)}
                      >
                        {v.plateNumber}
                      </Button>
                    ))}
                  </div>
                )}
                <PlateAutocomplete
                  value={batchVehiclePlate}
                  onChange={setBatchVehiclePlate}
                  onSelect={(v) => {
                    if (v.driverName) setBatchDriverName(v.driverName);
                    if (v.driverPhone) setBatchDriverPhone(v.driverPhone);
                    if (v.driverName || v.driverPhone) toast.info("已自动填充司机信息");
                  }}
                  placeholder="输入车牌号"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>司机姓名 *</Label>
                  <Input placeholder="司机姓名" value={batchDriverName} onChange={(e) => setBatchDriverName(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>司机电话 *</Label>
                  <Input placeholder="联系电话" value={batchDriverPhone} onChange={(e) => setBatchDriverPhone(e.target.value)} className="mt-1" />
                </div>
              </div>

              {/* 运费和押金 */}
              <div className="border-t pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{selectedIds.size > 1 ? '整车总运费 *' : '运费'}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={selectedIds.size > 1 ? '整车总运费，后端按重量分摊' : '运费金额'}
                      value={batchTotalFreight}
                      onChange={(e) => setBatchTotalFreight(e.target.value)}
                      className="mt-1"
                    />
                    {selectedIds.size > 1 && (
                      <p className="text-xs text-blue-600 mt-1">
                        ℹ️ 总运费将按各子单重量比例自动分摊
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>押金（选填）</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="押金金额"
                      value={batchDepositAmount}
                      onChange={(e) => setBatchDepositAmount(e.target.value)}
                      className="mt-1"
                    />
                    {selectedIds.size > 1 && parseFloat(batchDepositAmount) > 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        ⚠️ 押金仅记录在首单，不会重复收取
                      </p>
                    )}
                  </div>
                </div>
                {parseFloat(batchDepositAmount) > 0 && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="batch-deposit-refundable"
                      checked={batchDepositRefundable}
                      onCheckedChange={(v) => setBatchDepositRefundable(!!v)}
                    />
                    <Label htmlFor="batch-deposit-refundable" className="text-sm cursor-pointer">
                      押金可退还
                    </Label>
                  </div>
                )}
              </div>

              {/* 备注 */}
              <div>
                <Label>备注（选填）</Label>
                <Textarea
                  placeholder="如有特殊要求请备注，如卸货马上付款、需要尾板等"
                  value={batchDispatcherRemark}
                  onChange={(e) => setBatchDispatcherRemark(e.target.value)}
                  className="mt-1"
                  rows={2}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                ℹ️ 如运费超过调度价或有备注，将自动提交审批；否则直接派车。
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDispatchOpen(false)}>取消</Button>
            <Button
              disabled={!batchVehiclePlate.trim() || !batchDriverName.trim() || !batchDriverPhone.trim() || batchDispatch.isPending || batchUpdateStatus.isPending || updateStatus.isPending}
              onClick={confirmBatchDispatch}
            >
              {(batchDispatch.isPending || batchUpdateStatus.isPending || updateStatus.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {(batchDispatch.isPending || batchUpdateStatus.isPending || updateStatus.isPending) ? "处理中..." : `确认派车 (${selectedIds.size}单)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      {/* 退回确认弹窗（增强版：支持指定目标状态） */}
      <Dialog open={rollbackTargetId !== null} onOpenChange={(open) => { if (!open) { setRollbackTargetId(null); setRollbackReason(""); setRevertTargetStatus("pending_dispatch"); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-orange-500" />
              退回订单
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">订单将被退回到指定状态，派车信息、押金和回单将被自动清理。</p>
            <div>
              <Label>退回目标状态 *</Label>
              <Select value={revertTargetStatus} onValueChange={setRevertTargetStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_assign">待指派</SelectItem>
                  <SelectItem value="pending_price">待定价</SelectItem>
                  <SelectItem value="priced">已定价</SelectItem>
                  <SelectItem value="pending_dispatch">待派车</SelectItem>
                  <SelectItem value="pending_vehicle">待找车</SelectItem>
                  <SelectItem value="pending_inquiry">待询价</SelectItem>
                  <SelectItem value="on_hold">等通知</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>退回原因 *</Label>
              <Textarea value={rollbackReason} onChange={(e) => setRollbackReason(e.target.value)} placeholder="请说明退回原因" rows={3} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setRollbackTargetId(null); setRollbackReason(""); setRevertTargetStatus("pending_dispatch"); }}>取消</Button>
              <Button className="bg-orange-500 hover:bg-orange-600 text-white" disabled={!rollbackReason.trim() || revertMutation.isPending} onClick={() => { if (rollbackTargetId && rollbackReason.trim()) revertMutation.mutate({ id: rollbackTargetId, targetStatus: revertTargetStatus, reason: rollbackReason.trim() }); }}>
                {revertMutation.isPending ? "退回中..." : "确认退回"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
