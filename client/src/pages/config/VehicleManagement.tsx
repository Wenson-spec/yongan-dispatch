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

const TYPE_LABELS: Record<string, string> = { own: "自有", outsource: "外请" };
const STATUS_LABELS: Record<string, string> = { available: "空闲", in_transit: "运输中", maintenance: "维修中" };

export default function VehicleManagement() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  const [form, setForm] = useState({
    plateNumber: "", vehicleType: "own" as "own" | "outsource",
    model: "", capacity: "", status: "available" as "available" | "in_transit" | "maintenance",
  });

  const utils = trpc.useUtils();
  const { data: vehicles, isLoading } = trpc.vehicle.list.useQuery({ activeOnly: false });
  const createMutation = trpc.vehicle.create.useMutation({
    onSuccess: () => { utils.vehicle.list.invalidate(); setDialogOpen(false); resetForm(); toast.success("车辆创建成功"); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateMutation = trpc.vehicle.update.useMutation({
    onSuccess: () => { utils.vehicle.list.invalidate(); setDialogOpen(false); resetForm(); toast.success("车辆更新成功"); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.vehicle.delete.useMutation({
    onSuccess: () => { utils.vehicle.list.invalidate(); toast.success("车辆已删除"); setDeleteTargetId(null); },
    onError: (err) => toast.error(err.message),
  });
  const batchImportMutation = trpc.vehicle.batchImport.useMutation({
    onSuccess: (result) => { utils.vehicle.list.invalidate(); toast.success(`成功导入 ${result.count} 辆车辆`); },
    onError: (err) => toast.error(err.message),
  });
  const batchDeleteMutation = trpc.vehicle.batchDelete.useMutation({
    onSuccess: (result) => { utils.vehicle.list.invalidate(); toast.success(`已删除 ${result.count} 辆车辆`); setSelectedIds(new Set()); setShowBatchDelete(false); },
    onError: (err) => toast.error(err.message),
  });

  const filtered = useMemo(() => {
    if (!vehicles) return [];
    if (!search) return vehicles;
    const s = search.toLowerCase();
    return vehicles.filter((v: any) => v.plateNumber.toLowerCase().includes(s) || v.model?.toLowerCase().includes(s));
  }, [vehicles, search]);

  function resetForm() { setForm({ plateNumber: "", vehicleType: "own", model: "", capacity: "", status: "available" }); setEditingId(null); }

  function openEdit(v: any) {
    setEditingId(v.id);
    setForm({
      plateNumber: v.plateNumber, vehicleType: v.vehicleType ?? "own",
      model: v.model ?? "", capacity: v.capacity ?? "", status: v.status ?? "available",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.plateNumber.trim()) { toast.error("车牌号不能为空"); return; }
    if (editingId) { updateMutation.mutate({ id: editingId, ...form }); }
    else { createMutation.mutate(form); }
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">车辆管理</h1>
            <p className="text-sm text-muted-foreground mt-0.5">管理自有和外请车辆信息</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setDialogOpen(true); }} size="sm"><Plus className="h-4 w-4 mr-1" />新增车辆</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "编辑车辆" : "新增车辆"}</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>车牌号 *</Label><Input value={form.plateNumber} onChange={e => setForm({ ...form, plateNumber: e.target.value })} placeholder="如：粤A12345" /></div>
                  <div className="space-y-1.5">
                    <Label>车辆类型</Label>
                    <Select value={form.vehicleType} onValueChange={(v: any) => setForm({ ...form, vehicleType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="own">自有</SelectItem>
                        <SelectItem value="outsource">外请</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>车型</Label><Input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="如：9.6米平板" /></div>
                  <div className="space-y-1.5"><Label>载重(吨)</Label><Input value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} placeholder="如：25" /></div>
                </div>
                <div className="space-y-1.5">
                  <Label>状态</Label>
                  <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">空闲</SelectItem>
                      <SelectItem value="in_transit">运输中</SelectItem>
                      <SelectItem value="maintenance">维修中</SelectItem>
                    </SelectContent>
                  </Select>
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
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索车牌号、车型..." className="pl-9" />
          </div>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setShowBatchDelete(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />删除选中 ({selectedIds.size})
            </Button>
          )}
          <BatchImportButton
            entityName="车辆"
            columns={[
              { key: "plateNumber", label: "车牌号", required: true, example: "粤B88888" },
              { key: "vehicleType", label: "车辆类型", required: true, example: "自有", enumMap: { "自有": "own", "外请": "outsource" } },
              { key: "model", label: "车型", example: "9.6米厢式" },
              { key: "capacity", label: "载重(吨)", example: "10" },
            ]}
            onImport={(items) => batchImportMutation.mutateAsync({ items: items as any })}
            onSuccess={() => utils.vehicle.list.invalidate()}
          />
          <Badge variant="secondary" className="text-xs">共 {filtered.length} 辆</Badge>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={filtered.length > 0 && selectedIds.size === filtered.length} onCheckedChange={(checked) => { if (checked) setSelectedIds(new Set(filtered.map((v: any) => v.id))); else setSelectedIds(new Set()); }} />
                </TableHead>
                <TableHead>车牌号</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>车型</TableHead>
                <TableHead>载重(吨)</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>启用</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">暂无数据</TableCell></TableRow>
              ) : filtered.map((v: any) => (
                <TableRow key={v.id} className={!v.isActive ? "opacity-50" : ""}>
                  <TableCell>
                    <Checkbox checked={selectedIds.has(v.id)} onCheckedChange={(checked) => { const next = new Set(selectedIds); if (checked) next.add(v.id); else next.delete(v.id); setSelectedIds(next); }} />
                  </TableCell>
                  <TableCell className="font-medium">{v.plateNumber}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{TYPE_LABELS[v.vehicleType] || v.vehicleType}</Badge></TableCell>
                  <TableCell>{v.model || "-"}</TableCell>
                  <TableCell>{v.capacity || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={v.status === "available" ? "default" : v.status === "in_transit" ? "secondary" : "destructive"} className="text-xs">
                      {STATUS_LABELS[v.status] || v.status}
                    </Badge>
                  </TableCell>
                  <TableCell><Badge variant={v.isActive ? "default" : "secondary"} className="text-xs">{v.isActive ? "启用" : "停用"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(v)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => updateMutation.mutate({ id: v.id, isActive: !v.isActive })} className={v.isActive ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"}>{v.isActive ? "停用" : "启用"}</Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTargetId(v.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除这辆车吗？删除后不可恢复。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTargetId && deleteMutation.mutate({ id: deleteTargetId })} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? "删除中..." : "确认删除"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showBatchDelete} onOpenChange={setShowBatchDelete}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认批量删除</AlertDialogTitle><AlertDialogDescription>确定要删除选中的 {selectedIds.size} 辆车吗？删除后不可恢复。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => batchDeleteMutation.mutate({ ids: Array.from(selectedIds) })} disabled={batchDeleteMutation.isPending}>{batchDeleteMutation.isPending ? "删除中..." : `确认删除 ${selectedIds.size} 项`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
