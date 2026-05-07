/**
 * 外请单票订单端到端全流程集成测试
 * 
 * 通过HTTP直接调用运行中的服务器，用真实数据库走完完整链路：
 * 录单→定价→找车（不触发审批）→派车→送达→签收→回单寄出→退押金
 * 
 * 测试单票（非合并）外请订单，验证：
 * - 单票订单无需合并计划号
 * - 运费不分摊（整单记录）
 * - 押金不分摊（整单记录）
 * - 找车报价 ≤ 定价时不触发审批，直接派车
 * - 回单寄出后允许退押金
 * - 退押金金额正确
 */
import { SignJWT } from "jose";
const BASE_URL = "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET;
const APP_ID = process.env.VITE_APP_ID || "mS2VsvFppKLrYJLaNH3ZGb";

// Admin用户信息（指挥台角色）
const ADMIN_OPEN_ID = "fdtVZoPtAMyzUVwS6JAc5x";
const ADMIN_NAME = "Wenyu Chen";

// 外请调度员张三（广东/广西/湖南区域）
const DISPATCHER_OPEN_ID = "local_test_waiqing_1772164361091";
const DISPATCHER_NAME = "外请调度员张三";
const DISPATCHER_ID = 210701;

// 测试数据：单票外请订单
const TEST_ORDER = {
  orderNumber: `SINGLE-${Date.now()}`,
  customerName: "单票E2E测试客户",
  originCity: "佛山",
  destinationCity: "长沙",
  weight: "12000",  // 12吨
  cargoName: "瓷砖",
  customerPrice: "6000",
  quotedPrice: "5000",  // 定价5000
  deliveryAddress: "长沙市岳麓区某仓库",
  receiverName: "单票收货人",
  receiverPhone: "13900001111",
  shippingNote: "单票测试订单",
};

// 找车报价（≤ 定价5000，不触发审批）
const FREIGHT = "4800";
// 押金
const DEPOSIT = "300";

// ========== 辅助函数 ==========
async function generateToken(openId, name) {
  const secretKey = new TextEncoder().encode(JWT_SECRET);
  const token = await new SignJWT({ openId, appId: APP_ID, name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor((Date.now() + 86400000) / 1000))
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
  console.log("🚚 外请单票订单端到端全流程集成测试");
  console.log(`订单号: ${TEST_ORDER.orderNumber}`);
  console.log(`路线: ${TEST_ORDER.originCity} → ${TEST_ORDER.destinationCity}`);
  console.log(`重量: ${parseInt(TEST_ORDER.weight)/1000}吨`);
  console.log(`定价: ¥${TEST_ORDER.quotedPrice}`);
  console.log(`找车报价: ¥${FREIGHT}（≤定价，不触发审批）`);
  console.log(`押金: ¥${DEPOSIT}`);

  const adminToken = await generateToken(ADMIN_OPEN_ID, ADMIN_NAME);
  const dispatcherToken = await generateToken(DISPATCHER_OPEN_ID, DISPATCHER_NAME);

  let orderId;
  let podId;

  // ========== 步骤1: 录单 ==========
  log(1, "录单 - 创建1个外请单票订单（无合并计划号）");
  const createResult = await trpcCall("order.create", {
    orderNumber: TEST_ORDER.orderNumber,
    customerName: TEST_ORDER.customerName,
    originCity: TEST_ORDER.originCity,
    destinationCity: TEST_ORDER.destinationCity,
    weight: TEST_ORDER.weight,
    cargoName: TEST_ORDER.cargoName,
    customerPrice: TEST_ORDER.customerPrice,
    deliveryAddress: TEST_ORDER.deliveryAddress,
    receiverName: TEST_ORDER.receiverName,
    receiverPhone: TEST_ORDER.receiverPhone,
    shippingNote: TEST_ORDER.shippingNote,
    businessType: "outsource",
    // 不设置mergedPlanNumber，单票订单
  }, adminToken);
  orderId = createResult.id;
  console.log(`  创建订单 #${orderId}: ${TEST_ORDER.orderNumber} (${parseInt(TEST_ORDER.weight)/1000}吨)`);

  // 验证初始状态
  const order1 = await trpcQuery("order.getById", { id: orderId }, adminToken);
  check(order1.status === "pending_price", `订单 #${orderId} 初始状态为 pending_price`);
  check(order1.businessType === "outsource", `订单 #${orderId} 业务类型为 outsource`);
  check(!order1.mergedPlanNumber, `订单 #${orderId} 无合并计划号（单票订单）`);

  // ========== 步骤2: 定价 ==========
  log(2, "定价 - 指挥台为订单定价（quotedPrice=¥5000）");
  await trpcCall("order.priceAndAssign", {
    orderId: orderId,
    dispatchPrice: TEST_ORDER.quotedPrice,
  }, adminToken);

  const order2 = await trpcQuery("order.getById", { id: orderId }, adminToken);
  check(order2.status === "pending_vehicle", `订单 #${orderId} 状态变为 pending_vehicle`);
  check(parseFloat(order2.dispatchPrice) === 5000, `订单 #${orderId} 调度价为 ¥5000`);
  check(order2.assignedDispatcherId === DISPATCHER_ID, `订单 #${orderId} 自动分配给外请调度员张三（ID: ${DISPATCHER_ID}）`);

  // ========== 步骤3: 找车 - 不触发审批 ==========
  log(3, "找车 - 报价¥4800（≤定价¥5000，不触发审批，直接派车）");
  const dispatchResult = await trpcCall("order.batchDispatch", {
    orderIds: [orderId],
    plateNumber: "粤A99999",
    driverName: "外请司机王五",
    driverPhone: "13700009999",
    totalFreight: FREIGHT,
    depositAmount: DEPOSIT,
    depositRefundable: true,
  }, dispatcherToken);
  console.log(`  派车结果: ${dispatchResult.count}/${dispatchResult.total}`);
  check(dispatchResult.count === 1, "派车成功");

  // 验证直接派车（不走审批）
  const order3 = await trpcQuery("order.getById", { id: orderId }, adminToken);
  check(order3.status === "dispatched", `订单 #${orderId} 状态直接变为 dispatched（不走审批）`);
  check(order3.plateNumber === "粤A99999", `订单 #${orderId} 车牌号正确`);
  check(order3.driverName === "外请司机王五", `订单 #${orderId} 司机姓名正确`);
  check(parseFloat(order3.actualFreight) === 4800, `订单 #${orderId} 运费 ¥4800（不分摊，整单记录）`);
  check(parseFloat(order3.depositAmount) === 300, `订单 #${orderId} 押金 ¥300（不分摊，整单记录）`);
  check(order3.depositStatus === "paid", `订单 #${orderId} 押金状态为 paid`);
  check(order3.dispatchDate !== null, `订单 #${orderId} 派车日期已设置`);

  // 验证回单记录自动创建
  const pods3 = await trpcQuery("pod.list", { page: 1, pageSize: 10, keyword: TEST_ORDER.orderNumber }, adminToken);
  check(pods3.items.length === 1, `回单记录已自动创建 (实际: ${pods3.items.length})`);
  podId = pods3.items[0].id;
  check(pods3.items[0].originalStatus === "pending", `回单 #${podId} 初始状态为 pending`);

  // ========== 步骤4: 送达 ==========
  log(4, "送达 - dispatched → delivered");
  await trpcCall("order.batchUpdateStatus", {
    orderIds: [orderId],
    status: "delivered",
  }, adminToken);

  const order4 = await trpcQuery("order.getById", { id: orderId }, adminToken);
  check(order4.status === "delivered", `订单 #${orderId} 状态为 delivered`);
  check(order4.deliveryDate !== null, `订单 #${orderId} 送达日期已设置`);

  // ========== 步骤5: 签收 ==========
  log(5, "签收 - delivered → signed");
  await trpcCall("order.batchUpdateStatus", {
    orderIds: [orderId],
    status: "signed",
  }, adminToken);

  const order5 = await trpcQuery("order.getById", { id: orderId }, adminToken);
  check(order5.status === "signed", `订单 #${orderId} 状态为 signed`);
  check(order5.signedDate !== null, `订单 #${orderId} 签收日期已设置`);

  // ========== 步骤6: 回单寄出 ==========
  log(6, "回单寄出 - 标记回单为 sent");
  await trpcCall("pod.updateStatus", {
    id: podId,
    originalStatus: "sent",
  }, adminToken);

  const pod6 = await trpcQuery("pod.list", { page: 1, pageSize: 10, keyword: TEST_ORDER.orderNumber }, adminToken);
  check(pod6.items[0].originalStatus === "sent", `回单 #${podId} 状态为 sent`);
  check(pod6.items[0].originalSentAt !== null, `回单 #${podId} 寄出时间已设置`);

  // ========== 步骤7: 退押金 ==========
  log(7, "退押金 - 单票订单退押金");

  // 单票订单没有mergedPlanNumber，直接按orderId退押金
  const refundResult = await trpcCall("order.batchRefundDeposit", {
    ids: [orderId],
  }, adminToken);
  console.log(`  退押金结果: ${JSON.stringify(refundResult)}`);
  check(refundResult.count === 1, "退押金成功");

  // 验证退押金后状态
  const order7 = await trpcQuery("order.getById", { id: orderId }, adminToken);
  check(order7.depositStatus === "refunded", `订单 #${orderId} 押金状态为 refunded`);
  check(order7.depositRefundDate !== null, `订单 #${orderId} 退押金日期已设置`);

  // 验证回单记录同步
  const pod7 = await trpcQuery("pod.list", { page: 1, pageSize: 10, keyword: TEST_ORDER.orderNumber }, adminToken);
  check(pod7.items[0].depositRefunded === true || pod7.items[0].depositRefunded === 1, `回单 #${podId} depositRefunded 已同步`);

  // ========== 步骤8: 最终验证 ==========
  log(8, "最终验证 - 全流程数据一致性检查");
  const finalOrder = await trpcQuery("order.getById", { id: orderId }, adminToken);
  console.log(`  订单 #${orderId}:`);
  console.log(`    状态: ${finalOrder.status}`);
  console.log(`    业务类型: ${finalOrder.businessType}`);
  console.log(`    运费: ¥${finalOrder.actualFreight}`);
  console.log(`    押金: ¥${finalOrder.depositAmount} (${finalOrder.depositStatus})`);
  console.log(`    车牌: ${finalOrder.plateNumber}`);
  console.log(`    司机: ${finalOrder.driverName}`);
  console.log(`    调度价: ¥${finalOrder.dispatchPrice}`);
  console.log(`    客户价: ¥${finalOrder.customerPrice}`);
  console.log(`    派车日期: ${finalOrder.dispatchDate}`);
  console.log(`    送达日期: ${finalOrder.deliveryDate}`);
  console.log(`    签收日期: ${finalOrder.signedDate}`);
  console.log(`    退押金日期: ${finalOrder.depositRefundDate}`);

  check(finalOrder.status === "signed", `最终状态为 signed`);
  check(finalOrder.businessType === "outsource", `业务类型为 outsource`);
  check(parseFloat(finalOrder.actualFreight) === 4800, `运费 ¥4800 正确`);
  check(parseFloat(finalOrder.depositAmount) === 300, `押金 ¥300 正确`);
  check(finalOrder.depositStatus === "refunded", `押金已退还`);
  check(finalOrder.plateNumber === "粤A99999", `车牌号一致`);
  check(finalOrder.driverName === "外请司机王五", `司机姓名一致`);
  check(parseFloat(finalOrder.dispatchPrice) === 5000, `调度价 ¥5000 正确`);
  check(parseFloat(finalOrder.customerPrice) === 6000, `客户价 ¥6000 正确`);
  check(finalOrder.dispatchDate !== null, `派车日期存在`);
  check(finalOrder.deliveryDate !== null, `送达日期存在`);
  check(finalOrder.signedDate !== null, `签收日期存在`);
  check(finalOrder.depositRefundDate !== null, `退押金日期存在`);
  check(!finalOrder.mergedPlanNumber, `无合并计划号（单票订单）`);

  // 利润计算验证
  const profit = parseFloat(finalOrder.customerPrice) - parseFloat(finalOrder.actualFreight);
  console.log(`  利润: ¥${profit} (客户价¥6000 - 运费¥4800)`);
  check(profit === 1200, `利润 ¥1200 正确`);

  console.log(`\n${"🎉".repeat(30)}`);
  console.log("外请单票订单端到端全流程测试 100% 通过！");
  console.log(`${"🎉".repeat(30)}`);
  console.log("测试摘要:");
  console.log(`  订单号: ${TEST_ORDER.orderNumber}`);
  console.log(`  订单ID: ${orderId}`);
  console.log(`  路线: 佛山 → 长沙`);
  console.log(`  重量: 12吨`);
  console.log(`  客户价: ¥6000 | 定价: ¥5000 | 运费: ¥4800 | 利润: ¥1200`);
  console.log(`  押金: ¥300 → 已退还`);
  console.log(`  流程: 录单→定价→找车(不走审批)→派车→送达→签收→回单寄出→退押金`);
  console.log(`  全部8个步骤验证通过，数据一致性确认无误`);
}

main().catch(err => {
  console.error("\n❌ 测试失败:", err.message);
  process.exit(1);
});
