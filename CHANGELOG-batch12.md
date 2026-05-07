# CHANGELOG-batch12

## 概述

本批次围绕检查报告提出的三类核心问题进行统一整理：一是将涉及 `mergedPlanNumber` 或正式外请分组的页面逐步收敛到统一组合头部表达；二是补齐排序规则的显式说明，使默认排序与当前排序状态可被用户感知；三是按业务语义优化零担工作台等场景的默认排序字段，并修复在整理过程中新暴露出的类型问题，确保项目可以通过 TypeScript 编译检查。

## 主要改动

| 模块 | 文件 | 本批次修改 |
| --- | --- | --- |
| 统一组合头部 | `client/src/components/MergedPlanGroupHeader.tsx` | 重写为统一规范版本，支持组合标识、主单号、子单数、加急统计、目的地统计、总重量、当前阶段、关键时间、主操作按钮，以及业务二级摘要区挂载。 |
| 录单台 | `client/src/pages/EntryStation.tsx` | 两处分组头部改为统一组合头部组件，统一组合摘要、加急表达与主操作区布局。 |
| 订单池 | `client/src/pages/OrderPool.tsx` | 接入统一分组 Hook 与统一组合头部组件，收敛页面内重复分组实现入口。 |
| 排序提示 | `client/src/components/SortRuleNotice.tsx` | 新增通用排序说明组件，用于展示默认排序规则与当前排序列/方向。 |
| 找车台 | `client/src/pages/FindVehicle.tsx` | 注入统一组合头部组件与排序说明组件依赖，为后续统一化接入提供公共入口。 |
| 零担统一工作台 | `client/src/pages/LtlUnifiedWorkspace.tsx` | 将已询价、进行中、已完成三类列表的默认排序分别调整为最近更新时间、状态推进时间、签收/结算时间；并在列表上方新增显式排序说明。 |
| 编译修复 | `client/src/components/MergedPlanGroupHeader.tsx`、`client/src/pages/LtlUnifiedWorkspace.tsx` | 修复统一头部组件订单 `id` 可空类型问题；修正零担客户自送字段名为 `ltlCustomerSelfDeliverConfirmed`，消除编译报错。 |

## 验证结果

| 项目 | 结果 |
| --- | --- |
| TypeScript 编译检查 | 已通过 `pnpm run check` |
| 变更说明 | 已生成 `CHANGELOG-batch12.md` |
| 项目打包 | 待输出 `yongan-batch12-output.zip` |

## 说明

本批次在现有可恢复项目包基础上继续应用第十二批要求，并参考已提供的 `CHANGELOG-batch9.md` 与 `CHANGELOG-batch10.md` 对既有方向进行了衔接。由于原始损坏包不可直接恢复，本次交付以重新提供的基础项目包为准，并在当前代码树上完成可编译的第十二批改造与整理。
