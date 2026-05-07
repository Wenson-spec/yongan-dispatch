export type ApprovalPricingComparable = {
  quotedPrice?: string | number | null;
  dispatchPrice?: string | number | null;
  requestedAmount?: string | number | null;
  reason?: string | null;
};

export type ApprovalGroupPriceSnapshot = {
  originalPrice: number | null;
  requestedPrice: number | null;
  priceDelta: number | null;
  deltaRate: number | null;
  missingOriginalCount: number;
  missingRequestedCount: number;
};

const GROUP_REQUESTED_PRICE_REASON_RE = /整组申请报价|整组申请总额|整组运费|整组总价|申请总价|审批总价|主单申请报价|批量找车审批|整组派车审批/;

function normalizeAmount(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

function extractGroupRequestedPriceFromReason(reasonText?: string | null) {
  const normalized = reasonText?.trim() ?? "";
  if (!normalized) return null;

  const patterns = [
    /(?:整组申请报价|整组申请总额|整组运费|整组总价|申请总价|审批总价|主单申请报价|总运费)[：:]?\s*¥?\s*([0-9,]+(?:\.[0-9]+)?)/,
    /分摊运费[：:]?\s*¥?\s*[0-9,]+(?:\.[0-9]+)?\s*\((?:总运费|整组运费|总价)[：:]?\s*¥?\s*([0-9,]+(?:\.[0-9]+)?)/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return normalizeAmount(match[1]);
    }
  }

  return null;
}

export function getApprovalOriginalPrice(item: ApprovalPricingComparable) {
  return normalizeAmount(item.quotedPrice) ?? normalizeAmount(item.dispatchPrice);
}

export function getApprovalOriginalPriceLabel(item: ApprovalPricingComparable) {
  if (normalizeAmount(item.quotedPrice) !== null) return "原定价";
  if (normalizeAmount(item.dispatchPrice) !== null) return "原调度价";
  return "原参考价";
}

export function getApprovalRequestedPrice(item: ApprovalPricingComparable) {
  return normalizeAmount(item.requestedAmount);
}

export function getApprovalGroupRequestedPrice(items: ApprovalPricingComparable[]) {
  const extractedFromReason = items
    .map((item) => extractGroupRequestedPriceFromReason(item.reason))
    .filter((value): value is number => typeof value === "number");

  if (extractedFromReason.length > 0) {
    const uniqueExtracted = Array.from(new Set(extractedFromReason.map((value) => value.toFixed(2))));
    if (uniqueExtracted.length === 1) {
      return Number(uniqueExtracted[0]);
    }
  }

  const requestedValues = items
    .map((item) => getApprovalRequestedPrice(item))
    .filter((value): value is number => typeof value === "number");

  if (requestedValues.length === 0) return null;

  const uniqueRequested = Array.from(new Set(requestedValues.map((value) => value.toFixed(2))));
  const hasGroupLevelReason = items.some((item) => GROUP_REQUESTED_PRICE_REASON_RE.test(item.reason ?? ""));

  if (hasGroupLevelReason && uniqueRequested.length === 1) {
    return Number(uniqueRequested[0]);
  }

  return Math.round(requestedValues.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

export function getApprovalGroupPriceSnapshot(items: ApprovalPricingComparable[]): ApprovalGroupPriceSnapshot {
  const originalValues = items
    .map((item) => getApprovalOriginalPrice(item))
    .filter((value): value is number => typeof value === "number");
  const requestedValues = items
    .map((item) => getApprovalRequestedPrice(item))
    .filter((value): value is number => typeof value === "number");

  const originalPrice = originalValues.length > 0
    ? Math.round(originalValues.reduce((sum, value) => sum + value, 0) * 100) / 100
    : null;
  const requestedPrice = getApprovalGroupRequestedPrice(items);
  const priceDelta = originalPrice !== null && requestedPrice !== null
    ? Math.round((requestedPrice - originalPrice) * 100) / 100
    : null;
  const deltaRate = originalPrice !== null && requestedPrice !== null && originalPrice !== 0
    ? Math.round((((requestedPrice - originalPrice) / originalPrice) * 100) * 10) / 10
    : null;

  return {
    originalPrice,
    requestedPrice,
    priceDelta,
    deltaRate,
    missingOriginalCount: Math.max(items.length - originalValues.length, 0),
    missingRequestedCount: Math.max(items.length - requestedValues.length, 0),
  };
}

export function getApprovalPriceDelta(item: ApprovalPricingComparable) {
  const originalPrice = getApprovalOriginalPrice(item);
  const requestedPrice = getApprovalRequestedPrice(item);
  if (originalPrice === null || requestedPrice === null) return null;
  return Math.round((requestedPrice - originalPrice) * 100) / 100;
}

export function getApprovalPriceDeltaRate(item: ApprovalPricingComparable) {
  const originalPrice = getApprovalOriginalPrice(item);
  const requestedPrice = getApprovalRequestedPrice(item);
  if (originalPrice === null || requestedPrice === null || originalPrice === 0) return null;
  return Math.round((((requestedPrice - originalPrice) / originalPrice) * 100) * 10) / 10;
}
