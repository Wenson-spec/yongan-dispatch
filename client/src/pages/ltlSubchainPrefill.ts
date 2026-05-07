export type LtlSubchainStage = "pickup" | "delivery";

type SettlementType = "monthly" | "cash" | "collect";

export type LtlSubchainOrderSeed = {
  id?: number | string | null;
  systemCode?: string | null;
  orderNumber?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  settlementType?: string | null;
  cargoName?: string | null;
  weight?: string | number | null;
  originCity?: string | null;
  destinationCity?: string | null;
  deliveryAddress?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
  mergedPlanNumber?: string | null;
  department?: string | null;
};

type LtlSubchainSourceOrder = {
  id?: number;
  systemCode: string;
  orderNumber: string;
};

export type LtlSubchainPrefill = {
  stage: LtlSubchainStage;
  stageLabel: string;
  sourceLabel: string;
  sourceCount: number;
  isCombinedLoad: boolean;
  sourceOrders: LtlSubchainSourceOrder[];
  parentId?: number;
  parentIds: number[];
  parentSystemCode: string;
  parentOrderNumber: string;
  returnPath: string;
  helperText: string;
  queueHint: string;
  defaults: {
    businessType: "outsource";
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    settlementType: SettlementType;
    cargoName: string;
    weight: string;
    originCity: string;
    destinationCity: string;
    deliveryAddress: string;
    receiverName: string;
    receiverPhone: string;
    mergedPlanNumber: string;
    department: string;
    remarks: string;
    shippingNote: string;
  };
};

const STAGE_LABELS: Record<LtlSubchainStage, string> = {
  pickup: "前段外请车",
  delivery: "后段外请车",
};

function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeSearch(search: string): URLSearchParams {
  if (!search) return new URLSearchParams();
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function parseSettlementType(raw: string): SettlementType {
  if (raw === "cash" || raw === "collect") return raw;
  return "monthly";
}

function parseNumberList(raw: string): number[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item)),
    ),
  );
}

function parseList(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split("||")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueTexts(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => cleanText(value))
        .filter(Boolean),
    ),
  );
}

function joinSummary(values: unknown[], separator: string): string {
  return uniqueTexts(values).join(separator);
}

function sumWeights(values: Array<string | number | null | undefined>): string {
  const total = values.reduce<number>((sum, value) => {
    const parsed = Number.parseFloat(cleanText(value));
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);

  if (total <= 0) return "";
  return total.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function normalizeSourceOrders(orders: LtlSubchainOrderSeed[]): LtlSubchainSourceOrder[] {
  return orders.map((order, index) => {
    const parsedId = Number(cleanText(order.id));
    return {
      id: Number.isFinite(parsedId) ? parsedId : undefined,
      systemCode: cleanText(order.systemCode),
      orderNumber: cleanText(order.orderNumber) || cleanText(order.systemCode) || `零担主单${index + 1}`,
    };
  });
}

function buildSourceLabel(sourceOrders: LtlSubchainSourceOrder[], fallbackSystemCode: string, fallbackOrderNumber: string, parentIds: number[]): string {
  if (sourceOrders.length <= 1) {
    const first = sourceOrders[0];
    return first?.systemCode || first?.orderNumber || fallbackSystemCode || fallbackOrderNumber || (parentIds[0] ? `主单ID ${parentIds[0]}` : "零担主单");
  }

  const labels = sourceOrders
    .map((item) => item.orderNumber || item.systemCode)
    .filter(Boolean)
    .slice(0, 5);
  const suffix = sourceOrders.length > 5 ? ` 等${sourceOrders.length}单` : "";
  return `${sourceOrders.length}个零担主单合车：${labels.join("、")}${suffix}`;
}

function buildDefaultOrderNumber(sourceOrders: LtlSubchainSourceOrder[], stage: LtlSubchainStage, parentIds: number[]): string {
  const suffix = stage === "pickup" ? "前段外请" : "后段外请";
  const first = sourceOrders[0];
  const firstLabel = first?.orderNumber || first?.systemCode || (parentIds[0] ? `LTL-${parentIds[0]}` : "LTL");
  if (sourceOrders.length > 1) {
    return `${firstLabel}等${sourceOrders.length}单-${suffix}`;
  }
  return `${firstLabel}-${suffix}`;
}

function buildDefaultRemarks(stage: LtlSubchainStage, sourceLabel: string, sourceOrders: LtlSubchainSourceOrder[], parentIds: number[]): string {
  const stageIntro = stage === "pickup"
    ? "用于承接提货到货站的外请动作，完成后回到零担主链继续询价、发运与后续跟踪。"
    : "用于承接目的站自提送货、预约卸货或末端配送，执行结果仍需回写零担主链。";
  const relationLine = parentIds.length > 0 ? `【关联主单IDs】${parentIds.join(",")}` : "";
  const orderLine = sourceOrders.length > 1
    ? `合车主单：${sourceOrders.map((item) => item.orderNumber || item.systemCode).join("、")}。`
    : "";
  return `【零担${stage === "pickup" ? "前段" : "后段"}外请子链】来源主单：${sourceLabel}；${orderLine}${stageIntro}${relationLine}`.trim();
}

function buildDefaultShippingNote(stage: LtlSubchainStage, sourceLabel: string, sourceOrders: LtlSubchainSourceOrder[]): string {
  const orderLine = sourceOrders.length > 1
    ? `本次为${sourceOrders.length}单合车处理，请按同车统一询价与派车。`
    : "";
  if (stage === "pickup") {
    return `零担主链前段外请：请复核提货地址、接货范围与接入货站，来源主单：${sourceLabel}。${orderLine}`.trim();
  }
  return `零担主链后段外请：请复核目的站送货范围、预约卸货要求与收货确认，来源主单：${sourceLabel}。${orderLine}`.trim();
}

function aggregateSeeds(orders: LtlSubchainOrderSeed[]) {
  const sourceOrders = normalizeSourceOrders(orders);
  const parentIds = sourceOrders.map((item) => item.id).filter((item): item is number => Number.isFinite(item as number));
  const first = orders[0] || {};
  const parentSystemCode = cleanText(first.systemCode);
  const parentOrderNumber = cleanText(first.orderNumber);
  const mergedPlanValues = uniqueTexts(orders.map((item) => item.mergedPlanNumber));

  return {
    sourceOrders,
    parentIds,
    parentSystemCode,
    parentOrderNumber,
    defaults: {
      customerName: joinSummary(orders.map((item) => item.customerName), " / "),
      customerPhone: joinSummary(orders.map((item) => item.customerPhone), " / "),
      settlementType: parseSettlementType(cleanText(first.settlementType)),
      cargoName: joinSummary(orders.map((item) => item.cargoName), "、"),
      weight: sumWeights(orders.map((item) => item.weight)),
      originCity: joinSummary(orders.map((item) => item.originCity), " / "),
      destinationCity: joinSummary(orders.map((item) => item.destinationCity), " / "),
      deliveryAddress: joinSummary(orders.map((item) => item.deliveryAddress), "；"),
      receiverName: joinSummary(orders.map((item) => item.receiverName), " / "),
      receiverPhone: joinSummary(orders.map((item) => item.receiverPhone), " / "),
      mergedPlanNumber: mergedPlanValues.length === 1 ? mergedPlanValues[0] : "",
      department: joinSummary(orders.map((item) => item.department), " / "),
    },
  };
}

export function buildLtlSubchainCreatePath(
  orderOrOrders: LtlSubchainOrderSeed | LtlSubchainOrderSeed[],
  stage: LtlSubchainStage,
  returnPath = "/station/ltl-workspace",
): string {
  const orders = (Array.isArray(orderOrOrders) ? orderOrOrders : [orderOrOrders]).filter(Boolean);
  const params = new URLSearchParams();
  params.set("mode", "manual");
  params.set("subchain", "ltl_outsource");
  params.set("stage", stage);
  params.set("returnPath", returnPath || "/station/ltl-workspace");

  if (orders.length === 0) {
    return `/orders/create?${params.toString()}`;
  }

  const aggregated = aggregateSeeds(orders);
  const sourceLabel = buildSourceLabel(
    aggregated.sourceOrders,
    aggregated.parentSystemCode,
    aggregated.parentOrderNumber,
    aggregated.parentIds,
  );

  const mappings: Array<[string, string]> = [
    ["parentId", aggregated.parentIds[0] ? String(aggregated.parentIds[0]) : ""],
    ["parentIds", aggregated.parentIds.join(",")],
    ["sourceCount", String(aggregated.sourceOrders.length)],
    ["parentSystemCode", aggregated.parentSystemCode],
    ["parentOrderNumber", aggregated.parentOrderNumber],
    ["sourceOrderNumbers", aggregated.sourceOrders.map((item) => item.orderNumber).join("||")],
    ["sourceSystemCodes", aggregated.sourceOrders.map((item) => item.systemCode).join("||")],
    ["customerName", aggregated.defaults.customerName],
    ["customerPhone", aggregated.defaults.customerPhone],
    ["settlementType", aggregated.defaults.settlementType],
    ["cargoName", aggregated.defaults.cargoName],
    ["weight", aggregated.defaults.weight],
    ["originCity", aggregated.defaults.originCity],
    ["destinationCity", aggregated.defaults.destinationCity],
    ["deliveryAddress", aggregated.defaults.deliveryAddress],
    ["receiverName", aggregated.defaults.receiverName],
    ["receiverPhone", aggregated.defaults.receiverPhone],
    ["mergedPlanNumber", aggregated.defaults.mergedPlanNumber],
    ["department", aggregated.defaults.department],
    ["sourceLabel", sourceLabel],
  ];

  for (const [key, value] of mappings) {
    if (value) params.set(key, value);
  }

  return `/orders/create?${params.toString()}`;
}

export function parseLtlSubchainSearch(search: string): LtlSubchainPrefill | null {
  const params = normalizeSearch(search);
  if (params.get("subchain") !== "ltl_outsource") return null;

  const rawStage = params.get("stage");
  if (rawStage !== "pickup" && rawStage !== "delivery") return null;

  const parentIds = parseNumberList(cleanText(params.get("parentIds")));
  const fallbackParentIdValue = cleanText(params.get("parentId"));
  const fallbackParentId = fallbackParentIdValue ? Number(fallbackParentIdValue) : NaN;
  const normalizedParentIds = parentIds.length > 0
    ? parentIds
    : Number.isFinite(fallbackParentId)
      ? [fallbackParentId]
      : [];

  const sourceOrderNumbers = parseList(cleanText(params.get("sourceOrderNumbers")));
  const sourceSystemCodes = parseList(cleanText(params.get("sourceSystemCodes")));
  const sourceOrders: LtlSubchainSourceOrder[] = Array.from({ length: Math.max(sourceOrderNumbers.length, sourceSystemCodes.length, normalizedParentIds.length, 1) })
    .map((_, index) => ({
      id: normalizedParentIds[index],
      systemCode: sourceSystemCodes[index] || "",
      orderNumber: sourceOrderNumbers[index] || sourceSystemCodes[index] || "",
    }))
    .filter((item, index) => Boolean(item.orderNumber || item.systemCode || normalizedParentIds[index]));

  const parentId = normalizedParentIds[0];
  const parentSystemCode = cleanText(params.get("parentSystemCode")) || sourceOrders[0]?.systemCode || "";
  const parentOrderNumber = cleanText(params.get("parentOrderNumber")) || sourceOrders[0]?.orderNumber || "";
  const sourceLabel = cleanText(params.get("sourceLabel")) || buildSourceLabel(sourceOrders, parentSystemCode, parentOrderNumber, normalizedParentIds);
  const stageLabel = STAGE_LABELS[rawStage];
  const returnPath = cleanText(params.get("returnPath")) || "/station/ltl-workspace";
  const isCombinedLoad = sourceOrders.length > 1 || normalizedParentIds.length > 1;
  const sourceCount = Math.max(sourceOrders.length, normalizedParentIds.length, Number(params.get("sourceCount") || 0), 1);

  const helperText = rawStage === "pickup"
    ? isCombinedLoad
      ? "当前将把多个零担主单合并为同一条前段外请子链。提交后，合车提货链会直接进入外请待定价队列，由外请调度按同车统一报价与派车。"
      : "当前将从零担主链发起前段外请子链。提交后，子链会直接进入外请待定价队列，由外请调度继续处理提货到货站动作。"
    : isCombinedLoad
      ? "当前将把多个零担主单合并为同一条后段外请子链。提交后，合车配送链会直接进入外请待定价队列，用于统一处理目的站送货、预约卸货或末端配送。"
      : "当前将从零担主链发起后段外请子链。提交后，子链会直接进入外请待定价队列，用于承接目的站送货、预约卸货或末端配送。";

  const queueHint = rawStage === "pickup"
    ? isCombinedLoad
      ? "建议在提交前复核各主单的提货地址、接入货站与吨位汇总，确保同车合单询价不会遗漏任何来源主单。"
      : "建议在提交前复核前段承运范围、接货地址与预计接入货站，避免把主链长途线路直接带入前段价格。"
    : isCombinedLoad
      ? "建议在提交前复核各主单的目的站送货范围、预约要求与收货信息，确保后段合车外请与零担主链回写保持一致。"
      : "建议在提交前复核目的站送货范围、预约要求与收货人信息，确保后段外请与零担主链收货确认保持一致。";

  return {
    stage: rawStage,
    stageLabel,
    sourceLabel,
    sourceCount,
    isCombinedLoad,
    sourceOrders,
    parentId,
    parentIds: normalizedParentIds,
    parentSystemCode,
    parentOrderNumber,
    returnPath,
    helperText,
    queueHint,
    defaults: {
      businessType: "outsource",
      orderNumber: buildDefaultOrderNumber(sourceOrders, rawStage, normalizedParentIds),
      customerName: cleanText(params.get("customerName")),
      customerPhone: cleanText(params.get("customerPhone")),
      settlementType: parseSettlementType(cleanText(params.get("settlementType"))),
      cargoName: cleanText(params.get("cargoName")),
      weight: cleanText(params.get("weight")),
      originCity: cleanText(params.get("originCity")),
      destinationCity: cleanText(params.get("destinationCity")),
      deliveryAddress: cleanText(params.get("deliveryAddress")),
      receiverName: cleanText(params.get("receiverName")),
      receiverPhone: cleanText(params.get("receiverPhone")),
      mergedPlanNumber: cleanText(params.get("mergedPlanNumber")),
      department: cleanText(params.get("department")),
      remarks: buildDefaultRemarks(rawStage, sourceLabel, sourceOrders, normalizedParentIds),
      shippingNote: buildDefaultShippingNote(rawStage, sourceLabel, sourceOrders),
    },
  };
}
