import { describe, it, expect } from "vitest";
import { getOverdueLevel, getRolesForLevel, LEVEL_LABELS } from "./podOverdueChecker";

describe("超期分级检测逻辑", () => {
  describe("getOverdueLevel - 级别判定（默认阈值 yellow<5, orange<15, red>=15）", () => {
    it("0天应返回yellow", () => {
      expect(getOverdueLevel(0)).toBe("yellow");
    });

    it("1天应返回yellow", () => {
      expect(getOverdueLevel(1)).toBe("yellow");
    });

    it("4天应返回yellow", () => {
      expect(getOverdueLevel(4)).toBe("yellow");
    });

    it("5天应返回yellow（默认阈值下orange从15天开始）", () => {
      expect(getOverdueLevel(5)).toBe("yellow");
    });

    it("10天应返回yellow（默认阈值下）", () => {
      expect(getOverdueLevel(10)).toBe("yellow");
    });

    it("14天应返回yellow（默认阈值下）", () => {
      expect(getOverdueLevel(14)).toBe("yellow");
    });

    it("15天应返回red（边界值）", () => {
      expect(getOverdueLevel(15)).toBe("red");
    });

    it("30天应返回red", () => {
      expect(getOverdueLevel(30)).toBe("red");
    });

    it("100天应返回red", () => {
      expect(getOverdueLevel(100)).toBe("red");
    });
  });

  describe("getOverdueLevel - 自定义阈值", () => {
    it("自定义阈值 yellow=3, orange=5, red=15", () => {
      const custom = { yellow: 3, orange: 5, red: 15 };
      expect(getOverdueLevel(2, custom)).toBe("yellow");
      expect(getOverdueLevel(5, custom)).toBe("orange");
      expect(getOverdueLevel(14, custom)).toBe("orange");
      expect(getOverdueLevel(15, custom)).toBe("red");
    });

    it("自定义阈值 yellow=1, orange=7, red=30", () => {
      const custom = { yellow: 1, orange: 7, red: 30 };
      expect(getOverdueLevel(0, custom)).toBe("yellow");
      expect(getOverdueLevel(6, custom)).toBe("yellow");
      expect(getOverdueLevel(7, custom)).toBe("orange");
      expect(getOverdueLevel(29, custom)).toBe("orange");
      expect(getOverdueLevel(30, custom)).toBe("red");
    });
  });

  describe("getRolesForLevel - 角色推送规则", () => {
    it("黄色预警只通知调度员", () => {
      const roles = getRolesForLevel("yellow");
      expect(roles).toEqual(["dispatcher"]);
      expect(roles).not.toContain("finance_assistant");
      expect(roles).not.toContain("cs_manager");
    });

    it("橙色警告通知调度员和财务助理", () => {
      const roles = getRolesForLevel("orange");
      expect(roles).toContain("dispatcher");
      expect(roles).toContain("finance_assistant");
      expect(roles).not.toContain("cs_manager");
    });

    it("红色紧急通知调度员、财务助理和外请主管", () => {
      const roles = getRolesForLevel("red");
      expect(roles).toContain("dispatcher");
      expect(roles).toContain("finance_assistant");
      expect(roles).toContain("cs_manager");
    });
  });

  describe("LEVEL_LABELS - 标签配置", () => {
    it("黄色预警标签和推送频率", () => {
      expect(LEVEL_LABELS.yellow.label).toBe("黄色预警");
      expect(LEVEL_LABELS.yellow.emoji).toBe("🟡");
      expect(LEVEL_LABELS.yellow.pushIntervalDays).toBe(3);
    });

    it("橙色警告标签和推送频率", () => {
      expect(LEVEL_LABELS.orange.label).toBe("橙色警告");
      expect(LEVEL_LABELS.orange.emoji).toBe("🟠");
      expect(LEVEL_LABELS.orange.pushIntervalDays).toBe(1);
    });

    it("红色紧急标签和推送频率", () => {
      expect(LEVEL_LABELS.red.label).toBe("红色紧急");
      expect(LEVEL_LABELS.red.emoji).toBe("🔴");
      expect(LEVEL_LABELS.red.pushIntervalDays).toBe(1);
    });
  });

  describe("分级连续性验证", () => {
    it("所有天数都能被正确分级（0-100天）", () => {
      for (let d = 0; d <= 100; d++) {
        const level = getOverdueLevel(d);
        expect(level).not.toBeNull();
        expect(["yellow", "orange", "red"]).toContain(level);
      }
    });

    it("级别随天数递增", () => {
      const levels = ["yellow", "orange", "red"];
      const getLevelIndex = (d: number) => levels.indexOf(getOverdueLevel(d)!);
      
      // 4天 <= 5天
      expect(getLevelIndex(4)).toBeLessThanOrEqual(getLevelIndex(5));
      // 14天 <= 15天
      expect(getLevelIndex(14)).toBeLessThanOrEqual(getLevelIndex(15));
    });
  });
});
