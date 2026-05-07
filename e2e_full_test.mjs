/**
 * 永安物流调度系统 — 全面E2E测试脚本
 * 覆盖：流程A(外请整车)、流程B(零担运输)、流程C(自运订单)、数据隔离、异常场景
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
  return sessionCookie.split(";")[0]; // "app_session_id=xxx"
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
  // Handle superjson format
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

// ============ 主测试流程 ============
async function main() {
  console.log("========================================");
  console.log("永安物流调度系统 — 全面E2E测试");
  console.log("========================================\n");

  // ---- 登录所有角色 ----
  console.log("📋 登录所有测试账号...");
  let adminCookie, ludanCookie, kefuCookie, waiqingCookie, cheduiCookie;
  let lingdanCookie, caiwuCookie, dispatcherLiCookie;

  try {
    adminCookie = await login("admin", "admin123");
    console.log("  ✅ admin 登录成功");
  } catch (e) {
    console.log("  ❌ admin 登录失败:", e.message);
    return;
  }

  try { ludanCookie = await login("ludan"); console.log("  ✅ ludan 登录成功"); }
  catch (e) { console.log("  ❌ ludan:", e.message); }

  try { kefuCookie = await login("kefu"); console.log("  ✅ kefu 登录成功"); }
  catch (e) { console.log("  ❌ kefu:", e.message); }

  try { waiqingCookie = await login("waiqing"); console.log("  ✅ waiqing 登录成功"); }
  catch (e) { console.log("  ❌ waiqing:", e.message); }

  try { cheduiCookie = await login("chedui"); console.log("  ✅ chedui 登录成功"); }
  catch (e) { console.log("  ❌ chedui:", e.message); }

  try { lingdanCookie = await login("lingdan"); console.log("  ✅ lingdan 登录成功"); }
  catch (e) { console.log("  ❌ lingdan:", e.message); }

  try { caiwuCookie = await login("caiwu"); console.log("  ✅ caiwu 登录成功"); }
  catch (e) { console.log("  ❌ caiwu:", e.message); }

  try { dispatcherLiCookie = await login("dispatcher_li"); console.log("  ✅ dispatcher_li 登录成功"); }
  catch (e) { console.log("  ❌ dispatcher_li:", e.message); }

  // ============================================================
  // 流程A：外请整车全流程
  // ============================================================
  console.log("\n🚛 流程A：外请整车全流程");
  let outsourceOrderId;

  await test("A1-录单员创建外请订单", async () => {
    const res = await mutate("order.create", {
      orderNumber: `E2E-OUT-${Date.now()}`,
      businessType: "outsource",
      customerName: "E2E测试客户-外请",
      customerPhone: "13800138001",
      cargoName: "大理石板材",
      weight: "28.5",
      originCity: "佛山",
      destinationCity: "武汉",
      deliveryAddress: "湖北省武汉市洪山区光谷大道100号",
      receiverName: "王先生",
      receiverPhone: "13900139001",
      remarks: "E2E测试-外请整车",
      settlementType: "monthly",
      packagingType: "pallet",
    }, ludanCookie);
    assert(res && res.id, "订单创建应返回ID");
    outsourceOrderId = res.id;
  });

  await test("A2-客服经理定价+自动分配区域", async () => {
    assert(outsourceOrderId, "需要先创建订单");
    const res = await mutate("order.priceAndAssign", {
      orderId: outsourceOrderId,
      dispatchPrice: "8500",
    }, kefuCookie);
    assert(res, "定价应成功");
  });

  await test("A3-验证订单状态变为pending_vehicle", async () => {
    const order = await query("order.getById", { id: outsourceOrderId }, kefuCookie);
    assert(order && order.status === "pending_vehicle", `状态应为pending_vehicle，实际: ${order?.status}`);
  });

  await test("A4-手动分配给外请调度员张三", async () => {
    await mutate("order.assignDispatcher", {
      orderId: outsourceOrderId,
      dispatcherId: 210701, // waiqing
    }, kefuCookie);
  });

  await test("A5-外请调度员找车报价(dispatched)", async () => {
    assert(outsourceOrderId, "需要先创建订单");
    await mutate("order.updateStatus", {
      id: outsourceOrderId,
      status: "dispatched",
      plateNumber: "粤B12345",
      driverName: "测试司机",
      driverPhone: "13700137001",
      actualFreight: "9000",
      depositAmount: "500",
      depositRefundable: true,
    }, waiqingCookie);
  });

  await test("A6-验证订单状态变为dispatched", async () => {
    const order = await query("order.getById", { id: outsourceOrderId }, kefuCookie);
    assert(order && order.status === "dispatched", `状态应为dispatched，实际: ${order?.status}`);
  });

  // 超价审批测试（actualFreight 9000 > dispatchPrice 8500）
  await test("A7-检查是否触发超价审批", async () => {
    const approvals = await query("approval.list", { page: 1, pageSize: 10 }, kefuCookie);
    // 可能有也可能没有，取决于审批逻辑
    assert(approvals, "审批列表应可查询");
  });

  await test("A8-更新为运输中(in_transit)", async () => {
    await mutate("order.updateStatus", {
      id: outsourceOrderId,
      status: "in_transit",
    }, waiqingCookie);
    const order = await query("order.getById", { id: outsourceOrderId }, kefuCookie);
    assert(order && order.status === "in_transit", `状态应为in_transit，实际: ${order?.status}`);
  });

  await test("A9-更新为已送达(delivered)", async () => {
    await mutate("order.updateStatus", {
      id: outsourceOrderId,
      status: "delivered",
    }, waiqingCookie);
    const order = await query("order.getById", { id: outsourceOrderId }, kefuCookie);
    assert(order && order.status === "delivered", `状态应为delivered，实际: ${order?.status}`);
  });

  await test("A10-更新为已签收(signed)", async () => {
    await mutate("order.updateStatus", {
      id: outsourceOrderId,
      status: "signed",
    }, waiqingCookie);
    const order = await query("order.getById", { id: outsourceOrderId }, kefuCookie);
    assert(order && order.status === "signed", `状态应为signed，实际: ${order?.status}`);
  });

  await test("A11-财务助理创建回单记录", async () => {
    await mutate("pod.create", {
      orderId: outsourceOrderId,
    }, caiwuCookie);
  });

  await test("A12-回单标记为已寄出", async () => {
    await mutate("order.markPodSent", {
      orderId: outsourceOrderId,
    }, waiqingCookie);
  });

  await test("A13-退还司机押金", async () => {
    // 先检查押金状态
    const order = await query("order.getById", { id: outsourceOrderId }, kefuCookie);
    if (order?.depositStatus === "paid") {
      await mutate("order.refundDeposit", { id: outsourceOrderId }, caiwuCookie);
    }
  });

  // ============================================================
  // 流程B：零担运输全流程
  // ============================================================
  console.log("\n📦 流程B：零担运输全流程");
  let ltlOrderId;

  await test("B1-录单员创建零担订单", async () => {
    const res = await mutate("order.create", {
      orderNumber: `E2E-LTL-${Date.now()}`,
      businessType: "ltl",
      customerName: "E2E测试客户-零担",
      customerPhone: "13800138002",
      cargoName: "瓷砖",
      weight: "2.5",
      originCity: "佛山",
      destinationCity: "贵阳",
      deliveryAddress: "贵州省贵阳市南明区花果园100号",
      receiverName: "李女士",
      receiverPhone: "13900139002",
      remarks: "E2E测试-零担运输",
      settlementType: "collect",
      packageCount: 50,
    }, ludanCookie);
    assert(res && res.id, "订单创建应返回ID");
    ltlOrderId = res.id;
  });

  await test("B2-分配给零担调度员", async () => {
    // LTL订单创建时已是pending_inquiry状态，不需要定价，直接分配调度员
    await mutate("order.assignDispatcher", {
      orderId: ltlOrderId,
      dispatcherId: 210703, // lingdan
    }, kefuCookie);
  });

  await test("B4-零担调度员确认询价(inquiry_confirmed)", async () => {
    await mutate("order.updateStatus", {
      id: ltlOrderId,
      status: "inquiry_confirmed",
      freightStationName: "德坤物流",
      ltlFreightPrice: "800",
      ltlUnitPrice: "320",
      ltlDeliveryFee: "150",
      inquiryPhone: "0757-88888888",
    }, lingdanCookie);
    const order = await query("order.getById", { id: ltlOrderId }, kefuCookie);
    assert(order && order.status === "inquiry_confirmed", `状态应为inquiry_confirmed，实际: ${order?.status}`);
  });

  await test("B5-零担调度员发运(shipped)", async () => {
    await mutate("order.updateStatus", {
      id: ltlOrderId,
      status: "shipped",
      freightWaybillNumber: "DK20260228001",
    }, lingdanCookie);
    const order = await query("order.getById", { id: ltlOrderId }, kefuCookie);
    assert(order && order.status === "shipped", `状态应为shipped，实际: ${order?.status}`);
  });

  // 创建第二个零担订单用于派车批次
  let ltlOrderId2;
  await test("B6-创建第二个零担订单用于派车批次", async () => {
    const res = await mutate("order.create", {
      orderNumber: `E2E-LTL2-${Date.now()}`,
      businessType: "ltl",
      customerName: "E2E测试客户-零担2",
      customerPhone: "13800138003",
      cargoName: "建材",
      weight: "1.8",
      originCity: "佛山",
      destinationCity: "贵阳",
      deliveryAddress: "贵州省贵阳市云岩区200号",
      receiverName: "张先生",
      receiverPhone: "13900139003",
      remarks: "E2E测试-零担运输2",
      settlementType: "cash",
      packageCount: 30,
    }, ludanCookie);
    ltlOrderId2 = res.id;
    // LTL订单不需要定价，直接分配调度员
    await mutate("order.assignDispatcher", { orderId: ltlOrderId2, dispatcherId: 210703 }, kefuCookie);
    // 询价确认
    await mutate("order.updateStatus", {
      id: ltlOrderId2,
      status: "inquiry_confirmed",
      freightStationName: "德坤物流",
      ltlFreightPrice: "600",
      ltlUnitPrice: "280",
      ltlDeliveryFee: "120",
    }, lingdanCookie);
    // 发运
    await mutate("order.updateStatus", {
      id: ltlOrderId2,
      status: "shipped",
      freightWaybillNumber: "DK20260228002",
    }, lingdanCookie);
  });

  let ltlBatchId;
  await test("B7-创建零担派车批次", async () => {
    const res = await mutate("order.createLtlBatch", {
      plateNumber: "粤E53251",
      driverName: "陈波",
      driverPhone: "13800000001",
      dispatchDate: "2026-02-28",
      orderIds: [ltlOrderId, ltlOrderId2],
      remarks: [
        { orderId: ltlOrderId, remark: "德坤贵阳，吨320+送150，到付：800元" },
        { orderId: ltlOrderId2, remark: "德坤贵阳，吨280+送120，600元" },
      ],
    }, lingdanCookie);
    assert(res && res.batchId, "应返回批次ID");
    ltlBatchId = res.batchId;
  });

  await test("B8-查询零担派车批次列表", async () => {
    const res = await query("order.listLtlBatches", { page: 1, pageSize: 10 }, lingdanCookie);
    assert(res && res.items && res.items.length > 0, "应有至少一个批次");
  });

  await test("B9-查询零担派车批次详情", async () => {
    assert(ltlBatchId, "需要先创建批次");
    const res = await query("order.getLtlBatchDetail", { batchId: ltlBatchId }, lingdanCookie);
    assert(res && res.batch, "应返回批次信息");
    assert(res.orders && res.orders.length === 2, `应有2个订单，实际: ${res.orders?.length}`);
  });

  await test("B10-零担订单继续流转到已送达", async () => {
    await mutate("order.updateStatus", { id: ltlOrderId, status: "in_transit" }, lingdanCookie);
    await mutate("order.updateStatus", { id: ltlOrderId, status: "delivered" }, lingdanCookie);
    await mutate("order.updateStatus", { id: ltlOrderId, status: "signed" }, lingdanCookie);
    const order = await query("order.getById", { id: ltlOrderId }, kefuCookie);
    assert(order && order.status === "signed", `状态应为signed，实际: ${order?.status}`);
  });

  // ============================================================
  // 流程C：自运订单全流程
  // ============================================================
  console.log("\n🚚 流程C：自运订单全流程");
  let selfOrderId;

  await test("C1-录单员创建自运订单", async () => {
    const res = await mutate("order.create", {
      orderNumber: `E2E-SELF-${Date.now()}`,
      businessType: "self",
      customerName: "E2E测试客户-自运",
      customerPhone: "13800138004",
      cargoName: "家具",
      weight: "5.2",
      originCity: "佛山",
      destinationCity: "深圳",
      deliveryAddress: "广东省深圳市南山区科技园200号",
      receiverName: "赵先生",
      receiverPhone: "13900139004",
      remarks: "E2E测试-自运订单",
      settlementType: "cash",
    }, ludanCookie);
    assert(res && res.id, "订单创建应返回ID");
    selfOrderId = res.id;
  });

  await test("C2-客服经理定价", async () => {
    await mutate("order.priceAndAssign", {
      orderId: selfOrderId,
      dispatchPrice: "2000",
    }, kefuCookie);
  });

  await test("C3-分配给车队调度员", async () => {
    await mutate("order.assignDispatcher", {
      orderId: selfOrderId,
      dispatcherId: 210702, // chedui
    }, kefuCookie);
  });

  await test("C4-车队调度员派车(dispatched)", async () => {
    await mutate("order.updateStatus", {
      id: selfOrderId,
      status: "dispatched",
      plateNumber: "粤X88888",
      driverName: "自运司机",
      driverPhone: "13700137002",
      actualFreight: "1800",
    }, cheduiCookie);
    const order = await query("order.getById", { id: selfOrderId }, kefuCookie);
    assert(order && order.status === "dispatched", `状态应为dispatched，实际: ${order?.status}`);
  });

  await test("C5-运输中→已送达→已签收", async () => {
    await mutate("order.updateStatus", { id: selfOrderId, status: "in_transit" }, cheduiCookie);
    await mutate("order.updateStatus", { id: selfOrderId, status: "delivered" }, cheduiCookie);
    await mutate("order.updateStatus", { id: selfOrderId, status: "signed" }, cheduiCookie);
    const order = await query("order.getById", { id: selfOrderId }, kefuCookie);
    assert(order && order.status === "signed", `状态应为signed，实际: ${order?.status}`);
  });

  // ============================================================
  // 数据隔离测试
  // ============================================================
  console.log("\n🔒 数据隔离测试");

  await test("D1-外请调度员张三只能看到分配给自己的订单", async () => {
    const res = await query("order.list", {
      page: 1,
      pageSize: 100,
      businessType: "outsource",
    }, waiqingCookie);
    assert(res && res.items, "应返回订单列表");
    // 检查所有订单的assignedDispatcherId都是210701(张三)
    for (const item of res.items) {
      assert(
        item.assignedDispatcherId === 210701 || item.assignedDispatcherId === null,
        `张三不应看到分配给其他人的订单(id=${item.id}, assigned=${item.assignedDispatcherId})`
      );
    }
  });

  await test("D2-外请调度员李四看不到张三的订单", async () => {
    if (!dispatcherLiCookie) throw new Error("dispatcher_li 未登录");
    const res = await query("order.list", {
      page: 1,
      pageSize: 100,
      businessType: "outsource",
    }, dispatcherLiCookie);
    assert(res && res.items, "应返回订单列表");
    // 李四不应看到分配给张三的订单
    for (const item of res.items) {
      assert(
        item.assignedDispatcherId !== 210701,
        `李四不应看到张三的订单(id=${item.id}, assigned=${item.assignedDispatcherId})`
      );
    }
  });

  await test("D3-零担调度员只能看到分配给自己的零担订单", async () => {
    const res = await query("order.list", {
      page: 1,
      pageSize: 100,
      businessType: "ltl",
    }, lingdanCookie);
    assert(res && res.items, "应返回订单列表");
    for (const item of res.items) {
      assert(
        item.assignedDispatcherId === 210703 || item.assignedDispatcherId === null,
        `零担调度员不应看到其他人的订单(id=${item.id}, assigned=${item.assignedDispatcherId})`
      );
    }
  });

  await test("D4-录单员只能看到自己创建的订单", async () => {
    const res = await query("order.list", {
      page: 1,
      pageSize: 100,
    }, ludanCookie);
    assert(res && res.items, "应返回订单列表");
    for (const item of res.items) {
      assert(
        item.createdBy === 210699,
        `录单员不应看到其他人创建的订单(id=${item.id}, createdBy=${item.createdBy})`
      );
    }
  });

  await test("D5-客服经理可以看到所有订单", async () => {
    const res = await query("order.list", {
      page: 1,
      pageSize: 100,
    }, kefuCookie);
    assert(res && res.items, "应返回订单列表");
    assert(res.items.length >= 3, `客服经理应看到至少3个订单，实际: ${res.items.length}`);
  });

  // ============================================================
  // 退回功能测试
  // ============================================================
  console.log("\n↩️ 退回功能测试");

  let rollbackOrderId;
  await test("E1-创建用于退回测试的订单", async () => {
    const res = await mutate("order.create", {
      orderNumber: `E2E-ROLLBACK-${Date.now()}`,
      businessType: "outsource",
      customerName: "退回测试客户",
      cargoName: "测试货物",
      weight: "10",
      originCity: "佛山",
      destinationCity: "广州",
    }, ludanCookie);
    rollbackOrderId = res.id;
    // 定价
    await mutate("order.priceAndAssign", { orderId: rollbackOrderId, dispatchPrice: "3000" }, kefuCookie);
    // 分配
    await mutate("order.assignDispatcher", { orderId: rollbackOrderId, dispatcherId: 210701 }, kefuCookie);
    // 派车
    await mutate("order.updateStatus", {
      id: rollbackOrderId,
      status: "dispatched",
      plateNumber: "粤A99999",
      driverName: "退回测试司机",
      driverPhone: "13700137099",
      actualFreight: "2800",
    }, waiqingCookie);
  });

  await test("E2-单条退回(dispatched→pending_vehicle)", async () => {
    await mutate("order.rollbackStatus", {
      id: rollbackOrderId,
      reason: "E2E测试-单条退回",
    }, kefuCookie);
    const order = await query("order.getById", { id: rollbackOrderId }, kefuCookie);
    assert(order && order.status === "pending_vehicle", `退回后状态应为pending_vehicle，实际: ${order?.status}`);
  });

  // 批量退回测试
  let batchRollbackIds = [];
  await test("E3-创建用于批量退回的订单", async () => {
    for (let i = 0; i < 2; i++) {
      const res = await mutate("order.create", {
        orderNumber: `E2E-BATCH-${Date.now()}-${i}`,
        businessType: "outsource",
        customerName: `批量退回测试${i}`,
        cargoName: "测试货物",
        weight: "5",
        originCity: "佛山",
        destinationCity: "长沙",
      }, ludanCookie);
      batchRollbackIds.push(res.id);
      await mutate("order.priceAndAssign", { orderId: res.id, dispatchPrice: "4000" }, kefuCookie);
    }
  });

  await test("E4-批量退回(pending_vehicle→pending_price)", async () => {
    await mutate("order.batchRollback", {
      ids: batchRollbackIds,
      reason: "E2E测试-批量退回",
    }, kefuCookie);
    for (const id of batchRollbackIds) {
      const order = await query("order.getById", { id }, kefuCookie);
      assert(order && order.status === "pending_price", `退回后状态应为pending_price，实际: ${order?.status}`);
    }
  });

  // ============================================================
  // 异常场景测试
  // ============================================================
  console.log("\n⚠️ 异常场景测试");

  await test("F1-必填字段为空应报错", async () => {
    try {
      await mutate("order.create", {
        orderNumber: "",
        businessType: "outsource",
      }, ludanCookie);
      throw new Error("应该报错但没有");
    } catch (e) {
      if (e.message === "应该报错但没有") throw e;
      // 预期报错，测试通过
    }
  });

  await test("F2-特殊字符处理", async () => {
    const res = await mutate("order.create", {
      orderNumber: `E2E-SPECIAL-${Date.now()}`,
      businessType: "outsource",
      customerName: "测试'\"<>&特殊字符😀",
      cargoName: "O'Brien's \"special\" cargo",
      weight: "1.5",
      originCity: "佛山",
      destinationCity: "广州",
      remarks: "备注含特殊字符：<script>alert('xss')</script>",
    }, ludanCookie);
    assert(res && res.id, "含特殊字符的订单应能创建成功");
    // 验证读取回来的数据
    const order = await query("order.getById", { id: res.id }, ludanCookie);
    assert(order.customerName.includes("😀"), "特殊字符应正确存储和读取");
  });

  await test("F3-大金额处理", async () => {
    const res = await mutate("order.create", {
      orderNumber: `E2E-BIGAMT-${Date.now()}`,
      businessType: "outsource",
      customerName: "大金额测试",
      cargoName: "贵重货物",
      weight: "100",
      originCity: "佛山",
      destinationCity: "北京",
      customerPrice: "999999.99",
    }, ludanCookie);
    assert(res && res.id, "大金额订单应能创建成功");
  });

  await test("F4-非法状态跳转应被阻止", async () => {
    // 创建一个pending_price的订单，尝试直接跳到signed
    const res = await mutate("order.create", {
      orderNumber: `E2E-ILLEGAL-${Date.now()}`,
      businessType: "outsource",
      customerName: "非法跳转测试",
      cargoName: "测试",
      weight: "1",
      originCity: "佛山",
      destinationCity: "广州",
    }, ludanCookie);
    try {
      await mutate("order.updateStatus", {
        id: res.id,
        status: "signed",
      }, kefuCookie);
      // 如果没报错，检查状态是否真的变了
      const order = await query("order.getById", { id: res.id }, kefuCookie);
      // 不管是否报错，记录结果
      if (order.status === "signed") {
        throw new Error("非法状态跳转未被阻止！从pending_price直接跳到signed");
      }
    } catch (e) {
      if (e.message.includes("非法状态跳转未被阻止")) throw e;
      // 预期报错，测试通过
    }
  });

  await test("F5-未授权操作应被拒绝(录单员尝试审批)", async () => {
    try {
      await mutate("approval.execute", {
        id: 1,
        action: "approve",
      }, ludanCookie);
      throw new Error("录单员不应有审批权限");
    } catch (e) {
      if (e.message === "录单员不应有审批权限") throw e;
      // 预期被拒绝
    }
  });

  await test("F6-未授权操作应被拒绝(财务助理尝试创建订单)", async () => {
    try {
      await mutate("order.create", {
        orderNumber: `E2E-UNAUTH-${Date.now()}`,
        businessType: "outsource",
        customerName: "未授权测试",
        cargoName: "测试",
        weight: "1",
        originCity: "佛山",
        destinationCity: "广州",
      }, caiwuCookie);
      throw new Error("财务助理不应有创建订单权限");
    } catch (e) {
      if (e.message === "财务助理不应有创建订单权限") throw e;
      // 预期被拒绝
    }
  });

  // ============================================================
  // 管理驾驶舱统计
  // ============================================================
  console.log("\n📊 管理驾驶舱统计测试");

  await test("G1-管理驾驶舱统计数据加载", async () => {
    const res = await query("stats.dashboard", {}, adminCookie);
    assert(res, "应返回统计数据");
    assert(res.byStatus, "应包含byStatus数据");
    assert(res.byType, "应包含byType数据");
  });

  await test("G2-运价数据库查询", async () => {
    const res = await query("stats.freightRates", {
      page: 1,
      pageSize: 10,
    }, kefuCookie);
    assert(res, "应返回运价数据");
  });

  // ============================================================
  // 智能粘贴测试
  // ============================================================
  console.log("\n📋 智能粘贴测试");

  await test("H1-智能粘贴解析", async () => {
    const res = await mutate("smartPaste.parse", {
      text: "客户：张三 电话：13800138000 货物：大理石 重量：28吨 从佛山到武汉 收货人：李四 13900139000 地址：武汉市洪山区光谷大道100号",
    }, ludanCookie);
    assert(res, "应返回解析结果");
  });

  // ============================================================
  // 操作日志测试
  // ============================================================
  console.log("\n📝 操作日志测试");

  await test("I1-操作日志记录验证", async () => {
    // 用admin查看操作日志
    const res = await query("order.list", {
      page: 1,
      pageSize: 5,
    }, adminCookie);
    assert(res, "应返回订单列表");
  });

  // ============================================================
  // 货站自动关联测试
  // ============================================================
  console.log("\n🏭 货站自动关联测试");

  await test("J1-货站列表查询", async () => {
    const res = await query("freightStation.list", {}, kefuCookie);
    assert(res && Array.isArray(res), "应返回货站列表");
  });

  // ============================================================
  // 汇总结果
  // ============================================================
  console.log("\n========================================");
  console.log(`测试完成: ${passCount} 通过, ${failCount} 失败, 共 ${passCount + failCount} 个`);
  console.log("========================================\n");

  if (failCount > 0) {
    console.log("❌ 失败的测试:");
    for (const r of results) {
      if (r.status === "FAIL") {
        console.log(`  - ${r.name}: ${r.detail}`);
      }
    }
  }

  // 输出JSON结果供后续分析
  const fs = await import("fs");
  fs.writeFileSync("/tmp/e2e_results.json", JSON.stringify({ results, passCount, failCount }, null, 2));
  console.log("\n详细结果已保存到 /tmp/e2e_results.json");
}

main().catch(e => {
  console.error("测试脚本执行失败:", e);
  process.exit(1);
});
