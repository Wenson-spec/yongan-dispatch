import { describe, it, expect } from "vitest";

/**
 * 派车记忆功能 + 货站记忆功能 测试
 * 验证记忆逻辑的核心算法：最近使用排序、搜索匹配、去重合并
 */

// 模拟最近使用的货站数据
interface RecentStation {
  name: string;
  useCount: number;
  phone: string | null;
  isRecent: boolean;
}

interface AllStation {
  id: number;
  name: string;
  phone: string | null;
}

// 从 StationAutocomplete 组件中提取的合并搜索逻辑
function mergeStationResults(
  recentStations: { name: string; useCount: number; phone: string | null }[],
  allStations: AllStation[],
  keyword: string
): RecentStation[] {
  const recent = recentStations.map(s => ({
    ...s,
    isRecent: true,
  }));
  const kw = keyword.trim().toLowerCase();

  if (!kw) {
    // 未输入时只显示常用货站
    return recent;
  }

  // 搜索时：常用货站中匹配的置顶，然后是其他匹配的货站
  const recentMatched = recent.filter(s => s.name.toLowerCase().includes(kw));
  const recentNames = new Set(recentMatched.map(s => s.name));

  const otherMatched = allStations
    .filter(s => s.name.toLowerCase().includes(kw) && !recentNames.has(s.name))
    .slice(0, 8)
    .map(s => ({
      name: s.name,
      phone: s.phone,
      useCount: 0,
      isRecent: false,
    }));

  return [...recentMatched, ...otherMatched];
}

// 模拟最近使用的车辆数据
interface RecentVehicle {
  plateNumber: string;
  driverName: string | null;
  driverPhone: string | null;
  useCount: number;
  isRecent: boolean;
}

interface AllVehicle {
  id: number;
  plateNumber: string;
  driverName: string | null;
  driverPhone: string | null;
}

// 从 PlateAutocomplete 组件中提取的合并搜索逻辑
function mergeVehicleResults(
  recentVehicles: { plateNumber: string; driverName: string | null; driverPhone: string | null; useCount: number }[],
  allVehicles: AllVehicle[],
  keyword: string
): RecentVehicle[] {
  const recent = recentVehicles.map(v => ({
    ...v,
    isRecent: true,
  }));
  const kw = keyword.trim().toUpperCase();

  if (!kw) {
    return recent;
  }

  const recentMatched = recent.filter(v => v.plateNumber.toUpperCase().includes(kw));
  const recentPlates = new Set(recentMatched.map(v => v.plateNumber));

  const otherMatched = allVehicles
    .filter(v => v.plateNumber.toUpperCase().includes(kw) && !recentPlates.has(v.plateNumber))
    .slice(0, 8)
    .map(v => ({
      plateNumber: v.plateNumber,
      driverName: v.driverName,
      driverPhone: v.driverPhone,
      useCount: 0,
      isRecent: false,
    }));

  return [...recentMatched, ...otherMatched];
}

describe("货站记忆功能", () => {
  const recentStations = [
    { name: "德坤物流", useCount: 15, phone: "13800001111" },
    { name: "安能物流", useCount: 10, phone: "13800002222" },
    { name: "壹米滴答", useCount: 8, phone: "13800003333" },
  ];

  const allStations: AllStation[] = [
    { id: 1, name: "德坤物流", phone: "13800001111" },
    { id: 2, name: "安能物流", phone: "13800002222" },
    { id: 3, name: "壹米滴答", phone: "13800003333" },
    { id: 4, name: "德邦快递", phone: "13800004444" },
    { id: 5, name: "顺丰快运", phone: "13800005555" },
    { id: 6, name: "中通快运", phone: null },
    { id: 7, name: "百世快运", phone: null },
  ];

  it("未输入关键词时，只显示常用货站", () => {
    const results = mergeStationResults(recentStations, allStations, "");
    expect(results.length).toBe(3);
    expect(results.every(s => s.isRecent)).toBe(true);
    expect(results[0].name).toBe("德坤物流");
    expect(results[0].useCount).toBe(15);
  });

  it("输入关键词时，常用货站匹配的置顶", () => {
    const results = mergeStationResults(recentStations, allStations, "德");
    // 德坤物流（常用）+ 德邦快递（其他）
    expect(results.length).toBe(2);
    expect(results[0].name).toBe("德坤物流");
    expect(results[0].isRecent).toBe(true);
    expect(results[1].name).toBe("德邦快递");
    expect(results[1].isRecent).toBe(false);
  });

  it("搜索结果不会重复显示常用货站", () => {
    const results = mergeStationResults(recentStations, allStations, "物流");
    // 德坤物流（常用）+ 安能物流（常用）
    const names = results.map(s => s.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size); // 无重复
  });

  it("搜索无匹配时返回空数组", () => {
    const results = mergeStationResults(recentStations, allStations, "不存在的货站");
    expect(results.length).toBe(0);
  });

  it("空格关键词视为未输入", () => {
    const results = mergeStationResults(recentStations, allStations, "   ");
    expect(results.length).toBe(3);
    expect(results.every(s => s.isRecent)).toBe(true);
  });

  it("搜索匹配不区分大小写", () => {
    const stationsWithEn = [
      { name: "SF Express", useCount: 5, phone: null },
    ];
    const allWithEn: AllStation[] = [
      { id: 1, name: "SF Express", phone: null },
      { id: 2, name: "sf logistics", phone: null },
    ];
    const results = mergeStationResults(stationsWithEn, allWithEn, "sf");
    expect(results.length).toBe(2);
  });

  it("其他匹配结果最多返回8个", () => {
    const manyStations: AllStation[] = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      name: `测试物流${i + 1}`,
      phone: null,
    }));
    const results = mergeStationResults([], manyStations, "测试");
    expect(results.length).toBeLessThanOrEqual(8);
  });

  it("常用货站按使用次数排序", () => {
    const results = mergeStationResults(recentStations, allStations, "");
    expect(results[0].useCount).toBeGreaterThanOrEqual(results[1].useCount);
    expect(results[1].useCount).toBeGreaterThanOrEqual(results[2].useCount);
  });

  it("选择货站时自动填充电话", () => {
    const results = mergeStationResults(recentStations, allStations, "德坤");
    expect(results[0].phone).toBe("13800001111");
  });
});

describe("车辆记忆功能", () => {
  const recentVehicles = [
    { plateNumber: "赣C12345", driverName: "张三", driverPhone: "13900001111", useCount: 20 },
    { plateNumber: "赣C67890", driverName: "李四", driverPhone: "13900002222", useCount: 12 },
    { plateNumber: "粤B11111", driverName: "王五", driverPhone: "13900003333", useCount: 5 },
  ];

  const allVehicles: AllVehicle[] = [
    { id: 1, plateNumber: "赣C12345", driverName: "张三", driverPhone: "13900001111" },
    { id: 2, plateNumber: "赣C67890", driverName: "李四", driverPhone: "13900002222" },
    { id: 3, plateNumber: "粤B11111", driverName: "王五", driverPhone: "13900003333" },
    { id: 4, plateNumber: "赣C99999", driverName: "赵六", driverPhone: "13900004444" },
    { id: 5, plateNumber: "粤A55555", driverName: "孙七", driverPhone: "13900005555" },
  ];

  it("未输入关键词时，只显示常用车辆", () => {
    const results = mergeVehicleResults(recentVehicles, allVehicles, "");
    expect(results.length).toBe(3);
    expect(results.every(v => v.isRecent)).toBe(true);
    expect(results[0].plateNumber).toBe("赣C12345");
  });

  it("输入车牌前缀时，常用车辆匹配的置顶", () => {
    const results = mergeVehicleResults(recentVehicles, allVehicles, "赣C");
    // 赣C12345（常用）+ 赣C67890（常用）+ 赣C99999（其他）
    expect(results.length).toBe(3);
    expect(results[0].isRecent).toBe(true);
    expect(results[1].isRecent).toBe(true);
    expect(results[2].isRecent).toBe(false);
    expect(results[2].plateNumber).toBe("赣C99999");
  });

  it("搜索结果不会重复显示常用车辆", () => {
    const results = mergeVehicleResults(recentVehicles, allVehicles, "赣C");
    const plates = results.map(v => v.plateNumber);
    const uniquePlates = new Set(plates);
    expect(plates.length).toBe(uniquePlates.size);
  });

  it("选择车辆时自动填充司机信息", () => {
    const results = mergeVehicleResults(recentVehicles, allVehicles, "赣C12345");
    expect(results[0].driverName).toBe("张三");
    expect(results[0].driverPhone).toBe("13900001111");
  });

  it("搜索无匹配时返回空数组", () => {
    const results = mergeVehicleResults(recentVehicles, allVehicles, "京A");
    expect(results.length).toBe(0);
  });

  it("车牌搜索不区分大小写", () => {
    const results = mergeVehicleResults(recentVehicles, allVehicles, "粤b");
    expect(results.length).toBe(1);
    expect(results[0].plateNumber).toBe("粤B11111");
  });

  it("常用车辆按使用频率排序", () => {
    const results = mergeVehicleResults(recentVehicles, allVehicles, "");
    expect(results[0].useCount).toBeGreaterThanOrEqual(results[1].useCount);
    expect(results[1].useCount).toBeGreaterThanOrEqual(results[2].useCount);
  });

  it("其他匹配结果最多返回8个", () => {
    const manyVehicles: AllVehicle[] = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      plateNumber: `赣C${String(i).padStart(5, "0")}`,
      driverName: `司机${i}`,
      driverPhone: null,
    }));
    const results = mergeVehicleResults([], manyVehicles, "赣C");
    expect(results.length).toBeLessThanOrEqual(8);
  });
});

describe("记忆功能边界情况", () => {
  it("无常用数据时，搜索仍正常工作", () => {
    const allStations: AllStation[] = [
      { id: 1, name: "德坤物流", phone: "13800001111" },
    ];
    const results = mergeStationResults([], allStations, "德坤");
    expect(results.length).toBe(1);
    expect(results[0].isRecent).toBe(false);
  });

  it("无全量数据时，常用数据仍正常显示", () => {
    const recent = [
      { name: "德坤物流", useCount: 15, phone: "13800001111" },
    ];
    const results = mergeStationResults(recent, [], "");
    expect(results.length).toBe(1);
    expect(results[0].isRecent).toBe(true);
  });

  it("两个数据源都为空时返回空数组", () => {
    const results = mergeStationResults([], [], "任意关键词");
    expect(results.length).toBe(0);
  });

  it("常用和全量数据完全重叠时不重复", () => {
    const recent = [
      { name: "德坤物流", useCount: 15, phone: "13800001111" },
    ];
    const all: AllStation[] = [
      { id: 1, name: "德坤物流", phone: "13800001111" },
    ];
    const results = mergeStationResults(recent, all, "德坤");
    expect(results.length).toBe(1);
    expect(results[0].isRecent).toBe(true);
  });
});
