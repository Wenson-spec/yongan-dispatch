import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useMemo, useState, useEffect } from "react";
import {
  Database,
  Download,
  HardDrive,
  RefreshCw,
  Shield,
  FileDown,
  CheckSquare,
  Mail,
  PlayCircle,
  Clock3,
  FolderArchive,
  Settings2,
} from "lucide-react";

type BackupConfigForm = {
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: "ssl" | "tls" | "none";
  smtpUser: string;
  smtpPassword: string;
  senderEmail: string;
  senderName: string;
  recipientEmails: string;
  retentionDays: string;
  backupDir: string;
};

function toFormConfig(config?: any): BackupConfigForm {
  return {
    dbHost: config?.dbHost ?? "127.0.0.1",
    dbPort: String(config?.dbPort ?? 3306),
    dbName: config?.dbName ?? "",
    dbUser: config?.dbUser ?? "",
    dbPassword: config?.dbPassword ?? "",
    smtpHost: config?.smtpHost ?? "",
    smtpPort: String(config?.smtpPort ?? 465),
    smtpSecure: config?.smtpSecure ?? "ssl",
    smtpUser: config?.smtpUser ?? "",
    smtpPassword: config?.smtpPassword ?? "",
    senderEmail: config?.senderEmail ?? "",
    senderName: config?.senderName ?? "永安调度系统",
    recipientEmails: config?.recipientEmails ?? "",
    retentionDays: String(config?.retentionDays ?? 30),
    backupDir: config?.backupDir ?? "",
  };
}

function formatBytes(size?: number) {
  if (!size || size <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 2)} ${units[unitIndex]}`;
}

function formatDuration(durationMs?: number) {
  if (!durationMs || durationMs <= 0) return "-";
  if (durationMs < 1000) return `${durationMs} ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

export default function DataBackup() {
  const utils = trpc.useUtils();
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.backup.getStats.useQuery();
  const { data: tableList } = trpc.backup.getTableList.useQuery();
  const {
    data: backupConfigData,
    isLoading: configLoading,
    refetch: refetchConfig,
  } = trpc.backup.getConfig.useQuery();
  const {
    data: history,
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = trpc.backup.listHistory.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState<BackupConfigForm>(toFormConfig());

  useEffect(() => {
    if (backupConfigData?.config) {
      setForm(toFormConfig(backupConfigData.config));
    }
  }, [backupConfigData]);

  const totalRecords = useMemo(() => {
    if (!stats) return 0;
    return stats.reduce((sum, s) => sum + (s.count > 0 ? s.count : 0), 0);
  }, [stats]);

  const latestSuccess = useMemo(
    () => history?.find(item => item.status === "success"),
    [history],
  );

  const exportMutation = trpc.backup.exportBackup.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, "");
      a.href = url;
      a.download = `永安物流_数据备份_${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("数据备份导出成功");
      setExporting(false);
    },
    onError: (err) => {
      toast.error(`导出失败: ${err.message}`);
      setExporting(false);
    },
  });

  const updateConfigMutation = trpc.backup.updateConfig.useMutation({
    onSuccess: async () => {
      toast.success("备份配置已保存");
      await refetchConfig();
      await refetchHistory();
    },
    onError: (err) => toast.error(`保存失败：${err.message}`),
  });

  const runNowMutation = trpc.backup.runNow.useMutation({
    onSuccess: async () => {
      toast.success("已手动触发备份");
      await Promise.all([refetchHistory(), refetchStats()]);
    },
    onError: (err) => toast.error(`手动备份失败：${err.message}`),
  });

  const testEmailMutation = trpc.backup.sendTestEmail.useMutation({
    onSuccess: () => {
      toast.success("测试邮件发送成功");
    },
    onError: (err) => toast.error(`测试邮件发送失败：${err.message}`),
  });

  const downloadUrlQuery = trpc.backup.getDownloadUrl.useMutation();

  const isActionBusy = updateConfigMutation.isPending || runNowMutation.isPending || testEmailMutation.isPending;

  const handleExportAll = () => {
    setExporting(true);
    exportMutation.mutate({});
  };

  const handleExportSelected = () => {
    if (selectedTables.size === 0) {
      toast.error("请至少选择一个数据表");
      return;
    }
    setExporting(true);
    exportMutation.mutate({ tables: Array.from(selectedTables) });
  };

  const toggleTable = (key: string) => {
    setSelectedTables(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    if (tableList) {
      setSelectedTables(new Set(tableList.map(t => t.key)));
    }
  };

  const deselectAll = () => setSelectedTables(new Set());

  const updateForm = (key: keyof BackupConfigForm, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveConfig = () => {
    updateConfigMutation.mutate({
      dbHost: form.dbHost.trim(),
      dbPort: Number(form.dbPort || 3306),
      dbName: form.dbName.trim(),
      dbUser: form.dbUser.trim(),
      dbPassword: form.dbPassword,
      smtpHost: form.smtpHost.trim(),
      smtpPort: Number(form.smtpPort || 465),
      smtpSecure: form.smtpSecure,
      smtpUser: form.smtpUser.trim(),
      smtpPassword: form.smtpPassword,
      senderEmail: form.senderEmail.trim(),
      senderName: form.senderName.trim(),
      recipientEmails: form.recipientEmails.trim(),
      retentionDays: Number(form.retentionDays || 30),
      backupDir: form.backupDir.trim(),
    });
  };

  const handleDownload = async (fileName: string) => {
    try {
      const result = await downloadUrlQuery.mutateAsync({ fileName });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error: any) {
      toast.error(`下载失败：${error.message}`);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-600" />
              备份管理
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              管理数据库自动备份、SMTP 邮件通知、手动触发和历史文件下载。
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => Promise.all([refetchStats(), refetchConfig(), refetchHistory()])}>
              <RefreshCw className="h-4 w-4 mr-2" />
              刷新
            </Button>
            <Button onClick={() => runNowMutation.mutate()} disabled={isActionBusy}>
              <PlayCircle className="h-4 w-4 mr-2" />
              {runNowMutation.isPending ? "执行中..." : "手动触发备份"}
            </Button>
            <Button variant="outline" onClick={() => testEmailMutation.mutate()} disabled={isActionBusy}>
              <Mail className="h-4 w-4 mr-2" />
              {testEmailMutation.isPending ? "发送中..." : "发送测试邮件"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50">
                  <Database className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">数据表</p>
                  <p className="text-xl font-bold">{stats?.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-50">
                  <HardDrive className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">总记录数</p>
                  <p className="text-xl font-bold">{totalRecords.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-50">
                  <FolderArchive className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">备份历史</p>
                  <p className="text-xl font-bold">{history?.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-50">
                  <Clock3 className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">最近成功备份</p>
                  <p className="text-sm font-bold">{latestSuccess ? new Date(latestSuccess.timestamp).toLocaleString() : "暂无"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              自动备份配置
            </CardTitle>
            <CardDescription>
              保存后将更新项目根目录中的 <code>backup.config</code>。安装脚本会根据该配置生成定时任务与邮件发送设置。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>数据库主机</Label>
                <Input value={form.dbHost} onChange={e => updateForm("dbHost", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>数据库端口</Label>
                <Input value={form.dbPort} onChange={e => updateForm("dbPort", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>数据库名称</Label>
                <Input value={form.dbName} onChange={e => updateForm("dbName", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>数据库用户名</Label>
                <Input value={form.dbUser} onChange={e => updateForm("dbUser", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>数据库密码</Label>
                <Input type="password" value={form.dbPassword} onChange={e => updateForm("dbPassword", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>备份目录</Label>
                <Input value={form.backupDir} onChange={e => updateForm("backupDir", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>SMTP 服务器</Label>
                <Input value={form.smtpHost} onChange={e => updateForm("smtpHost", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>SMTP 端口</Label>
                <Input value={form.smtpPort} onChange={e => updateForm("smtpPort", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>SMTP 安全方式</Label>
                <Input value={form.smtpSecure} onChange={e => updateForm("smtpSecure", (e.target.value || "ssl") as BackupConfigForm["smtpSecure"])} placeholder="ssl / tls / none" />
              </div>
              <div className="space-y-2">
                <Label>SMTP 用户名</Label>
                <Input value={form.smtpUser} onChange={e => updateForm("smtpUser", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>SMTP 密码</Label>
                <Input type="password" value={form.smtpPassword} onChange={e => updateForm("smtpPassword", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>保留天数</Label>
                <Input value={form.retentionDays} onChange={e => updateForm("retentionDays", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>发件人邮箱</Label>
                <Input value={form.senderEmail} onChange={e => updateForm("senderEmail", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>发件人名称</Label>
                <Input value={form.senderName} onChange={e => updateForm("senderName", e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>收件人邮箱</Label>
              <Textarea
                value={form.recipientEmails}
                onChange={e => updateForm("recipientEmails", e.target.value)}
                placeholder="支持多个邮箱，使用英文逗号分隔"
                rows={3}
              />
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>配置文件路径：{backupConfigData?.configPath || "-"}</p>
              <p>安装脚本路径：{backupConfigData?.setupScriptPath || "-"}</p>
              <p>备份脚本路径：{backupConfigData?.scriptPath || "-"}</p>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSaveConfig} disabled={configLoading || isActionBusy}>
                {updateConfigMutation.isPending ? "保存中..." : "保存配置"}
              </Button>
              <Button variant="outline" onClick={() => setForm(toFormConfig(backupConfigData?.config))} disabled={configLoading || isActionBusy}>
                重置表单
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">历史备份记录</CardTitle>
            <CardDescription>显示最近的自动与手动备份结果，可直接下载成功生成的备份文件。</CardDescription>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : !history?.length ? (
              <div className="text-center py-8 text-muted-foreground">暂无备份记录</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>触发方式</TableHead>
                    <TableHead>文件名</TableHead>
                    <TableHead>大小</TableHead>
                    <TableHead>耗时</TableHead>
                    <TableHead>说明</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((item) => (
                    <TableRow key={`${item.timestamp}-${item.fileName || item.message}`}>
                      <TableCell>{new Date(item.timestamp).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === "success" ? "default" : "destructive"}>
                          {item.status === "success" ? "成功" : "失败"}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.trigger || "-"}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{item.fileName || "-"}</TableCell>
                      <TableCell>{formatBytes(item.sizeBytes)}</TableCell>
                      <TableCell>{formatDuration(item.durationMs)}</TableCell>
                      <TableCell className="max-w-[280px] truncate">{item.message || "-"}</TableCell>
                      <TableCell className="text-right">
                        {item.fileName ? (
                          <Button variant="outline" size="sm" onClick={() => handleDownload(item.fileName!)}>
                            <Download className="h-4 w-4 mr-1" />
                            下载
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">无文件</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">快捷导出</CardTitle>
              <CardDescription>保留原有的 JSON 导出备份能力，适合临时迁移与数据核查。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleExportAll} disabled={exporting} className="bg-blue-600 hover:bg-blue-700">
                  <Download className="h-4 w-4 mr-2" />
                  {exporting && selectedTables.size === 0 ? "导出中..." : "一键导出全量备份"}
                </Button>
                <Button variant="outline" onClick={handleExportSelected} disabled={exporting || selectedTables.size === 0}>
                  <FileDown className="h-4 w-4 mr-2" />
                  {exporting && selectedTables.size > 0 ? "导出中..." : `导出选中 (${selectedTables.size})`}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">使用说明</CardTitle>
              <CardDescription>建议先保存配置，再执行安装脚本完成依赖与定时任务部署。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. 安装脚本会自动安装 <strong>cron</strong>、<strong>default-mysql-client</strong>、<strong>mailutils</strong>、<strong>msmtp</strong> 等依赖。</p>
              <p>2. 定时任务默认每天凌晨 <strong>3:00</strong> 执行，保留最近 <strong>{form.retentionDays || 30}</strong> 天备份。</p>
              <p>3. 手动触发与定时任务都会写入历史记录，并在成功时附带压缩备份文件发送邮件通知。</p>
              <p>4. 如需部署，请在服务器执行 <code>bash ./setup-backup.sh</code> 完成安装与测试。</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">数据表明细</CardTitle>
                <CardDescription>选择需要导出的数据表</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>全选</Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>取消全选</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {stats?.map((s) => (
                  <div
                    key={s.table}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedTables.has(s.table) ? "border-blue-300 bg-blue-50/50" : "hover:bg-muted/50"
                    }`}
                    onClick={() => toggleTable(s.table)}
                  >
                    <Checkbox
                      checked={selectedTables.has(s.table)}
                      onCheckedChange={() => toggleTable(s.table)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.table}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-mono font-medium ${s.count < 0 ? "text-red-500" : ""}`}>
                        {s.count < 0 ? "错误" : s.count.toLocaleString()}
                      </span>
                      <p className="text-[10px] text-muted-foreground">条记录</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
