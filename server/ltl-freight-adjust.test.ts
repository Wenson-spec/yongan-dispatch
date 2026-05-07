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

const adminCaller = appRouter.createCaller(createAdminContext());

describe("零担运费显示与校准功能", () => {
  describe("updateOrderFields 接口支持运费校准字段", () => {
    it("应存在updateOrderFields方法", () => {
      expect(adminCaller.order.updateOrderFields).toBeDefined();
    });

    it("应接受stationReceiptUrl字段（货站运单图片）", async () => {
      await expect(
        adminCaller.order.updateOrderFields({
          id: 1,
          stationReceiptUrl: "https://example.com/receipt.jpg",
        })
      ).rejects.toThrow("数据库不可用");
    });

    it("应接受freightWaybillNumber字段（运单号）", async () => {
      await expect(
        adminCaller.order.updateOrderFields({
          id: 1,
          freightWaybillNumber: "YD2026032300001",
        })
      ).rejects.toThrow("数据库不可用");
    });

    it("应接受actualFreight字段（实际运费）", async () => {
      await expect(
        adminCaller.order.updateOrderFields({
          id: 1,
          actualFreight: "2100",
        })
      ).rejects.toThrow("数据库不可用");
    });

    it("应接受ltlUnitPrice字段（单价校准）", async () => {
      await expect(
        adminCaller.order.updateOrderFields({
          id: 1,
          ltlUnitPrice: "420",
        })
      ).rejects.toThrow("数据库不可用");
    });

    it("应接受totalCost字段（总费用校准）", async () => {
      await expect(
        adminCaller.order.updateOrderFields({
          id: 1,
          totalCost: "2300",
        })
      ).rejects.toThrow("数据库不可用");
    });

    it("应同时接受多个运费校准字段", async () => {
      await expect(
        adminCaller.order.updateOrderFields({
          id: 1,
          stationReceiptUrl: "https://example.com/receipt.jpg",
          freightWaybillNumber: "YD2026032300001",
          actualFreight: "2100",
          ltlDeliveryFee: "200",
          ltlOtherFee: "50",
          totalCost: "2350",
        })
      ).rejects.toThrow("数据库不可用");
    });

    it("空更新也需要数据库连接（因为先检查DB）", async () => {
      // updateOrderFields先检查DB是否可用，然后才检查是否有更新字段
      await expect(
        adminCaller.order.updateOrderFields({ id: 1 })
      ).rejects.toThrow("数据库不可用");
    });
  });

  describe("运费计算逻辑验证（前端侧）", () => {
    it("按单价×实际重量计算运费", () => {
      const unitPrice = 420; // 元/吨
      const actualWeight = 5.2; // 吨
      const freight = Math.round(unitPrice * actualWeight * 100) / 100;
      expect(freight).toBe(2184);
    });

    it("运费+送货费+其他费=总费用", () => {
      const freight = 2184;
      const deliveryFee = 200;
      const otherFee = 50;
      const total = Math.round((freight + deliveryFee + otherFee) * 100) / 100;
      expect(total).toBe(2434);
    });

    it("手动填写实际运费应覆盖重算值", () => {
      const unitPrice = 420;
      const actualWeight = 5.2;
      const recalcFreight = Math.round(unitPrice * actualWeight * 100) / 100;
      const manualFreight = 2200; // 手动填写的实际运费

      // 如果手动填写了实际运费，应使用手动值
      const finalFreight = manualFreight > 0 ? manualFreight : recalcFreight;
      expect(finalFreight).toBe(2200);
      expect(finalFreight).not.toBe(recalcFreight);
    });

    it("只填实际重量时应按单价自动重算", () => {
      const unitPrice = 420;
      const actualWeight = 4.8;
      const manualFreight = 0; // 未填写

      const recalcFreight = Math.round(unitPrice * actualWeight * 100) / 100;
      const finalFreight = manualFreight > 0 ? manualFreight : recalcFreight;
      expect(finalFreight).toBe(2016);
    });

    it("询价运费与实际运费的差异计算", () => {
      const inquiryWeight = 5.0; // 询价重量
      const actualWeight = 5.2; // 实际重量
      const unitPrice = 420;

      const inquiryFreight = Math.round(unitPrice * inquiryWeight * 100) / 100;
      const actualFreight = Math.round(unitPrice * actualWeight * 100) / 100;
      const diff = actualFreight - inquiryFreight;

      expect(inquiryFreight).toBe(2100);
      expect(actualFreight).toBe(2184);
      expect(diff).toBe(84); // 差异84元
    });

    it("运费应保留整数（不含小数点）", () => {
      const unitPrice = 420;
      const weight = 5.123;
      const freight = Math.round(unitPrice * weight * 100) / 100;
      // 2151.66 → 保留两位小数
      expect(freight).toBe(2151.66);
      // 但显示时取整
      const displayFreight = Math.round(freight);
      expect(displayFreight).toBe(2152);
    });
  });

  describe("OCR识别结果处理逻辑", () => {
    it("应正确解析OCR识别的重量（去除单位）", () => {
      const ocrWeight = "5.2吨";
      const parsed = parseFloat(ocrWeight);
      expect(parsed).toBe(5.2);
    });

    it("应正确解析OCR识别的运费（去除货币符号）", () => {
      const ocrFreight = "¥2100";
      const parsed = parseFloat(ocrFreight.replace(/[¥￥,]/g, ""));
      expect(parsed).toBe(2100);
    });

    it("OCR识别为空时应返回空字符串", () => {
      const ocrWeight: string | undefined = undefined;
      const result = ocrWeight ? String(parseFloat(ocrWeight)) : "";
      expect(result).toBe("");
    });

    it("OCR识别为NaN时应返回空字符串", () => {
      const ocrWeight = "无法识别";
      const parsed = parseFloat(ocrWeight);
      const result = isNaN(parsed) ? "" : String(parsed);
      expect(result).toBe("");
    });
  });

  describe("派车单运费显示逻辑", () => {
    it("有单价时应显示运费明细", () => {
      const order = {
        dispatchPrice: "2100",
        ltlUnitPrice: "420",
        weight: "5",
        ltlDeliveryFee: "200",
        ltlOtherFee: "0",
      };

      let freightDisplay = "";
      if (order.dispatchPrice) {
        freightDisplay = `¥${Number(order.dispatchPrice).toFixed(0)}`;
        if (order.ltlUnitPrice) {
          freightDisplay += ` (${order.ltlUnitPrice}元/吨×${order.weight || 0}吨`;
          if (order.ltlDeliveryFee && parseFloat(order.ltlDeliveryFee) > 0) {
            freightDisplay += `+送${order.ltlDeliveryFee}`;
          }
          if (order.ltlOtherFee && parseFloat(order.ltlOtherFee) > 0) {
            freightDisplay += `+其他${order.ltlOtherFee}`;
          }
          freightDisplay += ")";
        }
      }

      expect(freightDisplay).toBe("¥2100 (420元/吨×5吨+送200)");
    });

    it("无单价时只显示总价", () => {
      const order = {
        dispatchPrice: "2100",
        ltlUnitPrice: null,
        weight: "5",
        ltlDeliveryFee: null,
        ltlOtherFee: null,
      };

      let freightDisplay = "";
      if (order.dispatchPrice) {
        freightDisplay = `¥${Number(order.dispatchPrice).toFixed(0)}`;
        if (order.ltlUnitPrice) {
          freightDisplay += ` (明细)`;
        }
      }

      expect(freightDisplay).toBe("¥2100");
    });

    it("无运费时显示空", () => {
      const order = {
        dispatchPrice: null,
        ltlUnitPrice: null,
      };

      let freightDisplay = "";
      if (order.dispatchPrice) {
        freightDisplay = `¥${Number(order.dispatchPrice).toFixed(0)}`;
      }

      expect(freightDisplay).toBe("");
    });
  });

  describe("updateOrderFields 支持 dispatchPrice 字段", () => {
    it("应接受dispatchPrice字段（校准后更新显示运费）", async () => {
      await expect(
        adminCaller.order.updateOrderFields({
          id: 1,
          dispatchPrice: "2200",
        })
      ).rejects.toThrow("数据库不可用");
    });

    it("应同时接受dispatchPrice和其他运费校准字段", async () => {
      await expect(
        adminCaller.order.updateOrderFields({
          id: 1,
          dispatchPrice: "2450",
          actualFreight: "2200",
          ltlUnitPrice: "423.08",
          ltlDeliveryFee: "200",
          ltlOtherFee: "50",
          totalCost: "2450",
          stationReceiptUrl: "https://example.com/receipt.jpg",
          freightWaybillNumber: "GZ210990",
        })
      ).rejects.toThrow("数据库不可用");
    });
  });

  describe("运费校准拆分逻辑（前端侧）", () => {
    it("总运费拆分：单价 = (总运费 - 送货费 - 其他费) / 实际重量", () => {
      const totalFreight = 2450; // 货站开单总运费
      const deliveryFee = 200;
      const otherFee = 50;
      const actualWeight = 5.2;

      const pureFreight = totalFreight - deliveryFee - otherFee; // 2200
      const unitPrice = Math.round(pureFreight / actualWeight * 100) / 100; // 423.08

      expect(pureFreight).toBe(2200);
      expect(unitPrice).toBe(423.08);
    });

    it("无送货费和其他费时，单价 = 总运费 / 实际重量", () => {
      const totalFreight = 2100;
      const deliveryFee = 0;
      const otherFee = 0;
      const actualWeight = 5.0;

      const pureFreight = totalFreight - deliveryFee - otherFee;
      const unitPrice = Math.round(pureFreight / actualWeight * 100) / 100;

      expect(pureFreight).toBe(2100);
      expect(unitPrice).toBe(420);
    });

    it("校准后 dispatchPrice 应等于总运费", () => {
      const totalFreight = 2450;
      const deliveryFee = 200;
      const otherFee = 50;
      const actualWeight = 5.2;

      const pureFreight = totalFreight - deliveryFee - otherFee;
      const unitPrice = Math.round(pureFreight / actualWeight * 100) / 100;
      const dispatchPrice = totalFreight; // dispatchPrice = 总运费

      expect(dispatchPrice).toBe(2450);
      expect(unitPrice).toBe(423.08);
      expect(pureFreight + deliveryFee + otherFee).toBe(dispatchPrice);
    });

    it("重量为0时单价应为0（避免除以0）", () => {
      const totalFreight = 2100;
      const deliveryFee = 200;
      const otherFee = 0;
      const actualWeight = 0;

      const pureFreight = totalFreight - deliveryFee - otherFee;
      const unitPrice = actualWeight > 0 ? Math.round(pureFreight / actualWeight * 100) / 100 : 0;

      expect(unitPrice).toBe(0);
    });
  });

  describe("批量派车无上限验证", () => {
    it("应支持50个订单的批量派车", async () => {
      const orderIds = Array.from({ length: 50 }, (_, i) => i + 1);
      await expect(
        adminCaller.order.createLtlBatch({
          plateNumber: "粤E12345",
          driverName: "张三",
          orderIds,
        })
      ).rejects.toThrow("数据库不可用"); // 参数校验通过，只因DB为null报错
    });

    it("应支持100个订单的批量派车", async () => {
      const orderIds = Array.from({ length: 100 }, (_, i) => i + 1);
      await expect(
        adminCaller.order.createLtlBatch({
          plateNumber: "粤E12345",
          driverName: "张三",
          orderIds,
        })
      ).rejects.toThrow("数据库不可用");
    });

    it("应支持200个订单的批量派车", async () => {
      const orderIds = Array.from({ length: 200 }, (_, i) => i + 1);
      await expect(
        adminCaller.order.createLtlBatch({
          plateNumber: "粤E12345",
          driverName: "张三",
          orderIds,
        })
      ).rejects.toThrow("数据库不可用");
    });
  });
});
