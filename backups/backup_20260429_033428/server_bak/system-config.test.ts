import { describe, it, expect, vi } from "vitest";
import { CONFIG_KEYS, DEFAULT_THRESHOLDS } from "./db";
import { getBacklogLevel, DEFAULT_BACKLOG_THRESHOLDS, BACKLOG_LABELS } from "./dispatcherBacklogChecker";
import { getOverdueLevel, DEFAULT_POD_THRESHOLDS, LEVEL_LABELS } from "./podOverdueChecker";

// Mock database
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(null),
  };
});

describe("系统配置 - CONFIG_KEYS", () => {
  it("应包含所有积压预警阈值key", () => {
    expect(CONFIG_KEYS.BACKLOG_YELLOW).toBe("backlog_threshold_yellow");
    expect(CONFIG_KEYS.BACKLOG_ORANGE).toBe("backlog_threshold_orange");
    expect(CONFIG_KEYS.BACKLOG_RED).toBe("backlog_threshold_red");
  });

  it("应包含所有超期回单阈值key", () => {
    expect(CONFIG_KEYS.POD_OVERDUE_YELLOW).toBe("pod_overdue_threshold_yellow");
    expect(CONFIG_KEYS.POD_OVERDUE_ORANGE).toBe("pod_overdue_threshold_orange");
    expect(CONFIG_KEYS.POD_OVERDUE_RED).toBe("pod_overdue_threshold_red");
  });

  it("所有key应有对应的默认值", () => {
    for (const key of Object.values(CONFIG_KEYS)) {
      expect(DEFAULT_THRESHOLDS[key as keyof typeof DEFAULT_THRESHOLDS]).toBeDefined();
    }
  });
});

describe("系统配置 - DEFAULT_THRESHOLDS", () => {
  it("积压预警默认值应递增", () => {
    const y = parseInt(DEFAULT_THRESHOLDS[CONFIG_KEYS.BACKLOG_YELLOW]);
    const o = parseInt(DEFAULT_THRESHOLDS[CONFIG_KEYS.BACKLOG_ORANGE]);
    const r = parseInt(DEFAULT_THRESHOLDS[CONFIG_KEYS.BACKLOG_RED]);
    expect(y).toBeLessThan(o);
    expect(o).toBeLessThan(r);
  });

  it("积压预警默认值应为5/10/15", () => {
    expect(DEFAULT_THRESHOLDS[CONFIG_KEYS.BACKLOG_YELLOW]).toBe("5");
    expect(DEFAULT_THRESHOLDS[CONFIG_KEYS.BACKLOG_ORANGE]).toBe("10");
    expect(DEFAULT_THRESHOLDS[CONFIG_KEYS.BACKLOG_RED]).toBe("15");
  });

  it("超期回单默认值应为5/15/15", () => {
    expect(DEFAULT_THRESHOLDS[CONFIG_KEYS.POD_OVERDUE_YELLOW]).toBe("5");
    expect(DEFAULT_THRESHOLDS[CONFIG_KEYS.POD_OVERDUE_ORANGE]).toBe("15");
    expect(DEFAULT_THRESHOLDS[CONFIG_KEYS.POD_OVERDUE_RED]).toBe("15");
  });
});

describe("系统配置 - 动态阈值积压预警", () => {
  it("使用默认阈值时级别判定正确", () => {
    expect(getBacklogLevel(0)).toBeNull();
    expect(getBacklogLevel(4)).toBeNull();
    expect(getBacklogLevel(5)).toBe("yellow");
    expect(getBacklogLevel(9)).toBe("yellow");
    expect(getBacklogLevel(10)).toBe("orange");
    expect(getBacklogLevel(14)).toBe("orange");
    expect(getBacklogLevel(15)).toBe("red");
    expect(getBacklogLevel(100)).toBe("red");
  });

  it("使用自定义阈值时级别判定正确", () => {
    const custom = { yellow: 3, orange: 7, red: 12 };
    expect(getBacklogLevel(0, custom)).toBeNull();
    expect(getBacklogLevel(2, custom)).toBeNull();
    expect(getBacklogLevel(3, custom)).toBe("yellow");
    expect(getBacklogLevel(6, custom)).toBe("yellow");
    expect(getBacklogLevel(7, custom)).toBe("orange");
    expect(getBacklogLevel(11, custom)).toBe("orange");
    expect(getBacklogLevel(12, custom)).toBe("red");
    expect(getBacklogLevel(50, custom)).toBe("red");
  });

  it("阈值为1时最低积压即触发", () => {
    const strict = { yellow: 1, orange: 2, red: 3 };
    expect(getBacklogLevel(0, strict)).toBeNull();
    expect(getBacklogLevel(1, strict)).toBe("yellow");
    expect(getBacklogLevel(2, strict)).toBe("orange");
    expect(getBacklogLevel(3, strict)).toBe("red");
  });

  it("DEFAULT_BACKLOG_THRESHOLDS与CONFIG_KEYS默认值一致", () => {
    expect(DEFAULT_BACKLOG_THRESHOLDS.yellow).toBe(parseInt(DEFAULT_THRESHOLDS[CONFIG_KEYS.BACKLOG_YELLOW]));
    expect(DEFAULT_BACKLOG_THRESHOLDS.orange).toBe(parseInt(DEFAULT_THRESHOLDS[CONFIG_KEYS.BACKLOG_ORANGE]));
    expect(DEFAULT_BACKLOG_THRESHOLDS.red).toBe(parseInt(DEFAULT_THRESHOLDS[CONFIG_KEYS.BACKLOG_RED]));
  });
});

describe("系统配置 - 动态阈值超期回单", () => {
  it("使用默认阈值时级别判定正确", () => {
    expect(getOverdueLevel(0)).toBe("yellow");
    expect(getOverdueLevel(4)).toBe("yellow");
    expect(getOverdueLevel(15)).toBe("red");
    expect(getOverdueLevel(30)).toBe("red");
  });

  it("使用自定义阈值时级别判定正确", () => {
    const custom = { yellow: 3, orange: 10, red: 20 };
    expect(getOverdueLevel(0, custom)).toBe("yellow");
    expect(getOverdueLevel(2, custom)).toBe("yellow");
    expect(getOverdueLevel(10, custom)).toBe("orange");
    expect(getOverdueLevel(19, custom)).toBe("orange");
    expect(getOverdueLevel(20, custom)).toBe("red");
    expect(getOverdueLevel(50, custom)).toBe("red");
  });
});

describe("系统配置 - 标签配置", () => {
  it("积压预警标签完整", () => {
    expect(BACKLOG_LABELS.yellow.label).toBe("黄色预警");
    expect(BACKLOG_LABELS.yellow.emoji).toBeTruthy();
    expect(BACKLOG_LABELS.orange.label).toBe("橙色预警");
    expect(BACKLOG_LABELS.orange.emoji).toBeTruthy();
    expect(BACKLOG_LABELS.red.label).toBe("红色紧急");
    expect(BACKLOG_LABELS.red.emoji).toBeTruthy();
  });

  it("超期回单标签完整", () => {
    expect(LEVEL_LABELS.yellow.label).toBe("黄色预警");
    expect(LEVEL_LABELS.yellow.pushIntervalDays).toBe(3);
    expect(LEVEL_LABELS.orange.label).toBe("橙色警告");
    expect(LEVEL_LABELS.orange.pushIntervalDays).toBe(1);
    expect(LEVEL_LABELS.red.label).toBe("红色紧急");
    expect(LEVEL_LABELS.red.pushIntervalDays).toBe(1);
  });
});
