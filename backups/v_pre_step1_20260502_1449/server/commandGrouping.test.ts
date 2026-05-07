import { describe, expect, it } from "vitest";
import {
  flattenSingleItemCommandGroups,
  normalizeCommandGroupItems,
  shouldShowCommandGroupHeader,
} from "../client/src/lib/commandGrouping";
import { getCommandGroupGuide } from "../client/src/lib/commandGroupRules";

describe("commandGrouping regression", () => {
  it("待审批记录可通过 orderId 命中组合单分组键", () => {
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

  it("单条待审批组合单记录即使命中 orderId 预览也不再保留独立组头", () => {
    expect(
      shouldShowCommandGroupHeader([{ id: 9001, orderId: 101 }], new Set<number>([101])),
    ).toBe(false);

    const flattened = flattenSingleItemCommandGroups(
      {
        groups: new Map([["前段外请主单#9", [{ id: 9001, orderId: 101 }]]]),
        ungrouped: [],
      },
      new Set<number>([101]),
    );

    expect(flattened?.groups.size).toBe(0);
    expect(flattened?.ungrouped).toEqual([{ id: 9001, orderId: 101 }]);
  });

  it("无组合单预览支撑时，单条待审批记录仍应被打平为普通行", () => {
    const flattened = flattenSingleItemCommandGroups(
      {
        groups: new Map([["前段外请主单#10", [{ id: 9002, orderId: 202 }]]]),
        ungrouped: [],
      },
      new Set<number>([101]),
    );

    expect(flattened?.groups.size).toBe(0);
    expect(flattened?.ungrouped).toEqual([{ id: 9002, orderId: 202 }]);
  });

  it("多子单待审批组合在找车台中应保持整组分组，不应被打平成多个独立审批行", () => {
    const grouped = flattenSingleItemCommandGroups(
      {
        groups: new Map([
          [
            "前段外请主单#11",
            [
              { id: 9101, orderId: 301, orderNumber: "F0001" },
              { id: 9102, orderId: 302, orderNumber: "F0002" },
            ],
          ],
        ]),
        ungrouped: [],
      },
      new Set<number>([301]),
    );

    expect(grouped?.groups.size).toBe(1);
    expect(grouped?.ungrouped).toEqual([]);
    expect(grouped?.groups.get("前段外请主单#11")).toEqual([
      { id: 9101, orderId: 301, orderNumber: "F0001" },
      { id: 9102, orderId: 302, orderNumber: "F0002" },
    ]);
  });

  it("待审批组合子单提示应明确为仅随主单整组审批", () => {
    const guide = getCommandGroupGuide("approval");

    expect(guide.childHint).toContain("仅随主订单整组操作");
    expect(guide.childHint).toContain("不支持单独审批");
    expect(guide.badgeText).toContain("整组审批");
  });
});
