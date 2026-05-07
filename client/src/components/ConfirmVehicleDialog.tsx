import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DriverInfoPaste from "./DriverInfoPaste";
import PlateAutocomplete from "./PlateAutocomplete";

interface ConfirmVehicleDialogProps {
  order: any;
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
  /** 如果传入groupOrders，则为整组派车模式 */
  groupOrders?: any[];
}

export default function ConfirmVehicleDialog({ order, open, onClose, onConfirmed, groupOrders }: ConfirmVehicleDialogProps) {
  const [plateNumber, setPlateNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverIdCard, setDriverIdCard] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const utils = trpc.useUtils();

  useEffect(() => {
    if (open && order) {
      setPlateNumber(order.plateNumber || "");
      setDriverName(order.driverName || "");
      setDriverPhone(order.driverPhone || "");
      setDriverIdCard((order as any).driverIdCard || "");
      setSubmitting(false);
    }
  }, [open, order]);

  const updateOrderFields = trpc.order.updateOrderFields.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const batchUpdateStatus = trpc.order.batchUpdateStatus.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const canSubmit = plateNumber.trim() && driverName.trim() && driverPhone.trim();
  const displayOrders = groupOrders && groupOrders.length > 0 ? groupOrders : order ? [order] : [];
  const totalActualFreight = displayOrders.reduce((s: number, o: any) => s + (parseFloat(String(o.actualFreight)) || 0), 0);
  const totalQuotedPrice = displayOrders.reduce((s: number, o: any) => s + (parseFloat(String(o.quotedPrice)) || 0), 0);
  const totalDispatchPrice = displayOrders.reduce((s: number, o: any) => s + (parseFloat(String(o.dispatchPrice)) || 0), 0);
  const referencePrice = totalQuotedPrice > 0 ? totalQuotedPrice : totalDispatchPrice;
  const isOverpriced = totalActualFreight > 0 && referencePrice > 0 && totalActualFreight > referencePrice;
  const targetStatus = isOverpriced ? "pending_approval" : "dispatched";
  const needStatusUpdate = displayOrders.filter((o: any) =>
    o.status !== targetStatus && o.status !== "delivered" && o.status !== "signed"
  );
  const onlyFillVehicleInfo = needStatusUpdate.length === 0;
  const flowHint = onlyFillVehicleInfo
    ? `✅ 当前订单已处于后续流程阶段，本次仅补充${displayOrders.length}个订单的车辆信息，不再重复推进状态。`
    : isOverpriced
      ? `⚠️ 当前总运费¥${totalActualFreight} 超出${totalQuotedPrice > 0 ? "原定价" : "调度价"}¥${referencePrice}，确认后将补充车辆信息并转入待审批。`
      : `✅ 确认后将为${displayOrders.length}个订单补充车辆信息，并推进到【已调度】。`;

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error("请填写车牌号、司机姓名和电话");
      return;
    }
    setSubmitting(true);

    const vehicleInfo = {
      plateNumber: plateNumber.trim(),
      driverName: driverName.trim(),
      driverPhone: driverPhone.trim(),
      driverIdCard: driverIdCard.trim() || undefined,
    };
    try {
      // 第一步：为所有子订单更新车辆信息
      for (const o of displayOrders) {
        await updateOrderFields.mutateAsync({
          id: o.id,
          ...vehicleInfo,
        });
      }

      // 第二步：按当前总运费判断是否转审批；已在目标状态的订单不重复推进，避免重复提审
      if (isOverpriced && needStatusUpdate.length > 0) {
        toast.info(`运费¥${totalActualFreight} 超出${totalQuotedPrice > 0 ? '原定价' : '调度价'}¥${referencePrice}，已转入审批流程`);
      }

      if (needStatusUpdate.length > 0) {
        await batchUpdateStatus.mutateAsync({
          orderIds: needStatusUpdate.map((o: any) => o.id),
          status: targetStatus,
          ...vehicleInfo,
          actualFreight: totalActualFreight > 0 ? String(totalActualFreight) : undefined,
        });
      }

      // 第三步：刷新缓存（关键！确保界面立即更新）
      await Promise.all([
        utils.order.list.invalidate(),
        utils.order.stats.invalidate(),
      ]);

      toast.success(
        onlyFillVehicleInfo
          ? `已为 ${displayOrders.length} 个订单补充车辆信息，当前流程状态保持不变`
          : isOverpriced
            ? `已为 ${displayOrders.length} 个订单更新车辆信息，运费溢价已转入审批`
            : `派车成功，已为 ${displayOrders.length} 个订单更新车辆信息并流转状态`
      );
      onConfirmed();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "派车失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (!order) return null;

  const isGroupMode = displayOrders.length > 1;
  const totalWeight = displayOrders.reduce((sum: number, o: any) => sum + parseFloat(o.weight || "0"), 0);
  const uniqueDestinations = Array.from(new Set(displayOrders.map((o: any) => o.destinationCity).filter(Boolean)));
  const primaryPlateNumber = order.plateNumber || displayOrders.find((o: any) => o.plateNumber)?.plateNumber || "待补车牌";
  const primaryDriverName = order.driverName || displayOrders.find((o: any) => o.driverName)?.driverName || "待补司机";
  const visibleDispatchGroup =
    (order as any).dispatchRecordLabel ||
    (order as any).dispatchGroupLabel ||
    (order as any).dispatchRecordNumber ||
    (order as any).dispatchRecordCode ||
    (order as any).mergedPlanNumber ||
    null;
  const groupHeadline = visibleDispatchGroup
    ? `正式外请分组：${visibleDispatchGroup}`
    : `同车次派车：${primaryPlateNumber} / ${primaryDriverName}`;
  const groupSubline = visibleDispatchGroup
    ? ((order as any).mergedPlanNumber && visibleDispatchGroup !== (order as any).mergedPlanNumber
        ? `参考批次：${(order as any).mergedPlanNumber} · 当前整组派车优先按正式外请分组展示。`
        : "当前整组派车优先按正式外请分组展示。")
    : `当前未形成正式外请分组，按同车次整组派车：${primaryPlateNumber} / ${primaryDriverName}`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isGroupMode ? "整组派车" : "确认派车"}
            {isGroupMode && (
              <Badge variant="outline" className="ml-2 text-xs bg-blue-50 text-blue-700 border-blue-300">
                {displayOrders.length}单
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* 订单信息摘要 */}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 space-y-1">
          {isGroupMode ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-blue-700">{groupHeadline}</span>
                <Badge variant="secondary" className="h-5 bg-blue-100 text-blue-700">
                  {visibleDispatchGroup ? "正式外请分组整组派车" : "同车次整组派车"}
                </Badge>
              </div>
              <div>{order.originCity} → {(uniqueDestinations.length > 0 ? uniqueDestinations.join("、") : "待补目的地")}</div>
              <div>车辆：{primaryPlateNumber} · 司机：{primaryDriverName}</div>
              <div>总吨位：{totalWeight.toFixed(3)}t · {displayOrders.length}个订单</div>
              <div className="text-[10px] text-muted-foreground mt-1">{groupSubline}</div>
              <div className="text-[10px] text-muted-foreground">
                {displayOrders.map((o: any) => o.orderNumber || o.systemCode).join("、")}
              </div>
            </>
          ) : (
            <div>{order.orderNumber || order.systemCode} · {order.customerName} · {order.originCity}→{order.destinationCity}</div>
          )}
        </div>

        <DriverInfoPaste onParsed={(info) => {
          if (info.plateNumber) setPlateNumber(info.plateNumber);
          if (info.driverName) setDriverName(info.driverName);
          if (info.driverPhone) setDriverPhone(info.driverPhone);
          if (info.driverIdCard) setDriverIdCard(info.driverIdCard);
        }} />

        <div className="space-y-3">
          <div>
            <Label className="text-xs">车牌号 <span className="text-red-500">*</span></Label>
            <PlateAutocomplete
              value={plateNumber}
              onChange={setPlateNumber}
              onSelect={(v) => {
                setPlateNumber(v.plateNumber);
                if (v.driverName) setDriverName(v.driverName);
                if (v.driverPhone) setDriverPhone(v.driverPhone);
              }}
            />
          </div>
          <div>
            <Label className="text-xs">司机姓名 <span className="text-red-500">*</span></Label>
            <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="司机姓名" />
          </div>
          <div>
            <Label className="text-xs">司机电话 <span className="text-red-500">*</span></Label>
            <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="司机电话" />
          </div>
          <div>
            <Label className="text-xs">身份证号（选填）</Label>
            <Input value={driverIdCard} onChange={(e) => setDriverIdCard(e.target.value)} placeholder="身份证号" />
          </div>
        </div>

        <div className={`rounded p-2 text-xs ${onlyFillVehicleInfo ? "bg-slate-50 text-slate-600" : isOverpriced ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-600"}`}>
          {flowHint}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {submitting ? "提交中..." : isGroupMode ? "确认整组派车" : "确认派车"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
