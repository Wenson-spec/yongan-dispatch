import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { ROLE_LABELS } from "@shared/permissions";
import { getMenuForRole, getWorkstationLabel } from "@shared/workstation";
import type { WorkstationMenuItem } from "@shared/workstation";
import {
  LayoutDashboard,
  LogOut,
  PanelLeft,
  ClipboardList,
  Columns3,
  FileText,
  Users,
  Building2,
  Truck,
  UserCog,
  Settings,
  MapPin,
  Package,
  BarChart3,
  ScrollText,
  Shield,
  FileSpreadsheet,
  Download,
  History,
  DollarSign,
  PauseCircle,
  HardDrive,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

// Icon name → component mapping
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  ClipboardList,
  Columns3,
  FileText,
  Users,
  Building2,
  Truck,
  UserCog,
  Settings,
  MapPin,
  Package,
  BarChart3,
  ScrollText,
  Shield,
  FileSpreadsheet,
  Download,
  History,
  DollarSign,
  PauseCircle,
  HardDrive,
};

function getIcon(iconName: string): React.ComponentType<{ className?: string }> {
  return ICON_MAP[iconName] || Package;
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    if (!loading && !user) {
      localStorage.removeItem("yongan_auth_token");
      window.location.href = "/login";
    }
  }, [loading, user]);

  if (loading || !user) {
    return <DashboardLayoutSkeleton />;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // 根据角色获取菜单
  const menuItems = useMemo(() => {
    return getMenuForRole(user?.role ?? "order_entry");
  }, [user?.role]);

  const workstationLabel = getWorkstationLabel(user?.role ?? "");
  const roleLabel = ROLE_LABELS[user?.role ?? ""] ?? user?.role ?? "";

  const activeLabel = useMemo(() => {
    const item = menuItems.find(i => i.path === location);
    return item?.label ?? workstationLabel;
  }, [menuItems, location, workstationLabel]);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft =
        sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="切换导航"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold tracking-tight truncate text-sm">
                    永安物流
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal shrink-0">
                    {workstationLabel}
                  </Badge>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 overflow-y-auto">
            {(() => {
              // 将菜单项按group分组（保持原始顺序）
              const groups: { name: string; items: typeof menuItems }[] = [];
              let currentGroup = "";
              for (const item of menuItems) {
                const g = item.group || "";
                if (g !== currentGroup || groups.length === 0) {
                  groups.push({ name: g, items: [item] });
                  currentGroup = g;
                } else {
                  groups[groups.length - 1].items.push(item);
                }
              }
              return groups.map((group, gi) => (
                <div key={gi}>
                  {gi > 0 && (
                    <div className="mx-3 my-1 border-t border-border" />
                  )}
                  {group.name && !isCollapsed && (
                    <div className="px-4 pt-2 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      {group.name}
                    </div>
                  )}
                  <SidebarMenu className="px-2">
                    {group.items.map((item) => {
                      const isActive = location === item.path;
                      const IconComp = getIcon(item.icon);
                      return (
                        <SidebarMenuItem key={item.key}>
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => setLocation(item.path)}
                            tooltip={item.label}
                            className="h-9 transition-all font-normal text-[13px]"
                          >
                            <IconComp
                              className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                            />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </div>
              ));
            })()}
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                      {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "用户"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                        {roleLabel}
                      </Badge>
                    </div>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.name || "用户"}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    localStorage.removeItem("yongan_auth_token");
                    logout();
                    window.location.href = "/login";
                  }}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>退出登录</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <span className="tracking-tight text-foreground font-medium text-sm">
                {activeLabel}
              </span>
            </div>
          </div>
        )}
        <main className={`flex-1 p-3 md:p-6 ${isMobile ? "pb-20" : ""}`}>{children}</main>
        {/* 移动端底部Tab导航 */}
        {isMobile && menuItems.length > 0 && (
          <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t safe-area-bottom">
            <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
              {menuItems.slice(0, 5).map((item) => {
                const isActive = location === item.path;
                const IconComp = getIcon(item.icon);
                return (
                  <button
                    key={item.key}
                    onClick={() => setLocation(item.path)}
                    className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-0 flex-1 ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <IconComp className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
                    <span className={`text-[10px] leading-tight truncate max-w-full ${
                      isActive ? "font-semibold" : "font-normal"
                    }`}>
                      {item.label.length > 4 ? item.label.slice(0, 4) : item.label}
                    </span>
                    {isActive && (
                      <div className="absolute bottom-1 w-4 h-0.5 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
              {menuItems.length > 5 && (
                <button
                  onClick={toggleSidebar}
                  className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg text-muted-foreground min-w-0 flex-1"
                >
                  <PanelLeft className="h-5 w-5" />
                  <span className="text-[10px] leading-tight">更多</span>
                </button>
              )}
            </div>
          </nav>
        )}
      </SidebarInset>
    </>
  );
}
