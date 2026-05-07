
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ClipboardPaste,
  Sparkles,
  Loader2,
  Check,
  AlertTriangle,
  Save,
  Trash2,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Layers,
  BookMarked,
  BookOpen,
  Plus,
  X,
  Star,
} from "lucide-react";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";

type ParsedOrder = {
  customerName: string;
  warehouseName: string;
  orderNumber: string;
  mergedPlanNumber: string;
  customerPrice: string;
  cargoName: string;
  weight: string;
  originCity: string;
  destinationCity: string;
  deliveryAddress: string;
  receiverName: string;
  receiverPhone: string;
  shippingNote: string;
  remarks: string;
  isUrgent: boolean;
  urgentReason: string;
  isLargeSlab: boolean;
  chargeableWeight: string;
  packageCount: string;
  confidence: Record<string, "high" | "medium" | "low">;
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "",
  medium: "bg-yellow-50 border-yellow-200",
  low: "bg-orange-50 border-orange-200",
};

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  outsource: "外请",
  self: "自运",
  ltl: "零担",
};

export default function SmartPaste() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const utils = trpc.useUtils();
  const searchParams = new URLSearchParams(search);
  const returnPath = searchParams.get("from") || "/station/entry";
  const returnLabel = returnPath.includes("/station/entry") ? "返回录单台" : "返回来源页";

  const [rawText, setRawText] = useState("");
  const [parsedOrders, setParsedOrders] = useState<ParsedOrder[]>([]);
  const [businessTypes, setBusinessTypes] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // 模板自动推荐状态
  const [recommendedTemplates, setRecommendedTemplates] = useState<Array<{
    id: number; templateName: string | null; customerName: string; successCount: number; score: number;
  }>>([]);
  const [showRecommendation, setShowRecommendation] = useState(false);
  const matchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matchTemplateMutation = trpc.smartPaste.matchTemplate.useMutation({
    onSuccess: (data) => {
      if (data.matched && data.templates.length > 0) {
        setRecommendedTemplates(data.templates);
        setShowRecommendation(true);
      } else {
        setRecommendedTemplates([]);
        setShowRecommendation(false);
      }
    },
    onError: () => {
      setRecommendedTemplates([]);
      setShowRecommendation(false);
    },
  });

  // 粘贴文本变化时自动匹配模板（防抖）
  const handleTextChange = useCallback((text: string) => {
    setRawText(text);
    // 清除之前的推荐
    if (!text.trim()) {
      setRecommendedTemplates([]);
      setShowRecommendation(false);
      return;
    }
    // 防抖800ms后自动匹配
    if (matchDebounceRef.current) clearTimeout(matchDebounceRef.current);
    matchDebounceRef.current = setTimeout(() => {
      if (text.trim().length >= 10) {
        matchTemplateMutation.mutate({ text: text.trim() });
      }
    }, 800);
  }, []);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (matchDebounceRef.current) clearTimeout(matchDebounceRef.current);
    };
  }, []);

  const { data: customers } = trpc.customer.list.useQuery({ activeOnly: true });

  // 模板记忆功能状态
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const { data: templateList, refetch: refetchTemplates } = trpc.smartPaste.listTemplates.useQuery();

  const saveTemplateMutation = trpc.smartPaste.saveTemplate.useMutation({
    onSuccess: (data) => {
      toast.success(data.updated ? "模板已更新" : "模板已保存");
      setShowSaveTemplateDialog(false);
      setTemplateName("");
      refetchTemplates();
    },
    onError: (err) => toast.error(`保存失败：${err.message}`),
  });

  const deleteTemplateMutation = trpc.smartPaste.deleteTemplate.useMutation({
    onSuccess: () => {
      toast.success("模板已删除");
      refetchTemplates();
    },
    onError: (err) => toast.error(`删除失败：${err.message}`),
  });

  const applyTemplateMutation = trpc.smartPaste.applyTemplate.useMutation({
    onSuccess: (data) => {
      const orders = data.orders || [];
      setParsedOrders(orders);
      setBusinessTypes(orders.map(() => "outsource"));
      if (orders.length === 0) {
        toast.warning("未能从文本中识别出订单信息");
      } else {
        toast.success(`使用模板"${data.templateUsed}"成功识别 ${orders.length} 条订单`);
        const plans = new Set<string>();
        orders.forEach((o: any) => { if (o.mergedPlanNumber) plans.add(o.mergedPlanNumber); });
        setExpandedGroups(plans);
      }
      setIsParsing(false);
      setShowTemplateDialog(false);
    },
    onError: (err) => {
      toast.error(`模板解析失败：${err.message}`);
      setIsParsing(false);
    },
  });

  const handleApplyTemplate = (templateId: number) => {
    if (!rawText.trim()) {
      toast.error("请先粘贴文本内容");
      return;
    }
    setIsParsing(true);
    setParsedOrders([]);
    setSubmitted(false);
    applyTemplateMutation.mutate({ templateId, text: rawText });
  };

  const handleSaveTemplate = () => {
    if (!rawText.trim()) {
      toast.error("请先粘贴文本内容");
      return;
    }
    const customerName = parsedOrders[0]?.customerName || "";
    if (!customerName) {
      toast.error("请先解析文本，确保有客户名称");
      return;
    }
    setTemplateName(`${customerName}标准格式`);
    setShowSaveTemplateDialog(true);
  };

  const parseMutation = trpc.smartPaste.parse.useMutation({
    onSuccess: (data) => {
      const orders = data.orders || [];
      setParsedOrders(orders);
      setBusinessTypes(orders.map(() => "outsource"));
      if (orders.length === 0) {
        toast.warning("未能从文本中识别出订单信息，请检查输入内容");
      } else {
        toast.success(`成功识别 ${orders.length} 条订单`);
        // 自动展开所有合并计划号分组
        const plans = new Set<string>();
        orders.forEach((o: any) => { if (o.mergedPlanNumber) plans.add(o.mergedPlanNumber); });
        setExpandedGroups(plans);
      }
      setIsParsing(false);
    },
    onError: (err) => {
      toast.error(`解析失败：${err.message}`);
      setIsParsing(false);
    },
  });

  const createMutation = trpc.order.create.useMutation();

  const handleParse = () => {
    if (!rawText.trim()) {
      toast.error("请先粘贴文本内容");
      return;
    }
    setIsParsing(true);
    setParsedOrders([]);
    setSubmitted(false);
    parseMutation.mutate({ text: rawText });
  };

  const handleFieldEdit = (idx: number, field: string, value: string | boolean) => {
    setParsedOrders((prev) => {
      const updated = [...prev];
      (updated[idx] as any)[field] = value;
      return updated;
    });
  };

  const handleRemoveOrder = (idx: number) => {
    setParsedOrders((prev) => prev.filter((_, i) => i !== idx));
    setBusinessTypes((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleBatchSubmit = async () => {
    if (parsedOrders.length === 0) return;

    // 提交前校验：检查必填字段和低置信度字段
    const errors: string[] = [];
    const warnings: string[] = [];
    parsedOrders.forEach((order, idx) => {
      const label = `第${idx + 1}条`;
      // 必填字段校验
      if (!order.orderNumber?.trim()) errors.push(`${label}：缺少订单编号`);
      if (!order.customerName?.trim()) errors.push(`${label}：缺少客户名称`);
      if (!order.destinationCity?.trim()) errors.push(`${label}：缺少目的地城市`);
      // 重量格式校验
      if (order.weight && isNaN(parseFloat(order.weight))) errors.push(`${label}：重量格式不正确(${order.weight})`);
      // 价格格式校验
      if (order.customerPrice && isNaN(parseFloat(order.customerPrice))) errors.push(`${label}：客户价格格式不正确(${order.customerPrice})`);
      // 低置信度警告
      if (order.confidence) {
        const lowFields = Object.entries(order.confidence)
          .filter(([, level]) => level === 'low')
          .map(([field]) => field);
        if (lowFields.length > 0) warnings.push(`${label}：${lowFields.join('、')} 置信度低，请核实`);
      }
    });

    if (errors.length > 0) {
      toast.error(`提交前校验失败：\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...还有${errors.length - 5}条错误` : ''}`, { duration: 8000 });
      return;
    }
    if (warnings.length > 0) {
      toast.warning(`注意：${warnings.length}条数据存在低置信度字段，请仔细核对`, { duration: 5000 });
    }

    setIsSubmitting(true);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < parsedOrders.length; i++) {
      const order = parsedOrders[i];
      const bt = businessTypes[i] || "outsource";

      // 匹配客户ID
      const matchedCustomer = customers?.find(
        (c) => c.name === order.customerName || c.name.includes(order.customerName) || order.customerName.includes(c.name)
      );

      try {
        await createMutation.mutateAsync({
          businessType: bt as "outsource" | "self" | "ltl",
          isUrgent: order.isUrgent,
          urgentReason: order.urgentReason || undefined,
          customerId: matchedCustomer?.id,
          customerName: order.customerName || matchedCustomer?.name || undefined,
          customerPhone: order.receiverPhone || undefined,
          cargoName: order.cargoName || undefined,
          weight: order.weight || undefined,
          originCity: order.originCity || undefined,
          destinationCity: order.destinationCity || undefined,
          deliveryAddress: order.deliveryAddress || undefined,
          receiverName: order.receiverName || undefined,
          receiverPhone: order.receiverPhone || undefined,
          orderNumber: order.orderNumber || `AUTO-${Date.now()}-${i}`,
          mergedPlanNumber: order.mergedPlanNumber || undefined,
          customerPrice: order.customerPrice || undefined,
          shippingNote: order.shippingNote || undefined,
          remarks: order.remarks || undefined,
          isLargeSlab: order.isLargeSlab || undefined,
          chargeableWeight: order.chargeableWeight || undefined,
          packageCount: order.packageCount ? parseInt(order.packageCount) : undefined,
          warehouseName: order.warehouseName || undefined,
        });
        successCount++;
      } catch (err: any) {
        failCount++;
        console.error(`订单${i + 1}创建失败:`, err);
      }
    }

    setIsSubmitting(false);
    setSubmitted(true);
    utils.order.list.invalidate();
    utils.order.stats.invalidate();

    if (failCount === 0) {
      toast.success(`全部 ${successCount} 条订单创建成功，已进入录单待分流队列`);
    } else {
      toast.warning(`${successCount} 条录单成功并进入待分流队列，${failCount} 条失败`);
    }
  };

  const getConfidenceIcon = (level?: string) => {
    if (level === "low") return <AlertTriangle className="h-3 w-3 text-orange-500" />;
    if (level === "medium") return <AlertTriangle className="h-3 w-3 text-yellow-500" />;
    return null;
  };

  // 分组逻辑：将有合并计划号的订单分组
  const { groups, ungrouped, orderOriginalIndex } = useMemo(() => {
    const groups = new Map<string, { orders: ParsedOrder[]; indices: number[] }>();
    const ungrouped: { order: ParsedOrder; index: number }[] = [];
    const orderOriginalIndex = new Map<ParsedOrder, number>();

    parsedOrders.forEach((order, idx) => {
      orderOriginalIndex.set(order, idx);
      if (order.mergedPlanNumber) {
        const key = order.mergedPlanNumber;
        if (!groups.has(key)) groups.set(key, { orders: [], indices: [] });
        groups.get(key)!.orders.push(order);
        groups.get(key)!.indices.push(idx);
      } else {
        ungrouped.push({ order, index: idx });
      }
    });

    return { groups, ungrouped, orderOriginalIndex };
  }, [parsedOrders]);

  const toggleGroup = (planNumber: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(planNumber)) next.delete(planNumber);
      else next.add(planNumber);
      return next;
    });
  };

  const hasGroups = groups.size > 0;

  // 渲染单个订单行（子单或独立单）
  const renderOrderRow = (order: ParsedOrder, idx: number, isChild: boolean = false) => (
    <TableRow key={idx} className={isChild ? "bg-blue-50/30 border-l-2 border-l-blue-200" : ""}>
      <TableCell className="text-xs text-muted-foreground">
        {isChild ? <span className="pl-4 text-muted-foreground">└</span> : (idx + 1)}
      </TableCell>
      <TableCell>
        {isChild ? (
          <span className="text-xs text-muted-foreground">{BUSINESS_TYPE_LABELS[businessTypes[idx] || "outsource"]}</span>
        ) : (
          <Select
            value={businessTypes[idx] || "outsource"}
            onValueChange={(v) => {
              setBusinessTypes((prev) => {
                const updated = [...prev];
                updated[idx] = v;
                return updated;
              });
            }}
          >
            <SelectTrigger className="h-7 text-xs w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(BUSINESS_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </TableCell>
      <TableCell>
        <Input
          className={`h-7 text-xs ${CONFIDENCE_COLORS[order.confidence?.orderNumber || "high"]}`}
          value={order.orderNumber}
          onChange={(e) => handleFieldEdit(idx, "orderNumber", e.target.value)}
        />
      </TableCell>
      {!hasGroups && (
        <TableCell>
          <Input
            className={`h-7 text-xs ${CONFIDENCE_COLORS[order.confidence?.mergedPlanNumber || "high"]}`}
            value={order.mergedPlanNumber || ""}
            onChange={(e) => handleFieldEdit(idx, "mergedPlanNumber", e.target.value)}
          />
        </TableCell>
      )}
      <TableCell>
        <div className="relative">
          <Input
            className={`h-7 text-xs ${CONFIDENCE_COLORS[order.confidence?.customerName || "high"]} ${(() => {
              const matched = customers?.find(
                (c) => c.name === order.customerName || c.name.includes(order.customerName) || (order.customerName && order.customerName.length >= 2 && c.name.includes(order.customerName))
              );
              return matched ? 'border-green-400 bg-green-50/50' : (order.customerName ? 'border-amber-400 bg-amber-50/50' : '');
            })()}`}
            value={order.customerName}
            onChange={(e) => handleFieldEdit(idx, "customerName", e.target.value)}
            list={`customer-list-${idx}`}
            placeholder="客户名称"
          />
          <datalist id={`customer-list-${idx}`}>
            {customers?.filter(c => !order.customerName || c.name.includes(order.customerName) || order.customerName.includes(c.name.substring(0, 2))).slice(0, 10).map(c => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          {(() => {
            const matched = customers?.find(
              (c) => c.name === order.customerName || c.name.includes(order.customerName) || (order.customerName && order.customerName.length >= 2 && c.name.includes(order.customerName))
            );
            return matched ? (
              <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-500 text-white text-[8px]">✓</span>
            ) : order.customerName ? (
              <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-white text-[8px]">?</span>
            ) : null;
          })()}
        </div>
      </TableCell>
      <TableCell>
        <Input
          className={`h-7 text-xs ${CONFIDENCE_COLORS[order.confidence?.cargoName || "high"]}`}
          value={order.cargoName}
          onChange={(e) => handleFieldEdit(idx, "cargoName", e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Input
          className={`h-7 text-xs w-20 ${CONFIDENCE_COLORS[order.confidence?.weight || "high"]}`}
          value={order.weight}
          onChange={(e) => handleFieldEdit(idx, "weight", e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Input
          className={`h-7 text-xs ${CONFIDENCE_COLORS[order.confidence?.originCity || "high"]}`}
          value={order.originCity}
          onChange={(e) => handleFieldEdit(idx, "originCity", e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Input
          className={`h-7 text-xs ${CONFIDENCE_COLORS[order.confidence?.warehouseName || "high"]}`}
          value={order.warehouseName || ""}
          onChange={(e) => handleFieldEdit(idx, "warehouseName", e.target.value)}
          placeholder="仓库名"
        />
      </TableCell>
      <TableCell>
        <Input
          className={`h-7 text-xs ${CONFIDENCE_COLORS[order.confidence?.destinationCity || "high"]}`}
          value={order.destinationCity}
          onChange={(e) => handleFieldEdit(idx, "destinationCity", e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Input
          className={`h-7 text-xs ${CONFIDENCE_COLORS[order.confidence?.deliveryAddress || "high"]}`}
          value={order.deliveryAddress || ""}
          onChange={(e) => handleFieldEdit(idx, "deliveryAddress", e.target.value)}
          placeholder="详细地址"
        />
      </TableCell>
      <TableCell>
        <Input
          className={`h-7 text-xs w-24 ${CONFIDENCE_COLORS[order.confidence?.customerPrice || "high"]}`}
          value={order.customerPrice || ""}
          onChange={(e) => handleFieldEdit(idx, "customerPrice", e.target.value)}
          placeholder="元"
        />
      </TableCell>
      <TableCell>
        <Input
          className={`h-7 text-xs ${CONFIDENCE_COLORS[order.confidence?.shippingNote || "high"]}`}
          value={order.shippingNote || ""}
          onChange={(e) => handleFieldEdit(idx, "shippingNote", e.target.value)}
          placeholder="规格/托数/板数"
        />
      </TableCell>
      <TableCell className="text-center">
        {order.isUrgent ? (
          <Badge variant="destructive" className="text-[10px]">加急</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-red-500"
          onClick={() => handleRemoveOrder(idx)}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </TableCell>
    </TableRow>
  );

  // 渲染内部整理参考批次组头
  const renderGroupHeader = (planNumber: string, groupData: { orders: ParsedOrder[]; indices: number[] }) => {
    const isExpanded = expandedGroups.has(planNumber);
    const totalWeight = groupData.orders.reduce((sum, o) => sum + (parseFloat(o.weight) || 0), 0);
    const destinations = Array.from(new Set(groupData.orders.map(o => o.destinationCity).filter(Boolean)));
    const customerName = groupData.orders[0]?.customerName || "-";
    const firstIdx = groupData.indices[0];
    
    // 整组设置业务类型
    const setGroupBusinessType = (type: string) => {
      setBusinessTypes(prev => {
        const updated = [...prev];
        groupData.indices.forEach(idx => {
          updated[idx] = type;
        });
        return updated;
      });
    };

    return (
      <TableRow
        key={`group-${planNumber}`}
        className="bg-blue-50/60 hover:bg-blue-100/60 border-l-2 border-l-blue-500"
      >
        <TableCell className="text-center cursor-pointer" onClick={() => toggleGroup(planNumber)}>
          {isExpanded ? <ChevronDown className="h-4 w-4 text-blue-600" /> : <ChevronRight className="h-4 w-4 text-blue-600" />}
        </TableCell>
        <TableCell className="cursor-pointer" onClick={() => toggleGroup(planNumber)}>
          <Badge className="bg-blue-100 text-blue-700 border-blue-300 font-bold text-sm px-2.5 py-1">
            {groupData.orders.length}单
          </Badge>
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Select value={businessTypes[firstIdx] || "outsource"} onValueChange={setGroupBusinessType}>
            <SelectTrigger className="h-7 text-xs w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(BUSINESS_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell className="cursor-pointer" onClick={() => toggleGroup(planNumber)}>
          <div className="flex items-start gap-2">
            <Layers className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="font-mono font-bold text-blue-700 text-sm">参考批次 {planNumber}</div>
              <div className="text-[10px] text-muted-foreground">仅用于本次识别归并与内部整理，提交后仍由录单台继续分流</div>
            </div>
          </div>
        </TableCell>
        {!hasGroups && <TableCell />}
        <TableCell className="text-sm font-medium truncate">{customerName}</TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {groupData.orders.map(o => o.cargoName).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join("/") || "-"}
        </TableCell>
        <TableCell className="text-sm font-bold text-blue-700">{totalWeight.toFixed(3)}t</TableCell>
        <TableCell className="text-sm">{groupData.orders[0]?.originCity || "-"}</TableCell>
        <TableCell />
        <TableCell className="text-sm font-medium">
          {destinations.length <= 2 ? destinations.join("、") : `${destinations[0]}等${destinations.length}地`}
        </TableCell>
        <TableCell />
        <TableCell />
        <TableCell />
        <TableCell />
        <TableCell />
      </TableRow>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-7xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation(returnPath)}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              {returnLabel}
            </Button>
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <ClipboardPaste className="h-5 w-5" />
                录单辅助工具
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">该页面定位为录单台子流程工具，只负责识别归并与录单建议；识别出的参考批次仅用于内部整理，不代表已经形成正式外请分组或直接落账。</p>
            </div>
          </div>
        </div>

        {/* 粘贴区域 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              粘贴微信消息或文本
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder={"将微信聊天记录或文本粘贴到这里...\n\n示例：\n张总 佛山发成都 瓷砖10吨 收货人李明 13800138000 地址：成都市武侯区XX路XX号\n\n系统将自动识别客户、货物、地址等信息"}
              rows={6}
              value={rawText}
              onChange={(e) => handleTextChange(e.target.value)}
              className="font-mono text-sm"
            />
            {/* 模板自动推荐提示条 */}
            {showRecommendation && recommendedTemplates.length > 0 && !isParsing && parsedOrders.length === 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                  检测到匹配的客户模板，使用模板可提高识别准确率
                  <button
                    onClick={() => setShowRecommendation(false)}
                    className="ml-auto text-amber-400 hover:text-amber-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {recommendedTemplates.map((tpl) => (
                    <Button
                      key={tpl.id}
                      variant="outline"
                      size="sm"
                      className="border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
                      onClick={() => handleApplyTemplate(tpl.id)}
                    >
                      <BookOpen className="h-3.5 w-3.5 mr-1" />
                      {tpl.templateName || tpl.customerName}
                      <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">
                        匹配度 {tpl.score}%
                      </Badge>
                      {tpl.successCount > 0 && (
                        <span className="text-[10px] text-muted-foreground ml-1">
                          已用{tpl.successCount}次
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={handleParse} disabled={isParsing || !rawText.trim()}>
                {isParsing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                {isParsing ? "AI识别中..." : "智能识别"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowTemplateDialog(true)}
                disabled={isParsing || !rawText.trim()}
              >
                <BookOpen className="h-4 w-4 mr-1" />
                使用模板识别
              </Button>
              {parsedOrders.length > 0 && !submitted && (
                <Button variant="outline" onClick={handleSaveTemplate}>
                  <BookMarked className="h-4 w-4 mr-1" />
                  保存为模板
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                支持多条订单同时识别；参考批次只用于内部整理与录单建议，不确定字段会黄色高亮标记
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 识别结果 */}
        {parsedOrders.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  识别结果（{parsedOrders.length} 条订单
                  {groups.size > 0 && `，${groups.size} 个参考批次`}）
                </CardTitle>
                <div className="flex items-center gap-2">
                  {groups.size > 0 && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() => {
                          const allKeys = Array.from(groups.keys());
                          const allExpanded = allKeys.every(k => expandedGroups.has(k));
                          if (allExpanded) {
                            setExpandedGroups(new Set());
                          } else {
                            setExpandedGroups(new Set(allKeys));
                          }
                        }}
                      >
                        {Array.from(groups.keys()).every(k => expandedGroups.has(k)) ? "全部折叠" : "全部展开"}
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <div className="w-3 h-3 bg-yellow-50 border border-yellow-200 rounded" />
                    <span>中等置信</span>
                    <div className="w-3 h-3 bg-orange-50 border border-orange-200 rounded ml-2" />
                    <span>低置信</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-8">#</TableHead>
                      <TableHead className="w-20">类型</TableHead>
                      <TableHead>订单号</TableHead>
                      {!hasGroups && <TableHead>参考批次</TableHead>}
                      <TableHead>客户</TableHead>
                      <TableHead>货物</TableHead>
                      <TableHead className="w-20">重量</TableHead>
                      <TableHead>发货城市</TableHead>
                      <TableHead>仓库</TableHead>
                      <TableHead>目的城市</TableHead>
                      <TableHead>详细地址</TableHead>
                      <TableHead className="w-24">客户报价</TableHead>
                      <TableHead>发货备注</TableHead>
                      <TableHead>加急</TableHead>
                      <TableHead className="w-16">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hasGroups ? (
                      <>
                        {/* 有合并计划号的分组 */}
                        {Array.from(groups.entries()).map(([planNumber, groupData]) => (
                          <React.Fragment key={`plan-${planNumber}`}>
                            {renderGroupHeader(planNumber, groupData)}
                            {expandedGroups.has(planNumber) && groupData.orders.map((order: ParsedOrder, subIdx: number) => (
                              renderOrderRow(order, groupData.indices[subIdx], true)
                            ))}
                          </React.Fragment>
                        ))}
                        {/* 没有合并计划号的独立订单 */}
                        {ungrouped.map(({ order, index }) => (
                          renderOrderRow(order, index, false)
                        ))}
                      </>
                    ) : (
                      parsedOrders.map((order, idx) => renderOrderRow(order, idx, false))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  请检查识别结果，修正黄色/橙色高亮字段后提交
                  {hasGroups && "（当前仅按参考批次做识别归并与内部整理展示，点击箭头展开/折叠子单；提交后仍由录单台继续分流，不代表已形成正式外请分组）"}
                </span>
                <Button
                  onClick={handleBatchSubmit}
                  disabled={isSubmitting || submitted || parsedOrders.length === 0}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : submitted ? (
                    <Check className="h-4 w-4 mr-1" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" />
                  )}
                  {isSubmitting ? "提交中..." : submitted ? "已提交" : `批量创建 ${parsedOrders.length} 条订单`}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {/* 模板选择弹窗 */}
        <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-500" />
                选择解析模板
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {!templateList || templateList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BookMarked className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>暂无保存的模板</p>
                  <p className="text-xs mt-1">先使用“智能识别”解析成功后，可保存为模板</p>
                </div>
              ) : (
                templateList.map((tpl: any) => (
                  <div
                    key={tpl.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer group"
                    onClick={() => handleApplyTemplate(tpl.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{tpl.templateName}</span>
                        <Badge variant="outline" className="text-[10px]">{tpl.customerName}</Badge>
                        {tpl.successCount > 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            <Star className="h-2.5 w-2.5 mr-0.5" />
                            使用{tpl.successCount}次
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {tpl.sampleText?.substring(0, 80)}...
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-red-500 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTemplateMutation.mutate({ id: tpl.id });
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* 保存模板弹窗 */}
        <Dialog open={showSaveTemplateDialog} onOpenChange={setShowSaveTemplateDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookMarked className="h-5 w-5 text-green-500" />
                保存为模板
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">客户名称</label>
                <Input
                  value={parsedOrders[0]?.customerName || ""}
                  disabled
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">模板名称</label>
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="如：XX客户标准格式"
                  className="mt-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                保存后，下次该客户的粘贴文本可直接使用模板解析，提高识别准确率
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSaveTemplateDialog(false)}>
                取消
              </Button>
              <Button
                onClick={() => {
                  if (!templateName.trim()) {
                    toast.error("请输入模板名称");
                    return;
                  }
                  saveTemplateMutation.mutate({
                    customerName: parsedOrders[0]?.customerName || "",
                    templateName: templateName.trim(),
                    sampleText: rawText,
                  });
                }}
                disabled={saveTemplateMutation.isPending}
              >
                {saveTemplateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

// React import needed for Fragment
import React from "react";
