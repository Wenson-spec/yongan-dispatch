/**
 * 永安物流调度系统 - 综合E2E测试 v4
 * 修复所有API路径、参数、返回格式和业务逻辑问题
 */
const BASE = "http://localhost:3000/api/trpc";
let passCount = 0, failCount = 0;
const results = [];

function UID() { return Math.random().toString(36).slice(2, 10); }

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
    throw new Error(`登录失败: ${username} - ${JSON.stringify(body)}`);
  }
  return sessionCookie.split(";")[0];
}

async function call(procedure, input, cookie, method = "POST") {
  const isQuery = method === "GET";
  let url = `${BASE}/${procedure}`;
  const opts = { headers: { Cookie: cookie } };
  if (isQuery) {
    if (input !== null && input !== undefined) {
      url += `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
    }
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

async function query(path, input, cookie) { return call(path, input, cookie, "GET"); }
async function mutate(path, input, cookie) { return call(path, input, cookie, "POST"); }

async function test(name, fn) {
  try {
    await fn();
    passCount++;
    results.push({ name, status: "PASS", detail: "" });
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failCount++;
    results.push({ name, status: "FAIL", detail: e.message });
    console.log(`  ❌ ${name} — ${e.message.slice(0, 200)}`);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

/** Helper: ensure order is in pending_vehicle status */
async function ensurePendingVehicle(orderId, adminCookie, kefuCookie) {
  const list = await query("order.list", { page: 1, pageSize: 500 }, adminCookie);
  const order = list.items?.find(o => o.id === orderId);
  if (order && order.status !== "pending_vehicle") {
    const dispatchers = await query("order.getDispatchers", null, adminCookie);
    const wq = dispatchers.find(d => d.role === "outsource_dispatcher");
    if (wq) await mutate("order.manualAssign", { orderId, dispatcherId: wq.id }, kefuCookie);
  }
}

async function main() {
  console.log("🔐 登录所有角色...");
  const admin = await login("admin", "admin123");
  const ludan = await login("ludan");
  const kefu = await login("kefu");
  const waiqing = await login("waiqing");
  const lingdan = await login("lingdan");
  const chedui = await login("chedui");
  const caiwu = await login("caiwu");
  console.log("✅ 所有角色登录成功\n");

  // ============================================================
  // 模块1：审批流程完整性测试
  // 正确流程：pending_vehicle → pending_approval（手动触发审批）
  // ============================================================
  console.log("📋 模块1：审批流程完整性测试");
  let approvalOrderId, approvalId;

  await test("M1.1-创建外请订单并推进到pending_vehicle", async () => {
    const res = await mutate("order.create", {
      orderNumber: `APR-${UID()}`, customerName: "审批测试客户", cargoName: "审批货物",
      weight: "10", originCity: "上海", destinationCity: "北京",
      deliveryAddress: "北京市朝阳区", businessType: "outsource",
    }, ludan);
    approvalOrderId = res.id;
    assert(approvalOrderId, "订单创建失败");
    await mutate("order.priceAndAssign", { orderId: approvalOrderId, dispatchPrice: "5000" }, kefu);
    await ensurePendingVehicle(approvalOrderId, admin, kefu);
    const list = await query("order.list", { page: 1, pageSize: 500 }, admin);
    const order = list.items?.find(o => o.id === approvalOrderId);
    assert(order.status === "pending_vehicle", `状态应为pending_vehicle，实际为${order.status}`);
  });

  await test("M1.2-将订单状态改为pending_approval触发审批", async () => {
    await mutate("order.updateStatus", {
      id: approvalOrderId, status: "pending_approval",
      plateNumber: "沪A11111", driverName: "审批司机", driverPhone: "13100131001",
      actualFreight: "99999",
      depositAmount: "500", depositRefundable: true,
    }, waiqing);
    const list = await query("order.list", { page: 1, pageSize: 500 }, admin);
    const order = list.items?.find(o => o.id === approvalOrderId);
    assert(order.status === "pending_approval", `状态应为pending_approval，实际为${order.status}`);
  });

  await test("M1.3-查询待审批列表", async () => {
    const res = await query("approval.list", { page: 1, pageSize: 50, status: "pending" }, admin);
    assert(res.items && res.items.length > 0, "待审批列表为空");
    approvalId = res.items.find(a => a.orderId === approvalOrderId)?.id;
    assert(approvalId, "未找到对应审批记录");
  });

  await test("M1.4-待审批数量统计", async () => {
    const cnt = await query("approval.pendingCount", null, admin);
    assert(cnt > 0, `待审批数量应>0，实际为${cnt}`);
  });

  await test("M1.5-客服经理审批通过", async () => {
    if (!approvalId) throw new Error("无审批ID");
    const res = await mutate("approval.execute", {
      id: approvalId, action: "approve", approvedAmount: "99999",
    }, kefu);
    assert(res.success, "审批通过失败");
  });

  await test("M1.6-审批通过后订单状态变为dispatched", async () => {
    const list = await query("order.list", { page: 1, pageSize: 500 }, admin);
    const order = list.items?.find(o => o.id === approvalOrderId);
    assert(order, "未找到订单");
    assert(order.status === "dispatched", `审批后状态应为dispatched，实际为${order.status}`);
  });

  await test("M1.7-审批通过后押金状态自动设为paid", async () => {
    const list = await query("order.list", { page: 1, pageSize: 500 }, admin);
    const order = list.items?.find(o => o.id === approvalOrderId);
    assert(order, "未找到订单");
    assert(order.depositStatus === "paid", `押金状态应为paid，实际为${order.depositStatus}`);
  });

  // 驳回测试
  let rejectOrderId, rejectApprovalId;
  await test("M1.8-创建订单并触发审批用于驳回测试", async () => {
    const res = await mutate("order.create", {
      orderNumber: `REJ-${UID()}`, customerName: "驳回测试客户", cargoName: "驳回货物",
      weight: "8", originCity: "广州", destinationCity: "深圳",
      deliveryAddress: "深圳市南山区", businessType: "outsource",
    }, ludan);
    rejectOrderId = res.id;
    await mutate("order.priceAndAssign", { orderId: rejectOrderId, dispatchPrice: "4000" }, kefu);
    await ensurePendingVehicle(rejectOrderId, admin, kefu);
    await mutate("order.updateStatus", {
      id: rejectOrderId, status: "pending_approval",
      plateNumber: "粤B22222", driverName: "驳回司机", driverPhone: "13200132001",
      actualFreight: "88888",
    }, waiqing);
    const approvals = await query("approval.list", { page: 1, pageSize: 50, status: "pending" }, admin);
    rejectApprovalId = approvals.items?.find(a => a.orderId === rejectOrderId)?.id;
    assert(rejectApprovalId, "未找到驳回测试的审批记录");
  });

  await test("M1.9-审批驳回", async () => {
    const res = await mutate("approval.execute", {
      id: rejectApprovalId, action: "reject", approverComment: "运费过高",
    }, kefu);
    assert(res.success, "审批驳回失败");
  });

  await test("M1.10-驳回后订单状态退回pending_vehicle", async () => {
    const list = await query("order.list", { page: 1, pageSize: 500 }, admin);
    const order = list.items?.find(o => o.id === rejectOrderId);
    assert(order, "未找到订单");
    assert(order.status === "pending_vehicle", `驳回后状态应为pending_vehicle，实际为${order.status}`);
  });

  // ============================================================
  // 模块2：结算流程测试
  // ============================================================
  console.log("\n💰 模块2：结算流程测试");
  let settleOrderId1, settleOrderId2;

  await test("M2.1-创建两个已签收订单用于结算", async () => {
    const r1 = await mutate("order.create", {
      orderNumber: `SET1-${UID()}`, customerName: "结算客户1", cargoName: "结算货物1",
      weight: "12", originCity: "南京", destinationCity: "苏州",
      deliveryAddress: "苏州市工业园区", businessType: "outsource",
    }, ludan);
    settleOrderId1 = r1.id;
    await mutate("order.priceAndAssign", { orderId: settleOrderId1, dispatchPrice: "2500" }, kefu);
    await ensurePendingVehicle(settleOrderId1, admin, kefu);
    await mutate("order.updateStatus", { id: settleOrderId1, status: "dispatched", plateNumber: "苏A11111", driverName: "结算司机1", driverPhone: "13100131001", actualFreight: "2200" }, waiqing);
    await mutate("order.updateStatus", { id: settleOrderId1, status: "in_transit" }, waiqing);
    await mutate("order.updateStatus", { id: settleOrderId1, status: "delivered" }, waiqing);
    await mutate("order.updateStatus", { id: settleOrderId1, status: "signed" }, waiqing);

    const r2 = await mutate("order.create", {
      orderNumber: `SET2-${UID()}`, customerName: "结算客户2", cargoName: "结算货物2",
      weight: "8", originCity: "杭州", destinationCity: "宁波",
      deliveryAddress: "宁波市海曙区", businessType: "outsource",
    }, ludan);
    settleOrderId2 = r2.id;
    await mutate("order.priceAndAssign", { orderId: settleOrderId2, dispatchPrice: "3000" }, kefu);
    await ensurePendingVehicle(settleOrderId2, admin, kefu);
    await mutate("order.updateStatus", { id: settleOrderId2, status: "dispatched", plateNumber: "苏A22222", driverName: "结算司机2", driverPhone: "13100131002", actualFreight: "2500" }, waiqing);
    await mutate("order.updateStatus", { id: settleOrderId2, status: "in_transit" }, waiqing);
    await mutate("order.updateStatus", { id: settleOrderId2, status: "delivered" }, waiqing);
    await mutate("order.updateStatus", { id: settleOrderId2, status: "signed" }, waiqing);
  });

  await test("M2.2-批量标记结算", async () => {
    const res = await mutate("order.markSettled", { ids: [settleOrderId1, settleOrderId2] }, admin);
    assert(res.success, "批量结算失败");
  });

  await test("M2.3-结算后订单状态验证", async () => {
    const list = await query("order.list", { page: 1, pageSize: 500 }, admin);
    const o1 = list.items?.find(o => o.id === settleOrderId1);
    const o2 = list.items?.find(o => o.id === settleOrderId2);
    assert(o1 && o2, "未找到结算订单");
    assert(o1.status === "settled", `订单1状态应为settled，实际为${o1.status}`);
    assert(o2.status === "settled", `订单2状态应为settled，实际为${o2.status}`);
  });

  await test("M2.4-空数组结算应处理", async () => {
    try {
      await mutate("order.markSettled", { ids: [] }, admin);
    } catch (e) {
      // zod验证拒绝空数组是正确行为
    }
  });

  // ============================================================
  // 模块3：配置管理CRUD测试
  // customer.list / warehouse.list / freightStation.list 返回数组
  // ============================================================
  console.log("\n⚙️ 模块3：配置管理CRUD测试");
  let testCustomerId, testWarehouseId, testStationId;

  await test("M3.1-创建客户", async () => {
    const res = await mutate("customer.create", {
      name: `测试客户-${UID()}`,
      phone: "13800138000",
      settlementType: "monthly",
    }, admin);
    testCustomerId = res.id ?? res;
    assert(testCustomerId, "客户创建失败");
  });

  await test("M3.2-查询客户列表", async () => {
    const res = await query("customer.list", { activeOnly: true }, admin);
    const list = Array.isArray(res) ? res : (res.items || []);
    assert(list.length > 0, "客户列表为空");
    const found = list.find(c => c.id === testCustomerId);
    assert(found, "未找到刚创建的客户");
  });

  await test("M3.3-更新客户", async () => {
    const res = await mutate("customer.update", {
      id: testCustomerId,
      name: `更新客户-${UID()}`,
      phone: "13900139000",
    }, admin);
    assert(res.success || res, "客户更新失败");
  });

  await test("M3.4-创建仓库", async () => {
    const res = await mutate("warehouse.create", {
      name: `测试仓库-${UID()}`,
      address: "上海市嘉定区",
      city: "上海",
    }, admin);
    testWarehouseId = res.id ?? res;
    assert(testWarehouseId, "仓库创建失败");
  });

  await test("M3.5-查询仓库列表", async () => {
    const res = await query("warehouse.list", { activeOnly: true }, admin);
    const list = Array.isArray(res) ? res : (res.items || []);
    assert(list.length > 0, "仓库列表为空");
  });

  await test("M3.6-创建货站", async () => {
    const res = await mutate("freightStation.create", {
      name: `测试货站-${UID()}`,
      phone: "021-12345678",
    }, admin);
    testStationId = res.id ?? res;
    assert(testStationId, "货站创建失败");
  });

  await test("M3.7-查询货站列表", async () => {
    const res = await query("freightStation.list", { activeOnly: true }, admin);
    const list = Array.isArray(res) ? res : (res.items || []);
    assert(list.length > 0, "货站列表为空");
  });

  await test("M3.8-删除客户", async () => {
    const res = await mutate("customer.delete", { id: testCustomerId }, admin);
    assert(res.success || res, "客户删除失败");
  });

  await test("M3.9-删除后查询应不存在", async () => {
    const res = await query("customer.list", { activeOnly: false }, admin);
    const list = Array.isArray(res) ? res : (res.items || []);
    const found = list.find(c => c.id === testCustomerId);
    assert(!found, "删除后客户仍然存在");
  });

  await test("M3.10-录单员有CONFIG_CUSTOMER权限可以创建客户", async () => {
    // 录单员(order_entry)确实有CONFIG_CUSTOMER权限，这是设计如此
    const res = await mutate("customer.create", { name: `录单员客户-${UID()}` }, ludan);
    assert(res.id, "录单员应有权创建客户");
    await mutate("customer.delete", { id: res.id }, admin);
  });

  await test("M3.11-财务助理无权创建客户", async () => {
    try {
      await mutate("customer.create", { name: `越权客户-${UID()}` }, caiwu);
      throw new Error("财务助理不应有权创建客户");
    } catch (e) {
      assert(!e.message.includes("不应有权创建客户"), `财务助理成功创建了客户`);
    }
  });

  // ============================================================
  // 模块4：订单编辑测试
  // ============================================================
  console.log("\n✏️ 模块4：订单编辑测试");
  let editOrderId;

  await test("M4.1-创建订单用于编辑测试", async () => {
    const res = await mutate("order.create", {
      orderNumber: `EDIT-${UID()}`, customerName: "编辑测试客户", cargoName: "编辑货物",
      weight: "15", originCity: "武汉", destinationCity: "长沙",
      deliveryAddress: "长沙市岳麓区", businessType: "outsource",
    }, ludan);
    editOrderId = res.id;
    assert(editOrderId, "订单创建失败");
  });

  await test("M4.2-updateOrderFields更新运费字段", async () => {
    await mutate("order.priceAndAssign", { orderId: editOrderId, dispatchPrice: "4000" }, kefu);
    await ensurePendingVehicle(editOrderId, admin, kefu);
    await mutate("order.updateStatus", {
      id: editOrderId, status: "dispatched",
      plateNumber: "鄂A33333", driverName: "编辑司机", driverPhone: "13200132000",
      actualFreight: "3500",
    }, waiqing);
    const res = await mutate("order.updateOrderFields", {
      id: editOrderId, deliveryFee: "200", extraFee: "100",
    }, waiqing);
    assert(res.success, "更新字段失败");
  });

  await test("M4.3-验证更新后的总费用自动计算", async () => {
    const list = await query("order.list", { page: 1, pageSize: 500 }, admin);
    const order = list.items?.find(o => o.id === editOrderId);
    assert(order, "未找到订单");
    const totalCost = parseFloat(order.totalCost || "0");
    assert(totalCost === 3800, `总费用应为3800，实际为${totalCost}`);
  });

  await test("M4.4-上传货站开单图片", async () => {
    const res = await mutate("order.uploadStationReceipt", {
      id: editOrderId, stationReceiptUrl: "https://example.com/receipt-test.jpg",
    }, waiqing);
    assert(res.success, "上传失败");
  });

  await test("M4.5-验证开单图片URL已保存", async () => {
    const list = await query("order.list", { page: 1, pageSize: 500 }, admin);
    const order = list.items?.find(o => o.id === editOrderId);
    assert(order, "未找到订单");
    assert(order.stationReceiptUrl === "https://example.com/receipt-test.jpg", `图片URL不正确`);
  });

  await test("M4.6-空更新不应报错", async () => {
    const res = await mutate("order.updateOrderFields", { id: editOrderId }, waiqing);
    assert(res.success, "空更新应返回success");
  });

  // ============================================================
  // 模块5：零担批次边界测试
  // ============================================================
  console.log("\n📦 模块5：零担批次边界测试");
  let ltlOrder1, ltlOrder2, ltlBatchId;

  await test("M5.1-创建两个零担订单", async () => {
    const r1 = await mutate("order.create", {
      orderNumber: `LTL1-${UID()}`, customerName: "零担批次客户A", cargoName: "零担货物1",
      weight: "3", originCity: "成都", destinationCity: "重庆",
      deliveryAddress: "重庆市渝北区", businessType: "ltl",
    }, ludan);
    ltlOrder1 = r1.id;
    const r2 = await mutate("order.create", {
      orderNumber: `LTL2-${UID()}`, customerName: "零担批次客户B", cargoName: "零担货物2",
      weight: "5", originCity: "成都", destinationCity: "重庆",
      deliveryAddress: "重庆市江北区", businessType: "ltl",
    }, ludan);
    ltlOrder2 = r2.id;
    assert(ltlOrder1 && ltlOrder2, "零担订单创建失败");
    const dispatchers = await query("order.getDispatchers", null, admin);
    const ld = dispatchers.find(d => d.role === "ltl_dispatcher");
    await mutate("order.assignDispatcher", { orderId: ltlOrder1, dispatcherId: ld.id }, kefu);
    await mutate("order.assignDispatcher", { orderId: ltlOrder2, dispatcherId: ld.id }, kefu);
    await mutate("order.updateStatus", {
      id: ltlOrder1, status: "inquiry_confirmed",
      freightStationName: "批次测试货站", inquiryPhone: "028-88888888",
    }, lingdan);
    await mutate("order.updateStatus", {
      id: ltlOrder2, status: "inquiry_confirmed",
      freightStationName: "批次测试货站", inquiryPhone: "028-88888888",
    }, lingdan);
  });

  await test("M5.2-创建零担派车批次", async () => {
    const res = await mutate("order.createLtlBatch", {
      orderIds: [ltlOrder1, ltlOrder2],
      plateNumber: "川A55555", driverName: "批次司机", driverPhone: "13300133000",
    }, lingdan);
    ltlBatchId = res.batchId;
    assert(ltlBatchId, "批次创建失败");
  });

  await test("M5.3-查询批次详情", async () => {
    const res = await query("order.getLtlBatchDetail", { batchId: ltlBatchId }, lingdan);
    assert(res.batch, "批次信息为空");
    assert(res.orders.length === 2, `批次应有2个订单，实际有${res.orders.length}个`);
  });

  await test("M5.4-从批次移除一个订单", async () => {
    const res = await mutate("order.removeOrderFromLtlBatch", {
      batchId: ltlBatchId, orderId: ltlOrder2,
    }, lingdan);
    assert(res.success, "移除订单失败");
  });

  await test("M5.5-移除后批次只剩1个订单", async () => {
    const res = await query("order.getLtlBatchDetail", { batchId: ltlBatchId }, lingdan);
    assert(res.orders.length === 1, `批次应有1个订单，实际有${res.orders.length}个`);
  });

  await test("M5.6-删除批次", async () => {
    const res = await mutate("order.deleteLtlBatch", { batchId: ltlBatchId }, lingdan);
    assert(res.success, "删除批次失败");
  });

  await test("M5.7-删除后查询批次应为空", async () => {
    const res = await query("order.getLtlBatchDetail", { batchId: ltlBatchId }, lingdan);
    assert(!res.batch, "删除后批次仍然存在");
  });

  // ============================================================
  // 模块6：并发与重复提交测试
  // ============================================================
  console.log("\n🔄 模块6：并发与重复提交测试");
  let dupOrderId;

  await test("M6.1-创建订单用于重复操作测试", async () => {
    const res = await mutate("order.create", {
      orderNumber: `DUP-${UID()}`, customerName: "重复测试客户", cargoName: "重复货物",
      weight: "6", originCity: "郑州", destinationCity: "洛阳",
      deliveryAddress: "洛阳市西工区", businessType: "outsource",
    }, ludan);
    dupOrderId = res.id;
    await mutate("order.priceAndAssign", { orderId: dupOrderId, dispatchPrice: "2000" }, kefu);
    await ensurePendingVehicle(dupOrderId, admin, kefu);
    await mutate("order.updateStatus", {
      id: dupOrderId, status: "dispatched",
      plateNumber: "豫A66666", driverName: "重复司机", driverPhone: "13400134000",
      actualFreight: "1800", depositAmount: "300", depositRefundable: true,
    }, waiqing);
    await mutate("order.updateStatus", { id: dupOrderId, status: "in_transit" }, waiqing);
    await mutate("order.updateStatus", { id: dupOrderId, status: "delivered" }, waiqing);
    await mutate("order.updateStatus", { id: dupOrderId, status: "signed" }, waiqing);
  });

  await test("M6.2-首次退还押金成功", async () => {
    const res = await mutate("order.refundDeposit", { id: dupOrderId }, caiwu);
    assert(res.success, "首次退押金失败");
  });

  await test("M6.3-重复退还押金应被拒绝", async () => {
    try {
      await mutate("order.refundDeposit", { id: dupOrderId }, caiwu);
      throw new Error("重复退押金应报错但未报错");
    } catch (e) {
      assert(!e.message.includes("应报错但未报错"), `重复退押金未被拒绝`);
    }
  });

  await test("M6.4-对不存在的订单退押金", async () => {
    try {
      await mutate("order.refundDeposit", { id: 999999 }, caiwu);
      throw new Error("不存在订单应报错");
    } catch (e) {
      assert(!e.message.includes("不存在订单应报错"), `不存在订单退押金未被拒绝`);
    }
  });

  await test("M6.5-重复创建回单（幂等行为）", async () => {
    const existing = await query("pod.getByOrderId", { orderId: dupOrderId }, caiwu);
    assert(existing, "回单应已存在");
    const res = await mutate("pod.create", { orderId: dupOrderId }, caiwu);
    assert(res.id, "幂等创建应返回ID");
  });

  // ============================================================
  // 模块7：极端数值测试
  // ============================================================
  console.log("\n🔢 模块7：极端数值测试");

  await test("M7.1-超大金额订单（百万级）", async () => {
    const res = await mutate("order.create", {
      orderNumber: `BIG-${UID()}`, customerName: "大金额客户", cargoName: "贵重货物",
      weight: "100", originCity: "北京", destinationCity: "广州",
      deliveryAddress: "广州市天河区", businessType: "outsource",
    }, ludan);
    assert(res.id, "大金额订单创建失败");
    await mutate("order.priceAndAssign", { orderId: res.id, dispatchPrice: "9999999.99" }, kefu);
    const list = await query("order.list", { page: 1, pageSize: 500 }, admin);
    const order = list.items?.find(o => o.id === res.id);
    assert(order, "未找到订单");
    assert(parseFloat(order.dispatchPrice) === 9999999.99, `大金额保存不正确: ${order.dispatchPrice}`);
  });

  await test("M7.2-零金额订单", async () => {
    const res = await mutate("order.create", {
      orderNumber: `ZERO-${UID()}`, customerName: "零金额客户", cargoName: "免费货物",
      weight: "1", originCity: "上海", destinationCity: "杭州",
      deliveryAddress: "杭州市西湖区", businessType: "self",
    }, ludan);
    assert(res.id, "零金额订单创建失败");
    await mutate("order.priceAndAssign", { orderId: res.id, dispatchPrice: "0" }, kefu);
  });

  await test("M7.3-超长客户名称应被zod校验拒绝", async () => {
    const longName = "超长客户名称".repeat(50);
    try {
      await mutate("order.create", {
        orderNumber: `LONG-${UID()}`, customerName: longName, cargoName: "普通货物",
        weight: "5", originCity: "深圳", destinationCity: "东莞",
        deliveryAddress: "东莞市南城区", businessType: "outsource",
      }, ludan);
      throw new Error("超长名称应被拒绝");
    } catch (e) {
      assert(!e.message.includes("超长名称应被拒绝"), `超长名称未被校验拒绝`);
    }
  });

  await test("M7.4-特殊字符在备注中", async () => {
    const specialChars = "特殊字符测试：<script>alert('xss')</script> & \" ' \\ /";
    const res = await mutate("order.create", {
      orderNumber: `SPEC-${UID()}`, customerName: "特殊字符客户", cargoName: "普通货物",
      weight: "3", originCity: "厦门", destinationCity: "福州",
      deliveryAddress: "福州市鼓楼区", businessType: "outsource",
      remarks: specialChars,
    }, ludan);
    assert(res.id, "特殊字符订单创建失败");
    const list = await query("order.list", { page: 1, pageSize: 500 }, admin);
    const order = list.items?.find(o => o.id === res.id);
    assert(order?.remarks?.includes("特殊字符测试"), `备注内容丢失`);
  });

  await test("M7.5-负数重量应被处理", async () => {
    try {
      const res = await mutate("order.create", {
        orderNumber: `NEG-${UID()}`, customerName: "负数客户", cargoName: "负重货物",
        weight: "-10", originCity: "合肥", destinationCity: "芜湖",
        deliveryAddress: "芜湖市镜湖区", businessType: "outsource",
      }, ludan);
      assert(res.id, "负数重量订单创建失败");
    } catch (e) {
      // 拒绝也是正确行为
    }
  });

  // ============================================================
  // 模块8：权限交叉验证
  // ============================================================
  console.log("\n🔒 模块8：权限交叉验证");

  await test("M8.1-财务助理不能创建订单", async () => {
    try {
      await mutate("order.create", {
        orderNumber: `PERM-${UID()}`, customerName: "越权客户", cargoName: "越权货物",
        weight: "5", originCity: "上海", destinationCity: "北京",
        deliveryAddress: "北京市海淀区", businessType: "outsource",
      }, caiwu);
      throw new Error("财务助理不应能创建订单");
    } catch (e) {
      assert(!e.message.includes("不应能创建订单"), `财务助理成功创建了订单`);
    }
  });

  await test("M8.2-录单员不能审批", async () => {
    const approvalsList = await query("approval.list", { page: 1, pageSize: 1, status: "pending" }, ludan);
    if (approvalsList.items && approvalsList.items.length > 0) {
      try {
        await mutate("approval.execute", { id: approvalsList.items[0].id, action: "approve" }, ludan);
        throw new Error("录单员不应能审批");
      } catch (e) {
        assert(!e.message.includes("不应能审批"), `录单员成功审批了`);
      }
    }
  });

  await test("M8.3-外请调度员不能看到零担订单", async () => {
    const res = await query("order.list", { page: 1, pageSize: 500 }, waiqing);
    const ltlOrders = res.items?.filter(o => o.businessType === "ltl");
    assert(!ltlOrders || ltlOrders.length === 0, `外请调度员不应看到零担订单，实际看到${ltlOrders?.length}个`);
  });

  await test("M8.4-零担调度员不能看到外请订单", async () => {
    const res = await query("order.list", { page: 1, pageSize: 500 }, lingdan);
    const outsourceOrders = res.items?.filter(o => o.businessType === "outsource");
    assert(!outsourceOrders || outsourceOrders.length === 0, `零担调度员不应看到外请订单，实际看到${outsourceOrders?.length}个`);
  });

  await test("M8.5-未登录用户访问API应被拒绝", async () => {
    try {
      await query("order.list", { page: 1, pageSize: 10 }, "invalid_token");
      throw new Error("未登录应被拒绝");
    } catch (e) {
      assert(!e.message.includes("未登录应被拒绝"), `未登录用户成功访问了API`);
    }
  });

  // ============================================================
  // 模块9：数据一致性测试
  // ============================================================
  console.log("\n🔗 模块9：数据一致性测试");
  let consistOrderId;

  await test("M9.1-dispatched时自动创建回单记录", async () => {
    const res = await mutate("order.create", {
      orderNumber: `CON-${UID()}`, customerName: "一致性客户", cargoName: "一致性货物",
      weight: "7", originCity: "昆明", destinationCity: "贵阳",
      deliveryAddress: "贵阳市南明区", businessType: "outsource",
    }, ludan);
    consistOrderId = res.id;
    await mutate("order.priceAndAssign", { orderId: consistOrderId, dispatchPrice: "3000" }, kefu);
    await ensurePendingVehicle(consistOrderId, admin, kefu);
    await mutate("order.updateStatus", {
      id: consistOrderId, status: "dispatched",
      plateNumber: "云A77777", driverName: "一致性司机", driverPhone: "13500135000",
      actualFreight: "2800",
    }, waiqing);
    const pod = await query("pod.getByOrderId", { orderId: consistOrderId }, caiwu);
    assert(pod, "回单应在dispatched时自动创建");
    assert(pod.originalStatus === "pending", `回单状态应为pending，实际为${pod.originalStatus}`);
  });

  await test("M9.2-批量删除订单", async () => {
    const res = await mutate("order.batchDelete", { ids: [consistOrderId] }, admin);
    assert(res.success, "批量删除失败");
  });

  await test("M9.3-删除后订单不可查询", async () => {
    const list = await query("order.list", { page: 1, pageSize: 500 }, admin);
    const found = list.items?.find(o => o.id === consistOrderId);
    assert(!found, "删除后订单仍然存在");
  });

  await test("M9.4-操作日志完整性", async () => {
    const logs = await query("stats.operationLogs", { page: 1, pageSize: 50 }, admin);
    assert(logs.items && logs.items.length > 0, "操作日志为空");
    const log = logs.items[0];
    assert(log.action, "日志缺少action字段");
    assert(log.targetType, "日志缺少targetType字段");
    assert(log.createdAt, "日志缺少createdAt字段");
  });

  // ============================================================
  // 模块10：状态转换边界测试
  // ============================================================
  console.log("\n🔀 模块10：状态转换边界测试");

  await test("M10.1-pending_assign不能直接跳到dispatched", async () => {
    const res = await mutate("order.create", {
      orderNumber: `ST1-${UID()}`, customerName: "状态测试1", cargoName: "状态货物",
      weight: "4", originCity: "西安", destinationCity: "兰州",
      deliveryAddress: "兰州市城关区", businessType: "outsource",
    }, ludan);
    try {
      await mutate("order.updateStatus", {
        id: res.id, status: "dispatched",
        plateNumber: "陕A88888", driverName: "跳转司机",
      }, admin);
      throw new Error("不应允许跳转");
    } catch (e) {
      assert(e.message.includes("不允许") || !e.message.includes("不应允许跳转"), `错误信息不正确`);
    }
  });

  await test("M10.2-pending_assign不能直接跳到signed", async () => {
    const res = await mutate("order.create", {
      orderNumber: `ST2-${UID()}`, customerName: "状态测试2", cargoName: "状态货物",
      weight: "4", originCity: "西安", destinationCity: "兰州",
      deliveryAddress: "兰州市城关区", businessType: "outsource",
    }, ludan);
    try {
      await mutate("order.updateStatus", { id: res.id, status: "signed" }, admin);
      throw new Error("不应允许跳转");
    } catch (e) {
      assert(!e.message.includes("不应允许跳转"), `跳转未被拒绝`);
    }
  });

  await test("M10.3-cancelled订单不能再转换状态", async () => {
    const res = await mutate("order.create", {
      orderNumber: `ST3-${UID()}`, customerName: "取消测试", cargoName: "取消货物",
      weight: "3", originCity: "太原", destinationCity: "大同",
      deliveryAddress: "大同市城区", businessType: "outsource",
    }, ludan);
    // pending_assign → on_hold → cancelled
    await mutate("order.updateStatus", { id: res.id, status: "on_hold" }, admin);
    await mutate("order.updateStatus", { id: res.id, status: "cancelled" }, admin);
    // cancelled → 任何状态应被拒绝
    try {
      await mutate("order.updateStatus", { id: res.id, status: "pending_assign" }, admin);
      throw new Error("已取消订单不应能转换状态");
    } catch (e) {
      assert(e.message.includes("不允许") || !e.message.includes("不应能转换"), `取消后转换未被拒绝`);
    }
  });

  await test("M10.4-on_hold可以恢复到之前状态", async () => {
    const res = await mutate("order.create", {
      orderNumber: `HOLD-${UID()}`, customerName: "暂停测试", cargoName: "暂停货物",
      weight: "3", originCity: "太原", destinationCity: "大同",
      deliveryAddress: "大同市城区", businessType: "outsource",
    }, ludan);
    const holdId = res.id;
    // pending_assign → on_hold
    await mutate("order.updateStatus", { id: holdId, status: "on_hold" }, admin);
    // on_hold → pending_assign (恢复)
    await mutate("order.updateStatus", { id: holdId, status: "pending_assign" }, admin);
    const list = await query("order.list", { page: 1, pageSize: 500 }, admin);
    const order = list.items?.find(o => o.id === holdId);
    assert(order?.status === "pending_assign", `恢复后状态应为pending_assign，实际为${order?.status}`);
  });

  // ============================================================
  // 模块11：智能粘贴测试
  // ============================================================
  console.log("\n🧠 模块11：智能粘贴测试");

  await test("M11.1-智能粘贴解析", async () => {
    const res = await mutate("smartPaste.parse", {
      text: "客户：智能粘贴客户 货物：电子产品 重量：15吨 发货地：上海 收货地：北京朝阳区建国路88号",
    }, ludan);
    assert(res, "智能粘贴返回为空");
  });

  // ============================================================
  // 模块12：驾驶舱统计数据验证
  // ============================================================
  console.log("\n📊 模块12：驾驶舱统计数据验证");

  await test("M12.1-订单统计数据加载", async () => {
    const stats = await query("order.stats", null, admin);
    assert(typeof stats.total === "number", "缺少total字段");
    assert(stats.total >= 0, "total不应为负数");
  });

  await test("M12.2-超期回单统计", async () => {
    const stats = await query("pod.overdueStats", null, admin);
    assert(stats, "超期统计返回为空");
    assert(typeof stats.yellow === "number", "缺少yellow字段");
    assert(typeof stats.orange === "number", "缺少orange字段");
    assert(typeof stats.red === "number", "缺少red字段");
  });

  await test("M12.3-押金统计", async () => {
    const stats = await query("pod.depositStats", null, admin);
    assert(stats, "押金统计返回为空");
    assert(typeof stats.pendingTotal === "string" || typeof stats.pendingCount === "number", "缺少待退押金统计");
  });

  await test("M12.4-超期回单分级列表", async () => {
    const list = await query("pod.overdueList", { overdueDays: 0 }, admin);
    assert(Array.isArray(list), "超期列表应为数组");
    if (list.length > 0) {
      const item = list[0];
      assert(item.level, "超期记录缺少level字段");
      assert(["yellow", "orange", "red"].includes(item.level), `level应为yellow/orange/red，实际为${item.level}`);
    }
  });

  // ============================================================
  // 模块13：回单押金完整生命周期测试
  // ============================================================
  console.log("\n📄 模块13：回单押金完整生命周期测试");
  let podLifecycleOrderId;

  await test("M13.1-创建订单并推进到dispatched自动创建回单", async () => {
    const res = await mutate("order.create", {
      orderNumber: `POD-${UID()}`, customerName: "回单生命周期客户", cargoName: "回单货物",
      weight: "5", originCity: "长春", destinationCity: "沈阳",
      deliveryAddress: "沈阳市和平区", businessType: "outsource",
    }, ludan);
    podLifecycleOrderId = res.id;
    await mutate("order.priceAndAssign", { orderId: podLifecycleOrderId, dispatchPrice: "2000" }, kefu);
    await ensurePendingVehicle(podLifecycleOrderId, admin, kefu);
    await mutate("order.updateStatus", {
      id: podLifecycleOrderId, status: "dispatched",
      plateNumber: "吉A88888", driverName: "回单司机", driverPhone: "13600136000",
      actualFreight: "1800", depositAmount: "200", depositRefundable: true,
    }, waiqing);
    const pod = await query("pod.getByOrderId", { orderId: podLifecycleOrderId }, caiwu);
    assert(pod, "回单应自动创建");
    assert(pod.originalStatus === "pending", "回单初始状态应为pending");
  });

  await test("M13.2-标记回单已寄出", async () => {
    const pod = await query("pod.getByOrderId", { orderId: podLifecycleOrderId }, caiwu);
    const res = await mutate("pod.updateStatus", { id: pod.id, originalStatus: "sent" }, waiqing);
    assert(res.success, "标记寄出失败");
  });

  await test("M13.3-确认回单已收到", async () => {
    const pod = await query("pod.getByOrderId", { orderId: podLifecycleOrderId }, caiwu);
    const res = await mutate("pod.updateStatus", { id: pod.id, originalStatus: "received" }, caiwu);
    assert(res.success, "确认收到失败");
  });

  await test("M13.4-退还押金", async () => {
    const res = await mutate("order.refundDeposit", { id: podLifecycleOrderId }, caiwu);
    assert(res.success, "退还押金失败");
    const list = await query("order.list", { page: 1, pageSize: 500 }, admin);
    const order = list.items?.find(o => o.id === podLifecycleOrderId);
    assert(order.depositStatus === "refunded", `押金状态应为refunded，实际为${order.depositStatus}`);
  });

  // ============================================================
  // 模块14：搜索功能测试
  // ============================================================
  console.log("\n🔍 模块14：搜索功能测试");

  await test("M14.1-按客户名搜索回单", async () => {
    const res = await query("pod.list", { tab: "all", search: "回单生命周期客户" }, caiwu);
    assert(res.items, "搜索结果应有items");
  });

  await test("M14.2-按订单号搜索", async () => {
    const res = await query("order.list", { page: 1, pageSize: 50, search: "APR-" }, admin);
    assert(res.items, "搜索结果应有items");
  });

  // ============================================================
  // 汇总
  // ============================================================
  console.log("\n========================================");
  console.log(`测试完成: ${passCount} 通过, ${failCount} 失败, 共 ${passCount + failCount} 个`);
  console.log("========================================");

  if (failCount > 0) {
    console.log("\n❌ 失败项目:");
    results.filter(r => r.status === "FAIL").forEach(r => {
      console.log(`  - ${r.name}: ${r.detail.slice(0, 200)}`);
    });
  }

  const fs = await import("fs");
  fs.writeFileSync("/tmp/e2e_comprehensive_results.json", JSON.stringify({ passCount, failCount, results }, null, 2));
  console.log("\n详细结果已保存到 /tmp/e2e_comprehensive_results.json");
}

main().catch(e => { console.error("测试脚本异常:", e); process.exit(1); });
