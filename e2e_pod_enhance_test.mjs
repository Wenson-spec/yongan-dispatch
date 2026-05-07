/**
 * 财务回单确认台与回单处理流程增强 E2E 测试
 * 测试搜索功能、押金统计API、超期通知功能
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
    console.log(`  ❌ ${name} - ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "断言失败");
}

// ============ 主测试 ============
async function runTests() {
  console.log("=== 财务回单确认台与回单处理流程增强 E2E 测试 ===\n");

  // 登录多个角色
  const adminCookie = await login("admin", "admin123");
  console.log("✅ 管理员登录成功");
  
  let kefuCookie, waiqingCookie, caiwuCookie;
  try { kefuCookie = await login("kefu"); console.log("✅ kefu 登录成功"); } catch(e) { kefuCookie = adminCookie; }
  try { waiqingCookie = await login("waiqing"); console.log("✅ waiqing 登录成功"); } catch(e) { waiqingCookie = adminCookie; }
  try { caiwuCookie = await login("caiwu"); console.log("✅ caiwu 登录成功"); } catch(e) { caiwuCookie = adminCookie; }
  
  const uniqueTag = Date.now().toString(36);

  // ============ P15: 搜索功能测试 ============
  console.log("\n--- P15: 搜索功能测试 ---");

  let order1, order2, order3;

  await test("P15.1 创建3个测试订单并推进到签收+回单", async () => {
    // 创建3个订单
    order1 = await mutate("order.create", {
      orderNumber: `SRCH-A-${uniqueTag}`,
      businessType: "outsource",
      customerName: `搜索甲方_${uniqueTag}`,
      originCity: "广州", destinationCity: "深圳",
      cargoName: "测试货物",
    }, adminCookie);
    order2 = await mutate("order.create", {
      orderNumber: `SRCH-B-${uniqueTag}`,
      businessType: "outsource",
      customerName: `搜索乙方_${uniqueTag}`,
      originCity: "上海", destinationCity: "北京",
      cargoName: "测试货物",
    }, adminCookie);
    order3 = await mutate("order.create", {
      orderNumber: `SRCH-C-${uniqueTag}`,
      businessType: "outsource",
      customerName: `搜索丙方_${uniqueTag}`,
      originCity: "成都", destinationCity: "重庆",
      cargoName: "测试货物",
    }, adminCookie);
    assert(order1?.id && order2?.id && order3?.id, "订单创建失败");

    // 推进每个订单到签收状态
    const configs = [
      { order: order1, deposit: "500", refundable: true, plate: `粤B${uniqueTag.slice(0,5)}`, driver: "搜索司机甲" },
      { order: order2, deposit: "800", refundable: true, plate: `京A${uniqueTag.slice(0,5)}`, driver: "搜索司机乙" },
      { order: order3, deposit: "300", refundable: false, plate: `沪C${uniqueTag.slice(0,5)}`, driver: "搜索司机丙" },
    ];

    for (const cfg of configs) {
      const oid = cfg.order.id;
      // 定价+自动分配
      await mutate("order.priceAndAssign", { orderId: oid, dispatchPrice: "2500" }, adminCookie);
      // 手动分配调度员（用admin的ID=1）
      await mutate("order.assignDispatcher", { orderId: oid, dispatcherId: 1 }, adminCookie);
      // 调度（dispatched）
      await mutate("order.updateStatus", {
        id: oid, status: "dispatched",
        plateNumber: cfg.plate, driverName: cfg.driver,
        driverPhone: "13800138000",
        actualFreight: "2500",
        depositAmount: cfg.deposit,
        depositRefundable: cfg.refundable,
      }, adminCookie);
      // 运输中
      await mutate("order.updateStatus", { id: oid, status: "in_transit" }, adminCookie);
      // 已送达
      await mutate("order.updateStatus", { id: oid, status: "delivered" }, adminCookie);
      // 已签收
      await mutate("order.updateStatus", { id: oid, status: "signed" }, adminCookie);
      // 创建回单
      await mutate("pod.create", { orderId: oid }, adminCookie);
    }
  });

  await test("P15.2 按客户名搜索回单", async () => {
    const data = await query("pod.list", { keyword: `搜索甲方_${uniqueTag}` }, adminCookie);
    assert(data.items.length >= 1, `期望>=1条，实际 ${data.items.length} 条`);
    // 验证搜索结果是正确的
    const found = data.items.some(i => i.order?.customerName?.includes(`搜索甲方_${uniqueTag}`));
    assert(found, "搜索结果中应包含匹配的客户名");
  });

  await test("P15.3 按订单号搜索回单", async () => {
    const data = await query("pod.list", { keyword: `SRCH-B-${uniqueTag}` }, adminCookie);
    assert(data.items.length >= 1, `期望>=1条，实际 ${data.items.length} 条`);
  });

  await test("P15.4 按车牌号搜索回单", async () => {
    const data = await query("pod.list", { keyword: `粤B${uniqueTag.slice(0,5)}` }, adminCookie);
    assert(data.items.length >= 1, `期望>=1条，实际 ${data.items.length} 条`);
  });

  await test("P15.5 按司机名搜索回单", async () => {
    const data = await query("pod.list", { keyword: "搜索司机乙" }, adminCookie);
    assert(data.items.length >= 1, `期望>=1条，实际 ${data.items.length} 条`);
  });

  await test("P15.6 不存在关键字搜索返回空", async () => {
    const data = await query("pod.list", { keyword: "完全不存在的关键字XYZ999" }, adminCookie);
    assert(data.items.length === 0, `期望0条，实际 ${data.items.length} 条`);
  });

  await test("P15.7 搜索+状态过滤组合", async () => {
    const data = await query("pod.list", { keyword: `搜索甲方_${uniqueTag}`, originalStatus: "pending" }, adminCookie);
    assert(data.items.length >= 1, `期望>=1条，实际 ${data.items.length} 条`);
  });

  await test("P15.8 order.list按车牌号搜索", async () => {
    const data = await query("order.list", { page: 1, pageSize: 10, keyword: `粤B${uniqueTag.slice(0,5)}` }, adminCookie);
    assert(data.items.length >= 1, `期望>=1条，实际 ${data.items.length} 条`);
  });

  await test("P15.9 order.list按司机名搜索", async () => {
    const data = await query("order.list", { page: 1, pageSize: 10, keyword: "搜索司机丙" }, adminCookie);
    assert(data.items.length >= 1, `期望>=1条，实际 ${data.items.length} 条`);
  });

  await test("P15.10 回单关联订单信息完整", async () => {
    const data = await query("pod.list", { keyword: `搜索甲方_${uniqueTag}` }, adminCookie);
    assert(data.items.length >= 1, "未找到回单");
    const item = data.items[0];
    assert(item.order, "缺少关联订单");
    assert(item.order.customerName, `缺少客户名, order: ${JSON.stringify(item.order)}`);
    assert(item.order.plateNumber, `缺少车牌号, order: ${JSON.stringify(item.order)}`);
    assert(item.order.driverName, `缺少司机名, order: ${JSON.stringify(item.order)}`);
    assert(item.order.orderNumber, `缺少订单号, order: ${JSON.stringify(item.order)}`);
  });

  // ============ P16: 押金统计API测试 ============
  console.log("\n--- P16: 押金统计API测试 ---");

  await test("P16.1 depositStats返回正确结构", async () => {
    const data = await query("pod.depositStats", undefined, adminCookie);
    assert(data.pendingTotal !== undefined, "缺少pendingTotal");
    assert(data.refundedTotal !== undefined, "缺少refundedTotal");
    assert(data.nonRefundableTotal !== undefined, "缺少nonRefundableTotal");
    assert(data.pendingCount !== undefined, "缺少pendingCount");
    assert(data.refundedCount !== undefined, "缺少refundedCount");
    assert(data.nonRefundableCount !== undefined, "缺少nonRefundableCount");
  });

  await test("P16.2 待退押金总额 > 0", async () => {
    const data = await query("pod.depositStats", undefined, adminCookie);
    const pendingTotal = parseFloat(data.pendingTotal);
    assert(pendingTotal > 0, `待退总额: ¥${pendingTotal}`);
  });

  await test("P16.3 不退还押金计数 > 0", async () => {
    const data = await query("pod.depositStats", undefined, adminCookie);
    assert(data.nonRefundableCount > 0, `不退还: ${data.nonRefundableCount} 笔`);
  });

  await test("P16.4 退还押金后统计更新", async () => {
    // order1 是可退还押金的，先确认其押金状态
    const orderBefore = await query("order.getById", { id: order1.id }, adminCookie);
    assert(orderBefore.depositStatus === "paid", `order1押金状态应为paid，实际: ${orderBefore.depositStatus}`);

    const statsBefore = await query("pod.depositStats", undefined, adminCookie);
    const pendingBefore = statsBefore.pendingCount;

    // 退还order1的押金
    await mutate("order.refundDeposit", { id: order1.id }, adminCookie);

    const statsAfter = await query("pod.depositStats", undefined, adminCookie);
    assert(statsAfter.pendingCount < pendingBefore, `待退未减少: ${pendingBefore} → ${statsAfter.pendingCount}`);
    assert(statsAfter.refundedCount > 0, "已退还计数应>0");
  });

  await test("P16.5 不退还押金总额正确", async () => {
    const data = await query("pod.depositStats", undefined, adminCookie);
    const nonRefundableTotal = parseFloat(data.nonRefundableTotal);
    // order3 的押金是 300，不可退还
    assert(nonRefundableTotal >= 300, `不退还总额应>=300，实际: ¥${nonRefundableTotal}`);
  });

  await test("P16.6 已退还押金总额正确", async () => {
    const data = await query("pod.depositStats", undefined, adminCookie);
    const refundedTotal = parseFloat(data.refundedTotal);
    // order1 的押金 500 已退还
    assert(refundedTotal >= 500, `已退还总额应>=500，实际: ¥${refundedTotal}`);
  });

  // ============ P17: 超期通知功能测试 ============
  console.log("\n--- P17: 超期通知功能测试 ---");

  await test("P17.1 checkOverdueAndNotify正常执行", async () => {
    const data = await mutate("pod.checkOverdueAndNotify", undefined, adminCookie);
    assert(data.notified !== undefined, "缺少notified字段");
    assert(typeof data.notified === "number", `notified应为数字，实际: ${typeof data.notified}`);
  });

  await test("P17.2 overdueList返回数组", async () => {
    const data = await query("pod.overdueList", { overdueDays: 5 }, adminCookie);
    assert(Array.isArray(data), "应返回数组");
  });

  await test("P17.3 overdueList(0天)包含刚创建的回单", async () => {
    const data = await query("pod.overdueList", { overdueDays: 0 }, adminCookie);
    assert(Array.isArray(data), "应返回数组");
    // overdueDays=0 意味着签收超过0天的都算超期，刚创建的也算
    assert(data.length >= 1, `期望>=1个超期回单，实际: ${data.length}`);
  });

  await test("P17.4 超期回单包含关联订单信息和超期天数", async () => {
    const data = await query("pod.overdueList", { overdueDays: 0 }, adminCookie);
    assert(data.length > 0, "无超期回单");
    const item = data[0];
    assert(item.overdueDays !== undefined, "缺少overdueDays");
    assert(typeof item.overdueDays === "number", `overdueDays应为数字`);
    assert(item.order, "缺少关联订单");
  });

  await test("P17.5 overdueList(999天)返回空", async () => {
    const data = await query("pod.overdueList", { overdueDays: 999 }, adminCookie);
    assert(Array.isArray(data), "应返回数组");
    assert(data.length === 0, `期望0个超期回单（999天），实际: ${data.length}`);
  });

  // ============ 汇总 ============
  console.log(`\n=== 测试汇总 ===`);
  console.log(`通过: ${passCount}, 失败: ${failCount}, 总计: ${passCount + failCount}`);
  console.log(failCount === 0 ? "✅ 全部通过!" : `❌ ${failCount} 个失败`);

  const fs = await import("fs");
  fs.writeFileSync("/tmp/e2e_pod_enhance_results.json", JSON.stringify({
    pass: passCount, fail: failCount, total: passCount + failCount, results,
  }, null, 2));
}

runTests().catch(e => {
  console.error("测试执行失败:", e);
  process.exit(1);
});
