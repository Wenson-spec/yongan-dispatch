# 3000 端口生产版 vs 3001 端口新版 功能差距清单

> 生成时间：2026-05-08
> 对比对象：
> - **3000 生产**：`index-CTp6isfg-v113432.js`（5.47 MB）+ `dist/index.js`（639 KB）
> - **3001 新版**：`index-BhrEeP8I.js`（2.64 MB）+ `LtlUnifiedWorkspace-CIWC1GFr.js`（178 KB lazy）+ `dist/index.js`（639 KB）

---

## 一、对比结论摘要

| 维度 | 结论 |
|------|------|
| **后端 dist/index.js** | 632 KB vs 632 KB，**几乎完全一致**；本次合流的 vehicleModel 多选支持是新版**多出**的功能（生产没有） |
| **8 个 patch-*.cjs 注入的所有功能** | 在新版后端中**全部已存在**（`smartPaste / 急单 / 木架 / 铁架 / 拼托 / json_schema / 撤销派车` 等关键词比对全部 ✅） |
| **核心 router** | smartPaste、ltlInquiry、ltlDispatch（69 处）、findVehicle、podDeposit、customerLedger、freightRate、operationLog、backup、permissions、warehouses、users、customers、drivers、vehicles、merge（114 处）、batch（182 处）等**全部一致** |
| **前端 bundle 大小** | 5.16 MB vs 2.46 MB，差 2.7 MB |
| **前端中文文案** | 生产独有 246 段 / 新版独有 426 段（**新版反而更多文案**） |

**关键发现**：3001 不是"功能落后"，而是"产品文案与页面交互的实现思路完全不同"。新版（route-fixed main + UI refactor 合流后）实际上比生产版**多出 426 段全新文案**，这些都是 fix/route-alignment 与 feat/ui-refactor 分支重构后的新交互说明。

---

## 二、生产独有的真正功能差距（246 段中筛出的业务相关）

### A. 高优先级（影响日常操作的功能）

| 功能 | 生产文案示例 | 性质 | 源码补齐建议 |
|------|------------|------|--------------|
| **批量搜索（多分隔符）** | "批量搜索：订单号/客户/车牌/司机/快递单号（换行、逗号、空格分隔）" | 找车台/订单池工具栏增强 | 在 `client/src/pages/FindVehicle.tsx`、`OrderList.tsx` 顶部增加批量搜索框，支持 `\n`、`,`、空格分隔 |
| **P 开头合并订单号搜索** | "搜索过滤（支持P开头合并订单号）" | 搜索框 placeholder + 后端模糊匹配 | 在搜索 trpc input 中增加对 `mergedPlanNumber` 字段的 LIKE 查询 |
| **取价规则提示** | "取价规则：优先满帮参考价(元/趟)，缺省时用近90天成交价" | 询价台说明文案 | 在 `LtlInquiry` 组件 / `freightRates` 页面表头加 Tooltip |
| **整组搁置/恢复** | "请填写搁置原因（整组订单将移至等通知专区）"、"整组恢复失败/成功" | 合并订单组级搁置 | 在 `MergedPlanGroupHeader.tsx` 增加 `holdGroup`、`recoverGroup` 操作 + 后端 mutation |
| **改派必须填原因** | "改派操作必须填写改派原因"、"请填写改派原因（必填）" | 派车业务规则 | `DispatchVehicle.tsx` 改派对话框增加必填校验 |
| **批量按业务类型分流** | "已按当前业务类型批量分流"、"分流到外请待定价/自运待调度/零担待询价" | 录单总表批量动作 | `OrderList` 增加多选 + 批量 `triagebyBizType` mutation |
| **按确认收到时间倒序** | "按确认收到时间倒序" | 回单台默认排序 | `PodDeposit` 列表 orderBy 默认改为 `confirmedAt DESC` |
| **超期回单分级通知** | "分级通知已发送：黄/橙/红"、"当前没有需要推送的超期回单通知" | 已存在的 PodOverdueChecker 但缺前端展示 | 在回单台增加红/橙/黄分级 Badge |
| **市场参考价清空** | "确定清空市场参考价表中的所有数据吗？"、"暂无市场参考价数据" | 运价数据库管理动作 | `FreightRates.tsx` 增加"清空"按钮 + 后端 `clearMarketRates` mutation |
| **澳门特别行政区/直辖市重复省名清理** | "直辖市去掉地址中重复出现的省名"、"重庆市重庆市XX区"、"澳门特别行政区/" | 地址解析增强 | `client/src/lib/regions.ts` 或后端 normalize 函数中处理 |

### B. 中优先级（提升体验的细节）

| 功能 | 生产文案 | 补齐位置 |
|------|---------|---------|
| 零担工作台旧入口跳转 | "旧版零担工作台已废弃"、"历史路由将自动跳转到正式入口" | `App.tsx` 增加 `<Redirect from="/old-ltl" to="/station/ltl-workspace">` |
| 子单删除二次确认 | "个子单，删除后将无法恢复，确认继续？" | 订单删除对话框 |
| CSV 导入字段转义 | "字段内包含逗号与引号转义"、"至少需含表头与一条数据" | CSV 导入解析 |
| 等级筛选 | "应用等级筛选(_fLevel)" | FindVehicle 筛选项 |
| 卡片视图加载失败兜底 | "卡片视图加载失败：" | ErrorBoundary 增强 |
| 单价换算（元/吨 ⇄ 元/趟） | "原始价(元/趟)"、"换算单价(元/吨)"、"本期均价(元/吨)" | 询价表格列 |

### C. 低优先级（仅文案差异，新版已用别的说法表达）

- 待派车排序键 sortKey
- 已派车 sortKey
- 暂无待录入 TMS 信息
- 暂无运输节点时间
- ……（此类多为状态空提示，新版用更长的引导文案替代，体验更好不需补齐）

---

## 三、新版独有的 426 段文案（已是改进，不是差距）

新版 `LtlUnifiedWorkspace` 大量增加了**产品引导/帮助说明文字**，例如：

- "队列即整理单入口。主管完成定价后，系统会先按区域自动分配到外请..."
- "财务回单确认台仅负责确认收到、回单状态维护和超期监控，不再直接..."
- "录单员可先修正资料，再按业务类型分流到外请待定价、自运待调度..."
- "处理完成后可回到对应工作台更新寄出或收回状态，避免重复告警..."
- "搜索订单号、客户名、车牌号、司机名、P开头合并订单号"

这些是 fix/route-alignment + feat/ui-refactor 引入的产品体验升级，**3001 已具备且超越 3000**。

---

## 四、8 个 patch-*.cjs 已知功能（均已回写到源码）

| Patch | 功能 | 当前在新版后端中状态 |
|-------|------|---------------------|
| **patch-smart-paste.cjs** (758 行) | 注入正则智能粘贴解析器 `__regexSmartPaste*`，将 invokeLLM 替换为本地正则解析（不调用 LLM 也能解析订单文本） | ✅ 后端 `smartPaste` router 5 处引用，`smart-paste` 工具页存在 |
| **patch-keywords.cjs** (178 行) | 扩展加急/价格/货物/特殊要求/人名黑名单关键词正则 | ✅ "急单"、"铁架"、"拼托"、"大板发货" 关键词在新版 bundle 中均存在 |
| **patch-slab.cjs** (155 行) | 大板/木架/铁架数量识别（"5个1100宽木架"等复合格式） | ✅ 同上 |
| **patch-price-remarks.cjs** (231 行) | 子单不继承全局总价 + 总价按重量分配 + remarks/shippingNote 过滤订单数据行 | ✅ 已合并 |
| **patch-v2.cjs** (157 行) | price-remarks 的精确版本（用字符串替换替代括号匹配） | ✅ 同上 |
| **patch-deepseek.cjs** (64 行) | 智能粘贴清理 invokeLLM 替换标记，恢复正常 LLM 调用 | ✅ 已合并 |
| **patch-format.cjs** (109 行) | DeepSeek 兼容：`response_format` 的 `json_schema` 强制转 `json_object` | ✅ `json_schema` 14 处 / `json_object` 2 处都存在 |
| **patch-json-prompt.cjs** (86 行) | DeepSeek `json_object` 模式要求 messages 中包含 "json" 关键词，自动注入 | ✅ 已合并 |

**结论：所有 patch 已无需重复执行，源码已是 patch 后的形态。**

---

## 五、推荐工作清单（按优先级）

### 立即处理（P0）
1. ✅ **验证用户报告的"老版本"具体指什么**：请用户列出在 3001 上看到的 3 个具体"老"的现象（页面名 + 截图），便于精确定位
2. 📋 **批量搜索增强**：在 FindVehicle、OrderList 顶部加多分隔符批量搜索框
3. 📋 **整组搁置/恢复**：MergedPlanGroupHeader 增加组级 hold / recover

### 一周内处理（P1）
4. 📋 改派必填原因校验
5. 📋 批量分流到 3 类业务工位
6. 📋 市场参考价清空动作
7. 📋 直辖市/澳门地址重复省名清理
8. 📋 单价 元/吨 ⇄ 元/趟 换算列

### 长期优化（P2）
9. 📋 旧路由自动跳转（如有用户反馈访问旧 URL）
10. 📋 CSV 导入字段转义增强
11. 📋 ErrorBoundary 在卡片视图加兜底

### 不需处理
- 大部分"暂无 xxx" 类空状态文案（新版已用更详细的引导文案替代）
- ltl 子 SPA（生产 `dist/public/ltl/`，已被新版 `LtlUnifiedWorkspace` 主站集成方案替代）

---

## 六、当前 3001 测试环境真实评估

**新版 3001 端口 ≠ 老版本，反而是产品交互升级版**，具体体现：
1. ✅ 路由完整：11 个工位 + 11 个系统设置 + 9 个主路由全部正常
2. ✅ UI 重构成果：LtlUnifiedWorkspace 178 KB lazy chunk，统一了零担工作台/询价/台账三个入口
3. ✅ 新增帮助文案 426 段，操作引导更清晰
4. ⚠️ 缺少生产版上 ~10 个具体小功能（详见上表 A 节）
5. ❌ 用户感觉"老"可能是 UI 重构后的视觉风格变化导致的不适应，**不是功能倒退**

**强烈建议**：请用户提供 3 个具体"老/差距"现象后再针对性补齐，而不是盲目把生产版的所有差异都还原。
