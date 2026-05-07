import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Store, Search, RefreshCw, ArrowRight, Plus, Clock,
  CheckCircle2, Truck, Download, AlertTriangle, Undo2, Trash2, MoreHorizontal,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import React, { useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { TablePagination } from "@/components/TablePagination";
import { useTableSort, SortableHeader } from "@/components/SortableTable";
import { getMergedChildDeleteLockReason, getMergedChildRollbackLockReason } from "@/lib/commandGroupRules";

const STATUS_LABELS: Record<string, string> = {
  pending_assign: "待分配",
  pending_price: "待定价",
  pending_dispatch: "待调度",
  pending_find_vehicle: "待找车",
  dispatched: "已调度",
  in_transit: "运输中",
  delivered: "已送达",
  signed: "已签收",
  settled: "已结算",
};

const STATUS_COLORS: Record<string, string> = {
  pending_assign: "bg-yellow-100 text-yellow-700",
  pending_price: "bg-orange-100 text-orange-700",
  pending_dispatch: "bg-blue-100 text-blue-700",
  dispatched: "bg-indigo-100 text-indigo-700",
  in_transit: "bg-green-100 text-green-700",
  delivered: "bg-emerald-100 text-emerald-700",
  signed: "bg-green-200 text-green-800",
  settled: "bg-green-200 text-green-800",
};

const ROLLBACK_MAP: Record<string, string> = {
  pending_price: "待处理",
  pending_find_vehicle: "待定价",
  pending_dispatch: "待找车",
  dispatched: "待派车",
  in_transit: "已调度",
  delivered: "运输中",
  signed: "已送达",
  pending_assign: "",
};

export default function ChainWorkspace() {
  const { hasPermission } = usePermissions();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [, navigate] = useLocation();

  // 退回相关
  const [rollbackOrder, setRollbackOrder] = useState<any>(null);
  const [rollbackReason, setRollbackReason] = useState("");
  // 删除相关
  const [deleteOrder, setDeleteOrder] = useState<any>(null);
  // 批量退回相关
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchRollbackOpen, setBatchRollbackOpen] = useState(false);
  const [batchRollbackReason, setBatchRollbackReason] = useState("");
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const getDeleteLockReason = useCallback((order: any) => getMergedChildDeleteLockReason(order), []);
  const getRollbackLockReason = useCallback((order: any) => getMergedChildRollbackLockReason(order), []);
  const openDeleteDialog = useCallback((order: any) => {
    const lockReason = getDeleteLockReason(order);
    if (lockReason) {
      toast.error(lockReason);
      return;
    }
    setDeleteOrder(order);
  }, [getDeleteLockReason]);
  const openRollbackDialog = useCallback((order: any) => {
    const lockReason = getRollbackLockReason(order);
    if (lockReason) {
      toast.error(lockReason);
      return;
    }
    setRollbackOrder(order);
    setRollbackReason("");
  }, [getRollbackLockReason]);

  const utils = trpc.useUtils();

  const { data: orderData, isLoading, refetch } = trpc.order.list.useQuery(
    { page: 1, pageSize: 100, keyword: search || undefined },
    { refetchInterval: 10000 }
  );

  const rollbackMutation = trpc.order.rollbackStatus.useMutation({
    onSuccess: (data) => {
      toast.success(`订单已退回：${data.fromLabel} → ${data.toLabel}`);
      setRollbackOrder(null);
      setRollbackReason("");
      utils.order.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const batchRollbackMutation = trpc.order.batchRollback.useMutation({
    onSuccess: (res) => {
      utils.order.list.invalidate();
      const msg = res.skipCount > 0 ? `成功退回 ${res.successCount} 个，${res.skipCount} 个跳过` : `成功退回 ${res.successCount} 个订单`;
      toast.success(msg);
      setSelectedIds(new Set()); setBatchRollbackOpen(false); setBatchRollbackReason("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = trpc.order.delete.useMutation({
    onSuccess: () => {
      toast.success("订单已删除");
      setDeleteOrder(null);
      utils.order.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // 分页状态
  const [activePage, setActivePage] = useState(1);
  const [activePageSize, setActivePageSize] = useState(100);
  const [completedPage, setCompletedPage] = useState(1);
  const [completedPageSize, setCompletedPageSize] = useState(100);

  const allOrders = orderData?.items ?? [];
  const activeOrders = allOrders.filter(o => !["cancelled"].includes(o.status));
  const completedOrders = allOrders.filter(o => o.status === "signed" || o.status === "delivered");

  // 进行中Tab排序
  const chainActiveSortGetters = useMemo(() => ({
    createdAt: (o: any) => o.createdAt ? new Date(o.createdAt).getTime() : 0,
    weight: (o: any) => parseFloat(o.weight) || 0,
    status: (o: any) => o.status || "",
    customerName: (o: any) => o.customerName || "",
    businessType: (o: any) => o.businessType || "",
  }), []);
  const { sorted: sortedActiveOrders, sort: chainActiveSort, toggleSort: toggleChainActiveSort } = useTableSort(activeOrders, chainActiveSortGetters);

  // 已完成Tab排序
  const chainCompletedSortGetters = useMemo(() => ({
    createdAt: (o: any) => o.createdAt ? new Date(o.createdAt).getTime() : 0,
    weight: (o: any) => parseFloat(o.weight) || 0,
    status: (o: any) => o.status || "",
    customerName: (o: any) => o.customerName || "",
  }), []);
  const { sorted: sortedCompletedOrders, sort: chainCompletedSort, toggleSort: toggleChainCompletedSort } = useTableSort(completedOrders, chainCompletedSortGetters);

  const stats = {
    active: activeOrders.filter(o => ["pending_assign", "pending_price", "pending_dispatch"].includes(o.status)).length,
    inTransit: activeOrders.filter(o => ["dispatched", "in_transit"].includes(o.status)).length,
    completed: allOrders.filter(o => ["delivered", "signed"].includes(o.status)).length,
  };

  const canRollback = (status: string) => status !== "pending_assign" && ROLLBACK_MAP[status] !== undefined && ROLLBACK_MAP[status] !== "";

  const exportCSV = useCallback((headers: string[], rows: string[][], filename: string) => {
    const csvContent = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleExportLedger = () => {
    const data = [...activeOrders, ...completedOrders];
    if (data.length === 0) { toast.info("暂无数据可导出"); return; }
    const headers = ["订单号", "客户名称", "货物名称", "业务类型", "发货地", "目的地", "吨位", "报价", "运费", "状态", "创建时间"];
    const rows = data.map(o => [
      o.orderNumber || o.systemCode || "",
      o.customerName || "",
      o.cargoName || "",
      o.businessType || "",
      o.originCity || "",
      o.destinationCity || "",
      o.weight ? String(o.weight) : "",
      o.quotedPrice ? String(o.quotedPrice) : "",
      o.dispatchPrice ? String(o.dispatchPrice) : "",
      STATUS_LABELS[o.status] || o.status,
      o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "",
    ]);
    exportCSV(headers, rows, `连锁客服台账_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(`已导出 ${rows.length} 条记录`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              连锁工作台
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              连锁客户订单管理 → 跟踪运输状态 → 台账导出
            </p>
          </div>
          <div className="flex gap-2">
            {hasPermission("order.rollback") && selectedIds.size > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50">
                    <MoreHorizontal className="h-4 w-4 mr-1" />
                    更多流程操作
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { setBatchRollbackOpen(true); setBatchRollbackReason(""); }}>
                    <Undo2 className="h-4 w-4 mr-2 text-orange-600" />
                    批量退回 ({selectedIds.size})
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="outline" size="sm" onClick={handleExportLedger}>
              <Download className="h-4 w-4 mr-1" />
              导出台账
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              刷新
            </Button>
            <Button size="sm" onClick={() => navigate("/orders/create")}>
              <Plus className="h-4 w-4 mr-1" />
              录入订单
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100">
                <Clock className="h-4 w-4 text-yellow-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">待处理</div>
                <div className="text-lg font-bold text-yellow-700">{stats.active}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Truck className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">已调度</div>
                <div className="text-lg font-bold text-green-700">{stats.inTransit}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">已完成</div>
                <div className="text-lg font-bold text-emerald-700">{stats.completed}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索订单号、客户名、目的地..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="active">
              进行中 {activeOrders.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{activeOrders.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="completed">
              已完成 {completedOrders.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{completedOrders.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"><Checkbox checked={sortedActiveOrders.length > 0 && sortedActiveOrders.every((o: any) => selectedIds.has(o.id))} onCheckedChange={() => { if (sortedActiveOrders.every((o: any) => selectedIds.has(o.id))) { const next = new Set(selectedIds); sortedActiveOrders.forEach((o: any) => next.delete(o.id)); setSelectedIds(next); } else { const next = new Set(selectedIds); sortedActiveOrders.forEach((o: any) => next.add(o.id)); setSelectedIds(next); } }} /></TableHead>
                      <TableHead>客户订单号</TableHead>
                      <SortableHeader sortKey="customerName" currentSort={chainActiveSort} onToggle={toggleChainActiveSort}>客户 · 货物</SortableHeader>
                      <SortableHeader sortKey="businessType" currentSort={chainActiveSort} onToggle={toggleChainActiveSort}>业务类型</SortableHeader>
                      <TableHead>路线</TableHead>
                      <SortableHeader sortKey="weight" currentSort={chainActiveSort} onToggle={toggleChainActiveSort}>吨位</SortableHeader>
                      <SortableHeader sortKey="status" currentSort={chainActiveSort} onToggle={toggleChainActiveSort}>状态</SortableHeader>
                      <SortableHeader sortKey="createdAt" currentSort={chainActiveSort} onToggle={toggleChainActiveSort}>创建时间</SortableHeader>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
                    ) : activeOrders.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">暂无进行中订单</TableCell></TableRow>
                    ) : sortedActiveOrders.map((order) => (
                      <TableRow key={order.id} className={order.isUrgent ? "bg-red-50/50" : ""}>
                        <TableCell><Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} /></TableCell>
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-1">
                            {order.isUrgent && <AlertTriangle className="h-3 w-3 text-red-500" />}
                            {order.orderNumber || order.systemCode}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{order.customerName || "-"}</div>
                          <div className="text-xs text-muted-foreground">{order.cargoName || "-"}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {order.businessType === "outsource" ? "外请" : order.businessType === "self" ? "自运" : "零担"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs">
                            {order.originCity || "?"} <ArrowRight className="h-3 w-3" /> {order.destinationCity || "?"}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{order.weight ? `${order.weight}t` : "-"}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[order.status] || "bg-gray-100 text-gray-700"} variant="secondary">
                            {STATUS_LABELS[order.status] || order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(order.createdAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {((canRollback(order.status) && hasPermission("order.rollback")) || hasPermission("order.delete")) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground">
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {canRollback(order.status) && hasPermission("order.rollback") && (
                                    <DropdownMenuItem
                                      onClick={() => openRollbackDialog(order)}
                                      disabled={Boolean(getRollbackLockReason(order))}
                                    >
                                      <Undo2 className="mr-2 h-3.5 w-3.5 text-orange-600" />
                                      退回上一步
                                    </DropdownMenuItem>
                                  )}
                                  {hasPermission("order.delete") && (
                                    <DropdownMenuItem
                                      onClick={() => openDeleteDialog(order)}
                                      disabled={Boolean(getDeleteLockReason(order))}
                                    >
                                      <Trash2 className="mr-2 h-3.5 w-3.5 text-red-600" />
                                      删除订单
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination total={activeOrders.length} page={activePage} pageSize={activePageSize} onPageChange={setActivePage} onPageSizeChange={setActivePageSize} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="completed">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>客户订单号</TableHead>
                      <SortableHeader sortKey="customerName" currentSort={chainCompletedSort} onToggle={toggleChainCompletedSort}>客户 · 货物</SortableHeader>
                      <TableHead>路线</TableHead>
                      <TableHead>报价</TableHead>
                      <TableHead>运费</TableHead>
                      <SortableHeader sortKey="status" currentSort={chainCompletedSort} onToggle={toggleChainCompletedSort}>状态</SortableHeader>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedCompletedOrders.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">暂无已完成订单</TableCell></TableRow>
                    ) : sortedCompletedOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-xs">{order.orderNumber || order.systemCode}</TableCell>
                        <TableCell>
                          <div className="text-sm">{order.customerName || "-"}</div>
                          <div className="text-xs text-muted-foreground">{order.cargoName || "-"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs">
                            {order.originCity || "?"} <ArrowRight className="h-3 w-3" /> {order.destinationCity || "?"}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {order.quotedPrice ? `¥${order.quotedPrice}` : "-"}
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {order.dispatchPrice ? `¥${order.dispatchPrice}` : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[order.status] || "bg-gray-100 text-gray-700"} variant="secondary">
                            {STATUS_LABELS[order.status] || order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {((canRollback(order.status) && hasPermission("order.rollback")) || hasPermission("order.delete")) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground">
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {canRollback(order.status) && hasPermission("order.rollback") && (
                                    <DropdownMenuItem
                                      onClick={() => openRollbackDialog(order)}
                                      disabled={Boolean(getRollbackLockReason(order))}
                                    >
                                      <Undo2 className="mr-2 h-3.5 w-3.5 text-orange-600" />
                                      退回上一步
                                    </DropdownMenuItem>
                                  )}
                                  {hasPermission("order.delete") && (
                                    <DropdownMenuItem
                                      onClick={() => openDeleteDialog(order)}
                                      disabled={Boolean(getDeleteLockReason(order))}
                                    >
                                      <Trash2 className="mr-2 h-3.5 w-3.5 text-red-600" />
                                      删除订单
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination total={completedOrders.length} page={completedPage} pageSize={completedPageSize} onPageChange={setCompletedPage} onPageSizeChange={setCompletedPageSize} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* 批量退回确认弹窗 */}
      <Dialog open={batchRollbackOpen} onOpenChange={(open) => { if (!open) { setBatchRollbackOpen(false); setBatchRollbackReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <Undo2 className="h-5 w-5" /> 批量退回上一步
            </DialogTitle>
            <DialogDescription>
              已选择 {selectedIds.size} 个订单，将全部退回到上一个流程节点。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>退回原因 <span className="text-red-500">*</span></Label>
              <Textarea placeholder="请填写批量退回原因..." value={batchRollbackReason} onChange={(e) => setBatchRollbackReason(e.target.value)} className="mt-1" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBatchRollbackOpen(false); setBatchRollbackReason(""); }}>取消</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" disabled={!batchRollbackReason.trim() || batchRollbackMutation.isPending}
              onClick={() => batchRollbackMutation.mutate({ ids: Array.from(selectedIds), reason: batchRollbackReason.trim() })}>
              {batchRollbackMutation.isPending ? "退回中..." : `确认退回 ${selectedIds.size} 个`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 退回确认弹窗 */}
      <Dialog open={!!rollbackOrder} onOpenChange={(open) => { if (!open) { setRollbackOrder(null); setRollbackReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <Undo2 className="h-5 w-5" /> 退回上一步
            </DialogTitle>
            <DialogDescription>
              订单 {rollbackOrder?.orderNumber || rollbackOrder?.systemCode} 将从「{STATUS_LABELS[rollbackOrder?.status] || rollbackOrder?.status}」退回到「{ROLLBACK_MAP[rollbackOrder?.status] || "上一步"}」
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>退回原因 <span className="text-red-500">*</span></Label>
              <Textarea placeholder="请填写退回原因..." value={rollbackReason} onChange={(e) => setRollbackReason(e.target.value)} className="mt-1" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRollbackOrder(null); setRollbackReason(""); }}>取消</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" disabled={!rollbackReason.trim() || rollbackMutation.isPending}
              onClick={() => rollbackOrder && rollbackMutation.mutate({ id: rollbackOrder.id, reason: rollbackReason.trim() })}>
              {rollbackMutation.isPending ? "退回中..." : "确认退回"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <AlertDialog open={!!deleteOrder} onOpenChange={(open) => { if (!open) setDeleteOrder(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除订单？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除订单 {deleteOrder?.orderNumber || deleteOrder?.systemCode}，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteOrder && deleteMutation.mutate({ id: deleteOrder.id })}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
