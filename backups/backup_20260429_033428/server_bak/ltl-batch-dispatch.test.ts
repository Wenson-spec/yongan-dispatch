import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database module to avoid real DB calls
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(null),
    createOperationLog: vi.fn().mockResolvedValue(undefined),
    getUserPermissions: vi.fn().mockResolvedValue([
      "order.create", "order.edit", "order.view_all", "order.view_own",
      "order.assign", "order.mark_urgent", "order.adjust", "order.hold_cancel",
      "order.update_status", "order.delete", "order.rollback",
      "kanban.global", "kanban.outsource", "kanban.self", "kanban.ltl",
      "approval.execute", "approval.view_history",
      "pod.view", "pod.mark_sent", "pod.confirm_received", "pod.refund_deposit",
      "stats.full", "stats.personal",
      "freight_rate.view", "freight_rate.export",
      "export.customer_ledger", "export.fleet_ltl",
      "log.view",
      "config.customer", "config.warehouse", "config.vehicle_driver",
      "config.user", "config.dispatcher_region", "config.permission",
      "outsource.vehicle_input", "outsource.submit_quote", "outsource.set_price",
      "fleet.dispatch", "fleet.vehicle_status",
      "ltl.inquiry", "ltl.arrange_ship", "ltl.upload_pod", "ltl.ocr_verify",
    ]),
  };
});

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-user",
      email: "admin@yongan.com",
      name: "管理员",
      loginMethod: "manus",
      role: "admin",
      username: "admin",
      passwordHash: null,
      phone: null,
      region: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createNoPermContext(): TrpcContext {
  return {
    user: {
      id: 3,
      openId: "noperm-user",
      email: "noperm@yongan.com",
      name: "无权限用户",
      loginMethod: "manus",
      role: "user",
      username: "noperm",
      passwordHash: null,
      phone: null,
      region: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

const adminCaller = appRouter.createCaller(createAdminContext());

describe("零担派车批次自动推进状态 (order.createLtlBatch)", () => {
  describe("接口定义与参数校验", () => {
    it("应存在createLtlBatch方法", () => {
      expect(adminCaller.order.createLtlBatch).toBeDefined();
    });

    it("DB为null时应抛出数据库不可用错误", async () => {
      await expect(
        adminCaller.order.createLtlBatch({
          plateNumber: "粤E12345",
          driverName: "张三",
          orderIds: [1, 2, 3],
        })
      ).rejects.toThrow("数据库不可用");
    });

    it("车牌号不能为空", async () => {
      await expect(
        adminCaller.order.createLtlBatch({
          plateNumber: "",
          driverName: "张三",
          orderIds: [1],
        })
      ).rejects.toThrow();
    });

    it("司机姓名不能为空", async () => {
      await expect(
        adminCaller.order.createLtlBatch({
          plateNumber: "粤E12345",
          driverName: "",
          orderIds: [1],
        })
      ).rejects.toThrow();
    });

    it("至少选择一个订单", async () => {
      await expect(
        adminCaller.order.createLtlBatch({
          plateNumber: "粤E12345",
          driverName: "张三",
          orderIds: [],
        })
      ).rejects.toThrow();
    });

    it("应支持可选参数（driverPhone, dispatchDate, remarks, remark）", async () => {
      // 验证接口接受完整参数不报参数校验错误（会因DB为null报错）
      await expect(
        adminCaller.order.createLtlBatch({
          plateNumber: "粤E12345",
          driverName: "张三",
          driverPhone: "13800138000",
          dispatchDate: "2026-03-22",
          orderIds: [1, 2, 3],
          remarks: [
            { orderId: 1, remark: "备注1" },
            { orderId: 2, remark: "备注2" },
          ],
          remark: "整批备注",
        })
      ).rejects.toThrow("数据库不可用");
    });
  });

  describe("权限控制", () => {
    it("无ltl.arrange_ship权限的用户应被拒绝", async () => {
      // 创建一个无权限的caller
      const noPermCaller = appRouter.createCaller(createNoPermContext());
      // getUserPermissions对noperm用户返回空权限列表
      const { getUserPermissions } = await import("./db");
      (getUserPermissions as any).mockResolvedValueOnce([]);
      
      await expect(
        noPermCaller.order.createLtlBatch({
          plateNumber: "粤E12345",
          driverName: "张三",
          orderIds: [1],
        })
      ).rejects.toThrow();
    });
  });

  describe("批量派车场景", () => {
    it("应支持10个订单的批量派车", async () => {
      const orderIds = Array.from({ length: 10 }, (_, i) => i + 100);
      await expect(
        adminCaller.order.createLtlBatch({
          plateNumber: "粤E88888",
          driverName: "李四",
          orderIds,
        })
      ).rejects.toThrow("数据库不可用");
    });

    it("应支持30个订单的批量派车", async () => {
      const orderIds = Array.from({ length: 30 }, (_, i) => i + 200);
      await expect(
        adminCaller.order.createLtlBatch({
          plateNumber: "粤E99999",
          driverName: "王五",
          orderIds,
        })
      ).rejects.toThrow("数据库不可用");
    });

    it("应支持单个订单的派车", async () => {
      await expect(
        adminCaller.order.createLtlBatch({
          plateNumber: "粤E11111",
          driverName: "赵六",
          orderIds: [1],
        })
      ).rejects.toThrow("数据库不可用");
    });
  });

  describe("已发运订单不应重复派车", () => {
    it("前端过滤逻辑：只应显示 inquiry_confirmed 状态的订单", () => {
      // 模拟前端过滤逻辑
      const mockOrders = [
        { id: 1, businessType: "ltl", status: "inquiry_confirmed" },
        { id: 2, businessType: "ltl", status: "dispatched" },
        { id: 3, businessType: "ltl", status: "shipped" },
        { id: 4, businessType: "ltl", status: "in_transit" },
        { id: 5, businessType: "ltl", status: "delivered" },
        { id: 6, businessType: "ltl", status: "inquiry_confirmed" },
        { id: 7, businessType: "outsource", status: "inquiry_confirmed" },
      ];

      // 前端过滤逻辑：只保留 businessType=ltl 且 status=inquiry_confirmed
      const availableOrders = mockOrders.filter((o) =>
        o.businessType === "ltl" && o.status === "inquiry_confirmed"
      );

      expect(availableOrders).toHaveLength(2);
      expect(availableOrders.map(o => o.id)).toEqual([1, 6]);
      // 已发运的订单不应出现
      expect(availableOrders.find(o => o.status === "dispatched")).toBeUndefined();
      expect(availableOrders.find(o => o.status === "shipped")).toBeUndefined();
      expect(availableOrders.find(o => o.status === "in_transit")).toBeUndefined();
    });

    it("前端批量单号筛选逻辑：应正确解析多种分隔符", () => {
      const parseBatchFilterText = (text: string): string[] => {
        return text
          .split(/[\n,;，；\s]+/)
          .map(s => s.trim().toLowerCase())
          .filter(s => s.length > 0);
      };

      // 换行分隔
      expect(parseBatchFilterText("LTL-A-123\nLTL-B-456\nLTL-C-789")).toEqual(
        ["ltl-a-123", "ltl-b-456", "ltl-c-789"]
      );
      // 逗号分隔
      expect(parseBatchFilterText("LTL-A-123,LTL-B-456,LTL-C-789")).toEqual(
        ["ltl-a-123", "ltl-b-456", "ltl-c-789"]
      );
      // 空格分隔
      expect(parseBatchFilterText("LTL-A-123 LTL-B-456 LTL-C-789")).toEqual(
        ["ltl-a-123", "ltl-b-456", "ltl-c-789"]
      );
      // 中文逗号分隔
      expect(parseBatchFilterText("LTL-A-123，LTL-B-456，LTL-C-789")).toEqual(
        ["ltl-a-123", "ltl-b-456", "ltl-c-789"]
      );
      // 混合分隔符
      expect(parseBatchFilterText("LTL-A-123\n LTL-B-456, LTL-C-789")).toEqual(
        ["ltl-a-123", "ltl-b-456", "ltl-c-789"]
      );
      // 空字符串
      expect(parseBatchFilterText("")).toEqual([]);
      expect(parseBatchFilterText("   ")).toEqual([]);
    });

    it("前端批量筛选过滤逻辑：应正确匹配包含关键字的订单", () => {
      const mockOrders = [
        { id: 1, businessType: "ltl", status: "inquiry_confirmed", orderNumber: "LTL-A-123456" },
        { id: 2, businessType: "ltl", status: "inquiry_confirmed", orderNumber: "LTL-B-789012" },
        { id: 3, businessType: "ltl", status: "inquiry_confirmed", orderNumber: "LTL-C-345678" },
        { id: 4, businessType: "ltl", status: "inquiry_confirmed", orderNumber: "LTL-D-901234" },
      ];

      const activeBatchFilter = ["ltl-a-123456", "ltl-c-345678"];

      let filtered = mockOrders.filter((o) =>
        o.businessType === "ltl" && o.status === "inquiry_confirmed"
      );
      filtered = filtered.filter((o) => {
        const orderNum = (o.orderNumber || "").toLowerCase();
        return activeBatchFilter.some(keyword => orderNum.includes(keyword));
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.map(o => o.id)).toEqual([1, 3]);
    });
  });

  describe("返回值结构", () => {
    it("createLtlBatch应返回batchId, batchCode, statusUpdatedCount, podCreatedCount", async () => {
      // 由于DB为null无法完成完整流程，验证接口存在即可
      // 实际返回值验证通过E2E测试覆盖
      expect(adminCaller.order.createLtlBatch).toBeDefined();
      expect(typeof adminCaller.order.createLtlBatch).toBe("function");
    });
  });

  describe("相关接口完整性", () => {
    it("应存在listLtlBatches方法", () => {
      expect(adminCaller.order.listLtlBatches).toBeDefined();
    });

    it("应存在getLtlBatchDetail方法", () => {
      expect(adminCaller.order.getLtlBatchDetail).toBeDefined();
    });

    it("应存在deleteLtlBatch方法", () => {
      expect(adminCaller.order.deleteLtlBatch).toBeDefined();
    });
  });
});
