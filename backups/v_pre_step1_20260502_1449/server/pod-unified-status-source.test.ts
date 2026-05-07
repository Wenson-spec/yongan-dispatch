import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "..");
const orderRouterSource = fs.readFileSync(path.join(projectRoot, "server/routers/order.ts"), "utf8");
const adminDashboardSource = fs.readFileSync(path.join(projectRoot, "client/src/pages/AdminDashboard.tsx"), "utf8");
const findVehicleSource = fs.readFileSync(path.join(projectRoot, "client/src/pages/FindVehicle.tsx"), "utf8");

describe("外部回单统一状态源回归", () => {
  it("订单列表的有效回单状态应完全由 podRecords 投影推导", () => {
    expect(orderRouterSource).toContain('const podOriginalStatus = pod?.podOriginalStatus ?? null;');
    expect(orderRouterSource).toContain('const podDeliveryNoteUrl = pod?.podDeliveryNoteUrl ?? null;');
    expect(orderRouterSource).toContain('podOriginalStatus === "received"');
    expect(orderRouterSource).toContain('podOriginalStatus === "sent"');
    expect(orderRouterSource).toContain('podDeliveryNoteUrl');
    expect(orderRouterSource).not.toContain('item.podStatus === "uploaded"');
    expect(orderRouterSource).not.toContain('String(item.podStatus');
  });

  it("管理看板与找车台应使用统一后的职责与状态口径文案", () => {
    expect(adminDashboardSource).toContain('label: "找车台退押金处理"');
    expect(adminDashboardSource).not.toContain('label: "财务退押金执行"');
    expect(findVehicleSource).toContain('回单处理');
    expect(findVehicleSource).not.toContain('前往财务回单台');
  });
});
