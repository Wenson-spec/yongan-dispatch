import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(relativePath: string) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

describe("pod responsibility split regression", () => {
  it("keeps the merged pod-processing wording in FindVehicle", () => {
    const source = readProjectFile("client/src/pages/FindVehicle.tsx");

    expect(source).toContain('value="pod-processing"');
    expect(source).toContain("回单处理");
    expect(source).toContain("标记原件已寄出 → 等待财务确认收到 → 退还押金");
    expect(source).toContain("财务工作台仅负责确认收到回单");
    expect(source).toContain("待财务确认");
  });

  it("limits PodDepositStation to receipt confirmation and removes direct refund mutations", () => {
    const source = readProjectFile("client/src/pages/PodDepositStation.tsx");

    expect(source).toContain("财务回单确认台");
    expect(source).toContain("待调度退押金");
    expect(source).toContain("退押金请回找车台“回单处理”");
    expect(source).not.toContain("trpc.order.refundDeposit.useMutation()");
    expect(source).not.toContain("trpc.order.batchRefundDeposit.useMutation()");
    expect(source).not.toContain("按当前分组/车次退押金");
  });
});
