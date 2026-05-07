/**
 * 永安物流调度系统 — 权限定义
 * 所有权限key和默认权限矩阵
 */

import type { UserRole } from "../drizzle/schema";

// 权限key定义
export const PERMISSIONS = {
  // 订单管理
  ORDER_CREATE: "order.create",
  ORDER_EDIT: "order.edit",
  ORDER_MARK_URGENT: "order.mark_urgent",
  ORDER_ADJUST: "order.adjust",           // 随时调整订单（含变更业务类型）
  ORDER_VIEW_ALL: "order.view_all",
  ORDER_VIEW_OWN: "order.view_own",
  ORDER_ASSIGN: "order.assign",           // 指派业务类型和调度员
  ORDER_HOLD_CANCEL: "order.hold_cancel", // 搁置/恢复/取消
  ORDER_UPDATE_STATUS: "order.update_status",
  ORDER_DELETE: "order.delete",             // 删除订单
  ORDER_ROLLBACK: "order.rollback",         // 退回订单至上一步

  // 调度看板
  KANBAN_GLOBAL: "kanban.global",
  KANBAN_OUTSOURCE: "kanban.outsource",
  KANBAN_SELF: "kanban.self",
  KANBAN_LTL: "kanban.ltl",

  // 外请调度
  OUTSOURCE_VEHICLE_INPUT: "outsource.vehicle_input",
  OUTSOURCE_SUBMIT_QUOTE: "outsource.submit_quote",
  OUTSOURCE_SET_PRICE: "outsource.set_price",

  // 自运调度
  FLEET_DISPATCH: "fleet.dispatch",
  FLEET_VEHICLE_STATUS: "fleet.vehicle_status",

  // 零担调度
  LTL_INQUIRY: "ltl.inquiry",
  LTL_ARRANGE_SHIP: "ltl.arrange_ship",
  LTL_UPLOAD_POD: "ltl.upload_pod",
  LTL_OCR_VERIFY: "ltl.ocr_verify",

  // 审批中心
  APPROVAL_EXECUTE: "approval.execute",
  APPROVAL_VIEW_HISTORY: "approval.view_history",

  // 回单管理
  POD_VIEW: "pod.view",
  POD_MARK_SENT: "pod.mark_sent",
  POD_CONFIRM_RECEIVED: "pod.confirm_received",
  POD_REFUND_DEPOSIT: "pod.refund_deposit",

  // 基础配置
  CONFIG_CUSTOMER: "config.customer",
  CONFIG_WAREHOUSE: "config.warehouse",
  CONFIG_VEHICLE_DRIVER: "config.vehicle_driver",
  CONFIG_USER: "config.user",
  CONFIG_DISPATCHER_REGION: "config.dispatcher_region",
  CONFIG_PERMISSION: "config.permission",

  // 数据导出
  EXPORT_ORDER_TOTAL: "export.order_total",
  EXPORT_OUTSOURCE: "export.outsource",
  EXPORT_FLEET_LTL: "export.fleet_ltl",
  EXPORT_CUSTOMER_LEDGER: "export.customer_ledger",

  // 运价数据库
  FREIGHT_RATE_VIEW: "freight_rate.view",
  FREIGHT_RATE_EXPORT: "freight_rate.export",

  // 统计看板
  STATS_FULL: "stats.full",
  STATS_PERSONAL: "stats.personal",

  // 操作日志
  LOG_VIEW: "log.view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// 所有权限key列表
export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);

// 权限分组（用于前端展示）
export const PERMISSION_GROUPS = [
  {
    name: "订单管理",
    permissions: [
      { key: PERMISSIONS.ORDER_CREATE, label: "创建订单" },
      { key: PERMISSIONS.ORDER_EDIT, label: "编辑订单基本信息" },
      { key: PERMISSIONS.ORDER_MARK_URGENT, label: "标记加急" },
      { key: PERMISSIONS.ORDER_ADJUST, label: "随时调整订单" },
      { key: PERMISSIONS.ORDER_VIEW_ALL, label: "查看所有订单" },
      { key: PERMISSIONS.ORDER_VIEW_OWN, label: "查看本人负责订单" },
      { key: PERMISSIONS.ORDER_ASSIGN, label: "指派业务类型和调度员" },
      { key: PERMISSIONS.ORDER_HOLD_CANCEL, label: "搁置/恢复/取消订单" },
      { key: PERMISSIONS.ORDER_UPDATE_STATUS, label: "更新运输状态" },
      { key: PERMISSIONS.ORDER_DELETE, label: "删除订单" },
      { key: PERMISSIONS.ORDER_ROLLBACK, label: "退回订单至上一步" },
    ],
  },
  {
    name: "调度看板",
    permissions: [
      { key: PERMISSIONS.KANBAN_GLOBAL, label: "查看全局看板" },
      { key: PERMISSIONS.KANBAN_OUTSOURCE, label: "查看外请看板" },
      { key: PERMISSIONS.KANBAN_SELF, label: "查看自运看板" },
      { key: PERMISSIONS.KANBAN_LTL, label: "查看零担看板" },
    ],
  },
  {
    name: "外请调度",
    permissions: [
      { key: PERMISSIONS.OUTSOURCE_VEHICLE_INPUT, label: "录入外请车辆信息" },
      { key: PERMISSIONS.OUTSOURCE_SUBMIT_QUOTE, label: "提交报价/加价/垫付申请" },
      { key: PERMISSIONS.OUTSOURCE_SET_PRICE, label: "外请定价" },
    ],
  },
  {
    name: "自运调度",
    permissions: [
      { key: PERMISSIONS.FLEET_DISPATCH, label: "选择自运车辆派单" },
      { key: PERMISSIONS.FLEET_VEHICLE_STATUS, label: "管理车辆状态" },
    ],
  },
  {
    name: "零担调度",
    permissions: [
      { key: PERMISSIONS.LTL_INQUIRY, label: "零担询价" },
      { key: PERMISSIONS.LTL_ARRANGE_SHIP, label: "安排零担发运" },
      { key: PERMISSIONS.LTL_UPLOAD_POD, label: "上传送货单" },
      { key: PERMISSIONS.LTL_OCR_VERIFY, label: "OCR核验" },
    ],
  },
  {
    name: "审批中心",
    permissions: [
      { key: PERMISSIONS.APPROVAL_EXECUTE, label: "执行审批" },
      { key: PERMISSIONS.APPROVAL_VIEW_HISTORY, label: "查看审批历史" },
    ],
  },
  {
    name: "回单管理",
    permissions: [
      { key: PERMISSIONS.POD_VIEW, label: "查看回单列表" },
      { key: PERMISSIONS.POD_MARK_SENT, label: "标记原件已寄出" },
      { key: PERMISSIONS.POD_CONFIRM_RECEIVED, label: "确认原件已收到" },
      { key: PERMISSIONS.POD_REFUND_DEPOSIT, label: "标记押金已退还" },
    ],
  },
  {
    name: "基础配置",
    permissions: [
      { key: PERMISSIONS.CONFIG_CUSTOMER, label: "客户管理" },
      { key: PERMISSIONS.CONFIG_WAREHOUSE, label: "仓库/货站/部门/货物配置" },
      { key: PERMISSIONS.CONFIG_VEHICLE_DRIVER, label: "车辆/司机管理" },
      { key: PERMISSIONS.CONFIG_USER, label: "用户管理" },
      { key: PERMISSIONS.CONFIG_DISPATCHER_REGION, label: "调度员区域配置" },
      { key: PERMISSIONS.CONFIG_PERMISSION, label: "权限配置" },
    ],
  },
  {
    name: "数据导出",
    permissions: [
      { key: PERMISSIONS.EXPORT_ORDER_TOTAL, label: "导出订单总表" },
      { key: PERMISSIONS.EXPORT_OUTSOURCE, label: "导出外请表" },
      { key: PERMISSIONS.EXPORT_FLEET_LTL, label: "导出小车/零担表" },
      { key: PERMISSIONS.EXPORT_CUSTOMER_LEDGER, label: "客户台账日导出" },
    ],
  },
  {
    name: "运价数据库",
    permissions: [
      { key: PERMISSIONS.FREIGHT_RATE_VIEW, label: "查看历史运价" },
      { key: PERMISSIONS.FREIGHT_RATE_EXPORT, label: "导出运价数据" },
    ],
  },
  {
    name: "统计与日志",
    permissions: [
      { key: PERMISSIONS.STATS_FULL, label: "查看完整统计" },
      { key: PERMISSIONS.STATS_PERSONAL, label: "查看个人统计" },
      { key: PERMISSIONS.LOG_VIEW, label: "查看操作日志" },
    ],
  },
] as const;

// 默认权限矩阵 — 每个角色的默认权限
type DefaultPermissions = Record<string, PermissionKey[]>;

export const DEFAULT_ROLE_PERMISSIONS: DefaultPermissions = {
  admin: ALL_PERMISSION_KEYS, // 管理员拥有所有权限

  order_entry: [
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_EDIT,
    PERMISSIONS.ORDER_MARK_URGENT,
    PERMISSIONS.ORDER_VIEW_ALL,
    PERMISSIONS.ORDER_VIEW_OWN,
    PERMISSIONS.ORDER_ASSIGN,
    PERMISSIONS.ORDER_DELETE,
    PERMISSIONS.ORDER_UPDATE_STATUS,
    PERMISSIONS.KANBAN_GLOBAL,
    PERMISSIONS.APPROVAL_VIEW_HISTORY,
    PERMISSIONS.POD_VIEW,
    PERMISSIONS.CONFIG_CUSTOMER,
    PERMISSIONS.EXPORT_ORDER_TOTAL,
    PERMISSIONS.STATS_PERSONAL,
  ],

  ltl_cs: [
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_EDIT,
    PERMISSIONS.ORDER_MARK_URGENT,
    PERMISSIONS.ORDER_VIEW_ALL,
    PERMISSIONS.ORDER_VIEW_OWN,
    PERMISSIONS.ORDER_ASSIGN,
    PERMISSIONS.ORDER_UPDATE_STATUS,
    PERMISSIONS.KANBAN_GLOBAL,
    PERMISSIONS.KANBAN_LTL,
    PERMISSIONS.LTL_INQUIRY,
    PERMISSIONS.APPROVAL_VIEW_HISTORY,
    PERMISSIONS.POD_VIEW,
    PERMISSIONS.EXPORT_FLEET_LTL,
    PERMISSIONS.STATS_PERSONAL,
  ],

  chain_cs: [
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_EDIT,
    PERMISSIONS.ORDER_MARK_URGENT,
    PERMISSIONS.ORDER_VIEW_ALL,
    PERMISSIONS.ORDER_VIEW_OWN,
    PERMISSIONS.ORDER_UPDATE_STATUS,
    PERMISSIONS.KANBAN_GLOBAL,
    PERMISSIONS.KANBAN_LTL,
    PERMISSIONS.APPROVAL_VIEW_HISTORY,
    PERMISSIONS.POD_VIEW,
    PERMISSIONS.EXPORT_CUSTOMER_LEDGER,
    PERMISSIONS.STATS_PERSONAL,
  ],

  ltl_dispatcher: [
    PERMISSIONS.ORDER_VIEW_OWN,
    PERMISSIONS.ORDER_UPDATE_STATUS,
    PERMISSIONS.KANBAN_LTL,
    PERMISSIONS.LTL_INQUIRY,
    PERMISSIONS.LTL_ARRANGE_SHIP,
    PERMISSIONS.LTL_UPLOAD_POD,
    PERMISSIONS.LTL_OCR_VERIFY,
    PERMISSIONS.APPROVAL_VIEW_HISTORY,
    PERMISSIONS.POD_VIEW,
    PERMISSIONS.POD_MARK_SENT,
    PERMISSIONS.STATS_PERSONAL,
  ],

  outsource_dispatcher: [
    PERMISSIONS.ORDER_VIEW_OWN,
    PERMISSIONS.ORDER_UPDATE_STATUS,
    PERMISSIONS.KANBAN_OUTSOURCE,
    PERMISSIONS.OUTSOURCE_VEHICLE_INPUT,
    PERMISSIONS.OUTSOURCE_SUBMIT_QUOTE,
    PERMISSIONS.APPROVAL_VIEW_HISTORY,
    PERMISSIONS.POD_VIEW,
    PERMISSIONS.POD_MARK_SENT,
    PERMISSIONS.STATS_PERSONAL,
  ],

  fleet_dispatcher: [
    PERMISSIONS.ORDER_VIEW_OWN,
    PERMISSIONS.ORDER_UPDATE_STATUS,
    PERMISSIONS.KANBAN_SELF,
    PERMISSIONS.FLEET_DISPATCH,
    PERMISSIONS.FLEET_VEHICLE_STATUS,
    PERMISSIONS.CONFIG_VEHICLE_DRIVER,
    PERMISSIONS.EXPORT_FLEET_LTL,
    PERMISSIONS.STATS_PERSONAL,
  ],

  field_manager: [
    PERMISSIONS.ORDER_VIEW_OWN,
    PERMISSIONS.ORDER_UPDATE_STATUS,
    PERMISSIONS.KANBAN_SELF,
    PERMISSIONS.FLEET_VEHICLE_STATUS,
    PERMISSIONS.STATS_PERSONAL,
  ],

  cs_manager: [
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_EDIT,
    PERMISSIONS.ORDER_MARK_URGENT,
    PERMISSIONS.ORDER_ADJUST,
    PERMISSIONS.ORDER_VIEW_ALL,
    PERMISSIONS.ORDER_VIEW_OWN,
    PERMISSIONS.ORDER_ASSIGN,
    PERMISSIONS.ORDER_HOLD_CANCEL,
    PERMISSIONS.ORDER_UPDATE_STATUS,
    PERMISSIONS.ORDER_DELETE,
    PERMISSIONS.ORDER_ROLLBACK,
    PERMISSIONS.KANBAN_GLOBAL,
    PERMISSIONS.KANBAN_OUTSOURCE,
    PERMISSIONS.KANBAN_SELF,
    PERMISSIONS.KANBAN_LTL,
    PERMISSIONS.OUTSOURCE_VEHICLE_INPUT,
    PERMISSIONS.OUTSOURCE_SET_PRICE,
    PERMISSIONS.FLEET_DISPATCH,
    PERMISSIONS.LTL_INQUIRY,
    PERMISSIONS.LTL_ARRANGE_SHIP,
    PERMISSIONS.APPROVAL_EXECUTE,
    PERMISSIONS.APPROVAL_VIEW_HISTORY,
    PERMISSIONS.POD_VIEW,
    PERMISSIONS.POD_MARK_SENT,
    PERMISSIONS.CONFIG_CUSTOMER,
    PERMISSIONS.CONFIG_DISPATCHER_REGION,
    PERMISSIONS.EXPORT_ORDER_TOTAL,
    PERMISSIONS.EXPORT_OUTSOURCE,
    PERMISSIONS.EXPORT_FLEET_LTL,
    PERMISSIONS.EXPORT_CUSTOMER_LEDGER,
    PERMISSIONS.FREIGHT_RATE_VIEW,
    PERMISSIONS.FREIGHT_RATE_EXPORT,
    PERMISSIONS.STATS_FULL,
    PERMISSIONS.STATS_PERSONAL,
    PERMISSIONS.LOG_VIEW,
  ],

  finance_assistant: [
    PERMISSIONS.POD_VIEW,
    PERMISSIONS.POD_CONFIRM_RECEIVED,
    PERMISSIONS.POD_REFUND_DEPOSIT,
    PERMISSIONS.STATS_PERSONAL,
  ],
};

// 角色中文名映射
export const ROLE_LABELS: Record<string, string> = {
  admin: "管理员",
  order_entry: "录单员",
  ltl_cs: "零担客服",
  chain_cs: "连锁客服",
  ltl_dispatcher: "零担调度员",
  outsource_dispatcher: "外请调度员",
  fleet_dispatcher: "车队调度员",
  field_manager: "现场管理员",
  cs_manager: "客服经理",
  finance_assistant: "财务助理",
};

// 权限label映射（用于日志和前端展示）
export const PERMISSION_LABELS: Record<string, string> = {};
for (const group of PERMISSION_GROUPS) {
  for (const perm of group.permissions) {
    PERMISSION_LABELS[perm.key] = perm.label;
  }
}
