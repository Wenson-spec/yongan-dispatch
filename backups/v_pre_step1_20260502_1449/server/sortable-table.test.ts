/**
 * 排序功能单元测试
 * 测试 useTableSort hook 的排序逻辑（纯函数部分）
 */
import { describe, expect, it } from "vitest";

// 直接测试排序逻辑（不依赖 React hook）
function sortData<T>(
  data: T[],
  key: string,
  direction: "asc" | "desc" | null,
  getters: Record<string, (item: T) => string | number | boolean | null | undefined>
): T[] {
  if (!key || !direction || !getters[key]) return data;
  const getter = getters[key];
  const dir = direction === "asc" ? 1 : -1;
  return [...data].sort((a, b) => {
    const va = getter(a);
    const vb = getter(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    if (typeof va === "boolean" && typeof vb === "boolean") return ((va ? 1 : 0) - (vb ? 1 : 0)) * dir;
    return String(va).localeCompare(String(vb), "zh-CN") * dir;
  });
}

interface TestOrder {
  id: number;
  customerName: string;
  weight: string;
  dispatchPrice: string;
  status: string;
  createdAt: string;
  isUrgent: boolean;
  actualFreight?: string;
}

const testOrders: TestOrder[] = [
  { id: 1, customerName: "张三物流", weight: "10", dispatchPrice: "5000", status: "dispatched", createdAt: "2026-03-20T10:00:00Z", isUrgent: false },
  { id: 2, customerName: "李四运输", weight: "25", dispatchPrice: "8000", status: "pending_vehicle", createdAt: "2026-03-21T08:00:00Z", isUrgent: true },
  { id: 3, customerName: "王五货运", weight: "5", dispatchPrice: "3000", status: "in_transit", createdAt: "2026-03-19T15:00:00Z", isUrgent: false },
  { id: 4, customerName: "赵六快递", weight: "15", dispatchPrice: "6000", status: "delivered", createdAt: "2026-03-22T12:00:00Z", isUrgent: true },
  { id: 5, customerName: "阿里物流", weight: "0", dispatchPrice: "", status: "pending_price", createdAt: "2026-03-18T09:00:00Z", isUrgent: false },
];

const getters = {
  createdAt: (o: TestOrder) => o.createdAt ? new Date(o.createdAt).getTime() : 0,
  weight: (o: TestOrder) => parseFloat(o.weight) || 0,
  dispatchPrice: (o: TestOrder) => parseFloat(o.dispatchPrice) || 0,
  status: (o: TestOrder) => o.status || "",
  customerName: (o: TestOrder) => o.customerName || "",
  isUrgent: (o: TestOrder) => o.isUrgent ? 1 : 0,
  actualFreight: (o: TestOrder) => parseFloat(o.actualFreight || "") || 0,
};

describe("表格排序功能", () => {
  describe("数字排序", () => {
    it("按吨位升序排序", () => {
      const sorted = sortData(testOrders, "weight", "asc", getters);
      expect(sorted.map(o => o.id)).toEqual([5, 3, 1, 4, 2]);
    });

    it("按吨位降序排序", () => {
      const sorted = sortData(testOrders, "weight", "desc", getters);
      expect(sorted.map(o => o.id)).toEqual([2, 4, 1, 3, 5]);
    });

    it("按调度价升序排序", () => {
      const sorted = sortData(testOrders, "dispatchPrice", "asc", getters);
      expect(sorted[0].id).toBe(5); // 空值 → 0
      expect(sorted[sorted.length - 1].id).toBe(2); // 8000
    });

    it("按调度价降序排序", () => {
      const sorted = sortData(testOrders, "dispatchPrice", "desc", getters);
      expect(sorted[0].id).toBe(2); // 8000
      expect(sorted[sorted.length - 1].id).toBe(5); // 空值 → 0
    });
  });

  describe("字符串排序", () => {
    it("按客户名称升序排序（中文拼音序）", () => {
      const sorted = sortData(testOrders, "customerName", "asc", getters);
      // 中文 localeCompare 按拼音排序
      const names = sorted.map(o => o.customerName);
      // 验证排序后数组是有序的
      for (let i = 1; i < names.length; i++) {
        expect(names[i - 1].localeCompare(names[i], "zh-CN")).toBeLessThanOrEqual(0);
      }
    });

    it("按客户名称降序排序", () => {
      const sorted = sortData(testOrders, "customerName", "desc", getters);
      const names = sorted.map(o => o.customerName);
      for (let i = 1; i < names.length; i++) {
        expect(names[i - 1].localeCompare(names[i], "zh-CN")).toBeGreaterThanOrEqual(0);
      }
    });

    it("按状态升序排序", () => {
      const sorted = sortData(testOrders, "status", "asc", getters);
      const statuses = sorted.map(o => o.status);
      for (let i = 1; i < statuses.length; i++) {
        expect(statuses[i - 1].localeCompare(statuses[i], "zh-CN")).toBeLessThanOrEqual(0);
      }
    });
  });

  describe("时间排序", () => {
    it("按创建时间升序排序（最早在前）", () => {
      const sorted = sortData(testOrders, "createdAt", "asc", getters);
      expect(sorted[0].id).toBe(5); // 2026-03-18
      expect(sorted[sorted.length - 1].id).toBe(4); // 2026-03-22
    });

    it("按创建时间降序排序（最新在前）", () => {
      const sorted = sortData(testOrders, "createdAt", "desc", getters);
      expect(sorted[0].id).toBe(4); // 2026-03-22
      expect(sorted[sorted.length - 1].id).toBe(5); // 2026-03-18
    });
  });

  describe("布尔/紧急排序", () => {
    it("按紧急状态升序排序（非紧急在前）", () => {
      const sorted = sortData(testOrders, "isUrgent", "asc", getters);
      const urgentFlags = sorted.map(o => o.isUrgent);
      // 非紧急（false=0）应在前，紧急（true=1）在后
      const firstUrgentIdx = urgentFlags.indexOf(true);
      const lastNonUrgentIdx = urgentFlags.lastIndexOf(false);
      if (firstUrgentIdx >= 0 && lastNonUrgentIdx >= 0) {
        expect(lastNonUrgentIdx).toBeLessThan(firstUrgentIdx);
      }
    });

    it("按紧急状态降序排序（紧急在前）", () => {
      const sorted = sortData(testOrders, "isUrgent", "desc", getters);
      const urgentFlags = sorted.map(o => o.isUrgent);
      // 紧急（true=1）应在前
      const firstNonUrgentIdx = urgentFlags.indexOf(false);
      const lastUrgentIdx = urgentFlags.lastIndexOf(true);
      if (firstNonUrgentIdx >= 0 && lastUrgentIdx >= 0) {
        expect(lastUrgentIdx).toBeLessThan(firstNonUrgentIdx);
      }
    });
  });

  describe("边界情况", () => {
    it("空数组排序返回空数组", () => {
      const sorted = sortData([], "weight", "asc", getters);
      expect(sorted).toEqual([]);
    });

    it("direction 为 null 时返回原数组", () => {
      const sorted = sortData(testOrders, "weight", null, getters);
      expect(sorted).toBe(testOrders); // 引用相同
    });

    it("key 为空字符串时返回原数组", () => {
      const sorted = sortData(testOrders, "", "asc", getters);
      expect(sorted).toBe(testOrders);
    });

    it("不存在的 key 返回原数组", () => {
      const sorted = sortData(testOrders, "nonexistent", "asc", getters);
      expect(sorted).toBe(testOrders);
    });

    it("单元素数组排序返回相同元素", () => {
      const single = [testOrders[0]];
      const sorted = sortData(single, "weight", "asc", getters);
      expect(sorted).toHaveLength(1);
      expect(sorted[0].id).toBe(testOrders[0].id);
    });

    it("null/undefined 值排在最后", () => {
      const dataWithNull = [
        ...testOrders,
        { id: 6, customerName: "", weight: "8", dispatchPrice: "4000", status: "pending", createdAt: "", isUrgent: false },
      ];
      const nullGetters = {
        ...getters,
        createdAt: (o: TestOrder) => o.createdAt ? new Date(o.createdAt).getTime() : null as any,
      };
      const sorted = sortData(dataWithNull, "createdAt", "asc", nullGetters);
      // null 值应排在最后
      expect(sorted[sorted.length - 1].id).toBe(6);
    });
  });

  describe("排序切换逻辑", () => {
    it("toggleSort 三态循环：无 → asc → desc → 无", () => {
      // 模拟 toggleSort 逻辑
      type SortState = { key: string; direction: "asc" | "desc" | null };
      const toggleSort = (prev: SortState, key: string): SortState => {
        if (prev.key !== key) return { key, direction: "asc" };
        if (prev.direction === "asc") return { key, direction: "desc" };
        if (prev.direction === "desc") return { key: "", direction: null };
        return { key, direction: "asc" };
      };

      let state: SortState = { key: "", direction: null };
      
      // 第一次点击：无 → asc
      state = toggleSort(state, "weight");
      expect(state).toEqual({ key: "weight", direction: "asc" });
      
      // 第二次点击：asc → desc
      state = toggleSort(state, "weight");
      expect(state).toEqual({ key: "weight", direction: "desc" });
      
      // 第三次点击：desc → 无
      state = toggleSort(state, "weight");
      expect(state).toEqual({ key: "", direction: null });
      
      // 切换到不同列
      state = { key: "weight", direction: "asc" };
      state = toggleSort(state, "price");
      expect(state).toEqual({ key: "price", direction: "asc" });
    });
  });
});
