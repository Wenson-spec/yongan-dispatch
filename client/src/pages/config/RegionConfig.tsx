import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Search, Edit2, Trash2, Upload } from "lucide-react";
import { BatchImportButton } from "@/components/BatchOperations";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export default function RegionConfig() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ dispatcherId: 0, province: "", city: "", priority: 1 });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBatchDelete, setShowBatchDelete] = useState(false);

  const utils = trpc.useUtils();
  const { data: regions, isLoading } = trpc.dispatcherRegion.list.useQuery();
  const { data: dispatchers } = trpc.user.list.useQuery({ activeOnly: true });
  const createMutation = trpc.dispatcherRegion.create.useMutation({
    onSuccess: () => { utils.dispatcherRegion.list.invalidate(); setDialogOpen(false); resetForm(); toast.success("区域配置创建成功"); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateMutation = trpc.dispatcherRegion.update.useMutation({
    onSuccess: () => { utils.dispatcherRegion.list.invalidate(); setDialogOpen(false); resetForm(); toast.success("区域配置更新成功"); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.dispatcherRegion.delete.useMutation({
    onSuccess: () => { utils.dispatcherRegion.list.invalidate(); toast.success("区域配置已删除"); },
    onError: (err: any) => toast.error(err.message),
  });
  const batchDeleteMutation = trpc.dispatcherRegion.batchDelete.useMutation({
    onSuccess: (result) => { utils.dispatcherRegion.list.invalidate(); toast.success(`已删除 ${result.count} 个区域配置`); setSelectedIds(new Set()); setShowBatchDelete(false); },
    onError: (err) => toast.error(err.message),
  });
  const batchImportMutation = trpc.dispatcherRegion.batchImport.useMutation({
    onSuccess: (result) => { utils.dispatcherRegion.list.invalidate(); toast.success(`成功导入 ${result.count} 个区域配置`); },
    onError: (err) => toast.error(err.message),
  });

  // 过滤出调度员角色的用户
  const dispatcherUsers = useMemo(() => {
    if (!dispatchers) return [];
    return dispatchers.filter((u: any) =>
      ["outsource_dispatcher", "fleet_dispatcher", "ltl_dispatcher"].includes(u.role)
    );
  }, [dispatchers]);

  const filtered = useMemo(() => {
    if (!regions) return [];
    if (!search) return regions;
    const s = search.toLowerCase();
    return regions.filter((r: any) => r.province?.toLowerCase().includes(s) || r.city?.toLowerCase().includes(s) || r.dispatcherName?.toLowerCase().includes(s));
  }, [regions, search]);

  function resetForm() { setForm({ dispatcherId: 0, province: "", city: "", priority: 1 }); setEditingId(null); }

  function openEdit(r: any) {
    setEditingId(r.id);
    setForm({ dispatcherId: r.dispatcherId, province: r.province ?? "", city: r.city ?? "", priority: r.priority ?? 1 });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.dispatcherId) { toast.error("请选择调度员"); return; }
    if (!form.province.trim()) { toast.error("省份不能为空"); return; }
    if (editingId) { updateMutation.mutate({ id: editingId, ...form }); }
    else { createMutation.mutate(form); }
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">调度员区域配置</h1>
            <p className="text-sm text-muted-foreground mt-0.5">配置调度员负责的区域，用于外请订单自动分派。广东省按城市匹配，其他省份按省份匹配。</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setDialogOpen(true); }} size="sm"><Plus className="h-4 w-4 mr-1" />新增配置</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "编辑区域配置" : "新增区域配置"}</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label>调度员 *</Label>
                  <Select value={form.dispatcherId ? String(form.dispatcherId) : ""} onValueChange={v => setForm({ ...form, dispatcherId: Number(v) })}>
                    <SelectTrigger><SelectValue placeholder="选择调度员" /></SelectTrigger>
                    <SelectContent>
                      {dispatcherUsers.map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>省份 *</Label><Input value={form.province} onChange={e => setForm({ ...form, province: e.target.value })} placeholder="如：广东省" /></div>
                  <div className="space-y-1.5"><Label>城市（广东省必填）</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="如：广州市" /></div>
                </div>
                <div className="space-y-1.5"><Label>优先级</Label><Input type="number" value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })} min={1} max={99} /></div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
                  <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>保存</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索省份、城市、调度员..." className="pl-9" />
          </div>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setShowBatchDelete(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />删除选中 ({selectedIds.size})
            </Button>
          )}
          <BatchImportButton
            entityName="区域配置"
            columns={[
              { key: "dispatcherName", label: "调度员姓名", required: true, example: "张三" },
              { key: "province", label: "省份", required: true, example: "广东" },
              { key: "city", label: "城市", example: "广州" },
              { key: "priority", label: "优先级", example: "1" },
            ]}
            onImport={(items) => batchImportMutation.mutateAsync({ items: items as any })}
            onSuccess={() => utils.dispatcherRegion.list.invalidate()}
          />
          <Badge variant="secondary" className="text-xs">共 {filtered.length} 条</Badge>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={(checked) => {
                      if (checked) setSelectedIds(new Set(filtered.map((r: any) => r.id)));
                      else setSelectedIds(new Set());
                    }}
                  />
                </TableHead>
                <TableHead>调度员</TableHead>
                <TableHead>省份</TableHead>
                <TableHead>城市</TableHead>
                <TableHead>优先级</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">暂无区域配置</TableCell></TableRow>
              ) : filtered.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(r.id)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedIds);
                        if (checked) next.add(r.id); else next.delete(r.id);
                        setSelectedIds(next);
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{r.dispatcherName || `用户#${r.dispatcherId}`}</TableCell>
                  <TableCell>{r.province}</TableCell>
                  <TableCell>{r.city || "（全省）"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{r.priority}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { if (confirm("确定删除此区域配置？")) deleteMutation.mutate({ id: r.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    {/* 批量删除确认 */}
    <AlertDialog open={showBatchDelete} onOpenChange={setShowBatchDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认批量删除</AlertDialogTitle>
          <AlertDialogDescription>确定要删除选中的 {selectedIds.size} 个区域配置吗？删除后不可恢复。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => batchDeleteMutation.mutate({ ids: Array.from(selectedIds) })} disabled={batchDeleteMutation.isPending}>
            {batchDeleteMutation.isPending ? "删除中..." : `确认删除 ${selectedIds.size} 项`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </DashboardLayout>
  );
}
