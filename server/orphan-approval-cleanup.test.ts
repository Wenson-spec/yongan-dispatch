import { describe, it, expect } from "vitest";
import { hasLinkedApprovalOrder } from "./routers/approval";

const filterLinkedPendingApprovals = <T extends { linkedOrderId?: number | null }>(
  items: T[],
) => items.filter((item) => hasLinkedApprovalOrder(item));

describe("orphan approval cleanup rules", () => {
  it("keeps approvals whose orders still resolve from joined order data", () => {
    const rows = [
      { id: 1, linkedOrderId: 101 },
      { id: 2, linkedOrderId: 102 },
    ];

    expect(filterLinkedPendingApprovals(rows)).toEqual(rows);
  });

  it("drops orphan approvals whose order row is already missing", () => {
    const rows = [
      { id: 1, linkedOrderId: null },
      { id: 2, linkedOrderId: 202 },
      { id: 3, linkedOrderId: undefined },
    ];

    expect(filterLinkedPendingApprovals(rows)).toEqual([
      { id: 2, linkedOrderId: 202 },
    ]);
  });
});
