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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Edit2, Trash2, Upload } from "lucide-react";
import { BatchImportButton } from "@/components/BatchOperations";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useMemo } from "react";
import { toast } from "sonner";

const SETTLEMENT_LABELS: Record<string, string> = {
  monthly: "月结",
  cash: "现付",
  collect: "到付",
};

export default function CustomerManagement() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    salesperson: "",
    settlementType: "monthly" as "monthly" | "cash" | "collect",
    department: "",
    remarks: "",
  });

  const utils = trpc.useUtils();
  const { data: customers, isLoading } = trpc.customer.list.useQuery({ activeOnly: false });
  const createMutation = trpc.customer.create.useMutation({
    onSuccess: () => {
      utils.customer.list.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success("客户创建成功");
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.customer.delete.useMutation({
    onSuccess: () => {
      utils.customer.list.invalidate();
      toast.success("客户已删除");
      setDeleteTargetId(null);
    },
    onError: (err) => toast.error(err.message),
  });
  const batchDeleteMutation = trpc.customer.batchDelete.useMutation({
    onSuccess: (result) => {
      utils.customer.list.invalidate();
      toast.success(`已删除 ${result.count} 个客户`);
      setSelectedIds(new Set());
      setShowBatchDelete(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const batchImportMutation = trpc.customer.batchImport.useMutation({
    onSuccess: (result) => {
      utils.customer.list.invalidate();
      toast.success(`成功导入 ${result.count} 个客户`);
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.customer.update.useMutation({
    onSuccess: () => {
      utils.customer.list.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success("客户更新成功");
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    if (!search) return customers;
    const s = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.phone?.toLowerCase().includes(s) ||
        c.salesperson?.toLowerCase().includes(s)
    );
  }, [customers, search]);

  function resetForm() {
    setForm({ name: "", phone: "", salesperson: "", settlementType: "monthly", department: "", remarks: "" });
    setEditingId(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(customer: NonNullable<typeof customers>[number]) {
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      phone: customer.phone ?? "",
      salesperson: customer.salesperson ?? "",
      settlementType: (customer.settlementType as "monthly" | "cash" | "collect") ?? "monthly",
      department: customer.department ?? "",
      remarks: customer.remarks ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      toast.error("客户名称不能为空");
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...form });
    } else {
      createMutation.mutate(form);
    }
  }

  function toggleActive(id: number, currentActive: boolean) {
    updateMutation.mutate({ id, isActive: !currentActive });
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">客户管理</h1>
            <p className="text-sm text-muted-foreground mt-0.5">管理系统中的客户信息，包括名称、联系方式和结算方式</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                新增客户
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "编辑客户" : "新增客户"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label>客户名称 *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="请输入客户名称" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>联系电话</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="请输入电话" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>业务员</Label>
                    <Input value={form.salesperson} onChange={(e) => setForm({ ...form, salesperson: e.target.value })} placeholder="请输入业务员" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>结算方式</Label>
                    <Select value={form.settlementType} onValueChange={(v) => setForm({ ...form, settlementType: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">月结</SelectItem>
                        <SelectItem value="cash">现付</SelectItem>
                        <SelectItem value="collect">到付</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>所属部门</Label>
                    <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="请输入部门" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>备注</Label>
                  <Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="请输入备注信息" rows={2} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
                  <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                    {createMutation.isPending || updateMutation.isPending ? "保存中..." : "保存"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索客户名称、电话、业务员..."
              className="pl-9"
            />
          </div>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setShowBatchDelete(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              删除选中 ({selectedIds.size})
            </Button>
          )}
          <BatchImportButton
            entityName="客户"
            columns={[
              { key: "name", label: "客户名称", required: true, example: "永安物流" },
              { key: "phone", label: "联系电话", example: "13800138000" },
              { key: "salesperson", label: "业务员", example: "张三" },
              { key: "settlementType", label: "结算方式", example: "月结", enumMap: { "月结": "monthly", "现付": "cash", "到付": "collect" } },
              { key: "department", label: "所属部门", example: "华南事业部" },
              { key: "remarks", label: "备注", example: "VIP客户" },
            ]}
            onImport={(items) => batchImportMutation.mutateAsync({ items: items as any })}
            onSuccess={() => utils.customer.list.invalidate()}
          />
          <Badge variant="secondary" className="text-xs">
            共 {filteredCustomers.length} 条
          </Badge>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filteredCustomers.length > 0 && selectedIds.size === filteredCustomers.length}
                    onCheckedChange={(checked) => {
                      if (checked) setSelectedIds(new Set(filteredCustomers.map(c => c.id)));
                      else setSelectedIds(new Set());
                    }}
                  />
                </TableHead>
                <TableHead className="w-[200px]">客户名称</TableHead>
                <TableHead>联系电话</TableHead>
                <TableHead>业务员</TableHead>
                <TableHead>结算方式</TableHead>
                <TableHead>所属部门</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {search ? "未找到匹配的客户" : "暂无客户数据，请点击『新增客户』添加"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredCustomers.map((customer) => (
                  <TableRow key={customer.id} className={!customer.isActive ? "opacity-50" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(customer.id)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedIds);
                          if (checked) next.add(customer.id); else next.delete(customer.id);
                          setSelectedIds(next);
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>{customer.phone || "-"}</TableCell>
                    <TableCell>{customer.salesperson || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {SETTLEMENT_LABELS[customer.settlementType] || customer.settlementType}
                      </Badge>
                    </TableCell>
                    <TableCell>{customer.department || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={customer.isActive ? "default" : "secondary"} className="text-xs">
                        {customer.isActive ? "启用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(customer)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActive(customer.id, customer.isActive)}
                          className={customer.isActive ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"}
                        >
                          {customer.isActive ? "停用" : "启用"}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTargetId(customer.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    {/* 单条删除确认 */}
    <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>确定要删除这个客户吗？删除后不可恢复。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTargetId && deleteMutation.mutate({ id: deleteTargetId })} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? "删除中..." : "确认删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {/* 批量删除确认 */}
    <AlertDialog open={showBatchDelete} onOpenChange={setShowBatchDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认批量删除</AlertDialogTitle>
          <AlertDialogDescription>确定要删除选中的 {selectedIds.size} 个客户吗？删除后不可恢复。</AlertDialogDescription>
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
