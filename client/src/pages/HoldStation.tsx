import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Clock3, Loader2, PauseCircle, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
  pending_assign: "待指派",
  pending_price: "待定价",
  priced: "已定价",
  pending_vehicle: "待找车",
  pending_dispatch: "待派车",
  pending_approval: "待审批",
  pending_inquiry: "待询价",
  inquiry_confirmed: "已询价",
  shipped: "已发运",
  dispatched: "已调度",
  in_transit: "运输中",
  partial_delivered: "部分送达",
  delivered: "已送达",
  signed: "已签收",
  on_hold: "等通知",
  cancelled: "已取消",
  settled: "已结算",
};

const BIZ_LABELS: Record<string, string> = {
  outsource: "外请",
  self: "自运",
  ltl: "零担",
};

const PAGE_SIZE = 100;

type HoldOrderRow = {
  id: number;
  orderNumber?: string | null;
  systemCode?: string | null;
  businessType?: string | null;
  preHoldStatus?: string | null;
  holdReason?: string | null;
  holdAt?: string | Date | null;
  holdByName?: string | null;
  nextFollowUpAt?: string | Date | null;
  preHoldAssigneeName?: string | null;
};

function formatDateTime(value?: string | Date | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isOverdue(value?: string | Date | null) {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}

export default function HoldStation() {
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [releaseTarget, setReleaseTarget] = useState<HoldOrderRow | null>(null);
  const [releaseReason, setReleaseReason] = useState("");

  const queryInput = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      status: "on_hold",
      keyword: keyword.trim() || undefined,
    }),
    [page, keyword],
  );

  const utils = trpc.useUtils();
  const { data, isLoading, isFetching, refetch } = trpc.order.list.useQuery(queryInput);

  const releaseMutation = trpc.order.updateStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.order.list.invalidate(),
        utils.order.stats.invalidate(),
      ]);
      toast.success("订单已从等通知恢复");
      setReleaseTarget(null);
      setReleaseReason("");
    },
    onError: (error: any) => {
      toast.error(error?.message || "恢复失败，请稍后重试");
    },
  });

  const rows = (data?.items ?? []) as HoldOrderRow[];
  const total = data?.total ?? 0;
  const overdueCount = rows.filter((row) => isOverdue(row.nextFollowUpAt)).length;
  const missingFollowUpCount = rows.filter((row) => !row.nextFollowUpAt).length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const bizSummary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const key = row.businessType || "unknown";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }, [rows]);

  const handleSearch = () => {
    setPage(1);
    setKeyword(keywordDraft.trim());
  };

  const handleRefresh = async () => {
    await Promise.all([
      refetch(),
      utils.order.list.invalidate(),
    ]);
  };

  const handleOpenRelease = (order: HoldOrderRow) => {
    setReleaseTarget(order);
    setReleaseReason("");
  };

  const handleConfirmRelease = () => {
    if (!releaseTarget) return;
    const normalizedReason = releaseReason.trim();
    if (!normalizedReason) {
      toast.error("恢复原因不能为空");
      return;
    }
    if (!releaseTarget.preHoldStatus) {
      toast.error("该订单缺少搁置前状态，暂时无法从页面直接恢复");
      return;
    }
    releaseMutation.mutate({
      id: releaseTarget.id,
      status: releaseTarget.preHoldStatus,
      releaseReason: normalizedReason,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">等通知专区</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              集中查看所有处于“等通知”状态的订单，便于主管统一监控搁置原因、跟进时间与原负责人恢复去向。
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <div className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="搜索订单号、客户、司机、运单号..."
                value={keywordDraft}
                onChange={(event) => setKeywordDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSearch();
                  }
                }}
              />
            </div>
            <Button variant="outline" onClick={handleSearch}>查询</Button>
            <Button variant="outline" onClick={handleRefresh} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>等通知总量</CardDescription>
              <CardTitle className="text-3xl font-bold">{total}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <PauseCircle className="h-4 w-4 text-amber-500" />
                当前检索条件下的 on_hold 订单总数
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>当前页超期跟进</CardDescription>
              <CardTitle className="text-3xl font-bold">{overdueCount}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                下次跟进时间早于当前时间的订单
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>当前页未设跟进时间</CardDescription>
              <CardTitle className="text-3xl font-bold">{missingFollowUpCount}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="h-4 w-4 text-slate-500" />
                需要补充下次跟进时间的订单
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>当前页业务分布</CardDescription>
              <CardTitle className="text-base font-semibold">
                外请 {bizSummary.outsource ?? 0} / 自运 {bizSummary.self ?? 0} / 零担 {bizSummary.ltl ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">用于快速判断 on_hold 订单集中在哪类业务链路。</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>等通知订单监控表</CardTitle>
            <CardDescription>
              展示字段包括订单号、业务类型、搁置前状态、搁置原因、搁置时间、搁置操作人、下次跟进时间与原负责人，并支持从专区直接恢复。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-hidden rounded-md border">
              <div className="max-h-[70vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="min-w-[140px]">订单号</TableHead>
                      <TableHead className="min-w-[96px]">业务类型</TableHead>
                      <TableHead className="min-w-[108px]">搁置前状态</TableHead>
                      <TableHead className="min-w-[240px]">搁置原因</TableHead>
                      <TableHead className="min-w-[150px]">搁置时间</TableHead>
                      <TableHead className="min-w-[120px]">搁置操作人</TableHead>
                      <TableHead className="min-w-[160px]">下次跟进时间</TableHead>
                      <TableHead className="min-w-[120px]">原负责人</TableHead>
                      <TableHead className="min-w-[140px] text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                          正在加载等通知订单...
                        </TableCell>
                      </TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                          当前没有匹配的等通知订单
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((order) => {
                        const followUpOverdue = isOverdue(order.nextFollowUpAt);
                        const canRelease = Boolean(order.preHoldStatus);
                        return (
                          <TableRow key={order.id}>
                            <TableCell>
                              <div className="font-medium">{order.orderNumber || order.systemCode || `#${order.id}`}</div>
                              {order.systemCode && order.systemCode !== order.orderNumber ? (
                                <div className="text-xs text-muted-foreground">系统号：{order.systemCode}</div>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{BIZ_LABELS[order.businessType || ""] || order.businessType || "—"}</Badge>
                            </TableCell>
                            <TableCell>{STATUS_LABELS[order.preHoldStatus || ""] || order.preHoldStatus || "—"}</TableCell>
                            <TableCell className="whitespace-pre-wrap break-words">{order.holdReason || "—"}</TableCell>
                            <TableCell>{formatDateTime(order.holdAt)}</TableCell>
                            <TableCell>{order.holdByName || "—"}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <span>{formatDateTime(order.nextFollowUpAt)}</span>
                                {followUpOverdue ? <Badge variant="destructive" className="w-fit">已超期</Badge> : null}
                              </div>
                            </TableCell>
                            <TableCell>{order.preHoldAssigneeName || "公共队列"}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" disabled={!canRelease} onClick={() => handleOpenRelease(order)}>
                                恢复订单
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <div>
                第 <span className="font-medium text-foreground">{page}</span> / <span className="font-medium text-foreground">{totalPages}</span> 页，
                共 <span className="font-medium text-foreground">{total}</span> 条等通知订单
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                  上一页
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages || isFetching} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
                  下一页
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(releaseTarget)} onOpenChange={(open) => {
        if (!open) {
          setReleaseTarget(null);
          setReleaseReason("");
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>恢复等通知订单</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div>订单号：<span className="font-medium">{releaseTarget?.orderNumber || releaseTarget?.systemCode || (releaseTarget ? `#${releaseTarget.id}` : "—")}</span></div>
              <div className="mt-1 text-muted-foreground">
                将恢复到：{STATUS_LABELS[releaseTarget?.preHoldStatus || ""] || releaseTarget?.preHoldStatus || "未知状态"}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hold-release-reason">恢复原因 *</Label>
              <Textarea
                id="hold-release-reason"
                placeholder="请填写本次从等通知恢复的原因"
                value={releaseReason}
                onChange={(event) => setReleaseReason(event.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReleaseTarget(null);
                setReleaseReason("");
              }}
            >
              取消
            </Button>
            <Button disabled={!releaseReason.trim() || releaseMutation.isPending} onClick={handleConfirmRelease}>
              {releaseMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {releaseMutation.isPending ? "恢复中..." : "确认恢复"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
