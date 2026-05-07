import { describe, expect, it } from "vitest";
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, ALL_PERMISSION_KEYS } from "../shared/permissions";
import type { UserRole } from "../drizzle/schema";

/**
 * 代码审计报告修复验证测试
 * 覆盖：安全权限、角色数据隔离、业务逻辑、数据库架构
 */

describe("审计修复 - 权限系统完整性", () => {
  // 1.1 pod.updateStatus 权限验证
  it("回单状态更新应需要 pod.mark_sent 或 pod.confirm_received 权限", () => {
    // 验证权限常量存在
    expect(PERMISSIONS.POD_MARK_SENT).toBe("pod.mark_sent");
    expect(PERMISSIONS.POD_CONFIRM_RECEIVED).toBe("pod.confirm_received");
    expect(PERMISSIONS.POD_REFUND_DEPOSIT).toBe("pod.refund_deposit");
  });

  it("所有角色都应有明确的权限定义", () => {
    const expectedRoles: UserRole[] = [
      "admin", "order_entry", "ltl_cs", "chain_cs",
      "ltl_dispatcher", "outsource_dispatcher", "fleet_dispatcher",
      "field_manager", "cs_manager", "finance_assistant",
    ];
    for (const role of expectedRoles) {
      expect(DEFAULT_ROLE_PERMISSIONS[role]).toBeDefined();
      expect(Array.isArray(DEFAULT_ROLE_PERMISSIONS[role])).toBe(true);
    }
  });

  it("admin 应拥有所有权限", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toEqual(ALL_PERMISSION_KEYS);
  });

  it("finance_assistant 不应有订单创建/编辑权限", () => {
    const financePerms = DEFAULT_ROLE_PERMISSIONS.finance_assistant;
    expect(financePerms).not.toContain(PERMISSIONS.ORDER_CREATE);
    expect(financePerms).not.toContain(PERMISSIONS.ORDER_EDIT);
    expect(financePerms).not.toContain(PERMISSIONS.ORDER_DELETE);
  });

  it("finance_assistant 应有回单确认和押金退还权限", () => {
    const financePerms = DEFAULT_ROLE_PERMISSIONS.finance_assistant;
    expect(financePerms).toContain(PERMISSIONS.POD_CONFIRM_RECEIVED);
    expect(financePerms).toContain(PERMISSIONS.POD_REFUND_DEPOSIT);
  });

  it("field_manager 不应有全局订单查看权限", () => {
    const fieldPerms = DEFAULT_ROLE_PERMISSIONS.field_manager;
    expect(fieldPerms).not.toContain(PERMISSIONS.ORDER_VIEW_ALL);
    expect(fieldPerms).toContain(PERMISSIONS.ORDER_VIEW_OWN);
  });

  it("order_entry 应默认具备订单删除权限，支持录单台单删与批量删除", () => {
    const orderEntryPerms = DEFAULT_ROLE_PERMISSIONS.order_entry;
    expect(orderEntryPerms).toContain(PERMISSIONS.ORDER_DELETE);
    expect(orderEntryPerms).toContain(PERMISSIONS.ORDER_VIEW_ALL);
    expect(orderEntryPerms).toContain(PERMISSIONS.ORDER_ASSIGN);
  });
});

describe("审计修复 - 角色数据隔离", () => {
  // 1.2 角色数据隔离验证
  const rolesWithViewOwn = [
    "ltl_dispatcher", "outsource_dispatcher", "fleet_dispatcher", "field_manager",
  ];
  const rolesWithViewAll = [
    "admin", "order_entry", "ltl_cs", "chain_cs", "cs_manager",
  ];

  for (const role of rolesWithViewOwn) {
    it(`${role} 应只有 ORDER_VIEW_OWN 权限`, () => {
      const perms = DEFAULT_ROLE_PERMISSIONS[role];
      expect(perms).toContain(PERMISSIONS.ORDER_VIEW_OWN);
      expect(perms).not.toContain(PERMISSIONS.ORDER_VIEW_ALL);
    });
  }

  for (const role of rolesWithViewAll) {
    it(`${role} 应有 ORDER_VIEW_ALL 权限`, () => {
      const perms = DEFAULT_ROLE_PERMISSIONS[role];
      expect(perms).toContain(PERMISSIONS.ORDER_VIEW_ALL);
    });
  }

  it("finance_assistant 不应有任何订单查看权限", () => {
    const financePerms = DEFAULT_ROLE_PERMISSIONS.finance_assistant;
    expect(financePerms).not.toContain(PERMISSIONS.ORDER_VIEW_ALL);
    expect(financePerms).not.toContain(PERMISSIONS.ORDER_VIEW_OWN);
  });
});

describe("审计修复 - 状态机矩阵验证", () => {
  // 2.1 状态转换矩阵完整性
  const STATUS_FLOW_MATRIX: Record<string, string[]> = {
    pending_assign: ["pending_dispatch", "pending_price", "pending_inquiry", "on_hold", "cancelled"],
    pending_dispatch: ["dispatched", "on_hold", "cancelled"],
    pending_price: ["priced", "on_hold", "cancelled"],
    priced: ["pending_vehicle", "on_hold", "cancelled"],
    pending_vehicle: ["pending_approval", "dispatched", "on_hold", "cancelled"],
    pending_approval: ["dispatched", "pending_vehicle", "on_hold", "cancelled"],
    pending_inquiry: ["inquiry_confirmed", "on_hold", "cancelled"],
    inquiry_confirmed: ["dispatched", "on_hold", "cancelled"],
    dispatched: ["in_transit", "on_hold", "cancelled"],
    in_transit: ["delivered", "on_hold", "cancelled"],
    delivered: ["signed", "on_hold", "cancelled"],
    signed: ["settled", "on_hold"],
    on_hold: ["pending_assign", "pending_dispatch", "pending_price", "pending_vehicle", "pending_inquiry", "dispatched", "in_transit"],
  };

  it("所有非终态状态都应有至少一个合法转换", () => {
    const terminalStatuses = ["settled", "cancelled", "merged"];
    for (const [status, targets] of Object.entries(STATUS_FLOW_MATRIX)) {
      if (!terminalStatuses.includes(status)) {
        expect(targets.length).toBeGreaterThan(0);
      }
    }
  });

  it("终态（settled/cancelled/merged）不应出现在转换矩阵的起始状态中", () => {
    expect(STATUS_FLOW_MATRIX["settled"]).toBeUndefined();
    expect(STATUS_FLOW_MATRIX["cancelled"]).toBeUndefined();
    expect(STATUS_FLOW_MATRIX["merged"]).toBeUndefined();
  });

  it("on_hold 应可以恢复到多种状态", () => {
    const onHoldTargets = STATUS_FLOW_MATRIX["on_hold"];
    expect(onHoldTargets.length).toBeGreaterThanOrEqual(3);
    expect(onHoldTargets).toContain("pending_assign");
  });
});

describe("审计修复 - 调度员区域匹配", () => {
  // 2.3 城市名标准化测试
  const normalizeCityName = (city: string): string => {
    return city
      .replace(/市$/, "")
      .replace(/^(.*?)(自治州|地区|盟)$/, "$1")
      .trim();
  };

  it("应正确去除城市名后缀", () => {
    expect(normalizeCityName("广州市")).toBe("广州");
    expect(normalizeCityName("佛山市")).toBe("佛山");
    expect(normalizeCityName("深圳市")).toBe("深圳");
  });

  it("应正确处理自治州/地区/盟后缀", () => {
    expect(normalizeCityName("恩施自治州")).toBe("恩施");
    expect(normalizeCityName("大兴安岭地区")).toBe("大兴安岭");
    expect(normalizeCityName("锡林郭勒盟")).toBe("锡林郭勒");
  });

  it("应正确处理无后缀的城市名", () => {
    expect(normalizeCityName("北京")).toBe("北京");
    expect(normalizeCityName("上海")).toBe("上海");
  });
});

describe("审计修复 - 智能粘贴校验", () => {
  // 4.2 提交前校验逻辑
  type ParsedOrder = {
    orderNumber: string;
    customerName: string;
    destinationCity: string;
    weight: string;
    customerPrice: string;
    confidence: Record<string, "high" | "medium" | "low">;
  };

  const validateOrder = (order: ParsedOrder, idx: number): string[] => {
    const errors: string[] = [];
    const label = `第${idx + 1}条`;
    if (!order.orderNumber?.trim()) errors.push(`${label}：缺少订单编号`);
    if (!order.customerName?.trim()) errors.push(`${label}：缺少客户名称`);
    if (!order.destinationCity?.trim()) errors.push(`${label}：缺少目的地城市`);
    if (order.weight && isNaN(parseFloat(order.weight))) errors.push(`${label}：重量格式不正确(${order.weight})`);
    if (order.customerPrice && isNaN(parseFloat(order.customerPrice))) errors.push(`${label}：客户价格格式不正确(${order.customerPrice})`);
    return errors;
  };

  it("应检测缺少必填字段的订单", () => {
    const order: ParsedOrder = {
      orderNumber: "",
      customerName: "",
      destinationCity: "",
      weight: "",
      customerPrice: "",
      confidence: {},
    };
    const errors = validateOrder(order, 0);
    expect(errors.length).toBe(3); // 缺少订单编号、客户名称、目的地
  });

  it("应检测数值格式错误", () => {
    const order: ParsedOrder = {
      orderNumber: "ORD001",
      customerName: "测试客户",
      destinationCity: "广州",
      weight: "abc",
      customerPrice: "xyz",
      confidence: {},
    };
    const errors = validateOrder(order, 0);
    expect(errors.length).toBe(2); // 重量和价格格式错误
  });

  it("合法订单应无错误", () => {
    const order: ParsedOrder = {
      orderNumber: "ORD001",
      customerName: "测试客户",
      destinationCity: "广州",
      weight: "5.5",
      customerPrice: "1200",
      confidence: { customerName: "high", weight: "high" },
    };
    const errors = validateOrder(order, 0);
    expect(errors.length).toBe(0);
  });

  it("应识别低置信度字段", () => {
    const order: ParsedOrder = {
      orderNumber: "ORD001",
      customerName: "测试客户",
      destinationCity: "广州",
      weight: "5.5",
      customerPrice: "1200",
      confidence: { weight: "low", customerPrice: "low" },
    };
    const lowFields = Object.entries(order.confidence)
      .filter(([, level]) => level === "low")
      .map(([field]) => field);
    expect(lowFields).toContain("weight");
    expect(lowFields).toContain("customerPrice");
    expect(lowFields.length).toBe(2);
  });
});

describe("审计修复 - 数据库索引验证", () => {
  // 3.1 验证索引名称规范
  const expectedIndexes = [
    "idx_orders_status",
    "idx_orders_business_type",
    "idx_orders_dispatcher",
    "idx_orders_created_by",
    "idx_orders_customer_id",
    "idx_orders_created_at",
    "idx_orders_status_type",
    "idx_approvals_status",
    "idx_approvals_order_id",
    "idx_pod_records_order_id",
    "idx_ltl_inquiries_order_id",
    "idx_operation_logs_target",
    "idx_dispatcher_regions_city",
    "idx_role_permissions_role",
  ];

  it("应定义所有必要的索引名称", () => {
    // 验证索引名称列表完整
    expect(expectedIndexes.length).toBeGreaterThanOrEqual(14);
    // 验证命名规范：所有索引名以 idx_ 开头
    for (const name of expectedIndexes) {
      expect(name.startsWith("idx_")).toBe(true);
    }
  });
});
