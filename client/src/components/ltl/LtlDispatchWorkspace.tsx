import { trpc } from "@/lib/trpc";
import { fmtDate } from "@/lib/dateUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Truck, RefreshCw, Plus, Download, Search, Trash2, Eye, Package, Loader2, Filter, X, ChevronDown, ChevronRight, Sparkles,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useMemo, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { TablePagination } from "@/components/TablePagination";
import * as XLSX from "xlsx";
import PlateAutocomplete from "@/components/PlateAutocomplete";

/**
 * 零担派车 — 为已询价的零担订单批量派车发运（自动推进状态为已发运），并导出司机派车单
 * 
 * 只有 inquiry_confirmed（已询价）状态的零担订单才会出现在可选列表中。
 * 已发运(dispatched/shipped)的订单不会重复出现，防止重复派车。
 */
const _BUILD_TS = "1777723832"; // force hash
export default function LtlDispatchWorkspace() {
  const [activeTab, setActiveTab] = useState("create");
  const [search, setSearch] = useState("");
  const [batchSearch, setBatchSearch] = useState("");

  // 批量单号筛选
  const [showBatchFilter, setShowBatchFilter] = useState(false);
  const [batchFilterText, setBatchFilterText] = useState("");
  const [activeBatchFilter, setActiveBatchFilter] = useState<string[]>([]);

  // 创建批次表单
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [plateNumber, setPlateNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [batchRemark, setBatchRemark] = useState("");
  const [orderRemarks, setOrderRemarks] = useState<Record<number, string>>({});

  // 查看批次详情
  // 车型字段
  const [vehicleLength, setVehicleLength] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [capacity, setCapacity] = useState("");

  // 批量撤销
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<number>>(new Set());
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

  // 智能拼货推荐
  const [showSmartConsolidate, setShowSmartConsolidate] = useState(false);
  const [smartVehicleLength, setSmartVehicleLength] = useState("");
  const [smartVehicleModel, setSmartVehicleModel] = useState("");
  const [smartCapacity, setSmartCapacity] = useState<string>("");
  const [smartTargetCity, setSmartTargetCity] = useState<string>("");

  const [viewBatchId, setViewBatchId] = useState<number | null>(null);
  const [deleteBatchId, setDeleteBatchId] = useState<number | null>(null);
  // 分页状态
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(100);
  const [batchPage, setBatchPage] = useState(1);
  const [batchPageSize, setBatchPageSize] = useState(100);

  // 查询零担订单（只查 businessType=ltl）
  const { data: ltlOrdersData, refetch: refetchOrders } = trpc.order.list.useQuery(
    { page: 1, pageSize: 200, businessType: "ltl", keyword: search || undefined },
    { refetchInterval: 15000 }
  );

  // 从已询价Tab跳转过来时读取预选订单ID
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("ltl_dispatch_preselect_ids");
      if (raw) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids) && ids.length > 0) {
          setSelectedOrderIds(new Set(ids.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n))));
          setActiveTab("create");
          toast.success(`已从已询价Tab带出 ${ids.length} 个预选订单，请在右上角点击“派车”按钮完成创建。`);
        }
        sessionStorage.removeItem("ltl_dispatch_preselect_ids");
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 查询已有批次
  const { data: batchesData, refetch: refetchBatches } = trpc.order.listLtlBatches.useQuery(
    { page: 1, pageSize: 100, keyword: batchSearch || undefined },
    { refetchInterval: 15000 }
  );

  // 查看批次详情
  const { data: batchDetail } = trpc.order.getLtlBatchDetail.useQuery(
    { batchId: viewBatchId! },
    { enabled: viewBatchId !== null }
  );

  // 车牌查找
  const vehicleSearch = trpc.vehicle.lookupByPlate.useMutation();
  const trpcUtils = trpc.useUtils();

  const createBatchMutation = trpc.order.createLtlBatch.useMutation({
    onSuccess: (res) => {
      const msg = res.statusUpdatedCount > 0
        ? `派车批次 ${res.batchCode} 创建成功，${res.statusUpdatedCount} 个订单已自动发运`
        : `派车批次 ${res.batchCode} 创建成功`;
      toast.success(msg);
      setShowCreateDialog(false);
      resetForm();
      refetchBatches();
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });

  const batchDeleteMutation = trpc.order.batchDeleteLtlBatches.useMutation({
    onSuccess: (res) => {
      toast.success(`已撤销 ${res.deletedCount} 个批次，${res.orderRevertedCount} 个订单回退为已询价`);
      setSelectedBatchIds(new Set());
      setShowBatchDeleteConfirm(false);
      refetchBatches();
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteBatchMutation = trpc.order.deleteLtlBatch.useMutation({
    onSuccess: () => {
      toast.success("批次已删除");
      setDeleteBatchId(null);
      refetchBatches();
    },
    onError: (err) => toast.error(err.message),
  });

  // ★ 核心修复：只显示 inquiry_confirmed（已询价）状态的零担订单
  // 已发运(dispatched/shipped)的订单不再出现，防止重复派车
  const availableOrders = useMemo(() => {
    const items = ltlOrdersData?.items ?? [];
    let filtered = items.filter((o: any) =>
      o.businessType === "ltl" &&
      o.status === "inquiry_confirmed"
    );

    // 批量单号筛选
    if (activeBatchFilter.length > 0) {
      filtered = filtered.filter((o: any) => {
        const orderNum = (o.orderNumber || "").toLowerCase();
        return activeBatchFilter.some(keyword => orderNum.includes(keyword));
      });
    }

    return filtered;
  }, [ltlOrdersData, activeBatchFilter]);

  const batches = batchesData?.items ?? [];

  const resetForm = () => {
    setSelectedOrderIds(new Set());
    setPlateNumber("");
    setDriverName("");
    setDriverPhone("");
    setBatchRemark("");
    setOrderRemarks({});
    setVehicleLength("");
    setVehicleModel("");
    setCapacity("");
  };

  const toggleOrderSelect = (id: number) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // 解析批量单号文本（支持换行、逗号、空格、分号分隔）
  const parseBatchFilterText = useCallback((text: string): string[] => {
    return text
      .split(/[\n,;，；\s]+/)
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 0);
  }, []);

  // 应用批量筛选
  const applyBatchFilter = useCallback(() => {
    const keywords = parseBatchFilterText(batchFilterText);
    if (keywords.length === 0) {
      toast.error("请输入至少一个单号");
      return;
    }
    setActiveBatchFilter(keywords);
    setShowBatchFilter(false);
    toast.success(`已筛选 ${keywords.length} 个单号`);
  }, [batchFilterText, parseBatchFilterText]);

  // 清除批量筛选
  const clearBatchFilter = useCallback(() => {
    setActiveBatchFilter([]);
    setBatchFilterText("");
  }, []);

  const handlePlateBlur = async () => {
    if (!plateNumber.trim()) return;
    try {
      const result = await vehicleSearch.mutateAsync({ plateNumber: plateNumber.trim() });
      if (result.driver) {
        setDriverName(result.driver.name || "");
        setDriverPhone(result.driver.phone || "");
        toast.info("已匹配到司机信息");
      }
    } catch { /* new plate */ }
    // 查询车型信息
    try {
      const vInfo = await trpcUtils.order.getVehicleByPlate.fetch({ plateNumber: plateNumber.trim() });
      if (vInfo) {
        if (vInfo.vehicleLength) setVehicleLength(vInfo.vehicleLength);
        if (vInfo.vehicleModel) setVehicleModel(vInfo.vehicleModel);
        if (vInfo.standardCapacity) setCapacity(String(vInfo.standardCapacity));
        if (vInfo.vehicleLength || vInfo.vehicleModel) toast.info("已自动带出车型信息");
      }
    } catch { /* ignore */ }
  };

  const handleCreateBatch = () => {
    if (!plateNumber.trim()) { toast.error("请输入车牌号"); return; }
    if (!driverName.trim()) { toast.error("请输入司机姓名"); return; }
    if (selectedOrderIds.size === 0) { toast.error("请至少选择一个订单"); return; }

    const remarks = Object.entries(orderRemarks)
      .filter(([id, remark]) => selectedOrderIds.has(Number(id)) && remark.trim())
      .map(([id, remark]) => ({ orderId: Number(id), remark: remark.trim() }));

    createBatchMutation.mutate({
      plateNumber: plateNumber.trim(),
      driverName: driverName.trim(),
      driverPhone: driverPhone.trim() || undefined,
      orderIds: Array.from(selectedOrderIds),
      remarks: remarks.length > 0 ? remarks : undefined,
      remark: batchRemark.trim() || undefined,
      vehicleLength: vehicleLength || undefined,
      vehicleModel: vehicleModel || undefined,
      capacity: capacity || undefined,
    });
  };

  // 导出司机派车单（Excel）
  const exportDispatchSheet = (batch: any, batchOrders: any[]) => {
    const wb = XLSX.utils.book_new();

    const headerRow = [
      batch.plateNumber,
      batch.driverName,
      fmtDate(batch.dispatchDate),
      "", "", "", "", "", "", "",
    ];

    const columnHeaders = [
      "序号", "客户订单号", "货站运单号", "货站名称", "重量(吨)", "架数", "运费(元)", "收货地址", "收货人", "收货电话", "备注",
    ];

    const dataRows = batchOrders.map((bo: any, idx: number) => {
      const o = bo.order;
      if (!o) return [idx + 1, "", "", "", "", "", "", "", "", "", ""];

      const remarkParts: string[] = [];
      if (o.freightStationName) {
        const unitPrice = o.ltlUnitPrice ? `吨${o.ltlUnitPrice}` : "";
        const deliveryFee = o.ltlDeliveryFee && parseFloat(o.ltlDeliveryFee) > 0 ? `+送${o.ltlDeliveryFee}` : "";
        const totalCost = o.totalCost || o.dispatchPrice;
        if (unitPrice) {
          remarkParts.push(`${o.freightStationName}${o.destinationProvince || o.destinationCity || ""}，${unitPrice}${deliveryFee}，${totalCost || ""}`);
        } else {
          remarkParts.push(`先提货后到${o.freightStationName}发运`);
        }
      }
      if (o.ltlFinalStation) {
        remarkParts.push(`目的站：${o.ltlFinalStation}`);
      }
      if (o.shippingNote) {
        remarkParts.push(`发运说明：${o.shippingNote}`);
      }
      if (o.receivingNote) {
        remarkParts.push(`收货确认：${o.receivingNote}`);
      }
      if (o.settlementType === "collect" && o.dispatchPrice) {
        remarkParts.push(`到付：${o.dispatchPrice}元`);
      }
      if (bo.remark) remarkParts.push(bo.remark);
      if (o.mergedPlanNumber) remarkParts.push(`批次：${o.mergedPlanNumber}`);

      // 运费显示：总价 + 明细
      let freightDisplay = "";
      if (o.dispatchPrice) {
        freightDisplay = `¥${Number(o.dispatchPrice).toFixed(0)}`;
        if (o.ltlUnitPrice) {
          freightDisplay += ` (${o.ltlUnitPrice}元/吨×${o.weight || 0}吨`;
          if (o.ltlDeliveryFee && parseFloat(o.ltlDeliveryFee) > 0) freightDisplay += `+送${o.ltlDeliveryFee}`;
          if (o.ltlOtherFee && parseFloat(o.ltlOtherFee) > 0) freightDisplay += `+其他${o.ltlOtherFee}`;
          freightDisplay += ")";
        }
      }

      return [
        idx + 1,
        o.orderNumber || "",
        o.freightWaybillNumber || "",
        o.freightStationName || o.warehouseName || "",
        o.weight ? Number(o.weight) : "",
        o.packageCount || "",
        freightDisplay,
        [o.destinationCity, o.deliveryAddress].filter(Boolean).join(""),
        o.receiverName || "",
        o.receiverPhone || "",
        remarkParts.join("，") || o.remarks || "",
      ];
    });

    const wsData = [headerRow, columnHeaders, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws["!cols"] = [
      { wch: 5 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 10 },
      { wch: 6 }, { wch: 25 }, { wch: 40 }, { wch: 8 }, { wch: 14 }, { wch: 35 },
    ];

    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
      { s: { r: 0, c: 2 }, e: { r: 0, c: 3 } },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "司机派车单");
    const fileName = `派车单_${batch.plateNumber}_${batch.driverName}_${new Date(batch.dispatchDate).toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`已导出：${fileName}`);
  };

  const STATUS_LABELS: Record<string, string> = {
    inquiry_confirmed: "已询价",
    dispatched: "已发运",
    shipped: "已发运",
    in_transit: "运输中",
    delivered: "已送达",
    signed: "已签收",
    settled: "已结算",
  };

  const STATUS_COLORS: Record<string, string> = {
    inquiry_confirmed: "bg-teal-100 text-teal-700",
    dispatched: "bg-blue-100 text-blue-700",
    shipped: "bg-blue-100 text-blue-700",
    in_transit: "bg-green-100 text-green-700",
    delivered: "bg-emerald-100 text-emerald-700",
    signed: "bg-green-200 text-green-800",
    settled: "bg-green-200 text-green-800",
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="create">
              <Plus className="h-3.5 w-3.5 mr-1" />
              创建派车
            </TabsTrigger>
            <TabsTrigger value="batches">
              <Truck className="h-3.5 w-3.5 mr-1" />
              派车记录 {batches.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{batches.length}</Badge>}
            </TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" onClick={() => { refetchOrders(); refetchBatches(); }}>
            <RefreshCw className="h-4 w-4 mr-1" />
            刷新
          </Button>
        </div>

        {/* 创建派车 */}
        <TabsContent value="create">
          <div className="space-y-4">
            {/* 选择订单 */}
            <Card>
              <CardHeader className="pb-3">
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 mb-3">
                  前段链路检查口径：外请车先到提货点装货，再携带派车单前往货站完成发运。创建批次前，请确认发运货站、货站运单号/待补录说明，以及司机需知的发运备注已齐全。
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">选择零担订单</CardTitle>
                    <Badge variant="outline" className="text-xs font-normal">
                      仅显示"已询价"待派车订单
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 智能拼货推荐 */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSmartConsolidate(true)}
                      className="h-8 border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:text-violet-800"
                      title="输入车型与载重，系统自动推荐最优拼货组合"
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      智能拼货
                    </Button>
                    {/* 批量单号筛选按钮 */}
                    <Button
                      variant={activeBatchFilter.length > 0 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setShowBatchFilter(true)}
                      className="h-8"
                    >
                      <Filter className="h-3.5 w-3.5 mr-1" />
                      批量筛选
                      {activeBatchFilter.length > 0 && (
                        <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px] bg-white/20 text-white">
                          {activeBatchFilter.length}
                        </Badge>
                      )}
                    </Button>
                    {activeBatchFilter.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={clearBatchFilter} className="h-8 px-2 text-muted-foreground">
                        <X className="h-3.5 w-3.5 mr-1" />
                        清除筛选
                      </Button>
                    )}
                    {/* 普通搜索 */}
                    <div className="relative max-w-xs">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="搜索订单号、客户名..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-8 text-sm"
                      />
                    </div>
                    {selectedOrderIds.size > 0 && (
                      <Button size="sm" onClick={() => {
                        // 自动预填每单备注（运费计算公式）
                        const prefilled: Record<number, string> = {};
                        Array.from(selectedOrderIds).forEach(id => {
                          const order = availableOrders.find((o: any) => o.id === id);
                          if (order) {
                            const parts: string[] = [];
                            const stationOrDest = order.freightStationName || "";
                            const dest = order.destinationProvince || order.destinationCity || "";
                            if (stationOrDest) parts.push(stationOrDest + (dest ? dest : ""));
                            const unitPrice = order.ltlUnitPrice ? `吨${order.ltlUnitPrice}` : "";
                            const deliveryFee = order.ltlDeliveryFee && parseFloat(order.ltlDeliveryFee) > 0 ? `+送${order.ltlDeliveryFee}` : "";
                            if (unitPrice) parts.push(unitPrice + deliveryFee);
                            const total = order.totalCost || order.dispatchPrice;
                            if (total) parts.push(total);
                            if (order.settlementType === "collect" && order.dispatchPrice) {
                              parts.push(`到付：${order.dispatchPrice}元`);
                            }
                            if (order.mergedPlanNumber) parts.push(`批次：${order.mergedPlanNumber}`);
                            if (parts.length > 0) prefilled[id] = parts.join("，");
                          }
                        });
                        setOrderRemarks(prev => {
                          const merged = { ...prefilled };
                          for (const [k, v] of Object.entries(prev)) {
                            if (v.trim()) merged[Number(k)] = v;
                          }
                          return merged;
                        });
                        setShowCreateDialog(true);
                      }}>
                        <Truck className="h-3.5 w-3.5 mr-1" />
                        派车 ({selectedOrderIds.size}单)
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {/* 批量筛选激活提示 */}
                {activeBatchFilter.length > 0 && (
                  <div className="mx-4 mb-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between">
                    <div className="text-sm text-blue-700">
                      <Filter className="h-3.5 w-3.5 inline mr-1" />
                      已按 <span className="font-bold">{activeBatchFilter.length}</span> 个单号筛选，
                      匹配到 <span className="font-bold">{availableOrders.length}</span> 个订单
                    </div>
                    <Button variant="ghost" size="sm" onClick={clearBatchFilter} className="h-6 px-2 text-blue-600 hover:text-blue-800">
                      清除
                    </Button>
                  </div>
                )}
                {/* 按目的站分组的卡片列表 */}
                {availableOrders.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    {activeBatchFilter.length > 0
                      ? "未找到匹配的订单，请检查单号是否正确"
                      : "暂无待派车的零担订单（需要先在“已询价”Tab完成询价确认）"
                    }
                  </div>
                ) : (() => {
                  // 按目的站（destinationCity，其次destinationProvince）分组
                  const groupMap = new Map<string, any[]>();
                  availableOrders.forEach((o: any) => {
                    const groupKey = o.destinationCity || o.destinationProvince || "未填目的地";
                    if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
                    groupMap.get(groupKey)!.push(o);
                  });
                  // 按总吨位降序排序分组
                  const groups = Array.from(groupMap.entries())
                    .map(([key, orders]) => ({
                      key,
                      orders,
                      totalWeight: orders.reduce((s, o) => s + (Number(o.weight) || 0), 0),
                      totalPackages: orders.reduce((s, o) => s + (Number(o.packageCount) || 0), 0),
                    }))
                    .sort((a, b) => b.totalWeight - a.totalWeight);
                  return (
                    <div className="space-y-3 px-4 pb-4">
                      {groups.map(group => {
                        const allSelected = group.orders.every(o => selectedOrderIds.has(o.id));
                        const someSelected = group.orders.some(o => selectedOrderIds.has(o.id));
                        return (
                          <div key={group.key} className="rounded-lg border bg-card overflow-hidden">
                            {/* 分组头 */}
                            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b">
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={allSelected}
                                  data-state={allSelected ? "checked" : someSelected ? "indeterminate" : "unchecked"}
                                  onCheckedChange={() => {
                                    setSelectedOrderIds(prev => {
                                      const next = new Set(prev);
                                      if (allSelected) group.orders.forEach(o => next.delete(o.id));
                                      else group.orders.forEach(o => next.add(o.id));
                                      return next;
                                    });
                                  }}
                                />
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-base text-slate-800">📍 {group.key}</span>
                                  <Badge variant="secondary" className="text-xs">{group.orders.length}单</Badge>
                                  <Badge variant="outline" className="text-xs text-orange-700 border-orange-300 bg-orange-50">
                                    总{group.totalWeight.toFixed(2)}吨
                                  </Badge>
                                  {group.totalPackages > 0 && (
                                    <Badge variant="outline" className="text-xs">共{group.totalPackages}架</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            {/* 卡片列表 */}
                            <div className="divide-y">
                              {group.orders.map((order: any) => {
                                const selected = selectedOrderIds.has(order.id);
                                return (
                                  <div
                                    key={order.id}
                                    className={`flex gap-3 px-4 py-3 hover:bg-slate-50/70 cursor-pointer transition ${selected ? "bg-primary/5" : ""} ${order.isUrgent ? "bg-red-50/40" : ""}`}
                                    onClick={() => toggleOrderSelect(order.id)}
                                  >
                                    <Checkbox
                                      checked={selected}
                                      onCheckedChange={() => toggleOrderSelect(order.id)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="mt-1"
                                    />
                                    <div className="flex-1 min-w-0 grid grid-cols-12 gap-3 text-sm">
                                      {/* 订单号+客户 */}
                                      <div className="col-span-3 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          {order.isUrgent && <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" title="加急"></span>}
                                          <span className="font-mono text-xs font-semibold truncate">{order.orderNumber || order.systemCode}</span>
                                          {order.isUrgent && <Badge variant="destructive" className="text-[9px] h-4 px-1">急</Badge>}
                                        </div>
                                        <div className="text-sm font-medium mt-0.5 truncate">{order.customerName || "-"}</div>
                                        <div className="text-xs text-muted-foreground truncate">{order.cargoName || "-"}</div>
                                      </div>
                                      {/* 路线+货站 */}
                                      <div className="col-span-3 min-w-0">
                                        <div className="text-xs text-slate-700">
                                          <span className="text-muted-foreground">路线：</span>
                                          {order.originCity || "?"} → {order.destinationCity || "?"}
                                        </div>
                                        <div className="text-xs text-slate-700 mt-0.5">
                                          <span className="text-muted-foreground">货站：</span>{order.freightStationName || "-"}
                                        </div>
                                        {order.ltlFinalStation && (
                                          <div className="text-xs text-slate-700 mt-0.5">
                                            <span className="text-muted-foreground">目的站：</span>{order.ltlFinalStation}
                                          </div>
                                        )}
                                      </div>
                                      {/* 重量+架数 */}
                                      <div className="col-span-2 min-w-0 text-xs">
                                        <div><span className="text-muted-foreground">重量：</span><span className="font-medium">{order.weight || "-"}吨</span></div>
                                        <div className="mt-0.5"><span className="text-muted-foreground">架数：</span>{order.packageCount || "-"}</div>
                                      </div>
                                      {/* 运费 */}
                                      <div className="col-span-2 min-w-0 text-xs">
                                        {order.dispatchPrice ? (
                                          <>
                                            <div className="font-semibold text-orange-600">¥{Number(order.dispatchPrice).toFixed(0)}</div>
                                            {order.ltlUnitPrice && (
                                              <div className="text-[10px] text-muted-foreground">
                                                {order.ltlUnitPrice}元/吨×{order.weight || 0}吨
                                                {order.ltlDeliveryFee && parseFloat(String(order.ltlDeliveryFee)) > 0 ? `+送${order.ltlDeliveryFee}` : ""}
                                              </div>
                                            )}
                                          </>
                                        ) : order.totalCost ? <span className="font-semibold text-orange-600">¥{order.totalCost}</span> : <span className="text-muted-foreground">-</span>}
                                      </div>
                                      {/* 状态+备注 */}
                                      <div className="col-span-2 min-w-0">
                                        <Badge className={STATUS_COLORS[order.status] || "bg-gray-100 text-gray-700"} variant="secondary">
                                          {STATUS_LABELS[order.status] || order.status}
                                        </Badge>
                                        {order.dispatcherRemark && (
                                          <div className="text-xs text-muted-foreground mt-1 truncate" title={order.dispatcherRemark}>备注：{order.dispatcherRemark}</div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 派车记录 */}
        <TabsContent value="batches">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">派车批次记录</CardTitle>
                <div className="flex items-center gap-2">
                  {selectedBatchIds.size > 0 && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setShowBatchDeleteConfirm(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      批量撤销派车 ({selectedBatchIds.size})
                    </Button>
                  )}
                  <div className="relative max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="搜索批次号、车牌号..."
                      value={batchSearch}
                      onChange={(e) => setBatchSearch(e.target.value)}
                      className="pl-9 h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={batches.length > 0 && batches.every((b: any) => selectedBatchIds.has(b.id))}
                        onCheckedChange={() => {
                          if (batches.every((b: any) => selectedBatchIds.has(b.id))) {
                            setSelectedBatchIds(new Set());
                          } else {
                            setSelectedBatchIds(new Set(batches.map((b: any) => b.id)));
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>批次号</TableHead>
                    <TableHead>车牌号</TableHead>
                    <TableHead>司机</TableHead>
                    <TableHead>电话</TableHead>
                    <TableHead>派车日期</TableHead>
                    <TableHead>创建人</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        暂无派车记录
                      </TableCell>
                    </TableRow>
                  ) : batches.map((batch: any) => (
                    <TableRow key={batch.id} className={selectedBatchIds.has(batch.id) ? "bg-primary/5" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selectedBatchIds.has(batch.id)}
                          onCheckedChange={() => {
                            setSelectedBatchIds(prev => {
                              const next = new Set(prev);
                              if (next.has(batch.id)) next.delete(batch.id); else next.add(batch.id);
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium">{batch.batchCode}</TableCell>
                      <TableCell className="font-medium">{batch.plateNumber}</TableCell>
                      <TableCell>{batch.driverName}</TableCell>
                      <TableCell className="text-xs">{batch.driverPhone || "-"}</TableCell>
                      <TableCell className="text-xs">
                        {fmtDate(batch.dispatchDate)}
                      </TableCell>
                      <TableCell className="text-xs">{batch.createdByName || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setViewBatchId(batch.id)}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            查看
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setDeleteBatchId(batch.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination total={batches.length} page={batchPage} pageSize={batchPageSize} onPageChange={setBatchPage} onPageSizeChange={setBatchPageSize} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 批量单号筛选弹窗 */}
      <Dialog open={showBatchFilter} onOpenChange={setShowBatchFilter}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              批量单号筛选
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              粘贴多个订单号，支持换行、逗号、空格、分号分隔。系统会自动匹配包含这些关键字的订单。
            </div>
            <Textarea
              placeholder={"例如：\nLTL-A-123456\nLTL-B-789012\nLTL-C-345678"}
              value={batchFilterText}
              onChange={(e) => setBatchFilterText(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
            <div className="text-xs text-muted-foreground">
              已识别 <span className="font-bold">{parseBatchFilterText(batchFilterText).length}</span> 个单号
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchFilter(false)}>取消</Button>
            {activeBatchFilter.length > 0 && (
              <Button variant="outline" onClick={() => { clearBatchFilter(); setShowBatchFilter(false); }}>
                清除筛选
              </Button>
            )}
            <Button onClick={applyBatchFilter} disabled={parseBatchFilterText(batchFilterText).length === 0}>
              <Filter className="h-3.5 w-3.5 mr-1" />
              应用筛选 ({parseBatchFilterText(batchFilterText).length}个)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 创建派车批次弹窗 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              零担派车发运 — 填写车辆和司机信息
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
              <div>
                已选择 <span className="font-bold text-primary">{selectedOrderIds.size}</span> 个零担订单，
                确认后将自动推进为"已发运"状态并创建回单记录。
              </div>
              <div className="text-xs text-muted-foreground">
                请确保司机收到派车单后按“提货点装货 → 前往发运货站 → 办理开单/回传照片”的顺序执行；若订单存在目的站自提或二次送货要求，请在每单备注中写明。
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>车牌号 *</Label>
                <PlateAutocomplete
                  value={plateNumber}
                  onChange={setPlateNumber}
                  onBlur={handlePlateBlur}
                  onSelect={(v) => {
                    if (v.driverName) setDriverName(v.driverName);
                    if (v.driverPhone) setDriverPhone(v.driverPhone);
                    if (v.driverName || v.driverPhone) toast.info("已自动填充司机信息");
                  }}
                  placeholder="如 粤E53251"
                />
              </div>
              <div>
                <Label>司机姓名 *</Label>
                <Input
                  placeholder="如 陈波"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>司机电话</Label>
              <Input
                placeholder="如 13800138000"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
              />
            </div>
            {/* 车型信息 */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>车长</Label>
                <Select value={vehicleLength} onValueChange={(v) => {
                  setVehicleLength(v);
                  // 根据车长自动推荐载重
                  const capacityMap: Record<string, string> = {
                    "4.2米": "2", "6.8米": "5", "7.6米": "8",
                    "9.6米": "18", "13米": "25", "17.5米": "35",
                  };
                  if (capacityMap[v] && !capacity) setCapacity(capacityMap[v]);
                }}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="选择车长" />
                  </SelectTrigger>
                  <SelectContent>
                    {["4.2米", "6.8米", "7.6米", "9.6米", "13米", "17.5米"].map(l => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>车型</Label>
                <Select value={vehicleModel} onValueChange={setVehicleModel}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="选择车型" />
                  </SelectTrigger>
                  <SelectContent>
                    {["高栏", "平板", "厢式", "飞翼"].map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>载重(吨)</Label>
                <Input
                  placeholder="如 18"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <div>
              <Label>备注</Label>
              <Textarea
                placeholder="整批备注（可选）"
                value={batchRemark}
                onChange={(e) => setBatchRemark(e.target.value)}
                rows={2}
              />
            </div>

            {/* 每单备注 */}
            <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
              <div className="text-xs font-medium text-muted-foreground">每单备注（可选，如运费信息、批次号等）：</div>
              {Array.from(selectedOrderIds).map(id => {
                const order = availableOrders.find((o: any) => o.id === id);
                return (
                  <div key={id} className="flex items-center gap-2">
                    <span className="text-xs font-mono w-28 shrink-0 truncate">{order?.orderNumber || `#${id}`}</span>
                    <Input
                      className="h-7 text-xs"
                      placeholder="备注..."
                      value={orderRemarks[id] || ""}
                      onChange={(e) => setOrderRemarks(prev => ({ ...prev, [id]: e.target.value }))}
                    />
                  </div>
                );
              })}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
              <Button onClick={handleCreateBatch} disabled={createBatchMutation.isPending}>
                {createBatchMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {createBatchMutation.isPending ? "派车发运中..." : `确认派车发运 (${selectedOrderIds.size}单)`}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* 批次详情弹窗 */}
      <Dialog open={viewBatchId !== null} onOpenChange={(open) => !open && setViewBatchId(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              派车单详情 — {batchDetail?.batch?.batchCode}
            </DialogTitle>
          </DialogHeader>
          {batchDetail?.batch && (
            <div className="space-y-4">
              {/* 批次信息 */}
              <div className="bg-muted/50 rounded-lg p-3 grid grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">车牌号：</span>
                  <span className="font-bold">{batchDetail.batch.plateNumber}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">司机：</span>
                  <span className="font-medium">{batchDetail.batch.driverName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">电话：</span>
                  <span>{batchDetail.batch.driverPhone || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">日期：</span>
                  <span>{fmtDate(batchDetail.batch.dispatchDate)}</span>
                </div>
              </div>

              {/* 订单列表 */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">序号</TableHead>
                    <TableHead>客户订单号</TableHead>
                    <TableHead>货站运单号</TableHead>                    <TableHead>货站名称</TableHead>
                    <TableHead>目的站</TableHead>
                    <TableHead>重量(吨)</TableHead>
                    <TableHead>架数</TableHead>
                    <TableHead>收货地址</TableHead>
                    <TableHead>收货人</TableHead>                    <TableHead>收货电话</TableHead>
                    <TableHead>运费</TableHead>
                    <TableHead>备注</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(batchDetail.orders || []).map((bo: any, idx: number) => {
                    const o = bo.order;
                    return (
                      <TableRow key={bo.batchOrderId}>
                        <TableCell className="text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{o?.orderNumber || "-"}</TableCell>
                        <TableCell className="text-xs">{o?.freightWaybillNumber || "-"}</TableCell>
                        <TableCell className="text-xs">{o?.freightStationName || "-"}</TableCell>
                        <TableCell className="text-xs">{o?.ltlFinalStation || "-"}</TableCell>
                        <TableCell className="text-xs">{o?.weight || "-"}</TableCell>
                        <TableCell className="text-xs">{o?.packageCount || "-"}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate" title={[o?.destinationCity, o?.deliveryAddress].filter(Boolean).join("")}>
                          {[o?.destinationCity, o?.deliveryAddress].filter(Boolean).join("") || "-"}
                        </TableCell>
                        <TableCell className="text-xs">{o?.receiverName || "-"}</TableCell>
                        <TableCell className="text-xs">{o?.receiverPhone || "-"}</TableCell>
                        <TableCell className="text-xs">
                          {o?.dispatchPrice ? (
                            <div>
                              <div className="font-medium text-orange-600">¥{Number(o.dispatchPrice).toFixed(0)}</div>
                              {o.ltlUnitPrice && (
                                <div className="text-[10px] text-muted-foreground">
                                  {o.ltlUnitPrice}元/吨×{o.weight || 0}吨
                                  {o.ltlDeliveryFee && parseFloat(String(o.ltlDeliveryFee)) > 0 ? `+送${o.ltlDeliveryFee}` : ""}
                                </div>
                              )}
                            </div>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate" title={bo.remark || o?.remarks || ""}>
                          {bo.remark || o?.remarks || "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                司机执行提醒：派车单导出后，请提醒司机按提货、进站发运、回传开单照片的顺序操作；若明细中存在“目的站”，表示到站后还需衔接自提或末端送货。
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (batchDetail.batch && batchDetail.orders) {
                      exportDispatchSheet(batchDetail.batch, batchDetail.orders);
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-1" />
                  导出司机派车单
                </Button>
                <Button variant="outline" onClick={() => setViewBatchId(null)}>关闭</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 批量撤销派车确认 */}
      <AlertDialog open={showBatchDeleteConfirm} onOpenChange={setShowBatchDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量撤销派车</AlertDialogTitle>
            <AlertDialogDescription>
              将撤销 <span className="font-bold text-destructive">{selectedBatchIds.size}</span> 个派车批次，相关订单将回退为“已询价”状态。此操作不可恢复，确认继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => batchDeleteMutation.mutate({ batchIds: Array.from(selectedBatchIds) })}
              disabled={batchDeleteMutation.isPending}
            >
              {batchDeleteMutation.isPending ? "撤销中..." : `确认撤销 (${selectedBatchIds.size}个)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 智能拼货推荐弹窗 */}
      <SmartConsolidateDialog
        open={showSmartConsolidate}
        onOpenChange={setShowSmartConsolidate}
        vehicleLength={smartVehicleLength}
        setVehicleLength={setSmartVehicleLength}
        vehicleModel={smartVehicleModel}
        setVehicleModel={setSmartVehicleModel}
        capacity={smartCapacity}
        setCapacity={setSmartCapacity}
        targetCity={smartTargetCity}
        setTargetCity={setSmartTargetCity}
        availableOrders={availableOrders}
        onApply={(orderIds, recommendedLength, recommendedModel, recommendedCapacity) => {
          // 1. 勾选推荐订单
          setSelectedOrderIds(new Set(orderIds));
          // 2. 预填充车型表单
          if (recommendedLength) setVehicleLength(recommendedLength);
          if (recommendedModel) setVehicleModel(recommendedModel);
          if (recommendedCapacity) setCapacity(String(recommendedCapacity));
          // 3. 关闭拼货弹窗
          setShowSmartConsolidate(false);
          toast.success(`已应用推荐组合：选中 ${orderIds.length} 个订单，请右上角点击“派车”确认。`);
        }}
      />

      {/* 删除确认 */}
      <AlertDialog open={deleteBatchId !== null} onOpenChange={(open) => !open && setDeleteBatchId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这个派车批次吗？删除后不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteBatchId && deleteBatchMutation.mutate({ batchId: deleteBatchId })}
              disabled={deleteBatchMutation.isPending}
            >
              {deleteBatchMutation.isPending ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


// ==========================================================================
// 智能拼货推荐弹窗组件
// 调用 trpc.order.recommendLtlConsolidation 获取推荐组合，用户选择后回调 onApply
// ==========================================================================
const VEHICLE_LENGTH_DEFAULT_CAPACITY: Record<string, number> = {
  "4.2米": 5,
  "6.8米": 10,
  "7.6米": 12,
  "9.6米": 18,
  "13米": 28,
  "17.5米": 35,
};

interface SmartConsolidateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleLength: string;
  setVehicleLength: (v: string) => void;
  vehicleModel: string;
  setVehicleModel: (v: string) => void;
  capacity: string;
  setCapacity: (v: string) => void;
  targetCity: string;
  setTargetCity: (v: string) => void;
  availableOrders: any[];
  onApply: (orderIds: number[], vehicleLength: string, vehicleModel: string, capacity: number) => void;
}

function SmartConsolidateDialog(props: SmartConsolidateDialogProps) {
  const {
    open, onOpenChange,
    vehicleLength, setVehicleLength,
    vehicleModel, setVehicleModel,
    capacity, setCapacity,
    targetCity, setTargetCity,
    availableOrders, onApply,
  } = props;

  const capacityNum = Number(capacity);
  const canQuery = open && capacityNum > 0;

  // 收集候选目的站列表（来自当前可派订单）
  const candidateCities = useMemo(() => {
    const set = new Set<string>();
    (availableOrders || []).forEach((o: any) => {
      if (o.destinationCity) set.add(String(o.destinationCity));
    });
    return Array.from(set).sort();
  }, [availableOrders]);

  // 调用智能拼货推荐接口
  const { data: recoData, isLoading, refetch } = trpc.order.recommendLtlConsolidation.useQuery(
    {
      capacity: capacityNum,
      vehicleLength: vehicleLength || undefined,
      vehicleModel: vehicleModel || undefined,
      targetDestinationCity: targetCity || undefined,
      maxRecommendations: 5,
      fillRateMin: 0.3,
    },
    { enabled: canQuery }
  );

  // 选车长后自动推荐默认载重
  const handleLengthChange = (v: string) => {
    setVehicleLength(v);
    const def = VEHICLE_LENGTH_DEFAULT_CAPACITY[v];
    if (def && (!capacity || Number(capacity) === 0)) {
      setCapacity(String(def));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            智能拼货推荐
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 输入车型与载重 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">车长</Label>
              <Select value={vehicleLength} onValueChange={handleLengthChange}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="选择车长" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4.2米">4.2米</SelectItem>
                  <SelectItem value="6.8米">6.8米</SelectItem>
                  <SelectItem value="7.6米">7.6米</SelectItem>
                  <SelectItem value="9.6米">9.6米</SelectItem>
                  <SelectItem value="13米">13米</SelectItem>
                  <SelectItem value="17.5米">17.5米</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">车型</Label>
              <Select value={vehicleModel} onValueChange={setVehicleModel}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="选择车型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="高栏">高栏</SelectItem>
                  <SelectItem value="平板">平板</SelectItem>
                  <SelectItem value="厢式">厢式</SelectItem>
                  <SelectItem value="飞翼">飞翼</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">载重(吨)<span className="text-red-500">*</span></Label>
              <Input
                type="number"
                step="0.1"
                value={capacity}
                onChange={e => setCapacity(e.target.value)}
                placeholder="必填"
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">目的站(可选)</Label>
              <Select value={targetCity || "__all__"} onValueChange={(v) => setTargetCity(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="所有目的站" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">所有目的站</SelectItem>
                  {candidateCities.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              算法：按目的站分组 → 加急优先 + 重量降序贪心装箱，装载率不低于 30%
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={!canQuery || isLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isLoading ? "animate-spin" : ""}`} />
              刷新推荐
            </Button>
          </div>

          {/* 推荐结果 */}
          {!canQuery && (
            <div className="rounded-md border border-dashed border-violet-200 bg-violet-50/50 p-6 text-center text-sm text-muted-foreground">
              请填写载重(吨)后查看推荐结果
            </div>
          )}
          {canQuery && isLoading && (
            <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              智能计算中…
            </div>
          )}
          {canQuery && !isLoading && recoData && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                共扫描 <b>{recoData.totalCandidates}</b> 个待派订单，给出 <b className="text-violet-700">{recoData.recommendations.length}</b> 个推荐组合（按综合评分降序）：
              </div>
              {recoData.recommendations.length === 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  暂无满足装载率 30% 的拼货组合。可以尝试调小载重，或选择具体目的站。
                </div>
              )}
              {recoData.recommendations.map((rec: any, idx: number) => (
                <Card key={idx} className="border-violet-100">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-violet-600">推荐 #{idx + 1}</Badge>
                        <span className="font-medium text-sm">
                          目的站：{rec.destinationCity}
                          {rec.destinationProvince && <span className="text-muted-foreground"> · {rec.destinationProvince}</span>}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        className="bg-violet-600 hover:bg-violet-700"
                        onClick={() => {
                          const ids = rec.orders.map((o: any) => o.id);
                          onApply(ids, vehicleLength, vehicleModel, capacityNum);
                        }}
                      >
                        <Truck className="h-3.5 w-3.5 mr-1" />
                        应用此组合
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs mb-2">
                      <div className="rounded bg-slate-50 px-2 py-1">
                        <div className="text-muted-foreground">单数</div>
                        <div className="font-bold">{rec.orderCount}</div>
                      </div>
                      <div className="rounded bg-orange-50 px-2 py-1">
                        <div className="text-muted-foreground">总吨位</div>
                        <div className="font-bold text-orange-700">{rec.totalWeight} 吨</div>
                      </div>
                      <div className="rounded bg-green-50 px-2 py-1">
                        <div className="text-muted-foreground">装载率</div>
                        <div className="font-bold text-green-700">{rec.fillRate}%</div>
                      </div>
                      <div className="rounded bg-red-50 px-2 py-1">
                        <div className="text-muted-foreground">加急</div>
                        <div className="font-bold text-red-700">{rec.urgentCount}</div>
                      </div>
                      <div className="rounded bg-blue-50 px-2 py-1">
                        <div className="text-muted-foreground">总运费</div>
                        <div className="font-bold text-blue-700">¥{rec.totalRevenue}</div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground border-t pt-2">
                      <span className="font-medium">订单明细：</span>
                      <div className="mt-1 max-h-32 overflow-y-auto space-y-1">
                        {rec.orders.map((o: any) => (
                          <div key={o.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-slate-50">
                            <span className="truncate">
                              {o.isUrgent && <Badge variant="destructive" className="mr-1 text-[10px] h-4 px-1">急</Badge>}
                              <span className="font-mono">{o.orderNumber}</span>
                              <span className="text-muted-foreground"> · {o.customerName}</span>
                              <span className="text-muted-foreground"> · {o.cargoName}</span>
                            </span>
                            <span className="font-medium text-orange-700 whitespace-nowrap">{o.weight} 吨</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
// build-$(date +%s)
