import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Save,
  AlertTriangle,
  Loader2,
  History,
  ArrowRight,
  Info,
  Lock,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  outsource: "外请",
  self: "自运",
  ltl: "零担",
};

const SETTLEMENT_LABELS: Record<string, string> = {
  monthly: "月结",
  cash: "现付",
  collect: "到付",
};

const PACKAGING_LABELS: Record<string, string> = {
  pallet: "托盘",
  loose: "散装",
  pallet_loaded: "带板装",
};

const RECEIVING_STATUS_LABELS: Record<string, string> = {
  receivable: "可收货",
  wait_notice: "等通知",
  not_receivable: "暂不收货",
};

const BUSINESS_TYPE_EDITABLE_STATUSES = [
  "pending_assign",
  "pending_price",
  "priced",
  "pending_dispatch",
  "pending_vehicle",
  "pending_inquiry",
  "on_hold",
];

export default function OrderEdit() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const searchString = useSearch();
  const orderId = parseInt(params.id || "0");
  const utils = trpc.useUtils();

  // 根据来源页面决定返回路径
  const returnPath = new URLSearchParams(searchString).get("from") || "/station/entry";
  const returnLabel = (() => {
    if (returnPath.includes("entry")) return "返回录单台";
    if (returnPath.includes("command")) return "返回指挥台";
    if (returnPath.includes("find-vehicle")) return "返回找车台";
    if (returnPath.includes("dispatch")) return "返回派车台";
    if (returnPath.includes("inquiry")) return "返回询价台";
    if (returnPath.includes("pod")) return "返回回单押金台";
    if (returnPath.includes("ltl")) return "返回零担统一工作台";
    if (returnPath.includes("chain")) return "返回连锁工作台";
    return "返回录单台";
  })();

  const { data: order, isLoading: orderLoading } = trpc.order.getById.useQuery(
    { id: orderId },
    { enabled: orderId > 0 }
  );
  const { data: customers } = trpc.customer.list.useQuery({ activeOnly: true });
  const { data: warehouses } = trpc.warehouse.list.useQuery({ activeOnly: true });
  const { data: noteChangeLogs } = trpc.order.getNoteChangeLogs.useQuery(
    { orderId },
    { enabled: orderId > 0 }
  );

  const [form, setForm] = useState({
    businessType: "outsource" as "outsource" | "self" | "ltl",
    isUrgent: false,
    urgentReason: "",
    customerId: undefined as number | undefined,
    customerName: "",
    customerPhone: "",
    settlementType: "monthly" as "monthly" | "cash" | "collect",
    cargoName: "",
    weight: "",
    packagingType: "pallet" as "pallet" | "loose" | "pallet_loaded",
    cargoSpec: "",
    specialRequirements: "",
    warehouseId: undefined as number | undefined,
    warehouseName: "",
    originCity: "",
    deliveryAddress: "",
    destinationCity: "",
    receiverName: "",
    receiverPhone: "",
    quotedPrice: "",
    orderNumber: "",
    remarks: "",
    department: "",
    receivingStatus: "" as "" | "receivable" | "wait_notice" | "not_receivable",
    expectedReceiveAt: "",
    nextFollowUpAt: "",
    receivingReason: "",
    receivingNote: "",
    dispatcherRemark: "",
  });

  const [initialized, setInitialized] = useState(false);

  // 当订单数据加载完成后，填充表单
  useEffect(() => {
    if (order && !initialized) {
      setForm({
        businessType: (order.businessType as any) || "outsource",
        isUrgent: order.isUrgent ?? false,
        urgentReason: order.urgentReason || "",
        customerId: order.customerId ?? undefined,
        customerName: order.customerName || "",
        customerPhone: order.customerPhone || "",
        settlementType: (order.settlementType as any) || "monthly",
        cargoName: order.cargoName || "",
        weight: order.weight || "",
        packagingType: (order.packagingType as any) || "pallet",
        cargoSpec: order.cargoSpec || "",
        specialRequirements: order.specialRequirements || "",
        warehouseId: order.warehouseId ?? undefined,
        warehouseName: order.warehouseName || "",
        originCity: order.originCity || "",
        deliveryAddress: order.deliveryAddress || "",
        destinationCity: order.destinationCity || "",
        receiverName: order.receiverName || "",
        receiverPhone: order.receiverPhone || "",
        quotedPrice: order.quotedPrice || "",
        orderNumber: order.orderNumber || "",
        remarks: order.remarks || "",
        department: order.department || "",
        receivingStatus: ((order as any).receivingStatus || "") as "" | "receivable" | "wait_notice" | "not_receivable",
        expectedReceiveAt: (order as any).expectedReceiveAt ? new Date((order as any).expectedReceiveAt).toISOString().slice(0, 16) : "",
        nextFollowUpAt: (order as any).nextFollowUpAt ? new Date((order as any).nextFollowUpAt).toISOString().slice(0, 16) : "",
        receivingReason: (order as any).receivingReason || "",
        receivingNote: (order as any).receivingNote || "",
        dispatcherRemark: (order as any).dispatcherRemark || "",
      });
      setInitialized(true);
    }
  }, [order, initialized]);

  const updateMutation = trpc.order.update.useMutation({
    onSuccess: () => {
      toast.success("订单更新成功！");
      utils.order.list.invalidate();
      utils.order.getById.invalidate({ id: orderId });
      setLocation(returnPath);
    },
    onError: (err) => {
      toast.error(`更新失败：${err.message}`);
    },
  });

  const handleCustomerChange = (customerId: string) => {
    const id = parseInt(customerId);
    const customer = customers?.find((c) => c.id === id);
    if (customer) {
      setForm((prev) => ({
        ...prev,
        customerId: id,
        customerName: customer.name,
        customerPhone: customer.phone || "",
        settlementType: (customer.settlementType as any) || "monthly",
        department: customer.department || "",
      }));
    }
  };

  const handleWarehouseChange = (warehouseId: string) => {
    const id = parseInt(warehouseId);
    const warehouse = warehouses?.find((w) => w.id === id);
    if (warehouse) {
      setForm((prev) => ({
        ...prev,
        warehouseId: id,
        warehouseName: warehouse.name,
        originCity: warehouse.city || "",
      }));
    }
  };

  const orderStatus = order?.status ?? "";
  const isMergedChildOrder =
    Boolean((order as any)?.parentId) ||
    Boolean(order?.mergedPlanNumber && orderStatus === "merged" && !(order as any)?.isMerged);
  const canEditBusinessType = Boolean(order) && BUSINESS_TYPE_EDITABLE_STATUSES.includes(orderStatus) && !isMergedChildOrder;
  const showReceivingSection = Boolean(
    (order as any)?.receivingStatus ||
    (order as any)?.receivingNote ||
    (order as any)?.dispatcherRemark ||
    ["pending_vehicle", "pending_approval", "dispatched", "in_transit", "delivered", "signed", "on_hold"].includes(orderStatus)
  );
  const businessTypeRuleMessage = useMemo(() => {
    if (!order) return null;

    if (!BUSINESS_TYPE_EDITABLE_STATUSES.includes(orderStatus)) {
      return {
        tone: "amber" as const,
        title: "业务类型已随流程锁定",
        description: "订单已进入调度流程，业务类型不能再直接修改。如需调整，请先将订单退回到允许编辑的初始阶段。",
      };
    }

    if (isMergedChildOrder) {
      return {
        tone: "red" as const,
        title: "当前为合并子订单，业务类型不可单独修改",
        description: `当前订单属于合并计划${order.mergedPlanNumber ? `「${order.mergedPlanNumber}」` : ""}，业务类型只能由主订单统一修改，子订单（指引单）前端已锁定，后端也会继续校验。`,
      };
    }

    if (order.mergedPlanNumber) {
      return {
        tone: "blue" as const,
        title: "当前为合并主订单编辑场景",
        description: "主订单修改业务类型后，将同步影响同一合并计划下的子订单，请在保存前确认整组业务口径一致。",
      };
    }

    return {
      tone: "slate" as const,
      title: "当前业务类型可编辑",
      description: "该订单仍处于允许修改业务类型的阶段；保存后将按最新业务类型参与后续找车、审批与回单流程。",
    };
  }, [order, orderStatus, isMergedChildOrder]);

  const handleSubmit = () => {
    if (!form.customerName) {
      toast.error("请选择客户");
      return;
    }
    if (!form.destinationCity) {
      toast.error("请填写目的城市");
      return;
    }
    if (!form.cargoName) {
      toast.error("请填写货物名称");
      return;
    }

    if (form.receivingStatus === "wait_notice" && !form.nextFollowUpAt) {
      toast.error("收货状态为“等通知”时，必须填写下次跟进时间");
      return;
    }
    if (form.receivingStatus === "not_receivable" && !form.receivingReason.trim()) {
      toast.error("收货状态为“暂不收货”时，必须填写原因");
      return;
    }

    const normalizedReceivingStatus = form.receivingStatus || undefined;
    const normalizedExpectedReceiveAt = normalizedReceivingStatus ? form.expectedReceiveAt || undefined : undefined;
    const normalizedNextFollowUpAt =
      form.receivingStatus === "wait_notice" ? form.nextFollowUpAt || undefined : undefined;
    const normalizedReceivingReason =
      form.receivingStatus === "not_receivable" ? form.receivingReason.trim() || undefined : undefined;
    const normalizedReceivingNote = form.receivingNote.trim() || undefined;
    const normalizedDispatcherRemark = form.dispatcherRemark.trim() || undefined;

    updateMutation.mutate({
      id: orderId,
      businessType: canEditBusinessType ? form.businessType : undefined,
      isUrgent: form.isUrgent,
      urgentReason: form.urgentReason || undefined,
      customerId: form.customerId,
      customerName: form.customerName,
      customerPhone: form.customerPhone || undefined,
      settlementType: form.settlementType,
      cargoName: form.cargoName,
      weight: form.weight || undefined,
      packagingType: form.packagingType,
      cargoSpec: form.cargoSpec || undefined,
      specialRequirements: form.specialRequirements || undefined,
      warehouseId: form.warehouseId,
      warehouseName: form.warehouseName || undefined,
      originCity: form.originCity || undefined,
      deliveryAddress: form.deliveryAddress || undefined,
      destinationCity: form.destinationCity,
      receiverName: form.receiverName || undefined,
      receiverPhone: form.receiverPhone || undefined,
      quotedPrice: form.quotedPrice || undefined,
      orderNumber: form.orderNumber || undefined,
      remarks: form.remarks || undefined,
      department: form.department || undefined,
      receivingStatus: normalizedReceivingStatus,
      expectedReceiveAt: normalizedExpectedReceiveAt,
      nextFollowUpAt: normalizedNextFollowUpAt,
      receivingReason: normalizedReceivingReason,
      receivingNote: normalizedReceivingNote,
      dispatcherRemark: normalizedDispatcherRemark,
    });
  };

  if (orderLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4 max-w-4xl">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation(returnPath)}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              {returnLabel}
            </Button>
            <Skeleton className="h-7 w-32" />
          </div>
          <Card>
            <CardContent className="p-6 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!order) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium mb-2">订单不存在</h2>
          <p className="text-muted-foreground mb-4">未找到ID为 {orderId} 的订单</p>
          <Button onClick={() => setLocation(returnPath)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            {returnLabel}
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-4xl">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation(returnPath)}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              {returnLabel}
            </Button>
            <h1 className="text-xl font-semibold">编辑订单</h1>
            <Badge variant="outline" className="text-xs">
              {order.orderNumber || order.systemCode}
            </Badge>
          </div>
          <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            保存修改
          </Button>
        </div>

        {businessTypeRuleMessage && (
          <Card
            className={
              businessTypeRuleMessage.tone === "red"
                ? "border-red-200 bg-red-50/60"
                : businessTypeRuleMessage.tone === "amber"
                  ? "border-amber-200 bg-amber-50/60"
                  : businessTypeRuleMessage.tone === "blue"
                    ? "border-blue-200 bg-blue-50/60"
                    : "border-slate-200 bg-slate-50/60"
            }
          >
            <CardContent className="flex items-start gap-3 p-4">
              <div
                className={
                  businessTypeRuleMessage.tone === "red"
                    ? "rounded-full bg-red-100 p-2 text-red-600"
                    : businessTypeRuleMessage.tone === "amber"
                      ? "rounded-full bg-amber-100 p-2 text-amber-600"
                      : businessTypeRuleMessage.tone === "blue"
                        ? "rounded-full bg-blue-100 p-2 text-blue-600"
                        : "rounded-full bg-slate-100 p-2 text-slate-600"
                }
              >
                {businessTypeRuleMessage.tone === "red" ? (
                  <Lock className="h-4 w-4" />
                ) : (
                  <Info className="h-4 w-4" />
                )}
              </div>
              <div className="space-y-1">
                <div className="text-sm font-semibold">{businessTypeRuleMessage.title}</div>
                <p className="text-sm text-muted-foreground">{businessTypeRuleMessage.description}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 基本信息 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 业务类型 */}
              <div className="space-y-1.5">
                <Label className="text-sm">后续分流方向 <span className="text-red-500">*</span></Label>
                {(() => {
                  const hasMergedPlan = !!order.mergedPlanNumber;

                  if (!BUSINESS_TYPE_EDITABLE_STATUSES.includes(order.status)) {
                    return (
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-full items-center rounded-md border bg-muted/50 px-3 text-sm cursor-not-allowed">
                          <Lock className="h-3 w-3 mr-1.5 text-muted-foreground" />
                          {BUSINESS_TYPE_LABELS[form.businessType] || form.businessType}
                        </div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-4 w-4 text-amber-500 shrink-0 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-[240px]">
                              <p className="text-xs">订单已进入调度流程，无法修改业务类型。请先将订单退回到初始状态后再修改。</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    );
                  }

                  if (isMergedChildOrder) {
                    return (
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-full items-center rounded-md border bg-muted/50 px-3 text-sm cursor-not-allowed">
                          <Lock className="h-3 w-3 mr-1.5 text-muted-foreground" />
                          {BUSINESS_TYPE_LABELS[form.businessType] || form.businessType}
                        </div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-4 w-4 text-red-500 shrink-0 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-[300px]">
                              <p className="text-xs">当前是合并订单的子订单（指引单），业务类型只能在主订单统一修改，子订单不允许单独调整。</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    );
                  }

                  return (
                    <div>
                      <Select value={form.businessType} onValueChange={(v) => setForm((p) => ({ ...p, businessType: v as any }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(BUSINESS_TYPE_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {hasMergedPlan && (
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          主订单修改业务类型后，会同步更新同一合并计划号下的子订单。
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
              {/* 部门 */}
              <div className="space-y-1.5">
                <Label className="text-sm">部门 <span className="text-muted-foreground text-xs font-normal">(内部分类，可选)</span></Label>
                <Input value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} placeholder="如：业务部、零担部" />
              </div>
              {/* 客户订单号 */}
              <div className="space-y-1.5">
                <Label className="text-sm">客户订单号</Label>
                <Input value={form.orderNumber} onChange={(e) => setForm((p) => ({ ...p, orderNumber: e.target.value }))} placeholder="客户自编订单号" />
              </div>
            </div>

            {/* 加急 */}
            <div className="flex items-center gap-4 p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2">
                <Switch checked={form.isUrgent} onCheckedChange={(v) => setForm((p) => ({ ...p, isUrgent: v }))} />
                <Label className="text-sm font-medium flex items-center gap-1">
                  {form.isUrgent && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                  加急订单
                </Label>
              </div>
              {form.isUrgent && (
                <Input
                  className="flex-1"
                  value={form.urgentReason}
                  onChange={(e) => setForm((p) => ({ ...p, urgentReason: e.target.value }))}
                  placeholder="加急原因..."
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* 客户信息 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">客户信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">客户 <span className="text-red-500">*</span></Label>
                <Select value={form.customerId ? String(form.customerId) : ""} onValueChange={handleCustomerChange}>
                  <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
                  <SelectContent>
                    {customers?.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">客户电话</Label>
                <Input value={form.customerPhone} onChange={(e) => setForm((p) => ({ ...p, customerPhone: e.target.value }))} placeholder="客户电话" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">结算方式</Label>
                <Select value={form.settlementType} onValueChange={(v) => setForm((p) => ({ ...p, settlementType: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SETTLEMENT_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 货物信息 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">货物信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">货物名称 <span className="text-red-500">*</span></Label>
                <Input value={form.cargoName} onChange={(e) => setForm((p) => ({ ...p, cargoName: e.target.value }))} placeholder="货物名称" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">重量（吨）</Label>
                <Input type="number" step="0.001" value={form.weight} onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))} placeholder="吨" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">包装方式</Label>
                <Select value={form.packagingType} onValueChange={(v) => setForm((p) => ({ ...p, packagingType: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PACKAGING_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">货物规格</Label>
                <Input value={form.cargoSpec} onChange={(e) => setForm((p) => ({ ...p, cargoSpec: e.target.value }))} placeholder="如：800x800mm 抛光砖" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">报价</Label>
                <Input type="number" step="0.01" value={form.quotedPrice} onChange={(e) => setForm((p) => ({ ...p, quotedPrice: e.target.value }))} placeholder="¥" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">特殊要求</Label>
              <Input value={form.specialRequirements} onChange={(e) => setForm((p) => ({ ...p, specialRequirements: e.target.value }))} placeholder="如：需要尾板车" />
            </div>
          </CardContent>
        </Card>

        {/* 物流信息 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">物流信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">发货仓库</Label>
                <Select value={form.warehouseId ? String(form.warehouseId) : ""} onValueChange={handleWarehouseChange}>
                  <SelectTrigger><SelectValue placeholder="选择仓库" /></SelectTrigger>
                  <SelectContent>
                    {warehouses?.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">发货城市</Label>
                <Input value={form.originCity} onChange={(e) => setForm((p) => ({ ...p, originCity: e.target.value }))} placeholder="发货城市" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">目的城市 <span className="text-red-500">*</span></Label>
                <Input value={form.destinationCity} onChange={(e) => setForm((p) => ({ ...p, destinationCity: e.target.value }))} placeholder="目的城市" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">送货地址</Label>
                <Input value={form.deliveryAddress} onChange={(e) => setForm((p) => ({ ...p, deliveryAddress: e.target.value }))} placeholder="详细送货地址" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">收货人</Label>
                <Input value={form.receiverName} onChange={(e) => setForm((p) => ({ ...p, receiverName: e.target.value }))} placeholder="收货人姓名" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">收货人电话</Label>
                <Input value={form.receiverPhone} onChange={(e) => setForm((p) => ({ ...p, receiverPhone: e.target.value }))} placeholder="收货人电话" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 结构化收货确认 & 调度备注 */}
        {showReceivingSection && (
          <Card className="border-orange-200 bg-orange-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span>📌</span> 收货确认与调度备注
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-orange-700">收货状态</Label>
                  <Select
                    value={form.receivingStatus || "__empty__"}
                    onValueChange={(value) => {
                      const nextStatus = value === "__empty__" ? "" : value as "receivable" | "wait_notice" | "not_receivable";
                      setForm((prev) => ({
                        ...prev,
                        receivingStatus: nextStatus,
                        expectedReceiveAt: nextStatus ? prev.expectedReceiveAt : "",
                        nextFollowUpAt: nextStatus === "wait_notice" ? prev.nextFollowUpAt : "",
                        receivingReason: nextStatus === "not_receivable" ? prev.receivingReason : "",
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择收货状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__empty__">暂不填写</SelectItem>
                      {Object.entries(RECEIVING_STATUS_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-orange-700">预计收货时间</Label>
                  <Input
                    type="datetime-local"
                    value={form.expectedReceiveAt}
                    onChange={(e) => setForm((prev) => ({ ...prev, expectedReceiveAt: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-orange-700">下次跟进时间</Label>
                  <Input
                    type="datetime-local"
                    value={form.nextFollowUpAt}
                    onChange={(e) => setForm((prev) => ({ ...prev, nextFollowUpAt: e.target.value }))}
                    disabled={form.receivingStatus !== "wait_notice"}
                  />
                  {form.receivingStatus === "wait_notice" && (
                    <p className="text-xs text-amber-600">选择“等通知”时必须填写下次跟进时间。</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-orange-700">暂不收货原因</Label>
                  <Textarea
                    value={form.receivingReason}
                    onChange={(e) => setForm((prev) => ({ ...prev, receivingReason: e.target.value }))}
                    placeholder="例如：工地未开工、客户要求延期、到货窗口未确认"
                    rows={2}
                    disabled={form.receivingStatus !== "not_receivable"}
                    className="border-orange-200 focus:border-orange-400"
                  />
                  {form.receivingStatus === "not_receivable" && (
                    <p className="text-xs text-amber-600">选择“暂不收货”时必须填写原因。</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-orange-700">收货备注</Label>
                  <Textarea
                    value={form.receivingNote}
                    onChange={(e) => setForm((prev) => ({ ...prev, receivingNote: e.target.value }))}
                    placeholder="联系收货人/业务员后的收货要求，如：需提前电话联系、仅工作日卸货等"
                    rows={2}
                    className="border-orange-200 focus:border-orange-400"
                  />
                </div>
              </div>

              {((order as any).receivingConfirmedAt || (order as any).receivingConfirmedByName) && (
                <div className="rounded-md border border-orange-200 bg-white/70 px-3 py-2 text-xs text-muted-foreground">
                  最近一次收货确认：{(order as any).receivingConfirmedByName || "未知"}
                  {" · "}
                  {(order as any).receivingConfirmedAt ? new Date((order as any).receivingConfirmedAt).toLocaleString("zh-CN") : "时间未知"}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-blue-700">调度员备注</Label>
                <Textarea
                  value={form.dispatcherRemark}
                  onChange={(e) => setForm((p) => ({ ...p, dispatcherRemark: e.target.value }))}
                  placeholder="调度员备注信息，如：卸货马上付款、司机特殊要求等"
                  rows={2}
                  className="border-blue-200 focus:border-blue-400"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* 备注 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">备注</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.remarks}
              onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
              placeholder="备注信息..."
              rows={3}
            />
          </CardContent>
        </Card>

        {/* 备注变更历史 */}
        {noteChangeLogs && noteChangeLogs.length > 0 && (
          <Card className="border-purple-200 bg-purple-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4 text-purple-600" />
                备注变更记录
                <Badge variant="secondary" className="text-xs">{noteChangeLogs.length}条</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {noteChangeLogs.map((log: any) => (
                  <div key={log.id} className="relative pl-6 pb-3 border-l-2 border-purple-200 last:pb-0">
                    <div className="absolute left-[-5px] top-1 w-2 h-2 rounded-full bg-purple-400" />
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-purple-700">
                        {log.changedByUserName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("zh-CN")}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {log.field === "shippingNote" ? "发货备注" : "收货备注"}
                      </Badge>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <span className="text-red-500 line-through bg-red-50 px-1.5 py-0.5 rounded text-xs max-w-[45%] break-all">
                        {log.oldValue || "(空)"}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground mt-1 shrink-0" />
                      <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded text-xs max-w-[45%] break-all">
                        {log.newValue || "(空)"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 底部操作 */}
        <div className="flex justify-end gap-3 pb-6">
          <Button variant="outline" onClick={() => setLocation(returnPath)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            保存修改
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
