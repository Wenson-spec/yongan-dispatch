# CHANGELOG Batch 13

## 概述

本次 Batch 13 基于 `yongan-batch12-output-v2.zip` 与《大板订单全链路审查报告》完成大板订单从**智能粘贴**、**批量建单**、**数据库字段承接**、**录单台 / 找车台 / 派车台展示**、**审批触发与审批快照**到**价格数据库拆分统计**的全链路修复。

本次修改**未改动回单环节**，即未修改 `pod.ts` 与 `PodDepositStation.tsx`，并保持现有字段与接口向后兼容；新增字段均按 optional 方式接入，不影响历史数据与旧调用方。

## 主要变更

### 1. 智能粘贴 `server/routers/smartPaste.ts`

- 扩展结构化输出字段，新增：
  - `cargoSpec`：规格，如 `1800*900`
  - `palletCount`：托数
  - `largeSlabShippingRequired`：是否存在“按大板发货要求执行”类要求
- 调整提示词与 JSON Schema，要求模型把规格、托数、大板发货要求优先输出到结构化字段，而不是全部塞入 `shippingNote`。
- 将 `shippingNote` 调整为兜底说明字段，仅在无法结构化承接时补充说明。
- 增加结构化归一化逻辑，兼容不同表述形式的规格、托/架数和大板发货要求。

### 2. 批量创建接口 `server/routers/order.ts`

- 为 `batchCreate` 输入补齐以下字段：
  - `cargoSpec`
  - `specialRequirements`
  - `palletCount`
  - `largeSlabShippingRequired`
- 调整大板自动识别逻辑，除 `cargoName`、`remarks` 外，新增读取 `shippingNote` 参与复核。
- 建单落库时补充写入：
  - `cargoSpec`
  - `specialRequirements`
  - `palletCount`
  - `largeSlabShippingRequired`
- 保持已有字段和入参兼容，不删除、不重命名旧字段。

### 3. 数据库 Schema `drizzle/schema.ts`

- 在 `orders` 表结构中补充以下字段定义：
  - `palletCount`：`int`，托数
  - `largeSlabShippingRequired`：`boolean`，大板发货要求标记
- 字段按 optional / nullable 方式承接，避免影响已有订单数据。

### 4. 录单台 `client/src/pages/EntryStation.tsx`

- 让智能粘贴解析出的新结构化字段继续透传到录单与批量建单流程。
- 在录单待提交队列中增加大板订单的结构化展示，而不是只依赖备注或发货说明。
- 对大板相关信息进行显式展示，包括规格、托/架数、特殊要求等，便于录单人员快速核对。

### 5. 找车台 `client/src/pages/FindVehicle.tsx`

- 为大板订单卡片增加独立信息区块，补充展示：
  - 大板标签
  - 规格
  - 托/架数
  - 计费重量
  - 特殊要求
- 避免关键信息仅埋在备注中，提高调度找车阶段的信息可见性。

### 6. 审批流程 `server/routers/approval.ts` + `server/routers/order.ts`

- 扩展审批快照内容，纳入以下大板核心字段：
  - `isLargeSlab`
  - `cargoSpec`
  - `chargeableWeight`
  - `packageCount`
  - `palletCount`
  - `specialRequirements`
- 调整派车审批触发条件：
  - 大板订单 `isLargeSlab = true` 时，自动触发审批
  - 与超价、调度备注共同作为审批触发条件并列存在
- 使审批侧返回的数据也能暴露相应结构化大板字段，便于审批页与后续扩展使用。

### 7. 派车台 `client/src/pages/DispatchVehicle.tsx`

- 补充卡片显示：
  - `chargeableWeight`
  - `packageCount / palletCount`
- 为大板订单增加完整的大板信息摘要区块，便于派车前快速核对关键要素。

### 8. 价格数据库 `server/routers/stats.ts` + `client/src/pages/FreightRateDB.tsx`

- 后端统计调整：
  - 将**大板整车**从普通运价 `30吨以上` 档中拆分，不再混入普通整车统计
  - 新增独立的大板整车统计接口 `largeSlabFtlRates`
  - 普通运价、零担大板运价、大板整车运价均支持 `cargoSpec` 规格筛选
  - 运价明细接口支持按规格过滤回看历史记录
- 前端运价分析台调整：
  - 新增**大板整车运价**独立 Tab
  - 保留**大板运价（零担）**视图
  - 新增规格筛选输入框，用于按 `cargoSpec` 查看同规格历史运价
  - 新增大板整车明细弹窗，独立展示计费重量、运费、元/吨等信息
  - 更新说明文案，明确大板整车已从普通运价视图中拆分

## 验证结果

### TypeScript 编译检查

已在项目根目录执行以下命令并通过：

```bash
pnpm run check
```

该命令实际执行：

```bash
tsc --noEmit
```

### 打包要求

交付包将包含：

- 更新后的项目代码
- `CHANGELOG-batch13.md`

打包时排除：

- `node_modules`
- `.manus`

并使用 `unzip -t` 对最终压缩包完整性进行校验。
