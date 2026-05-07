export const FRONT_OUTSOURCE_SUFFIX = "-前段外请";

export type CommandGroupLookup = {
  byId: Map<number, string>;
  byOrderNumber: Map<string, string>;
};

export type CommandGroupItem = {
  id?: number | null;
  orderId?: number | null;
  mergedPlanNumber?: string | null;
  parentId?: number | null;
  orderNumber?: string | null;
  systemCode?: string | null;
};

export type GroupedCommandData<T> = {
  groups: Map<string, T[]>;
  ungrouped: T[];
};

export function deriveCommandGroupKey(item: {
  mergedPlanNumber?: string | null;
  parentId?: number | null;
  orderNumber?: string | null;
}) {
  const mergedPlanNumber = item.mergedPlanNumber?.trim();
  if (mergedPlanNumber) return mergedPlanNumber;

  if (item.parentId !== null && item.parentId !== undefined) {
    return `前段外请主单#${item.parentId}`;
  }

  const orderNumber = item.orderNumber?.trim();
  if (orderNumber && orderNumber.endsWith(FRONT_OUTSOURCE_SUFFIX)) {
    return orderNumber.replace(FRONT_OUTSOURCE_SUFFIX, "");
  }

  return null;
}

export function resolveCommandGroupKey(item: CommandGroupItem, lookup?: CommandGroupLookup) {
  const directKey = deriveCommandGroupKey(item);
  if (directKey) return directKey;
  if (!lookup) return null;

  const candidateIds = [item.orderId, item.id];
  for (const candidateId of candidateIds) {
    if (typeof candidateId !== "number") continue;
    const mappedById = lookup.byId.get(candidateId);
    if (mappedById) return mappedById;
  }

  const orderNumber = item.orderNumber?.trim();
  if (orderNumber) {
    const mappedByOrderNumber = lookup.byOrderNumber.get(orderNumber);
    if (mappedByOrderNumber) return mappedByOrderNumber;
  }

  const systemCode = item.systemCode?.trim();
  if (systemCode) {
    const mappedBySystemCode = lookup.byOrderNumber.get(systemCode);
    if (mappedBySystemCode) return mappedBySystemCode;
  }

  return null;
}

export function normalizeCommandGroupItems<T extends CommandGroupItem>(
  items: T[] | undefined,
  lookup?: CommandGroupLookup,
): Array<T & { mergedPlanNumber: string | null }> {
  return (items ?? []).map((item) => ({
    ...item,
    mergedPlanNumber: resolveCommandGroupKey(item, lookup),
  }));
}

export function hasFrontOutsourceFallbackGroup(
  items: Array<{ mergedPlanNumber?: string | null; parentId?: number | null; orderNumber?: string | null }>,
) {
  const seen = new Set<string>();
  for (const item of items) {
    const key = deriveCommandGroupKey(item);
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export function getGroupSummaryText(
  items: Array<{ mergedPlanNumber?: string | null; parentId?: number | null; orderNumber?: string | null }>,
) {
  if (items.length === 0) return "暂无可分组订单";
  return hasFrontOutsourceFallbackGroup(items)
    ? "当前已按合并计划号 / 前段外请主单归组显示"
    : "当前暂无重复批次，已按可识别批次键展示";
}

export function shouldShowCommandGroupHeader<T extends Pick<CommandGroupItem, "id" | "orderId">>(
  items: T[],
  _previewOrderIds?: Set<number>,
) {
  return items.length > 1;
}

export function flattenSingleItemCommandGroups<T extends Pick<CommandGroupItem, "id" | "orderId">>(
  groupedData: GroupedCommandData<T> | null,
  previewOrderIds?: Set<number>,
): GroupedCommandData<T> | null {
  if (!groupedData) return null;

  const groups = new Map<string, T[]>();
  const ungrouped = [...groupedData.ungrouped];

  groupedData.groups.forEach((items, key) => {
    if (shouldShowCommandGroupHeader(items, previewOrderIds)) {
      groups.set(key, items);
      return;
    }
    ungrouped.push(...items);
  });

  return { groups, ungrouped };
}
