import { describe, expect, it } from "vitest";
import {
  deriveCommandGroupKey,
  flattenSingleItemCommandGroups,
  getGroupSummaryText,
  normalizeCommandGroupItems,
  shouldShowCommandGroupHeader,
} from "./commandGrouping";

describe("commandGrouping", () => {
  it("优先使用 mergedPlanNumber 作为分组键", () => {
    expect(
      deriveCommandGroupKey({
        mergedPlanNumber: "MP-001",
        parentId: 12,
        orderNumber: "F0001-前段外请",
      }),
    ).toBe("MP-001");
  });

  it("在 mergedPlanNumber 为空时回退到前段外请主单 parentId", () => {
    expect(
      deriveCommandGroupKey({
        mergedPlanNumber: null,
        parentId: 88,
        orderNumber: "F0002",
      }),
    ).toBe("前段外请主单#88");
  });

  it("在缺少 mergedPlanNumber 和 parentId 时可从前段外请单号后缀提取分组键", () => {
    expect(
      deriveCommandGroupKey({
        mergedPlanNumber: null,
        parentId: null,
        orderNumber: "F0002265965等2单-前段外请",
      }),
    ).toBe("F0002265965等2单");
  });

  it("可通过全局概览反向映射把原始子单归并到父单分组键", () => {
    const normalized = normalizeCommandGroupItems(
      [
        {
          id: 101,
          orderNumber: "F0002265962",
          systemCode: "YA20260404TEST",
          mergedPlanNumber: null,
          parentId: null,
        },
      ],
      {
        byId: new Map([[101, "F0002265966等3单"]]),
        byOrderNumber: new Map(),
      },
    );

    expect(normalized[0]?.mergedPlanNumber).toBe("F0002265966等3单");
  });

  it("可通过订单号映射补齐分组键，覆盖时效监控等只返回原始单号的场景", () => {
    const normalized = normalizeCommandGroupItems(
      [
        {
          id: 202,
          orderNumber: "F0002265963",
          systemCode: "YA20260404ABCD",
          mergedPlanNumber: null,
          parentId: null,
        },
      ],
      {
        byId: new Map(),
        byOrderNumber: new Map([["F0002265963", "前段外请主单#5"]]),
      },
    );

    expect(normalized[0]?.mergedPlanNumber).toBe("前段外请主单#5");
  });

  it("在存在重复可识别批次键时给出已归组提示", () => {
    expect(
      getGroupSummaryText([
        { mergedPlanNumber: null, parentId: 5, orderNumber: "F0002265965等2单-前段外请" },
        { mergedPlanNumber: null, parentId: 5, orderNumber: "F0002265966等2单-前段外请" },
      ]),
    ).toContain("已按合并计划号 / 前段外请主单归组显示");
  });

  it("单条记录且不存在真实子订单预览时不应显示组合单组头", () => {
    expect(
      shouldShowCommandGroupHeader([{ id: 501 }], new Set<number>()),
    ).toBe(false);

    const flattened = flattenSingleItemCommandGroups({
      groups: new Map([["前段外请主单#4", [{ id: 501 }]]]),
      ungrouped: [],
    }, new Set<number>());

    expect(flattened?.groups.size).toBe(0);
    expect(flattened?.ungrouped).toEqual([{ id: 501 }]);
  });

  it("单条记录只在存在真实子订单预览时保留组合单组头", () => {
    expect(
      shouldShowCommandGroupHeader([{ id: 601 }], new Set<number>([601])),
    ).toBe(true);

    const flattened = flattenSingleItemCommandGroups({
      groups: new Map([["前段外请主单#7", [{ id: 601 }]]]),
      ungrouped: [],
    }, new Set<number>([601]));

    expect(Array.from(flattened?.groups.keys() ?? [])).toEqual(["前段外请主单#7"]);
    expect(flattened?.ungrouped).toEqual([]);
  });

  it("审批记录可通过 orderId 命中全局映射分组键", () => {
    const normalized = normalizeCommandGroupItems(
      [
        {
          id: 9001,
          orderId: 101,
          orderNumber: "APPROVAL-9001",
          mergedPlanNumber: null,
          parentId: null,
        },
      ],
      {
        byId: new Map([[101, "前段外请主单#9"]]),
        byOrderNumber: new Map(),
      },
    );

    expect(normalized[0]?.mergedPlanNumber).toBe("前段外请主单#9");
  });

  it("单条审批记录可仅凭 orderId 命中的真实子订单预览保留组合单组头", () => {
    expect(
      shouldShowCommandGroupHeader([{ id: 9001, orderId: 101 }], new Set<number>([101])),
    ).toBe(true);

    const flattened = flattenSingleItemCommandGroups({
      groups: new Map([["前段外请主单#9", [{ id: 9001, orderId: 101 }]]]),
      ungrouped: [],
    }, new Set<number>([101]));

    expect(Array.from(flattened?.groups.keys() ?? [])).toEqual(["前段外请主单#9"]);
    expect(flattened?.ungrouped).toEqual([]);
  });
});
