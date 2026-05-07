import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readProjectFile = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf-8");

const approvalHistorySource = readProjectFile("client/src/components/ApprovalHistory.tsx");

const approvalRouterSource = readProjectFile("server/routers/approval.ts");

describe("approval history grouping regression", () => {
  it("审批历史组件应展示真实审批沟通记录，并将子单信息收口为动态列表", () => {
    expect(approvalHistorySource).toContain("childOrderRefs?: ApprovalHistoryChildRef[];");
    expect(approvalHistorySource).toContain('typeof orderId === "number" ? { orderId } : skipToken');
    expect(approvalHistorySource).toContain("第二层 · 审批沟通记录");
    expect(approvalHistorySource).toContain("具体申请金额：");
    expect(approvalHistorySource).toContain("批准金额：");
    expect(approvalHistorySource).toContain("第三层 · 子单信息");
    expect(approvalHistorySource).toContain('childrenExpanded ? "收起子单信息" : "展开子单信息"');
    expect(approvalHistorySource).toContain("{childOrders.length} 个子单");
    expect(approvalHistorySource).toContain("childOrders.map((child, index) => {");
    expect(approvalHistorySource).not.toContain("子单信息默认折叠，按实际数量动态展示，展开后可查看全部子单的基础信息与参考计价。");
  });

  it("审批历史接口应仅按主单承载层订单ID查询沟通记录", () => {
    expect(approvalRouterSource).toContain("orderId: z.number(),");
    expect(approvalRouterSource).toContain(".where(eq(approvals.orderId, input.orderId))");
  });
});
