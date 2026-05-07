import { describe, expect, it } from "vitest";
import {
  appendStructuredNote,
  buildLtlPendingInquiryDisplaySummary,
  buildLtlTimeline,
  buildPodDepositRoute,
  buildStructuredNote,
  deriveLtlAnomaly,
  extractStructuredNotes,
  filterExceptionOrders,
  filterOrdersByDateRange,
  matchesDateRange,
  parsePodDepositQuery,
  summarizeLtlMonthly,
} from "./ltlWorkflow.utils";

describe("ltlWorkflow utils", () => {
  it("matchesDateRange correctly handles inclusive start and end dates", () => {
    expect(matchesDateRange("2026-04-01T10:00:00.000Z", "2026-04-01", "2026-04-01")).toBe(true);
    expect(matchesDateRange("2026-03-31T23:59:59.000Z", "2026-04-01", "2026-04-01")).toBe(false);
    expect(matchesDateRange("2026-04-02T00:00:00.000Z", "2026-04-01", "2026-04-01")).toBe(false);
  });

  it("filterOrdersByDateRange falls back to createdAt when orderDate is absent", () => {
    const items = [
      { id: 1, createdAt: "2026-04-01T08:00:00.000Z" },
      { id: 2, createdAt: "2026-04-05T08:00:00.000Z" },
      { id: 3, orderDate: "2026-04-03T08:00:00.000Z", createdAt: "2026-03-01T08:00:00.000Z" },
    ];

    const filtered = filterOrdersByDateRange(items, "2026-04-01", "2026-04-03");

    expect(filtered.map((item) => item.id)).toEqual([1, 3]);
  });

  it("buildPodDepositRoute encodes business type, keyword and dates", () => {
    expect(
      buildPodDepositRoute("pending_receipt", {
        businessType: "ltl",
        keyword: "YADT-001",
        dateFrom: "2026-04-01",
        dateTo: "2026-04-30",
      }),
    ).toBe(
      "/station/pod-deposit?tab=pending_receipt&businessType=ltl&keyword=YADT-001&dateFrom=2026-04-01&dateTo=2026-04-30",
    );
  });

  it("buildPodDepositRoute supports self monthly unreceived tab and month param", () => {
    expect(
      buildPodDepositRoute("self_monthly_unreceived", {
        businessType: "self",
        keyword: "苏A88888",
        dateFrom: "2026-04-01",
        dateTo: "2026-04-30",
        month: "2026-04",
      }),
    ).toBe(
      "/station/pod-deposit?tab=self_monthly_unreceived&businessType=self&keyword=%E8%8B%8FA88888&dateFrom=2026-04-01&dateTo=2026-04-30&month=2026-04",
    );
  });

  it("parsePodDepositQuery returns normalized preset values", () => {
    expect(
      parsePodDepositQuery("?tab=received&businessType=ltl&keyword=客户A&dateFrom=2026-04-01&dateTo=2026-04-30"),
    ).toEqual({
      tab: "received",
      businessType: "ltl",
      keyword: "客户A",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
      month: undefined,
    });
  });

  it("parsePodDepositQuery keeps self monthly unreceived month preset", () => {
    expect(
      parsePodDepositQuery("?tab=self_monthly_unreceived&businessType=self&keyword=苏A88888&dateFrom=2026-04-01&dateTo=2026-04-30&month=2026-04"),
    ).toEqual({
      tab: "self_monthly_unreceived",
      businessType: "self",
      keyword: "苏A88888",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
      month: "2026-04",
    });
  });

  it("parsePodDepositQuery ignores unsupported tab values", () => {
    expect(parsePodDepositQuery("?tab=unknown&businessType=ltl&month=2026-03")).toEqual({
      tab: undefined,
      businessType: "ltl",
      keyword: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      month: "2026-03",
    });
  });

  it("buildStructuredNote and appendStructuredNote create parseable review records", () => {
    const review = buildStructuredNote("异常复核", {
      异常等级: "红色异常",
      异常原因: "已到站48小时未签收",
      责任归属: "目的站货站",
    });
    const combined = appendStructuredNote(review, "目的站回退", {
      回退原因: "客户暂缓自提",
      责任归属: "客户",
      补充说明: "客户要求改约次日",
    });

    expect(review).toBe("【异常复核】异常等级：红色异常；异常原因：已到站48小时未签收；责任归属：目的站货站");
    expect(extractStructuredNotes(combined)).toEqual([
      {
        title: "异常复核",
        fields: {
          异常等级: "红色异常",
          异常原因: "已到站48小时未签收",
          责任归属: "目的站货站",
        },
        raw: "【异常复核】异常等级：红色异常；异常原因：已到站48小时未签收；责任归属：目的站货站",
      },
      {
        title: "目的站回退",
        fields: {
          回退原因: "客户暂缓自提",
          责任归属: "客户",
          补充说明: "客户要求改约次日",
        },
        raw: "【目的站回退】回退原因：客户暂缓自提；责任归属：客户；补充说明：客户要求改约次日",
      },
    ]);
  });

  it("buildLtlTimeline maps pickup, departure, arrival, handover and sign-off timestamps", () => {
    const timeline = buildLtlTimeline({
      dispatchDate: "2026-04-01T08:00:00.000Z",
      transitDate: "2026-04-01T18:30:00.000Z",
      deliveryDate: "2026-04-02T09:15:00.000Z",
      receivingConfirmedAt: "2026-04-02T12:00:00.000Z",
      receivingStatus: "receivable",
      signedDate: "2026-04-02T15:00:00.000Z",
      freightStationName: "西安货站",
      ltlFinalStation: "郑州目的站",
    });

    expect(timeline.map((node) => node.key)).toEqual([
      "pickup",
      "station_departure",
      "arrival",
      "handover",
      "signed",
    ]);
    expect(timeline.every((node) => node.completed)).toBe(true);
    expect(timeline[1].sourceField).toBe("transitDate");
    expect(timeline[1].hint).toBe("货站：西安货站");
    expect(timeline[2].hint).toBe("目的站：郑州目的站");
    expect(timeline[3].hint).toBe("已确认目的站自提/送货");
  });

  it("buildLtlPendingInquiryDisplaySummary returns placeholder summary when no pending inquiry orders exist", () => {
    expect(buildLtlPendingInquiryDisplaySummary([])).toEqual({
      headline: "当前暂无待询价执行结果",
      chips: ["目的站待补", "货站待补", "车次待补"],
      detail: "零担待询价页优先展示目的站、货站与后续车次等内部整理执行结果；参考批次仅用于内部对照，不作为正式外请分组。",
      emphasisLabel: "内部执行结果优先",
    });
  });

  it("buildLtlPendingInquiryDisplaySummary prioritizes vehicle execution details over reference batch", () => {
    const summary = buildLtlPendingInquiryDisplaySummary([
      {
        originCity: "西安",
        destinationCity: "郑州",
        ltlFinalStation: "郑州北站",
        freightStationName: "灞桥货站",
        plateNumber: "陕A12345",
        driverName: "张师傅",
        mergedPlanNumber: "MPN-001",
      },
      {
        originCity: "西安",
        destinationCity: "洛阳",
        ltlFinalStation: "洛阳东站",
        freightStationName: "灞桥货站",
        plateNumber: "陕A12345",
        driverName: "张师傅",
        mergedPlanNumber: "MPN-002",
      },
    ]);

    expect(summary.emphasisLabel).toBe("车次结果优先");
    expect(summary.headline).toBe("车次执行：陕A12345 / 张师傅");
    expect(summary.chips).toEqual(expect.arrayContaining([
      "起点：西安",
      "去向：郑州北站、洛阳东站",
      "货站：灞桥货站",
      "车号：陕A12345",
      "司机：张师傅",
    ]));
    expect(summary.detail).toContain("当前纯零担询价会优先按车次执行结果整理");
    expect(summary.detail).toContain("参考批次：MPN-001、MPN-002");
    expect(summary.detail).toContain("不作为正式外请分组");
  });

  it("deriveLtlAnomaly marks overdue arrival and manual review as critical anomalies", () => {
    const anomaly = deriveLtlAnomaly(
      {
        status: "delivered",
        deliveryDate: "2026-04-01T08:00:00.000Z",
        dispatchDate: "2026-03-30T08:00:00.000Z",
        dispatcherRemark: "【异常复核】异常等级：红色异常；异常原因：到站后长期未完成签收；责任归属：目的站货站",
      },
      new Date("2026-04-03T12:00:00.000Z"),
    );

    expect(anomaly.level).toBe("critical");
    expect(anomaly.label).toBe("红色异常");
    expect(anomaly.needsManualReview).toBe(true);
    expect(anomaly.reasons).toEqual(expect.arrayContaining([
      "已到站超过48小时未签收",
      "人工复核：到站后长期未完成签收",
    ]));
    expect(anomaly.latestReview?.fields["责任归属"]).toBe("目的站货站");
  });

  it("filterExceptionOrders keeps only warning and critical orders when enabled", () => {
    const items = [
      { id: 1, status: "signed", signedDate: "2026-04-01T10:00:00.000Z" },
      { id: 2, status: "delivered", deliveryDate: "2026-04-01T10:00:00.000Z" },
    ];

    const filtered = filterExceptionOrders(items, true, new Date("2026-04-03T12:00:00.000Z"));

    expect(filtered).toHaveLength(1);
    expect((filtered[0] as { id: number }).id).toBe(2);
  });

  it("summarizeLtlMonthly groups by dimension and accumulates exception metrics", () => {
    const rows = summarizeLtlMonthly(
      [
        {
          status: "signed",
          signedDate: "2026-04-12T10:00:00.000Z",
          customerName: "客户甲",
          ltlFinalStation: "郑州目的站",
          freightStationName: "西安货站",
          actualFreight: "1200",
          totalCost: "1500",
          ltlDeliveryFee: "300",
        },
        {
          status: "delivered",
          deliveryDate: "2026-04-10T10:00:00.000Z",
          customerName: "客户甲",
          ltlFinalStation: "郑州目的站",
          freightStationName: "西安货站",
          actualFreight: "800",
          totalCost: "1000",
          ltlDeliveryFee: "200",
        },
        {
          status: "signed",
          signedDate: "2026-03-05T10:00:00.000Z",
          customerName: "客户乙",
          ltlFinalStation: "洛阳目的站",
          freightStationName: "宝鸡货站",
          actualFreight: "600",
          totalCost: "900",
          ltlDeliveryFee: "120",
        },
      ],
      "destination_station",
      new Date("2026-04-13T12:00:00.000Z"),
    );

    expect(rows[0]).toMatchObject({
      month: "2026-04",
      groupBy: "destination_station",
      groupValue: "郑州目的站",
      orderCount: 2,
      signedCount: 1,
      exceptionCount: 1,
      normalCount: 1,
      totalFreight: 2000,
      totalCost: 2500,
      totalDeliveryFee: 500,
    });
    expect(rows[1]).toMatchObject({
      month: "2026-03",
      groupValue: "洛阳目的站",
      orderCount: 1,
      signedCount: 1,
      exceptionCount: 0,
    });
  });
});
