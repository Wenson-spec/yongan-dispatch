import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const podRouterSource = fs.readFileSync(path.join(projectRoot, "server/routers/pod.ts"), "utf8");
const orderRouterSource = fs.readFileSync(path.join(projectRoot, "server/routers/order.ts"), "utf8");

type DepositStatus = "none" | "paid" | "refunded" | "not_refundable";

function restoreDepositStatus(depositAmount: string | number | null | undefined, depositRefundable: boolean | null | undefined): DepositStatus {
  const numericDepositAmount = Number(depositAmount ?? 0);
  if (!Number.isFinite(numericDepositAmount) || numericDepositAmount <= 0) {
    return "none";
  }
  return depositRefundable === false ? "not_refundable" : "paid";
}

describe("回单回退后的押金状态复原回归", () => {
  it("从财务已收原件退回到寄出/待寄出时，应把已退押金复原为待退押金", () => {
    expect(restoreDepositStatus("300", true)).toBe("paid");
    expect(restoreDepositStatus(300, true)).toBe("paid");
  });

  it("原本标记为不退押金的订单在回退后，应保留不退押金口径", () => {
    expect(restoreDepositStatus("300", false)).toBe("not_refundable");
  });

  it("没有有效押金金额的订单在回退后，不应伪造出待退押金状态", () => {
    expect(restoreDepositStatus("0", true)).toBe("none");
    expect(restoreDepositStatus(null, true)).toBe("none");
  });

  it("回单路由在 originalStatus 从 received 回退时，应同步清空订单侧已退押金状态与退押时间", () => {
    expect(podRouterSource).toContain('if (originalStatus !== "received" && orderRow[0].depositStatus === "refunded")');
    expect(podRouterSource).toContain('orderUpdateData.depositStatus = resolvePendingDepositStatus(orderRow[0].depositAmount, orderRow[0].depositRefundable);');
    expect(podRouterSource).toContain('orderUpdateData.depositRefundDate = null;');
    expect(podRouterSource).toContain('depositRefunded: false,');
  });

  it("订单退回上一步时，应同步撤销 podRecords.depositRefunded，避免找车台误落入押金已处理", () => {
    expect(orderRouterSource).toContain('if ((STATUS_STAGE[currentStatus] ?? -1) >= 9 && (STATUS_STAGE[previousStatus] ?? -1) < 9 && order.depositStatus === "refunded")');
    expect(orderRouterSource).toContain('rollbackClean.depositStatus = !Number.isFinite(numericDepositAmount) || numericDepositAmount <= 0');
    expect(orderRouterSource).toContain('rollbackClean.depositRefundDate = null;');
    expect(orderRouterSource).toContain('await tx.update(podRecords).set({ depositRefunded: false }).where(eq(podRecords.orderId, input.id));');
    expect(orderRouterSource).toContain('await tx.update(podRecords).set({ depositRefunded: false }).where(eq(podRecords.orderId, id));');
  });
});
