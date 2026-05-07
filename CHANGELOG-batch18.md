# 永安调度系统 Batch 18 变更说明

**作者：Manus AI**

本批次围绕按钮点击后的转圈等待、批量操作放大延迟以及高频查询慢的问题，对前端交互、后端接口和数据库索引三层进行了集中优化。当前代码已完成 TypeScript 类型检查，命令为 `pnpm check`，结果通过。

| 模块 | 本批次改动 | 预期收益 |
| --- | --- | --- |
| 前端找车台 | 为高频按钮操作引入乐观更新，减少等待服务端返回后才更新界面的停顿感 | 用户点击后可立即看到状态变化，缩短主观等待时间 |
| 前端缓存刷新 | 将 mutation 成功后的 6 至 8 路全量重查改为局部缓存更新与精细化失效 | 降低网络风暴与重复渲染，减少列表闪烁 |
| 前端轮询 | 按当前页签动态配置轮询间隔，非活跃页签降频 | 降低后台无效请求与缓存抖动 |
| 后端批量接口 | 重构批量状态更新与整组派车的处理流程，改为一次预取、批量写入、减少逐单串行副作用 | 降低批量操作的线性放大延迟 |
| 后端查询路径 | 审批列表继续保持关联查询模式，订单相关缓存补查逻辑与批处理逻辑同步收敛 | 降低接口级 N+1 风险 |
| 数据库 | 为 `orders`、`approvals`、`pod_records` 热表补充二级索引，并新增迁移 `0024_batch18_performance_indexes.sql` | 提升高频筛选与关联字段命中率，降低扫描代价 |

本次前端优化主要集中在 `client/src/pages/FindVehicle.tsx`。页面现在在删除、批量删除、状态推进、字段编辑、退押金等高频操作中优先更新本地缓存，并在失败时回滚，避免过去每次提交后统一触发多路全量刷新。与此同时，找车台将刷新范围收敛到受影响的列表、审批、统计与回单跟踪数据，避免“一个按钮带动整页重刷”的连锁反应。

后端优化主要集中在 `server/routers/order.ts`。批量状态更新与整组派车流程已经从逐单循环查询、逐单创建审批、逐单写日志和逐单回单处理，重构为基于批量预取上下文数据后统一执行更新的方式，以减少串行等待和数据库往返次数。审批列表接口 `server/routers/approval.ts` 继续保持通过关联查询直接获取订单信息，避免审批页列表出现逐条补查。

数据库层已在 `drizzle/schema.ts` 中补充热表索引声明，并新增迁移文件 `drizzle/0024_batch18_performance_indexes.sql`。本批次新增的索引覆盖了 `approvals.orderId`、`approvals.status`、`pod_records.orderId`，以及 `orders.orderDate`、`orders.customerName`、`orders.receiverName`、`orders.mergedPlanNumber`、`orders.plateNumber`、`orders.driverName` 等高频筛选字段，以支撑找车台、审批流、回单流和押金流的常见过滤与关联访问。

| 关键文件 | 说明 |
| --- | --- |
| `client/src/pages/FindVehicle.tsx` | 乐观更新、局部缓存刷新、轮询降频 |
| `server/routers/order.ts` | 批量状态更新、整组派车与订单相关性能优化 |
| `server/routers/approval.ts` | 审批列表关联查询确认 |
| `drizzle/schema.ts` | 热表索引声明补充 |
| `drizzle/0024_batch18_performance_indexes.sql` | Batch 18 新增索引迁移 |
| `drizzle/meta/_journal.json` | 迁移日志追加 |

建议部署 Batch 18 时同步执行新的数据库迁移，再结合接口耗时日志、数据库慢查询日志与前端性能面板，继续观察按钮点击到首屏反馈时间是否显著下降，以及批量操作场景下的总耗时是否已从“随订单数线性显著增长”收敛到更平滑的水平。
