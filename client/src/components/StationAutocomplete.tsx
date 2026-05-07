import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Phone, Star, Building2, TrendingUp } from "lucide-react";

interface StationResult {
  name: string;
  phone: string | null;
  useCount?: number;
  isRecent?: boolean;
  avgNetUnitPrice?: number | null;
  priceOrderCount?: number;
}

interface StationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (station: { name: string; phone: string | null }) => void;
  placeholder?: string;
  className?: string;
}

export default function StationAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "输入货站名称，自动匹配已有货站...",
  className,
}: StationAutocompleteProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 获取常用货站（最近30天）
  const { data: recentStations } = trpc.freightStation.getRecentlyUsed.useQuery(
    { limit: 8 },
    { staleTime: 60000 }
  );

  // 获取所有货站列表
  const { data: allStations } = trpc.freightStation.list.useQuery();

  // 合并搜索结果：常用货站置顶 + 名称匹配
  const mergedResults = useMemo(() => {
    const recent = (recentStations || []).map((s: any) => ({
      ...s,
      isRecent: true,
    }));
    const keyword = value.trim().toLowerCase();

    if (!keyword) {
      // 未输入时只显示常用货站
      return recent;
    }

    // 搜索时：常用货站中匹配的置顶，然后是其他匹配的货站
    const recentMatched = recent.filter((s: StationResult) =>
      s.name.toLowerCase().includes(keyword)
    );
    const recentNames = new Set(recentMatched.map((s: StationResult) => s.name));

    const otherMatched = (allStations || [])
      .filter((s: any) => s.name.toLowerCase().includes(keyword) && !recentNames.has(s.name))
      .slice(0, 8)
      .map((s: any) => ({
        name: s.name,
        phone: s.phone || null,
        isRecent: false,
      }));

    return [...recentMatched, ...otherMatched];
  }, [recentStations, allStations, value]);

  // 收集所有需要查询价格的货站名称
  const stationNamesForPrice = useMemo(() => {
    return mergedResults.map((s: StationResult) => s.name).filter(Boolean);
  }, [mergedResults]);

  // 获取货站平均净单价
  const { data: avgPrices } = trpc.freightStation.getAvgPrices.useQuery(
    { stationNames: stationNamesForPrice },
    {
      enabled: stationNamesForPrice.length > 0 && showDropdown,
      staleTime: 120000, // 2分钟缓存
    }
  );

  // 构建价格映射
  const priceMap = useMemo(() => {
    const map = new Map<string, { avgNetUnitPrice: number; orderCount: number }>();
    if (avgPrices) {
      for (const p of avgPrices) {
        map.set(p.stationName, { avgNetUnitPrice: p.avgNetUnitPrice, orderCount: p.orderCount });
      }
    }
    return map;
  }, [avgPrices]);

  // 选择货站
  const handleSelect = (station: StationResult) => {
    onChange(station.name);
    setShowDropdown(false);
    onSelect?.({ name: station.name, phone: station.phone });
  };

  // 聚焦时显示下拉
  const handleFocus = () => {
    if (mergedResults.length > 0) {
      setShowDropdown(true);
    }
  };

  // 输入变化
  const handleInputChange = useCallback((newValue: string) => {
    onChange(newValue);
    setShowDropdown(true);
  }, [onChange]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasRecent = mergedResults.some((s: StationResult) => s.isRecent);
  const showRecentHeader = !value.trim() && hasRecent;

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={handleFocus}
        placeholder={placeholder}
        className={className}
      />
      {showDropdown && mergedResults.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover text-popover-foreground border rounded-md shadow-lg max-h-80 overflow-y-auto">
          {showRecentHeader && (
            <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground bg-muted/50 flex items-center gap-1">
              <Star className="h-3 w-3 text-amber-500" />
              常用货站（最近30天）
            </div>
          )}
          {mergedResults.map((s: StationResult, idx: number) => {
            const priceInfo = priceMap.get(s.name);
            return (
              <div key={`${s.name}-${idx}`}>
                {/* 搜索模式下，在常用和普通结果之间加分隔 */}
                {value.trim() && hasRecent && idx > 0 && !s.isRecent && mergedResults[idx - 1]?.isRecent && (
                  <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground bg-muted/50">
                    其他匹配
                  </div>
                )}
                <div
                  className="px-3 py-2 hover:bg-accent cursor-pointer border-b last:border-b-0 transition-colors"
                  onClick={() => handleSelect(s)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="font-medium">{s.name}</span>
                      {s.isRecent && s.useCount && s.useCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 flex items-center gap-0.5">
                          <Star className="h-2.5 w-2.5" />
                          {s.useCount}次
                        </span>
                      )}
                    </div>
                    {/* 平均净单价展示 */}
                    {priceInfo && (
                      <div className="flex items-center gap-1 text-xs shrink-0">
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                        <span className="font-semibold text-emerald-600">
                          ¥{priceInfo.avgNetUnitPrice}/吨
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          ({priceInfo.orderCount}单)
                        </span>
                      </div>
                    )}
                  </div>
                  {s.phone && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {s.phone}
                    </div>
                  )}
                  {priceInfo && (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      近90天净单价参考（已扣除其他费用和送货费）
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
