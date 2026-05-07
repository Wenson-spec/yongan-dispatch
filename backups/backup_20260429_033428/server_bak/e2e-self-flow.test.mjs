/**
 * 端到端自运合并订单全流程集成测试
 * 
 * 通过HTTP直接调用运行中的服务器，用真实数据库走完完整链路：
 * 录单→派车→送达→签收→回单直接收回（跳过寄出）
 * 
 * 测试合并订单（3个自运子订单，不同重量），验证：
 * - 自运订单初始状态为 pending_dispatch
 * - 整组派车运费按重量比例分摊（无押金）
 * - 派车时自动创建回单记录
 * - 送达/签收状态正确流转
 * - 自运回单直接从pending→received（跳过sent，司机直接上交）
 * - 全流程数据一致性
 */
import { SignJWT } from "jose";

const BASE_URL = "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET;
const APP_ID = process.env.VITE_APP_ID || "mS2VsvFppKLrYJLaNH3ZGb";

// Admin用户信息
const ADMIN_OPEN_ID = "fdtVZoPtAMyzUVwS6JAc5x";
const ADMIN_NAME = "Wenyu Chen";

// 测试数据：合并计划号 + 3个自运子订单（不同重量）
const TEST_MERGED_PLAN = `E2E-SELF-${Date.now()}`;
const TEST_ORDERS = [
  {
    orderNumber: `SELF-A-${Date.now()}`,
    customerName: "自运全流程测试客户",
    originCity: "广州",
    destinationCity: "深圳",
    weight: "20000",  // 20吨
    cargoName: "建材",
    customerPrice: "6000",
    deliveryAddress: "深圳市南山区某仓库",
    receiverName: "赵收货",
    receiverPhone: "13900001111",
    shippingNote: "自运车辆，注意安全",
  },
  {
    orderNumber: `SELF-B-${Date.now()}`,
    customerName: "自运全流程测试客户",
    originCity: "广州",
    destinationCity: "深圳",
    weight: "12000",  // 12吨
    cargoName: "建材",
    customerPrice: "4000",
    deliveryAddress: "深圳市宝安区某仓库",
    receiverName: "钱收货",
    receiverPhone: "13900002222",
    shippingNote: "需要人工卸货",
  },
  {
    orderNumber: `SELF-C-${Date.now()}`,
    customerName: "自运全流程测试客户",
    originCity: "广州",
    destinationCity: "深圳",
    weight: "8000",   // 8吨
    cargoName: "建材",
    customerPrice: "2500",
    deliveryAddress: "深圳市龙岗区某仓库",
    receiverName: "孙收货",
    receiverPhone: "13900003333",
    shippingNote: "提前联系",
  },
];

// 总运费（自运车辆的运费）
const TOTAL_FREIGHT = "10000";
// 自运车辆信息
const PLATE_NUMBER = "粤B88888";
const DRIVER_NAME = "自运司机李四";
const DRIVER_PHONE = "13700001234";

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
  console.log("\n🚛 自运合并订单端到端全流程集成测试");
  console.log(`合并计划号: ${TEST_MERGED_PLAN}`);
  console.log(`子订单数: ${TEST_ORDERS.length}`);
  console.log(`总运费: ¥${TOTAL_FREIGHT}`);
  console.log(`车牌: ${PLATE_NUMBER}, 司机: ${DRIVER_NAME}`);
  console.log(`重量分布: ${TEST_ORDERS.map(o => o.weight / 1000 + "吨").join(", ")} (总${TEST_ORDERS.reduce((s, o) => s + parseInt(o.weight), 0) / 1000}吨)`);

  const adminToken = await generateToken(ADMIN_OPEN_ID, ADMIN_NAME);

  // ========== 步骤1: 录单 - 创建3个自运合并订单 ==========
  log(1, "录单 - 创建3个自运合并订单");
  const createdIds = [];
  for (const order of TEST_ORDERS) {
    const result = await trpcCall("order.create", {
      ...order,
      businessType: "self",
      mergedPlanNumber: TEST_MERGED_PLAN,
      isUrgent: false,
    }, adminToken);
    createdIds.push(result.id);
    console.log(`  创建订单 #${result.id}: ${order.orderNumber} (${order.weight / 1000}吨)`);
  }
  check(createdIds.length === 3, `成功创建3个订单: [${createdIds.join(", ")}]`);

  // 验证初始状态
  for (const id of createdIds) {
    const detail = await trpcQuery("order.getById", { id }, adminToken);
    check(detail.status === "pending_dispatch", `订单 #${id} 初始状态为 pending_dispatch`);
    check(detail.businessType === "self", `订单 #${id} 业务类型为 self`);
    check(detail.mergedPlanNumber === TEST_MERGED_PLAN, `订单 #${id} 合并计划号正确`);
  }

  // ========== 步骤2: 整组派车 - 自运订单直接派车（无需定价/找车/审批）==========
  log(2, "整组派车 - pending_dispatch → dispatched（含运费分摊，无押金）");
  const dispatchResult = await trpcCall("order.batchUpdateStatus", {
    orderIds: createdIds,
    status: "dispatched",
    plateNumber: PLATE_NUMBER,
    driverName: DRIVER_NAME,
    driverPhone: DRIVER_PHONE,
    actualFreight: TOTAL_FREIGHT,
    // 自运订单不收押金
  }, adminToken);
  check(dispatchResult.success, `整组派车成功: ${dispatchResult.count}/${dispatchResult.total}`);
  check(dispatchResult.count === 3, "3个订单全部派车成功");

  // ========== 步骤3: 验证派车后的数据 ==========
  log(3, "验证派车后数据：运费分摊、状态、回单记录");
  
  // 总重量 = 20 + 12 + 8 = 40吨
  // 运费分摊比例：20/40=50%, 12/40=30%, 8/40=20%
  // 预期分摊：¥5000, ¥3000, ¥2000
  const expectedFreights = [5000, 3000, 2000];
  
  for (let i = 0; i < createdIds.length; i++) {
    const detail = await trpcQuery("order.getById", { id: createdIds[i] }, adminToken);
    check(detail.status === "dispatched", `订单 #${createdIds[i]} 状态为 dispatched`);
    check(detail.plateNumber === PLATE_NUMBER, `订单 #${createdIds[i]} 车牌号正确`);
    check(detail.driverName === DRIVER_NAME, `订单 #${createdIds[i]} 司机姓名正确`);
    
    const actualFreight = parseFloat(detail.actualFreight || "0");
    check(actualFreight === expectedFreights[i], 
      `订单 #${createdIds[i]} 运费分摊正确: ¥${actualFreight} (预期¥${expectedFreights[i]})`);
    
    // 自运订单不应有押金
    const depositAmount = parseFloat(detail.depositAmount || "0");
    check(depositAmount === 0, `订单 #${createdIds[i]} 无押金: ¥${depositAmount}`);
    
    check(detail.dispatchDate !== null, `订单 #${createdIds[i]} 派车日期已设置`);
  }

  // 验证回单记录自动创建
  const podListResult = await trpcQuery("pod.list", { pageSize: 100 }, adminToken);
  const testPods = podListResult.items.filter(p => createdIds.includes(p.orderId));
  check(testPods.length === 3, `3个回单记录已自动创建 (实际: ${testPods.length})`);
  for (const pod of testPods) {
    check(pod.originalStatus === "pending", `回单 #${pod.id} 初始状态为 pending`);
  }

  // ========== 步骤4: 送达 - 标记已送达 ==========
  log(4, "送达 - dispatched → delivered");
  const deliverResult = await trpcCall("order.batchUpdateStatus", {
    orderIds: createdIds,
    status: "delivered",
  }, adminToken);
  check(deliverResult.success, `整组送达成功: ${deliverResult.count}/${deliverResult.total}`);

  for (const id of createdIds) {
    const detail = await trpcQuery("order.getById", { id }, adminToken);
    check(detail.status === "delivered", `订单 #${id} 状态为 delivered`);
    check(detail.deliveryDate !== null, `订单 #${id} 送达日期已设置`);
  }

  // ========== 步骤5: 签收 - 确认签收 ==========
  log(5, "签收 - delivered → signed");
  const signResult = await trpcCall("order.batchUpdateStatus", {
    orderIds: createdIds,
    status: "signed",
  }, adminToken);
  check(signResult.success, `整组签收成功: ${signResult.count}/${signResult.total}`);

  for (const id of createdIds) {
    const detail = await trpcQuery("order.getById", { id }, adminToken);
    check(detail.status === "signed", `订单 #${id} 状态为 signed`);
    check(detail.signedDate !== null, `订单 #${id} 签收日期已设置`);
  }

  // ========== 步骤6: 自运回单直接收回 - 跳过寄出环节，从pending直接→received ==========
  log(6, "自运回单直接收回 - pending → received（跳过sent环节）");
  
  // 重新获取回单列表（确保拿到最新数据）
  const podListAfterSign = await trpcQuery("pod.list", { pageSize: 100 }, adminToken);
  const testPodsAfterSign = podListAfterSign.items.filter(p => createdIds.includes(p.orderId));
  
  // 验证回单当前状态为pending
  for (const pod of testPodsAfterSign) {
    check(pod.originalStatus === "pending", `回单 #${pod.id} 当前状态为 pending`);
  }

  // 验证回单进度（收回前）
  const progressBefore = await trpcQuery("pod.checkGroupsReceived", {
    mergedPlanNumbers: [TEST_MERGED_PLAN],
  }, adminToken);
  const progressPre = progressBefore[TEST_MERGED_PLAN];
  check(progressPre !== undefined, `合并组 ${TEST_MERGED_PLAN} 进度数据存在`);
  check(progressPre.sentCount === 0, `收回前已寄出数: ${progressPre.sentCount}/0（自运不需寄出）`);
  check(progressPre.receivedCount === 0, `收回前已收到数: ${progressPre.receivedCount}/0`);
  check(progressPre.allSent === false, `allSent = false（未寄出）`);
  check(progressPre.allReceived === false, `allReceived = false（未收到）`);

  // 自运订单回单直接从pending→received（跳过sent）
  for (const pod of testPodsAfterSign) {
    await trpcCall("pod.updateStatus", {
      id: pod.id,
      originalStatus: "received",
    }, adminToken);
    console.log(`  回单 #${pod.id} (订单 #${pod.orderId}) 直接标记为 received（跳过sent）`);
  }

  // 验证回单收回状态
  const podListAfterReceived = await trpcQuery("pod.list", { pageSize: 100 }, adminToken);
  const testPodsAfterReceived = podListAfterReceived.items.filter(p => createdIds.includes(p.orderId));
  for (const pod of testPodsAfterReceived) {
    check(pod.originalStatus === "received", `回单 #${pod.id} 状态为 received`);
    check(pod.originalReceivedAt !== null, `回单 #${pod.id} 收到时间已设置`);
    // 自运订单跳过sent，所以originalSentAt应该为null
    check(pod.originalSentAt === null, `回单 #${pod.id} 寄出时间为null（自运跳过寄出）`);
  }

  // 验证回单进度更新
  const progressAfterReceived = await trpcQuery("pod.checkGroupsReceived", {
    mergedPlanNumbers: [TEST_MERGED_PLAN],
  }, adminToken);
  const progressFinal = progressAfterReceived[TEST_MERGED_PLAN];
  check(progressFinal.sentCount === 0, `最终已寄出数: ${progressFinal.sentCount}/0（自运不需寄出）`);
  check(progressFinal.receivedCount === 3, `最终已收到数: ${progressFinal.receivedCount}/3`);
  check(progressFinal.allSent === false, `最终allSent = false（自运未经过寄出）`);
  check(progressFinal.allReceived === true, `最终allReceived = true（全部收到）`);

  // ========== 步骤8: 最终验证 - 全流程数据一致性检查 ==========
  log(8, "最终验证 - 全流程数据一致性检查");
  
  let totalFreightVerify = 0;
  for (let i = 0; i < createdIds.length; i++) {
    const detail = await trpcQuery("order.getById", { id: createdIds[i] }, adminToken);
    const freight = parseFloat(detail.actualFreight || "0");
    totalFreightVerify += freight;
    
    console.log(`  订单 #${createdIds[i]}:`);
    console.log(`    状态: ${detail.status}`);
    console.log(`    业务类型: ${detail.businessType}`);
    console.log(`    运费: ¥${freight}`);
    console.log(`    车牌: ${detail.plateNumber}`);
    console.log(`    司机: ${detail.driverName}`);
    console.log(`    派车日期: ${detail.dispatchDate}`);
    console.log(`    送达日期: ${detail.deliveryDate}`);
    console.log(`    签收日期: ${detail.signedDate}`);
    
    // 最终状态验证
    check(detail.status === "signed", `订单 #${createdIds[i]} 最终状态为 signed`);
    check(detail.businessType === "self", `订单 #${createdIds[i]} 业务类型为 self`);
    check(detail.plateNumber === PLATE_NUMBER, `订单 #${createdIds[i]} 车牌号一致`);
    check(detail.driverName === DRIVER_NAME, `订单 #${createdIds[i]} 司机姓名一致`);
    check(detail.dispatchDate !== null, `订单 #${createdIds[i]} 派车日期存在`);
    check(detail.deliveryDate !== null, `订单 #${createdIds[i]} 送达日期存在`);
    check(detail.signedDate !== null, `订单 #${createdIds[i]} 签收日期存在`);
  }
  
  // 验证运费总和
  check(totalFreightVerify === parseFloat(TOTAL_FREIGHT), 
    `运费总和正确: ¥${totalFreightVerify} = ¥${TOTAL_FREIGHT}`);

  // ========== 测试完成 ==========
  console.log(`\n${"🎉".repeat(30)}`);
  console.log("自运合并订单端到端全流程测试 100% 通过！");
  console.log(`${"🎉".repeat(30)}`);
  console.log(`\n测试摘要:`);
  console.log(`  合并计划号: ${TEST_MERGED_PLAN}`);
  console.log(`  订单ID: [${createdIds.join(", ")}]`);
  console.log(`  总重量: 40吨 (20+12+8)`);
  console.log(`  总运费: ¥${TOTAL_FREIGHT} (分摊: ¥5000+¥3000+¥2000)`);
  console.log(`  流程: 录单→派车→送达→签收→回单直接收回（跳过寄出）`);
  console.log(`  全部8个步骤验证通过，数据一致性确认无误`);
}

main().catch(err => {
  console.error("\n❌ 测试失败:", err.message);
  process.exit(1);
});
