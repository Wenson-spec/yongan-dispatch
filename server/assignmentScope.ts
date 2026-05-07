const SUBCHAIN_PARENT_IDS_MARKER = "【关联主单IDs】";
const LTL_SUBCHAIN_RELEASED_STATUSES = new Set(["pending_assign", "cancelled"]);
const LTL_SUBCHAIN_TAGS = ["【零担前段外请子链】", "【零担后段外请子链】"] as const;

function isLtlSubchainCandidate(remarks?: string | null) {
  const text = String(remarks || "");
  return text.includes(SUBCHAIN_PARENT_IDS_MARKER) || LTL_SUBCHAIN_TAGS.some((tag) => text.includes(tag));
}

export type DispatcherAssignmentScopeCandidate = {
  id: number;
  parentId?: number | null;
  remarks?: string | null;
  status?: string | null;
  businessType?: string | null;
};

function uniquePositiveIds(values: Array<number | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
}

export function parseRelatedParentIdsFromRemarks(remarks?: string | null) {
  const text = String(remarks || "");
  const match = text.match(/【关联主单IDs】,?([\d,]+),?/);
  if (!match?.[1]) return [] as number[];
  return uniquePositiveIds(
    match[1]
      .split(",")
      .map((item) => Number(item.trim())),
  );
}

export function isActiveLtlSubchainStatus(status?: string | null) {
  return Boolean(status) && !LTL_SUBCHAIN_RELEASED_STATUSES.has(String(status));
}

export function expandDispatcherAssignmentOrderIds(
  baseOrderIds: number[],
  candidates: DispatcherAssignmentScopeCandidate[],
) {
  const normalizedBaseOrderIds = uniquePositiveIds(baseOrderIds);
  if (normalizedBaseOrderIds.length === 0) {
    return {
      orderIds: [] as number[],
      autoFollowOrderIds: [] as number[],
    };
  }

  const baseIdSet = new Set(normalizedBaseOrderIds);
  const autoFollowOrderIds = uniquePositiveIds(
    candidates
      .filter((item) => item?.businessType === "outsource")
      .filter((item) => !baseIdSet.has(Number(item.id)))
      .filter((item) => isLtlSubchainCandidate(item.remarks))
      .filter((item) => isActiveLtlSubchainStatus(item.status))
      .filter((item) => {
        const relatedParentIds = uniquePositiveIds([
          item.parentId,
          ...parseRelatedParentIdsFromRemarks(item.remarks),
        ]);
        return relatedParentIds.some((parentId) => baseIdSet.has(parentId));
      })
      .map((item) => Number(item.id)),
  );

  return {
    orderIds: uniquePositiveIds([...normalizedBaseOrderIds, ...autoFollowOrderIds]),
    autoFollowOrderIds,
  };
}

export { SUBCHAIN_PARENT_IDS_MARKER };
