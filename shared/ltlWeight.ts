const KG_TO_TON = 1000;
const LTL_KG_AUTO_CONVERT_THRESHOLD = 100;
const TON_WEIGHT_PRECISION = 100000;

function toPositiveNumber(value: string | number | null | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

function formatTonWeight(value: number): string {
  const rounded = Math.round(value * TON_WEIGHT_PRECISION) / TON_WEIGHT_PRECISION;
  return rounded.toString();
}

export function shouldAutoConvertLtlWeightFromKg(weight: string | number | null | undefined): boolean {
  const numeric = toPositiveNumber(weight);
  if (numeric === null) return false;
  return numeric > LTL_KG_AUTO_CONVERT_THRESHOLD;
}

export function normalizeLtlWeightField(weight: string | number | null | undefined): string | null | undefined {
  if (weight === undefined) return undefined;
  if (weight === null || weight === "") return weight as null | "";
  const numeric = toPositiveNumber(weight);
  if (numeric === null) return typeof weight === "number" ? String(weight) : String(weight).trim();
  if (!shouldAutoConvertLtlWeightFromKg(numeric)) {
    return typeof weight === "number" ? String(weight) : String(weight).trim();
  }
  return formatTonWeight(numeric / KG_TO_TON);
}

export function resolveWeightInTons(
  businessType: string | null | undefined,
  weight: string | number | null | undefined,
): number {
  const numeric = toPositiveNumber(weight);
  if (numeric === null) return 0;
  if (businessType === "ltl" && shouldAutoConvertLtlWeightFromKg(numeric)) {
    return Math.round((numeric / KG_TO_TON) * TON_WEIGHT_PRECISION) / TON_WEIGHT_PRECISION;
  }
  return numeric;
}
