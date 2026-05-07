import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
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
  Search,
  RefreshCw,
  ChevronRight,
  FileText,
  Eye,
  History,
  ArrowRight,
} from "lucide-react";
import { useState, useMemo } from "react";
import { TablePagination } from "@/components/TablePagination";

const ACTION_LABELS: Record<string, string> = {
  create: "创建",
  update: "更新",
  delete: "删除",
  status_change: "状态变更",
  batch_status_change: "批量状态变更",
  approve: "审批通过",
  reject: "审批驳回",
  smart_paste: "智能粘贴",
  ocr_scan: "OCR识别",
  export: "导出",
  login: "登录",
  assign_dispatcher: "分配调度员",
  price_and_assign: "定价分配",
  manual_assign: "手动指派",
  batch_manual_assign: "批量指派",
  mark_pod_sent: "标记回单已寄",
  mark_settled: "标记已结算",
  rollback: "退回",
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-800",
  update: "bg-blue-100 text-blue-800",
  delete: "bg-red-100 text-red-800",
  status_change: "bg-purple-100 text-purple-800",
  batch_status_change: "bg-purple-100 text-purple-800",
  approve: "bg-emerald-100 text-emerald-800",
  reject: "bg-orange-100 text-orange-800",
  smart_paste: "bg-amber-100 text-amber-800",
  ocr_scan: "bg-cyan-100 text-cyan-800",
  export: "bg-indigo-100 text-indigo-800",
  login: "bg-gray-100 text-gray-800",
  assign_dispatcher: "bg-blue-100 text-blue-800",
  price_and_assign: "bg-orange-100 text-orange-800",
  manual_assign: "bg-blue-100 text-blue-800",
  batch_manual_assign: "bg-blue-100 text-blue-800",
  mark_pod_sent: "bg-teal-100 text-teal-800",
  mark_settled: "bg-green-100 text-green-800",
  rollback: "bg-amber-100 text-amber-800",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  order: "订单",
  customer: "客户",
  warehouse: "仓库",
  freight_station: "货站",
  vehicle: "车辆",
  driver: "司机",
  department: "部门",
  cargo_type: "货物类型",
  dispatcher_region: "调度区域",
  user: "用户",
  permission: "权限",
  approval: "审批",
  pod: "回单",
  ltl_inquiry: "零担询价",
};

export default function OperationLog() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // 详情弹窗
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const queryInput = useMemo(() => ({
    page,
    pageSize,
    action: actionFilter || undefined,
    targetType: targetTypeFilter || undefined,
    keyword: keyword || undefined,
  }), [page, pageSize, actionFilter, targetTypeFilter, keyword]);

  const { data, isLoading, refetch } = trpc.stats.operationLogs.useQuery(queryInput);

  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);

  const handleSearch = () => {
    setKeyword(searchInput);
    setPage(1);
  };

  const parseChanges = (changes: any): { fieldChanges: any[] | null; rawData: any } => {
    if (!changes) return { fieldChanges: null, rawData: null };
    let parsed = changes;
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch { return { fieldChanges: null, rawData: changes }; }
    }
    if (parsed?.fieldChanges && Array.isArray(parsed.fieldChanges)) {
      return { fieldChanges: parsed.fieldChanges, rawData: parsed.rawUpdate || null };
    }
    return { fieldChanges: null, rawData: parsed };
  };

  const formatValue = (val: any): string => {
    if (val === null || val === undefined || val === "") return "(空)";
    if (val instanceof Date || (typeof val === "string" && /^\d{4}-\d{2}-\d{2}T/.test(val))) {
      return new Date(val).toLocaleString("zh-CN");
    }
    return String(val);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <History className="h-5 w-5" />
            操作日志
          </h1>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            刷新
          </Button>
        </div>

        {/* 筛选栏 */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue placeholder="操作类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部操作</SelectItem>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={targetTypeFilter} onValueChange={(v) => { setTargetTypeFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue placeholder="对象类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部对象</SelectItem>
              {Object.entries(TARGET_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Input
              className="h-8 w-40 text-xs"
              placeholder="搜索操作人/描述..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button variant="outline" size="sm" className="h-8" onClick={handleSearch}>
              <Search className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* 日志列表 */}
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-8">#</TableHead>
                <TableHead className="w-32">时间</TableHead>
                <TableHead className="w-20">操作人</TableHead>
                <TableHead className="w-24 text-center">操作类型</TableHead>
                <TableHead className="w-20 text-center">对象类型</TableHead>
                <TableHead className="w-20">对象ID</TableHead>
                <TableHead>描述</TableHead>
                <TableHead className="w-16 text-center">详情</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : !data?.items?.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    暂无操作日志
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((log, idx) => (
                  <TableRow key={log.id} className="hover:bg-muted/30">
                    <TableCell className="text-xs text-muted-foreground">
                      {(page - 1) * pageSize + idx + 1}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString("zh-CN", {
                        month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
                      }) : "-"}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {log.userName || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={`text-[10px] ${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-800"}`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[10px]">
                        {TARGET_TYPE_LABELS[log.targetType] || log.targetType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {log.targetId || "-"}
                    </TableCell>
                    <TableCell className="text-xs truncate max-w-[200px]">
                      {log.description || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {log.changes != null ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => { setSelectedLog(log); setDetailOpen(true); }}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* 分页 */}
        <TablePagination total={data?.total ?? 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </div>

      {/* 变更详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>变更详情</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">操作人：</span>
                  <span className="font-medium">{selectedLog.userName || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">时间：</span>
                  <span>{selectedLog.createdAt ? new Date(selectedLog.createdAt).toLocaleString("zh-CN") : "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">操作：</span>
                  <Badge className={`text-[10px] ${ACTION_COLORS[selectedLog.action] || ""}`}>
                    {ACTION_LABELS[selectedLog.action] || selectedLog.action}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">对象：</span>
                  <span>{TARGET_TYPE_LABELS[selectedLog.targetType] || selectedLog.targetType} #{selectedLog.targetId}</span>
                </div>
              </div>
              {selectedLog.description && (
                <div className="text-sm">
                  <span className="text-muted-foreground">描述：</span>
                  <span>{selectedLog.description}</span>
                </div>
              )}
              {selectedLog.changes && (() => {
                const { fieldChanges, rawData } = parseChanges(selectedLog.changes);
                return (
                  <div className="space-y-3">
                    {fieldChanges && fieldChanges.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">字段变更对比：</span>
                        <div className="mt-1 border rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/50">
                                <th className="px-3 py-1.5 text-left font-medium">字段</th>
                                <th className="px-3 py-1.5 text-left font-medium">原值</th>
                                <th className="px-3 py-1.5 text-center w-8"></th>
                                <th className="px-3 py-1.5 text-left font-medium">新值</th>
                              </tr>
                            </thead>
                            <tbody>
                              {fieldChanges.map((c: any, i: number) => (
                                <tr key={i} className="border-t hover:bg-muted/20">
                                  <td className="px-3 py-1.5 font-medium text-foreground">{c.label}</td>
                                  <td className="px-3 py-1.5">
                                    <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded text-[11px] line-through">
                                      {formatValue(c.oldValue)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5 text-center">
                                    <ArrowRight className="h-3 w-3 text-muted-foreground inline" />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded text-[11px] font-medium">
                                      {formatValue(c.newValue)}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {!fieldChanges && rawData && (
                      <div>
                        <span className="text-xs text-muted-foreground">变更数据：</span>
                        <pre className="mt-1 bg-muted/30 rounded p-3 text-xs font-mono overflow-auto max-h-[300px] whitespace-pre-wrap">
                          {JSON.stringify(rawData, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
