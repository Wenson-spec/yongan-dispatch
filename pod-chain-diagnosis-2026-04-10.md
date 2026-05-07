# 外请回单链条问题诊断与修改方案

经对当前前后端实现梳理后，我确认**外请回单链条的核心问题不是单点报错，而是“状态源分裂 + 页面口径不一致 + 取消动作未闭环同步”三件事叠加**，导致找车台、回单管理台、退押金校验之间出现认知不一致和数据不一致。

| 模块 | 当前职责 | 实际使用的状态源 | 结论 |
| --- | --- | --- | --- |
| 找车台 `FindVehicle.tsx` | 调度员标记“回单已寄出”、查看跟踪进度 | 主要看 `orders.podStatus`，部分分组进度又去查 `pod.checkGroupsReceived` | 同一页面内已混用两套状态口径 |
| 回单管理台 `PodDepositStation.tsx` | 财务/回单岗确认收到原件、退押金 | 主要看 `pod_records.originalStatus` 与 `orders.depositStatus` | 财务侧以回单表为准 |
| 订单路由 `order.ts` | 标记寄出、退押金、通用字段更新 | `markPodSent` 同时改订单表和回单表，但通用更新只改订单表 | 存在双写不完整问题 |
| 回单路由 `pod.ts` | 确认收到、检查整组是否收齐 | 以 `pod_records.originalStatus` 为唯一判断依据 | 服务端最终约束偏向回单表 |

## 一、我确认到的真实链条

当前系统里，外请回单链条实际被拆成了下面这条路径：

> 找车台标记已寄出 → `orders.podStatus = original_sent`，并尝试同步 `pod_records.originalStatus = sent` → 回单管理台把原件确认收到 → `pod_records.originalStatus = received`，再反向同步订单状态 → 退押金时以整组 `pod_records.originalStatus === received` 为唯一准入条件。

这个判断可以从以下实现直接看出来：

1. `order.markPodSent` 在成功时会同时更新 `orders.podStatus` 与 `pod_records.originalStatus`。[1]
2. `pod.updateStatus` 在回单管理台确认收到时，会以 `pod_records.originalStatus` 为核心状态，并在需要时反向同步订单侧状态。[2]
3. `order.refundDeposit` / `order.batchRefundDeposit` 调用 `validateRefundableDepositScope`，而该函数明确要求**整组订单对应的回单记录都必须是 `received`**，否则直接拦截退押金。[3]
4. `pod.checkGroupsReceived` 也是按 `pod_records.originalStatus` 计算 `allSent` / `allReceived`，并供多个前端页签复用。[4]

因此，**服务端最终可信的业务约束，其实已经偏向 `pod_records.originalStatus`，而不是 `orders.podStatus`。**

## 二、问题具体出在哪里

### 问题 1：回单状态存在“双主数据源”，天然容易失真

现在同一条外请回单链路，至少同时使用了两套状态字段：

| 字段 | 所在表 | 当前用途 | 风险 |
| --- | --- | --- | --- |
| `orders.podStatus` | 订单表 | 找车台展示、局部操作按钮判断、取消寄出 | 容易被前端直接改单而不回写回单表 |
| `pod_records.originalStatus` | 回单表 | 财务确认收到、整组收齐校验、退押金拦截 | 才是真正决定是否能退押金的字段 |

这意味着只要任意一个入口只更新其中一张表，链条就会断。当前代码里，这种情况**已经真实存在**。

### 问题 2：找车台“取消寄出/回退寄出状态”只改了订单表，没有同步回单表

我确认到找车台页面里，取消“已寄出”是通过 `updateOrderFields.mutate({ id, podStatus: "none" })` 直接走订单通用更新来做的；该入口只会更新 `orders` 表字段，并没有把 `pod_records.originalStatus`、`originalSentAt` 一并回滚。[5] [6]

这会直接造成下面的断裂：

> 找车台看见的是“未寄出”，但回单管理台仍然看见“已寄出”；随后财务端继续按回单表推进，退押金又按回单表判断，最终前后端各页面对同一票单的链条认知不一致。

这也是我认为当前“外请回单链条有问题”的**最核心根因**。

### 问题 3：找车台的回单跟踪页既看订单状态，又借用回单表聚合进度，页面内口径并不纯

在 `FindVehicle.tsx` 中，回单跟踪分组的 `sentCount` / `allPodsSent` 一部分来源于订单行上的 `podStatus` 推导，一部分又会优先读取 `pod.checkGroupsReceived` 的结果，而后者是基于 `pod_records.originalStatus` 算出来的。[7]

这意味着在数据不同步时，找车台会出现这种现象：

| 场景 | 订单表 | 回单表 | 页面表现 |
| --- | --- | --- | --- |
| 已寄出后又在找车台取消 | `orders.podStatus = none` | `pod_records.originalStatus = sent` | 单行可能显示未寄出，但分组进度仍可能显示已寄出数量 |
| 财务已确认收到 | 订单表是否同步取决于反向同步是否成功 | `pod_records.originalStatus = received` | 分组进度可能已满，但局部文案仍依赖订单状态 |

这不是单纯的 UI 问题，而是**页面混用了“展示态”和“业务准入态”**。

### 问题 4：退押金按“整组全部收到”严格校验，但前端链条没有把这个约束讲清楚

服务端退押金逻辑并不是“当前单收到就能退”，而是：

> 只要同组合并订单中任意一票对应回单还不是 `received`，就直接报错“该车次仍有订单尚未完成财务原件确认，不可退押金”。[3]

这条规则本身没有问题，但当前前端只是做了部分 `allReceived/allSent` 展示，没有把“为什么现在不能退押金、到底差哪几票”表达清楚。于是业务侧容易把问题理解成“退押金逻辑坏了”，其实更准确地说，是**前端提示不充分，导致链条约束不可解释**。

## 三、我建议怎么改

我建议本轮不要零散修补，而是按“**统一状态源、收口操作入口、补足不可操作原因**”三个层次处理。

### 方案 A：把 `pod_records.originalStatus` 收口为外请回单链条唯一业务状态源

这是我最推荐的方案。

| 修改点 | 建议改法 | 原因 |
| --- | --- | --- |
| 找车台回单跟踪展示 | 单条状态、分组进度、按钮可操作判断都统一改为读取回单表衍生状态 | 避免订单表与回单表双轨并行 |
| `orders.podStatus` | 降级为兼容展示字段，逐步不再作为业务判断准入条件 | 减少历史依赖，避免再出现双写不同步 |
| 回单寄出/取消寄出/确认收到 | 全部通过专门过程操作，由服务端统一同时处理订单侧展示字段与回单侧业务字段 | 保证状态变更有唯一入口 |

这个方案的好处是后续所有规则都更容易解释：

> 是否已寄出、是否已收到、能否退押金，一律看回单表；订单表只是陪衬展示，不再主导业务判断。

### 方案 B：新增“取消回单寄出”专用接口，禁止再用通用订单更新接口直接改 `podStatus`

这是本轮**必须做**的一项，即使你不接受方案 A，也应该做。

建议新增一个类似 `order.cancelPodSent` 或 `pod.revertToPending` 的服务端过程，规则如下：

| 规则 | 建议 |
| --- | --- |
| 可取消范围 | 仅允许责任单、且当前回单状态为 `sent`、未进入 `received` |
| 同步动作 | 同时回滚 `orders.podStatus`、`orders.podSentDate`、`pod_records.originalStatus`、`pod_records.originalSentAt` |
| 异常提示 | 若已被财务确认收到，则拒绝取消并提示“已进入财务确认环节，不可撤销寄出” |
| 前端调用 | 找车台所有“取消寄出”按钮统一走这个专用接口，不再直接调用通用字段更新 |

这一项可以直接切断当前最明显的数据断裂点。

### 方案 C：找车台与回单管理台统一显示“链条阻塞原因”

建议把前端提示做成明确文案，而不是只显示按钮可点/不可点。

| 场景 | 应显示的原因 |
| --- | --- |
| 子单/非责任单尝试寄出 | 当前订单不负责回单原件流转，请在责任单上操作 |
| 退押金不可用 | 本车次仍有 X 票未财务确认收到，列出订单号 |
| 取消寄出不可用 | 当前回单已被财务确认收到，不能回退到未寄出 |
| 分组进度异常 | 当前分组存在订单状态与回单状态不一致，需先修复链条数据 |

这一步主要解决“业务看不懂系统为什么不让做”的问题。

## 四、我建议的实施顺序

如果你同意我动手，我建议按下面顺序改，风险最小：

| 顺序 | 修改内容 | 风险 | 说明 |
| --- | --- | --- | --- |
| 1 | 新增“取消寄出”专用接口，停用直接改 `podStatus` 的前端入口 | 低 | 先堵住继续产生脏数据的入口 |
| 2 | 找车台回单跟踪统一改为按回单责任 + 回单表状态判断 | 中 | 会影响按钮显示与分组进度，但收益最大 |
| 3 | 回单管理台补充“不可退押金原因”和“差异提示” | 低 | 提升业务可解释性 |
| 4 | 为历史不一致数据补一个一次性修复脚本或后台校准逻辑 | 中 | 只处理存量数据，不改业务流程 |
| 5 | 补充 Vitest 回归测试 | 低 | 覆盖寄出、取消寄出、确认收到、退押金四段闭环 |

## 五、我建议本轮至少要落地的最小修改包

如果你希望先做最小闭环，而不是大范围重构，我建议本轮最少做这 4 件事：

1. **新增取消寄出专用接口**，不再允许前端直接通过通用订单更新去改 `podStatus`。  
2. **找车台回单跟踪所有状态展示和按钮资格统一基于责任单 + 回单表状态**。  
3. **回单管理台退押金按钮补充明确阻塞原因**，告诉用户差哪几票没有财务确认。  
4. **补测试**：至少覆盖“寄出成功、取消寄出成功、已收到后不可取消、未全收齐不可退押金”。

这个修改包不算大，但可以把目前最危险的链条断裂点先堵住。

## 六、我对问题的最终判断

我的结论是：

> **外请回单链条当前最大的问题，不是某一个按钮坏了，而是回单状态在订单表与回单表之间双轨运行，且找车台存在通过通用更新接口直接改单侧状态的路径，导致“已寄出 / 已收到 / 可退押金”三段链条可能出现跨页面不一致。**

如果要用一句更业务化的话来概括，就是：

> **调度台、回单台、退押金校验现在并没有完全共享同一份回单真相。**

我现在先停在方案阶段，不会动代码。你只要回复我一个方向即可：

| 你可选的确认方式 | 我接下来会怎么做 |
| --- | --- |
| “按最小修改包做” | 我只修最关键的 4 项，优先保证链条闭环可用 |
| “按统一状态源做” | 我会进一步把回单表收口成唯一业务状态源，改动更彻底 |
| “先只修取消寄出” | 我先堵住最危险的数据断裂入口，其他先不动 |

## References

[1]: `/home/ubuntu/yongan-outsource-rebuild/server/routers/order.ts` `markPodSent` 过程（约 2218-2254 行）  
[2]: `/home/ubuntu/yongan-outsource-rebuild/server/routers/pod.ts` `updateStatus` 过程（约 561-662 行）  
[3]: `/home/ubuntu/yongan-outsource-rebuild/server/routers/order.ts` `validateRefundableDepositScope` 与 `refundDeposit`（约 809-838、2316-2388 行）  
[4]: `/home/ubuntu/yongan-outsource-rebuild/server/routers/pod.ts` `checkGroupsReceived`（约 759-809 行）  
[5]: `/home/ubuntu/yongan-outsource-rebuild/client/src/pages/FindVehicle.tsx` 回单跟踪操作区与取消寄出调用点（约 2688-2955 行）  
[6]: `/home/ubuntu/yongan-outsource-rebuild/server/routers/order.ts` 通用订单更新过程 `update`（约 2628-2738 行及其后续更新逻辑）  
[7]: `/home/ubuntu/yongan-outsource-rebuild/client/src/pages/FindVehicle.tsx` `handleMarkPodSent`、`groupedSignedOrders` 与 `podTrackingProgressMap`（约 1067-1109、1221-1348 行）
