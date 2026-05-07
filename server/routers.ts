import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { authRouter } from "./routers/auth";
import {
  customerRouter,
  warehouseRouter,
  freightStationRouter,
  vehicleRouter,
  driverRouter,
  departmentRouter,
  cargoTypeRouter,
  dispatcherRegionRouter,
  userRouter,
  permissionRouter,
  systemConfigRouter,
} from "./routers/config";
import { orderRouter } from "./routers/order";
import { approvalRouter } from "./routers/approval";
import { podRouter, ltlInquiryRouter } from "./routers/pod";
import { statsRouter } from "./routers/stats";
import { smartPasteRouter } from "./routers/smartPaste";
import { backupRouter } from "./routers/backup";
import { usageRouter } from "./routers/usage";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,

  // 基础配置管理
  customer: customerRouter,
  warehouse: warehouseRouter,
  freightStation: freightStationRouter,
  vehicle: vehicleRouter,
  driver: driverRouter,
  department: departmentRouter,
  cargoType: cargoTypeRouter,
  dispatcherRegion: dispatcherRegionRouter,
  user: userRouter,
  permission: permissionRouter,
  sysConfig: systemConfigRouter,

  // 核心业务
  order: orderRouter,
  approval: approvalRouter,
  pod: podRouter,
  ltlInquiry: ltlInquiryRouter,
  stats: statsRouter,
  smartPaste: smartPasteRouter,
  backup: backupRouter,
  usage: usageRouter,
});

export type AppRouter = typeof appRouter;
