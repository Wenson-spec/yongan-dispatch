import { describe, expect, it } from "vitest";
import {
  buildOutsourceSuborderPreviewMap,
  getOutsourceSuborderCount,
  hasOutsourceSuborders,
} from "../client/src/lib/outsourceSuborderPreview";

describe("outsourceSuborderPreview helpers", () => {
  it("为组合外请订单建立可按 orderId 读取的子订单预览映射", () => {
    const previewMap = buildOutsourceSuborderPreviewMap([
      {
        orderId: 101,
        parentIds: [1, 2],
        parentOrders: [
          { id: 1, orderNumber: "A001" },
          { id: 2, orderNumber: "A002" },
        ],
      },
    ]);

    expect(previewMap.size).toBe(1);
    expect(getOutsourceSuborderCount(previewMap, 101)).toBe(2);
    expect(hasOutsourceSuborders(previewMap, 101)).toBe(true);
  });

  it("对空数据与非法字段保持安全兜底，不应抛错", () => {
    const previewMap = buildOutsourceSuborderPreviewMap([
      {
        orderId: 202,
        parentIds: undefined as unknown as number[],
        parentOrders: undefined as unknown as any[],
      },
      null as unknown as never,
    ]);

    expect(getOutsourceSuborderCount(previewMap, 202)).toBe(0);
    expect(hasOutsourceSuborders(previewMap, 202)).toBe(false);
    expect(getOutsourceSuborderCount(previewMap, 999)).toBe(0);
  });

  it("当同一 orderId 返回多次时，应以后一次结果覆盖旧预览", () => {
    const previewMap = buildOutsourceSuborderPreviewMap([
      {
        orderId: 303,
        parentIds: [1],
        parentOrders: [{ id: 1, orderNumber: "OLD" }],
      },
      {
        orderId: 303,
        parentIds: [1, 2, 3],
        parentOrders: [
          { id: 1, orderNumber: "NEW-1" },
          { id: 2, orderNumber: "NEW-2" },
          { id: 3, orderNumber: "NEW-3" },
        ],
      },
    ]);

    expect(getOutsourceSuborderCount(previewMap, 303)).toBe(3);
    expect(previewMap.get(303)?.parentIds).toEqual([1, 2, 3]);
  });
});
