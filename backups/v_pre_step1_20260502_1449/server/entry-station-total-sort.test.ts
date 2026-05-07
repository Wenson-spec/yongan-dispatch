import { describe, expect, it } from "vitest";
import {
  buildEntryStationTotalPlanMeta,
  isEntryStationPlanFollower,
  isEntryStationTotalPlanGrouped,
  isEntryStationTotalPlanLead,
  sortEntryStationTotalOrders,
} from "../client/src/pages/entryStationTotalTable.utils";

describe("entry station total order sorting", () => {
  it("places urgent orders first and sorts each priority group by createdAt descending", () => {
    const sorted = sortEntryStationTotalOrders([
      { id: 1, status: "pending_assign", isUrgent: false, createdAt: "2026-04-01T08:00:00.000Z" },
      { id: 2, status: "pending_assign", isUrgent: true, createdAt: "2026-04-01T09:00:00.000Z" },
      { id: 3, status: "pending_assign", isUrgent: true, createdAt: "2026-04-01T10:00:00.000Z" },
      { id: 4, status: "pending_assign", isUrgent: false, createdAt: "2026-04-01T11:00:00.000Z" },
    ]);

    expect(sorted.map((item) => ({ id: item.id, isUrgent: item.isUrgent, createdAt: item.createdAt }))).toEqual([
      { id: 3, isUrgent: true, createdAt: "2026-04-01T10:00:00.000Z" },
      { id: 2, isUrgent: true, createdAt: "2026-04-01T09:00:00.000Z" },
      { id: 4, isUrgent: false, createdAt: "2026-04-01T11:00:00.000Z" },
      { id: 1, isUrgent: false, createdAt: "2026-04-01T08:00:00.000Z" },
    ]);
  });

  it("keeps merged and normal orders in the same createdAt-desc order when urgency is equal", () => {
    const sorted = sortEntryStationTotalOrders([
      { id: 1, status: "pending_assign", isUrgent: false, createdAt: "2026-04-01T08:00:00.000Z", businessType: "outsource" },
      { id: 2, status: "pending_assign", isUrgent: false, createdAt: "2026-04-01T10:00:00.000Z", businessType: "outsource" },
      { id: 3, status: "pending_assign", isUrgent: false, createdAt: "2026-04-01T09:00:00.000Z", businessType: "self" },
    ]);

    expect(sorted.map((item) => item.createdAt)).toEqual([
      "2026-04-01T10:00:00.000Z",
      "2026-04-01T09:00:00.000Z",
      "2026-04-01T08:00:00.000Z",
    ]);
  });

  it("treats orders sharing mergedPlanNumber as a visible plan group and marks the newest row as group lead", () => {
    const items = sortEntryStationTotalOrders([
      { id: 11, mergedPlanNumber: "P0001", createdAt: "2026-04-01T08:00:00.000Z", isUrgent: false },
      { id: 12, mergedPlanNumber: "P0001", createdAt: "2026-04-01T09:00:00.000Z", isUrgent: false },
      { id: 13, mergedPlanNumber: "P0002", createdAt: "2026-04-01T07:00:00.000Z", isUrgent: false },
      { id: 14, createdAt: "2026-04-01T11:00:00.000Z", isUrgent: false },
    ]);

    const meta = buildEntryStationTotalPlanMeta(items);
    const planRows = items.filter((item) => item.mergedPlanNumber === "P0001");

    expect(meta.groupSizes.get("P0001")).toBe(2);
    expect(planRows.map((item) => ({
      id: item.id,
      grouped: isEntryStationTotalPlanGrouped(item, meta.groupSizes),
      lead: isEntryStationTotalPlanLead(item, meta.leadIds),
      follower: isEntryStationPlanFollower(item, meta.groupSizes, meta.leadIds),
    }))).toEqual([
      { id: 12, grouped: true, lead: true, follower: false },
      { id: 11, grouped: true, lead: false, follower: true },
    ]);
    expect(isEntryStationTotalPlanGrouped(items.find((item) => item.id === 13)!, meta.groupSizes)).toBe(false);
    expect(isEntryStationTotalPlanGrouped(items.find((item) => item.id === 14)!, meta.groupSizes)).toBe(false);
  });

  it("marks only the lead row of each plan group as operable and treats the remaining rows as follower rows", () => {
    const items = sortEntryStationTotalOrders([
      { id: 21, mergedPlanNumber: "PLAN-01", createdAt: "2026-04-01T08:00:00.000Z", isUrgent: false },
      { id: 22, mergedPlanNumber: "PLAN-01", createdAt: "2026-04-01T10:00:00.000Z", isUrgent: false },
      { id: 23, mergedPlanNumber: "PLAN-01", createdAt: "2026-04-01T09:00:00.000Z", isUrgent: false },
      { id: 24, mergedPlanNumber: "PLAN-02", createdAt: "2026-04-01T07:00:00.000Z", isUrgent: false },
    ]);

    const meta = buildEntryStationTotalPlanMeta(items);
    const planOneRows = items.filter((item) => item.mergedPlanNumber === "PLAN-01");

    expect(planOneRows.map((item) => item.id)).toEqual([22, 23, 21]);
    expect(planOneRows.filter((item) => isEntryStationTotalPlanLead(item, meta.leadIds)).map((item) => item.id)).toEqual([22]);
    expect(planOneRows.filter((item) => isEntryStationPlanFollower(item, meta.groupSizes, meta.leadIds)).map((item) => item.id)).toEqual([23, 21]);
    expect(isEntryStationPlanFollower(items.find((item) => item.id === 24)!, meta.groupSizes, meta.leadIds)).toBe(false);
  });
});
