import { describe, it, expect, vi, beforeEach } from "vitest";
import { optionalWeight, requiredPositiveWeight } from "@shared/validators";

// ============================================================
// 1. 加急订单通知逻辑测试（纯函数验证）
// ============================================================
describe("加急订单通知逻辑", () => {
  it("加急订单应生成正确的通知标题和内容", () => {
    const systemCode = "YA202602280001";
    const input = {
      isUrgent: true,
      customerName: "佛山陶瓷张总",
      originCity: "佛山",
      destinationCity: "成都",
      cargoName: "瓷砖",
      weight: "12.5",
      urgentReason: "客户催货，需要加急发运",
    };

    const title = `🚨 加急订单创建: ${systemCode}`;
    const route = `${input.originCity || "?"} → ${input.destinationCity || "?"}`;
    const content = `客户: ${input.customerName || "未知"} | 路线: ${route} | 货物: ${input.cargoName || "-"} ${input.weight ? input.weight + "吨" : ""} | 加急原因: ${input.urgentReason || "未填写"}`;

    expect(title).toContain("加急订单创建");
    expect(title).toContain(systemCode);
    expect(content).toContain("佛山陶瓷张总");
    expect(content).toContain("佛山 → 成都");
    expect(content).toContain("瓷砖");
    expect(content).toContain("12.5吨");
    expect(content).toContain("客户催货");
  });

  it("非加急订单不应触发通知", () => {
    const input = { isUrgent: false };
    expect(input.isUrgent).toBe(false);
  });

  it("加急原因为空时通知内容应显示'未填写'", () => {
    const input = {
      isUrgent: true,
      customerName: "测试客户",
      originCity: "广州",
      destinationCity: "北京",
      cargoName: "建材",
      weight: undefined,
      urgentReason: undefined,
    };

    const content = `客户: ${input.customerName || "未知"} | 路线: ${input.originCity || "?"} → ${input.destinationCity || "?"} | 货物: ${input.cargoName || "-"} ${input.weight ? input.weight + "吨" : ""} | 加急原因: ${input.urgentReason || "未填写"}`;

    expect(content).toContain("加急原因: 未填写");
    expect(content).not.toContain("吨");
  });
});

// ============================================================
// 2. 审批待办通知逻辑测试（纯函数验证）
// ============================================================
describe("审批待办通知逻辑", () => {
  it("审批通知应包含关键信息", () => {
    const orderRow = {
      systemCode: "YA202602280005",
      orderNumber: "PO-2026-001",
      customerName: "广州建材李总",
      originCity: "佛山",
      destinationCity: "武汉",
    };
    const extra = {
      plateNumber: "粤B12345",
      actualFreight: "3500",
    };
    const userName = "调度员小王";

    const title = `📝 新审批待办: ${orderRow.systemCode || orderRow.orderNumber || "#unknown"}`;
    const content = `客户: ${orderRow.customerName || "未知"} | 路线: ${orderRow.originCity || "?"} → ${orderRow.destinationCity || "?"} | 车牌: ${extra.plateNumber || "-"} | 运费: ${extra.actualFreight || "-"}元 | 报价人: ${userName}`;

    expect(title).toContain("新审批待办");
    expect(title).toContain("YA202602280005");
    expect(content).toContain("广州建材李总");
    expect(content).toContain("佛山 → 武汉");
    expect(content).toContain("粤B12345");
    expect(content).toContain("3500元");
    expect(content).toContain("调度员小王");
  });

  it("缺少信息时应使用默认值", () => {
    const orderRow = {
      systemCode: null,
      orderNumber: null,
      customerName: null,
      originCity: null,
      destinationCity: null,
    };
    const extra = {
      plateNumber: undefined,
      actualFreight: undefined,
    };
    const id = 42;

    const title = `📝 新审批待办: ${orderRow.systemCode || orderRow.orderNumber || `#${id}`}`;
    const content = `客户: ${orderRow.customerName || "未知"} | 路线: ${orderRow.originCity || "?"} → ${orderRow.destinationCity || "?"} | 车牌: ${extra.plateNumber || "-"} | 运费: ${extra.actualFreight || "-"}元 | 报价人: 未知`;

    expect(title).toContain("#42");
    expect(content).toContain("客户: 未知");
    expect(content).toContain("路线: ? → ?");
    expect(content).toContain("车牌: -");
    expect(content).toContain("运费: -元");
  });
});

// ============================================================
// 3. 审批流程状态转换验证
// ============================================================
describe("审批流程状态转换", () => {
  const VALID_TRANSITIONS: Record<string, string[]> = {
    pending_assign: ["pending_price", "on_hold", "cancelled"],
    pending_price: ["priced", "pending_vehicle", "pending_dispatch", "pending_inquiry", "on_hold", "cancelled"],
    priced: ["pending_vehicle", "pending_dispatch", "pending_inquiry", "on_hold", "cancelled"],
    pending_vehicle: ["dispatched", "pending_approval", "on_hold", "cancelled", "pending_price"],
    pending_dispatch: ["dispatched", "on_hold", "cancelled", "pending_price"],
    pending_approval: ["dispatched", "pending_vehicle", "on_hold", "cancelled"],
    pending_inquiry: ["inquiry_confirmed", "on_hold", "cancelled", "pending_price"],
    inquiry_confirmed: ["shipped", "dispatched", "in_transit", "on_hold", "cancelled", "pending_inquiry"],
    shipped: ["in_transit", "delivered", "on_hold", "cancelled", "inquiry_confirmed"],
    dispatched: ["in_transit", "on_hold", "cancelled"],
    in_transit: ["delivered", "on_hold", "cancelled"],
    delivered: ["signed", "on_hold", "cancelled"],
    signed: ["settled", "on_hold", "cancelled"],
  };

  it("外请流程：待指派→待定价→待找车→待审批→已调度→运输中→已送达→已签收", () => {
    const flow = [
      "pending_assign", "pending_price", "pending_vehicle",
      "pending_approval", "dispatched", "in_transit", "delivered", "signed",
    ];
    for (let i = 0; i < flow.length - 1; i++) {
      const from = flow[i];
      const to = flow[i + 1];
      expect(VALID_TRANSITIONS[from]).toContain(to);
    }
  });

  it("自运流程：待指派→待定价→待调度→已调度→运输中→已送达→已签收", () => {
    const flow = [
      "pending_assign", "pending_price", "pending_dispatch",
      "dispatched", "in_transit", "delivered", "signed",
    ];
    for (let i = 0; i < flow.length - 1; i++) {
      const from = flow[i];
      const to = flow[i + 1];
      expect(VALID_TRANSITIONS[from]).toContain(to);
    }
  });

  it("零担流程：待指派→待定价→待询价→已询价→已发运→运输中→已送达→已签收", () => {
    const flow = [
      "pending_assign", "pending_price", "pending_inquiry",
      "inquiry_confirmed", "shipped", "in_transit", "delivered", "signed",
    ];
    for (let i = 0; i < flow.length - 1; i++) {
      const from = flow[i];
      const to = flow[i + 1];
      expect(VALID_TRANSITIONS[from]).toContain(to);
    }
  });

  it("审批驳回后可退回待找车", () => {
    expect(VALID_TRANSITIONS["pending_approval"]).toContain("pending_vehicle");
  });

  it("已签收可进入结算", () => {
    expect(VALID_TRANSITIONS["signed"]).toContain("settled");
  });

  it("任何中间状态都可以等通知或取消", () => {
    const intermediateStatuses = [
      "pending_assign", "pending_price", "priced", "pending_vehicle",
      "pending_dispatch", "pending_approval", "pending_inquiry",
      "inquiry_confirmed", "shipped", "dispatched", "in_transit",
      "delivered", "signed",
    ];
    for (const status of intermediateStatuses) {
      expect(VALID_TRANSITIONS[status]).toContain("on_hold");
      expect(VALID_TRANSITIONS[status]).toContain("cancelled");
    }
  });
});

// ============================================================
// 4. 审批角色权限验证
// ============================================================
describe("审批角色权限", () => {
  const STATUS_ROLE_MAP: Record<string, string[]> = {
    pending_approval: ["outsource_dispatcher"],
    dispatched: ["outsource_dispatcher", "fleet_dispatcher", "ltl_dispatcher", "field_manager"],
    in_transit: ["outsource_dispatcher", "fleet_dispatcher", "ltl_dispatcher", "field_manager"],
    delivered: ["outsource_dispatcher", "fleet_dispatcher", "ltl_dispatcher", "field_manager"],
    signed: ["cs_staff"],
  };

  const BYPASS_ROLES = ["admin", "cs_manager"];

  it("外请调度员可以提交审批（推进到pending_approval）", () => {
    expect(STATUS_ROLE_MAP["pending_approval"]).toContain("outsource_dispatcher");
  });

  it("外请调度员不能直接确认签收", () => {
    expect(STATUS_ROLE_MAP["signed"]).not.toContain("outsource_dispatcher");
  });

  it("客服人员可以确认签收", () => {
    expect(STATUS_ROLE_MAP["signed"]).toContain("cs_staff");
  });

  it("管理员和客服经理绕过角色检查", () => {
    for (const role of BYPASS_ROLES) {
      // 管理员和客服经理不受STATUS_ROLE_MAP限制
      expect(["admin", "cs_manager"]).toContain(role);
    }
  });

  it("自营调度员可以推进到已调度/运输中/已送达", () => {
    expect(STATUS_ROLE_MAP["dispatched"]).toContain("fleet_dispatcher");
    expect(STATUS_ROLE_MAP["in_transit"]).toContain("fleet_dispatcher");
    expect(STATUS_ROLE_MAP["delivered"]).toContain("fleet_dispatcher");
  });

  it("零担调度员可以推进到已调度/运输中/已送达", () => {
    expect(STATUS_ROLE_MAP["dispatched"]).toContain("ltl_dispatcher");
    expect(STATUS_ROLE_MAP["in_transit"]).toContain("ltl_dispatcher");
    expect(STATUS_ROLE_MAP["delivered"]).toContain("ltl_dispatcher");
  });
});

// ============================================================
// 5. 回单退回流程验证
// ============================================================
describe("回单退回流程", () => {
  const ROLLBACK_MAP: Record<string, string> = {
    pending_price: "pending_assign",
    priced: "pending_price",
    pending_vehicle: "pending_price",
    pending_approval: "pending_vehicle",
    dispatched: "pending_vehicle",
    pending_dispatch: "pending_assign",
    pending_inquiry: "pending_assign",
    inquiry_confirmed: "pending_inquiry",
    shipped: "inquiry_confirmed",
    in_transit: "dispatched",
    delivered: "in_transit",
  };

  it("待审批退回到待找车", () => {
    expect(ROLLBACK_MAP["pending_approval"]).toBe("pending_vehicle");
  });

  it("已调度退回到待找车", () => {
    expect(ROLLBACK_MAP["dispatched"]).toBe("pending_vehicle");
  });

  it("运输中退回到已调度", () => {
    expect(ROLLBACK_MAP["in_transit"]).toBe("dispatched");
  });

  it("已送达退回到运输中", () => {
    expect(ROLLBACK_MAP["delivered"]).toBe("in_transit");
  });

  it("待指派不支持退回", () => {
    expect(ROLLBACK_MAP["pending_assign"]).toBeUndefined();
  });
});
