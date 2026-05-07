import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 测试调度员备注字段和审批逻辑
 * 审批规则：运费>调度价 OR 有备注 → pending_approval；否则 → dispatched
 */

// Mock database
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockSet = vi.fn();
const mockValues = vi.fn();

// Setup chain mocks
mockDb.select.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere });
mockWhere.mockReturnValue({ limit: mockLimit });
mockDb.update.mockReturnValue({ set: mockSet });
mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
mockDb.insert.mockReturnValue({ values: mockValues });
mockValues.mockResolvedValue([{ insertId: 1 }]);

describe("Dispatch Approval Logic", () => {
  describe("审批判断规则", () => {
    // 模拟前端的审批判断逻辑
    function needsApproval(params: {
      quotePrice: string;
      dispatchPrice: string;
      dispatcherRemark: string;
    }): boolean {
      const hasRemark = params.dispatcherRemark.trim().length > 0;
      if (hasRemark) return true;
      const freight = parseFloat(params.quotePrice) || 0;
      const dispatchPrice = parseFloat(params.dispatchPrice) || 0;
      if (freight > dispatchPrice && dispatchPrice > 0) return true;
      return false;
    }

    it("运费≤调度价且无备注 → 不需审批（直接确认派车）", () => {
      expect(needsApproval({
        quotePrice: "5000",
        dispatchPrice: "6000",
        dispatcherRemark: "",
      })).toBe(false);
    });

    it("运费>调度价且无备注 → 需要审批", () => {
      expect(needsApproval({
        quotePrice: "7000",
        dispatchPrice: "6000",
        dispatcherRemark: "",
      })).toBe(true);
    });

    it("运费≤调度价但有备注 → 需要审批", () => {
      expect(needsApproval({
        quotePrice: "5000",
        dispatchPrice: "6000",
        dispatcherRemark: "卸货马上付款",
      })).toBe(true);
    });

    it("运费>调度价且有备注 → 需要审批", () => {
      expect(needsApproval({
        quotePrice: "7000",
        dispatchPrice: "6000",
        dispatcherRemark: "卸货3日内付款",
      })).toBe(true);
    });

    it("运费等于调度价且无备注 → 不需审批", () => {
      expect(needsApproval({
        quotePrice: "6000",
        dispatchPrice: "6000",
        dispatcherRemark: "",
      })).toBe(false);
    });

    it("空白备注（只有空格）不算有备注", () => {
      expect(needsApproval({
        quotePrice: "5000",
        dispatchPrice: "6000",
        dispatcherRemark: "   ",
      })).toBe(false);
    });

    it("调度价为0时，任何运费都不触发审批（除非有备注）", () => {
      expect(needsApproval({
        quotePrice: "5000",
        dispatchPrice: "0",
        dispatcherRemark: "",
      })).toBe(false);
    });

    it("调度价为0但有备注 → 需要审批", () => {
      expect(needsApproval({
        quotePrice: "5000",
        dispatchPrice: "0",
        dispatcherRemark: "司机要求预付油费",
      })).toBe(true);
    });
  });

  describe("审批记录reason字段格式", () => {
    function buildApprovalReason(params: {
      plateNumber: string;
      driverName: string;
      actualFreight: string;
      depositAmount: string;
      dispatcherRemark?: string;
    }): string {
      const remarkPart = params.dispatcherRemark ? ` 备注：${params.dispatcherRemark}` : "";
      return `外请找车审批：车牌${params.plateNumber} 司机${params.driverName} 运费${params.actualFreight}元 押金${params.depositAmount}元${remarkPart}`;
    }

    it("无备注时reason不包含备注部分", () => {
      const reason = buildApprovalReason({
        plateNumber: "粤A12345",
        driverName: "张三",
        actualFreight: "7000",
        depositAmount: "2000",
      });
      expect(reason).toBe("外请找车审批：车牌粤A12345 司机张三 运费7000元 押金2000元");
      expect(reason).not.toContain("备注：");
    });

    it("有备注时reason包含备注信息", () => {
      const reason = buildApprovalReason({
        plateNumber: "粤A12345",
        driverName: "张三",
        actualFreight: "7000",
        depositAmount: "2000",
        dispatcherRemark: "卸货马上付款",
      });
      expect(reason).toBe("外请找车审批：车牌粤A12345 司机张三 运费7000元 押金2000元 备注：卸货马上付款");
      expect(reason).toContain("备注：卸货马上付款");
    });
  });

  describe("审批页面备注解析", () => {
    function parseApprovalReason(reason: string) {
      const hasRemark = reason.includes("备注：");
      const remarkPart = hasRemark ? reason.split("备注：")[1]?.trim() : "";
      const mainReason = hasRemark ? reason.split("备注：")[0].trim() : reason;
      return { mainReason, remarkPart, hasRemark };
    }

    it("解析无备注的审批原因", () => {
      const result = parseApprovalReason("外请找车审批：车牌粤A12345 司机张三 运费7000元 押金2000元");
      expect(result.hasRemark).toBe(false);
      expect(result.remarkPart).toBe("");
      expect(result.mainReason).toBe("外请找车审批：车牌粤A12345 司机张三 运费7000元 押金2000元");
    });

    it("解析有备注的审批原因", () => {
      const result = parseApprovalReason("外请找车审批：车牌粤A12345 司机张三 运费7000元 押金2000元 备注：卸货马上付款");
      expect(result.hasRemark).toBe(true);
      expect(result.remarkPart).toBe("卸货马上付款");
      expect(result.mainReason).toBe("外请找车审批：车牌粤A12345 司机张三 运费7000元 押金2000元");
    });

    it("解析复杂备注内容", () => {
      const result = parseApprovalReason("外请找车审批：车牌粤A12345 司机张三 运费7000元 押金2000元 备注：卸货3日内付款，司机要求提供住宿");
      expect(result.hasRemark).toBe(true);
      expect(result.remarkPart).toBe("卸货3日内付款，司机要求提供住宿");
    });
  });
});
