import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ClipboardCheck, Clock3, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const QUICK_TAGS = [
  "需提前电话联系",
  "仅工作日卸货",
  "正常上班时间收货",
  "卸货需预约",
  "需叉车卸货",
  "需尾板车",
  "随时可卸货",
  "周末不收货",
  "提前一天预约",
];

const URGENT_KEYWORDS = ["加急", "紧急", "急", "马上", "立刻", "今天必须", "明天必须", "尽快"];

const RECEIVING_STATUS_LABELS = {
  receivable: "可收货",
  wait_notice: "等通知",
  not_receivable: "暂不收货",
} as const;

const RECEIVING_EDITABLE_STATUSES = [
  "pending_assign",
  "pending_price",
  "priced",
  "pending_dispatch",
  "pending_vehicle",
  "pending_approval",
  "dispatched",
  "in_transit",
  "delivered",
  "on_hold",
] as const;

type ReceivingStatus = "" | "receivable" | "wait_notice" | "not_receivable";

interface ReceivingNoteDialogProps {
  order: any;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function toDatetimeLocalValue(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ReceivingNoteDialog({ order, open, onClose, onSaved }: ReceivingNoteDialogProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [receivingStatus, setReceivingStatus] = useState<ReceivingStatus>("");
  const [expectedReceiveAt, setExpectedReceiveAt] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [receivingReason, setReceivingReason] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [urgentReason, setUrgentReason] = useState("");
  const [urgentConfirmed, setUrgentConfirmed] = useState(false);
  const [detectedUrgent, setDetectedUrgent] = useState(false);

  const updateOrderFields = trpc.order.updateOrderFields.useMutation({
    onSuccess: () => {
      toast.success(`收货确认已保存${isUrgent ? "，并已标记加急" : ""}`);
      onSaved();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (!open || !order) return;

    const existingNote = order.receivingNote || "";
    const existingTags = QUICK_TAGS.filter((tag) => existingNote.includes(tag));
    let remaining = existingNote;
    existingTags.forEach((tag) => {
      remaining = remaining.replace(tag, "");
    });
    remaining = remaining.replace(/[，,\s]+/g, " ").trim();

    setSelectedTags(existingTags);
    setFreeText(remaining);
    setReceivingStatus((order.receivingStatus || "") as ReceivingStatus);
    setExpectedReceiveAt(toDatetimeLocalValue(order.expectedReceiveAt));
    setNextFollowUpAt(toDatetimeLocalValue(order.nextFollowUpAt));
    setReceivingReason(order.receivingReason || "");
    setIsUrgent(!!order.isUrgent);
    setUrgentReason(order.urgentReason || "");
    setUrgentConfirmed(false);
    setDetectedUrgent(false);
  }, [open, order]);

  useEffect(() => {
    const fullText = [...selectedTags, freeText].join(" ");
    const found = URGENT_KEYWORDS.some((keyword) => fullText.includes(keyword));
    if (found && !isUrgent && !detectedUrgent) {
      setDetectedUrgent(true);
      setIsUrgent(true);
      setUrgentReason("收货确认中检测到加急要求");
      setUrgentConfirmed(false);
    }
  }, [freeText, selectedTags, isUrgent, detectedUrgent]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
  };

  const orderStatus = order?.status || "";
  const canEditReceiving = RECEIVING_EDITABLE_STATUSES.includes(orderStatus as (typeof RECEIVING_EDITABLE_STATUSES)[number]);

  const validationMessage = useMemo(() => {
    if (!canEditReceiving) return `订单当前状态为“${orderStatus || "未知状态"}”，请先退回到可编辑阶段后再修改收货确认。`;
    if (!urgentConfirmed) return "请先确认加急状态";
    if (receivingStatus === "wait_notice" && !nextFollowUpAt) return "选择“等通知”时必须填写下次跟进时间";
    if (receivingStatus === "not_receivable" && !receivingReason.trim()) return "选择“暂不收货”时必须填写原因";
    return "";
  }, [canEditReceiving, orderStatus, urgentConfirmed, receivingStatus, nextFollowUpAt, receivingReason]);

  const handleSave = () => {
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    const receivingNote = [...selectedTags, freeText.trim()].filter(Boolean).join("，");

    updateOrderFields.mutate({
      id: order.id,
      receivingStatus: receivingStatus || undefined,
      expectedReceiveAt: receivingStatus ? expectedReceiveAt || undefined : undefined,
      nextFollowUpAt: receivingStatus === "wait_notice" ? nextFollowUpAt || undefined : undefined,
      receivingReason: receivingStatus === "not_receivable" ? receivingReason.trim() || undefined : undefined,
      receivingNote: receivingNote || undefined,
      isUrgent,
      urgentReason: isUrgent ? urgentReason.trim() : "",
    });
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-orange-600" />
            结构化收货确认
            {order.isUrgent && <Badge variant="destructive">已标记加急</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {order.customerName} · {order.originCity}→{order.destinationCity} · {order.cargoName} {order.weight}t
        </div>

        {!canEditReceiving && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
            当前订单已进入流程锁定阶段，结构化收货确认仅可查看，不能直接修改。如需调整，请先将订单退回到允许编辑的阶段。
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-orange-700">收货状态</Label>
            <Select
              value={receivingStatus || "__empty__"}
              onValueChange={(value) => {
                const nextStatus = value === "__empty__" ? "" : (value as ReceivingStatus);
                setReceivingStatus(nextStatus);
                if (!nextStatus) {
                  setExpectedReceiveAt("");
                  setNextFollowUpAt("");
                  setReceivingReason("");
                  return;
                }
                if (nextStatus !== "wait_notice") setNextFollowUpAt("");
                if (nextStatus !== "not_receivable") setReceivingReason("");
              }}
              disabled={!canEditReceiving}
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">暂不填写</SelectItem>
                {Object.entries(RECEIVING_STATUS_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-orange-700">预计收货时间</Label>
            <Input type="datetime-local" value={expectedReceiveAt} onChange={(e) => setExpectedReceiveAt(e.target.value)} disabled={!canEditReceiving} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-orange-700">下次跟进时间</Label>
            <Input
              type="datetime-local"
              value={nextFollowUpAt}
              onChange={(e) => setNextFollowUpAt(e.target.value)}
              disabled={!canEditReceiving || receivingStatus !== "wait_notice"}
            />
            {receivingStatus === "wait_notice" && <p className="text-xs text-amber-600">“等通知”场景下必须填写。</p>}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-orange-700">暂不收货原因</Label>
            <Textarea
              value={receivingReason}
              onChange={(e) => setReceivingReason(e.target.value)}
              placeholder="例如：工地未开工、客户要求延期、到货窗口未确认"
              rows={3}
              disabled={!canEditReceiving || receivingStatus !== "not_receivable"}
              className="border-orange-200 focus:border-orange-400"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-orange-700">收货备注标签</Label>
            <div className="flex min-h-24 flex-wrap gap-1.5 rounded-md border border-orange-200 bg-orange-50/40 p-2">
              {QUICK_TAGS.map((tag) => (
                    <Badge
                      key={tag}
                      variant={selectedTags.includes(tag) ? "default" : "outline"}
                      className={`text-xs ${canEditReceiving ? "cursor-pointer" : "cursor-not-allowed opacity-60"} ${selectedTags.includes(tag) ? "bg-orange-600 hover:bg-orange-600" : "hover:bg-orange-100"}`}
                      onClick={() => canEditReceiving && toggleTag(tag)}
                    >

                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-orange-700">补充收货备注</Label>
          <Textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="输入联系收货人后的补充说明，例如：到场前半小时联系、到货后由项目经理验收等"
            rows={3}
            className="border-orange-200 focus:border-orange-400"
            disabled={!canEditReceiving}
          />
        </div>

        {((order as any).receivingConfirmedAt || (order as any).receivingConfirmedByName) && (
          <div className="rounded-lg border border-orange-200 bg-orange-50/40 px-3 py-2 text-xs text-muted-foreground">
            最近一次确认：{(order as any).receivingConfirmedByName || "未知"}
            {" · "}
            {(order as any).receivingConfirmedAt
              ? new Date((order as any).receivingConfirmedAt).toLocaleString("zh-CN")
              : "时间未知"}
          </div>
        )}

        <div className={`space-y-3 rounded-lg border-2 p-3 ${isUrgent ? "border-red-400 bg-red-50/50" : "border-yellow-400 bg-yellow-50/50"}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${isUrgent ? "text-red-500" : "text-yellow-500"}`} />
                <span className="text-sm font-medium">加急确认</span>
                {detectedUrgent && (
                  <Badge variant="outline" className="border-blue-300 text-[10px] text-blue-600">
                    <Zap className="mr-0.5 h-3 w-3" />检测到加急关键词
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                若收货窗口紧急或客户明确要求优先配送，请在此确认并填写原因。
              </p>
            </div>
            <Switch
              checked={isUrgent}
              onCheckedChange={(checked) => {
                setIsUrgent(checked);
                setUrgentConfirmed(false);
                if (!checked) setUrgentReason("");
              }}
              disabled={!canEditReceiving}
            />
          </div>

          {isUrgent && (
            <Input
              value={urgentReason}
              onChange={(e) => setUrgentReason(e.target.value)}
              placeholder="加急原因（选填）"
              className="text-sm"
              disabled={!canEditReceiving}
            />
          )}

          <div className="flex items-start gap-2">
            <Checkbox
              id="receiving-urgent-confirm"
              checked={urgentConfirmed}
              onCheckedChange={(checked) => setUrgentConfirmed(!!checked)}
              disabled={!canEditReceiving}
            />
            <label htmlFor="receiving-urgent-confirm" className="cursor-pointer text-xs leading-tight">
              {isUrgent ? "我已确认：该订单需按加急要求推进。" : "我已确认：该订单按正常时效推进。"}
            </label>
          </div>
        </div>

        {!!validationMessage && (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <Clock3 className="h-3.5 w-3.5" />
            {validationMessage}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!canEditReceiving || !!validationMessage || updateOrderFields.isPending}>
            {updateOrderFields.isPending ? "保存中..." : "保存收货确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
