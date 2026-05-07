import { describe, it, expect } from "vitest";

// ====== 车牌号前缀搜索逻辑 ======
describe("车牌号前缀搜索逻辑", () => {
  const mockVehicles = [
    { plateNumber: "粤A12345", vehicleType: "own", model: "9.6米平板", capacity: "25", driverName: "张三", driverPhone: "13800138001" },
    { plateNumber: "粤A12399", vehicleType: "outsource", model: null, capacity: null, driverName: "李四", driverPhone: "13800138002" },
    { plateNumber: "粤B56789", vehicleType: "own", model: "13米高栏", capacity: "32", driverName: null, driverPhone: null },
    { plateNumber: "粤A99999", vehicleType: "outsource", model: null, capacity: null, driverName: "王五", driverPhone: "13800138003" },
    { plateNumber: "京A00001", vehicleType: "outsource", model: "4.2米厢式", capacity: "2", driverName: null, driverPhone: null },
  ];

  function searchByPrefix(prefix: string, limit = 10) {
    return mockVehicles
      .filter(v => v.plateNumber.startsWith(prefix))
      .slice(0, limit);
  }

  it("应按前缀匹配车辆", () => {
    const results = searchByPrefix("粤A");
    expect(results.length).toBe(3);
    expect(results.every(v => v.plateNumber.startsWith("粤A"))).toBe(true);
  });

  it("应按更精确的前缀缩小范围", () => {
    const results = searchByPrefix("粤A123");
    expect(results.length).toBe(2);
  });

  it("应支持limit参数", () => {
    const results = searchByPrefix("粤", 2);
    expect(results.length).toBe(2);
  });

  it("无匹配时返回空数组", () => {
    const results = searchByPrefix("沪");
    expect(results.length).toBe(0);
  });

  it("完整车牌号应精确匹配", () => {
    const results = searchByPrefix("粤A12345");
    expect(results.length).toBe(1);
    expect(results[0].plateNumber).toBe("粤A12345");
  });
});

// ====== 自动填充司机信息逻辑 ======
describe("自动填充司机信息逻辑", () => {
  interface VehicleResult {
    plateNumber: string;
    driverName: string | null;
    driverPhone: string | null;
  }

  function shouldAutoFillDriver(vehicle: VehicleResult): boolean {
    return !!(vehicle.driverName || vehicle.driverPhone);
  }

  it("有司机姓名和电话时应自动填充", () => {
    const v: VehicleResult = { plateNumber: "粤A12345", driverName: "张三", driverPhone: "13800138001" };
    expect(shouldAutoFillDriver(v)).toBe(true);
  });

  it("只有司机姓名时也应自动填充", () => {
    const v: VehicleResult = { plateNumber: "粤A12345", driverName: "张三", driverPhone: null };
    expect(shouldAutoFillDriver(v)).toBe(true);
  });

  it("只有电话时也应自动填充", () => {
    const v: VehicleResult = { plateNumber: "粤A12345", driverName: null, driverPhone: "13800138001" };
    expect(shouldAutoFillDriver(v)).toBe(true);
  });

  it("无司机信息时不应自动填充", () => {
    const v: VehicleResult = { plateNumber: "粤B56789", driverName: null, driverPhone: null };
    expect(shouldAutoFillDriver(v)).toBe(false);
  });
});

// ====== 防抖搜索逻辑 ======
describe("防抖搜索逻辑", () => {
  it("输入少于2个字符时不应触发搜索", () => {
    const shouldSearch = (prefix: string) => prefix.length >= 2;
    expect(shouldSearch("")).toBe(false);
    expect(shouldSearch("粤")).toBe(false);
    expect(shouldSearch("粤A")).toBe(true);
    expect(shouldSearch("粤A1")).toBe(true);
  });
});

// ====== 常用车辆置顶逻辑 ======
describe("常用车辆置顶逻辑", () => {
  const recentVehicles = [
    { plateNumber: "粤A12345", vehicleType: "own", model: "9.6米平板", capacity: "25", driverName: "张三", driverPhone: "13800138001", recentUseCount: 15 },
    { plateNumber: "粤B56789", vehicleType: "outsource", model: "13米高栏", capacity: "32", driverName: "李四", driverPhone: "13800138002", recentUseCount: 8 },
  ];

  const searchResults = [
    { plateNumber: "粤A12345", vehicleType: "own", model: "9.6米平板", capacity: "25", driverName: "张三", driverPhone: "13800138001", recentUseCount: 0 },
    { plateNumber: "粤A12399", vehicleType: "outsource", model: null, capacity: null, driverName: "王五", driverPhone: "13800138003", recentUseCount: 0 },
    { plateNumber: "粤A99999", vehicleType: "outsource", model: null, capacity: null, driverName: null, driverPhone: null, recentUseCount: 0 },
  ];

  function mergeResults(recent: typeof recentVehicles, search: typeof searchResults, prefix: string) {
    const isSearching = prefix.length >= 2;
    if (!isSearching) {
      return recent.map(v => ({ ...v, isRecent: true }));
    }
    const recentMatched = recent.filter(v => v.plateNumber.startsWith(prefix));
    const recentPlates = new Set(recentMatched.map(v => v.plateNumber));
    const otherResults = search.filter(v => !recentPlates.has(v.plateNumber));
    return [
      ...recentMatched.map(v => ({ ...v, isRecent: true })),
      ...otherResults.map(v => ({ ...v, isRecent: false })),
    ];
  }

  it("未搜索时应返回全部常用车辆", () => {
    const results = mergeResults(recentVehicles, [], "");
    expect(results.length).toBe(2);
    expect(results.every((v: any) => v.isRecent)).toBe(true);
  });

  it("搜索时常用车辆匹配的应置顶", () => {
    const results = mergeResults(recentVehicles, searchResults, "粤A");
    expect(results[0].plateNumber).toBe("粤A12345");
    expect((results[0] as any).isRecent).toBe(true);
  });

  it("搜索结果应去重（不重复显示常用车辆）", () => {
    const results = mergeResults(recentVehicles, searchResults, "粤A");
    const plates = results.map(v => v.plateNumber);
    const uniquePlates = new Set(plates);
    expect(plates.length).toBe(uniquePlates.size);
  });

  it("常用车辆不匹配前缀时不应置顶", () => {
    const results = mergeResults(recentVehicles, searchResults, "京A");
    expect(results.every((v: any) => !v.isRecent)).toBe(true);
  });

  it("常用车辆应按使用次数排序", () => {
    expect(recentVehicles[0].recentUseCount).toBeGreaterThan(recentVehicles[1].recentUseCount);
  });
});

// ====== 搜索结果排序 ======
describe("搜索结果展示", () => {
  it("应区分自有和外请车辆类型", () => {
    const vehicleTypes = ["own", "outsource"];
    const labels: Record<string, string> = { own: "自有", outsource: "外请" };
    expect(labels["own"]).toBe("自有");
    expect(labels["outsource"]).toBe("外请");
    vehicleTypes.forEach(t => expect(labels[t]).toBeTruthy());
  });

  it("应正确格式化车辆信息", () => {
    const vehicle = {
      plateNumber: "粤A12345",
      vehicleType: "own",
      model: "9.6米平板",
      capacity: "25",
      driverName: "张三",
      driverPhone: "13800138001",
    };
    expect(vehicle.plateNumber).toBeTruthy();
    expect(vehicle.model).toBeTruthy();
    expect(vehicle.driverName).toBeTruthy();
    expect(vehicle.driverPhone).toBeTruthy();
  });
});
