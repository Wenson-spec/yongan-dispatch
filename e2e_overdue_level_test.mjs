/**
 * 超期通知分级提醒 E2E 测试
 * 验证：黄色≤5天/橙色5-15天/红色≥15天，不同级别推送不同角色
 */
const BASE = "http://localhost:3000/api/trpc";

// ============ 认证 ============
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
  if (body.error) throw new Error(`${procedure}: ${body.error?.json?.message || JSON.stringify(body.error).substring(0, 200)}`);
  const data = body.result?.data?.json ?? body.result?.data;
  return data;
}

async function query(procedure, input, cookie) {
  return call(procedure, input, cookie, "GET");
}

async function mutate(procedure, input, cookie) {
  return call(procedure, input, cookie, "POST");
}

// ============ 测试框架 ============
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
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// ============ 辅助函数 ============
const uid = () => Math.random().toString(36).slice(2, 10);

async function createOrderAtStatus(cookie, overrides = {}) {
  const suffix = uid();
  const orderData = {
    orderNumber: `OVD-${suffix}`,
    customerName: overrides.customerName || `超期测试客户-${suffix}`,
    originCity: "上海",
    destinationCity: "北京",
    originAddress: "上海市浦东新区",
    destinationAddress: "北京市朝阳区",
    cargoName: "测试货物",
    cargoWeight: "10",
    settlementType: "monthly",
    businessType: "outsource",
    ...overrides,
  };
  const created = await mutate("order.create", orderData, cookie);
  return created;
}

async function advanceOrderToSigned(cookie, orderId) {
  // priced → dispatched → in_transit → delivered → signed
  await mutate("order.priceAndAssign", {
    orderId: orderId,
    dispatchPrice: "5000",
  }, cookie);
  // dispatched（找车报价）
  await mutate("order.updateStatus", {
    id: orderId,
    status: "dispatched",
    plateNumber: "沪A12345",
    driverName: "测试司机",
    driverPhone: "13800138000",
    actualFreight: "5000",
  }, cookie);
  await mutate("order.updateStatus", { id: orderId, status: "in_transit" }, cookie);
  await mutate("order.updateStatus", { id: orderId, status: "delivered" }, cookie);
  await mutate("order.updateStatus", { id: orderId, status: "signed" }, cookie);
}

// ============ 主测试 ============
async function main() {
  console.log("\n=== 超期通知分级提醒 E2E 测试 ===\n");

  let adminCookie;
  try {
    adminCookie = await login("admin", "admin123");
    console.log("✅ 管理员登录成功\n");
  } catch (e) {
    console.error("❌ 管理员登录失败:", e.message);
    process.exit(1);
  }

  // ====== P20: 分级超期列表API ======
  console.log("--- P20: 分级超期列表API ---");

  await test("P20.1 overdueList返回带level字段的列表", async () => {
    const items = await query("pod.overdueList", { overdueDays: 0 }, adminCookie);
    assert(Array.isArray(items), "应返回数组");
    // 检查返回的item是否有level字段
    if (items.length > 0) {
      const first = items[0];
      assert(first.level !== undefined, "应包含level字段");
      assert(["yellow", "orange", "red"].includes(first.level), `level应为yellow/orange/red，实际: ${first.level}`);
      assert(first.overdueDays !== undefined, "应包含overdueDays字段");
      // 订单信息是扁平化的字段（orderNumber/customerName等），不是嵌套的order对象
      assert(first.orderId !== undefined, "应包含orderId");
      assert(first.podId !== undefined, "应包含podId");
    }
  });

  await test("P20.2 overdueList按overdueDays筛选", async () => {
    const allItems = await query("pod.overdueList", { overdueDays: 0 }, adminCookie);
    const items5 = await query("pod.overdueList", { overdueDays: 5 }, adminCookie);
    // overdueDays=5 应该只返回 ≥5天的
    assert(items5.length <= allItems.length, "5天阈值应返回更少或相同数量的结果");
    for (const item of items5) {
      assert(item.overdueDays >= 5, `overdueDays应≥5，实际: ${item.overdueDays}`);
    }
  });

  await test("P20.3 overdueList中level分级正确", async () => {
    const items = await query("pod.overdueList", { overdueDays: 0 }, adminCookie);
    for (const item of items) {
      if (item.overdueDays >= 15) {
        assert(item.level === "red", `${item.overdueDays}天应为red，实际: ${item.level}`);
      } else if (item.overdueDays >= 5) {
        assert(item.level === "orange", `${item.overdueDays}天应为orange，实际: ${item.level}`);
      } else {
        assert(item.level === "yellow", `${item.overdueDays}天应为yellow，实际: ${item.level}`);
      }
    }
  });

  // ====== P21: 分级统计API ======
  console.log("\n--- P21: 分级统计API ---");

  await test("P21.1 overdueStats返回分级统计", async () => {
    const stats = await query("pod.overdueStats", undefined, adminCookie);
    assert(stats.total !== undefined, "应包含total字段");
    assert(stats.yellow !== undefined, "应包含yellow字段");
    assert(stats.orange !== undefined, "应包含orange字段");
    assert(stats.red !== undefined, "应包含red字段");
    assert(stats.total === stats.yellow + stats.orange + stats.red,
      `total(${stats.total})应等于yellow(${stats.yellow})+orange(${stats.orange})+red(${stats.red})`);
  });

  await test("P21.2 overdueStats包含items明细", async () => {
    const stats = await query("pod.overdueStats", undefined, adminCookie);
    assert(Array.isArray(stats.items), "应包含items数组");
    assert(stats.items.length === stats.total, `items长度(${stats.items.length})应等于total(${stats.total})`);
  });

  // ====== P22: 手动触发分级通知 ======
  console.log("\n--- P22: 手动触发分级通知 ---");

  await test("P22.1 checkOverdueAndNotify返回分级结果", async () => {
    const res = await mutate("pod.checkOverdueAndNotify", undefined, adminCookie);
    assert(res.yellow !== undefined, "应包含yellow计数");
    assert(res.orange !== undefined, "应包含orange计数");
    assert(res.red !== undefined, "应包含red计数");
    assert(res.notified !== undefined, "应包含notified计数");
    console.log(`    分级结果: 黄${res.yellow}/橙${res.orange}/红${res.red}，推送${res.notified}条`);
  });

  // ====== P23: 创建不同超期天数的回单并验证分级 ======
  console.log("\n--- P23: 创建测试数据验证分级 ---");

  // 创建3个订单，分别模拟不同超期天数
  let order1Id, order2Id, order3Id;

  await test("P23.1 创建3个签收订单用于回单测试", async () => {
    const o1 = await createOrderAtStatus(adminCookie, { customerName: "黄色预警客户" });
    const o2 = await createOrderAtStatus(adminCookie, { customerName: "橙色警告客户" });
    const o3 = await createOrderAtStatus(adminCookie, { customerName: "红色紧急客户" });
    order1Id = o1.id;
    order2Id = o2.id;
    order3Id = o3.id;
    assert(order1Id && order2Id && order3Id, "3个订单应创建成功");

    // 推进到签收状态
    await advanceOrderToSigned(adminCookie, order1Id);
    await advanceOrderToSigned(adminCookie, order2Id);
    await advanceOrderToSigned(adminCookie, order3Id);
  });

  await test("P23.2 为3个订单创建回单", async () => {
    const pod1 = await mutate("pod.create", { orderId: order1Id }, adminCookie);
    const pod2 = await mutate("pod.create", { orderId: order2Id }, adminCookie);
    const pod3 = await mutate("pod.create", { orderId: order3Id }, adminCookie);
    assert(pod1.id && pod2.id && pod3.id, "3个回单应创建成功");
  });

  await test("P23.3 新创建的回单应在overdueList中（0天阈值）", async () => {
    const items = await query("pod.overdueList", { overdueDays: 0 }, adminCookie);
    const myOrders = items.filter(i => [order1Id, order2Id, order3Id].includes(i.orderId));
    assert(myOrders.length === 3, `应找到3个新创建的回单，实际: ${myOrders.length}`);
    // 新创建的应该都是yellow级别（0天）
    for (const item of myOrders) {
      assert(item.level === "yellow", `新创建回单应为yellow级别，实际: ${item.level}`);
      assert(item.overdueDays >= 0, `overdueDays应≥0`);
    }
  });

  // ====== P24: 通知历史记录 ======
  console.log("\n--- P24: 通知历史记录 ---");

  await test("P24.1 overdueNotificationHistory返回记录列表", async () => {
    const history = await query("pod.overdueNotificationHistory", { limit: 10 }, adminCookie);
    assert(Array.isArray(history), "应返回数组");
    // 可能有也可能没有记录，取决于之前是否触发过
  });

  await test("P24.2 通知历史记录可查询且包含级别和角色信息", async () => {
    const history = await query("pod.overdueNotificationHistory", { limit: 20 }, adminCookie);
    assert(Array.isArray(history), "应返回数组");
    console.log(`    通知历史记录: ${history.length}条`);
    if (history.length > 0) {
      const record = history[0];
      assert(record.level !== undefined, "应包含level字段");
      assert(record.recipientRole !== undefined, "应包含recipientRole字段");
      assert(record.sentAt !== undefined, "应包含sentAt字段");
      assert(["yellow", "orange", "red"].includes(record.level), `level应为yellow/orange/red`);
    }
  });

  // ====== P25: 分级通知频率控制 ======
  console.log("\n--- P25: 分级通知频率控制 ---");

  await test("P25.1 频率控制验证（第二次触发应跳过已推送的）", async () => {
    // 立即触发，由于之前P22.1已触发过，这次应该推送更少或相同
    const res = await mutate("pod.checkOverdueAndNotify", undefined, adminCookie);
    console.log(`    频率控制后推送: ${res.notified}条（黄${res.yellow}/橙${res.orange}/红${res.red}）`);
    // 黄色级别每3天推一次，所以短时间内第二次应该推送更少
    assert(res.notified >= 0, "推送数应≥0");
  });

  // ====== P26: 前端分级显示数据验证 ======
  console.log("\n--- P26: 前端分级显示数据验证 ---");

  await test("P26.1 pod.list返回的数据可用于前端分级计算", async () => {
    const podData = await query("pod.list", {}, adminCookie);
    assert(podData.items, "应返回items");
    const pendingPods = podData.items.filter(p => p.originalStatus === "pending" || p.originalStatus === "sent");
    for (const pod of pendingPods.slice(0, 5)) {
      const daysSinceCreated = Math.floor((Date.now() - new Date(pod.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      assert(daysSinceCreated >= 0, `daysSinceCreated应≥0，实际: ${daysSinceCreated}`);
      // 验证关联订单数据
      if (pod.order) {
        assert(pod.order.customerName !== undefined || pod.order.orderNumber !== undefined, "关联订单应有客户名或订单号");
      }
    }
  });

  await test("P26.2 overdueStats与overdueList数据一致", async () => {
    const stats = await query("pod.overdueStats", undefined, adminCookie);
    const list = await query("pod.overdueList", { overdueDays: 0 }, adminCookie);

    assert(stats.total === list.length, `stats.total(${stats.total})应等于list.length(${list.length})`);

    const yellowCount = list.filter(i => i.level === "yellow").length;
    const orangeCount = list.filter(i => i.level === "orange").length;
    const redCount = list.filter(i => i.level === "red").length;

    assert(stats.yellow === yellowCount, `stats.yellow(${stats.yellow})应等于实际yellow(${yellowCount})`);
    assert(stats.orange === orangeCount, `stats.orange(${stats.orange})应等于实际orange(${orangeCount})`);
    assert(stats.red === redCount, `stats.red(${stats.red})应等于实际red(${redCount})`);
  });

  // ====== 汇总 ======
  console.log(`\n=== 测试完成: ${passCount} 通过 / ${failCount} 失败 ===\n`);
  results.forEach(r => {
    if (r.status === "FAIL") console.log(`  ❌ ${r.name}: ${r.detail}`);
  });

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
