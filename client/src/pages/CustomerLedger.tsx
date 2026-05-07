import DashboardLayout from "@/components/DashboardLayout";
import { fmtDate } from "@/lib/dateUtils";
import { trpc } from "@/lib/trpc";
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
  Search,
  RefreshCw,
  Download,
  Calendar,
  FileSpreadsheet,
  AlertTriangle,
} from "lucide-react";
import { useState, useMemo } from "react";
import { TablePagination } from "@/components/TablePagination";

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  outsource: "外请",
  self: "自运",
  ltl: "零担",
};

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

const SETTLEMENT_LABELS: Record<string, string> = {
  monthly: "月结",
  cash: "现付",
  collect: "到付",
};

export default function CustomerLedger() {
  const [customerName, setCustomerName] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(100);

  // 获取客户列表
  const { data: customers } = trpc.customer.list.useQuery({ activeOnly: false });

  const queryInput = useMemo(() => ({
    customerName: customerName || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  }), [customerName, startDate, endDate]);

  const { data, isLoading, refetch } = trpc.stats.customerLedger.useQuery(queryInput);

  const handleSearch = () => {
    setCustomerName(searchInput);
  };

  // 导出CSV（24列格式）
  const handleExport = () => {
    if (!data?.length) return;
    const headers = [
      "客户订单号", "合并计划号", "业务类型", "部门", "是否加急",
      "客户名称", "客户电话", "结算方式",
      "货物名称", "重量(吨)", "包装方式",
      "发货城市", "目的城市", "收货人", "收货电话",
      "报价", "实际运费", "送货费", "附加费", "总费用",
      "车牌号", "司机", "状态", "下单日期",
    ];
    const rows = data.map((item) => [
      item.orderNumber || item.systemCode || "",
      item.mergedPlanNumber || "",
      BUSINESS_TYPE_LABELS[item.businessType] || item.businessType,
      item.department || "",
      item.isUrgent ? "是" : "否",
      item.customerName || "",
      item.customerPhone || "",
      SETTLEMENT_LABELS[item.settlementType ?? ''] || item.settlementType || '',
      item.cargoName || "",
      item.weight || "",
      item.packagingType || "",
      item.originCity || "",
      item.destinationCity || "",
      item.receiverName || "",
      item.receiverPhone || "",
      item.quotedPrice || "",
      item.actualFreight || "",
      item.deliveryFee || "",
      item.extraFee || "",
      item.totalCost || "",
      item.plateNumber || "",
      item.driverName || "",
      STATUS_LABELS[item.status] || item.status,
      fmtDate(item.orderDate) !== "-" ? fmtDate(item.orderDate) : "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `客户台账_${customerName || "全部"}_${new Date().toLocaleDateString("zh-CN")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 汇总统计
  const summary = useMemo(() => {
    if (!data?.length) return null;
    const totalFreight = data.reduce((sum, d) => sum + parseFloat(d.actualFreight || "0"), 0);
    const totalCost = data.reduce((sum, d) => sum + parseFloat(d.totalCost || "0"), 0);
    const totalQuoted = data.reduce((sum, d) => sum + parseFloat(d.quotedPrice || "0"), 0);
    return { count: data.length, totalFreight, totalCost, totalQuoted };
  }, [data]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            <h1 className="text-xl font-semibold">客户台账</h1>
            {data && <Badge variant="secondary" className="text-xs">{data.length} 条</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!data?.length}>
              <Download className="h-4 w-4 mr-1" />
              导出CSV（24列）
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              刷新
            </Button>
          </div>
        </div>

        {/* 筛选 */}
        <div className="flex flex-wrap items-center gap-2 bg-muted/20 rounded-lg p-3 border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索客户名称"
              className="pl-8 h-8 w-48 text-sm"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>

          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">至</span>
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
            setSearchInput(""); setCustomerName(""); setStartDate(""); setEndDate("");
          }}>
            清除
          </Button>
        </div>

        {/* 汇总卡片 */}
        {summary && (
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="text-xs text-blue-600">订单数</div>
              <div className="text-xl font-bold text-blue-700">{summary.count}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="text-xs text-green-600">总报价</div>
              <div className="text-xl font-bold text-green-700">¥{summary.totalQuoted.toFixed(2)}</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <div className="text-xs text-purple-600">总运费</div>
              <div className="text-xl font-bold text-purple-700">¥{summary.totalFreight.toFixed(2)}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <div className="text-xs text-red-600">总费用</div>
              <div className="text-xl font-bold text-red-700">¥{summary.totalCost.toFixed(2)}</div>
            </div>
          </div>
        )}

        {/* 台账表格 */}
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-8">#</TableHead>
                <TableHead className="w-28">客户订单号</TableHead>
                <TableHead className="w-16 text-center">类型</TableHead>
                <TableHead className="w-10 text-center">加急</TableHead>
                <TableHead>客户</TableHead>
                <TableHead>货物</TableHead>
                <TableHead className="w-14 text-right">重量</TableHead>
                <TableHead>发货地</TableHead>
                <TableHead>目的地</TableHead>
                <TableHead>收货人</TableHead>
                <TableHead className="w-20 text-right">报价</TableHead>
                <TableHead className="w-20 text-right">运费</TableHead>
                <TableHead className="w-20 text-right">总费用</TableHead>
                <TableHead className="w-20">车牌号</TableHead>
                <TableHead className="w-16 text-center">状态</TableHead>
                <TableHead className="w-24">日期</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={16} className="text-center py-12 text-muted-foreground">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : !data?.length ? (
                <TableRow>
                  <TableCell colSpan={16} className="text-center py-12 text-muted-foreground">
                    暂无数据，请选择客户或日期范围
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item, idx) => (
                  <TableRow key={item.id} className={`hover:bg-muted/30 ${item.isUrgent ? "bg-red-50" : ""}`}>
                    <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-mono text-xs">{item.orderNumber || item.systemCode}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[10px]">
                        {BUSINESS_TYPE_LABELS[item.businessType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {item.isUrgent && <AlertTriangle className="h-3.5 w-3.5 text-red-500 mx-auto" />}
                    </TableCell>
                    <TableCell className="text-sm truncate max-w-[100px]">{item.customerName}</TableCell>
                    <TableCell className="text-sm truncate max-w-[80px]">{item.cargoName || "-"}</TableCell>
                    <TableCell className="text-right text-sm">{item.weight ? `${item.weight}t` : "-"}</TableCell>
                    <TableCell className="text-sm">{item.originCity || "-"}</TableCell>
                    <TableCell className="text-sm font-medium">{item.destinationCity || "-"}</TableCell>
                    <TableCell className="text-sm">{item.receiverName || "-"}</TableCell>
                    <TableCell className="text-right text-sm">{formatMoney(item.quotedPrice)}</TableCell>
                    <TableCell className="text-right text-sm">{formatMoney(item.actualFreight)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatMoney(item.totalCost)}</TableCell>
                    <TableCell className="text-sm">{item.plateNumber || "-"}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[10px]">
                        {STATUS_LABELS[item.status] || item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDate(item.orderDate)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination total={data?.length ?? 0} page={ledgerPage} pageSize={ledgerPageSize} onPageChange={setLedgerPage} onPageSizeChange={setLedgerPageSize} />
        </div>
      </div>
    </DashboardLayout>
  );
}
