import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit2, Building2, Package, Trash2, Upload, Bell, AlertTriangle, Save } from "lucide-react";
import { BatchImportButton } from "@/components/BatchOperations";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect } from "react";
import { toast } from "sonner";

function DepartmentTab() {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showBatchDelete, setShowBatchDelete] = useState(false);

  const utils = trpc.useUtils();
  const { data: departments, isLoading } = trpc.department.list.useQuery({ activeOnly: false });
  const createMutation = trpc.department.create.useMutation({
    onSuccess: () => { utils.department.list.invalidate(); setNewName(""); toast.success("部门创建成功"); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateMutation = trpc.department.update.useMutation({
    onSuccess: () => { utils.department.list.invalidate(); setEditingId(null); toast.success("部门更新成功"); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.department.delete.useMutation({
    onSuccess: () => { utils.department.list.invalidate(); toast.success("部门已删除"); setDeleteTargetId(null); },
    onError: (err) => toast.error(err.message),
  });
  const batchImportMutation = trpc.department.batchImport.useMutation({
    onSuccess: (result) => { utils.department.list.invalidate(); toast.success(`成功导入 ${result.count} 个部门`); },
    onError: (err) => toast.error(err.message),
  });
  const batchDeleteMutation = trpc.department.batchDelete.useMutation({
    onSuccess: (result) => { utils.department.list.invalidate(); toast.success(`已删除 ${result.count} 个部门`); setSelectedIds(new Set()); setShowBatchDelete(false); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" />业务部门配置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="输入部门名称" className="max-w-xs" onKeyDown={e => { if (e.key === "Enter" && newName.trim()) createMutation.mutate({ name: newName.trim() }); }} />
          <Button size="sm" onClick={() => { if (newName.trim()) createMutation.mutate({ name: newName.trim() }); }} disabled={!newName.trim() || createMutation.isPending}>
            <Plus className="h-4 w-4 mr-1" />添加
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setShowBatchDelete(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />删除选中 ({selectedIds.size})
            </Button>
          )}
          <BatchImportButton
            entityName="部门"
            columns={[{ key: "name", label: "部门名称", required: true, example: "华南事业部" }]}
            onImport={(items) => batchImportMutation.mutateAsync({ items: items as any })}
            onSuccess={() => utils.department.list.invalidate()}
          />
        </div>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={!!departments?.length && selectedIds.size === departments.length} onCheckedChange={(checked) => { if (checked && departments) setSelectedIds(new Set(departments.map((d: any) => d.id))); else setSelectedIds(new Set()); }} />
                </TableHead>
                <TableHead>部门名称</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">加载中...</TableCell></TableRow>
              ) : !departments?.length ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">暂无数据</TableCell></TableRow>
              ) : departments.map((d: any) => (
                <TableRow key={d.id} className={!d.isActive ? "opacity-50" : ""}>
                  <TableCell>
                    <Checkbox checked={selectedIds.has(d.id)} onCheckedChange={(checked) => { const next = new Set(selectedIds); if (checked) next.add(d.id); else next.delete(d.id); setSelectedIds(next); }} />
                  </TableCell>
                  <TableCell>
                    {editingId === d.id ? (
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 w-48" autoFocus onKeyDown={e => { if (e.key === "Enter") updateMutation.mutate({ id: d.id, name: editName }); if (e.key === "Escape") setEditingId(null); }} />
                    ) : (
                      <span className="font-medium">{d.name}</span>
                    )}
                  </TableCell>
                  <TableCell><Badge variant={d.isActive ? "default" : "secondary"} className="text-xs">{d.isActive ? "启用" : "停用"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {editingId === d.id ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => updateMutation.mutate({ id: d.id, name: editName })}>保存</Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>取消</Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => { setEditingId(d.id); setEditName(d.name); }}><Edit2 className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => updateMutation.mutate({ id: d.id, isActive: !d.isActive })} className={d.isActive ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"}>{d.isActive ? "停用" : "启用"}</Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTargetId(d.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除这个部门吗？删除后不可恢复。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTargetId && deleteMutation.mutate({ id: deleteTargetId })} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? "删除中..." : "确认删除"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showBatchDelete} onOpenChange={setShowBatchDelete}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认批量删除</AlertDialogTitle><AlertDialogDescription>确定要删除选中的 {selectedIds.size} 个部门吗？删除后不可恢复。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => batchDeleteMutation.mutate({ ids: Array.from(selectedIds) })} disabled={batchDeleteMutation.isPending}>{batchDeleteMutation.isPending ? "删除中..." : `确认删除 ${selectedIds.size} 项`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function CargoTypeTab() {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showBatchDelete, setShowBatchDelete] = useState(false);

  const utils = trpc.useUtils();
  const { data: cargoTypes, isLoading } = trpc.cargoType.list.useQuery({ activeOnly: false });
  const createMutation = trpc.cargoType.create.useMutation({
    onSuccess: () => { utils.cargoType.list.invalidate(); setNewName(""); toast.success("货物类型创建成功"); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateMutation = trpc.cargoType.update.useMutation({
    onSuccess: () => { utils.cargoType.list.invalidate(); setEditingId(null); toast.success("货物类型更新成功"); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.cargoType.delete.useMutation({
    onSuccess: () => { utils.cargoType.list.invalidate(); toast.success("货物类型已删除"); setDeleteTargetId(null); },
    onError: (err) => toast.error(err.message),
  });
  const batchImportMutation = trpc.cargoType.batchImport.useMutation({
    onSuccess: (result) => { utils.cargoType.list.invalidate(); toast.success(`成功导入 ${result.count} 个货物类型`); },
    onError: (err) => toast.error(err.message),
  });
  const batchDeleteMutation = trpc.cargoType.batchDelete.useMutation({
    onSuccess: (result) => { utils.cargoType.list.invalidate(); toast.success(`已删除 ${result.count} 个货物类型`); setSelectedIds(new Set()); setShowBatchDelete(false); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" />货物类型配置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="输入货物类型名称" className="max-w-xs" onKeyDown={e => { if (e.key === "Enter" && newName.trim()) createMutation.mutate({ name: newName.trim() }); }} />
          <Button size="sm" onClick={() => { if (newName.trim()) createMutation.mutate({ name: newName.trim() }); }} disabled={!newName.trim() || createMutation.isPending}>
            <Plus className="h-4 w-4 mr-1" />添加
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setShowBatchDelete(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />删除选中 ({selectedIds.size})
            </Button>
          )}
          <BatchImportButton
            entityName="货物类型"
            columns={[{ key: "name", label: "货物类型名称", required: true, example: "电子产品" }]}
            onImport={(items) => batchImportMutation.mutateAsync({ items: items as any })}
            onSuccess={() => utils.cargoType.list.invalidate()}
          />
        </div>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={!!cargoTypes?.length && selectedIds.size === cargoTypes.length} onCheckedChange={(checked) => { if (checked && cargoTypes) setSelectedIds(new Set(cargoTypes.map((ct: any) => ct.id))); else setSelectedIds(new Set()); }} />
                </TableHead>
                <TableHead>货物类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">加载中...</TableCell></TableRow>
              ) : !cargoTypes?.length ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">暂无数据</TableCell></TableRow>
              ) : cargoTypes.map((ct: any) => (
                <TableRow key={ct.id} className={!ct.isActive ? "opacity-50" : ""}>
                  <TableCell>
                    <Checkbox checked={selectedIds.has(ct.id)} onCheckedChange={(checked) => { const next = new Set(selectedIds); if (checked) next.add(ct.id); else next.delete(ct.id); setSelectedIds(next); }} />
                  </TableCell>
                  <TableCell>
                    {editingId === ct.id ? (
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 w-48" autoFocus onKeyDown={e => { if (e.key === "Enter") updateMutation.mutate({ id: ct.id, name: editName }); if (e.key === "Escape") setEditingId(null); }} />
                    ) : (
                      <span className="font-medium">{ct.name}</span>
                    )}
                  </TableCell>
                  <TableCell><Badge variant={ct.isActive ? "default" : "secondary"} className="text-xs">{ct.isActive ? "启用" : "停用"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {editingId === ct.id ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => updateMutation.mutate({ id: ct.id, name: editName })}>保存</Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>取消</Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => { setEditingId(ct.id); setEditName(ct.name); }}><Edit2 className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => updateMutation.mutate({ id: ct.id, isActive: !ct.isActive })} className={ct.isActive ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"}>{ct.isActive ? "停用" : "启用"}</Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTargetId(ct.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除这个货物类型吗？删除后不可恢复。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTargetId && deleteMutation.mutate({ id: deleteTargetId })} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? "删除中..." : "确认删除"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showBatchDelete} onOpenChange={setShowBatchDelete}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认批量删除</AlertDialogTitle><AlertDialogDescription>确定要删除选中的 {selectedIds.size} 个货物类型吗？删除后不可恢复。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => batchDeleteMutation.mutate({ ids: Array.from(selectedIds) })} disabled={batchDeleteMutation.isPending}>{batchDeleteMutation.isPending ? "删除中..." : `确认删除 ${selectedIds.size} 项`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ============================================================
// 预警阈值设置Tab
// ============================================================
function ThresholdConfigTab() {
  const utils = trpc.useUtils();
  const { data: thresholds, isLoading } = trpc.sysConfig.getThresholds.useQuery();
  const updateMutation = trpc.sysConfig.updateThresholds.useMutation({
    onSuccess: () => {
      utils.sysConfig.getThresholds.invalidate();
      toast.success("预警阈值已保存");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // 积压预警阈值
  const [backlogYellow, setBacklogYellow] = useState(5);
  const [backlogOrange, setBacklogOrange] = useState(10);
  const [backlogRed, setBacklogRed] = useState(15);
  // 超期回单阈值
  const [podYellow, setPodYellow] = useState(5);
  const [podOrange, setPodOrange] = useState(15);
  const [podRed, setPodRed] = useState(15);

  useEffect(() => {
    if (thresholds) {
      setBacklogYellow(thresholds.backlog_threshold_yellow ?? 5);
      setBacklogOrange(thresholds.backlog_threshold_orange ?? 10);
      setBacklogRed(thresholds.backlog_threshold_red ?? 15);
      setPodYellow(thresholds.pod_overdue_threshold_yellow ?? 5);
      setPodOrange(thresholds.pod_overdue_threshold_orange ?? 15);
      setPodRed(thresholds.pod_overdue_threshold_red ?? 15);
    }
  }, [thresholds]);

  const handleSave = () => {
    // 校验递增
    if (backlogYellow >= backlogOrange || backlogOrange >= backlogRed) {
      toast.error("积压预警阈值必须递增：黄色 < 橙色 < 红色");
      return;
    }
    if (podYellow >= podOrange || podOrange > podRed) {
      toast.error("超期回单阈值必须递增：黄色 < 橙色 ≤ 红色");
      return;
    }
    updateMutation.mutate({
      thresholds: [
        { key: "backlog_threshold_yellow", value: backlogYellow },
        { key: "backlog_threshold_orange", value: backlogOrange },
        { key: "backlog_threshold_red", value: backlogRed },
        { key: "pod_overdue_threshold_yellow", value: podYellow },
        { key: "pod_overdue_threshold_orange", value: podOrange },
        { key: "pod_overdue_threshold_red", value: podRed },
      ],
    });
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-6">
      {/* 积压预警阈值 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            调度员积压预警阈值
          </CardTitle>
          <p className="text-xs text-muted-foreground">当调度员积压订单数达到阈值时，系统将自动发送分级预警通知（每2小时检查一次）</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
                黄色预警（单）
              </label>
              <Input
                type="number"
                min={1}
                value={backlogYellow}
                onChange={(e) => setBacklogYellow(parseInt(e.target.value) || 1)}
                className="border-yellow-300 focus:ring-yellow-400"
              />
              <p className="text-xs text-muted-foreground">积压≥此值时触发黄色预警</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                橙色警告（单）
              </label>
              <Input
                type="number"
                min={1}
                value={backlogOrange}
                onChange={(e) => setBacklogOrange(parseInt(e.target.value) || 1)}
                className="border-orange-300 focus:ring-orange-400"
              />
              <p className="text-xs text-muted-foreground">积压≥此值时触发橙色警告</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                红色紧急（单）
              </label>
              <Input
                type="number"
                min={1}
                value={backlogRed}
                onChange={(e) => setBacklogRed(parseInt(e.target.value) || 1)}
                className="border-red-300 focus:ring-red-400"
              />
              <p className="text-xs text-muted-foreground">积压≥此值时触发红色紧急</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 超期回单阈值 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-blue-500" />
            超期回单预警阈值
          </CardTitle>
          <p className="text-xs text-muted-foreground">当回单超期天数达到阈值时，系统将自动发送分级预警通知（每24小时检查一次）</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
                黄色预警（天）
              </label>
              <Input
                type="number"
                min={1}
                value={podYellow}
                onChange={(e) => setPodYellow(parseInt(e.target.value) || 1)}
                className="border-yellow-300 focus:ring-yellow-400"
              />
              <p className="text-xs text-muted-foreground">超期≤此天数时触发黄色预警</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                橙色警告（天）
              </label>
              <Input
                type="number"
                min={1}
                value={podOrange}
                onChange={(e) => setPodOrange(parseInt(e.target.value) || 1)}
                className="border-orange-300 focus:ring-orange-400"
              />
              <p className="text-xs text-muted-foreground">超期达到此天数时触发橙色警告</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                红色紧急（天）
              </label>
              <Input
                type="number"
                min={1}
                value={podRed}
                onChange={(e) => setPodRed(parseInt(e.target.value) || 1)}
                className="border-red-300 focus:ring-red-400"
              />
              <p className="text-xs text-muted-foreground">超期≥此天数时触发红色紧急</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {updateMutation.isPending ? "保存中..." : "保存阈值配置"}
        </Button>
      </div>

      {/* 说明 */}
      <Card className="bg-muted/50">
        <CardContent className="pt-4">
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>调度员积压预警：</strong>每2小时自动扫描各调度员未完成订单数，超过阈值时发送通知（24小时内同一调度员同一级别不重复通知）。</p>
            <p><strong>超期回单预警：</strong>每24小时自动扫描未回收回单，超过阈值天数时发送分级通知。</p>
            <p><strong>注意：</strong>修改阈值后，下一次定时检查时将自动采用新阈值，无需重启服务。</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MiscConfig() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">系统配置</h1>
          <p className="text-sm text-muted-foreground mt-0.5">管理业务部门、货物类型和预警阈值的基础配置</p>
        </div>
        <Tabs defaultValue="departments">
          <TabsList>
            <TabsTrigger value="departments">业务部门</TabsTrigger>
            <TabsTrigger value="cargoTypes">货物类型</TabsTrigger>
            <TabsTrigger value="thresholds">预警阈值</TabsTrigger>
          </TabsList>
          <TabsContent value="departments" className="mt-4"><DepartmentTab /></TabsContent>
          <TabsContent value="cargoTypes" className="mt-4"><CargoTypeTab /></TabsContent>
          <TabsContent value="thresholds" className="mt-4"><ThresholdConfigTab /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
