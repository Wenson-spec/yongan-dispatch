import { describe, expect, it } from "vitest";
import {
  expandDispatcherAssignmentOrderIds,
  isActiveLtlSubchainStatus,
  parseRelatedParentIdsFromRemarks,
} from "./assignmentScope";

describe("assignmentScope", () => {
  describe("parseRelatedParentIdsFromRemarks", () => {
    it("能够从备注中解析关联主单 IDs", () => {
      expect(parseRelatedParentIdsFromRemarks("普通备注\n【关联主单IDs】,101,202,202,")).toEqual([101, 202]);
    });

    it("没有标记时返回空数组", () => {
      expect(parseRelatedParentIdsFromRemarks("无关联信息")).toEqual([]);
    });
  });

  describe("isActiveLtlSubchainStatus", () => {
    it("待分配与已取消不视为有效子链", () => {
      expect(isActiveLtlSubchainStatus("pending_assign")).toBe(false);
      expect(isActiveLtlSubchainStatus("cancelled")).toBe(false);
    });

    it("待定价和待找车仍视为有效子链", () => {
      expect(isActiveLtlSubchainStatus("pending_price")).toBe(true);
      expect(isActiveLtlSubchainStatus("pending_vehicle")).toBe(true);
    });
  });

  describe("expandDispatcherAssignmentOrderIds", () => {
    it("主单分配时会自动带入关联的有效零担外请子链", () => {
      const result = expandDispatcherAssignmentOrderIds(
        [1001],
        [
          {
            id: 2001,
            parentId: 1001,
            remarks: "【零担前段外请子链】\n【关联主单IDs】,1001,",
            status: "pending_price",
            businessType: "outsource",
          },
          {
            id: 2002,
            parentId: null,
            remarks: "【零担后段外请子链】\n【关联主单IDs】,1001,3001,",
            status: "pending_vehicle",
            businessType: "outsource",
          },
        ],
      );

      expect(result.orderIds).toEqual([1001, 2001, 2002]);
      expect(result.autoFollowOrderIds).toEqual([2001, 2002]);
    });

    it("不会把已释放状态的外请子链自动带入分配范围", () => {
      const result = expandDispatcherAssignmentOrderIds(
        [1001],
        [
          {
            id: 2001,
            parentId: 1001,
            remarks: "【零担前段外请子链】\n【关联主单IDs】,1001,",
            status: "cancelled",
            businessType: "outsource",
          },
          {
            id: 2002,
            parentId: 1001,
            remarks: "【零担前段外请子链】\n【关联主单IDs】,1001,",
            status: "pending_assign",
            businessType: "outsource",
          },
        ],
      );

      expect(result.orderIds).toEqual([1001]);
      expect(result.autoFollowOrderIds).toEqual([]);
    });

    it("不会把没有零担外请子链标记或不属于当前主单的订单错误带入", () => {
      const result = expandDispatcherAssignmentOrderIds(
        [1001],
        [
          {
            id: 2001,
            parentId: 1001,
            remarks: "普通外请备注",
            status: "pending_price",
            businessType: "outsource",
          },
          {
            id: 2002,
            parentId: 9999,
            remarks: "【零担前段外请子链】\n【关联主单IDs】,9999,",
            status: "pending_price",
            businessType: "outsource",
          },
          {
            id: 2003,
            parentId: 1001,
            remarks: "【零担前段外请子链】\n【关联主单IDs】,1001,",
            status: "pending_price",
            businessType: "self",
          },
        ],
      );

      expect(result.orderIds).toEqual([1001]);
      expect(result.autoFollowOrderIds).toEqual([]);
    });

    it("批量分配多个主单时会合并去重所有应自动跟随的子链", () => {
      const result = expandDispatcherAssignmentOrderIds(
        [1001, 1002, 1002],
        [
          {
            id: 2001,
            parentId: 1001,
            remarks: "【零担前段外请子链】\n【关联主单IDs】,1001,",
            status: "pending_price",
            businessType: "outsource",
          },
          {
            id: 2002,
            parentId: 1002,
            remarks: "【零担后段外请子链】\n【关联主单IDs】,1002,",
            status: "pending_vehicle",
            businessType: "outsource",
          },
          {
            id: 2002,
            parentId: 1002,
            remarks: "【零担后段外请子链】\n【关联主单IDs】,1002,",
            status: "pending_vehicle",
            businessType: "outsource",
          },
        ],
      );

      expect(result.orderIds).toEqual([1001, 1002, 2001, 2002]);
      expect(result.autoFollowOrderIds).toEqual([2001, 2002]);
    });
  });
});
