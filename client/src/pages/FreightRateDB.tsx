import DashboardLayout from "@/components/DashboardLayout";
import { fmtDate } from "@/lib/dateUtils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  RefreshCw,
  Download,
  Database,
  Eye,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Package,
  FileSpreadsheet,
  TrendingUp,
  Minus,
  Plus,
  X,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { TablePagination } from "@/components/TablePagination";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const TIER_LABELS = [
  "0-0.5吨",
  "0.5-5吨",
  "5-15吨",
  "15-30吨",
  "30吨以上",
];

const TIER_OPTIONS = [
  { value: "tier1", label: "500kg以下" },
  { value: "tier2", label: "0.5-5吨" },
  { value: "tier3", label: "5-15吨" },
  { value: "tier4", label: "15-30吨" },
  { value: "tier5", label: "30吨以上" },
];

const CHART_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#ea580c", "#9333ea",
];

// 涨跌幅标识组件
function ChangeIndicator({ value, type }: { value: number | null | undefined; type: 'mom' | 'yoy' }) {
  if (value === null || value === undefined) return null;
  if (value > 0) {
    return (
      <span className="inline-flex items-center text-[10px] text-red-500 ml-0.5" title={`${type === 'mom' ? '环比' : '同比'}上涨${value}%`}>
        <ArrowUpRight className="h-2.5 w-2.5" />{Math.abs(value)}%
      </span>
    );
  } else if (value < 0) {
    return (
      <span className="inline-flex items-center text-[10px] text-green-600 ml-0.5" title={`${type === 'mom' ? '环比' : '同比'}下降${Math.abs(value)}%`}>
        <ArrowDownRight className="h-2.5 w-2.5" />{Math.abs(value)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[10px] text-gray-400 ml-0.5" title={`${type === 'mom' ? '环比' : '同比'}持平`}>
      <Minus className="h-2.5 w-2.5" />0%
    </span>
  );
}

function getMonthRange(year: number, month: number) {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { startDate, endDate };
}

export default function FreightRateDB() {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [showFullYear, setShowFullYear] = useState(false); // 按年查看模式
  const [activeTab, setActiveTab] = useState("normal");

  // 四个独立筛选
  const [originProvinceInput, setOriginProvinceInput] = useState("");
  const [originCityInput, setOriginCityInput] = useState("");
  const [destProvinceInput, setDestProvinceInput] = useState("");
  const [destCityInput, setDestCityInput] = useState("");
  const [cargoSpecInput, setCargoSpecInput] = useState("");
  const [originProvince, setOriginProvince] = useState("");
  const [originCity, setOriginCity] = useState("");
  const [destProvince, setDestProvince] = useState("");
  const [destCity, setDestCity] = useState("");
  const [cargoSpec, setCargoSpec] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [detailRoute, setDetailRoute] = useState<{ origin: string; dest: string } | null>(null);

  // 同比/环比显示模式
  const [showChangeType, setShowChangeType] = useState<'mom' | 'yoy'>('mom');
  // 分页状态
  const [normalPage, setNormalPage] = useState(1);
  const [normalPageSize, setNormalPageSize] = useState(100);
  const [slabPage, setSlabPage] = useState(1);
  const [slabPageSize, setSlabPageSize] = useState(100);
  const [slabFtlPage, setSlabFtlPage] = useState(1);
  const [slabFtlPageSize, setSlabFtlPageSize] = useState(100);

  // 趋势图状态
  const [trendTier, setTrendTier] = useState("tier5");
  const [trendMonths, setTrendMonths] = useState(6);
  const [selectedRoutes, setSelectedRoutes] = useState<Array<{ originCity: string; destinationCity: string }>>([]);

  const dateRange = useMemo(() => {
    if (showAllMonths) return {};
    if (showFullYear) {
      // 按年查看：该年1月1日到12月31日
      return {
        startDate: `${selectedYear}-01-01`,
        endDate: `${selectedYear + 1}-01-01`,
      };
    }
    const { startDate, endDate } = getMonthRange(selectedYear, selectedMonth);
    return { startDate, endDate };
  }, [selectedYear, selectedMonth, showAllMonths, showFullYear]);

  // 普通运价查询
  const normalQueryInput = useMemo(() => ({
    originProvince: originProvince || undefined,
    originCity: originCity || undefined,
    destinationProvince: destProvince || undefined,
    destinationCity: destCity || undefined,
    cargoSpec: cargoSpec || undefined,
    businessType: businessType ? businessType as any : undefined,
    ...dateRange,
  }), [originProvince, originCity, destProvince, destCity, cargoSpec, businessType, dateRange]);

  const { data: normalData, isLoading: normalLoading, refetch: refetchNormal } = trpc.stats.freightRates.useQuery(normalQueryInput);

  // 大板运价查询
  const slabQueryInput = useMemo(() => ({
    originProvince: originProvince || undefined,
    originCity: originCity || undefined,
    destinationProvince: destProvince || undefined,
    destinationCity: destCity || undefined,
    cargoSpec: cargoSpec || undefined,
    ...dateRange,
  }), [originProvince, originCity, destProvince, destCity, cargoSpec, dateRange]);

  const { data: slabData, isLoading: slabLoading, refetch: refetchSlab } = trpc.stats.largeSlabRates.useQuery(slabQueryInput);
  const { data: slabFtlData, isLoading: slabFtlLoading, refetch: refetchSlabFtl } = trpc.stats.largeSlabFtlRates.useQuery(slabQueryInput);

  // 明细查询（带月份筛选）
  const detailInput = useMemo(() => ({
    originCity: detailRoute?.origin ?? "",
    destinationCity: detailRoute?.dest ?? "",
    cargoSpec: cargoSpec || undefined,
    page: 1,
    pageSize: 100,
    ...(showAllMonths ? {} : dateRange),
  }), [detailRoute, cargoSpec, dateRange, showAllMonths]);
  const { data: detailData } = trpc.stats.freightRateDetails.useQuery(detailInput, {
    enabled: !!detailRoute,
  });

  // 可用路线列表（用于趋势图路线选择）
  const { data: availableRoutes } = trpc.stats.availableRoutes.useQuery(undefined, {
    enabled: activeTab === "trend",
  });

  // 趋势图数据查询
  const trendInput = useMemo(() => ({
    routes: selectedRoutes,
    tier: trendTier as any,
    months: trendMonths,
  }), [selectedRoutes, trendTier, trendMonths]);

  const { data: trendData, isLoading: trendLoading } = trpc.stats.freightRateTrend.useQuery(trendInput, {
    enabled: selectedRoutes.length > 0 && activeTab === "trend",
  });

  const handleSearch = () => {
    setOriginProvince(originProvinceInput);
    setOriginCity(originCityInput);
    setDestProvince(destProvinceInput);
    setDestCity(destCityInput);
    setCargoSpec(cargoSpecInput);
  };

  const handlePrevMonth = () => {
    setShowAllMonths(false);
    setShowFullYear(false);
    if (selectedMonth === 1) {
      setSelectedYear(selectedYear - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    setShowAllMonths(false);
    setShowFullYear(false);
    if (selectedMonth === 12) {
      setSelectedYear(selectedYear + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const monthLabel = showAllMonths ? "全部月份" : showFullYear ? `${selectedYear}年全年` : `${selectedYear}年${selectedMonth}月`;

  // Excel导出（普通运价，含同比/环比）
  const handleExportExcel = () => {
    if (!normalData?.items?.length) return;
    const fmtChange = (v: number | null | undefined) => v != null ? `${v > 0 ? '+' : ''}${v}%` : '';
    const wsData = [
      ["发货省", "发货市", "收货省", "收货市",
        "0-0.5吨(元/吨)", "环比", "同比",
        "0.5-5吨(元/吨)", "环比", "同比",
        "5-15吨(元/吨)", "环比", "同比",
        "15-30吨(元/吨)", "环比", "同比",
        "30吨以上(元/吨)", "环比", "同比",
        "送货费(元)", "订单数"],
      ...normalData.items.map((item: any) => [
        item.originProvince || "",
        item.originCity || "",
        item.destinationProvince || "",
        item.destinationCity || "",
        item.tier1Price ?? "", fmtChange(item.mom?.tier1), fmtChange(item.yoy?.tier1),
        item.tier2Price ?? "", fmtChange(item.mom?.tier2), fmtChange(item.yoy?.tier2),
        item.tier3Price ?? "", fmtChange(item.mom?.tier3), fmtChange(item.yoy?.tier3),
        item.tier4Price ?? "", fmtChange(item.mom?.tier4), fmtChange(item.yoy?.tier4),
        item.tier5Price ?? "", fmtChange(item.mom?.tier5), fmtChange(item.yoy?.tier5),
        item.avgDeliveryFee ?? "",
        item.orderCount,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
      { wch: 14 }, { wch: 8 }, { wch: 8 },
      { wch: 14 }, { wch: 8 }, { wch: 8 },
      { wch: 14 }, { wch: 8 }, { wch: 8 },
      { wch: 14 }, { wch: 8 }, { wch: 8 },
      { wch: 14 }, { wch: 8 }, { wch: 8 },
      { wch: 12 }, { wch: 8 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "运价数据");
    XLSX.writeFile(wb, `运价数据库_${monthLabel}_五档单价.xlsx`);
  };

  // CSV导出（普通运价）
  const handleExportCSV = () => {
    if (!normalData?.items?.length) return;
    const headers = ["发货省", "发货市", "收货省", "收货市", "0-0.5吨(元/吨)", "0.5-5吨(元/吨)", "5-15吨(元/吨)", "15-30吨(元/吨)", "30吨以上(元/吨)", "送货费(元)", "订单数"];
    const rows = normalData.items.map((item) => [
      item.originProvince || "",
      item.originCity || "",
      item.destinationProvince || "",
      item.destinationCity || "",
      item.tier1Price ?? "",
      item.tier2Price ?? "",
      item.tier3Price ?? "",
      item.tier4Price ?? "",
      item.tier5Price ?? "",
      item.avgDeliveryFee ?? "",
      item.orderCount,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `运价数据库_${monthLabel}_五档单价.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 大板运价Excel导出
  const handleExportSlabExcel = () => {
    if (!slabData?.items?.length) return;
    const wsData = [
      ["发货省", "发货市", "收货省", "收货市", "平均元/架", "平均总额", "平均架数", "订单数"],
      ...slabData.items.map((item) => [
        item.originProvince || "",
        item.originCity || "",
        item.destinationProvince || "",
        item.destinationCity || "",
        item.ltlAvgPerPackage ?? "",
        item.ltlAvgTotal ?? "",
        item.ltlAvgPackageCount ?? "",
        item.ltlCount,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 8 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "大板运价");
    XLSX.writeFile(wb, `大板运价_${monthLabel}.xlsx`);
  };

  const handleExportSlabFtlExcel = () => {
    if (!slabFtlData?.items?.length) return;
    const wsData = [
      ["发货省", "发货市", "收货省", "收货市", "平均元/吨", "平均运费", "平均计费重量", "规格摘要", "订单数"],
      ...slabFtlData.items.map((item) => [
        item.originProvince || "",
        item.originCity || "",
        item.destinationProvince || "",
        item.destinationCity || "",
        item.slabFtlAvgUnitPrice ?? "",
        item.slabFtlAvgFreight ?? "",
        item.slabFtlAvgChargeableWeight ?? "",
        item.cargoSpecSummary || "",
        item.orderCount,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 8 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "大板整车运价");
    XLSX.writeFile(wb, `大板整车运价_${monthLabel}.xlsx`);
  };

  // 大板明细弹窗状态
  const [slabDetailRoute, setSlabDetailRoute] = useState<{
    originCity: string;
    destCity: string;
    recentOrders: any[];
  } | null>(null);
  const [slabFtlDetailRoute, setSlabFtlDetailRoute] = useState<{
    originCity: string;
    destCity: string;
    recentOrders: any[];
  } | null>(null);

  const handleClearFilters = () => {
    setOriginProvinceInput(""); setOriginCityInput("");
    setDestProvinceInput(""); setDestCityInput("");
    setCargoSpecInput("");
    setOriginProvince(""); setOriginCity("");
    setDestProvince(""); setDestCity("");
    setCargoSpec("");
    setBusinessType("");
    setShowFullYear(false);
    setShowAllMonths(false);
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth() + 1);
  };

  // 路线选择器：添加路线
  const handleAddRoute = (routeLabel: string) => {
    const route = availableRoutes?.find(r => r.label === routeLabel);
    if (!route) return;
    if (selectedRoutes.some(r => r.originCity === route.originCity && r.destinationCity === route.destinationCity)) return;
    if (selectedRoutes.length >= 5) return;
    setSelectedRoutes([...selectedRoutes, { originCity: route.originCity, destinationCity: route.destinationCity }]);
  };

  const handleRemoveRoute = (idx: number) => {
    setSelectedRoutes(selectedRoutes.filter((_, i) => i !== idx));
  };

  // 趋势图数据格式化
  const chartData = useMemo(() => {
    if (!trendData?.series?.length) return [];
    const months = trendData.series[0]?.data?.map(d => d.month) || [];
    return months.map(month => {
      const point: any = { month: month.replace(/^\d{4}-/, '') + '月' };
      trendData.series.forEach((s, idx) => {
        const d = s.data.find(d => d.month === month);
        point[`route${idx}`] = d?.avgPrice ?? null;
        point[`count${idx}`] = d?.orderCount ?? 0;
      });
      return point;
    });
  }, [trendData]);

  // 从普通运价表快速添加路线到趋势图
  const handleAddRouteFromTable = (originCity: string, destinationCity: string) => {
    if (selectedRoutes.some(r => r.originCity === originCity && r.destinationCity === destinationCity)) return;
    if (selectedRoutes.length >= 5) return;
    setSelectedRoutes(prev => [...prev, { originCity, destinationCity }]);
    setActiveTab("trend");
  };

  // 未选择路线时的可用路线（过滤已选）
  const unselectedRoutes = useMemo(() => {
    if (!availableRoutes) return [];
    return availableRoutes.filter(r =>
      !selectedRoutes.some(s => s.originCity === r.originCity && s.destinationCity === r.destinationCity)
    );
  }, [availableRoutes, selectedRoutes]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            <h1 className="text-xl font-semibold">运价分析台</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { refetchNormal(); refetchSlab(); refetchSlabFtl(); }}>
              <RefreshCw className="h-4 w-4 mr-1" />
              刷新
            </Button>
          </div>
        </div>

        {/* 筛选工具栏 */}
        <div className="flex flex-wrap items-center gap-2 bg-muted/20 rounded-lg p-3 border">
          {/* 年份+月份选择器 */}
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={showAllMonths ? "all" : String(selectedYear)} onValueChange={(v) => {
              if (v === "all") { setShowAllMonths(true); setShowFullYear(false); } else { setShowAllMonths(false); setSelectedYear(Number(v)); }
            }}>
              <SelectTrigger className="h-8 w-[90px] text-xs">
                <SelectValue placeholder="年份" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部年份</SelectItem>
                {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}年</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!showAllMonths && (
              <Select value={showFullYear ? "full_year" : String(selectedMonth)} onValueChange={(v) => {
                if (v === "full_year") { setShowFullYear(true); } else { setShowFullYear(false); setSelectedMonth(Number(v)); }
              }}>
                <SelectTrigger className="h-8 w-[80px] text-xs">
                  <SelectValue placeholder="月份" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_year">全年</SelectItem>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <SelectItem key={m} value={String(m)}>{m}月</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="h-6 w-px bg-border mx-1" />

          {/* 四个独立筛选 */}
          <Input
            placeholder="发货省"
            className="h-8 w-20 text-sm"
            value={originProvinceInput}
            onChange={(e) => setOriginProvinceInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Input
            placeholder="发货市"
            className="h-8 w-20 text-sm"
            value={originCityInput}
            onChange={(e) => setOriginCityInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <span className="text-muted-foreground text-sm">→</span>
          <Input
            placeholder="收货省"
            className="h-8 w-20 text-sm"
            value={destProvinceInput}
            onChange={(e) => setDestProvinceInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Input
            placeholder="收货市"
            className="h-8 w-20 text-sm"
            value={destCityInput}
            onChange={(e) => setDestCityInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Input
            placeholder="规格"
            className="h-8 w-24 text-sm"
            value={cargoSpecInput}
            onChange={(e) => setCargoSpecInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />

          <Button variant="outline" size="sm" className="h-8" onClick={handleSearch}>
            <Search className="h-3.5 w-3.5 mr-1" />
            搜索
          </Button>

          {activeTab === "normal" && (
            <Select value={businessType} onValueChange={(v) => setBusinessType(v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue placeholder="类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="outsource">外请</SelectItem>
                <SelectItem value="ltl">零担</SelectItem>
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleClearFilters}>
            清除筛选
          </Button>
        </div>

        {/* Tabs: 普通运价 / 大板运价 / 运价趋势 */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="normal" className="gap-1">
              <Database className="h-3.5 w-3.5" />
              普通运价
              <Badge variant="secondary" className="text-[10px] ml-1">{normalData?.items?.length ?? 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="slab" className="gap-1">
              <Package className="h-3.5 w-3.5" />
              大板运价（零担）
              <Badge variant="secondary" className="text-[10px] ml-1">
                {slabData?.items?.length ?? 0}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="slab_ftl" className="gap-1">
              <Package className="h-3.5 w-3.5" />
              大板整车运价
              <Badge variant="secondary" className="text-[10px] ml-1">
                {slabFtlData?.items?.length ?? 0}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="trend" className="gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              运价趋势
            </TabsTrigger>
          </TabsList>

          {/* 普通运价Tab */}
          <TabsContent value="normal" className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">涨跌幅：</span>
                <div className="flex items-center bg-muted/30 rounded-md border p-0.5">
                  <Button
                    variant={showChangeType === 'mom' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => setShowChangeType('mom')}
                  >
                    环比
                  </Button>
                  <Button
                    variant={showChangeType === 'yoy' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => setShowChangeType('yoy')}
                  >
                    同比
                  </Button>
                </div>
                {normalData?.period && (
                  <span className="text-[10px] text-muted-foreground">
                    当前: {normalData.period}
                    {showChangeType === 'mom' ? ` | 环比: ${normalData.momPeriod || '上月'}` : ` | 同比: ${normalData.yoyPeriod || '去年同期'}`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!normalData?.items?.length}>
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  导出Excel
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!normalData?.items?.length}>
                  <Download className="h-4 w-4 mr-1" />
                  导出CSV
                </Button>
              </div>
            </div>

            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-8">#</TableHead>
                    <TableHead className="w-16">发货省</TableHead>
                    <TableHead className="w-20">发货市</TableHead>
                    <TableHead className="w-16">收货省</TableHead>
                    <TableHead className="w-20">收货市</TableHead>
                    <TableHead className="w-24 text-right">0-0.5吨<br/><span className="text-[10px] text-muted-foreground">元/吨</span></TableHead>
                    <TableHead className="w-24 text-right">0.5-5吨<br/><span className="text-[10px] text-muted-foreground">元/吨</span></TableHead>
                    <TableHead className="w-24 text-right">5-15吨<br/><span className="text-[10px] text-muted-foreground">元/吨</span></TableHead>
                    <TableHead className="w-24 text-right">15-30吨<br/><span className="text-[10px] text-muted-foreground">元/吨</span></TableHead>
                    <TableHead className="w-24 text-right">30吨以上<br/><span className="text-[10px] text-muted-foreground">元/吨</span></TableHead>
                    <TableHead className="w-20 text-right">送货费</TableHead>
                    <TableHead className="w-16 text-center">订单数</TableHead>
                    <TableHead className="w-20 text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {normalLoading ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-12 text-muted-foreground">
                        加载中...
                      </TableCell>
                    </TableRow>
                  ) : !normalData?.items?.length ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-12 text-muted-foreground">
                        {monthLabel} 暂无运价数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    normalData.items.map((item, idx) => (
                      <TableRow key={`${item.originProvince}-${item.originCity}-${item.destinationProvince}-${item.destinationCity}`} className="hover:bg-muted/30">
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="text-sm">{item.originProvince || "-"}</TableCell>
                        <TableCell className="text-sm font-medium">{item.originCity}</TableCell>
                        <TableCell className="text-sm">{item.destinationProvince || "-"}</TableCell>
                        <TableCell className="text-sm font-medium">{item.destinationCity}</TableCell>
                        {(['tier1Price', 'tier2Price', 'tier3Price', 'tier4Price', 'tier5Price'] as const).map((tierKey) => {
                          const tierNum = tierKey.replace('Price', '') as 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5';
                          const price = (item as any)[tierKey];
                          const changeVal = showChangeType === 'mom' ? (item as any).mom?.[tierNum] : (item as any).yoy?.[tierNum];
                          return (
                            <TableCell key={tierKey} className="text-right text-sm">
                              {price != null ? (
                                <div className="flex flex-col items-end">
                                  <span className="text-blue-600 font-medium">¥{price}</span>
                                  <ChangeIndicator value={changeVal} type={showChangeType} />
                                </div>
                              ) : <span className="text-muted-foreground">-</span>}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right text-sm">
                          {item.avgDeliveryFee != null ? `¥${item.avgDeliveryFee}` : "-"}
                        </TableCell>
                        <TableCell className="text-center text-sm">{item.orderCount}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              title="查看明细"
                              onClick={() => setDetailRoute({ origin: item.originCity, dest: item.destinationCity })}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-blue-500 hover:text-blue-700"
                              title="添加到趋势对比"
                              onClick={() => handleAddRouteFromTable(item.originCity, item.destinationCity)}
                            >
                              <TrendingUp className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <TablePagination total={normalData?.items?.length ?? 0} page={normalPage} pageSize={normalPageSize} onPageChange={setNormalPage} onPageSizeChange={setNormalPageSize} />
            </div>

            <div className="text-xs text-muted-foreground bg-muted/10 rounded p-2 border">
              <span className="font-medium">当前查看：{monthLabel}</span>
              <span className="ml-4">|</span>
              <span className="ml-2 font-medium">五档重量分界：</span>
              {TIER_LABELS.map((label, i) => (
                <span key={i} className="ml-2">第{i + 1}档: {label}</span>
              ))}
              <span className="ml-4">| 单价 = 运费 ÷ 重量（元/吨），取同路线同档位平均值</span>
              <span className="ml-4">| 大板订单已拆分至独立视图，不再计入普通运价</span>
            </div>
          </TabsContent>

          {/* 大板运价Tab（只统计零担大板） */}
          <TabsContent value="slab" className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                仅统计零担大板订单（1800×900及以上规格），计价方式：元/架 = 总额（运费+送货费+其他费）÷ 架数
              </div>
              <Button variant="outline" size="sm" onClick={handleExportSlabExcel} disabled={!slabData?.items?.length}>
                <FileSpreadsheet className="h-4 w-4 mr-1" />
                导出Excel
              </Button>
            </div>

            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-orange-50">
                    <TableHead className="w-8">#</TableHead>
                    <TableHead className="w-16">发货省</TableHead>
                    <TableHead className="w-20">发货市</TableHead>
                    <TableHead className="w-16">收货省</TableHead>
                    <TableHead className="w-20">收货市</TableHead>
                    <TableHead className="w-28 text-right">平均元/架<br/><span className="text-[10px] text-muted-foreground">总额÷架数</span></TableHead>
                    <TableHead className="w-24 text-right">平均总额</TableHead>
                    <TableHead className="w-20 text-right">平均架数</TableHead>
                    <TableHead className="w-16 text-center">订单数</TableHead>
                    <TableHead className="w-16 text-center">明细</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slabLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                        加载中...
                      </TableCell>
                    </TableRow>
                  ) : !slabData?.items?.length ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                        {monthLabel} 暂无零担大板运价数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    slabData.items.map((item, idx) => (
                      <TableRow key={`slab-${item.originCity}-${item.destinationCity}`} className="hover:bg-orange-50/50">
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="text-sm">{item.originProvince || "-"}</TableCell>
                        <TableCell className="text-sm font-medium">{item.originCity}</TableCell>
                        <TableCell className="text-sm">{item.destinationProvince || "-"}</TableCell>
                        <TableCell className="text-sm font-medium">{item.destinationCity}</TableCell>
                        <TableCell className="text-right">
                          {item.ltlAvgPerPackage != null ? (
                            <span className="text-orange-600 font-bold text-base">¥{item.ltlAvgPerPackage}</span>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {item.ltlAvgTotal != null ? `¥${item.ltlAvgTotal}` : "-"}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {item.ltlAvgPackageCount ?? "-"}
                        </TableCell>
                        <TableCell className="text-center text-sm">{item.ltlCount}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setSlabDetailRoute({
                              originCity: item.originCity,
                              destCity: item.destinationCity,
                              recentOrders: item.recentOrders || [],
                            })}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <TablePagination total={slabData?.items?.length ?? 0} page={slabPage} pageSize={slabPageSize} onPageChange={setSlabPage} onPageSizeChange={setSlabPageSize} />
            </div>

            <div className="text-xs text-muted-foreground bg-orange-50 rounded p-2 border border-orange-200">
              <span className="font-medium">大板运价说明：</span>
              <span className="ml-2">仅统计零担大板（1800×900及以上规格瓷砖）</span>
              <span className="ml-4">| 元/架 = (运费 + 送货费 + 其他费) ÷ 架数</span>
              <span className="ml-4">| 规格筛选支持按 cargoSpec 回看相同规格历史运价</span>
            </div>
          </TabsContent>

          <TabsContent value="slab_ftl" className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                独立统计大板整车订单，计价方式：元/吨 = 实际运费 ÷ 计费重量；如无计费重量则回退到订单重量
              </div>
              <Button variant="outline" size="sm" onClick={handleExportSlabFtlExcel} disabled={!slabFtlData?.items?.length}>
                <FileSpreadsheet className="h-4 w-4 mr-1" />
                导出Excel
              </Button>
            </div>

            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-amber-50">
                    <TableHead className="w-8">#</TableHead>
                    <TableHead className="w-16">发货省</TableHead>
                    <TableHead className="w-20">发货市</TableHead>
                    <TableHead className="w-16">收货省</TableHead>
                    <TableHead className="w-20">收货市</TableHead>
                    <TableHead className="w-24 text-right">平均元/吨</TableHead>
                    <TableHead className="w-24 text-right">平均运费</TableHead>
                    <TableHead className="w-24 text-right">平均计费重量</TableHead>
                    <TableHead className="w-32">规格摘要</TableHead>
                    <TableHead className="w-16 text-center">订单数</TableHead>
                    <TableHead className="w-16 text-center">明细</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slabFtlLoading ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                        加载中...
                      </TableCell>
                    </TableRow>
                  ) : !slabFtlData?.items?.length ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                        {monthLabel} 暂无大板整车运价数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    slabFtlData.items.map((item, idx) => (
                      <TableRow key={`slab-ftl-${item.originCity}-${item.destinationCity}`} className="hover:bg-amber-50/50">
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="text-sm">{item.originProvince || "-"}</TableCell>
                        <TableCell className="text-sm font-medium">{item.originCity}</TableCell>
                        <TableCell className="text-sm">{item.destinationProvince || "-"}</TableCell>
                        <TableCell className="text-sm font-medium">{item.destinationCity}</TableCell>
                        <TableCell className="text-right text-sm font-semibold text-amber-700">
                          {item.slabFtlAvgUnitPrice != null ? `¥${item.slabFtlAvgUnitPrice}` : "-"}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {item.slabFtlAvgFreight != null ? `¥${item.slabFtlAvgFreight}` : "-"}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {item.slabFtlAvgChargeableWeight != null ? `${item.slabFtlAvgChargeableWeight}吨` : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate" title={item.cargoSpecSummary || ""}>
                          {item.cargoSpecSummary || "-"}
                        </TableCell>
                        <TableCell className="text-center text-sm">{item.orderCount}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setSlabFtlDetailRoute({
                              originCity: item.originCity,
                              destCity: item.destinationCity,
                              recentOrders: item.recentOrders || [],
                            })}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <TablePagination total={slabFtlData?.items?.length ?? 0} page={slabFtlPage} pageSize={slabFtlPageSize} onPageChange={setSlabFtlPage} onPageSizeChange={setSlabFtlPageSize} />
            </div>

            <div className="text-xs text-muted-foreground bg-amber-50 rounded p-2 border border-amber-200">
              <span className="font-medium">大板整车运价说明：</span>
              <span className="ml-2">已从普通运价 30 吨以上档中拆分为独立视图</span>
              <span className="ml-4">| 元/吨 = 实际运费 ÷ 计费重量</span>
              <span className="ml-4">| 支持按 cargoSpec 规格筛选同规格历史整车运价</span>
            </div>
          </TabsContent>

          {/* 运价趋势Tab */}
          <TabsContent value="trend" className="space-y-4">
            {/* 趋势图控制栏 */}
            <div className="flex flex-wrap items-start gap-4 bg-blue-50/50 rounded-lg p-4 border border-blue-200">
              <div className="space-y-2 flex-1 min-w-[300px]">
                <div className="text-sm font-medium text-blue-800">选择对比路线（最多5条）</div>
                <div className="flex flex-wrap gap-2">
                  {selectedRoutes.map((route, idx) => (
                    <Badge
                      key={`${route.originCity}-${route.destinationCity}`}
                      className="text-xs px-2 py-1 gap-1"
                      style={{ backgroundColor: CHART_COLORS[idx] + '20', color: CHART_COLORS[idx], borderColor: CHART_COLORS[idx] }}
                      variant="outline"
                    >
                      <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: CHART_COLORS[idx] }} />
                      {route.originCity} → {route.destinationCity}
                      <button
                        className="ml-1 hover:bg-black/10 rounded-full p-0.5"
                        onClick={() => handleRemoveRoute(idx)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {selectedRoutes.length < 5 && (
                    <Select onValueChange={handleAddRoute}>
                      <SelectTrigger className="h-7 w-48 text-xs border-dashed">
                        <div className="flex items-center gap-1">
                          <Plus className="h-3 w-3" />
                          <span>添加路线</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {unselectedRoutes.length === 0 ? (
                          <div className="text-xs text-muted-foreground p-2">暂无可用路线</div>
                        ) : (
                          unselectedRoutes.map(r => (
                            <SelectItem key={r.label} value={r.label}>
                              {r.label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  提示：也可以在普通运价表中点击 <TrendingUp className="h-3 w-3 inline text-blue-500" /> 按钮快速添加路线
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">重量档位</div>
                  <Select value={trendTier} onValueChange={setTrendTier}>
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIER_OPTIONS.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">时间范围</div>
                  <Select value={String(trendMonths)} onValueChange={(v) => setTrendMonths(Number(v))}>
                    <SelectTrigger className="h-8 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">最近3个月</SelectItem>
                      <SelectItem value="6">最近6个月</SelectItem>
                      <SelectItem value="12">最近12个月</SelectItem>
                      <SelectItem value="24">最近24个月</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* 图表区域 */}
            {selectedRoutes.length === 0 ? (
              <div className="border rounded-lg p-12 text-center text-muted-foreground bg-muted/10">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
                <div className="text-lg font-medium mb-2">选择路线开始对比</div>
                <div className="text-sm">请从上方添加路线，或在普通运价表中点击趋势按钮快速添加</div>
              </div>
            ) : trendLoading ? (
              <div className="border rounded-lg p-12 text-center text-muted-foreground">
                加载中...
              </div>
            ) : (
              <div className="border rounded-lg p-4 bg-white">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-medium">
                    运价走势对比
                    <span className="text-muted-foreground ml-2">
                      （{trendData?.tier || ''}，最近{trendMonths}个月）
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `¥${v}`}
                    />
                    <Tooltip
                      formatter={(value: any, name: string) => {
                        const idx = parseInt(name.replace('route', ''));
                        const route = trendData?.series?.[idx];
                        return [value != null ? `¥${value}/吨` : '无数据', route?.route || ''];
                      }}
                      labelFormatter={(label) => `${label}`}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    />
                    <Legend
                      formatter={(value: string) => {
                        const idx = parseInt(value.replace('route', ''));
                        return trendData?.series?.[idx]?.route || '';
                      }}
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    {trendData?.series?.map((s, idx) => (
                      <Line
                        key={`route${idx}`}
                        type="monotone"
                        dataKey={`route${idx}`}
                        stroke={CHART_COLORS[idx]}
                        strokeWidth={2}
                        dot={{ r: 4, fill: CHART_COLORS[idx] }}
                        activeDot={{ r: 6 }}
                        connectNulls={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>

                {/* 数据明细表 */}
                <div className="mt-4 border-t pt-4">
                  <div className="text-sm font-medium mb-2">月度数据明细</div>
                  <div className="border rounded-lg overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="w-20">月份</TableHead>
                          {trendData?.series?.map((s, idx) => (
                            <TableHead key={idx} className="text-right" style={{ minWidth: 120 }}>
                              <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: CHART_COLORS[idx] }} />
                              {s.route}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {chartData.map((row, rIdx) => (
                          <TableRow key={rIdx} className="hover:bg-muted/30">
                            <TableCell className="text-sm font-medium">{row.month}</TableCell>
                            {trendData?.series?.map((_, idx) => (
                              <TableCell key={idx} className="text-right text-sm">
                                {row[`route${idx}`] != null ? (
                                  <span className="font-medium" style={{ color: CHART_COLORS[idx] }}>
                                    ¥{row[`route${idx}`]}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                                <span className="text-[10px] text-muted-foreground ml-1">
                                  ({row[`count${idx}`]}单)
                                </span>
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground bg-blue-50 rounded p-2 border border-blue-200">
              <span className="font-medium">运价趋势说明：</span>
              <span className="ml-2">按月统计各路线指定重量档位的平均运价（元/吨）</span>
              <span className="ml-4">| 可选择最多5条路线横向对比</span>
              <span className="ml-4">| 大板订单不参与普通运价趋势统计</span>
              <span className="ml-4">| 自运订单不参与运价统计</span>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* 路线明细弹窗（带月份筛选） */}
      <Dialog open={!!detailRoute} onOpenChange={(open) => !open && setDetailRoute(null)}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailRoute?.origin} → {detailRoute?.dest} 运价明细
              <Badge variant="secondary" className="text-xs">{monthLabel}</Badge>
              {cargoSpec && <Badge variant="outline" className="text-xs">规格：{cargoSpec}</Badge>}
              <Badge variant="outline" className="text-xs">{detailData?.total ?? 0} 条</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-28">订单号</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>客户</TableHead>
                  <TableHead>货物</TableHead>
                  <TableHead className="text-right">重量</TableHead>
                  <TableHead className="text-right">单价(元/吨)</TableHead>
                  <TableHead className="text-right">运费</TableHead>
                  <TableHead className="text-right">送货费</TableHead>
                  <TableHead className="text-right">其他费</TableHead>
                  <TableHead className="text-right">总费用</TableHead>
                  <TableHead>车牌号</TableHead>
                  <TableHead>日期</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!detailData?.items?.length ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      暂无明细数据
                    </TableCell>
                  </TableRow>
                ) : (
                  detailData.items.map((item) => {
                    const w = parseFloat(String(item.weight || 0));
                    const cw = parseFloat(String(item.chargeableWeight || 0));
                    const freight = parseFloat(String(item.actualFreight || 0));
                    const effectiveW = (item.isLargeSlab && cw >= 32) ? cw : w;
                    const unitPrice = item.ltlUnitPrice ? parseFloat(String(item.ltlUnitPrice)) : (effectiveW > 0 ? Math.round(freight / effectiveW) : 0);
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs">{item.orderNumber}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {item.businessType === "outsource" ? "外请" : item.businessType === "ltl" ? "零担" : "自运"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{item.customerName || "-"}</TableCell>
                        <TableCell className="text-sm max-w-[120px]">
                          <div className="truncate">{item.cargoName || "-"}</div>
                          {item.cargoSpec && (
                            <div className="text-[10px] text-purple-600">规格：{item.cargoSpec}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {item.weight ? `${item.weight}t` : "-"}
                          {item.isLargeSlab && cw >= 32 && (
                            <span className="text-[10px] text-purple-500 block">计费:{cw}t</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium text-blue-600">
                          ¥{unitPrice}
                          {item.isLargeSlab && <span className="text-[10px] text-purple-500 block">大板</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm">¥{freight}</TableCell>
                        <TableCell className="text-right text-sm">
                          {item.ltlDeliveryFee ? `¥${item.ltlDeliveryFee}` : "-"}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {item.ltlOtherFee ? `¥${item.ltlOtherFee}` : "-"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {item.totalCost ? `¥${item.totalCost}` : "-"}
                        </TableCell>
                        <TableCell className="text-sm">{item.plateNumber || "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDate(item.orderDate)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* 大板运价明细弹窗 */}
      <Dialog open={!!slabDetailRoute} onOpenChange={(open) => !open && setSlabDetailRoute(null)}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {slabDetailRoute?.originCity} → {slabDetailRoute?.destCity} 零担大板明细
              <Badge className="bg-purple-100 text-purple-700 text-xs">大板</Badge>
              {cargoSpec && <Badge variant="outline" className="text-xs">规格：{cargoSpec}</Badge>}
              <Badge variant="outline" className="text-xs">{slabDetailRoute?.recentOrders?.length ?? 0} 条</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-orange-50">
                  <TableHead className="w-28">订单号</TableHead>
                  <TableHead>客户</TableHead>
                  <TableHead>货物</TableHead>
                  <TableHead className="text-right">重量</TableHead>
                  <TableHead className="text-right">架数</TableHead>
                  <TableHead className="text-right">运费</TableHead>
                  <TableHead className="text-right">送货费</TableHead>
                  <TableHead className="text-right">其他费</TableHead>
                  <TableHead className="text-right">总费用</TableHead>
                  <TableHead className="text-right">元/架</TableHead>
                  <TableHead>日期</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!slabDetailRoute?.recentOrders?.length ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      暂无明细数据
                    </TableCell>
                  </TableRow>
                ) : (
                  slabDetailRoute.recentOrders.map((item: any) => {
                    const freight = parseFloat(String(item.actualFreight || 0));
                    const deliveryFee = parseFloat(String(item.ltlDeliveryFee || 0));
                    const otherFee = parseFloat(String(item.ltlOtherFee || 0));
                    const total = parseFloat(String(item.totalCost || 0)) || (freight + deliveryFee + otherFee);
                    const pkgCount = item.packageCount || 0;
                    const perPkg = pkgCount > 0 ? Math.round(total / pkgCount) : 0;
                    return (
                      <TableRow key={item.id} className="hover:bg-orange-50/30">
                        <TableCell className="font-mono text-xs">{item.orderNumber}</TableCell>
                        <TableCell className="text-sm">{item.customerName || "-"}</TableCell>
                        <TableCell className="text-sm max-w-[120px]">
                          <div className="truncate">{item.cargoName || "-"}</div>
                          {item.cargoSpec && (
                            <div className="text-[10px] text-purple-600">规格：{item.cargoSpec}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">{item.weight ? `${item.weight}t` : "-"}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{pkgCount || "-"}</TableCell>
                        <TableCell className="text-right text-sm">¥{freight}</TableCell>
                        <TableCell className="text-right text-sm">{deliveryFee ? `¥${deliveryFee}` : "-"}</TableCell>
                        <TableCell className="text-right text-sm">{otherFee ? `¥${otherFee}` : "-"}</TableCell>
                        <TableCell className="text-right text-sm font-medium">¥{total}</TableCell>
                        <TableCell className="text-right">
                          {perPkg > 0 ? (
                            <span className="text-orange-600 font-bold">¥{perPkg}</span>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDate(item.orderDate)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!slabFtlDetailRoute} onOpenChange={(open) => !open && setSlabFtlDetailRoute(null)}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {slabFtlDetailRoute?.originCity} → {slabFtlDetailRoute?.destCity} 大板整车明细
              <Badge className="bg-amber-100 text-amber-700 text-xs">大板整车</Badge>
              {cargoSpec && <Badge variant="outline" className="text-xs">规格：{cargoSpec}</Badge>}
              <Badge variant="outline" className="text-xs">{slabFtlDetailRoute?.recentOrders?.length ?? 0} 条</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-amber-50">
                  <TableHead className="w-28">订单号</TableHead>
                  <TableHead>客户</TableHead>
                  <TableHead>货物</TableHead>
                  <TableHead className="text-right">重量</TableHead>
                  <TableHead className="text-right">计费重量</TableHead>
                  <TableHead className="text-right">运费</TableHead>
                  <TableHead className="text-right">元/吨</TableHead>
                  <TableHead>车牌号</TableHead>
                  <TableHead>日期</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!slabFtlDetailRoute?.recentOrders?.length ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      暂无明细数据
                    </TableCell>
                  </TableRow>
                ) : (
                  slabFtlDetailRoute.recentOrders.map((item: any) => {
                    const freight = parseFloat(String(item.actualFreight || 0));
                    const chargeable = parseFloat(String(item.chargeableWeight || item.weight || 0));
                    const unitPrice = chargeable > 0 ? Math.round(freight / chargeable) : 0;
                    return (
                      <TableRow key={item.id} className="hover:bg-amber-50/30">
                        <TableCell className="font-mono text-xs">{item.orderNumber}</TableCell>
                        <TableCell className="text-sm">{item.customerName || "-"}</TableCell>
                        <TableCell className="text-sm max-w-[120px]">
                          <div className="truncate">{item.cargoName || "-"}</div>
                          {item.cargoSpec && (
                            <div className="text-[10px] text-purple-600">规格：{item.cargoSpec}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">{item.weight ? `${item.weight}t` : "-"}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{chargeable ? `${chargeable}t` : "-"}</TableCell>
                        <TableCell className="text-right text-sm">{freight ? `¥${freight}` : "-"}</TableCell>
                        <TableCell className="text-right text-sm font-semibold text-amber-700">{unitPrice ? `¥${unitPrice}` : "-"}</TableCell>
                        <TableCell className="text-sm">{item.plateNumber || "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(item.orderDate)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
