/**
 * 端到端零担(LTL)订单全流程集成测试
 * 
 * 通过HTTP直接调用运行中的服务器，用真实数据库走完完整链路：
 * 录单(pending_inquiry) → 创建询价 → 确认询价(inquiry_confirmed) → 派车发运(dispatched,自动)
 * → 费用录入(shipped) → 送达(delivered) → 签收(signed) → 回单收回(received)
 * 
 * 测试零担特有逻辑，验证：
 * - 零担订单初始状态为 pending_inquiry
 * - 零担询价创建、报价、确认流程
 * - 确认询价后自动取消其他询价（排他机制）
 * - 零担费用计算：运费 = 单价 × 吨位，总费用 = 运费 + 送货费 + 其他费
 * - 零担状态链路：pending_inquiry → inquiry_confirmed → dispatched(派车自动) → shipped → delivered → signed
 * - 零担回单从pending直接→received（跳过sent，类似自运）
 * - 零担派车批次(LTL Batch)创建与管理
 * - 全流程数据一致性
 */
import { SignJWT } from "jose";

const BASE_URL = "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET;
const APP_ID = process.env.VITE_APP_ID || "mS2VsvFppKLrYJLaNH3ZGb";

// Admin用户信息
const ADMIN_OPEN_ID = "fdtVZoPtAMyzUVwS6JAc5x";
const ADMIN_NAME = "Wenyu Chen";

// 零担调度员刘五
const LTL_DISPATCHER_OPEN_ID = "local_test_lingdan_1772164361533";
const LTL_DISPATCHER_NAME = "零担调度员刘五";

// 测试数据：2个零担订单（不同重量，测试拼车场景）
const TEST_MERGED_PLAN = `E2E-LTL-${Date.now()}`;
const TEST_ORDERS = [
  {
    orderNumber: `LTL-A-${Date.now()}`,
    customerName: "零担全流程测试客户",
    originCity: "佛山",
    destinationCity: "武汉",
    weight: "5",  // 5吨（数据库单位为吨）
    cargoName: "瓷砖",
    customerPrice: "3000",
    deliveryAddress: "武汉市洪山区某仓库",
    receiverName: "零担收货人甲",
    receiverPhone: "13800001111",
    shippingNote: "零担拼车测试-A",
  },
  {
    orderNumber: `LTL-B-${Date.now()}`,
    customerName: "零担全流程测试客户",
    originCity: "佛山",
    destinationCity: "武汉",
    weight: "3",  // 3吨（数据库单位为吨）
    cargoName: "建材",
    customerPrice: "2000",
    deliveryAddress: "武汉市江夏区某仓库",
    receiverName: "零担收货人乙",
    receiverPhone: "13800002222",
    shippingNote: "零担拼车测试-B",
  },
];

// 货站信息（用于询价）
const FREIGHT_STATION_ID = 1;
const FREIGHT_STATION_NAME = "德邦物流佛山站";
// 零担费用
const LTL_UNIT_PRICE_A = "420";   // 420元/吨
const LTL_DELIVERY_FEE_A = "150"; // 送货费150
const LTL_OTHER_FEE_A = "50";     // 其他费50
const LTL_UNIT_PRICE_B = "380";   // 380元/吨
const LTL_DELIVERY_FEE_B = "100"; // 送货费100
const LTL_OTHER_FEE_B = "0";      // 其他费0

// ========== 辅助函数 ==========
async function generateToken(openId, name) {
  const secretKey = new TextEncoder().encode(JWT_SECRET);
  const token = await new SignJWT({ openId, appId: APP_ID, name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime('24h')
    .sign(secretKey);
  return token;
}

async function trpcCall(procedure, input, token) {
  const url = `${BASE_URL}/api/trpc/${procedure}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ json: input }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`tRPC error [${procedure}]: ${JSON.stringify(data.error)}`);
  }
  return data.result?.data?.json;
}

async function trpcQuery(procedure, input, token) {
  const encodedInput = encodeURIComponent(JSON.stringify({ json: input }));
  const url = `${BASE_URL}/api/trpc/${procedure}?input=${encodedInput}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`tRPC query error [${procedure}]: ${JSON.stringify(data.error)}`);
  }
  return data.result?.data?.json;
}

function log(step, msg) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[步骤 ${step}] ${msg}`);
  console.log("=".repeat(60));
}

function check(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
  } else {
    console.error(`  ❌ ${msg}`);
    throw new Error(`断言失败: ${msg}`);
  }
}

// ========== 主测试流程 ==========
async function main() {
  console.log("\n🚛 零担(LTL)订单端到端全流程集成测试");
  console.log(`合并计划号: ${TEST_MERGED_PLAN}`);
  console.log(`子订单数: ${TEST_ORDERS.length}`);
  console.log(`路线: 佛山 → 武汉`);
  console.log(`重量分布: ${TEST_ORDERS.map(o => o.weight + "吨").join(", ")} (总${TEST_ORDERS.reduce((s, o) => s + parseFloat(o.weight), 0)}吨)`);
  console.log(`货站: ${FREIGHT_STATION_NAME}`);

  const adminToken = await generateToken(ADMIN_OPEN_ID, ADMIN_NAME);
  const ltlDispatcherToken = await generateToken(LTL_DISPATCHER_OPEN_ID, LTL_DISPATCHER_NAME);

  // ========== 步骤1: 录单 - 创建2个零担合并订单 ==========
  log(1, "录单 - 创建2个零担合并订单（businessType=ltl）");
  const createdIds = [];
  for (const order of TEST_ORDERS) {
    const result = await trpcCall("order.create", {
      ...order,
      businessType: "ltl",
      mergedPlanNumber: TEST_MERGED_PLAN,
      isUrgent: false,
    }, adminToken);
    createdIds.push(result.id);
    console.log(`  创建订单 #${result.id}: ${order.orderNumber} (${order.weight}吨)`);
  }
  check(createdIds.length === 2, `成功创建2个零担订单: [${createdIds.join(", ")}]`);

  // 验证初始状态
  for (const id of createdIds) {
    const detail = await trpcQuery("order.getById", { id }, adminToken);
    check(detail.status === "pending_inquiry", `订单 #${id} 初始状态为 pending_inquiry（零担特有）`);
    check(detail.businessType === "ltl", `订单 #${id} 业务类型为 ltl`);
    check(detail.mergedPlanNumber === TEST_MERGED_PLAN, `订单 #${id} 合并计划号正确`);
  }

  // ========== 步骤2: 创建询价 - 向货站询价（零担特有流程） ==========
  log(2, "创建询价 - 向货站询价（零担特有流程）");
  
  // 为每个订单创建询价记录
  const inquiryIds = [];
  for (let i = 0; i < createdIds.length; i++) {
    const result = await trpcCall("ltlInquiry.create", {
      orderId: createdIds[i],
      freightStationId: FREIGHT_STATION_ID,
      finalStationName: FREIGHT_STATION_NAME,
      quotedPrice: i === 0 ? "2500" : "1500",
      remarks: `零担询价测试-${i === 0 ? 'A' : 'B'}`,
    }, adminToken);
    inquiryIds.push(result.id);
    console.log(`  创建询价 #${result.id} (订单 #${createdIds[i]})`);
  }
  check(inquiryIds.length === 2, `成功创建2个询价记录: [${inquiryIds.join(", ")}]`);

  // 验证询价记录
  for (let i = 0; i < createdIds.length; i++) {
    const inquiries = await trpcQuery("ltlInquiry.listByOrder", { orderId: createdIds[i] }, adminToken);
    check(inquiries.length >= 1, `订单 #${createdIds[i]} 有询价记录 (${inquiries.length}条)`);
    check(inquiries[0].inquiryStatus === "pending", `询价 #${inquiryIds[i]} 状态为 pending`);
  }

  // 为订单A创建第二个询价（测试排他取消机制）
  const extraInquiryResult = await trpcCall("ltlInquiry.create", {
    orderId: createdIds[0],
    freightStationId: FREIGHT_STATION_ID,
    finalStationName: "安能物流佛山站",
    quotedPrice: "2800",
    remarks: "竞争询价-将被排他取消",
  }, adminToken);
  const extraInquiryId = extraInquiryResult.id;
  console.log(`  创建额外询价 #${extraInquiryId} (订单 #${createdIds[0]}，用于测试排他取消)`);

  // ========== 步骤3: 确认询价 - 选择货站报价并确认（触发排他取消） ==========
  log(3, "确认询价 - 确认第一个货站的报价（触发排他取消其他询价）");
  
  // 确认订单A的第一个询价
  await trpcCall("ltlInquiry.update", {
    id: inquiryIds[0],
    confirmedPrice: "2400",
    inquiryStatus: "confirmed",
  }, adminToken);
  console.log(`  确认询价 #${inquiryIds[0]} (订单 #${createdIds[0]}), 确认价格: ¥2400`);

  // 验证排他取消：额外询价应被自动取消
  const inquiriesAfterConfirm = await trpcQuery("ltlInquiry.listByOrder", { orderId: createdIds[0] }, adminToken);
  const confirmedInquiry = inquiriesAfterConfirm.find(i => i.id === inquiryIds[0]);
  const cancelledInquiry = inquiriesAfterConfirm.find(i => i.id === extraInquiryId);
  check(confirmedInquiry?.inquiryStatus === "confirmed", `询价 #${inquiryIds[0]} 状态为 confirmed`);
  check(cancelledInquiry?.inquiryStatus === "cancelled", `额外询价 #${extraInquiryId} 被排他取消 (cancelled)`);

  // 验证订单A状态自动变为 inquiry_confirmed
  const orderA_afterConfirm = await trpcQuery("order.getById", { id: createdIds[0] }, adminToken);
  check(orderA_afterConfirm.status === "inquiry_confirmed", `订单 #${createdIds[0]} 状态自动变为 inquiry_confirmed`);

  // 确认订单B的询价
  await trpcCall("ltlInquiry.update", {
    id: inquiryIds[1],
    confirmedPrice: "1400",
    inquiryStatus: "confirmed",
  }, adminToken);
  console.log(`  确认询价 #${inquiryIds[1]} (订单 #${createdIds[1]}), 确认价格: ¥1400`);

  const orderB_afterConfirm = await trpcQuery("order.getById", { id: createdIds[1] }, adminToken);
  check(orderB_afterConfirm.status === "inquiry_confirmed", `订单 #${createdIds[1]} 状态自动变为 inquiry_confirmed`);

  // ========== 步骤4: 零担派车批次 - 创建LTL Batch（自动推进状态为dispatched） ==========
  log(4, "零担派车批次 - 创建LTL Batch（自动推进状态为已发运）");
  
  const batchResult = await trpcCall("order.createLtlBatch", {
    orderIds: createdIds,
    plateNumber: "粤B12345",
    driverName: "零担司机张三",
    driverPhone: "13600001234",
    remarks: [
      { orderId: createdIds[0], remark: "5吨瓷砖，注意防碎" },
      { orderId: createdIds[1], remark: "3吨建材，轻拿轻放" },
    ],
  }, adminToken);
  check(batchResult.batchId > 0, `零担派车批次创建成功: 批次ID=${batchResult.batchId}`);
  check(batchResult.batchCode.startsWith("LTL"), `批次编号以LTL开头: ${batchResult.batchCode}`);
  // ★ 验证自动推进状态
  check(batchResult.statusUpdatedCount === 2, `自动推进状态订单数: ${batchResult.statusUpdatedCount} (预期2)`);
  check(batchResult.podCreatedCount === 2, `自动创建回单数: ${batchResult.podCreatedCount} (预期2)`);
  console.log(`  批次编号: ${batchResult.batchCode}`);
  console.log(`  批次ID: ${batchResult.batchId}`);
  console.log(`  自动推进状态: ${batchResult.statusUpdatedCount} 个订单`);
  console.log(`  自动创建回单: ${batchResult.podCreatedCount} 个`);

  // 验证订单状态已自动推进为 dispatched
  for (const id of createdIds) {
    const detail = await trpcQuery("order.getById", { id }, adminToken);
    check(detail.status === "dispatched", `订单 #${id} 状态自动推进为 dispatched`);
    check(detail.plateNumber === "粤B12345", `订单 #${id} 车牌号已设置`);
    check(detail.driverName === "零担司机张三", `订单 #${id} 司机已设置`);
    console.log(`  订单 #${id}: 状态=${detail.status}, 车牌=${detail.plateNumber}, 司机=${detail.driverName}`);
  }

  // 验证回单记录已自动创建
  const podListAfterBatch = await trpcQuery("pod.list", { pageSize: 100 }, adminToken);
  const batchPods = podListAfterBatch.items.filter(p => createdIds.includes(p.orderId));
  check(batchPods.length === 2, `回单记录已自动创建: ${batchPods.length}/2`);

  // 验证批次详情
  const batchDetail = await trpcQuery("order.getLtlBatchDetail", { batchId: batchResult.batchId }, adminToken);
  check(batchDetail.batch !== null, `批次详情存在`);
  check(batchDetail.batch.plateNumber === "粤B12345", `批次车牌号正确`);
  check(batchDetail.batch.driverName === "零担司机张三", `批次司机姓名正确`);
  check(batchDetail.orders.length === 2, `批次包含2个订单`);

  // 验证批次列表
  const batchList = await trpcQuery("order.listLtlBatches", { page: 1, pageSize: 10, keyword: batchResult.batchCode }, adminToken);
  check(batchList.items.length >= 1, `批次列表中能找到该批次`);

  // ========== 步骤5: 零担费用录入 - 设置单价、送货费、其他费（零担计费方式） ==========
  log(5, "零担费用录入 - 设置单价/送货费/其他费（零担特有计费方式）");
  
  // 订单A: 5吨 × 420元/吨 = 2100运费 + 150送货费 + 50其他费 = 2300总费用
  await trpcCall("order.updateStatus", {
    id: createdIds[0],
    status: "shipped",
    ltlUnitPrice: LTL_UNIT_PRICE_A,
    ltlDeliveryFee: LTL_DELIVERY_FEE_A,
    ltlOtherFee: LTL_OTHER_FEE_A,
    freightStationName: FREIGHT_STATION_NAME,
    freightWaybillNumber: `WB-A-${Date.now()}`,
    inquiryPhone: "020-88881111",
  }, adminToken);
  console.log(`  订单A费用: 5吨 × ¥420/吨 = ¥2100 + 送货费¥150 + 其他费¥50 = ¥2300`);

  // 验证订单A费用计算
  const orderA_afterFee = await trpcQuery("order.getById", { id: createdIds[0] }, adminToken);
  check(orderA_afterFee.status === "shipped", `订单 #${createdIds[0]} 状态为 shipped（已发运）`);
  const freightA = parseFloat(orderA_afterFee.actualFreight || "0");
  check(freightA === 2100, `订单A运费: ¥${freightA} (预期¥2100 = 5吨×420)`);
  const totalCostA = parseFloat(orderA_afterFee.totalCost || "0");
  check(totalCostA === 2300, `订单A总费用: ¥${totalCostA} (预期¥2300 = 2100+150+50)`);
  check(orderA_afterFee.ltlUnitPrice !== null, `订单A零担单价已设置`);
  check(orderA_afterFee.freightWaybillNumber !== null, `订单A货站运单号已设置`);

  // 订单B: 3吨 × 380元/吨 = 1140运费 + 100送货费 + 0其他费 = 1240总费用
  await trpcCall("order.updateStatus", {
    id: createdIds[1],
    status: "shipped",
    ltlUnitPrice: LTL_UNIT_PRICE_B,
    ltlDeliveryFee: LTL_DELIVERY_FEE_B,
    ltlOtherFee: LTL_OTHER_FEE_B,
    freightStationName: FREIGHT_STATION_NAME,
    freightWaybillNumber: `WB-B-${Date.now()}`,
    inquiryPhone: "020-88882222",
  }, adminToken);
  console.log(`  订单B费用: 3吨 × ¥380/吨 = ¥1140 + 送货费¥100 + 其他费¥0 = ¥1240`);

  // 验证订单B费用计算
  const orderB_afterFee = await trpcQuery("order.getById", { id: createdIds[1] }, adminToken);
  check(orderB_afterFee.status === "shipped", `订单 #${createdIds[1]} 状态为 shipped（已发运）`);
  const freightB = parseFloat(orderB_afterFee.actualFreight || "0");
  check(freightB === 1140, `订单B运费: ¥${freightB} (预期¥1140 = 3吨×380)`);
  const totalCostB = parseFloat(orderB_afterFee.totalCost || "0");
  check(totalCostB === 1240, `订单B总费用: ¥${totalCostB} (预期¥1240 = 1140+100+0)`);

  // ========== 步骤6: 送达 - shipped → delivered ==========
  log(6, "送达 - shipped → delivered");
  
  for (const id of createdIds) {
    await trpcCall("order.updateStatus", {
      id,
      status: "delivered",
    }, adminToken);
  }

  for (const id of createdIds) {
    const detail = await trpcQuery("order.getById", { id }, adminToken);
    check(detail.status === "delivered", `订单 #${id} 状态为 delivered`);
    check(detail.deliveryDate !== null, `订单 #${id} 送达日期已设置`);
  }

  // ========== 步骤7: 签收 - delivered → signed ==========
  log(7, "签收 - delivered → signed");
  
  for (const id of createdIds) {
    await trpcCall("order.updateStatus", {
      id,
      status: "signed",
    }, adminToken);
  }

  for (const id of createdIds) {
    const detail = await trpcQuery("order.getById", { id }, adminToken);
    check(detail.status === "signed", `订单 #${id} 状态为 signed`);
    check(detail.signedDate !== null, `订单 #${id} 签收日期已设置`);
  }

  // ========== 步骤8: 回单收回 - 零担回单直接从pending→received ==========
  log(8, "回单收回 - 零担回单直接从pending→received（类似自运，跳过sent）");
  
  // 回单已在步骤4派车时自动创建，直接获取
  const podListResult = await trpcQuery("pod.list", { pageSize: 100 }, adminToken);
  const testPods = podListResult.items.filter(p => createdIds.includes(p.orderId));
  check(testPods.length === 2, `2个回单记录存在 (实际: ${testPods.length})，已在派车时自动创建`);

  // 直接标记为received（跳过sent）
  for (const pod of testPods) {
    await trpcCall("pod.updateStatus", {
      id: pod.id,
      originalStatus: "received",
    }, adminToken);
    console.log(`  回单 #${pod.id} (订单 #${pod.orderId}) 直接标记为 received`);
  }

  // 验证回单状态
  const podListAfterReceived = await trpcQuery("pod.list", { pageSize: 100 }, adminToken);
  const testPodsAfterReceived = podListAfterReceived.items.filter(p => createdIds.includes(p.orderId));
  for (const pod of testPodsAfterReceived) {
    check(pod.originalStatus === "received", `回单 #${pod.id} 状态为 received`);
    check(pod.originalReceivedAt !== null, `回单 #${pod.id} 收到时间已设置`);
    // 零担跳过sent，所以originalSentAt应该为null
    check(pod.originalSentAt === null, `回单 #${pod.id} 寄出时间为null（零担跳过寄出）`);
  }

  // ========== 步骤9: 最终验证 - 全流程数据一致性检查 ==========
  log(9, "最终验证 - 全流程数据一致性检查");
  
  const expectedData = [
    { weight: 5, unitPrice: 420, freight: 2100, deliveryFee: 150, otherFee: 50, totalCost: 2300, customerPrice: 3000 },
    { weight: 3, unitPrice: 380, freight: 1140, deliveryFee: 100, otherFee: 0, totalCost: 1240, customerPrice: 2000 },
  ];

  let totalFreightVerify = 0;
  let totalCostVerify = 0;
  for (let i = 0; i < createdIds.length; i++) {
    const detail = await trpcQuery("order.getById", { id: createdIds[i] }, adminToken);
    const expected = expectedData[i];
    
    console.log(`  订单 #${createdIds[i]}:`);
    console.log(`    状态: ${detail.status}`);
    console.log(`    业务类型: ${detail.businessType}`);
    console.log(`    重量: ${detail.weight}kg`);
    console.log(`    零担单价: ¥${detail.ltlUnitPrice}/吨`);
    console.log(`    运费: ¥${detail.actualFreight}`);
    console.log(`    送货费: ¥${detail.ltlDeliveryFee}`);
    console.log(`    其他费: ¥${detail.ltlOtherFee}`);
    console.log(`    总费用: ¥${detail.totalCost}`);
    console.log(`    客户价: ¥${detail.customerPrice}`);
    console.log(`    货站运单号: ${detail.freightWaybillNumber}`);
    
    // 最终状态验证
    check(detail.status === "signed", `订单 #${createdIds[i]} 最终状态为 signed`);
    check(detail.businessType === "ltl", `订单 #${createdIds[i]} 业务类型为 ltl`);
    
    // 费用验证
    const actualFreight = parseFloat(detail.actualFreight || "0");
    check(actualFreight === expected.freight, 
      `订单 #${createdIds[i]} 运费正确: ¥${actualFreight} (预期¥${expected.freight})`);
    
    const actualTotalCost = parseFloat(detail.totalCost || "0");
    check(actualTotalCost === expected.totalCost, 
      `订单 #${createdIds[i]} 总费用正确: ¥${actualTotalCost} (预期¥${expected.totalCost})`);
    
    // 零担特有字段验证
    check(detail.ltlUnitPrice !== null, `订单 #${createdIds[i]} 零担单价已设置`);
    check(detail.freightWaybillNumber !== null, `订单 #${createdIds[i]} 货站运单号已设置`);
    
    // 时间戳验证
    check(detail.deliveryDate !== null, `订单 #${createdIds[i]} 送达日期存在`);
    check(detail.signedDate !== null, `订单 #${createdIds[i]} 签收日期存在`);
    
    // 利润计算
    const profit = parseFloat(detail.customerPrice || "0") - actualTotalCost;
    console.log(`    利润: ¥${profit} (客户价¥${detail.customerPrice} - 总费用¥${actualTotalCost})`);
    
    totalFreightVerify += actualFreight;
    totalCostVerify += actualTotalCost;
  }
  
  // 汇总验证
  check(totalFreightVerify === 2100 + 1140, `总运费正确: ¥${totalFreightVerify} (预期¥3240)`);
  check(totalCostVerify === 2300 + 1240, `总费用正确: ¥${totalCostVerify} (预期¥3540)`);

  // ========== 步骤10: 清理验证 - 删除零担派车批次 ==========
  log(10, "清理验证 - 删除零担派车批次");
  
  const deleteResult = await trpcCall("order.deleteLtlBatch", {
    batchId: batchResult.batchId,
  }, adminToken);
  check(deleteResult.success, `零担派车批次 #${batchResult.batchId} 删除成功`);

  // 验证批次已删除
  const batchDetailAfterDelete = await trpcQuery("order.getLtlBatchDetail", { batchId: batchResult.batchId }, adminToken);
  check(batchDetailAfterDelete.batch === null, `批次已不存在`);

  // ========== 测试完成 ==========
  console.log(`\n${"🎉".repeat(30)}`);
  console.log("零担(LTL)订单端到端全流程测试 100% 通过！");
  console.log(`${"🎉".repeat(30)}`);
  console.log(`\n测试摘要:`);
  console.log(`  合并计划号: ${TEST_MERGED_PLAN}`);
  console.log(`  订单ID: [${createdIds.join(", ")}]`);
  console.log(`  路线: 佛山 → 武汉`);
  console.log(`  总重量: 8吨 (5+3)`);
  console.log(`  总运费: ¥3240 (2100+1140)`);
  console.log(`  总费用: ¥3540 (2300+1240)`);
  console.log(`  零担派车批次: ${batchResult.batchCode} (已创建并删除)`);
  console.log(`  流程: 录单→询价→确认询价(排他取消)→派车发运(自动dispatched)→费用录入→送达→签收→回单收回`);
  console.log(`  全部10个步骤验证通过，数据一致性确认无误`);
}

main().catch(err => {
  console.error("\n❌ 测试失败:", err.message);
  process.exit(1);
});
