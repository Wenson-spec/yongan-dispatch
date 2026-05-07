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

const DRIVER_TYPE_LABELS: Record<string, string> = { own: "自有", outsource: "外请" };

export default function DriverManagement() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", idCard: "", driverType: "own" as "own" | "outsource",
    commonPlateNumber: "", depositAmount: "",
  });

  const utils = trpc.useUtils();
  const { data: drivers, isLoading } = trpc.driver.list.useQuery({ activeOnly: false });
  const createMutation = trpc.driver.create.useMutation({
    onSuccess: () => { utils.driver.list.invalidate(); setDialogOpen(false); resetForm(); toast.success("司机创建成功"); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateMutation = trpc.driver.update.useMutation({
    onSuccess: () => { utils.driver.list.invalidate(); setDialogOpen(false); resetForm(); toast.success("司机更新成功"); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.driver.delete.useMutation({
    onSuccess: () => { utils.driver.list.invalidate(); toast.success("司机已删除"); setDeleteTargetId(null); },
    onError: (err) => toast.error(err.message),
  });
  const batchImportMutation = trpc.driver.batchImport.useMutation({
    onSuccess: (result) => { utils.driver.list.invalidate(); toast.success(`成功导入 ${result.count} 个司机`); },
    onError: (err) => toast.error(err.message),
  });
  const batchDeleteMutation = trpc.driver.batchDelete.useMutation({
    onSuccess: (result) => { utils.driver.list.invalidate(); toast.success(`已删除 ${result.count} 个司机`); setSelectedIds(new Set()); setShowBatchDelete(false); },
    onError: (err) => toast.error(err.message),
  });

  const filtered = useMemo(() => {
    if (!drivers) return [];
    if (!search) return drivers;
    const s = search.toLowerCase();
    return drivers.filter((d: any) => d.name.toLowerCase().includes(s) || d.phone?.toLowerCase().includes(s) || d.commonPlateNumber?.toLowerCase().includes(s));
  }, [drivers, search]);

  function resetForm() { setForm({ name: "", phone: "", idCard: "", driverType: "own", commonPlateNumber: "", depositAmount: "" }); setEditingId(null); }

  function openEdit(d: any) {
    setEditingId(d.id);
    setForm({
      name: d.name, phone: d.phone ?? "", idCard: d.idCard ?? "",
      driverType: d.driverType ?? "own", commonPlateNumber: d.commonPlateNumber ?? "",
      depositAmount: d.depositAmount ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("司机姓名不能为空"); return; }
    if (editingId) { updateMutation.mutate({ id: editingId, ...form }); }
    else { createMutation.mutate(form); }
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">司机管理</h1>
            <p className="text-sm text-muted-foreground mt-0.5">管理自有和外请司机信息</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setDialogOpen(true); }} size="sm"><Plus className="h-4 w-4 mr-1" />新增司机</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "编辑司机" : "新增司机"}</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>姓名 *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>联系电话</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>身份证号</Label><Input value={form.idCard} onChange={e => setForm({ ...form, idCard: e.target.value })} /></div>
                  <div className="space-y-1.5">
                    <Label>司机类型</Label>
                    <Select value={form.driverType} onValueChange={(v: any) => setForm({ ...form, driverType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="own">自有</SelectItem>
                        <SelectItem value="outsource">外请</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>常用车牌</Label><Input value={form.commonPlateNumber} onChange={e => setForm({ ...form, commonPlateNumber: e.target.value })} placeholder="如：粤A12345" /></div>
                  <div className="space-y-1.5"><Label>押金金额</Label><Input value={form.depositAmount} onChange={e => setForm({ ...form, depositAmount: e.target.value })} placeholder="如：5000" /></div>
                </div>
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
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索姓名、电话、车牌..." className="pl-9" />
          </div>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setShowBatchDelete(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />删除选中 ({selectedIds.size})
            </Button>
          )}
          <BatchImportButton
            entityName="司机"
            columns={[
              { key: "name", label: "司机姓名", required: true, example: "李师傅" },
              { key: "phone", label: "联系电话", required: true, example: "13900139000" },
              { key: "idCard", label: "身份证号", example: "440106199001011234" },
              { key: "driverType", label: "司机类型", example: "自有", enumMap: { "自有": "own", "外请": "outsource" } },
              { key: "commonPlateNumber", label: "常用车牌", example: "粤B88888" },
              { key: "depositAmount", label: "押金金额", example: "5000" },
            ]}
            onImport={(items) => batchImportMutation.mutateAsync({ items: items as any })}
            onSuccess={() => utils.driver.list.invalidate()}
          />
          <Badge variant="secondary" className="text-xs">共 {filtered.length} 人</Badge>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={filtered.length > 0 && selectedIds.size === filtered.length} onCheckedChange={(checked) => { if (checked) setSelectedIds(new Set(filtered.map((d: any) => d.id))); else setSelectedIds(new Set()); }} />
                </TableHead>
                <TableHead>姓名</TableHead>
                <TableHead>联系电话</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>常用车牌</TableHead>
                <TableHead>押金金额</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">暂无数据</TableCell></TableRow>
              ) : filtered.map((d: any) => (
                <TableRow key={d.id} className={!d.isActive ? "opacity-50" : ""}>
                  <TableCell>
                    <Checkbox checked={selectedIds.has(d.id)} onCheckedChange={(checked) => { const next = new Set(selectedIds); if (checked) next.add(d.id); else next.delete(d.id); setSelectedIds(next); }} />
                  </TableCell>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.phone || "-"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{DRIVER_TYPE_LABELS[d.driverType] || d.driverType}</Badge></TableCell>
                  <TableCell>{d.commonPlateNumber || "-"}</TableCell>
                  <TableCell>{d.depositAmount || "-"}</TableCell>
                  <TableCell><Badge variant={d.isActive ? "default" : "secondary"} className="text-xs">{d.isActive ? "启用" : "停用"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(d)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => updateMutation.mutate({ id: d.id, isActive: !d.isActive })} className={d.isActive ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"}>{d.isActive ? "停用" : "启用"}</Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTargetId(d.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除这个司机吗？删除后不可恢复。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTargetId && deleteMutation.mutate({ id: deleteTargetId })} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? "删除中..." : "确认删除"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showBatchDelete} onOpenChange={setShowBatchDelete}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认批量删除</AlertDialogTitle><AlertDialogDescription>确定要删除选中的 {selectedIds.size} 个司机吗？删除后不可恢复。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => batchDeleteMutation.mutate({ ids: Array.from(selectedIds) })} disabled={batchDeleteMutation.isPending}>{batchDeleteMutation.isPending ? "删除中..." : `确认删除 ${selectedIds.size} 项`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
