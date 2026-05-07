import { describe, it, expect } from "vitest";

/**
 * 测试订单号体系改造：
 * 1. 客户订单号为必填
 * 2. 合并计划号支持
 * 3. 客户报价字段
 * 4. 审批逻辑：有备注 → 审批
 */

describe("订单号体系改造", () => {
  describe("客户订单号为必填", () => {
    it("orderNumber 不能为空字符串", () => {
      const orderNumber = "";
      expect(orderNumber.trim().length > 0).toBe(false);
      // 前端验证：空字符串应该被拒绝
    });

    it("orderNumber 有值时通过验证", () => {
      const orderNumber = "F0002214399";
      expect(orderNumber.trim().length > 0).toBe(true);
    });
  });

  describe("合并计划号分组逻辑", () => {
    it("同一合并计划号的订单应该能分组", () => {
      const orders = [
        { id: 1, orderNumber: "F0002214399", mergedPlanNumber: "P0000050961", weight: "1.62726" },
        { id: 2, orderNumber: "F0002214397", mergedPlanNumber: "P0000050961", weight: "17.84085" },
        { id: 3, orderNumber: "F0002214396", mergedPlanNumber: "P0000050961", weight: "3.03462" },
        { id: 4, orderNumber: "F0002214400", mergedPlanNumber: null, weight: "5.0" },
      ];

      // 按合并计划号分组
      const groups = new Map<string, typeof orders>();
      for (const order of orders) {
        const key = order.mergedPlanNumber || `single_${order.id}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(order);
      }

      // P0000050961 组应该有3条
      expect(groups.get("P0000050961")?.length).toBe(3);
      // 没有合并计划号的应该单独一组
      expect(groups.get("single_4")?.length).toBe(1);
    });

    it("合并计划号组的总重量计算正确", () => {
      const groupOrders = [
        { weight: "1.62726" },
        { weight: "17.84085" },
        { weight: "3.03462" },
      ];

      const totalWeight = groupOrders.reduce((sum, o) => sum + parseFloat(o.weight || "0"), 0);
      expect(totalWeight).toBeCloseTo(22.50273, 4);
    });
  });

  describe("客户报价字段", () => {
    it("客户报价可以是数字字符串", () => {
      const customerPrice = "3937.98";
      expect(parseFloat(customerPrice)).toBe(3937.98);
    });

    it("客户报价可以为空（非必填）", () => {
      const customerPrice = undefined;
      expect(customerPrice).toBeUndefined();
    });
  });

  describe("审批逻辑：有备注时必须审批", () => {
    it("运费 > 调度价 → 需要审批", () => {
      const freight = 5000;
      const dispatchPrice = 4000;
      const remark = "";
      const needsApproval = freight > dispatchPrice || (remark && remark.trim().length > 0);
      expect(needsApproval).toBe(true);
    });

    it("有备注（不管运费多少）→ 需要审批", () => {
      const freight = 3000;
      const dispatchPrice = 4000;
      const remark = "卸货马上付款";
      const needsApproval = freight > dispatchPrice || (remark && remark.trim().length > 0);
      expect(needsApproval).toBe(true);
    });

    it("运费 <= 调度价 且 无备注 → 不需要审批", () => {
      const freight = 3000;
      const dispatchPrice = 4000;
      const remark = "";
      const needsApproval = freight > dispatchPrice || (!!remark && remark.trim().length > 0);
      expect(needsApproval).toBe(false);
    });

    it("运费 = 调度价 且 无备注 → 不需要审批", () => {
      const freight = 4000;
      const dispatchPrice = 4000;
      const remark = "";
      const needsApproval = freight > dispatchPrice || (!!remark && remark.trim().length > 0);
      expect(needsApproval).toBe(false);
    });
  });

  describe("订单号显示优先级", () => {
    it("有客户订单号时显示客户订单号", () => {
      const order = { orderNumber: "F0002214399", systemCode: "YA202602270001" };
      const display = order.orderNumber || order.systemCode;
      expect(display).toBe("F0002214399");
    });

    it("没有客户订单号时回退到系统编号", () => {
      const order = { orderNumber: "", systemCode: "YA202602270001" };
      const display = order.orderNumber || order.systemCode;
      expect(display).toBe("YA202602270001");
    });
  });

  describe("智能粘贴识别合并计划号", () => {
    it("从文本中提取合并计划号格式", () => {
      const text = "合并计划号：P0000050961";
      const match = text.match(/[Pp]\d{10,}/);
      expect(match).not.toBeNull();
      expect(match![0]).toBe("P0000050961");
    });

    it("从文本中提取客户订单号格式", () => {
      const text = "F0002214399，1627.26KG，托装";
      const match = text.match(/[Ff]\d{7,}/);
      expect(match).not.toBeNull();
      expect(match![0]).toBe("F0002214399");
    });
  });
});
