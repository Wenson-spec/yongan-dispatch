import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

export default function WarehouseManagement() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", city: "", address: "", phone: "" });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showBatchDelete, setShowBatchDelete] = useState(false);

  const utils = trpc.useUtils();
  const { data: warehouses, isLoading } = trpc.warehouse.list.useQuery({ activeOnly: false });
  const createMutation = trpc.warehouse.create.useMutation({
    onSuccess: () => { utils.warehouse.list.invalidate(); setDialogOpen(false); resetForm(); toast.success("仓库创建成功"); },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.warehouse.update.useMutation({
    onSuccess: () => { utils.warehouse.list.invalidate(); setDialogOpen(false); resetForm(); toast.success("仓库更新成功"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.warehouse.delete.useMutation({
    onSuccess: () => { utils.warehouse.list.invalidate(); toast.success("仓库已删除"); setDeleteTargetId(null); },
    onError: (err) => toast.error(err.message),
  });
  const batchImportMutation = trpc.warehouse.batchImport.useMutation({
    onSuccess: (result) => { utils.warehouse.list.invalidate(); toast.success(`成功导入 ${result.count} 个仓库`); },
    onError: (err) => toast.error(err.message),
  });
  const batchDeleteMutation = trpc.warehouse.batchDelete.useMutation({
    onSuccess: (result) => { utils.warehouse.list.invalidate(); toast.success(`已删除 ${result.count} 个仓库`); setSelectedIds(new Set()); setShowBatchDelete(false); },
    onError: (err) => toast.error(err.message),
  });

  const filtered = useMemo(() => {
    if (!warehouses) return [];
    if (!search) return warehouses;
    const s = search.toLowerCase();
    return warehouses.filter(w => w.name.toLowerCase().includes(s) || w.city?.toLowerCase().includes(s));
  }, [warehouses, search]);

  function resetForm() { setForm({ name: "", city: "", address: "", phone: "" }); setEditingId(null); }

  function openEdit(w: NonNullable<typeof warehouses>[number]) {
    setEditingId(w.id);
    setForm({ name: w.name, city: w.city ?? "", address: w.address ?? "", phone: w.phone ?? "" });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("仓库名称不能为空"); return; }
    if (editingId) { updateMutation.mutate({ id: editingId, ...form }); }
    else { createMutation.mutate(form); }
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">仓库管理</h1>
            <p className="text-sm text-muted-foreground mt-0.5">管理发货仓库信息</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setDialogOpen(true); }} size="sm"><Plus className="h-4 w-4 mr-1" />新增仓库</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "编辑仓库" : "新增仓库"}</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5"><Label>仓库名称 *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如：清远基地仓" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>所在城市</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="如：清远" /></div>
                  <div className="space-y-1.5"><Label>联系电话</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="请输入电话" /></div>
                </div>
                <div className="space-y-1.5"><Label>详细地址</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="请输入详细地址" /></div>
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
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索仓库名称、城市..." className="pl-9" />
          </div>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setShowBatchDelete(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />删除选中 ({selectedIds.size})
            </Button>
          )}
          <BatchImportButton
            entityName="仓库"
            columns={[
              { key: "name", label: "仓库名称", required: true, example: "广州主仓" },
              { key: "city", label: "城市", example: "广州" },
              { key: "address", label: "地址", example: "白云区某路100号" },
              { key: "phone", label: "联系电话", example: "020-12345678" },
            ]}
            onImport={(items) => batchImportMutation.mutateAsync({ items: items as any })}
            onSuccess={() => utils.warehouse.list.invalidate()}
          />
          <Badge variant="secondary" className="text-xs">共 {filtered.length} 条</Badge>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={filtered.length > 0 && selectedIds.size === filtered.length} onCheckedChange={(checked) => { if (checked) setSelectedIds(new Set(filtered.map(w => w.id))); else setSelectedIds(new Set()); }} />
                </TableHead>
                <TableHead>仓库名称</TableHead>
                <TableHead>所在城市</TableHead>
                <TableHead>详细地址</TableHead>
                <TableHead>联系电话</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">暂无数据</TableCell></TableRow>
              ) : filtered.map(w => (
                <TableRow key={w.id} className={!w.isActive ? "opacity-50" : ""}>
                  <TableCell>
                    <Checkbox checked={selectedIds.has(w.id)} onCheckedChange={(checked) => { const next = new Set(selectedIds); if (checked) next.add(w.id); else next.delete(w.id); setSelectedIds(next); }} />
                  </TableCell>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell>{w.city || "-"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{w.address || "-"}</TableCell>
                  <TableCell>{w.phone || "-"}</TableCell>
                  <TableCell><Badge variant={w.isActive ? "default" : "secondary"} className="text-xs">{w.isActive ? "启用" : "停用"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(w)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => updateMutation.mutate({ id: w.id, isActive: !w.isActive })} className={w.isActive ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"}>{w.isActive ? "停用" : "启用"}</Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTargetId(w.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除这个仓库吗？删除后不可恢复。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTargetId && deleteMutation.mutate({ id: deleteTargetId })} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? "删除中..." : "确认删除"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showBatchDelete} onOpenChange={setShowBatchDelete}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认批量删除</AlertDialogTitle><AlertDialogDescription>确定要删除选中的 {selectedIds.size} 个仓库吗？删除后不可恢复。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => batchDeleteMutation.mutate({ ids: Array.from(selectedIds) })} disabled={batchDeleteMutation.isPending}>{batchDeleteMutation.isPending ? "删除中..." : `确认删除 ${selectedIds.size} 项`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
