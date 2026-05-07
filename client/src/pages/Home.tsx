import { useAuth } from "@/_core/hooks/useAuth";
import { getHomePathForRole } from "@shared/workstation";
import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * Home 页面 — 角色路由分发器
 * 登录后自动跳转到该角色的主工位
 * 未登录时跳转到自定义登录页面（/login）
 */
export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && user) {
      const homePath = getHomePathForRole(user.role);
      setLocation(homePath, { replace: true });
    }
  }, [loading, user, setLocation]);

  useEffect(() => {
    if (!loading && !user) {
      // 未登录时跳转到自定义登录页面
      window.location.href = "/login";
    }
  }, [loading, user]);

  // 加载中或等待跳转时显示loading
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        <p className="mt-4 text-sm text-muted-foreground">正在加载...</p>
      </div>
    </div>
  );
}
