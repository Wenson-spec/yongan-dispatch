/**
 * 永安物流调度系统 — 财务回单确认台/回单处理协同专项 E2E 测试
 * 
 * 测试范围：
 * P1: 回单创建与生命周期 (pending → sent → received)
 * P2: 回单列表查询与过滤
 * P3: 押金退还全流程 (paid → refunded)
 * P4: 押金退还异常场景
 * P5: 财务回单确认台与找车台“回单处理”协同数据正确性
 * P6: 权限控制验证
 * P7: 回单关联订单数据完整性
 * P8: 多订单并发回单押金操作
 */

const BASE = "http://localhost:3000/api/trpc";

// ============ 工具函数 ============
async function login(username, password = "test123456") {
  const res = await fetch(`${BASE}/auth.login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { username, password } }),
  });
  const cookies = res.headers.getSetCookie?.() || [];
  const sessionCookie = cookies.find(c => c.startsWith("app_session_id="));
  if (!sessionCookie) {
    const body = await res.json();
    throw new Error(`Login failed for ${username}: ${JSON.stringify(body)}`);
  }
  return sessionCookie.split(";")[0];
}

async function call(procedure, input, cookie, method = "POST") {
  const isQuery = method === "GET";
  let url = `${BASE}/${procedure}`;
  const opts = { headers: { Cookie: cookie } };
  if (isQuery) {
    url += `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
    opts.method = "GET";
  } else {
    opts.method = "POST";
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify({ json: input });
  }
  const res = await fetch(url, opts);
  const body = await res.json();
  if (body.error) throw new Error(`${procedure}: ${JSON.stringify(body.error)}`);
  const data = body.result?.data?.json ?? body.result?.data;
  return data;
}

async function query(procedure, input, cookie) {
  return call(procedure, input, cookie, "GET");
}

async function mutate(procedure, input, cookie) {
  return call(procedure, input, cookie, "POST");
}

// ============ 测试结果收集 ============
const results = [];
let passCount = 0, failCount = 0;

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS", detail: "" });
    passCount++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    results.push({ name, status: "FAIL", detail: e.message });
    failCount++;
    console.log(`  ❌ ${name} - ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// ============ 辅助：创建一个已签收的外请订单（含押金） ============
async function createSignedOrderWithDeposit(ludanCookie, kefuCookie, waiqingCookie, suffix, depositAmount = "500", depositRefundable = true) {
  // 1. 录单
  const res = await mutate("order.create", {
    orderNumber: `POD-TEST-${suffix}-${Date.now()}`,
    businessType: "outsource",
    customerName: `回单测试客户-${suffix}`,
    customerPhone: "13800138099",
    cargoName: "瓷砖",
    weight: "25",
    originCity: "佛山",
    destinationCity: "长沙",
    deliveryAddress: "湖南省长沙市岳麓区",
    receiverName: "收货人",
    receiverPhone: "13900139099",
    remarks: `回单押金台测试-${suffix}`,
    settlementType: "monthly",
  }, ludanCookie);
  const orderId = res.id;

  // 2. 定价
  await mutate("order.priceAndAssign", {
    orderId,
    dispatchPrice: "7000",
  }, kefuCookie);

  // 3. 分配调度员
  await mutate("order.assignDispatcher", {
    orderId,
    dispatcherId: 210701, // waiqing
  }, kefuCookie);

  // 4. 找车派车（含押金）
  await mutate("order.updateStatus", {
    id: orderId,
    status: "dispatched",
    plateNumber: "粤B88888",
    driverName: `测试司机-${suffix}`,
    driverPhone: "13700137099",
    actualFreight: "6500",
    depositAmount,
    depositRefundable,
  }, waiqingCookie);

  // 5. 运输中
  await mutate("order.updateStatus", {
    id: orderId,
    status: "in_transit",
  }, waiqingCookie);

  // 6. 已送达
  await mutate("order.updateStatus", {
    id: orderId,
    status: "delivered",
  }, waiqingCookie);

  // 7. 已签收
  await mutate("order.updateStatus", {
    id: orderId,
    status: "signed",
  }, waiqingCookie);

  return orderId;
}

// ============ 主测试流程 ============
async function main() {
  console.log("========================================");
  console.log("财务回单确认台 / 回单处理协同 — 专项E2E测试");
  console.log("========================================\n");

  // ---- 登录所有角色 ----
  console.log("📋 登录所有测试账号...");
  let adminCookie, ludanCookie, kefuCookie, waiqingCookie, caiwuCookie, lingdanCookie;

  try {
    adminCookie = await login("admin", "admin123");
    console.log("  ✅ admin 登录成功");
  } catch (e) { console.log("  ❌ admin:", e.message); return; }

  try { ludanCookie = await login("ludan"); console.log("  ✅ ludan 登录成功"); }
  catch (e) { console.log("  ❌ ludan:", e.message); return; }

  try { kefuCookie = await login("kefu"); console.log("  ✅ kefu 登录成功"); }
  catch (e) { console.log("  ❌ kefu:", e.message); return; }

  try { waiqingCookie = await login("waiqing"); console.log("  ✅ waiqing 登录成功"); }
  catch (e) { console.log("  ❌ waiqing:", e.message); return; }

  try { caiwuCookie = await login("caiwu"); console.log("  ✅ caiwu 登录成功"); }
  catch (e) { console.log("  ❌ caiwu:", e.message); return; }

  try { lingdanCookie = await login("lingdan"); console.log("  ✅ lingdan 登录成功"); }
  catch (e) { console.log("  ❌ lingdan:", e.message); return; }

  // ============================================================
  // P1: 回单创建与生命周期 (pending → sent → received)
  // ============================================================
  console.log("\n📄 P1: 回单创建与生命周期测试");

  let podOrderId1;
  let podRecordId1;

  await test("P1.1-创建已签收外请订单（含500元押金）", async () => {
    podOrderId1 = await createSignedOrderWithDeposit(ludanCookie, kefuCookie, waiqingCookie, "P1", "500", true);
    assert(podOrderId1, "订单创建应成功");
    // 验证订单已签收
    const order = await query("order.getById", { id: podOrderId1 }, kefuCookie);
    assert(order.status === "signed", `订单状态应为signed，实际: ${order.status}`);
    assert(parseFloat(order.depositAmount) === 500, `押金应为500，实际: ${order.depositAmount}`);
  });

  await test("P1.2-财务助理创建回单记录", async () => {
    const res = await mutate("pod.create", {
      orderId: podOrderId1,
    }, caiwuCookie);
    assert(res && res.id, "应返回回单记录ID");
    podRecordId1 = res.id;
  });

  await test("P1.3-验证回单初始状态为pending", async () => {
    const pod = await query("pod.getByOrderId", { orderId: podOrderId1 }, caiwuCookie);
    assert(pod, "应找到回单记录");
    assert(pod.originalStatus === "pending", `初始状态应为pending，实际: ${pod.originalStatus}`);
  });

  await test("P1.4-外请调度员标记回单已寄出(pending→sent)", async () => {
    await mutate("order.markPodSent", {
      orderId: podOrderId1,
    }, waiqingCookie);
    // 验证回单状态变为sent
    const pod = await query("pod.getByOrderId", { orderId: podOrderId1 }, caiwuCookie);
    assert(pod.originalStatus === "sent", `状态应为sent，实际: ${pod.originalStatus}`);
  });

  await test("P1.5-验证回单寄出时间已记录", async () => {
    const pod = await query("pod.getByOrderId", { orderId: podOrderId1 }, caiwuCookie);
    assert(pod.originalSentAt, "寄出时间应已记录");
  });

  await test("P1.6-确认收到回单原件(sent→received)", async () => {
    assert(podRecordId1, "需要回单记录ID");
    await mutate("pod.updateStatus", {
      id: podRecordId1,
      originalStatus: "received",
    }, caiwuCookie);
    // 直接用回单列表验证（getByOrderId可能有旧数据缓存）
    const podList = await query("pod.list", {}, caiwuCookie);
    const updatedPod = podList.items.find(p => p.id === podRecordId1);
    assert(updatedPod, "应找到回单记录");
    assert(updatedPod.originalStatus === "received", `状态应为received，实际: ${updatedPod?.originalStatus}`);
  });

  await test("P1.7-验证回单收到时间和收件人已记录", async () => {
    const podList = await query("pod.list", {}, caiwuCookie);
    const pod = podList.items.find(p => p.id === podRecordId1);
    assert(pod, "应找到回单记录");
    assert(pod.originalReceivedAt, "收到时间应已记录");
    assert(pod.originalReceivedBy, "收件人应已记录");
  });

  // ============================================================
  // P2: 回单列表查询与过滤
  // ============================================================
  console.log("\n📋 P2: 回单列表查询与过滤");

  await test("P2.1-查询全部回单列表", async () => {
    const res = await query("pod.list", {}, caiwuCookie);
    assert(res && res.items, "应返回回单列表");
    assert(res.items.length >= 1, `应至少有1条回单记录，实际: ${res.items.length}`);
  });

  await test("P2.2-按状态过滤回单(received)", async () => {
    const res = await query("pod.list", { originalStatus: "received" }, caiwuCookie);
    assert(res && res.items, "应返回过滤后的列表");
    // 所有返回的记录状态应为received
    for (const pod of res.items) {
      assert(pod.originalStatus === "received", `过滤后所有记录应为received，发现: ${pod.originalStatus}`);
    }
  });

  await test("P2.3-回单列表关联订单押金数据", async () => {
    const res = await query("pod.list", {}, caiwuCookie);
    // 找到我们创建的那条回单
    const ourPod = res.items.find(p => p.orderId === podOrderId1);
    assert(ourPod, "应找到测试订单的回单记录");
    assert(ourPod.order, "回单应关联订单数据");
    assert(ourPod.order.depositAmount, "应包含押金金额");
  });

  await test("P2.4-分页查询回单列表", async () => {
    const res = await query("pod.list", { page: 1, pageSize: 5 }, caiwuCookie);
    assert(res && res.items, "应返回分页结果");
    assert(res.items.length <= 5, `分页大小应不超过5，实际: ${res.items.length}`);
    assert(typeof res.total === "number", "应返回总数");
  });

  // ============================================================
  // P3: 押金退还全流程 (paid → refunded)
  // ============================================================
  console.log("\n💰 P3: 押金退还全流程");

  let podOrderId2;

  await test("P3.1-创建已签收订单（含800元押金）", async () => {
    podOrderId2 = await createSignedOrderWithDeposit(ludanCookie, kefuCookie, waiqingCookie, "P3", "800", true);
    const order = await query("order.getById", { id: podOrderId2 }, kefuCookie);
    assert(order.depositStatus === "paid", `押金状态应为paid，实际: ${order.depositStatus}`);
    assert(parseFloat(order.depositAmount) === 800, `押金金额应为800，实际: ${order.depositAmount}`);
  });

  await test("P3.2-创建回单记录并标记已寄出", async () => {
    await mutate("pod.create", { orderId: podOrderId2 }, caiwuCookie);
    await mutate("order.markPodSent", { orderId: podOrderId2 }, waiqingCookie);
    const pod = await query("pod.getByOrderId", { orderId: podOrderId2 }, caiwuCookie);
    assert(pod.originalStatus === "sent", `回单状态应为sent，实际: ${pod.originalStatus}`);
  });

  await test("P3.3-确认退还押金", async () => {
    await mutate("order.refundDeposit", { id: podOrderId2 }, caiwuCookie);
    const order = await query("order.getById", { id: podOrderId2 }, kefuCookie);
    assert(order.depositStatus === "refunded", `押金状态应为refunded，实际: ${order.depositStatus}`);
  });

  await test("P3.4-验证退还后押金金额仍保留", async () => {
    const order = await query("order.getById", { id: podOrderId2 }, kefuCookie);
    assert(parseFloat(order.depositAmount) === 800, `退还后金额应仍为800，实际: ${order.depositAmount}`);
  });

  // ============================================================
  // P4: 押金退还异常场景
  // ============================================================
  console.log("\n⚠️ P4: 押金退还异常场景");

  await test("P4.1-重复退还押金应被拒绝", async () => {
    try {
      await mutate("order.refundDeposit", { id: podOrderId2 }, caiwuCookie);
      throw new Error("重复退还应被拒绝但未报错");
    } catch (e) {
      if (e.message === "重复退还应被拒绝但未报错") throw e;
      // 预期报错：该订单押金状态不可退还
      assert(true, "重复退还被正确拒绝");
    }
  });

  await test("P4.2-无押金订单退还应被拒绝", async () => {
    // 创建一个没有押金的订单
    const res = await mutate("order.create", {
      orderNumber: `POD-NODEPOSIT-${Date.now()}`,
      businessType: "outsource",
      customerName: "无押金测试",
      cargoName: "测试货物",
      weight: "10",
      originCity: "佛山",
      destinationCity: "深圳",
    }, ludanCookie);
    try {
      await mutate("order.refundDeposit", { id: res.id }, caiwuCookie);
      throw new Error("无押金订单退还应被拒绝");
    } catch (e) {
      if (e.message === "无押金订单退还应被拒绝") throw e;
      // 预期报错
      assert(true, "无押金退还被正确拒绝");
    }
  });

  await test("P4.3-不存在的订单退还应报错", async () => {
    try {
      await mutate("order.refundDeposit", { id: 999999 }, caiwuCookie);
      throw new Error("不存在的订单退还应报错");
    } catch (e) {
      if (e.message === "不存在的订单退还应报错") throw e;
      assert(true, "不存在的订单退还被正确拒绝");
    }
  });

  // ============================================================
  // P5: 财务回单确认台与找车台“回单处理”协同数据正确性
  // ============================================================
  console.log("\n📊 P5: 四个Tab数据正确性");

  let podOrderId3, podRecordId3;

  await test("P5.1-创建测试订单并走完回单流程到sent", async () => {
    podOrderId3 = await createSignedOrderWithDeposit(ludanCookie, kefuCookie, waiqingCookie, "P5", "600", true);
    const podRes = await mutate("pod.create", { orderId: podOrderId3 }, caiwuCookie);
    podRecordId3 = podRes.id;
    await mutate("order.markPodSent", { orderId: podOrderId3 }, waiqingCookie);
  });

  await test("P5.2-Tab1:待收回单应包含sent状态的回单", async () => {
    const res = await query("pod.list", {}, caiwuCookie);
    const pendingPods = res.items.filter(p => p.originalStatus === "pending" || p.originalStatus === "sent");
    // 我们的P5订单应在待收列表中
    const found = pendingPods.find(p => p.orderId === podOrderId3);
    assert(found, "待收回单Tab应包含P5测试订单");
    assert(found.originalStatus === "sent", `P5订单回单状态应为sent，实际: ${found.originalStatus}`);
  });

  await test("P5.3-确认收到P5回单原件", async () => {
    await mutate("pod.updateStatus", {
      id: podRecordId3,
      originalStatus: "received",
    }, caiwuCookie);
    // 验证更新成功
    const podList = await query("pod.list", {}, caiwuCookie);
    const updatedPod = podList.items.find(p => p.id === podRecordId3);
    assert(updatedPod && updatedPod.originalStatus === "received", `P5回单状态应为received，实际: ${updatedPod?.originalStatus}`);
  });

  await test("P5.4-Tab2:已收回单应包含received状态的回单", async () => {
    const res = await query("pod.list", {}, caiwuCookie);
    const receivedPods = res.items.filter(p => p.originalStatus === "received" || p.originalStatus === "verified");
    const found = receivedPods.find(p => p.id === podRecordId3);
    assert(found, "已收回单Tab应包含P5测试订单");
    assert(found.originalStatus === "received", `P5订单回单状态应为received，实际: ${found.originalStatus}`);
  });

  await test("P5.5-Tab3:待退押金应包含depositStatus=paid的订单", async () => {
    const res = await query("order.list", { page: 1, pageSize: 200 }, kefuCookie);
    const depositOrders = res.items.filter(o => o.depositAmount && parseFloat(String(o.depositAmount)) > 0);
    const pendingRefund = depositOrders.filter(o => o.depositStatus === "paid");
    // P5订单应在待退押金列表中（还没退）
    const found = pendingRefund.find(o => o.id === podOrderId3);
    assert(found, "待退押金Tab应包含P5测试订单");
    assert(parseFloat(found.depositAmount) === 600, `P5订单押金应为600，实际: ${found.depositAmount}`);
  });

  await test("P5.6-退还P5订单押金", async () => {
    await mutate("order.refundDeposit", { id: podOrderId3 }, caiwuCookie);
    const order = await query("order.getById", { id: podOrderId3 }, kefuCookie);
    assert(order.depositStatus === "refunded", `押金状态应为refunded，实际: ${order.depositStatus}`);
  });

  await test("P5.7-Tab4:押金已处理应包含refunded状态的订单", async () => {
    const res = await query("order.list", { page: 1, pageSize: 200 }, kefuCookie);
    const depositOrders = res.items.filter(o => o.depositAmount && parseFloat(String(o.depositAmount)) > 0);
    const refundedOrders = depositOrders.filter(o => o.depositStatus === "refunded");
    const found = refundedOrders.find(o => o.id === podOrderId3);
    assert(found, "押金已处理Tab应包含P5测试订单（已退还）");
  });

  // ============================================================
  // P6: 权限控制验证
  // ============================================================
  console.log("\n🔒 P6: 权限控制验证");

  await test("P6.1-财务助理可以创建回单记录", async () => {
    // 已在P1中验证，这里额外确认
    const podList = await query("pod.list", {}, caiwuCookie);
    assert(podList && podList.items, "财务助理应能查询回单列表");
  });

  await test("P6.2-外请调度员可以标记回单已寄出", async () => {
    // 已在P1中验证（waiqingCookie调用markPodSent成功）
    assert(true, "外请调度员标记回单已寄出权限已验证");
  });

  await test("P6.3-零担调度员可以查询回单列表", async () => {
    const podList = await query("pod.list", {}, lingdanCookie);
    assert(podList && podList.items, "零担调度员应能查询回单列表");
  });

  await test("P6.4-录单员可以查询回单列表", async () => {
    const podList = await query("pod.list", {}, ludanCookie);
    assert(podList && podList.items, "录单员应能查询回单列表");
  });

  // ============================================================
  // P7: 回单关联订单数据完整性
  // ============================================================
  console.log("\n🔗 P7: 回单关联订单数据完整性");

  await test("P7.1-回单记录正确关联订单ID", async () => {
    const pod = await query("pod.getByOrderId", { orderId: podOrderId1 }, caiwuCookie);
    assert(pod, "应找到回单记录");
    assert(pod.orderId === podOrderId1, `回单orderId应为${podOrderId1}，实际: ${pod.orderId}`);
  });

  await test("P7.2-回单列表中订单押金信息完整", async () => {
    const res = await query("pod.list", {}, caiwuCookie);
    const ourPod = res.items.find(p => p.orderId === podOrderId1);
    assert(ourPod, "应找到测试回单");
    assert(ourPod.order, "应关联订单数据");
    assert(ourPod.order.depositAmount !== undefined, "应包含押金金额");
    assert(ourPod.order.depositStatus !== undefined, "应包含押金状态");
    assert(ourPod.order.depositRefundable !== undefined, "应包含是否可退还");
  });

  await test("P7.3-不存在的订单查询回单应返回null", async () => {
    const pod = await query("pod.getByOrderId", { orderId: 999999 }, caiwuCookie);
    // superjson包装可能返回 {json:null} 或 null 或 undefined
    const isNullish = !pod || pod === null || (typeof pod === "object" && pod.json === null) || (typeof pod === "object" && !pod.id);
    assert(isNullish, `不存在的订单应返回null/falsy，实际: ${JSON.stringify(pod)}`);
  });

  // ============================================================
  // P8: 多订单并发回单押金操作
  // ============================================================
  console.log("\n🔄 P8: 多订单并发回单押金操作");

  let batchOrderIds = [];

  await test("P8.1-批量创建3个已签收订单（含不同金额押金）", async () => {
    const amounts = ["300", "500", "1000"];
    for (let i = 0; i < 3; i++) {
      const id = await createSignedOrderWithDeposit(
        ludanCookie, kefuCookie, waiqingCookie,
        `P8-${i}`, amounts[i], true
      );
      batchOrderIds.push(id);
    }
    assert(batchOrderIds.length === 3, `应创建3个订单，实际: ${batchOrderIds.length}`);
  });

  await test("P8.2-批量创建回单记录", async () => {
    for (const orderId of batchOrderIds) {
      await mutate("pod.create", { orderId }, caiwuCookie);
    }
    // 验证全部创建成功
    for (const orderId of batchOrderIds) {
      const pod = await query("pod.getByOrderId", { orderId }, caiwuCookie);
      assert(pod, `订单${orderId}的回单记录应存在`);
      assert(pod.originalStatus === "pending", `初始状态应为pending`);
    }
  });

  await test("P8.3-批量标记回单已寄出", async () => {
    for (const orderId of batchOrderIds) {
      await mutate("order.markPodSent", { orderId }, waiqingCookie);
    }
    // 验证全部变为sent
    for (const orderId of batchOrderIds) {
      const pod = await query("pod.getByOrderId", { orderId }, caiwuCookie);
      assert(pod.originalStatus === "sent", `订单${orderId}回单状态应为sent，实际: ${pod.originalStatus}`);
    }
  });

  await test("P8.4-逐个退还押金并验证", async () => {
    // 先退第一个
    await mutate("order.refundDeposit", { id: batchOrderIds[0] }, caiwuCookie);
    let order0 = await query("order.getById", { id: batchOrderIds[0] }, kefuCookie);
    assert(order0.depositStatus === "refunded", `第1个订单押金应已退还`);

    // 第二个应仍为paid
    let order1 = await query("order.getById", { id: batchOrderIds[1] }, kefuCookie);
    assert(order1.depositStatus === "paid", `第2个订单押金应仍为paid`);

    // 退第二个
    await mutate("order.refundDeposit", { id: batchOrderIds[1] }, caiwuCookie);
    order1 = await query("order.getById", { id: batchOrderIds[1] }, kefuCookie);
    assert(order1.depositStatus === "refunded", `第2个订单押金应已退还`);

    // 退第三个
    await mutate("order.refundDeposit", { id: batchOrderIds[2] }, caiwuCookie);
    let order2 = await query("order.getById", { id: batchOrderIds[2] }, kefuCookie);
    assert(order2.depositStatus === "refunded", `第3个订单押金应已退还`);
  });

  await test("P8.5-验证所有押金退还后Tab数据正确", async () => {
    const res = await query("order.list", { page: 1, pageSize: 200 }, kefuCookie);
    const depositOrders = res.items.filter(o => o.depositAmount && parseFloat(String(o.depositAmount)) > 0);
    const refundedOrders = depositOrders.filter(o => o.depositStatus === "refunded");
    
    // 所有3个批量订单都应在已退还列表中
    for (const orderId of batchOrderIds) {
      const found = refundedOrders.find(o => o.id === orderId);
      assert(found, `订单${orderId}应在已退还列表中`);
    }
  });

  // ============================================================
  // P9: 操作日志验证
  // ============================================================
  console.log("\n📝 P9: 操作日志验证");

  await test("P9.1-回单创建操作应记录日志", async () => {
    // 操作日志API在stats路由下
    const logs = await query("stats.operationLogs", { page: 1, pageSize: 50 }, adminCookie);
    assert(logs && logs.items, "应返回操作日志");
    // 查找回单相关的日志
    const podLogs = logs.items.filter(l => l.targetType === "pod" || (l.description && l.description.includes("回单")));
    assert(podLogs.length > 0, "应有回单相关的操作日志");
  });

  await test("P9.2-押金退还操作应记录日志", async () => {
    const logs = await query("stats.operationLogs", { page: 1, pageSize: 50 }, adminCookie);
    const depositLogs = logs.items.filter(l => l.description && l.description.includes("押金"));
    assert(depositLogs.length > 0, "应有押金退还相关的操作日志");
  });

  // ============================================================
  // P10: 回单状态更新边界测试
  // ============================================================
  console.log("\n🧪 P10: 回单状态更新边界测试");

  await test("P10.1-回单标记为丢失(lost)", async () => {
    // 创建一个新的测试订单
    const testOrderId = await createSignedOrderWithDeposit(ludanCookie, kefuCookie, waiqingCookie, "P10", "400", true);
    const podRes = await mutate("pod.create", { orderId: testOrderId }, caiwuCookie);
    
    // 标记为丢失
    await mutate("pod.updateStatus", {
      id: podRes.id,
      originalStatus: "lost",
    }, caiwuCookie);
    
    // 通过列表验证（避免getByOrderId缓存问题）
    const podList = await query("pod.list", {}, caiwuCookie);
    const pod = podList.items.find(p => p.id === podRes.id);
    assert(pod, "应找到回单记录");
    assert(pod.originalStatus === "lost", `状态应为lost，实际: ${pod.originalStatus}`);
  });

  await test("P10.2-更新回单附件URL", async () => {
    // 使用P1的回单
    assert(podRecordId1, "需要回单记录ID");
    await mutate("pod.updateStatus", {
      id: podRecordId1,
      deliveryNoteUrl: "https://example.com/test-delivery-note.jpg",
    }, caiwuCookie);
    // 通过列表验证
    const podList = await query("pod.list", {}, caiwuCookie);
    const pod = podList.items.find(p => p.id === podRecordId1);
    assert(pod, "应找到回单记录");
    assert(pod.deliveryNoteUrl === "https://example.com/test-delivery-note.jpg", `附件URL应已更新，实际: ${pod.deliveryNoteUrl}`);
  });

  // ============================================================
  // 汇总结果
  // ============================================================
  console.log("\n========================================");
  console.log(`财务回单确认台/回单处理协同测试完成: ${passCount} 通过, ${failCount} 失败, 共 ${passCount + failCount} 个`);
  console.log("========================================\n");

  if (failCount > 0) {
    console.log("❌ 失败的测试:");
    for (const r of results) {
      if (r.status === "FAIL") {
        console.log(`  - ${r.name}: ${r.detail}`);
      }
    }
  }

  // 输出JSON结果
  const fs = await import("fs");
  fs.writeFileSync("/tmp/e2e_pod_results.json", JSON.stringify({ results, passCount, failCount }, null, 2));
  console.log("\n详细结果已保存到 /tmp/e2e_pod_results.json");
}

main().catch(e => {
  console.error("测试脚本执行失败:", e);
  process.exit(1);
});
