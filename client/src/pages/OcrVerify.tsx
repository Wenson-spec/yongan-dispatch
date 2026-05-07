import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  FileImage,
  Eye,
  Link2,
  Search,
  ReceiptText,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";

type OcrResult = {
  deliveryNoteNumber: string;
  receiverSignature: string;
  signDate: string;
  cargoQuantity: string;
  cargoDescription: string;
  remarks: string;
  condition: string;
};

type CandidateOrder = {
  id: number;
  orderNumber?: string | null;
  systemCode?: string | null;
  customerName?: string | null;
  receiverName?: string | null;
  destinationCity?: string | null;
  status?: string | null;
  mergedPlanNumber?: string | null;
  podStatus?: string | null;
  freightWaybillNumber?: string | null;
  shippingNote?: string | null;
};

type MatchedCandidateOrder = CandidateOrder & {
  matchedKeywords: string[];
};

type SearchTrigger = "auto" | "manual" | null;

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_assign: "待分流",
  pending_price: "待报价",
  priced: "已报价",
  pending_dispatch: "待调度",
  pending_vehicle: "待找车",
  pending_inquiry: "待询价",
  dispatched: "已派车",
  delivered: "已送达",
  signed: "已签收",
  settled: "已结算",
  cancelled: "已取消",
  on_hold: "挂起",
};

function getReturnMeta(from: string | null) {
  const returnPath = from || "/station/pod-deposit";
  if (returnPath.includes("/station/entry")) {
    return {
      returnPath,
      returnLabel: "返回录单台",
      title: "OCR核验辅助工具",
      subtitle: "该页面仅作为录单台或回单台的子流程工具，识别后需先绑定正式订单，再执行回单核验回写。",
    };
  }

  return {
    returnPath,
    returnLabel: "返回回单押金台",
    title: "回单OCR核验辅助工具",
    subtitle: "该页面仅作为子流程工具使用，识别成功后需绑定关联订单并回写回单核验结果。",
  };
}

function normalizeKeyword(value: string | null | undefined) {
  return value?.trim() || "";
}

function extractIdentifierTokens(text: string) {
  const tokens = new Set<string>();
  const patterns = [
    /YA\d{6,}/gi,
    /[A-Za-z]\d{6,}/g,
    /P\d{8,}/gi,
  ];

  patterns.forEach((pattern) => {
    const matches = text.match(pattern) || [];
    matches.forEach((item) => {
      const keyword = normalizeKeyword(item);
      if (keyword) {
        tokens.add(keyword);
      }
    });
  });

  return Array.from(tokens);
}

function buildAutoBindingKeywords(result: OcrResult) {
  const keywords: string[] = [];
  const pushKeyword = (value: string | null | undefined) => {
    const keyword = normalizeKeyword(value);
    if (keyword && !keywords.includes(keyword)) {
      keywords.push(keyword);
    }
  };

  pushKeyword(result.deliveryNoteNumber);

  [result.deliveryNoteNumber, result.cargoDescription, result.remarks].forEach((text) => {
    const normalizedText = normalizeKeyword(text);
    if (!normalizedText) {
      return;
    }
    extractIdentifierTokens(normalizedText).forEach(pushKeyword);
  });

  return keywords.slice(0, 6);
}

function getCandidateSearchText(order: CandidateOrder) {
  return [
    order.orderNumber,
    order.systemCode,
    order.customerName,
    order.receiverName,
    order.destinationCity,
    order.mergedPlanNumber,
    order.freightWaybillNumber,
    order.shippingNote,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getCandidateScore(order: MatchedCandidateOrder, keywords: string[]) {
  const haystack = getCandidateSearchText(order);
  const exactFields = [
    normalizeKeyword(order.orderNumber).toLowerCase(),
    normalizeKeyword(order.systemCode).toLowerCase(),
    normalizeKeyword(order.mergedPlanNumber).toLowerCase(),
    normalizeKeyword(order.freightWaybillNumber).toLowerCase(),
  ].filter(Boolean);

  return keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalizeKeyword(keyword).toLowerCase();
    if (!normalizedKeyword) {
      return score;
    }
    if (exactFields.includes(normalizedKeyword)) {
      return score + 100;
    }
    if (haystack.includes(normalizedKeyword)) {
      return score + 25;
    }
    return score;
  }, order.matchedKeywords.length * 10);
}

export default function OcrVerify() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const sourceFrom = searchParams.get("from");
  const prefilledOrderId = searchParams.get("orderId");
  const { returnPath, returnLabel, title, subtitle } = getReturnMeta(sourceFrom);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [editedResult, setEditedResult] = useState<OcrResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [manualKeyword, setManualKeyword] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(prefilledOrderId ? Number(prefilledOrderId) : null);
  const [candidateOrders, setCandidateOrders] = useState<MatchedCandidateOrder[]>([]);
  const [isSearchingOrders, setIsSearchingOrders] = useState(false);
  const [lastSearchKeywords, setLastSearchKeywords] = useState<string[]>([]);
  const [lastSearchTrigger, setLastSearchTrigger] = useState<SearchTrigger>(null);

  const uploadMutation = trpc.smartPaste.uploadDeliveryNote.useMutation();
  const ocrMutation = trpc.smartPaste.ocrDeliveryNote.useMutation();
  const createPodMutation = trpc.pod.create.useMutation();
  const updatePodStatusMutation = trpc.pod.updateStatus.useMutation();

  useEffect(() => {
    if (prefilledOrderId && Number(prefilledOrderId) > 0) {
      setSelectedOrderId(Number(prefilledOrderId));
    }
  }, [prefilledOrderId]);

  const selectedOrder = candidateOrders.find((item) => item.id === selectedOrderId) || null;

  const searchOrderCandidates = async (rawKeywords: string[], trigger: Exclude<SearchTrigger, null>) => {
    const keywords = Array.from(
      new Set(rawKeywords.map((item) => normalizeKeyword(item)).filter(Boolean)),
    ).slice(0, 6);

    setLastSearchTrigger(trigger);
    setLastSearchKeywords(keywords);

    if (keywords.length === 0) {
      setCandidateOrders([]);
      if (!prefilledOrderId) {
        setSelectedOrderId(null);
      }
      return [] as MatchedCandidateOrder[];
    }

    setIsSearchingOrders(true);
    try {
      const responses = await Promise.all(
        keywords.map((keyword) =>
          utils.order.list.fetch({
            page: 1,
            pageSize: 10,
            keyword,
          }),
        ),
      );

      const orderMap = new Map<number, MatchedCandidateOrder>();
      responses.forEach((response, index) => {
        const matchedKeyword = keywords[index];
        ((response?.items || []) as CandidateOrder[]).forEach((item) => {
          const existing = orderMap.get(item.id);
          if (existing) {
            if (!existing.matchedKeywords.includes(matchedKeyword)) {
              existing.matchedKeywords.push(matchedKeyword);
            }
            return;
          }
          orderMap.set(item.id, {
            ...item,
            matchedKeywords: [matchedKeyword],
          });
        });
      });

      const mergedOrders = Array.from(orderMap.values()).sort((a, b) => {
        const scoreDiff = getCandidateScore(b, keywords) - getCandidateScore(a, keywords);
        if (scoreDiff !== 0) {
          return scoreDiff;
        }
        return b.id - a.id;
      });

      setCandidateOrders(mergedOrders);

      setSelectedOrderId((prev) => {
        if (prefilledOrderId && Number(prefilledOrderId) > 0) {
          return Number(prefilledOrderId);
        }
        if (prev && mergedOrders.some((item) => item.id === prev)) {
          return prev;
        }
        if (mergedOrders.length === 1) {
          return mergedOrders[0].id;
        }
        return null;
      });

      return mergedOrders;
    } finally {
      setIsSearchingOrders(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("图片大小不能超过10MB");
      return;
    }

    const previewReader = new FileReader();
    previewReader.onload = (ev) => {
      setImagePreview(ev.target?.result as string);
    };
    previewReader.readAsDataURL(file);

    setIsUploading(true);
    setOcrResult(null);
    setEditedResult(null);
    setIsVerified(false);
    setManualKeyword("");
    setCandidateOrders([]);
    setLastSearchKeywords([]);
    setLastSearchTrigger(null);
    if (!prefilledOrderId) {
      setSelectedOrderId(null);
    }

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const base64Reader = new FileReader();
        base64Reader.onload = (ev) => {
          const raw = ev.target?.result as string;
          if (!raw?.includes(",")) {
            reject(new Error("图片读取失败"));
            return;
          }
          resolve(raw.split(",")[1]);
        };
        base64Reader.onerror = () => reject(new Error("图片读取失败"));
        base64Reader.readAsDataURL(file);
      });

      const result = await uploadMutation.mutateAsync({
        fileName: file.name,
        fileBase64: base64,
        contentType: file.type,
      });
      setImageUrl(result.url);
      toast.success("图片上传成功");
    } catch (err: any) {
      toast.error(`上传失败：${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleOcrRecognize = async () => {
    if (!imageUrl) {
      toast.error("请先上传图片");
      return;
    }

    setIsRecognizing(true);
    try {
      const result = await ocrMutation.mutateAsync({ imageUrl });
      const nextResult = result.ocrResult as OcrResult;
      const autoKeywords = buildAutoBindingKeywords(nextResult);

      setOcrResult(nextResult);
      setEditedResult({ ...nextResult });
      setManualKeyword(autoKeywords[0] || "");

      if (autoKeywords.length === 0) {
        toast.success("OCR识别完成，暂未提取到可检索编号，请手工搜索绑定订单");
        return;
      }

      const matchedOrders = await searchOrderCandidates(autoKeywords, "auto");
      if (matchedOrders.length > 0) {
        toast.success(`OCR识别完成，已根据识别结果匹配到 ${matchedOrders.length} 个候选订单`);
      } else {
        toast.success("OCR识别完成，但暂未匹配到候选订单，请手工搜索绑定");
      }
    } catch (err: any) {
      toast.error(`识别失败：${err.message}`);
    } finally {
      setIsRecognizing(false);
    }
  };

  const handleSearchOrders = async () => {
    const nextKeyword = normalizeKeyword(manualKeyword);
    if (!nextKeyword) {
      toast.error("请先输入送货单号、订单号或系统单号");
      return;
    }

    try {
      const matchedOrders = await searchOrderCandidates([nextKeyword], "manual");
      if (matchedOrders.length > 0) {
        toast.success(`已查询到 ${matchedOrders.length} 个候选订单，请确认绑定`);
      } else {
        toast.error("未查询到可绑定订单，请检查关键字后重试");
      }
    } catch (err: any) {
      toast.error(`查询失败：${err.message}`);
    }
  };

  const handleVerify = async () => {
    if (!editedResult) {
      toast.error("请先完成OCR识别");
      return;
    }
    if (!imageUrl) {
      toast.error("缺少已上传的送货单图片");
      return;
    }
    if (!selectedOrderId) {
      toast.error("请先绑定关联订单，再执行回单核验");
      return;
    }

    setIsSubmitting(true);
    try {
      const pod = await createPodMutation.mutateAsync({
        orderId: selectedOrderId,
        deliveryNoteUrl: imageUrl,
      });

      await updatePodStatusMutation.mutateAsync({
        id: pod.id,
        operationType: "ocr_verify",
        originalStatus: "received",
        ocrVerified: true,
        ocrResult: editedResult,
        deliveryNoteUrl: imageUrl,
      });

      await Promise.allSettled([
        utils.pod.list.invalidate(),
        utils.order.list.invalidate(),
      ]);

      setIsVerified(true);
      toast.success("OCR核验结果已回写到回单记录");
    } catch (err: any) {
      toast.error(`核验提交失败：${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldLabels: Record<keyof OcrResult, string> = {
    deliveryNoteNumber: "送货单号",
    receiverSignature: "收货人签名",
    signDate: "签收日期",
    cargoQuantity: "货物数量",
    cargoDescription: "货物描述",
    remarks: "备注",
    condition: "货物状况",
  };

  const selectedOrderLabel = selectedOrder
    ? (selectedOrder.orderNumber || selectedOrder.systemCode || `订单#${selectedOrder.id}`)
    : selectedOrderId
      ? `订单#${selectedOrderId}`
      : "未绑定";

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-6xl">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation(returnPath)}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              {returnLabel}
            </Button>
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <Camera className="h-5 w-5" />
                {title}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            子流程工具
          </Badge>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_1.1fr] gap-4">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">上传送货单照片</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                {!imagePreview ? (
                  <div
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">点击上传或拍照</p>
                    <p className="text-xs text-muted-foreground mt-1">支持 JPG、PNG，最大 10MB</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative border rounded-lg overflow-hidden">
                      <img
                        src={imagePreview}
                        alt="送货单预览"
                        className="w-full max-h-[420px] object-contain bg-muted/20"
                      />
                      {(isUploading || isRecognizing || isSubmitting) && (
                        <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                        <FileImage className="h-4 w-4 mr-1" />
                        重新选择
                      </Button>
                      <Button size="sm" onClick={handleOcrRecognize} disabled={!imageUrl || isRecognizing || isUploading}>
                        {isRecognizing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}
                        {isRecognizing ? "识别中..." : "开始识别"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  关联订单绑定
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">送货单号 / 订单号 / 系统单号</Label>
                    <Input
                      className="mt-1"
                      value={manualKeyword}
                      onChange={(e) => setManualKeyword(e.target.value)}
                      placeholder="识别后会自动带出，也可手工补充查询"
                    />
                  </div>
                  <Button variant="outline" onClick={handleSearchOrders} disabled={isSearchingOrders}>
                    {isSearchingOrders ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                    查询订单
                  </Button>
                </div>

                {lastSearchKeywords.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      当前{lastSearchTrigger === "auto" ? "自动" : "手工"}查询关键字：{lastSearchKeywords.join(" / ")}
                    </div>
                    {isSearchingOrders ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在查询候选订单，请稍候...
                      </div>
                    ) : candidateOrders.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        {lastSearchTrigger === "auto"
                          ? "未根据OCR识别结果找到可绑定订单，请改用订单号、系统单号或运单号手工搜索。"
                          : "未查询到可绑定订单，请检查关键字后重试。"}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {candidateOrders.map((order) => {
                          const isActive = selectedOrderId === order.id;
                          return (
                            <button
                              key={order.id}
                              type="button"
                              className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${isActive ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                              onClick={() => setSelectedOrderId(order.id)}
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="font-medium text-sm">
                                  {order.orderNumber || order.systemCode || `订单#${order.id}`}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {order.status && <Badge variant="outline">{ORDER_STATUS_LABELS[order.status] || order.status}</Badge>}
                                  {order.podStatus && <Badge variant="secondary">回单：{order.podStatus}</Badge>}
                                  {isActive && <Badge className="bg-green-100 text-green-800">已绑定</Badge>}
                                </div>
                              </div>
                              <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
                                <div>客户：{order.customerName || "-"}</div>
                                <div>收货人：{order.receiverName || "-"}</div>
                                <div>目的地：{order.destinationCity || "-"}</div>
                              </div>
                              <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                                {order.mergedPlanNumber && <span>合并计划号：{order.mergedPlanNumber}</span>}
                                {order.matchedKeywords.length > 0 && (
                                  <span>匹配命中：{order.matchedKeywords.join(" / ")}</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    完成OCR识别后会自动基于送货单号、订单号等识别值查询候选订单；若未匹配到，可在此手工搜索并绑定。
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ReceiptText className="h-4 w-4" />
                    OCR识别结果与核验提交
                  </CardTitle>
                  {isVerified && (
                    <Badge className="bg-green-100 text-green-800">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      已回写核验
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!editedResult ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Camera className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">上传送货单照片后进行OCR识别</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(Object.keys(fieldLabels) as (keyof OcrResult)[]).map((field) => (
                      <div key={field}>
                        <Label className="text-xs text-muted-foreground">{fieldLabels[field]}</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            className="text-sm"
                            value={editedResult[field]}
                            onChange={(e) =>
                              setEditedResult((prev) => (prev ? { ...prev, [field]: e.target.value } : prev))
                            }
                          />
                          {ocrResult && editedResult[field] !== ocrResult[field] && (
                            <Badge variant="outline" className="text-[10px] shrink-0">已修改</Badge>
                          )}
                        </div>
                      </div>
                    ))}

                    <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                      <div>已绑定订单：{selectedOrderLabel}</div>
                      <div>回写动作：确认核验后将自动创建或复用回单记录，并在绑定订单下写入 OCR 结果、附件地址与回单已收回状态。</div>
                    </div>

                    {!selectedOrderId && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>请先在左侧确认绑定正式订单，再执行“确认核验并回写”。</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <Button onClick={handleVerify} disabled={isSubmitting || isVerified || !selectedOrderId} className="flex-1">
                        {isSubmitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                        {isVerified ? "已确认核验并回写" : "确认核验并回写"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
