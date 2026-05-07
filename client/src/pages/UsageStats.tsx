import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import {
  BarChart3,
  Users,
  Activity,
  TrendingUp,
  RefreshCw,
  Clock,
  FileText,
  ArrowUpDown,
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "管理员",
  order_entry: "录单员",
  ltl_cs: "零担客服",
  chain_cs: "连锁客服",
  ltl_dispatcher: "零担调度员",
  outsource_dispatcher: "外请调度员",
  fleet_dispatcher: "车队调度员",
  field_manager: "现场管理员",
  cs_manager: "客服经理",
  finance_assistant: "财务助理",
};

const ACTION_LABELS: Record<string, string> = {
  create: "创建",
  update: "更新",
  delete: "删除",
  status_change: "状态变更",
  assign: "分配",
  return: "退回",
  approve: "审批",
  reject: "驳回",
  upload: "上传",
  export: "导出",
};

export default function UsageStats() {
  const [days, setDays] = useState(30);
  const [sortField, setSortField] = useState<"operationCount" | "orderCount" | "lastSignedIn">("operationCount");

  const { data: userActivity, isLoading: activityLoading, refetch: refetchActivity } =
    trpc.usage.getUserActivity.useQuery({ days });
  const { data: dailyTrend, isLoading: trendLoading } =
    trpc.usage.getDailyTrend.useQuery({ days: Math.min(days, 90) });
  const { data: actionStats } =
    trpc.usage.getActionStats.useQuery({ days });

  const sortedUsers = useMemo(() => {
    if (!userActivity) return [];
    return [...userActivity].sort((a, b) => {
      if (sortField === "lastSignedIn") {
        return new Date(b.lastSignedIn || 0).getTime() - new Date(a.lastSignedIn || 0).getTime();
      }
      return (b[sortField] as number) - (a[sortField] as number);
    });
  }, [userActivity, sortField]);

  const totalOps = useMemo(() => userActivity?.reduce((s, u) => s + u.operationCount, 0) || 0, [userActivity]);
  const totalOrders = useMemo(() => userActivity?.reduce((s, u) => s + u.orderCount, 0) || 0, [userActivity]);
  const activeUsers = useMemo(() => userActivity?.filter(u => u.operationCount > 0).length || 0, [userActivity]);

  // 简易柱状图渲染
  const maxOps = useMemo(() => {
    if (!dailyTrend?.dailyOperations?.length) return 1;
    return Math.max(...dailyTrend.dailyOperations.map(d => d.count), 1);
  }, [dailyTrend]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-indigo-600" />
              系统使用分析
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              统计各用户的登录频率、操作量与活跃趋势，用于分析系统使用情况
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">最近7天</SelectItem>
                <SelectItem value="14">最近14天</SelectItem>
                <SelectItem value="30">最近30天</SelectItem>
                <SelectItem value="90">最近90天</SelectItem>
                <SelectItem value="180">最近半年</SelectItem>
                <SelectItem value="365">最近一年</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetchActivity()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              刷新
            </Button>
          </div>
        </div>

        {/* 概览卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-50">
                  <Activity className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">总操作量</p>
                  <p className="text-xl font-bold">{totalOps.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-50">
                  <FileText className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">新建订单</p>
                  <p className="text-xl font-bold">{totalOrders.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">活跃用户</p>
                  <p className="text-xl font-bold">{activeUsers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-50">
                  <TrendingUp className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">日均操作</p>
                  <p className="text-xl font-bold">{days > 0 ? Math.round(totalOps / days) : 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 每日趋势图 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">每日操作趋势</CardTitle>
            <CardDescription>最近{Math.min(days, 90)}天的每日操作量</CardDescription>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : dailyTrend?.dailyOperations?.length ? (
              <div className="space-y-3">
                {/* 简易柱状图 */}
                <div className="flex items-end gap-[2px] h-32 overflow-x-auto">
                  {dailyTrend.dailyOperations.map((d, i) => (
                    <div key={i} className="flex flex-col items-center min-w-[12px] group relative">
                      <div
                        className="w-full bg-indigo-500 rounded-t-sm hover:bg-indigo-600 transition-colors cursor-pointer min-h-[2px]"
                        style={{ height: `${(d.count / maxOps) * 100}%` }}
                        title={`${d.date}: ${d.count}次操作`}
                      />
                      {/* tooltip */}
                      <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                        {d.date}: {d.count}次
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{dailyTrend.dailyOperations[0]?.date}</span>
                  <span>{dailyTrend.dailyOperations[dailyTrend.dailyOperations.length - 1]?.date}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">暂无数据</div>
            )}
          </CardContent>
        </Card>

        {/* 操作类型分布 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">操作类型分布</CardTitle>
          </CardHeader>
          <CardContent>
            {actionStats?.length ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {actionStats.map((a) => (
                  <div key={a.action} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    <div className="w-2 h-2 rounded-full bg-indigo-500" />
                    <span className="text-sm">{ACTION_LABELS[a.action] || a.action}</span>
                    <span className="ml-auto text-sm font-mono font-medium">{a.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">暂无数据</div>
            )}
          </CardContent>
        </Card>

        {/* 用户活跃度排行 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base">用户活跃度排行</CardTitle>
                <CardDescription>按{sortField === "operationCount" ? "操作量" : sortField === "orderCount" ? "创建订单数" : "最近登录"}排序</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={sortField === "operationCount" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortField("operationCount")}
                >
                  <ArrowUpDown className="h-3 w-3 mr-1" />
                  操作量
                </Button>
                <Button
                  variant={sortField === "orderCount" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortField("orderCount")}
                >
                  <ArrowUpDown className="h-3 w-3 mr-1" />
                  订单数
                </Button>
                <Button
                  variant={sortField === "lastSignedIn" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortField("lastSignedIn")}
                >
                  <Clock className="h-3 w-3 mr-1" />
                  最近登录
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-3 font-medium">排名</th>
                      <th className="py-2 px-3 font-medium">用户</th>
                      <th className="py-2 px-3 font-medium">角色</th>
                      <th className="py-2 px-3 font-medium text-right">操作量</th>
                      <th className="py-2 px-3 font-medium text-right">创建订单</th>
                      <th className="py-2 px-3 font-medium">最近登录</th>
                      <th className="py-2 px-3 font-medium">状态</th>
                      <th className="py-2 px-3 font-medium">操作分布</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedUsers.map((u, i) => {
                      const maxUserOps = sortedUsers[0]?.operationCount || 1;
                      const barWidth = maxUserOps > 0 ? (u.operationCount / maxUserOps) * 100 : 0;
                      return (
                        <tr key={u.id} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-3">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                              i === 0 ? "bg-yellow-100 text-yellow-700" :
                              i === 1 ? "bg-gray-100 text-gray-600" :
                              i === 2 ? "bg-orange-100 text-orange-700" :
                              "text-muted-foreground"
                            }`}>
                              {i + 1}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-medium">{u.name}</td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">
                              {ROLE_LABELS[u.role] || u.role}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">{u.operationCount}</td>
                          <td className="py-2 px-3 text-right font-mono">{u.orderCount}</td>
                          <td className="py-2 px-3 text-xs text-muted-foreground">
                            {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleString("zh-CN") : "-"}
                          </td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex items-center gap-1 text-xs ${u.isActive ? "text-green-600" : "text-red-500"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? "bg-green-500" : "bg-red-500"}`} />
                              {u.isActive ? "活跃" : "停用"}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full transition-all"
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {sortedUsers.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">暂无用户数据</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
