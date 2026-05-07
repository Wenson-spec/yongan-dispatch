export type OutsourceSuborderPreviewItem = {
  orderId: number;
  parentIds: number[];
  parentOrders: any[];
};

export function buildOutsourceSuborderPreviewMap(
  items: OutsourceSuborderPreviewItem[] | null | undefined,
): Map<number, OutsourceSuborderPreviewItem> {
  const map = new Map<number, OutsourceSuborderPreviewItem>();
  for (const item of items ?? []) {
    if (!item || typeof item.orderId !== "number") continue;
    map.set(item.orderId, {
      orderId: item.orderId,
      parentIds: Array.isArray(item.parentIds) ? item.parentIds : [],
      parentOrders: Array.isArray(item.parentOrders) ? item.parentOrders : [],
    });
  }
  return map;
}

export function getOutsourceSuborderCount(
  map: Map<number, OutsourceSuborderPreviewItem>,
  orderId: number,
): number {
  return map.get(orderId)?.parentOrders?.length ?? 0;
}

export function hasOutsourceSuborders(
  map: Map<number, OutsourceSuborderPreviewItem>,
  orderId: number,
): boolean {
  return getOutsourceSuborderCount(map, orderId) > 0;
}
