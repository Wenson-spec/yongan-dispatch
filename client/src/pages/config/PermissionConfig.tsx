import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERMISSION_GROUPS, ROLE_LABELS, DEFAULT_ROLE_PERMISSIONS, ALL_PERMISSION_KEYS } from "@shared/permissions";
import type { PermissionKey } from "@shared/permissions";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Shield, RotateCcw, Save } from "lucide-react";

const ROLES_FOR_CONFIG = [
  "admin", "order_entry", "ltl_cs", "chain_cs", "ltl_dispatcher",
  "outsource_dispatcher", "fleet_dispatcher", "field_manager", "cs_manager", "finance_assistant",
] as const;

export default function PermissionConfig() {
  const [selectedRole, setSelectedRole] = useState<string>("admin");
  const isAdmin = selectedRole === "admin";
  const [checkedPerms, setCheckedPerms] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);

  const utils = trpc.useUtils();
  const { data: rolePermissions, isLoading, error: permError } = trpc.permission.listForRole.useQuery({ role: selectedRole }, { retry: false });
  const saveMutation = trpc.permission.save.useMutation({
    onSuccess: () => { utils.permission.listForRole.invalidate(); toast.success("权限保存成功"); setIsDirty(false); },
    onError: (err: any) => toast.error(err.message),
  });

  useEffect(() => {
    if (rolePermissions) {
      const allowedKeys = rolePermissions
        .filter((p: any) => p.allowed)
        .map((p: any) => p.permissionKey);
      setCheckedPerms(new Set(allowedKeys));
      setIsDirty(false);
    }
  }, [rolePermissions]);

  function togglePerm(key: string) {
    setCheckedPerms(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setIsDirty(true);
  }

  function resetToDefault() {
    const defaults = DEFAULT_ROLE_PERMISSIONS[selectedRole] ?? [];
    setCheckedPerms(new Set(defaults));
    setIsDirty(true);
  }

  function handleSave() {
    const permsToSave = ALL_PERMISSION_KEYS.map(key => ({ key, allowed: checkedPerms.has(key) }));
    saveMutation.mutate({ role: selectedRole, permissions: permsToSave });
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">权限配置</h1>
            <p className="text-sm text-muted-foreground mt-0.5">配置各角色的功能权限。管理员默认拥有所有权限。</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={resetToDefault} disabled={saveMutation.isPending || isAdmin}>
              <RotateCcw className="h-4 w-4 mr-1" />恢复默认
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!isDirty || saveMutation.isPending || isAdmin}>
              <Save className="h-4 w-4 mr-1" />{saveMutation.isPending ? "保存中..." : "保存权限"}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">选择角色：</span>
          <Select value={selectedRole} onValueChange={v => setSelectedRole(v)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES_FOR_CONFIG.map(r => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-xs">
            {isAdmin ? "全部权限" : `已选 ${checkedPerms.size} 项权限`}
          </Badge>
          {isAdmin && <Badge className="text-xs bg-amber-500">管理员默认拥有所有权限</Badge>}
          {isDirty && <Badge variant="destructive" className="text-xs">未保存</Badge>}
        </div>

        {permError ? (
          <div className="text-center py-8">
            <div className="flex flex-col items-center gap-2">
              <Shield className="h-8 w-8 text-destructive" />
              <span className="text-destructive font-medium">{permError.message.includes('FORBIDDEN') || permError.message.includes('权限') ? '您没有权限访问权限配置，请联系管理员' : `加载失败：${permError.message}`}</span>
            </div>
          </div>
        ) : isLoading ? (
          <div className="text-center py-8 text-muted-foreground">加载中...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PERMISSION_GROUPS.map(group => (
              <Card key={group.name}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    {group.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {group.permissions.map(perm => (
                    <label key={perm.key} className="flex items-center gap-2 cursor-pointer hover:bg-accent/50 rounded px-2 py-1 -mx-2 transition-colors">
                      <Checkbox
                        checked={isAdmin ? true : checkedPerms.has(perm.key)}
                        onCheckedChange={() => !isAdmin && togglePerm(perm.key)}
                        disabled={isAdmin}
                      />
                      <span className="text-sm">{perm.label}</span>
                    </label>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
