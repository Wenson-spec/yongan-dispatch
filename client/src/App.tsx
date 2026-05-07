import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";

// 工位页面
import EntryStation from "./pages/EntryStation";
import CommandCenter from "./pages/CommandCenter";
import FindVehicle from "./pages/FindVehicle";
import DispatchVehicle from "./pages/DispatchVehicle";
const LtlUnifiedWorkspace = lazy(() => import("./pages/LtlUnifiedWorkspace"));
import LtlInquiryStation from "./pages/LtlInquiryStation";
import LtlWorkspace from "./pages/LtlWorkspace";
import PodDepositStation from "./pages/PodDepositStation";
import HoldStation from "./pages/HoldStation";
import AdminDashboard from "./pages/AdminDashboard";

// 原有功能页面（保留兼容）
import OrderCreate from "./pages/OrderCreate";
import OrderEdit from "./pages/OrderEdit";
import SmartPaste from "./pages/SmartPaste";
import OcrVerify from "./pages/OcrVerify";

import FreightRateDB from "./pages/FreightRateDB";

import OperationLog from "./pages/OperationLog";

// 系统设置
import CustomerManagement from "./pages/config/CustomerManagement";
import WarehouseManagement from "./pages/config/WarehouseManagement";
import StationManagement from "./pages/config/StationManagement";
import VehicleManagement from "./pages/config/VehicleManagement";
import DriverManagement from "./pages/config/DriverManagement";
import MiscConfig from "./pages/config/MiscConfig";
import RegionConfig from "./pages/config/RegionConfig";
import UserManagement from "./pages/config/UserManagement";
import PermissionConfig from "./pages/config/PermissionConfig";
import DataBackup from "./pages/DataBackup";
import UsageStats from "./pages/UsageStats";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={Home} />

      {/* ===== 流水线工位路由 ===== */}
      {/* 录单台（录单员） */}
      <Route path="/station/entry" component={EntryStation} />
      {/* 客服经理指挥台 */}
      <Route path="/station/command" component={CommandCenter} />
      {/* 外请调度员找车台 */}
      <Route path="/station/find-vehicle" component={FindVehicle} />
      {/* 车队调度员/现场管理员派车台 */}
      <Route path="/station/dispatch-vehicle" component={DispatchVehicle} />
      {/* 零担统一工作台正式入口 */}
      <Route path="/station/ltl-workspace">{() => (<Suspense fallback={<div className="p-8 text-center text-muted-foreground">加载中...</div>}><LtlUnifiedWorkspace /></Suspense>)}</Route>
      {/* 历史零担入口保留重定向兼容 */}
      <Route path="/station/ltl-inquiry" component={LtlInquiryStation} />
      <Route path="/station/chain-workspace" component={LtlWorkspace} />
      {/* 财务助理回单押金台 */}
      <Route path="/station/pod-deposit" component={PodDepositStation} />
      {/* 等通知专区 */}
      <Route path="/station/hold" component={HoldStation} />
      {/* 管理驾驶舱（管理员） */}
      <Route path="/station/admin" component={AdminDashboard} />

      {/* ===== 原有功能路由（保留兼容） ===== */}
      <Route path="/orders" component={EntryStation} />
      <Route path="/orders/create" component={OrderCreate} />
      <Route path="/orders/edit/:id" component={OrderEdit} />
      <Route path="/tools/smart-paste" component={SmartPaste} />
      <Route path="/tools/ocr-verify" component={OcrVerify} />

      <Route path="/freight-rates" component={FreightRateDB} />
      {/* 客户台账历史入口兼容到零担统一工作台 */}
      <Route path="/customer-ledger" component={LtlWorkspace} />
      <Route path="/operation-logs" component={OperationLog} />

      {/* 系统设置 */}
      <Route path="/config/customers" component={CustomerManagement} />
      <Route path="/config/warehouses" component={WarehouseManagement} />
      <Route path="/config/stations" component={StationManagement} />
      <Route path="/config/vehicles" component={VehicleManagement} />
      <Route path="/config/drivers" component={DriverManagement} />
      <Route path="/config/misc" component={MiscConfig} />
      <Route path="/config/regions" component={RegionConfig} />
      <Route path="/config/users" component={UserManagement} />
      <Route path="/config/permissions" component={PermissionConfig} />
      <Route path="/config/backup" component={DataBackup} />
      <Route path="/config/usage" component={UsageStats} />

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
