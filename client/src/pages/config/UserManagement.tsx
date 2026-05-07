import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Edit2, Plus, Lock, Trash2, Shield, CheckCircle2, XCircle, Eye } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { ROLE_LABELS, PERMISSION_GROUPS, ALL_PERMISSION_KEYS } from "@shared/permissions";

const USER_ROLES = [
  "admin", "order_entry", "ltl_cs", "chain_cs", "ltl_dispatcher",
  "outsource_dispatcher", "fleet_dispatcher", "field_manager", "cs_manager", "finance_assistant",
] as const;

export default function UserManagement() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{ id: number; name: string; phone: string; role: string; region: string } | null>(null);
  const [newUser, setNewUser] = useState({ username: "", password: "", name: "", role: "order_entry", phone: "", region: "" });
  const [resetPasswordUser, setResetPasswordUser] = useState<{ id: number; username: string; newPassword: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  // 权限预览
  const [permPreviewUser, setPermPreviewUser] = useState<{ id: number; name: string; role: string } | null>(null);

  const utils = trpc.useUtils();
  const { data: users, isLoading, error: usersError } = trpc.user.list.useQuery({ activeOnly: false }, { retry: false });
  const updateRoleMutation = trpc.user.updateRole.useMutation({
    onSuccess: () => { utils.user.list.invalidate(); toast.success("角色更新成功"); },
    onError: (err) => toast.error(err.message),
  });
  const updateInfoMutation = trpc.user.updateInfo.useMutation({
    onSuccess: () => { utils.user.list.invalidate(); setDialogOpen(false); toast.success("用户信息更新成功"); },
    onError: (err) => toast.error(err.message),
  });
  const createUserMutation = trpc.auth.createUser.useMutation({
    onSuccess: () => { utils.user.list.invalidate(); setCreateDialogOpen(false); setNewUser({ username: "", password: "", name: "", role: "order_entry", phone: "", region: "" }); toast.success("用户创建成功"); },
    onError: (err) => toast.error(err.message),
  });
  const resetPasswordMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => { setResetPasswordDialogOpen(false); setResetPasswordUser(null); toast.success("密码重置成功"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteUserMutation = trpc.user.updateInfo.useMutation({
    onSuccess: () => { utils.user.list.invalidate(); toast.success("用户已停用"); setDeleteTargetId(null); },
    onError: (err) => toast.error(err.message),
  });

  // 查询权限预览用户的角色权限
  const { data: previewPermissions, isLoading: permLoading } = trpc.permission.listForRole.useQuery(
    { role: permPreviewUser?.role ?? "" },
    { enabled: !!permPreviewUser }
  );

  const previewAllowedKeys = useMemo(() => {
    if (!previewPermissions) return new Set<string>();
    if (permPreviewUser?.role === "admin") return new Set(ALL_PERMISSION_KEYS);
    return new Set(previewPermissions.filter((p: any) => p.allowed).map((p: any) => p.permissionKey));
  }, [previewPermissions, permPreviewUser]);

  const filtered = useMemo(() => {
    if (!users) return [];
    if (!search) return users;
    const s = search.toLowerCase();
    return users.filter(u => u.name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s) || u.phone?.toLowerCase().includes(s));
  }, [users, search]);

  function openEdit(u: NonNullable<typeof users>[number]) {
    setEditingUser({ id: u.id, name: u.name ?? "", phone: u.phone ?? "", role: u.role, region: u.region ?? "" });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!editingUser) return;
    updateInfoMutation.mutate({
      id: editingUser.id,
      name: editingUser.name || undefined,
      phone: editingUser.phone || undefined,
      region: editingUser.region || undefined,
    });
    updateRoleMutation.mutate({ id: editingUser.id, role: editingUser.role });
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">用户管理</h1>
            <p className="text-sm text-muted-foreground mt-0.5">管理系统用户的角色、基本信息和密码。点击「查看权限」可预览用户实际权限列表。</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2"><Plus className="h-4 w-4" />创建用户</Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索用户名、邮箱、手机号..." className="pl-9" />
          </div>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setShowBatchDelete(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />停用选中 ({selectedIds.size})
            </Button>
          )}
          <Badge variant="secondary" className="text-xs">共 {filtered.length} 人</Badge>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={filtered.length > 0 && selectedIds.size === filtered.length} onCheckedChange={(checked) => { if (checked) setSelectedIds(new Set(filtered.map(u => u.id))); else setSelectedIds(new Set()); }} />
                </TableHead>
                <TableHead>用户名</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>手机号</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>负责区域</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>最后登录</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersError ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">
                  <div className="flex flex-col items-center gap-2">
                    <Shield className="h-8 w-8 text-destructive" />
                    <span className="text-destructive font-medium">{usersError.message.includes('FORBIDDEN') || usersError.message.includes('权限') ? '您没有权限访问用户管理，请联系管理员' : `加载失败：${usersError.message}`}</span>
                  </div>
                </TableCell></TableRow>
              ) : isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">加载中...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">暂无用户数据</TableCell></TableRow>
              ) : filtered.map(u => (
                <TableRow key={u.id} className={!u.isActive ? "opacity-50" : ""}>
                  <TableCell>
                    <Checkbox checked={selectedIds.has(u.id)} onCheckedChange={(checked) => { const next = new Set(selectedIds); if (checked) next.add(u.id); else next.delete(u.id); setSelectedIds(next); }} />
                  </TableCell>
                  <TableCell className="font-medium">{u.name || "-"}</TableCell>
                  <TableCell className="text-sm">{u.email || "-"}</TableCell>
                  <TableCell>{u.phone || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {ROLE_LABELS[u.role] || u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{u.region || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? "default" : "secondary"} className="text-xs">
                      {u.isActive ? "启用" : "停用"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleString("zh-CN") : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              onClick={() => setPermPreviewUser({ id: u.id, name: u.name ?? u.email ?? "用户", role: u.role })}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>查看权限</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => { setResetPasswordUser({ id: u.id, username: u.username ?? u.name ?? "", newPassword: "" }); setResetPasswordDialogOpen(true); }}><Lock className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => updateInfoMutation.mutate({ id: u.id, isActive: !u.isActive })} className={u.isActive ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"}>{u.isActive ? "停用" : "启用"}</Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTargetId(u.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* 编辑用户弹窗 */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>编辑用户</DialogTitle></DialogHeader>
            {editingUser && (
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label>用户名</Label>
                  <Input value={editingUser.name} onChange={e => setEditingUser({ ...editingUser, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>手机号</Label>
                    <Input value={editingUser.phone} onChange={e => setEditingUser({ ...editingUser, phone: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>角色</Label>
                    <Select value={editingUser.role} onValueChange={v => setEditingUser({ ...editingUser, role: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {USER_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>负责区域</Label>
                  <Input value={editingUser.region} onChange={e => setEditingUser({ ...editingUser, region: e.target.value })} placeholder="如：广东省广州市" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
                  <Button onClick={handleSave} disabled={updateInfoMutation.isPending || updateRoleMutation.isPending}>保存</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* 创建用户弹窗 */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>创建用户</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>用户名</Label>
                <Input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} placeholder="字母、数字、下划线" />
              </div>
              <div className="space-y-1.5">
                <Label>密码</Label>
                <Input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} placeholder="至少 6 个字符" />
              </div>
              <div className="space-y-1.5">
                <Label>姓名</Label>
                <Input value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>角色</Label>
                  <Select value={newUser.role} onValueChange={v => setNewUser({ ...newUser, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {USER_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>手机号</Label>
                  <Input value={newUser.phone} onChange={e => setNewUser({ ...newUser, phone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>负责区域</Label>
                <Input value={newUser.region} onChange={e => setNewUser({ ...newUser, region: e.target.value })} placeholder="如：广东省广州市" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>取消</Button>
                <Button onClick={() => createUserMutation.mutate(newUser)} disabled={createUserMutation.isPending}>创建</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 重置密码弹窗 */}
        <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>重置密码</DialogTitle></DialogHeader>
            {resetPasswordUser && (
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label>用户</Label>
                  <div className="text-sm font-medium">{resetPasswordUser.username}</div>
                </div>
                <div className="space-y-1.5">
                  <Label>新密码</Label>
                  <Input type="password" value={resetPasswordUser.newPassword} onChange={e => setResetPasswordUser({ ...resetPasswordUser, newPassword: e.target.value })} placeholder="至少 6 个字符" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setResetPasswordDialogOpen(false)}>取消</Button>
                  <Button onClick={() => resetPasswordMutation.mutate({ userId: resetPasswordUser.id, newPassword: resetPasswordUser.newPassword })} disabled={resetPasswordMutation.isPending}>重置</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* 权限预览弹窗 */}
        <Dialog open={!!permPreviewUser} onOpenChange={(open) => { if (!open) setPermPreviewUser(null); }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                用户权限预览
              </DialogTitle>
              <DialogDescription>
                {permPreviewUser && (
                  <span>
                    用户：<strong>{permPreviewUser.name}</strong> | 角色：<strong>{ROLE_LABELS[permPreviewUser.role] || permPreviewUser.role}</strong>
                    {permPreviewUser.role === "admin" && <Badge className="ml-2 bg-amber-500 text-xs">管理员拥有全部权限</Badge>}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            {permLoading ? (
              <div className="text-center py-8 text-muted-foreground">加载权限数据中...</div>
            ) : (
              <div className="space-y-3 mt-2">
                {/* 权限统计概览 */}
                <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">
                      已授权：{previewAllowedKeys.size} 项
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <XCircle className="h-4 w-4 text-red-400" />
                    <span className="text-sm font-medium text-red-500">
                      未授权：{ALL_PERMISSION_KEYS.length - previewAllowedKeys.size} 项
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground ml-auto">
                    共 {ALL_PERMISSION_KEYS.length} 项权限
                  </div>
                </div>

                {/* 分组权限列表 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {PERMISSION_GROUPS.map(group => {
                    const allowedCount = group.permissions.filter(p => previewAllowedKeys.has(p.key)).length;
                    const totalCount = group.permissions.length;
                    const allAllowed = allowedCount === totalCount;
                    const noneAllowed = allowedCount === 0;

                    return (
                      <Card key={group.name} className={`border ${allAllowed ? "border-green-200 bg-green-50/30" : noneAllowed ? "border-red-100 bg-red-50/20" : "border-yellow-200 bg-yellow-50/20"}`}>
                        <CardHeader className="pb-2 pt-3 px-3">
                          <CardTitle className="text-xs font-medium flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Shield className="h-3 w-3 text-muted-foreground" />
                              {group.name}
                            </span>
                            <Badge variant="outline" className={`text-[10px] px-1.5 ${allAllowed ? "border-green-300 text-green-700" : noneAllowed ? "border-red-200 text-red-500" : "border-yellow-300 text-yellow-700"}`}>
                              {allowedCount}/{totalCount}
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 space-y-0.5">
                          {group.permissions.map(perm => {
                            const allowed = previewAllowedKeys.has(perm.key);
                            return (
                              <div key={perm.key} className={`flex items-center gap-1.5 text-xs py-0.5 px-1 rounded ${allowed ? "text-foreground" : "text-muted-foreground/60"}`}>
                                {allowed ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                                ) : (
                                  <XCircle className="h-3 w-3 text-red-300 shrink-0" />
                                )}
                                <span className={allowed ? "" : "line-through"}>{perm.label}</span>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* 停用确认弹窗 */}
      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认停用</AlertDialogTitle><AlertDialogDescription>确定要停用这个用户吗？停用后该用户将无法登录系统。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTargetId && updateInfoMutation.mutate({ id: deleteTargetId, isActive: false })} disabled={updateInfoMutation.isPending}>{updateInfoMutation.isPending ? "处理中..." : "确认停用"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showBatchDelete} onOpenChange={setShowBatchDelete}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认批量停用</AlertDialogTitle><AlertDialogDescription>确定要停用选中的 {selectedIds.size} 个用户吗？停用后这些用户将无法登录系统。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { Array.from(selectedIds).forEach(id => updateInfoMutation.mutate({ id, isActive: false })); setSelectedIds(new Set()); setShowBatchDelete(false); }}>{`确认停用 ${selectedIds.size} 项`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
