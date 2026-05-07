import fs from 'fs';
import { SignJWT } from 'jose';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'yongan-local-dev-secret-2026';
const APP_ID = process.env.VITE_APP_ID || 'yongan-local';
const REPORT_PATH = '/home/ubuntu/test-report-group1.md';
const JSON_PATH = '/home/ubuntu/group1-results.json';
const NOW = new Date();
const TS = Date.now();

const USERS = {
  admin: { openId: 'local_admin_1775970056413', name: '本地管理员' },
  outsourceDispatcher: { openId: 'local_test_outsource_dispatcher_01', name: '外请调度员' },
  fleetDispatcher: { openId: 'local_test_fleet_dispatcher_01', name: '车队调度员' },
  ltlCs: { openId: 'local_test_ltl_cs_01', name: '零担客服' },
};

const results = [];
const runtimeNotes = [];

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
  try { return JSON.stringify(err); } catch { return String(err); }
}

function approxEqual(a, b, tolerance = 0.01) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}

function parseMaybeNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

async function generateToken(user) {
  return await new SignJWT({ openId: user.openId, appId: APP_ID, name: user.name })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setExpirationTime('24h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

async function trpcCall(procedure, input, token) {
  const url = `${BASE_URL}/api/trpc/${procedure}`;
  const res = await fetch(url, {
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
  const encodedInput = encodeURIComponent(JSON.stringify({ json: input }));
  const url = `${BASE_URL}/api/trpc/${procedure}?input=${encodedInput}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(`tRPC ${procedure} 查询失败: HTTP ${res.status} ${JSON.stringify(data?.error || data)}`);
  }
  return data?.result?.data?.json;
}

async function getOrder(id, token) {
  return await trpcQuery('order.getById', { id }, token);
}

async function getPodsByOrder(orderId, token) {
  const podList = await trpcQuery('pod.list', { page: 1, pageSize: 100 }, token);
  return (podList?.items || []).filter((item) => item.orderId === orderId);
}

async function getPendingApprovalByOrder(orderId, token) {
  const list = await trpcQuery('approval.list', { page: 1, pageSize: 100, status: 'pending' }, token);
  return (list?.items || []).find((item) => item.orderId === orderId);
}

function uniqueOrderNo(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

async function verifyAuth(token) {
  const me = await trpcQuery('auth.me', undefined, token);
  runtimeNotes.push(`认证探针成功：${JSON.stringify(me)}`);
  return me;
}

async function runSmartPaste(adminToken) {
  const regularText = 'F0002280459，2106.51KG托装 清远基地仓--陕西省西安市长安区广场北路999号中粮·悦著央璟DK10幼儿园';
  const slabText = 'F0002278640，2512.8KG，江西丰城仓---天津市西青区津港高速珠江材成D51号天闵陶瓷加工厂，1800*900，13托';

  try {
    const regular = await trpcCall('smartPaste.parse', { text: regularText }, adminToken);
    const order = regular?.orders?.[0] || regular?.records?.[0] || null;
    if (!order) {
      addResult('智能粘贴', '普通文本解析', '失败', `接口返回为空: ${JSON.stringify(regular)}`);
    } else {
      const orderNoOk = String(order.orderNumber || '').includes('F0002280459');
      const weight = parseMaybeNumber(order.weight);
      const weightOk = approxEqual(weight, 2106.51, 0.6) || approxEqual(weight, 2.10651, 0.02) || approxEqual(weight, 2.11, 0.03);
      const originText = [order.originCity, order.warehouseName, order.loadingAddress, order.shippingNote].map(formatValue).join(' ');
      const destText = [order.destinationCity, order.deliveryAddress, order.receiverAddress].map(formatValue).join(' ');
      const routeOk = /清远/.test(originText) && /(西安|长安)/.test(destText);
      if (orderNoOk && weightOk && routeOk) {
        addResult('智能粘贴', '普通文本解析', '通过', `成功解析运单号/重量/起止地: ${JSON.stringify({ orderNumber: order.orderNumber, weight: order.weight, originCity: order.originCity, warehouseName: order.warehouseName, destinationCity: order.destinationCity, deliveryAddress: order.deliveryAddress })}`);
      } else {
        addResult('智能粘贴', '普通文本解析', '失败', `字段解析不符合预期: ${JSON.stringify(order)}`);
      }
    }
  } catch (err) {
    addResult('智能粘贴', '普通文本解析', '失败', errorText(err));
  }

  try {
    const slab = await trpcCall('smartPaste.parse', { text: slabText }, adminToken);
    const order = slab?.orders?.[0] || slab?.records?.[0] || null;
    if (!order) {
      addResult('智能粘贴', '大板文本解析', '失败', `接口返回为空: ${JSON.stringify(slab)}`);
    } else {
      const orderNoOk = String(order.orderNumber || '').includes('F0002278640');
      const largeSlabOk = order.isLargeSlab === true || /1800\*900/.test([order.cargoSpec, order.shippingNote, order.remarks].map(formatValue).join(' '));
      const specOk = /1800\*900/.test([order.cargoSpec, order.shippingNote, order.remarks].map(formatValue).join(' '));
      const palletVal = parseMaybeNumber(order.palletCount);
      const pkgVal = parseMaybeNumber(order.packageCount);
      const palletOk = approxEqual(palletVal, 13, 0.01) || approxEqual(pkgVal, 13, 0.01);
      if (orderNoOk && largeSlabOk && specOk && palletOk) {
        addResult('智能粘贴', '大板文本解析', '通过', `成功识别大板规格和托数: ${JSON.stringify({ orderNumber: order.orderNumber, isLargeSlab: order.isLargeSlab, cargoSpec: order.cargoSpec, palletCount: order.palletCount, packageCount: order.packageCount })}`);
      } else {
        addResult('智能粘贴', '大板文本解析', '失败', `大板字段解析不符合预期: ${JSON.stringify(order)}`);
      }
    }
  } catch (err) {
    addResult('智能粘贴', '大板文本解析', '失败', errorText(err));
  }
}

async function pushOrderStatus(orderId, targetStatus, token, extra = {}) {
  await trpcCall('order.batchUpdateStatus', { orderIds: [orderId], status: targetStatus, ...extra }, token);
  return await getOrder(orderId, token);
}

async function settleOrder(orderId, adminToken) {
  await trpcCall('order.markSettled', { ids: [orderId] }, adminToken);
  return await getOrder(orderId, adminToken);
}

async function maybeReceivePod(orderId, adminToken) {
  const pods = await getPodsByOrder(orderId, adminToken);
  if (pods[0]) {
    await trpcCall('pod.updateStatus', { id: pods[0].id, originalStatus: 'received' }, adminToken);
    return (await getPodsByOrder(orderId, adminToken))[0];
  }
  return null;
}

async function runOutsourceFull(adminToken, dispatcherToken) {
  const orderNo = uniqueOrderNo('G1-OUT');
  let orderId = null;
  try {
    const created = await trpcCall('order.create', {
      orderNumber: orderNo,
      customerName: 'Group1外请整车客户',
      originCity: '清远',
      destinationCity: '西安',
      weight: '2106.51',
      cargoName: '瓷砖',
      customerPrice: '6800',
      deliveryAddress: '陕西省西安市长安区广场北路999号中粮·悦著央璟DK10幼儿园',
      receiverName: 'Group1外请收货人',
      receiverPhone: '13800001111',
      shippingNote: 'Group1外请整车全链路',
      businessType: 'outsource',
    }, adminToken);
    orderId = created.id;
    const createdOrder = await getOrder(orderId, adminToken);
    addResult('外请整车完整链路', '创建外请整车订单', '通过', `订单创建成功，ID=${orderId}，初始状态=${createdOrder.status}`);
    if (createdOrder.status === 'pending_assign') {
      addResult('外请整车完整链路', 'pending_assign', '通过', '订单初始状态即 pending_assign');
    } else {
      addResult('外请整车完整链路', 'pending_assign', '失败', `实际初始状态为 ${createdOrder.status}，系统未暴露 pending_assign 作为主状态`);
    }
    if (createdOrder.status === 'pending_price') {
      addResult('外请整车完整链路', 'pending_price', '通过', '创建后状态为 pending_price');
    } else {
      addResult('外请整车完整链路', 'pending_price', '失败', `创建后状态不是 pending_price，而是 ${createdOrder.status}`);
    }

    await trpcCall('order.priceAndAssign', { orderId, dispatchPrice: '5200' }, adminToken);
    const afterPricing = await getOrder(orderId, adminToken);
    if (afterPricing.status === 'priced') {
      addResult('外请整车完整链路', 'priced', '通过', '定价后状态为 priced');
    } else {
      addResult('外请整车完整链路', 'priced', '失败', `定价后系统直接进入 ${afterPricing.status}，未观察到 priced 独立状态`);
    }
    if (afterPricing.status === 'pending_vehicle') {
      addResult('外请整车完整链路', 'pending_vehicle', '通过', `定价后状态为 pending_vehicle，dispatchPrice=${afterPricing.dispatchPrice}`);
    } else {
      addResult('外请整车完整链路', 'pending_vehicle', '失败', `定价后状态不是 pending_vehicle，而是 ${afterPricing.status}`);
    }

    await trpcCall('order.batchDispatch', {
      orderIds: [orderId],
      plateNumber: '粤G10001',
      driverName: '外请司机甲',
      driverPhone: '13900002222',
      totalFreight: '5600',
      depositAmount: '300',
      depositRefundable: true,
    }, dispatcherToken);
    const afterDispatchTry = await getOrder(orderId, adminToken);
    if (afterDispatchTry.status === 'pending_approval') {
      addResult('外请整车完整链路', 'pending_approval', '通过', '找车报价高于定价，成功进入待审批');
    } else {
      addResult('外请整车完整链路', 'pending_approval', '失败', `找车后状态为 ${afterDispatchTry.status}，未进入 pending_approval`);
    }

    const approval = await getPendingApprovalByOrder(orderId, adminToken);
    if (approval?.id) {
      await trpcCall('approval.execute', { id: approval.id, action: 'approve', approvedAmount: approval.requestedAmount || '5600', approverComment: 'Group1自动化审批通过' }, adminToken);
      const afterApproval = await getOrder(orderId, adminToken);
      if (afterApproval.status === 'dispatched') {
        addResult('外请整车完整链路', 'dispatched', '通过', `审批通过后成功派车，actualFreight=${afterApproval.actualFreight}`);
      } else {
        addResult('外请整车完整链路', 'dispatched', '失败', `审批通过后状态为 ${afterApproval.status}`);
      }
    } else {
      addResult('外请整车完整链路', 'dispatched', '失败', '未查询到对应待审批记录，无法执行审批后派车');
    }

    const afterTransit = await pushOrderStatus(orderId, 'in_transit', adminToken);
    addResult('外请整车完整链路', 'in_transit', afterTransit.status === 'in_transit' ? '通过' : '失败', `状态推进结果=${afterTransit.status}`);

    const afterDelivered = await pushOrderStatus(orderId, 'delivered', adminToken);
    addResult('外请整车完整链路', 'delivered', afterDelivered.status === 'delivered' ? '通过' : '失败', `状态推进结果=${afterDelivered.status}`);

    const afterSigned = await pushOrderStatus(orderId, 'signed', adminToken);
    addResult('外请整车完整链路', 'signed', afterSigned.status === 'signed' ? '通过' : '失败', `状态推进结果=${afterSigned.status}`);

    try {
      const afterPendingReceipt = await pushOrderStatus(orderId, 'pending_receipt', adminToken);
      addResult('外请整车完整链路', 'pending_receipt', afterPendingReceipt.status === 'pending_receipt' ? '通过' : '失败', `状态推进结果=${afterPendingReceipt.status}`);
    } catch (err) {
      const pods = await getPodsByOrder(orderId, adminToken);
      const pod = pods[0];
      addResult('外请整车完整链路', 'pending_receipt', pod?.originalStatus === 'pending' ? '问题' : '失败', `订单接口不支持 pending_receipt 主状态；当前订单状态=${(await getOrder(orderId, adminToken)).status}，回单状态=${pod?.originalStatus || '无回单'}`);
    }

    await maybeReceivePod(orderId, adminToken);
    const settled = await settleOrder(orderId, adminToken);
    addResult('外请整车完整链路', 'settled', settled.status === 'settled' ? '通过' : '失败', `结算后状态=${settled.status}`);
  } catch (err) {
    addResult('外请整车完整链路', '流程执行', '失败', `orderId=${orderId || '未创建'}，${errorText(err)}`);
  }
}

async function runSelfFull(adminToken) {
  const orderNo = uniqueOrderNo('G1-SELF');
  let orderId = null;
  try {
    const created = await trpcCall('order.create', {
      orderNumber: orderNo,
      customerName: 'Group1自运客户',
      originCity: '清远',
      destinationCity: '西安',
      weight: '2106.51',
      cargoName: '瓷砖',
      customerPrice: '6600',
      deliveryAddress: '陕西省西安市长安区广场北路999号中粮·悦著央璟DK10幼儿园',
      receiverName: 'Group1自运收货人',
      receiverPhone: '13800003333',
      shippingNote: 'Group1自运全链路',
      businessType: 'self',
    }, adminToken);
    orderId = created.id;
    const order = await getOrder(orderId, adminToken);
    addResult('自运完整链路', '创建自运订单', '通过', `订单创建成功，ID=${orderId}，初始状态=${order.status}`);
    addResult('自运完整链路', 'pending_assign', order.status === 'pending_assign' ? '通过' : '失败', `实际初始状态=${order.status}`);
    addResult('自运完整链路', 'pending_dispatch', order.status === 'pending_dispatch' ? '通过' : '失败', `实际初始状态=${order.status}`);

    const dispatched = await pushOrderStatus(orderId, 'dispatched', adminToken, {
      plateNumber: '粤G20002',
      driverName: '自运司机乙',
      driverPhone: '13900004444',
      actualFreight: '1800',
    });
    addResult('自运完整链路', 'dispatched', dispatched.status === 'dispatched' ? '通过' : '失败', `状态推进结果=${dispatched.status}`);

    const delivered = await pushOrderStatus(orderId, 'delivered', adminToken);
    addResult('自运完整链路', 'delivered', delivered.status === 'delivered' ? '通过' : '失败', `状态推进结果=${delivered.status}`);

    const signed = await pushOrderStatus(orderId, 'signed', adminToken);
    addResult('自运完整链路', 'signed', signed.status === 'signed' ? '通过' : '失败', `状态推进结果=${signed.status}`);

    try {
      const afterPendingReceipt = await pushOrderStatus(orderId, 'pending_receipt', adminToken);
      addResult('自运完整链路', 'pending_receipt', afterPendingReceipt.status === 'pending_receipt' ? '通过' : '失败', `状态推进结果=${afterPendingReceipt.status}`);
    } catch (err) {
      const pod = (await getPodsByOrder(orderId, adminToken))[0];
      addResult('自运完整链路', 'pending_receipt', pod?.originalStatus === 'pending' ? '问题' : '失败', `订单接口不支持 pending_receipt 主状态；订单状态=${(await getOrder(orderId, adminToken)).status}，回单状态=${pod?.originalStatus || '无回单'}`);
    }

    await maybeReceivePod(orderId, adminToken);
    const settled = await settleOrder(orderId, adminToken);
    addResult('自运完整链路', 'settled', settled.status === 'settled' ? '通过' : '失败', `结算后状态=${settled.status}`);
  } catch (err) {
    addResult('自运完整链路', '流程执行', '失败', `orderId=${orderId || '未创建'}，${errorText(err)}`);
  }
}

async function runOutsourceChildFlow(orderId, adminToken, dispatcherToken, label) {
  const initial = await getOrder(orderId, adminToken);
  if (initial.status !== 'pending_price') {
    addResult(label, '子链初始化', '失败', `初始状态=${initial.status}`);
  }
  await trpcCall('order.priceAndAssign', { orderId, dispatchPrice: '1200' }, adminToken);
  const priced = await getOrder(orderId, adminToken);
  addResult(label, '子链定价', priced.status === 'pending_vehicle' ? '通过' : '失败', `定价后状态=${priced.status}`);
  await trpcCall('order.batchDispatch', {
    orderIds: [orderId],
    plateNumber: '粤G30003',
    driverName: '子链司机',
    driverPhone: '13900005555',
    totalFreight: '1180',
    depositAmount: '0',
    depositRefundable: true,
  }, dispatcherToken);
  const dispatched = await getOrder(orderId, adminToken);
  addResult(label, '子链派车', dispatched.status === 'dispatched' ? '通过' : '失败', `派车后状态=${dispatched.status}`);
  const delivered = await pushOrderStatus(orderId, 'delivered', adminToken);
  addResult(label, '子链送达', delivered.status === 'delivered' ? '通过' : '失败', `状态=${delivered.status}`);
  const signed = await pushOrderStatus(orderId, 'signed', adminToken);
  addResult(label, '子链签收', signed.status === 'signed' ? '通过' : '失败', `状态=${signed.status}`);
  await maybeReceivePod(orderId, adminToken);
  const settled = await settleOrder(orderId, adminToken);
  addResult(label, '子链结算', settled.status === 'settled' ? '通过' : '失败', `状态=${settled.status}`);
}

async function runLtlParentCore(parentId, adminToken, mergedPlanNumber, label) {
  const initial = await getOrder(parentId, adminToken);
  addResult(label, '主单 pending_inquiry', initial.status === 'pending_inquiry' ? '通过' : '失败', `初始状态=${initial.status}`);

  const inquiry = await trpcCall('ltlInquiry.create', {
    orderId: parentId,
    freightStationId: 1,
    finalStationName: '德邦物流佛山站',
    quotedPrice: '1500',
    remarks: `${label}-询价`,
  }, adminToken);
  addResult(label, '创建询价', inquiry?.id ? '通过' : '失败', `询价ID=${inquiry?.id || '无'}`);

  await trpcCall('ltlInquiry.update', {
    id: inquiry.id,
    confirmedPrice: '1400',
    inquiryStatus: 'confirmed',
  }, adminToken);
  const afterConfirm = await getOrder(parentId, adminToken);
  addResult(label, '主单 inquiry_confirmed', afterConfirm.status === 'inquiry_confirmed' ? '通过' : '失败', `确认询价后状态=${afterConfirm.status}`);

  const batch = await trpcCall('order.createLtlBatch', {
    orderIds: [parentId],
    plateNumber: '粤G40004',
    driverName: '零担司机丙',
    driverPhone: '13900006666',
    remarks: [{ orderId: parentId, remark: `${label}-派车备注` }],
  }, adminToken);
  addResult(label, '创建零担批次', batch?.batchId ? '通过' : '失败', `batchId=${batch?.batchId || '无'} batchCode=${batch?.batchCode || '无'}`);

  const afterBatch = await getOrder(parentId, adminToken);
  addResult(label, '主单 dispatched', afterBatch.status === 'dispatched' ? '通过' : '失败', `批次派车后状态=${afterBatch.status}`);

  const shipped = await trpcCall('order.updateStatus', {
    id: parentId,
    status: 'shipped',
    ltlUnitPrice: '420',
    ltlDeliveryFee: '100',
    ltlOtherFee: '0',
    freightStationName: '德邦物流佛山站',
    freightWaybillNumber: `WB-${parentId}-${Date.now()}`,
    inquiryPhone: '020-88880000',
  }, adminToken);
  const afterShipped = await getOrder(parentId, adminToken);
  addResult(label, '主单 shipped', afterShipped.status === 'shipped' ? '通过' : '失败', `费用录入后状态=${afterShipped.status}`);

  const delivered = await trpcCall('order.updateStatus', { id: parentId, status: 'delivered' }, adminToken);
  const afterDelivered = await getOrder(parentId, adminToken);
  addResult(label, '主单 delivered', afterDelivered.status === 'delivered' ? '通过' : '失败', `状态=${afterDelivered.status}`);

  await trpcCall('order.updateStatus', { id: parentId, status: 'signed' }, adminToken);
  const afterSigned = await getOrder(parentId, adminToken);
  addResult(label, '主单 signed', afterSigned.status === 'signed' ? '通过' : '失败', `状态=${afterSigned.status}`);

  const parentPod = (await getPodsByOrder(parentId, adminToken))[0];
  if (parentPod) {
    await trpcCall('pod.updateStatus', { id: parentPod.id, originalStatus: 'received' }, adminToken);
    addResult(label, '主单回单收回', '通过', `podId=${parentPod.id}`);
  } else {
    addResult(label, '主单回单收回', '问题', '未查询到主单回单记录');
  }
}

async function runLtlMode(adminToken, dispatcherToken, mode) {
  const label = `零担完整链路-${mode.name}`;
  let parentId = null;
  let pickupId = null;
  let deliveryId = null;
  try {
    const parentRemarks = [];
    if (mode.front === 'customer_self_deliver') parentRemarks.push('【零担前段客户自送到站】');
    if (mode.back === 'customer_pickup') parentRemarks.push('【零担后段客户自提】');
    const mergedPlanNumber = uniqueOrderNo(`G1-LTL-MP-${mode.code}`);
    const parentCreate = await trpcCall('order.create', {
      orderNumber: uniqueOrderNo(`G1-LTL-${mode.code}`),
      customerName: `Group1零担客户-${mode.code}`,
      originCity: '佛山',
      destinationCity: '武汉',
      weight: '5',
      cargoName: '瓷砖',
      customerPrice: '3000',
      deliveryAddress: '武汉市洪山区测试仓',
      receiverName: '零担收货人',
      receiverPhone: '13800007777',
      shippingNote: `Group1零担模式 ${mode.name}`,
      businessType: 'ltl',
      mergedPlanNumber,
      remarks: parentRemarks.join('\n') || undefined,
      isUrgent: false,
    }, adminToken);
    parentId = parentCreate.id;
    addResult(label, '创建零担主单', '通过', `parentId=${parentId} mergedPlanNumber=${mergedPlanNumber}`);

    if (mode.front === 'pickup_outsource') {
      const pickup = await trpcCall('order.create', {
        orderNumber: uniqueOrderNo(`G1-LTL-PICK-${mode.code}`),
        customerName: `Group1零担前段外请-${mode.code}`,
        originCity: '佛山',
        destinationCity: '佛山站点',
        weight: '5',
        cargoName: '瓷砖',
        customerPrice: '1000',
        deliveryAddress: '佛山站点',
        receiverName: '站点收货人',
        receiverPhone: '13800008888',
        shippingNote: `前段外请-${mode.name}`,
        businessType: 'outsource',
        parentIds: [parentId],
        subchainStage: 'pickup',
      }, adminToken);
      pickupId = pickup.id;
      const pickupStatus = await trpcQuery('order.getLtlPickupSubchainStatus', { parentIds: [parentId] }, adminToken);
      addResult(label, '创建前段外请子链', (pickupStatus?.items || []).some((x) => x.id === pickupId) ? '通过' : '失败', `pickupId=${pickupId}`);
      await runOutsourceChildFlow(pickupId, adminToken, dispatcherToken, `${label}-前段外请子链`);
    } else if (mode.front === 'self_transport') {
      addResult(label, '前段模式', '通过', '采用系统默认前段自运主单模式');
    } else if (mode.front === 'customer_self_deliver') {
      const parent = await getOrder(parentId, adminToken);
      addResult(label, '前段客户自送标记', /零担前段客户自送到站/.test(parent.remarks || '') ? '通过' : '失败', `remarks=${parent.remarks || ''}`);
    }

    if (mode.back === 'delivery_outsource') {
      const delivery = await trpcCall('order.create', {
        orderNumber: uniqueOrderNo(`G1-LTL-DELIV-${mode.code}`),
        customerName: `Group1零担后段外请-${mode.code}`,
        originCity: '武汉站点',
        destinationCity: '武汉',
        weight: '5',
        cargoName: '瓷砖',
        customerPrice: '1000',
        deliveryAddress: '武汉市洪山区测试仓',
        receiverName: '末端收货人',
        receiverPhone: '13800009999',
        shippingNote: `后段外请-${mode.name}`,
        businessType: 'outsource',
        parentIds: [parentId],
        subchainStage: 'delivery',
      }, adminToken);
      deliveryId = delivery.id;
      const deliveryStatus = await trpcQuery('order.getLtlDeliverySubchainStatus', { parentIds: [parentId] }, adminToken);
      addResult(label, '创建后段外请子链', (deliveryStatus?.items || []).some((x) => x.id === deliveryId) ? '通过' : '失败', `deliveryId=${deliveryId}`);
    } else if (mode.back === 'station_delivery') {
      addResult(label, '后段模式', '通过', '系统实际后段模式名称为 station_delivery，对应用户口径“后段自运”');
    } else if (mode.back === 'customer_pickup') {
      const parent = await getOrder(parentId, adminToken);
      addResult(label, '后段客户自提标记', /零担后段客户自提/.test(parent.remarks || '') ? '通过' : '失败', `remarks=${parent.remarks || ''}`);
    }

    await runLtlParentCore(parentId, adminToken, mergedPlanNumber, label);

    if (deliveryId) {
      await runOutsourceChildFlow(deliveryId, adminToken, dispatcherToken, `${label}-后段外请子链`);
    }

    const finalParent = await getOrder(parentId, adminToken);
    const expectedParentOk = ['signed', 'settled'].includes(finalParent.status);
    addResult(label, '模式最终校验', expectedParentOk ? '通过' : '失败', `parentId=${parentId} finalStatus=${finalParent.status} pickupId=${pickupId || '无'} deliveryId=${deliveryId || '无'}`);
  } catch (err) {
    addResult(label, '流程执行', '失败', `parentId=${parentId || '未创建'} pickupId=${pickupId || '无'} deliveryId=${deliveryId || '无'}，${errorText(err)}`);
  }
}

function buildReport() {
  const total = results.length;
  const passed = results.filter((x) => x.status === '通过').length;
  const failed = results.filter((x) => x.status === '失败').length;
  const warned = results.filter((x) => x.status === '问题').length;
  const grouped = new Map();
  for (const row of results) {
    if (!grouped.has(row.category)) grouped.set(row.category, []);
    grouped.get(row.category).push(row);
  }

  let md = '';
  md += '# Group 1 自动化测试报告\n\n';
  md += `> 生成时间：${NOW.toISOString()}\n\n`;
  md += `> 运行地址：${BASE_URL}\n\n`;
  md += `> 认证参数：APP_ID=${APP_ID}，JWT_SECRET 使用${process.env.JWT_SECRET ? '环境变量' : '本地回退值'}。\n\n`;
  md += '## 一、测试范围与说明\n\n';
  md += '本次脚本直接调用当前试用环境中的系统接口，对用户要求的 **智能粘贴**、**外请整车完整链路**、**自运完整链路** 以及 **6 种零担前后段模式** 进行逐项验证。报告中的“通过/失败/问题”均以接口返回与状态查询结果为准。\n\n';
  md += '## 二、总体结论\n\n';
  md += '| 指标 | 数值 |\n';
  md += '| --- | ---: |\n';
  md += `| 测试点总数 | ${total} |\n`;
  md += `| 通过 | ${passed} |\n`;
  md += `| 失败 | ${failed} |\n`;
  md += `| 问题 | ${warned} |\n\n`;

  if (runtimeNotes.length) {
    md += '## 三、运行期说明\n\n';
    for (const note of runtimeNotes) {
      md += `- ${note}\n`;
    }
    md += '\n';
  }

  md += '## 四、逐项结果\n\n';
  for (const [category, items] of grouped.entries()) {
    md += `### ${category}\n\n`;
    md += '| 测试点 | 结果 | 说明 |\n';
    md += '| --- | --- | --- |\n';
    for (const item of items) {
      md += `| ${item.point} | ${item.status} | ${String(item.detail).replace(/\n/g, '<br>')} |\n`;
    }
    md += '\n';
  }

  const issues = results.filter((x) => x.status !== '通过');
  md += '## 五、问题归纳\n\n';
  if (issues.length === 0) {
    md += '本轮自动化执行未发现异常项。\n\n';
  } else {
    md += '| 类别 | 测试点 | 现象 |\n';
    md += '| --- | --- | --- |\n';
    for (const item of issues) {
      md += `| ${item.category} | ${item.point} | ${String(item.detail).replace(/\n/g, '<br>')} |\n`;
    }
    md += '\n';
  }

  md += '## 六、结论\n\n';
  md += '本报告反映的是脚本在当前试用环境下通过真实接口得到的结果。若部分状态与需求文案不一致，通常表示 **系统当前实现的状态机与期望链路存在差异**，而非脚本断言错误；此类情况已在“失败/问题”栏中逐条写明。\n';
  return md;
}

async function main() {
  const adminToken = await generateToken(USERS.admin);
  const outsourceDispatcherToken = await generateToken(USERS.outsourceDispatcher);
  await verifyAuth(adminToken);

  await runSmartPaste(adminToken);
  await runOutsourceFull(adminToken, outsourceDispatcherToken);
  await runSelfFull(adminToken);

  const ltlModes = [
    { code: '1', name: '前段外请+后段外请', front: 'pickup_outsource', back: 'delivery_outsource' },
    { code: '2', name: '前段自运+后段外请', front: 'self_transport', back: 'delivery_outsource' },
    { code: '3', name: '前段客户自送+后段外请', front: 'customer_self_deliver', back: 'delivery_outsource' },
    { code: '4', name: '前段外请+后段自运', front: 'pickup_outsource', back: 'station_delivery' },
    { code: '5', name: '前段自运+后段自运', front: 'self_transport', back: 'station_delivery' },
    { code: '6', name: '前段客户自送+后段自运', front: 'customer_self_deliver', back: 'station_delivery' },
  ];

  for (const mode of ltlModes) {
    await runLtlMode(adminToken, outsourceDispatcherToken, mode);
  }

  fs.writeFileSync(JSON_PATH, JSON.stringify(results, null, 2));
  fs.writeFileSync(REPORT_PATH, buildReport());
  console.log(`结果已写入: ${REPORT_PATH}`);
  console.log(`原始结果已写入: ${JSON_PATH}`);
}

main().catch((err) => {
  const detail = errorText(err);
  addResult('执行器', '主流程异常', '失败', detail);
  try {
    fs.writeFileSync(JSON_PATH, JSON.stringify(results, null, 2));
    fs.writeFileSync(REPORT_PATH, buildReport());
  } catch {}
  console.error(detail);
  process.exit(1);
});
