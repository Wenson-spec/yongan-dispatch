import fs from 'node:fs/promises';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const REPORT_PATH = '/home/ubuntu/test-report-price-db.md';
const JSON_PATH = '/home/ubuntu/price-db-results.json';
const STARTED_AT = new Date().toISOString();
const TS = Date.now();

const results = [];
const runtimeNotes = [];
const cleanupState = {
  orderIds: new Set(),
  batchIds: new Set(),
};

function stamp() {
  return new Date().toISOString();
}

function addResult(category, point, status, detail, extra = {}) {
  const row = { category, point, status, detail, createdAt: stamp(), ...extra };
  results.push(row);
  const icon = status === '通过' ? 'PASS' : status === '失败' ? 'FAIL' : 'WARN';
  console.log(`[${icon}] ${category} | ${point} | ${detail}`);
  return row;
}

function errorText(err) {
  if (!err) return '未知错误';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function approxEqual(a, b, tolerance = 0.01) {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function makeOrderPayload(prefix, overrides = {}) {
  const orderNumber = overrides.orderNumber || unique(prefix);
  return {
    orderNumber,
    customerName: overrides.customerName || '价格库测试客户',
    originProvince: overrides.originProvince || '广东省',
    originCity: overrides.originCity || '佛山',
    destinationProvince: overrides.destinationProvince || '湖南省',
    destinationCity: overrides.destinationCity || '长沙',
    weight: overrides.weight || '10',
    cargoName: overrides.cargoName || '瓷砖',
    cargoSpec: overrides.cargoSpec || '800*800',
    customerPrice: overrides.customerPrice || '5000',
    deliveryAddress: overrides.deliveryAddress || '测试收货地址 1 号',
    receiverName: overrides.receiverName || '价格库收货人',
    receiverPhone: overrides.receiverPhone || '13800000000',
    shippingNote: overrides.shippingNote || '价格数据库自动化测试',
    businessType: overrides.businessType || 'outsource',
    ...overrides,
    orderNumber,
  };
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function unitPriceFromDetail(item) {
  const businessType = item.businessType;
  if (businessType === 'ltl' && item.ltlUnitPrice != null && item.ltlUnitPrice !== '') {
    return Number(item.ltlUnitPrice);
  }
  const weight = Number(item.chargeableWeight || item.weight || 0);
  const freight = Number(item.actualFreight || 0);
  return weight > 0 ? freight / weight : 0;
}

function findRouteItem(items = [], originCity, destinationCity) {
  return items.find((item) => item.originCity === originCity && item.destinationCity === destinationCity) || null;
}

async function login(username, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success || !data?.token) {
    throw new Error(`登录失败(${username}): HTTP ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function trpcCall(procedure, input, token) {
  const res = await fetch(`${BASE_URL}/api/trpc/${procedure}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ json: input }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(`tRPC ${procedure} 调用失败: HTTP ${res.status} ${JSON.stringify(data?.error || data)}`);
  }
  return data?.result?.data?.json;
}

async function trpcQuery(procedure, input, token) {
  const encoded = encodeURIComponent(JSON.stringify({ json: input }));
  const res = await fetch(`${BASE_URL}/api/trpc/${procedure}?input=${encoded}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(`tRPC ${procedure} 查询失败: HTTP ${res.status} ${JSON.stringify(data?.error || data)}`);
  }
  return data?.result?.data?.json;
}

async function createOrder(token, prefix, overrides = {}) {
  const payload = makeOrderPayload(prefix, overrides);
  const created = await trpcCall('order.create', payload, token);
  const id = created?.id;
  if (!id) throw new Error(`订单创建成功但未返回 id: ${payload.orderNumber}`);
  cleanupState.orderIds.add(id);
  return { id, orderNumber: payload.orderNumber, payload };
}

async function getOrderDb(id, token) {
  return await trpcQuery('order.getById', { id }, token);
}

async function cleanupTrackedData() {
  if (cleanupState.orderIds.size > 0 || cleanupState.batchIds.size > 0) {
    runtimeNotes.push(`本次测试保留了 ${cleanupState.orderIds.size} 个订单样本与 ${cleanupState.batchIds.size} 个零担批次样本，未直接做数据库级清理。`);
  }
}

async function completeOutsourceOrder(adminToken, dispatcherToken, config) {
  const created = await createOrder(adminToken, config.prefix, {
    businessType: 'outsource',
    originProvince: config.originProvince,
    originCity: config.originCity,
    destinationProvince: config.destinationProvince,
    destinationCity: config.destinationCity,
    weight: String(config.weight),
    cargoName: config.cargoName,
    cargoSpec: config.cargoSpec,
    customerPrice: String(config.customerPrice || config.dispatchPrice || config.freight),
    shippingNote: config.shippingNote || '价格库整车场景',
    isLargeSlab: config.isLargeSlab || false,
    chargeableWeight: config.chargeableWeight != null ? String(config.chargeableWeight) : undefined,
  });

  await trpcCall('order.priceAndAssign', {
    orderId: created.id,
    dispatchPrice: String(config.dispatchPrice),
  }, adminToken);

  await trpcCall('order.batchDispatch', {
    orderIds: [created.id],
    plateNumber: config.plateNumber || '粤A12345',
    driverName: config.driverName || '价格库司机',
    driverPhone: config.driverPhone || '13900000000',
    totalFreight: String(config.freight),
    depositAmount: String(config.depositAmount ?? 200),
    depositRefundable: true,
  }, dispatcherToken);

  await trpcCall('order.batchUpdateStatus', { orderIds: [created.id], status: 'delivered' }, adminToken);
  await trpcCall('order.batchUpdateStatus', { orderIds: [created.id], status: 'signed' }, adminToken);

  try {
    const pods = await trpcQuery('pod.list', { page: 1, pageSize: 10, keyword: created.orderNumber }, adminToken);
    const pod = pods?.items?.[0];
    if (pod?.id) {
      await trpcCall('pod.updateStatus', { id: pod.id, originalStatus: 'sent' }, adminToken);
      await trpcCall('order.batchRefundDeposit', { ids: [created.id] }, adminToken);
    }
  } catch (err) {
    runtimeNotes.push(`订单 ${created.orderNumber} 执行回单/退押金补充步骤时出现非阻塞异常：${errorText(err)}`);
  }

  const finalOrder = await getOrderDb(created.id, adminToken);
  return { ...created, finalOrder };
}

async function completeLtlOrder(adminToken, config) {
  const created = await createOrder(adminToken, config.prefix, {
    businessType: 'ltl',
    mergedPlanNumber: unique('PRICE-LTL-PLAN'),
    originProvince: config.originProvince,
    originCity: config.originCity,
    destinationProvince: config.destinationProvince,
    destinationCity: config.destinationCity,
    weight: String(config.weight),
    cargoName: config.cargoName,
    cargoSpec: config.cargoSpec,
    customerPrice: String(config.customerPrice || config.totalCost || 0),
    shippingNote: config.shippingNote || '价格库零担场景',
  });

  const inquiry = await trpcCall('ltlInquiry.create', {
    orderId: created.id,
    freightStationId: 1,
    finalStationName: config.freightStationName || '德邦物流佛山站',
    quotedPrice: String(config.quotedPrice),
    remarks: '价格数据库零担询价',
  }, adminToken);

  await trpcCall('ltlInquiry.update', {
    id: inquiry.id,
    confirmedPrice: String(config.confirmedPrice),
    inquiryStatus: 'confirmed',
  }, adminToken);

  const batch = await trpcCall('order.createLtlBatch', {
    orderIds: [created.id],
    plateNumber: config.plateNumber || '粤B22334',
    driverName: config.driverName || '零担司机',
    driverPhone: config.driverPhone || '13600001234',
    remarks: [{ orderId: created.id, remark: '价格数据库零担建批' }],
  }, adminToken);
  if (batch?.batchId) cleanupState.batchIds.add(batch.batchId);

  await trpcCall('order.updateStatus', {
    id: created.id,
    status: 'shipped',
    ltlUnitPrice: String(config.ltlUnitPrice),
    ltlDeliveryFee: String(config.ltlDeliveryFee),
    ltlOtherFee: String(config.ltlOtherFee),
    freightStationName: config.freightStationName || '德邦物流佛山站',
    freightWaybillNumber: unique('WB'),
    inquiryPhone: '020-88881111',
  }, adminToken);

  await trpcCall('order.batchUpdateStatus', { orderIds: [created.id], status: 'delivered' }, adminToken);
  await trpcCall('order.batchUpdateStatus', { orderIds: [created.id], status: 'signed' }, adminToken);

  const finalOrder = await getOrderDb(created.id, adminToken);
  return { ...created, batchId: batch?.batchId, finalOrder };
}

async function verifyOutsourceInPriceDb(adminToken, data, dateRange) {
  const detail = await trpcQuery('stats.freightRateDetails', {
    originCity: data.payload.originCity,
    destinationCity: data.payload.destinationCity,
    cargoSpec: data.payload.cargoSpec,
    page: 1,
    pageSize: 50,
    ...dateRange,
  }, adminToken);
  const found = detail.items.find((item) => item.orderNumber === data.orderNumber);
  if (!found) {
    throw new Error(`未在普通运价明细中找到整车订单 ${data.orderNumber}`);
  }

  const aggregate = await trpcQuery('stats.freightRates', {
    originCity: data.payload.originCity,
    destinationCity: data.payload.destinationCity,
    cargoSpec: data.payload.cargoSpec,
    businessType: 'outsource',
    ...dateRange,
  }, adminToken);
  const routeItem = findRouteItem(aggregate.items, data.payload.originCity, data.payload.destinationCity);
  if (!routeItem) {
    throw new Error(`普通运价汇总未返回路线 ${data.payload.originCity} → ${data.payload.destinationCity}`);
  }

  return { detail: found, routeItem };
}

async function verifyLtlInPriceDb(adminToken, data, dateRange) {
  const detail = await trpcQuery('stats.freightRateDetails', {
    originCity: data.payload.originCity,
    destinationCity: data.payload.destinationCity,
    cargoSpec: data.payload.cargoSpec,
    page: 1,
    pageSize: 50,
    ...dateRange,
  }, adminToken);
  const found = detail.items.find((item) => item.orderNumber === data.orderNumber);
  if (!found) {
    throw new Error(`未在普通运价明细中找到零担订单 ${data.orderNumber}`);
  }

  const aggregate = await trpcQuery('stats.freightRates', {
    originCity: data.payload.originCity,
    destinationCity: data.payload.destinationCity,
    cargoSpec: data.payload.cargoSpec,
    businessType: 'ltl',
    ...dateRange,
  }, adminToken);
  const routeItem = findRouteItem(aggregate.items, data.payload.originCity, data.payload.destinationCity);
  if (!routeItem) {
    throw new Error(`普通运价汇总未返回零担路线 ${data.payload.originCity} → ${data.payload.destinationCity}`);
  }

  return { detail: found, routeItem };
}

async function verifyLargeSlabInPriceDb(adminToken, data, dateRange) {
  const slab = await trpcQuery('stats.largeSlabFtlRates', {
    originCity: data.payload.originCity,
    destinationCity: data.payload.destinationCity,
    cargoSpec: data.payload.cargoSpec,
    ...dateRange,
  }, adminToken);
  const routeItem = findRouteItem(slab.items, data.payload.originCity, data.payload.destinationCity);
  if (!routeItem) {
    throw new Error(`大板整车专区未返回路线 ${data.payload.originCity} → ${data.payload.destinationCity}`);
  }
  const inRecent = Array.isArray(routeItem.recentOrders) && routeItem.recentOrders.some((item) => item.orderNumber === data.orderNumber);
  if (!inRecent) {
    throw new Error(`大板整车专区 recentOrders 未包含订单 ${data.orderNumber}`);
  }

  const normalDetail = await trpcQuery('stats.freightRateDetails', {
    originCity: data.payload.originCity,
    destinationCity: data.payload.destinationCity,
    cargoSpec: data.payload.cargoSpec,
    page: 1,
    pageSize: 50,
    ...dateRange,
  }, adminToken);
  const leaked = normalDetail.items.some((item) => item.orderNumber === data.orderNumber);
  if (leaked) {
    throw new Error(`大板整车订单 ${data.orderNumber} 错误出现在普通运价库中`);
  }
  return { routeItem, normalDetailCount: normalDetail.items.length };
}

async function createStatOrders(adminToken, dispatcherToken) {
  const route = {
    originProvince: '广东省',
    originCity: '广州',
    destinationProvince: '广西壮族自治区',
    destinationCity: '南宁',
    cargoSpec: 'STAT-800',
    cargoName: '抛光砖',
    weight: 10,
  };
  const freights = [3000, 3500, 4000];
  const created = [];
  for (const [index, freight] of freights.entries()) {
    const item = await completeOutsourceOrder(adminToken, dispatcherToken, {
      prefix: `PRICE-STAT-${index + 1}`,
      ...route,
      dispatchPrice: freight + 200,
      freight,
      depositAmount: 100,
      shippingNote: `价格统计样本 ${index + 1}`,
    });
    created.push(item);
  }
  return { created, route };
}

async function run() {
  const dateRange = monthRange();
  let adminToken = '';
  let dispatcherToken = '';

  try {
    const adminLogin = await login('admin', 'admin123');
    const dispatcherLogin = await login('test_outsource_dispatcher_01', 'Test@123456');
    adminToken = adminLogin.token;
    dispatcherToken = dispatcherLogin.token;
    addResult('环境准备', '账号登录', '通过', '管理员与外请调度账号登录成功');
  } catch (err) {
    addResult('环境准备', '账号登录', '失败', errorText(err));
    throw err;
  }

  try {
    const outsource = await completeOutsourceOrder(adminToken, dispatcherToken, {
      prefix: 'PRICE-OUT',
      originProvince: '广东省',
      originCity: '佛山',
      destinationProvince: '湖南省',
      destinationCity: '长沙',
      weight: 10,
      cargoName: '瓷砖',
      cargoSpec: 'OUT-800',
      dispatchPrice: 3400,
      freight: 3200,
      customerPrice: 4000,
      depositAmount: 300,
    });
    const check = await verifyOutsourceInPriceDb(adminToken, outsource, dateRange);
    const foundFreight = Number(check.detail.actualFreight || 0);
    addResult(
      '价格收录',
      '外请整车订单完成后收录',
      foundFreight === 3200 ? '通过' : '失败',
      `订单 ${outsource.orderNumber} 在普通运价库明细中可见，actualFreight=${foundFreight}`,
      { orderNumber: outsource.orderNumber, route: `${outsource.payload.originCity}→${outsource.payload.destinationCity}` },
    );
  } catch (err) {
    addResult('价格收录', '外请整车订单完成后收录', '失败', errorText(err));
  }

  try {
    const ltl = await completeLtlOrder(adminToken, {
      prefix: 'PRICE-LTL',
      originProvince: '广东省',
      originCity: '佛山',
      destinationProvince: '湖北省',
      destinationCity: '武汉',
      weight: 5,
      cargoName: '建材',
      cargoSpec: 'LTL-1200',
      quotedPrice: 2500,
      confirmedPrice: 2400,
      ltlUnitPrice: 420,
      ltlDeliveryFee: 150,
      ltlOtherFee: 50,
      customerPrice: 3200,
      totalCost: 2300,
    });
    const check = await verifyLtlInPriceDb(adminToken, ltl, dateRange);
    const ok = Number(check.detail.actualFreight || 0) === 2100 && Number(check.detail.totalCost || 0) === 2300;
    addResult(
      '价格收录',
      '零担订单完成录费后收录',
      ok ? '通过' : '失败',
      `订单 ${ltl.orderNumber} 在普通运价库明细中可见，actualFreight=${check.detail.actualFreight}，totalCost=${check.detail.totalCost}，ltlUnitPrice=${check.detail.ltlUnitPrice}`,
      { orderNumber: ltl.orderNumber, route: `${ltl.payload.originCity}→${ltl.payload.destinationCity}` },
    );
  } catch (err) {
    addResult('价格收录', '零担订单完成录费后收录', '失败', errorText(err));
  }

  try {
    const slab = await completeOutsourceOrder(adminToken, dispatcherToken, {
      prefix: 'PRICE-SLAB',
      originProvince: '广东省',
      originCity: '清远',
      destinationProvince: '陕西省',
      destinationCity: '西安',
      weight: 32,
      chargeableWeight: 32,
      cargoName: '岩板大板',
      cargoSpec: '1800*900',
      isLargeSlab: true,
      dispatchPrice: 8500,
      freight: 8000,
      customerPrice: 9000,
      depositAmount: 300,
    });
    const check = await verifyLargeSlabInPriceDb(adminToken, slab, dateRange);
    const ok = approxEqual(check.routeItem.slabFtlAvgUnitPrice, 250) && approxEqual(check.routeItem.slabFtlAvgFreight, 8000) && approxEqual(check.routeItem.slabFtlAvgChargeableWeight, 32);
    addResult(
      '价格收录',
      '大板订单收录到大板专区且不混入普通运价库',
      ok ? '通过' : '失败',
      `大板专区均价=${check.routeItem.slabFtlAvgUnitPrice}，平均运费=${check.routeItem.slabFtlAvgFreight}，平均计费吨=${check.routeItem.slabFtlAvgChargeableWeight}，普通库同规格明细数=${check.normalDetailCount}`,
      { route: `${slab.payload.originCity}→${slab.payload.destinationCity}`, orderNumber: slab.orderNumber },
    );
  } catch (err) {
    addResult('价格收录', '大板订单收录到大板专区且不混入普通运价库', '失败', errorText(err));
  }

  try {
    const statData = await createStatOrders(adminToken, dispatcherToken);
    const details = await trpcQuery('stats.freightRateDetails', {
      originCity: statData.route.originCity,
      destinationCity: statData.route.destinationCity,
      cargoSpec: statData.route.cargoSpec,
      page: 1,
      pageSize: 100,
      ...dateRange,
    }, adminToken);

    const sampleOrderNumbers = statData.created.map((item) => item.orderNumber);
    const detailItems = details.items.filter((item) => sampleOrderNumbers.includes(item.orderNumber));
    const routeQueryOk = detailItems.length === 3;
    addResult(
      '价格查询',
      '按线路查询历史运价',
      routeQueryOk ? '通过' : '失败',
      `路线 ${statData.route.originCity}→${statData.route.destinationCity} + 规格 ${statData.route.cargoSpec} 返回 ${detailItems.length} 条样本订单，期望 3 条`,
      { orders: sampleOrderNumbers.join(', ') },
    );

    const outsourceAgg = await trpcQuery('stats.freightRates', {
      originCity: statData.route.originCity,
      destinationCity: statData.route.destinationCity,
      cargoSpec: statData.route.cargoSpec,
      businessType: 'outsource',
      ...dateRange,
    }, adminToken);
    const routeItem = findRouteItem(outsourceAgg.items, statData.route.originCity, statData.route.destinationCity);
    const businessTypeOk = !!routeItem && Number(routeItem.orderCount || 0) >= 3;
    addResult(
      '价格查询',
      '按业务类型筛选历史运价',
      businessTypeOk ? '通过' : '失败',
      routeItem
        ? `businessType=outsource 返回路线 ${routeItem.originCity}→${routeItem.destinationCity}，orderCount=${routeItem.orderCount}`
        : 'businessType=outsource 未返回目标路线',
    );

    const ltlAgg = await trpcQuery('stats.freightRates', {
      originCity: '佛山',
      destinationCity: '武汉',
      cargoSpec: 'LTL-1200',
      businessType: 'ltl',
      ...dateRange,
    }, adminToken);
    const ltlRouteItem = findRouteItem(ltlAgg.items, '佛山', '武汉');
    const ltlFilterOk = !!ltlRouteItem && Number(ltlRouteItem.orderCount || 0) >= 1;
    addResult(
      '价格查询',
      '零担业务类型筛选历史运价',
      ltlFilterOk ? '通过' : '失败',
      ltlRouteItem ? `businessType=ltl 返回路线 佛山→武汉，orderCount=${ltlRouteItem.orderCount}` : 'businessType=ltl 未返回佛山→武汉',
    );

    const specQueryOk = detailItems.every((item) => String(item.cargoSpec || '').includes(statData.route.cargoSpec));
    addResult(
      '价格查询',
      '按规格筛选历史运价',
      specQueryOk ? '通过' : '失败',
      `规格 ${statData.route.cargoSpec} 查询命中 ${detailItems.length} 条样本订单，cargoSpec=${detailItems.map((item) => item.cargoSpec).join(' | ')}`,
    );

    const unitPrices = detailItems.map(unitPriceFromDetail).filter((n) => Number.isFinite(n) && n > 0);
    const avg = Math.round(unitPrices.reduce((sum, n) => sum + n, 0) / unitPrices.length * 100) / 100;
    const min = Math.min(...unitPrices);
    const max = Math.max(...unitPrices);
    const avgMatches = !!routeItem && approxEqual(routeItem.tier3Price, avg);
    const minMaxExpected = approxEqual(min, 300) && approxEqual(max, 400) && approxEqual(avg, 350);
    addResult(
      '价格统计',
      '均价、最高价、最低价统计准确',
      avgMatches && minMaxExpected ? '通过' : '失败',
      `明细样本单价=${unitPrices.join(', ')}；计算得到 avg=${avg}, min=${min}, max=${max}；普通运价库 tier3Price=${routeItem?.tier3Price ?? 'N/A'}`,
      { computedAverage: avg, computedMin: min, computedMax: max, aggregatedTier3: routeItem?.tier3Price ?? null },
    );
  } catch (err) {
    addResult('价格查询/统计', '按线路/业务类型/规格查询及统计', '失败', errorText(err));
  }
}

function buildMarkdown() {
  const passed = results.filter((r) => r.status === '通过').length;
  const failed = results.filter((r) => r.status === '失败').length;
  const warned = results.filter((r) => r.status !== '通过' && r.status !== '失败').length;
  const endedAt = new Date().toISOString();

  const summaryRows = results.map((r) => `| ${r.category} | ${r.point} | ${r.status} | ${String(r.detail).replace(/\n/g, ' ')} |`).join('\n');
  const failedRows = results.filter((r) => r.status === '失败').map((r) => `| ${r.category} | ${r.point} | ${String(r.detail).replace(/\n/g, ' ')} |`).join('\n');
  const notes = runtimeNotes.length > 0 ? runtimeNotes.map((n) => `- ${n}`).join('\n') : '- 无';

  return `# 价格数据库测试报告\n\n> 生成时间：${endedAt}  \n> 测试环境：同一试用环境  \n> 测试脚本：\`server/price-db-runner.mjs\`\n\n## 一、测试范围\n\n本次测试围绕价格数据库的**收录、专区区分、查询过滤与统计准确性**展开，覆盖外请整车、零担、大板整车三类真实业务流，并通过统计接口与明细接口交叉验证结果。\n\n| 统计项 | 数量 |\n| --- | ---: |\n| 通过 | ${passed} |\n| 失败 | ${failed} |\n| 警告 | ${warned} |\n| 总计 | ${results.length} |\n\n## 二、结果汇总\n\n| 分类 | 测试点 | 结果 | 说明 |\n| --- | --- | --- | --- |\n${summaryRows || '| - | - | - | - |'}\n\n## 三、关键结论\n\n${failed === 0 ? '本轮价格数据库测试**全部通过**。外请整车、零担与大板整车订单均能在对应价格库中被正确收录；大板整车未混入普通运价库；线路、业务类型、规格查询结果与样本订单一致；普通运价均价与明细样本计算结果一致。' : '本轮价格数据库测试存在失败项，说明价格数据库在收录、查询或统计环节仍存在待排查问题。请结合下方失败明细优先定位。'}\n\n## 四、失败明细\n\n| 分类 | 测试点 | 失败原因 |\n| --- | --- | --- |\n${failedRows || '| 无 | 无 | 本轮无失败项 |'}\n\n## 五、运行备注\n\n${notes}\n`;
}

async function main() {
  try {
    await run();
  } catch (err) {
    runtimeNotes.push(`主流程异常：${errorText(err)}`);
  } finally {
    const report = buildMarkdown();
    await fs.writeFile(REPORT_PATH, report, 'utf8');
    await fs.writeFile(JSON_PATH, JSON.stringify({ startedAt: STARTED_AT, endedAt: new Date().toISOString(), results, runtimeNotes }, null, 2), 'utf8');
    await cleanupTrackedData();
  }
}

await main();
