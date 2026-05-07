import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Truck, User, Phone, Loader2, Star } from "lucide-react";

interface VehicleResult {
  plateNumber: string;
  vehicleType: string;
  model: string | null;
  capacity: string | null;
  driverName: string | null;
  driverPhone: string | null;
  recentUseCount?: number;
}

interface PlateAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (vehicle: VehicleResult) => void;
  placeholder?: string;
  className?: string;
}

export default function PlateAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "输入车牌号",
  className,
}: PlateAutocompleteProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [debouncedPrefix, setDebouncedPrefix] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 获取常用车辆（始终加载）
  const { data: recentVehicles } = trpc.vehicle.getRecentlyUsed.useQuery(
    { limit: 5 },
    { staleTime: 60000 } // 缓存1分钟
  );

  // 防抖：输入后300ms才触发搜索
  const handleInputChange = useCallback((newValue: string) => {
    onChange(newValue);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (newValue.length >= 2) {
      debounceTimer.current = setTimeout(() => {
        setDebouncedPrefix(newValue);
        setShowDropdown(true);
      }, 300);
    } else {
      setDebouncedPrefix("");
      // 输入少于2个字符时，如果有常用车辆也显示
      if (newValue.length === 0) {
        setShowDropdown(false);
      }
    }
  }, [onChange]);

  // 查询车辆
  const { data: suggestions, isLoading } = trpc.vehicle.searchByPlatePrefix.useQuery(
    { prefix: debouncedPrefix, limit: 8 },
    { enabled: debouncedPrefix.length >= 2 }
  );

  // 合并常用车辆和搜索结果，常用车辆置顶
  const mergedResults = useMemo(() => {
    const isSearching = debouncedPrefix.length >= 2;
    const searchResults = suggestions || [];
    const recent = recentVehicles || [];

    if (!isSearching) {
      // 未搜索时，只显示常用车辆
      return recent.map(v => ({ ...v, isRecent: true }));
    }

    // 搜索时：常用车辆中匹配的置顶，然后是搜索结果（去重）
    const recentMatched = recent.filter(v =>
      v.plateNumber.startsWith(debouncedPrefix)
    );
    const recentPlates = new Set(recentMatched.map(v => v.plateNumber));
    const otherResults = searchResults.filter(v => !recentPlates.has(v.plateNumber));

    return [
      ...recentMatched.map(v => ({ ...v, isRecent: true })),
      ...otherResults.map(v => ({ ...v, isRecent: false })),
    ];
  }, [suggestions, recentVehicles, debouncedPrefix]);

  // 选择车辆
  const handleSelect = (vehicle: VehicleResult) => {
    onChange(vehicle.plateNumber);
    setShowDropdown(false);
    setDebouncedPrefix("");
    onSelect?.(vehicle);
  };

  // 聚焦时显示常用车辆
  const handleFocus = () => {
    if (value.length >= 2 && mergedResults.length > 0) {
      setShowDropdown(true);
    } else if (value.length === 0 && recentVehicles && recentVehicles.length > 0) {
      setShowDropdown(true);
    }
  };

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const isSearching = debouncedPrefix.length >= 2;
  const showRecentHeader = !isSearching && mergedResults.length > 0;
  const hasRecentInSearch = isSearching && mergedResults.some((v: any) => v.isRecent);

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={handleFocus}
        placeholder={placeholder}
        className={className}
      />
      {showDropdown && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover text-popover-foreground border rounded-md shadow-lg max-h-72 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              搜索中...
            </div>
          ) : mergedResults.length > 0 ? (
            <>
              {showRecentHeader && (
                <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground bg-muted/50 flex items-center gap-1">
                  <Star className="h-3 w-3 text-amber-500" />
                  常用车辆（最近30天）
                </div>
              )}
              {mergedResults.map((v: any, idx: number) => (
                <div key={`${v.plateNumber}-${idx}`}>
                  {/* 搜索模式下，在常用和普通结果之间加分隔 */}
                  {hasRecentInSearch && idx > 0 && !v.isRecent && (mergedResults[idx - 1] as any).isRecent && (
                    <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground bg-muted/50">
                      其他匹配
                    </div>
                  )}
                  <div
                    className="px-3 py-2 hover:bg-accent cursor-pointer border-b last:border-b-0 transition-colors"
                    onClick={() => handleSelect(v)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-blue-500 shrink-0" />
                        <span className="font-medium">{v.plateNumber}</span>
                        {v.vehicleType === "own" ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">自有</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">外请</span>
                        )}
                        {v.isRecent && v.recentUseCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 flex items-center gap-0.5">
                            <Star className="h-2.5 w-2.5" />
                            {v.recentUseCount}次
                          </span>
                        )}
                      </div>
                      {v.model && (
                        <span className="text-xs text-muted-foreground">{v.model}</span>
                      )}
                    </div>
                    {(v.driverName || v.driverPhone) && (
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {v.driverName && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {v.driverName}
                          </span>
                        )}
                        {v.driverPhone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {v.driverPhone}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : isSearching ? (
            <div className="py-3 text-center text-sm text-muted-foreground">
              未找到匹配车辆，将自动创建新车辆
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
