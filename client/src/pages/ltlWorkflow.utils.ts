export type MaybeDate = string | number | Date | null | undefined;

export type DateScopedItem = {
  orderDate?: MaybeDate;
  createdAt?: MaybeDate;
};

export type PodDepositTab = "overdue_monitor" | "pending_receipt" | "received" | "self_monthly_unreceived";
export type LtlTimelineNodeKey = "pickup" | "station_departure" | "arrival" | "handover" | "signed";
export type LtlAnomalyLevel = "none" | "warning" | "critical";
export type LtlMonthlyGroupBy = "destination_station" | "freight_station" | "customer";

export type LtlTimelineNode = {
  key: LtlTimelineNodeKey;
  label: string;
  time: Date | null;
  completed: boolean;
  sourceField: string;
  hint?: string;
};

export type StructuredNoteRecord = {
  title: string;
  fields: Record<string, string>;
  raw: string;
};

export type LtlOrderTimelineLike = DateScopedItem & {
  dispatchDate?: MaybeDate;
  loadingDate?: MaybeDate;
  transitDate?: MaybeDate;
  deliveryDate?: MaybeDate;
  signedDate?: MaybeDate;
  receivingConfirmedAt?: MaybeDate;
  receivingStatus?: string | null;
  receivingReason?: string | null;
  nextFollowUpAt?: MaybeDate;
  updatedAt?: MaybeDate;
  status?: string | null;
  isUrgent?: boolean | null;
  dispatcherRemark?: string | null;
  receivingNote?: string | null;
  remarks?: string | null;
  ltlFinalStation?: string | null;
  freightStationName?: string | null;
  customerName?: string | null;
  actualFreight?: string | number | null;
  totalCost?: string | number | null;
  ltlDeliveryFee?: string | number | null;
  deliveryFee?: string | number | null;
};

export type LtlAnomalyResult = {
  level: LtlAnomalyLevel;
  colorToken: "slate" | "amber" | "red";
  label: string;
  reasons: string[];
  needsManualReview: boolean;
  latestReview?: StructuredNoteRecord;
  latestRollback?: StructuredNoteRecord;
};

export type LtlMonthlySummaryRow = {
  month: string;
  groupBy: LtlMonthlyGroupBy;
  groupValue: string;
  orderCount: number;
  signedCount: number;
  exceptionCount: number;
  normalCount: number;
  totalFreight: number;
  totalCost: number;
  totalDeliveryFee: number;
};

export type LtlPendingInquiryDisplayLike = {
  mergedPlanNumber?: string | null;
  originCity?: string | null;
  destinationCity?: string | null;
  freightStationName?: string | null;
  ltlFinalStation?: string | null;
  plateNumber?: string | null;
  driverName?: string | null;
};

export type LtlPendingInquiryDisplaySummary = {
  headline: string;
  chips: string[];
  detail: string;
  emphasisLabel: string;
};

export function normalizeDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

const toNumber = (value: unknown) => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const diffHoursFromNow = (value: MaybeDate, now: Date) => {
  const date = normalizeDate(value);
  if (!date) return 0;
  return (now.getTime() - date.getTime()) / 3600000;
};

const getMonthKey = (value: MaybeDate) => {
  const date = normalizeDate(value);
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
};

export function matchesDateRange(value: unknown, startDate?: string, endDate?: string) {
  const current = normalizeDate(value);
  if (!current) return !startDate && !endDate;

  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    if (current < start) return false;
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    if (current > end) return false;
  }

  return true;
}

export function filterOrdersByDateRange<T extends DateScopedItem>(items: T[], startDate?: string, endDate?: string) {
  if (!startDate && !endDate) return items;
  return items.filter((item) => matchesDateRange(item.orderDate ?? item.createdAt, startDate, endDate));
}

export function buildPodDepositRoute(
  tab: PodDepositTab,
  options?: {
    businessType?: string;
    keyword?: string;
    dateFrom?: string;
    dateTo?: string;
    month?: string;
  },
) {
  const params = new URLSearchParams();
  params.set("tab", tab);
  params.set("businessType", options?.businessType || "ltl");
  if (options?.keyword) params.set("keyword", options.keyword);
  if (options?.dateFrom) params.set("dateFrom", options.dateFrom);
  if (options?.dateTo) params.set("dateTo", options.dateTo);
  if (options?.month) params.set("month", options.month);
  return `/station/pod-deposit?${params.toString()}`;
}

export function parsePodDepositQuery(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const tab = params.get("tab");
  const businessType = params.get("businessType");
  const keyword = params.get("keyword");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const month = params.get("month");

  return {
    tab: tab === "overdue_monitor" || tab === "pending_receipt" || tab === "received" || tab === "self_monthly_unreceived" ? tab : undefined,
    businessType: businessType || undefined,
    keyword: keyword || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    month: month || undefined,
  };
}

export function buildStructuredNote(title: string, fields: Record<string, unknown>) {
  const segments = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([key, value]) => `${key}：${String(value).replace(/\s+/g, " ").trim()}`);

  return segments.length > 0 ? `【${title}】${segments.join("；")}` : `【${title}】`;
}

export function appendStructuredNote(existing: string | null | undefined, title: string, fields: Record<string, unknown>) {
  const nextLine = buildStructuredNote(title, fields);
  const base = (existing || "").trim();
  return base ? `${base}\n${nextLine}` : nextLine;
}

export function extractStructuredNotes(text?: string | null): StructuredNoteRecord[] {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^【([^】]+)】(.*)$/);
      if (!match) return null;
      const [, title, rawFields] = match;
      const fields = rawFields
        .split("；")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .reduce<Record<string, string>>((acc, segment) => {
          const dividerIndex = segment.indexOf("：");
          if (dividerIndex === -1) return acc;
          const key = segment.slice(0, dividerIndex).trim();
          const value = segment.slice(dividerIndex + 1).trim();
          if (key && value) acc[key] = value;
          return acc;
        }, {});
      return { title, fields, raw: line } satisfies StructuredNoteRecord;
    })
    .filter((item): item is StructuredNoteRecord => Boolean(item));
}

export function findLatestStructuredNote(title: string, texts: Array<string | null | undefined>) {
  const all = texts.flatMap((text) => extractStructuredNotes(text));
  const matched = all.filter((item) => item.title === title);
  return matched.length > 0 ? matched[matched.length - 1] : undefined;
}

export function buildLtlTimeline(order: LtlOrderTimelineLike): LtlTimelineNode[] {
  const stationDepartureTime = normalizeDate(order.transitDate) ?? normalizeDate(order.loadingDate);
  const handoverHint = order.receivingStatus === "wait_notice"
    ? "已记录等通知"
    : order.receivingStatus === "not_receivable"
      ? "已记录暂不收货"
      : order.receivingStatus === "receivable"
        ? "已确认目的站自提/送货"
        : undefined;

  return [
    {
      key: "pickup",
      label: "提货",
      time: normalizeDate(order.dispatchDate),
      completed: Boolean(normalizeDate(order.dispatchDate)),
      sourceField: "dispatchDate",
      hint: "按已调度/提货完成时间显示",
    },
    {
      key: "station_departure",
      label: "进站发运",
      time: stationDepartureTime,
      completed: Boolean(stationDepartureTime),
      sourceField: normalizeDate(order.transitDate) ? "transitDate" : "loadingDate",
      hint: order.freightStationName ? `货站：${order.freightStationName}` : undefined,
    },
    {
      key: "arrival",
      label: "到站",
      time: normalizeDate(order.deliveryDate),
      completed: Boolean(normalizeDate(order.deliveryDate)),
      sourceField: "deliveryDate",
      hint: order.ltlFinalStation ? `目的站：${order.ltlFinalStation}` : undefined,
    },
    {
      key: "handover",
      label: "自提/送货",
      time: normalizeDate(order.receivingConfirmedAt),
      completed: Boolean(normalizeDate(order.receivingConfirmedAt)),
      sourceField: "receivingConfirmedAt",
      hint: handoverHint,
    },
    {
      key: "signed",
      label: "签收",
      time: normalizeDate(order.signedDate),
      completed: Boolean(normalizeDate(order.signedDate)),
      sourceField: "signedDate",
    },
  ];
}

const uniqueNonEmpty = (values: Array<unknown>) => Array.from(new Set(
  values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean),
));

export function buildLtlPendingInquiryDisplaySummary(items: LtlPendingInquiryDisplayLike[]): LtlPendingInquiryDisplaySummary {
  if (!items.length) {
    return {
      headline: "当前暂无待询价执行结果",
      chips: ["目的站待补", "货站待补", "车次待补"],
      detail: "零担待询价页优先展示目的站、货站与后续车次等内部整理执行结果；参考批次仅用于内部对照，不作为正式外请分组。",
      emphasisLabel: "内部执行结果优先",
    };
  }

  const origins = uniqueNonEmpty(items.map((item) => item.originCity));
  const destinations = uniqueNonEmpty(items.map((item) => item.ltlFinalStation || item.destinationCity));
  const stations = uniqueNonEmpty(items.map((item) => item.freightStationName));
  const plates = uniqueNonEmpty(items.map((item) => item.plateNumber));
  const drivers = uniqueNonEmpty(items.map((item) => item.driverName));
  const mergedPlans = uniqueNonEmpty(items.map((item) => item.mergedPlanNumber));

  const originLabel = origins.join("、") || "起点待补";
  const destinationLabel = destinations.join("、") || "目的站待补";
  const stationLabel = stations.join("、");
  const plateLabel = plates.join("、");
  const driverLabel = drivers.join("、");

  let headline = `线路执行：${originLabel} → ${destinationLabel}`;
  let emphasisLabel = "线路结果优先";

  if (plateLabel) {
    emphasisLabel = "车次结果优先";
    headline = driverLabel ? `车次执行：${plateLabel} / ${driverLabel}` : `车次执行：${plateLabel}`;
  } else if (stationLabel) {
    emphasisLabel = "货站结果优先";
    headline = `货站执行：${stationLabel}`;
  } else if (destinationLabel !== "目的站待补") {
    emphasisLabel = "目的站结果优先";
    headline = `目的站执行：${destinationLabel}`;
  }

  const chips = [
    `起点：${originLabel}`,
    destinationLabel === "目的站待补" ? destinationLabel : `去向：${destinationLabel}`,
    stationLabel ? `货站：${stationLabel}` : "货站待补",
    plateLabel ? `车号：${plateLabel}` : "车次待补",
  ];

  if (driverLabel) {
    chips.push(`司机：${driverLabel}`);
  }

  const detailPrefix = plateLabel
    ? "当前纯零担询价会优先按车次执行结果整理，后续继续沿用车次与货站信息推进。"
    : stationLabel
      ? "当前纯零担询价会优先按货站执行结果整理，后续继续沿用货站与车次信息推进。"
      : destinationLabel !== "目的站待补"
        ? "当前纯零担询价会先按目的站整理执行结果，再补齐货站与车次信息。"
        : "当前纯零担询价先按线路整理执行结果，待补齐货站与车次后继续推进。";

  const detail = mergedPlans.length > 0
    ? `${detailPrefix} 参考批次：${mergedPlans.join("、")}，仅用于内部对照，不作为正式外请分组。`
    : `${detailPrefix} 当前未形成参考批次；本区展示的是内部整理执行结果，不作为正式外请分组。`;

  return {
    headline,
    chips,
    detail,
    emphasisLabel,
  };
}

export function deriveLtlAnomaly(order: LtlOrderTimelineLike, now = new Date()): LtlAnomalyResult {
  const reasons: string[] = [];
  let severityRank = 0;

  const pushReason = (reason: string, nextLevel: Exclude<LtlAnomalyLevel, "none">) => {
    reasons.push(reason);
    severityRank = Math.max(severityRank, nextLevel === "critical" ? 2 : 1);
  };

  const latestReview = findLatestStructuredNote("异常复核", [order.dispatcherRemark, order.receivingNote, order.remarks]);
  const latestRollback = findLatestStructuredNote("目的站回退", [order.dispatcherRemark, order.receivingNote, order.remarks]);

  if (order.receivingStatus === "not_receivable") {
    pushReason(`暂不收货${order.receivingReason ? `：${order.receivingReason}` : ""}`, "critical");
  }

  if (order.receivingStatus === "wait_notice") {
    const overdue = normalizeDate(order.nextFollowUpAt) && normalizeDate(order.nextFollowUpAt)!.getTime() < now.getTime();
    pushReason(overdue ? "等通知且已到跟进时间" : "等通知待跟进", overdue ? "critical" : "warning");
  }

  const dispatchWaitHours = diffHoursFromNow(order.dispatchDate, now);
  const departureTime = normalizeDate(order.transitDate) ?? normalizeDate(order.loadingDate);
  if (!departureTime && normalizeDate(order.dispatchDate) && ["dispatched", "in_transit", "delivered", "signed", "settled"].includes(order.status || "")) {
    if (dispatchWaitHours >= 48) {
      pushReason("已提货超过48小时仍未记录进站发运", "critical");
    } else if (dispatchWaitHours >= 24) {
      pushReason("已提货超过24小时仍未记录进站发运", "warning");
    }
  }

  const arrivalWaitHours = diffHoursFromNow(order.deliveryDate, now);
  if (!normalizeDate(order.signedDate) && normalizeDate(order.deliveryDate) && ["delivered", "signed", "settled"].includes(order.status || "")) {
    if (arrivalWaitHours >= 48) {
      pushReason("已到站超过48小时未签收", "critical");
    } else if (arrivalWaitHours >= 24) {
      pushReason("已到站超过24小时未签收", "warning");
    }
  }

  const inTransitHours = diffHoursFromNow(order.transitDate ?? order.loadingDate ?? order.dispatchDate, now);
  if (!normalizeDate(order.deliveryDate) && ["shipped", "in_transit"].includes(order.status || "")) {
    if (inTransitHours >= 72) {
      pushReason("发运后超过72小时仍未记录到站", "critical");
    } else if (inTransitHours >= 36) {
      pushReason("发运后超过36小时仍未记录到站", "warning");
    }
  }

  if (order.isUrgent && !normalizeDate(order.signedDate) && diffHoursFromNow(order.orderDate ?? order.createdAt ?? order.updatedAt, now) >= 24) {
    pushReason("加急单超过24小时仍未签收", "warning");
  }

  if (latestReview) {
    const reviewLevel = latestReview.fields["等级"] || latestReview.fields["异常等级"];
    const reviewReason = latestReview.fields["原因"] || latestReview.fields["异常原因"] || latestReview.fields["结论"];
    if (reviewLevel?.includes("红")) {
      pushReason(reviewReason ? `人工复核：${reviewReason}` : "人工复核标记为红色异常", "critical");
    } else {
      pushReason(reviewReason ? `人工复核：${reviewReason}` : "人工复核标记为异常", "warning");
    }
  }

  if (latestRollback) {
    const rollbackReason = latestRollback.fields["原因"] || latestRollback.fields["回退原因"];
    pushReason(rollbackReason ? `存在目的站回退：${rollbackReason}` : "存在目的站回退记录", "warning");
  }

  const level: LtlAnomalyLevel = severityRank >= 2 ? "critical" : severityRank === 1 ? "warning" : "none";
  const label = level === "critical" ? "红色异常" : level === "warning" ? "橙色关注" : "正常";
  const colorToken = level === "critical" ? "red" : level === "warning" ? "amber" : "slate";

  return {
    level,
    colorToken,
    label,
    reasons,
    needsManualReview: level !== "none",
    latestReview,
    latestRollback,
  };
}

const resolveMonthlyGroupValue = (item: LtlOrderTimelineLike, groupBy: LtlMonthlyGroupBy) => {
  if (groupBy === "destination_station") return item.ltlFinalStation?.trim() || "未填目的站";
  if (groupBy === "freight_station") return item.freightStationName?.trim() || "未填货站";
  return item.customerName?.trim() || "未填客户";
};

export function summarizeLtlMonthly(items: LtlOrderTimelineLike[], groupBy: LtlMonthlyGroupBy, now = new Date()): LtlMonthlySummaryRow[] {
  const bucket = new Map<string, LtlMonthlySummaryRow>();

  for (const item of items) {
    const month = getMonthKey(item.signedDate ?? item.deliveryDate ?? item.orderDate ?? item.createdAt ?? item.updatedAt);
    if (!month) continue;
    const groupValue = resolveMonthlyGroupValue(item, groupBy);
    const mapKey = `${month}__${groupBy}__${groupValue}`;
    const anomaly = deriveLtlAnomaly(item, now);

    if (!bucket.has(mapKey)) {
      bucket.set(mapKey, {
        month,
        groupBy,
        groupValue,
        orderCount: 0,
        signedCount: 0,
        exceptionCount: 0,
        normalCount: 0,
        totalFreight: 0,
        totalCost: 0,
        totalDeliveryFee: 0,
      });
    }

    const summary = bucket.get(mapKey)!;
    summary.orderCount += 1;
    if (["signed", "settled"].includes(item.status || "") || normalizeDate(item.signedDate)) summary.signedCount += 1;
    if (anomaly.level === "none") summary.normalCount += 1;
    else summary.exceptionCount += 1;
    summary.totalFreight += toNumber(item.actualFreight);
    summary.totalCost += toNumber(item.totalCost);
    summary.totalDeliveryFee += toNumber(item.ltlDeliveryFee ?? item.deliveryFee);
  }

  return Array.from(bucket.values()).sort((a, b) => {
    if (a.month === b.month) {
      if (b.exceptionCount === a.exceptionCount) return a.groupValue.localeCompare(b.groupValue, "zh-CN");
      return b.exceptionCount - a.exceptionCount;
    }
    return b.month.localeCompare(a.month, "zh-CN");
  });
}

export function filterExceptionOrders(items: LtlOrderTimelineLike[], exceptionOnly: boolean, now = new Date()) {
  if (!exceptionOnly) return items;
  return items.filter((item) => deriveLtlAnomaly(item, now).level !== "none");
}
