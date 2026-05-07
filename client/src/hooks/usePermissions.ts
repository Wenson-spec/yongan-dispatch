import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import type { PermissionKey } from "@shared/permissions";
import { ALL_PERMISSION_KEYS } from "@shared/permissions";
import { useMemo } from "react";

export function usePermissions() {
  const { user } = useAuth();
  const { data: permissions, isLoading } = trpc.permission.myPermissions.useQuery(undefined, {
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5分钟缓存
  });

  const permissionSet = useMemo(() => {
    if (!permissions) return new Set<string>();
    // 管理员拥有所有权限
    if (user?.role === "admin") {
      return new Set<string>(ALL_PERMISSION_KEYS);
    }
    return new Set<string>(permissions);
  }, [permissions, user?.role]);

  const hasPermission = (key: PermissionKey | PermissionKey[]) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    const keys = Array.isArray(key) ? key : [key];
    return keys.some(k => permissionSet.has(k));
  };

  return {
    permissions: permissionSet,
    hasPermission,
    isLoading,
    role: user?.role ?? null,
  };
}
