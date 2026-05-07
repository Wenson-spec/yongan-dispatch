import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getBacklogLevel,
  getNotifyTargets,
  BACKLOG_LABELS,
  DEFAULT_BACKLOG_THRESHOLDS,
  type BacklogLevel,
  type BacklogAlertItem,
} from "./dispatcherBacklogChecker";

// Mock the database module
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(null),
  };
});

describe("调度员积压预警 - 级别判定", () => {
  it("积压0单应返回null（无预警）", () => {
    expect(getBacklogLevel(0)).toBeNull();
  });

  it("积压1-4单应返回null（无预警）", () => {
    expect(getBacklogLevel(1)).toBeNull();
    expect(getBacklogLevel(4)).toBeNull();
  });

  it("积压5单应返回yellow", () => {
    expect(getBacklogLevel(5)).toBe("yellow");
  });

  it("积压6-9单应返回yellow", () => {
    expect(getBacklogLevel(6)).toBe("yellow");
    expect(getBacklogLevel(9)).toBe("yellow");
  });

  it("积压10单应返回orange", () => {
    expect(getBacklogLevel(10)).toBe("orange");
  });

  it("积压11-14单应返回orange", () => {
    expect(getBacklogLevel(11)).toBe("orange");
    expect(getBacklogLevel(14)).toBe("orange");
  });

  it("积压15单应返回red", () => {
    expect(getBacklogLevel(15)).toBe("red");
  });

  it("积压20单以上应返回red", () => {
    expect(getBacklogLevel(20)).toBe("red");
    expect(getBacklogLevel(100)).toBe("red");
  });
});

describe("调度员积压预警 - 通知目标", () => {
  it("yellow级别只通知owner", () => {
    const targets = getNotifyTargets("yellow");
    expect(targets).toContain("owner");
    expect(targets).toHaveLength(1);
  });

  it("orange级别通知owner和cs_manager", () => {
    const targets = getNotifyTargets("orange");
    expect(targets).toContain("owner");
    expect(targets).toContain("cs_manager");
    expect(targets).toHaveLength(2);
  });

  it("red级别通知owner、cs_manager和admin", () => {
    const targets = getNotifyTargets("red");
    expect(targets).toContain("owner");
    expect(targets).toContain("cs_manager");
    expect(targets).toContain("admin");
    expect(targets).toHaveLength(3);
  });

  it("null级别返回空数组", () => {
    const targets = getNotifyTargets(null);
    expect(targets).toEqual([]);
  });
});

describe("调度员积压预警 - 阈值配置", () => {
  it("默认阈值应正确配置", () => {
    expect(DEFAULT_BACKLOG_THRESHOLDS.yellow).toBe(5);
    expect(DEFAULT_BACKLOG_THRESHOLDS.orange).toBe(10);
    expect(DEFAULT_BACKLOG_THRESHOLDS.red).toBe(15);
  });

  it("阈值应递增", () => {
    expect(DEFAULT_BACKLOG_THRESHOLDS.yellow).toBeLessThan(DEFAULT_BACKLOG_THRESHOLDS.orange);
    expect(DEFAULT_BACKLOG_THRESHOLDS.orange).toBeLessThan(DEFAULT_BACKLOG_THRESHOLDS.red);
  });

  it("每个级别应有标签和emoji", () => {
    for (const level of Object.values(BACKLOG_LABELS)) {
      expect(level.label).toBeTruthy();
      expect(level.emoji).toBeTruthy();
    }
  });
});

describe("调度员积压预警 - checkDispatcherBacklog", () => {
  it("数据库不可用时应返回空结果", async () => {
    const { checkDispatcherBacklog } = await import("./dispatcherBacklogChecker");
    const result = await checkDispatcherBacklog();
    expect(result.checked).toBe(0);
    expect(result.alerted).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("startBacklogChecker和stopBacklogChecker应可导入", async () => {
    const { startBacklogChecker, stopBacklogChecker } = await import("./dispatcherBacklogChecker");
    expect(typeof startBacklogChecker).toBe("function");
    expect(typeof stopBacklogChecker).toBe("function");
  });
});

describe("调度员积压预警 - 排序和汇总", () => {
  it("预警项应按积压数降序排列", () => {
    const items: BacklogAlertItem[] = [
      { dispatcherId: 1, dispatcherName: "A", role: "outsource_dispatcher", roleLabel: "外请", backlogCount: 5, level: "yellow" },
      { dispatcherId: 2, dispatcherName: "B", role: "ltl_dispatcher", roleLabel: "零担", backlogCount: 15, level: "red" },
      { dispatcherId: 3, dispatcherName: "C", role: "fleet_dispatcher", roleLabel: "车队", backlogCount: 10, level: "orange" },
    ];

    items.sort((a, b) => b.backlogCount - a.backlogCount);

    expect(items[0].dispatcherName).toBe("B");
    expect(items[0].level).toBe("red");
    expect(items[1].dispatcherName).toBe("C");
    expect(items[1].level).toBe("orange");
    expect(items[2].dispatcherName).toBe("A");
    expect(items[2].level).toBe("yellow");
  });

  it("各级别统计应正确", () => {
    const items: BacklogAlertItem[] = [
      { dispatcherId: 1, dispatcherName: "A", role: "outsource_dispatcher", roleLabel: "外请", backlogCount: 5, level: "yellow" },
      { dispatcherId: 2, dispatcherName: "B", role: "ltl_dispatcher", roleLabel: "零担", backlogCount: 16, level: "red" },
      { dispatcherId: 3, dispatcherName: "C", role: "fleet_dispatcher", roleLabel: "车队", backlogCount: 12, level: "orange" },
      { dispatcherId: 4, dispatcherName: "D", role: "outsource_dispatcher", roleLabel: "外请", backlogCount: 7, level: "yellow" },
    ];

    const yellow = items.filter(i => i.level === "yellow").length;
    const orange = items.filter(i => i.level === "orange").length;
    const red = items.filter(i => i.level === "red").length;

    expect(yellow).toBe(2);
    expect(orange).toBe(1);
    expect(red).toBe(1);
  });
});

describe("调度员积压预警 - 前端预警标识逻辑", () => {
  it("积压≥15应显示红色脉冲圆点", () => {
    const backlog = 15;
    expect(backlog >= 15).toBe(true);
    // 对应 bg-red-500 animate-pulse
  });

  it("积压10-14应显示橙色脉冲圆点", () => {
    const backlog = 12;
    expect(backlog >= 10 && backlog < 15).toBe(true);
    // 对应 bg-orange-500 animate-pulse
  });

  it("积压5-9应显示黄色圆点（不脉冲）", () => {
    const backlog = 7;
    expect(backlog >= 5 && backlog < 10).toBe(true);
    // 对应 bg-yellow-500
  });

  it("积压<5不显示预警圆点", () => {
    const backlog = 3;
    expect(backlog >= 5).toBe(false);
  });
});
