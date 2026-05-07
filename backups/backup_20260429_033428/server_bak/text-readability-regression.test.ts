import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath: string) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

const readabilityTokens = [
  "text-wrap-safe",
  "text-wrap-keep-linebreaks",
  "table-cell-readable",
  "table-text-compact",
  "field-stack-readable",
  "field-label-muted",
  "field-value-readable",
  "note-panel-readable",
] as const;

const priorityPages = [
  {
    name: "找车台",
    path: "client/src/pages/FindVehicle.tsx",
  },
  {
    name: "指挥台",
    path: "client/src/pages/CommandCenter.tsx",
  },
  {
    name: "录单台",
    path: "client/src/pages/EntryStation.tsx",
  },
  {
    name: "派车台",
    path: "client/src/pages/DispatchVehicle.tsx",
  },
] as const;

const approvalSummaryPages = [
  {
    name: "找车台待审批详情区",
    path: "client/src/pages/FindVehicle.tsx",
  },
  {
    name: "指挥台待审批详情区",
    path: "client/src/pages/CommandCenter.tsx",
  },
] as const;

const approvalSectionMarkers = [
  "第一层 · 组合主单摘要",
  "客户",
  "货物简称",
  "发货仓库",
  "收货地址",
  "重量",
  "收货备注",
  "发货备注",
] as const;

const legacyApprovalMarkers = [
  "第一层 · 主单基本信息",
  "第二层 · 主单决策卡",
  "第二层 · 补充说明",
  "第四层 · 两个子单基本信息",
  "流转背景",
  "主单号",
  "主单承接审批",
  "应收运费金额",
  "定价金额",
  "申请金额",
  "当前组合待审批申请总额",
  "展开后查看",
] as const;

describe("long-text readability rollout", () => {
  it("defines the shared readability utilities in global styles", () => {
    const css = readProjectFile("client/src/index.css");

    readabilityTokens.forEach((token) => {
      expect(css).toContain(token);
    });
  });

  it.each(priorityPages)("applies shared readability helpers in $name", ({ path }) => {
    const source = readProjectFile(path);
    const usedTokens = readabilityTokens.filter((token) => source.includes(token));

    expect(usedTokens.length).toBeGreaterThan(0);
  });

  it.each(approvalSummaryPages)("implements the approved approval summary layout in $name", ({ path }) => {
    const source = readProjectFile(path);

    approvalSectionMarkers.forEach((marker) => {
      expect(source).toContain(marker);
    });

    expect(source).toContain("<ApprovalHistory");
  });

  it.each(approvalSummaryPages)("removes legacy approval detail layers in $name", ({ path }) => {
    const source = readProjectFile(path);

    legacyApprovalMarkers.forEach((marker) => {
      expect(source).not.toContain(marker);
    });

    expect(source).toContain("childOrderRefs={isGroupSummary ? summarySourceItems.map((currentItem) => ({");
  });
});
