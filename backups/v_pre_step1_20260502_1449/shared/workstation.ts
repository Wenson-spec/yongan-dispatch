/**
 * 永安物流调度系统 — 角色工位路由配置
 * 定义每个角色的主工位路由和侧边栏菜单
 */

import type { UserRole } from "../drizzle/schema";

export type WorkstationMenuItem = {
  key: string;
  label: string;
  path: string;
  icon: string; // lucide icon name
  group?: string; // 分组名称（用于侧边栏分组显示）
};

export type WorkstationConfig = {
  role: UserRole;
  label: string;
  homePath: string; // 登录后默认跳转路径
  menuItems: WorkstationMenuItem[];
};

/**
 * 角色工位配置映射
 * 每个角色只看到自己的工位菜单
 * 路径与 App.tsx 中注册的路由保持一致
 */
export const WORKSTATION_CONFIGS: Record<string, WorkstationConfig> = {
  admin: {
    role: "admin",
    label: "管理驾驶舱",
    homePath: "/station/admin",
    menuItems: [
      { key: "admin-dashboard", label: "管理驾驶舱", path: "/station/admin", icon: "LayoutDashboard", group: "管理总览" },
      { key: "entry-station", label: "录单台", path: "/station/entry", icon: "ClipboardList", group: "工位操作" },
      { key: "command-center", label: "指挥台", path: "/station/command", icon: "LayoutDashboard", group: "工位操作" },
      { key: "find-vehicle", label: "找车台", path: "/station/find-vehicle", icon: "Truck", group: "工位操作" },
      { key: "dispatch-vehicle", label: "派车台", path: "/station/dispatch-vehicle", icon: "Truck", group: "工位操作" },
      { key: "ltl-workspace", label: "零担统一工作台", path: "/station/ltl-workspace", icon: "Package", group: "工位操作" },
      { key: "pod-deposit", label: "回单管理台", path: "/station/pod-deposit", icon: "FileText", group: "工位操作" },
      { key: "hold-station", label: "等通知专区", path: "/station/hold", icon: "PauseCircle", group: "工位操作" },
      { key: "freight-rates", label: "运价数据库", path: "/freight-rates", icon: "ScrollText", group: "数据报表" },

      { key: "logs", label: "操作日志", path: "/operation-logs", icon: "History", group: "数据报表" },
      { key: "users", label: "用户管理", path: "/config/users", icon: "Users", group: "系统配置" },
      { key: "permissions", label: "权限配置", path: "/config/permissions", icon: "Shield", group: "系统配置" },
      { key: "customers", label: "客户管理", path: "/config/customers", icon: "UserCog", group: "系统配置" },
      { key: "warehouses", label: "仓库管理", path: "/config/warehouses", icon: "Building2", group: "系统配置" },
      { key: "stations", label: "货站管理", path: "/config/stations", icon: "MapPin", group: "系统配置" },
      { key: "vehicles", label: "车辆管理", path: "/config/vehicles", icon: "Truck", group: "系统配置" },
      { key: "drivers", label: "司机管理", path: "/config/drivers", icon: "UserCog", group: "系统配置" },
      { key: "misc", label: "部门/货物配置", path: "/config/misc", icon: "Package", group: "系统配置" },
      { key: "regions", label: "区域配置", path: "/config/regions", icon: "MapPin", group: "系统配置" },
      { key: "backup", label: "数据备份", path: "/config/backup", icon: "HardDrive", group: "系统配置" },
      { key: "usage", label: "使用统计", path: "/config/usage", icon: "BarChart3", group: "系统配置" },
    ],
  },

  order_entry: {
    role: "order_entry",
    label: "录单台",
    homePath: "/station/entry",
    menuItems: [
      { key: "entry-station", label: "录单台", path: "/station/entry", icon: "ClipboardList" },
    ],
  },

  ltl_cs: {
    role: "ltl_cs",
    label: "零担统一工作台",
    homePath: "/station/ltl-workspace",
    menuItems: [
      { key: "ltl-workspace", label: "零担统一工作台", path: "/station/ltl-workspace", icon: "Package" },
    ],
  },

  chain_cs: {
    role: "chain_cs",
    label: "零担统一工作台",
    homePath: "/station/ltl-workspace",
    menuItems: [
      { key: "ltl-workspace", label: "零担统一工作台", path: "/station/ltl-workspace", icon: "Package" },
    ],
  },

  cs_manager: {
    role: "cs_manager",
    label: "指挥台",
    homePath: "/station/command",
    menuItems: [
      { key: "command-center", label: "指挥台", path: "/station/command", icon: "LayoutDashboard" },
      { key: "hold-station", label: "等通知专区", path: "/station/hold", icon: "PauseCircle" },
      { key: "freight-rates", label: "运价数据库", path: "/freight-rates", icon: "ScrollText" },
      { key: "regions", label: "区域配置", path: "/config/regions", icon: "MapPin" },
      { key: "customers", label: "客户管理", path: "/config/customers", icon: "UserCog" },
      { key: "logs", label: "操作日志", path: "/operation-logs", icon: "History" },
    ],
  },

  outsource_dispatcher: {
    role: "outsource_dispatcher",
    label: "找车台",
    homePath: "/station/find-vehicle",
    menuItems: [
      { key: "find-vehicle", label: "找车台", path: "/station/find-vehicle", icon: "Truck" },
    ],
  },

  fleet_dispatcher: {
    role: "fleet_dispatcher",
    label: "派车台",
    homePath: "/station/dispatch-vehicle",
    menuItems: [
      { key: "dispatch-vehicle", label: "派车台", path: "/station/dispatch-vehicle", icon: "Truck" },
      { key: "vehicles", label: "车辆管理", path: "/config/vehicles", icon: "Truck" },
      { key: "drivers", label: "司机管理", path: "/config/drivers", icon: "UserCog" },
    ],
  },

  field_manager: {
    role: "field_manager",
    label: "派车台",
    homePath: "/station/dispatch-vehicle",
    menuItems: [
      { key: "dispatch-vehicle", label: "派车台", path: "/station/dispatch-vehicle", icon: "Truck" },
    ],
  },

  ltl_dispatcher: {
    role: "ltl_dispatcher",
    label: "零担统一工作台",
    homePath: "/station/ltl-workspace",
    menuItems: [
      { key: "ltl-workspace", label: "零担统一工作台", path: "/station/ltl-workspace", icon: "Package" },
    ],
  },

  finance_assistant: {
    role: "finance_assistant",
    label: "回单管理台",
    homePath: "/station/pod-deposit",
    menuItems: [
      { key: "pod-deposit", label: "回单管理台", path: "/station/pod-deposit", icon: "FileText" },
    ],
  },
};

/**
 * 获取角色的主工位路由
 */
export function getHomePathForRole(role: string): string {
  return WORKSTATION_CONFIGS[role]?.homePath ?? "/station/entry";
}

/**
 * 获取角色的侧边栏菜单
 */
export function getMenuForRole(role: string): WorkstationMenuItem[] {
  return WORKSTATION_CONFIGS[role]?.menuItems ?? [];
}

/**
 * 获取角色的工位标签
 */
export function getWorkstationLabel(role: string): string {
  return WORKSTATION_CONFIGS[role]?.label ?? "工作台";
}
