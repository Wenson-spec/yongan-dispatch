import { describe, it, expect } from "vitest";
import { getOverdueLevel, getRolesForLevel, LEVEL_LABELS } from "./podOverdueChecker";

describe("驾驶舱超期回单统计卡片数据逻辑", () => {
  describe("分级标签配置", () => {
    it("黄色预警标签正确", () => {
      expect(LEVEL_LABELS.yellow.label).toBe("黄色预警");
      expect(LEVEL_LABELS.yellow.pushIntervalDays).toBe(3);
    });

    it("橙色警告标签正确", () => {
      expect(LEVEL_LABELS.orange.label).toBe("橙色警告");
      expect(LEVEL_LABELS.orange.pushIntervalDays).toBe(1);
    });

    it("红色紧急标签正确", () => {
      expect(LEVEL_LABELS.red.label).toBe("红色紧急");
      expect(LEVEL_LABELS.red.pushIntervalDays).toBe(1);
    });
  });

  describe("分级计算", () => {
    it("0天应为黄色预警", () => {
      expect(getOverdueLevel(0)).toBe("yellow");
    });

    it("4天应为黄色预警", () => {
      expect(getOverdueLevel(4)).toBe("yellow");
    });

    it("5天应为黄色预警（默认阈值下orange从15天开始）", () => {
      expect(getOverdueLevel(5)).toBe("yellow");
    });

    it("10天应为黄色预警（默认阈值下）", () => {
      expect(getOverdueLevel(10)).toBe("yellow");
    });

    it("14天应为黄色预警（默认阈值下）", () => {
      expect(getOverdueLevel(14)).toBe("yellow");
    });

    it("15天应为红色紧急", () => {
      expect(getOverdueLevel(15)).toBe("red");
    });

    it("30天应为红色紧急", () => {
      expect(getOverdueLevel(30)).toBe("red");
    });

    it("100天应为红色紧急", () => {
      expect(getOverdueLevel(100)).toBe("red");
    });
  });

  describe("角色推送配置", () => {
    it("黄色预警只通知调度员", () => {
      const roles = getRolesForLevel("yellow");
      expect(roles).toEqual(["dispatcher"]);
    });

    it("橙色警告通知调度员和财务助理", () => {
      const roles = getRolesForLevel("orange");
      expect(roles).toEqual(["dispatcher", "finance_assistant"]);
    });

    it("红色紧急通知调度员、财务助理和外请主管", () => {
      const roles = getRolesForLevel("red");
      expect(roles).toEqual(["dispatcher", "finance_assistant", "cs_manager"]);
    });
  });

  describe("推送频率配置", () => {
    it("黄色预警每3天推送一次", () => {
      expect(LEVEL_LABELS.yellow.pushIntervalDays).toBe(3);
    });

    it("橙色警告每天推送一次", () => {
      expect(LEVEL_LABELS.orange.pushIntervalDays).toBe(1);
    });

    it("红色紧急每天推送一次", () => {
      expect(LEVEL_LABELS.red.pushIntervalDays).toBe(1);
    });
  });

  describe("卡片显示标签", () => {
    it("黄色预警标签正确", () => {
      expect(LEVEL_LABELS.yellow.label).toBe("黄色预警");
      expect(LEVEL_LABELS.yellow.emoji).toBe("🟡");
    });

    it("橙色警告标签正确", () => {
      expect(LEVEL_LABELS.orange.label).toBe("橙色警告");
      expect(LEVEL_LABELS.orange.emoji).toBe("🟠");
    });

    it("红色紧急标签正确", () => {
      expect(LEVEL_LABELS.red.label).toBe("红色紧急");
      expect(LEVEL_LABELS.red.emoji).toBe("🔴");
    });
  });

  describe("前端分级统计计算逻辑", () => {
    // 模拟前端overdueData计算逻辑
    function computeOverdueData(items: Array<{ level: string }>) {
      const yellow = items.filter(i => i.level === "yellow").length;
      const orange = items.filter(i => i.level === "orange").length;
      const red = items.filter(i => i.level === "red").length;
      return { yellow, orange, red, total: yellow + orange + red };
    }

    it("空列表返回全零", () => {
      const result = computeOverdueData([]);
      expect(result).toEqual({ yellow: 0, orange: 0, red: 0, total: 0 });
    });

    it("混合级别正确统计", () => {
      const items = [
        { level: "yellow" }, { level: "yellow" }, { level: "yellow" },
        { level: "orange" }, { level: "orange" },
        { level: "red" },
      ];
      const result = computeOverdueData(items);
      expect(result).toEqual({ yellow: 3, orange: 2, red: 1, total: 6 });
    });

    it("全部黄色预警", () => {
      const items = Array(10).fill({ level: "yellow" });
      const result = computeOverdueData(items);
      expect(result).toEqual({ yellow: 10, orange: 0, red: 0, total: 10 });
    });

    it("全部红色紧急", () => {
      const items = Array(5).fill({ level: "red" });
      const result = computeOverdueData(items);
      expect(result).toEqual({ yellow: 0, orange: 0, red: 5, total: 5 });
    });
  });
});
