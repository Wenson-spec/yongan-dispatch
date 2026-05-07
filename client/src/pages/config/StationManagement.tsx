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

export default function StationManagement() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "", contactPerson: "", coverageArea: "" });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showBatchDelete, setShowBatchDelete] = useState(false);

  const utils = trpc.useUtils();
  const { data: stations, isLoading } = trpc.freightStation.list.useQuery({ activeOnly: false });
  const createMutation = trpc.freightStation.create.useMutation({
    onSuccess: () => { utils.freightStation.list.invalidate(); setDialogOpen(false); resetForm(); toast.success("货站创建成功"); },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.freightStation.update.useMutation({
    onSuccess: () => { utils.freightStation.list.invalidate(); setDialogOpen(false); resetForm(); toast.success("货站更新成功"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.freightStation.delete.useMutation({
    onSuccess: () => { utils.freightStation.list.invalidate(); toast.success("货站已删除"); setDeleteTargetId(null); },
    onError: (err) => toast.error(err.message),
  });
  const batchImportMutation = trpc.freightStation.batchImport.useMutation({
    onSuccess: (result) => { utils.freightStation.list.invalidate(); toast.success(`成功导入 ${result.count} 个货站`); },
    onError: (err) => toast.error(err.message),
  });
  const batchDeleteMutation = trpc.freightStation.batchDelete.useMutation({
    onSuccess: (result) => { utils.freightStation.list.invalidate(); toast.success(`已删除 ${result.count} 个货站`); setSelectedIds(new Set()); setShowBatchDelete(false); },
    onError: (err) => toast.error(err.message),
  });

  const filtered = useMemo(() => {
    if (!stations) return [];
    if (!search) return stations;
    const s = search.toLowerCase();
    return stations.filter(st => st.name.toLowerCase().includes(s) || st.coverageArea?.toLowerCase().includes(s) || st.contactPerson?.toLowerCase().includes(s));
  }, [stations, search]);

  function resetForm() { setForm({ name: "", address: "", phone: "", contactPerson: "", coverageArea: "" }); setEditingId(null); }

  function openEdit(st: NonNullable<typeof stations>[number]) {
    setEditingId(st.id);
    setForm({ name: st.name, address: st.address ?? "", phone: st.phone ?? "", contactPerson: st.contactPerson ?? "", coverageArea: st.coverageArea ?? "" });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("货站名称不能为空"); return; }
    if (editingId) { updateMutation.mutate({ id: editingId, ...form }); }
    else { createMutation.mutate(form); }
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">货站管理</h1>
            <p className="text-sm text-muted-foreground mt-0.5">管理中转货站和终到货站信息</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setDialogOpen(true); }} size="sm"><Plus className="h-4 w-4 mr-1" />新增货站</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "编辑货站" : "新增货站"}</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5"><Label>货站名称 *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如：广州南站物流" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>联系人</Label><Input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>联系电话</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                </div>
                <div className="space-y-1.5"><Label>覆盖区域</Label><Input value={form.coverageArea} onChange={e => setForm({ ...form, coverageArea: e.target.value })} placeholder="如：广东省广州市" /></div>
                <div className="space-y-1.5"><Label>详细地址</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
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
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索货站名称、覆盖区域..." className="pl-9" />
          </div>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setShowBatchDelete(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />删除选中 ({selectedIds.size})
            </Button>
          )}
          <BatchImportButton
            entityName="货站"
            columns={[
              { key: "name", label: "货站名称", required: true, example: "广州白云货站" },
              { key: "address", label: "地址", example: "白云区某路200号" },
              { key: "phone", label: "联系电话", example: "020-87654321" },
              { key: "contactPerson", label: "联系人", example: "王五" },
              { key: "coverageArea", label: "覆盖区域", example: "广东全省" },
            ]}
            onImport={(items) => batchImportMutation.mutateAsync({ items: items as any })}
            onSuccess={() => utils.freightStation.list.invalidate()}
          />
          <Badge variant="secondary" className="text-xs">共 {filtered.length} 条</Badge>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={filtered.length > 0 && selectedIds.size === filtered.length} onCheckedChange={(checked) => { if (checked) setSelectedIds(new Set(filtered.map(st => st.id))); else setSelectedIds(new Set()); }} />
                </TableHead>
                <TableHead>货站名称</TableHead>
                <TableHead>联系人</TableHead>
                <TableHead>联系电话</TableHead>
                <TableHead>覆盖区域</TableHead>
                <TableHead>详细地址</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">暂无数据</TableCell></TableRow>
              ) : filtered.map(st => (
                <TableRow key={st.id} className={!st.isActive ? "opacity-50" : ""}>
                  <TableCell>
                    <Checkbox checked={selectedIds.has(st.id)} onCheckedChange={(checked) => { const next = new Set(selectedIds); if (checked) next.add(st.id); else next.delete(st.id); setSelectedIds(next); }} />
                  </TableCell>
                  <TableCell className="font-medium">{st.name}</TableCell>
                  <TableCell>{st.contactPerson || "-"}</TableCell>
                  <TableCell>{st.phone || "-"}</TableCell>
                  <TableCell>{st.coverageArea || "-"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{st.address || "-"}</TableCell>
                  <TableCell><Badge variant={st.isActive ? "default" : "secondary"} className="text-xs">{st.isActive ? "启用" : "停用"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(st)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => updateMutation.mutate({ id: st.id, isActive: !st.isActive })} className={st.isActive ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"}>{st.isActive ? "停用" : "启用"}</Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTargetId(st.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除这个货站吗？删除后不可恢复。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTargetId && deleteMutation.mutate({ id: deleteTargetId })} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? "删除中..." : "确认删除"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showBatchDelete} onOpenChange={setShowBatchDelete}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认批量删除</AlertDialogTitle><AlertDialogDescription>确定要删除选中的 {selectedIds.size} 个货站吗？删除后不可恢复。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => batchDeleteMutation.mutate({ ids: Array.from(selectedIds) })} disabled={batchDeleteMutation.isPending}>{batchDeleteMutation.isPending ? "删除中..." : `确认删除 ${selectedIds.size} 项`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
