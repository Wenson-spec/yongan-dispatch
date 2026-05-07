import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq, inArray, sql } from 'drizzle-orm';
import { orders, approvals, podRecords, ltlDispatchBatches, ltlDispatchBatchOrders, users } from '../drizzle/schema.ts';
import { WORKSTATION_CONFIGS } from '../shared/workstation.ts';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from '../shared/permissions.ts';
import { getUserPermissions } from './db.ts';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const REPORT_PATH = '/home/ubuntu/test-report-group2.md';
const JSON_PATH = '/home/ubuntu/group2-results.json';
const TS = Date.now();
const STARTED_AT = new Date().toISOString();

const pool = mysql.createPool(process.env.DATABASE_URL);
const db = drizzle(pool);

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

function uniqueOrderNo(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function approxEqual(a, b, tolerance = 0.0001) {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

function makeOrderPayload(prefix, overrides = {}) {
  const orderNumber = overrides.orderNumber || uniqueOrderNo(prefix);
  return {
    orderNumber,
    customerName: overrides.customerName || 'Group2测试客户',
    originCity: overrides.originCity || '清远',
    destinationCity: overrides.destinationCity || '西安',
    weight: overrides.weight || '1.000',
    cargoName: overrides.cargoName || '瓷砖',
    customerPrice: overrides.customerPrice || '100.00',
    deliveryAddress: overrides.deliveryAddress || '陕西省西安市长安区测试地址 88 号',
    receiverName: overrides.receiverName || 'Group2收货人',
    receiverPhone: overrides.receiverPhone || '13800000000',
    shippingNote: overrides.shippingNote || 'Group2 自动化测试',
    businessType: overrides.businessType || 'outsource',
    ...overrides,
    orderNumber,
  };
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
  const url = `${BASE_URL}/api/trpc/${procedure}?input=${encoded}`;
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

async function createOrder(token, prefix, overrides = {}) {
  const payload = makeOrderPayload(prefix, overrides);
  const created = await trpcCall('order.create', payload, token);
  const id = created?.id;
  if (!id) {
    const rows = await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, payload.orderNumber)).limit(1);
    if (!rows[0]?.id) {
      throw new Error(`订单创建后未能定位到记录: ${payload.orderNumber}`);
    }
    cleanupState.orderIds.add(rows[0].id);
    return { id: rows[0].id, orderNumber: payload.orderNumber };
  }
  cleanupState.orderIds.add(id);
  return { id, orderNumber: payload.orderNumber };
}

async function getOrderDb(id) {
  const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return rows[0] || null;
}

async function getUserByUsername(username) {
  const rows = await db.select({ id: users.id, username: users.username, role: users.role, name: users.name }).from(users).where(eq(users.username, username)).limit(1);
  return rows[0] || null;
}

async function countRows(table, orderId) {
  const rows = await db.select({ count: sql`count(*)` }).from(table).where(eq(table.orderId, orderId));
  return Number(rows[0]?.count || 0);
}

async function cleanupTrackedData() {
  try {
    if (cleanupState.batchIds.size > 0) {
      const batchIds = Array.from(cleanupState.batchIds);
      await db.delete(ltlDispatchBatchOrders).where(inArray(ltlDispatchBatchOrders.batchId, batchIds));
      await db.delete(ltlDispatchBatches).where(inArray(ltlDispatchBatches.id, batchIds));
    }
    if (cleanupState.orderIds.size > 0) {
      const orderIds = Array.from(cleanupState.orderIds);
      await db.update(orders).set({ parentId: null }).where(inArray(orders.id, orderIds));
      await db.delete(approvals).where(inArray(approvals.orderId, orderIds));
      await db.delete(podRecords).where(inArray(podRecords.orderId, orderIds));
      await db.delete(ltlDispatchBatchOrders).where(inArray(ltlDispatchBatchOrders.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
  } catch (err) {
    runtimeNotes.push(`清理测试数据时出现异常：${errorText(err)}`);
  }
}

async function expectFailure(run, expectedIncludes = '') {
  try {
    await run();
    return { ok: false, message: '操作意外成功' };
  } catch (err) {
    const message = errorText(err);
    if (!expectedIncludes) return { ok: true, message };
    return { ok: message.includes(expectedIncludes), message };
  }
}

function normalizePermissionSet(list = []) {
  return Array.from(new Set(list)).sort();
}

async function runRollbackTests(adminToken) {
  const scenarios = [
    {
      status: 'pending_price',
      patch: {
        status: 'pending_price',
        entryQueueReason: 'new',
        actualFreight: '1888.66',
        totalCost: '1666.00',
      },
      fieldsShouldClear: ['actualFreight', 'totalCost'],
    },
    {
      status: 'pending_vehicle',
      patch: {
        status: 'pending_vehicle',
        entryQueueReason: 'new',
        actualFreight: '2888.66',
        totalCost: '2555.00',
      },
      fieldsShouldClear: ['actualFreight', 'totalCost'],
    },
    {
      status: 'dispatched',
      patch: {
        status: 'dispatched',
        entryQueueReason: 'new',
        actualFreight: '3888.66',
        totalCost: '3555.00',
        plateNumber: '粤A12345',
        driverName: '外请司机甲',
        driverPhone: '13800001111',
        depositAmount: '300.00',
        depositStatus: 'paid',
        depositRefundable: true,
        dispatchDate: new Date(),
      },
      fieldsShouldClear: ['actualFreight', 'totalCost', 'plateNumber', 'driverName', 'driverPhone', 'dispatchDate', 'depositAmount'],
    },
    {
      status: 'delivered',
      patch: {
        status: 'delivered',
        entryQueueReason: 'new',
        actualFreight: '4888.66',
        totalCost: '4555.00',
        plateNumber: '粤B22345',
        driverName: '外请司机乙',
        driverPhone: '13800002222',
        depositAmount: '500.00',
        depositStatus: 'paid',
        depositRefundable: true,
        dispatchDate: new Date(),
        loadingDate: new Date(),
        transitDate: new Date(),
        deliveryDate: new Date(),
      },
      fieldsShouldClear: ['actualFreight', 'totalCost', 'plateNumber', 'driverName', 'driverPhone', 'dispatchDate', 'deliveryDate', 'depositAmount'],
    },
    {
      status: 'signed',
      patch: {
        status: 'signed',
        entryQueueReason: 'new',
        actualFreight: '5888.66',
        totalCost: '5555.00',
        plateNumber: '粤C32345',
        driverName: '外请司机丙',
        driverPhone: '13800003333',
        depositAmount: '600.00',
        depositStatus: 'paid',
        depositRefundable: true,
        dispatchDate: new Date(),
        loadingDate: new Date(),
        transitDate: new Date(),
        deliveryDate: new Date(),
        signedDate: new Date(),
        signedBy: '客户签收人',
        signedRemark: '已签收',
      },
      fieldsShouldClear: ['actualFreight', 'totalCost', 'plateNumber', 'driverName', 'driverPhone', 'dispatchDate', 'deliveryDate', 'signedDate', 'signedBy', 'depositAmount'],
    },
  ];

  for (const item of scenarios) {
    try {
      const created = await createOrder(adminToken, `G2-RB-${item.status.toUpperCase()}`, {
        businessType: 'outsource',
        shippingNote: `Group2 退回测试 ${item.status}`,
      });
      await db.update(orders).set(item.patch).where(eq(orders.id, created.id));
      const apiResult = await trpcCall('order.revertStatus', {
        id: created.id,
        targetStatus: 'pending_assign',
        reason: `Group2 自动化退回测试 ${item.status}`,
      }, adminToken);
      const orderAfter = await getOrderDb(created.id);
      const statusOk = orderAfter?.status === 'pending_assign';
      const reasonOk = orderAfter?.entryQueueReason === 'returned';
      const clearedFieldStates = Object.fromEntries(item.fieldsShouldClear.map((field) => [field, orderAfter?.[field] ?? null]));
      const cleanedOk = item.fieldsShouldClear.every((field) => orderAfter?.[field] === null || orderAfter?.[field] === undefined || orderAfter?.[field] === '');
      const allOk = statusOk && reasonOk && cleanedOk && apiResult?.toStatus === 'pending_assign';
      addResult(
        '退回测试',
        `${item.status} → pending_assign`,
        allOk ? '通过' : '失败',
        `退回后状态=${orderAfter?.status ?? 'null'}，entryQueueReason=${orderAfter?.entryQueueReason ?? 'null'}，清理字段=${JSON.stringify(clearedFieldStates)}`,
        {
          expectedStatus: 'pending_assign',
          expectedEntryQueueReason: 'returned',
          actualStatus: orderAfter?.status ?? null,
          actualEntryQueueReason: orderAfter?.entryQueueReason ?? null,
          cleanedFields: clearedFieldStates,
        },
      );
    } catch (err) {
      addResult('退回测试', `${item.status} → pending_assign`, '失败', errorText(err));
    }
  }
}

async function runDeleteTests(adminToken, adminUserId) {
  try {
    const created = await createOrder(adminToken, 'G2-DEL-CLEAN', { businessType: 'outsource' });
    await db.insert(approvals).values({
      orderId: created.id,
      approvalType: 'initial_price',
      applicantId: adminUserId,
      applicantName: 'admin',
      status: 'pending',
      previousStatus: 'pending_price',
      requestedAmount: '123.45',
      reason: 'Group2 删除清理测试审批单',
    });
    await db.insert(podRecords).values({
      orderId: created.id,
      podOwnership: 'current_order',
      originalStatus: 'pending',
      depositLinked: true,
      depositAmount: '200.00',
      depositRefunded: false,
    });

    await trpcCall('order.delete', { id: created.id }, adminToken);

    const orderAfter = await getOrderDb(created.id);
    const approvalCount = await countRows(approvals, created.id);
    const podCount = await countRows(podRecords, created.id);
    const ok = !orderAfter && approvalCount === 0 && podCount === 0;
    addResult(
      '删除测试',
      '允许删除状态下的关联清理',
      ok ? '通过' : '失败',
      `订单存在=${!!orderAfter}，审批残留=${approvalCount}，回单残留=${podCount}`,
      { orderId: created.id, approvalCount, podCount },
    );
    cleanupState.orderIds.delete(created.id);
  } catch (err) {
    addResult('删除测试', '允许删除状态下的关联清理', '失败', errorText(err));
  }

  try {
    const created = await createOrder(adminToken, 'G2-DEL-PODLOCK', { businessType: 'outsource' });
    await db.insert(podRecords).values({
      orderId: created.id,
      podOwnership: 'current_order',
      originalStatus: 'received',
      depositLinked: false,
      depositRefunded: false,
    });
    const failed = await expectFailure(() => trpcCall('order.delete', { id: created.id }, adminToken), '回单');
    const orderAfter = await getOrderDb(created.id);
    const ok = failed.ok && !!orderAfter;
    addResult(
      '删除测试',
      '存在已流转回单时禁止删除',
      ok ? '通过' : '失败',
      `删除响应=${failed.message}；订单仍存在=${!!orderAfter}`,
      { orderId: created.id, error: failed.message },
    );
  } catch (err) {
    addResult('删除测试', '存在已流转回单时禁止删除', '失败', errorText(err));
  }

  try {
    const created = await createOrder(adminToken, 'G2-DEL-BATCHLOCK', { businessType: 'ltl' });
    const batchInsert = await db.insert(ltlDispatchBatches).values({
      batchCode: `LTL-G2-${Date.now()}`,
      plateNumber: '粤G28888',
      driverName: '零担测试司机',
      driverPhone: '13900008888',
      remark: 'Group2 删除批次保护测试',
      createdBy: adminUserId,
      createdByName: 'admin',
    });
    const batchId = batchInsert[0].insertId;
    cleanupState.batchIds.add(batchId);
    await db.insert(ltlDispatchBatchOrders).values({ batchId, orderId: created.id, remark: 'Group2 批次关联', sortOrder: 1 });
    const failed = await expectFailure(() => trpcCall('order.delete', { id: created.id }, adminToken), '批次');
    const relationRows = await db.select({ count: sql`count(*)` }).from(ltlDispatchBatchOrders).where(eq(ltlDispatchBatchOrders.orderId, created.id));
    const orderAfter = await getOrderDb(created.id);
    const ok = failed.ok && !!orderAfter && Number(relationRows[0]?.count || 0) === 1;
    addResult(
      '删除测试',
      '零担批次关联时禁止删除',
      ok ? '通过' : '失败',
      `删除响应=${failed.message}；订单仍存在=${!!orderAfter}；批次关联数=${relationRows[0]?.count || 0}`,
      { orderId: created.id, batchId, error: failed.message },
    );
  } catch (err) {
    addResult('删除测试', '零担批次关联时禁止删除', '失败', errorText(err));
  }
}

async function runMergeTests(adminToken) {
  try {
    const orderA = await createOrder(adminToken, 'G2-MERGE-A', {
      businessType: 'outsource',
      cargoName: '瓷砖A',
      weight: '1.250',
      customerPrice: '100.50',
      destinationCity: '西安',
    });
    const orderB = await createOrder(adminToken, 'G2-MERGE-B', {
      businessType: 'outsource',
      cargoName: '瓷砖B',
      weight: '2.500',
      customerPrice: '200.25',
      destinationCity: '西安',
    });
    const mergeResult = await trpcCall('order.mergeOrders', {
      childOrderIds: [orderA.id, orderB.id],
      businessType: 'outsource',
      customerName: 'Group2 合并客户',
      destinationCity: '西安',
      remarks: 'Group2 合并订单测试',
    }, adminToken);
    const parentId = mergeResult?.parentOrderId;
    if (parentId) cleanupState.orderIds.add(parentId);
    const parent = parentId ? await getOrderDb(parentId) : null;
    const childA = await getOrderDb(orderA.id);
    const childB = await getOrderDb(orderB.id);
    const weightOk = approxEqual(parent?.weight, 3.75);
    const amountOk = approxEqual(parent?.customerPrice, 300.75);
    const childrenOk = childA?.status === 'merged' && childB?.status === 'merged' && childA?.parentId === parentId && childB?.parentId === parentId;
    const statusOk = parent?.status === 'pending_price' && parent?.isMerged === true;
    const ok = !!parent && weightOk && amountOk && childrenOk && statusOk;
    addResult(
      '合并订单测试',
      '多订单合并汇总与原单标记',
      ok ? '通过' : '失败',
      `主单ID=${parentId}，重量=${parent?.weight ?? 'null'}，金额=${parent?.customerPrice ?? 'null'}，子单状态=${childA?.status ?? 'null'}/${childB?.status ?? 'null'}`,
      {
        parentId,
        parentWeight: parent?.weight ?? null,
        parentCustomerPrice: parent?.customerPrice ?? null,
        childAStatus: childA?.status ?? null,
        childBStatus: childB?.status ?? null,
        childAParentId: childA?.parentId ?? null,
        childBParentId: childB?.parentId ?? null,
      },
    );
  } catch (err) {
    addResult('合并订单测试', '多订单合并汇总与原单标记', '失败', errorText(err));
  }
}

async function runHoldTests(adminToken, assigneeId) {
  try {
    const created = await createOrder(adminToken, 'G2-HOLD', { businessType: 'outsource' });
    await db.update(orders).set({
      status: 'dispatched',
      assignedDispatcherId: assigneeId,
      actualFreight: '3999.00',
      totalCost: '3888.00',
      plateNumber: '粤H16666',
      driverName: '搁置前司机',
      driverPhone: '13866660000',
      dispatchDate: new Date(),
      depositAmount: '200.00',
      depositStatus: 'paid',
      depositRefundable: true,
    }).where(eq(orders.id, created.id));

    const holdRequired = await expectFailure(() => trpcCall('order.updateStatus', { id: created.id, status: 'on_hold' }, adminToken), '不能为空');
    addResult(
      '等通知专区测试',
      '搁置强制备注',
      holdRequired.ok ? '通过' : '失败',
      `搁置无备注响应：${holdRequired.message}`,
      { orderId: created.id, error: holdRequired.message },
    );

    await trpcCall('order.updateStatus', { id: created.id, status: 'on_hold', holdReason: 'Group2 搁置备注校验' }, adminToken);
    const afterHold = await getOrderDb(created.id);
    const holdOk = afterHold?.status === 'on_hold' && afterHold?.preHoldStatus === 'dispatched' && afterHold?.preHoldAssignee === assigneeId && afterHold?.holdReason === 'Group2 搁置备注校验';
    addResult(
      '等通知专区测试',
      '搁置后保存前置状态与操作员',
      holdOk ? '通过' : '失败',
      `搁置后状态=${afterHold?.status ?? 'null'}，preHoldStatus=${afterHold?.preHoldStatus ?? 'null'}，preHoldAssignee=${afterHold?.preHoldAssignee ?? 'null'}`,
      { orderId: created.id, preHoldStatus: afterHold?.preHoldStatus ?? null, preHoldAssignee: afterHold?.preHoldAssignee ?? null },
    );

    const releaseRequired = await expectFailure(() => trpcCall('order.updateStatus', { id: created.id, status: 'dispatched' }, adminToken), '不能为空');
    addResult(
      '等通知专区测试',
      '释放强制备注',
      releaseRequired.ok ? '通过' : '失败',
      `释放无备注响应：${releaseRequired.message}`,
      { orderId: created.id, error: releaseRequired.message },
    );

    await trpcCall('order.updateStatus', { id: created.id, status: 'dispatched', releaseReason: 'Group2 释放备注校验' }, adminToken);
    const afterRelease = await getOrderDb(created.id);
    const releaseOk = afterRelease?.status === 'dispatched' && afterRelease?.assignedDispatcherId === assigneeId && afterRelease?.releaseReason === 'Group2 释放备注校验';
    addResult(
      '等通知专区测试',
      '释放后恢复正确操作员与状态',
      releaseOk ? '通过' : '失败',
      `释放后状态=${afterRelease?.status ?? 'null'}，assignedDispatcherId=${afterRelease?.assignedDispatcherId ?? 'null'}，releaseReason=${afterRelease?.releaseReason ?? 'null'}`,
      { orderId: created.id, assignedDispatcherId: afterRelease?.assignedDispatcherId ?? null, restoredStatus: afterRelease?.status ?? null },
    );
  } catch (err) {
    addResult('等通知专区测试', '搁置/释放主流程', '失败', errorText(err));
  }
}

async function runPermissionTests() {
  const cases = [
    {
      label: '管理员',
      username: 'admin',
      password: 'admin123',
      role: 'admin',
      positive: async (token) => {
        const created = await createOrder(token, 'G2-ROLE-ADMIN', { businessType: 'outsource' });
        return { success: true, detail: `管理员成功创建订单 ${created.id}` };
      },
      negative: async () => ({ success: true, detail: '管理员不执行负向限制用例（拥有全部权限）' }),
    },
    {
      label: '录单员',
      username: 'test_order_entry_01',
      password: 'Test@123456',
      role: 'order_entry',
      positive: async (token) => {
        const created = await createOrder(token, 'G2-ROLE-ENTRY', { businessType: 'outsource' });
        return { success: true, detail: `录单员成功创建订单 ${created.id}` };
      },
      negative: async (token) => {
        const created = await createOrder(token, 'G2-ROLE-ENTRY-RB', { businessType: 'outsource' });
        await db.update(orders).set({ status: 'pending_vehicle', actualFreight: '2000.00', totalCost: '1800.00' }).where(eq(orders.id, created.id));
        const failed = await expectFailure(() => trpcCall('order.revertStatus', { id: created.id, targetStatus: 'pending_assign', reason: '权限负测' }, token), 'FORBIDDEN');
        return { success: failed.ok, detail: failed.message };
      },
    },
    {
      label: '零担客服',
      username: 'test_ltl_cs_01',
      password: 'Test@123456',
      role: 'ltl_cs',
      positive: async (token) => {
        const created = await createOrder(token, 'G2-ROLE-LTLCS', { businessType: 'ltl' });
        const updated = await trpcCall('order.updateStatus', { id: created.id, status: 'pending_inquiry' }, token);
        return { success: updated?.success === true, detail: `零担客服将订单 ${created.id} 更新为 pending_inquiry` };
      },
      negative: async (token) => {
        const created = await createOrder(token, 'G2-ROLE-LTLCS-DEL', { businessType: 'ltl' });
        const failed = await expectFailure(() => trpcCall('order.delete', { id: created.id }, token), 'FORBIDDEN');
        return { success: failed.ok, detail: failed.message };
      },
    },
    {
      label: '外请调度员',
      username: 'test_outsource_dispatcher_01',
      password: 'Test@123456',
      role: 'outsource_dispatcher',
      positive: async (token) => {
        const adminLogin = await login('admin', 'admin123');
        const created = await createOrder(adminLogin.token, 'G2-ROLE-OUT', { businessType: 'outsource' });
        await db.update(orders).set({ status: 'pending_vehicle', actualFreight: '2600.00', totalCost: '2500.00', assignedDispatcherId: adminLogin.user.id }).where(eq(orders.id, created.id));
        const updated = await trpcCall('order.updateStatus', {
          id: created.id,
          status: 'dispatched',
          plateNumber: '粤J19999',
          driverName: '外请权限司机',
          driverPhone: '13777770000',
        }, token);
        return { success: updated?.success === true, detail: `外请调度员成功派车订单 ${created.id}` };
      },
      negative: async (token) => {
        const failed = await expectFailure(() => createOrder(token, 'G2-ROLE-OUT-NEG', { businessType: 'outsource' }), 'FORBIDDEN');
        return { success: failed.ok, detail: failed.message };
      },
    },
  ];

  for (const item of cases) {
    try {
      const session = await login(item.username, item.password);
      const me = await trpcQuery('auth.me', undefined, session.token);
      const actualPermissions = normalizePermissionSet(await getUserPermissions(item.role));
      const expectedPermissions = normalizePermissionSet(DEFAULT_ROLE_PERMISSIONS[item.role] || []);
      const permissionMatchesBaseline = JSON.stringify(actualPermissions) === JSON.stringify(expectedPermissions);
      const menus = (WORKSTATION_CONFIGS[item.role]?.menuItems || []).map((menu) => `${menu.label}(${menu.path})`);
      const positive = await item.positive(session.token);
      const negative = await item.negative(session.token);
      const ok = me?.role === item.role && permissionMatchesBaseline && positive.success && negative.success;
      addResult(
        '权限角色测试',
        `${item.label} 登录/菜单/操作`,
        ok ? '通过' : '失败',
        `登录角色=${me?.role ?? 'null'}；菜单=${menus.join('、') || '无'}；正向=${positive.detail}；反向=${negative.detail}`,
        {
          username: item.username,
          role: me?.role ?? null,
          menus,
          expectedPermissions,
          actualPermissions,
          permissionMatchesBaseline,
          positiveDetail: positive.detail,
          negativeDetail: negative.detail,
        },
      );
    } catch (err) {
      addResult('权限角色测试', `${item.label} 登录/菜单/操作`, '失败', errorText(err));
    }
  }
}

function buildSummaryRows() {
  const groups = Array.from(new Set(results.map((row) => row.category)));
  return groups.map((category) => {
    const subset = results.filter((row) => row.category === category);
    const passed = subset.filter((row) => row.status === '通过').length;
    const failed = subset.filter((row) => row.status === '失败').length;
    const warned = subset.filter((row) => row.status !== '通过' && row.status !== '失败').length;
    return { category, total: subset.length, passed, failed, warned };
  });
}

function buildMarkdown() {
  const summary = buildSummaryRows();
  const failedCases = results.filter((row) => row.status === '失败');
  const totalPassed = results.filter((row) => row.status === '通过').length;
  const totalFailed = failedCases.length;

  const lines = [];
  lines.push('# Group 2 测试报告');
  lines.push('');
  lines.push(`> 生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`);
  lines.push(`> 目标环境：${BASE_URL}`);
  lines.push(`> 执行方式：基于同一试用环境的接口自动化 + 数据库核验`);
  lines.push('');
  lines.push('## 一、测试范围与方法');
  lines.push('');
  lines.push('本次 Group 2 测试围绕 **退回测试、删除测试、合并订单测试、等通知专区测试、权限角色测试** 五类场景展开。测试以真实登录会话调用后端过程，并在关键场景中结合数据库记录进行副作用核验，以确认状态流转、关联清理、聚合汇总、备注校验、角色权限与菜单基线是否符合实现。');
  lines.push('');
  lines.push('| 场景 | 关注点 | 核验方式 |');
  lines.push('| --- | --- | --- |');
  lines.push('| 退回测试 | 多状态退回至 pending_assign、entryQueueReason、关键字段清理 | 真实过程调用 + 订单表核验 |');
  lines.push('| 删除测试 | 删除保护、审批/回单清理、零担批次保护 | 真实过程调用 + 关联表计数 |');
  lines.push('| 合并订单测试 | 重量与金额汇总、主子单状态与 parentId | 真实过程调用 + 主子单核验 |');
  lines.push('| 等通知专区测试 | 搁置强制备注、释放强制备注、恢复原状态与操作员 | 真实过程调用 + 订单字段核验 |');
  lines.push('| 权限角色测试 | 不同角色登录、菜单基线、正反向权限操作 | 真实登录 + 权限矩阵比对 + 关键过程调用 |');
  lines.push('');
  lines.push('## 二、总体结果概览');
  lines.push('');
  lines.push(`本轮共执行 **${results.length}** 个检查点，其中 **${totalPassed}** 个通过，**${totalFailed}** 个失败。`);
  lines.push('');
  lines.push('| 模块 | 检查点数 | 通过 | 失败 | 备注 |');
  lines.push('| --- | ---: | ---: | ---: | --- |');
  for (const row of summary) {
    lines.push(`| ${row.category} | ${row.total} | ${row.passed} | ${row.failed} | ${row.warned > 0 ? `${row.warned} 个告警` : '-'} |`);
  }
  lines.push('');
  lines.push('## 三、详细结果');
  lines.push('');
  for (const category of Array.from(new Set(results.map((row) => row.category)))) {
    lines.push(`### ${category}`);
    lines.push('');
    lines.push('| 检查点 | 结果 | 详情 |');
    lines.push('| --- | --- | --- |');
    for (const row of results.filter((item) => item.category === category)) {
      const safeDetail = String(row.detail || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
      lines.push(`| ${row.point} | ${row.status} | ${safeDetail} |`);
    }
    lines.push('');
  }

  lines.push('## 四、关键结论');
  lines.push('');
  if (failedCases.length === 0) {
    lines.push('本轮 Group 2 测试未发现失败项，覆盖范围内的关键流程表现符合预期。');
  } else {
    lines.push('本轮测试发现如下关键问题或与预期不一致点：');
    lines.push('');
    for (const row of failedCases) {
      lines.push(`1. **${row.category} / ${row.point}**：${row.detail}`);
    }
  }
  lines.push('');
  lines.push('## 五、说明与证据');
  lines.push('');
  lines.push('1. 权限角色测试中的“菜单”基线来源于当前代码中的角色工位映射；“操作”采用真实角色登录后直接调用关键过程进行正反向验证。');
  lines.push('2. 删除、退回、搁置/释放、合并场景均对数据库落库结果进行了二次核验，因此报告中的副作用结论不仅依赖接口返回。');
  if (runtimeNotes.length > 0) {
    lines.push('3. 运行备注如下：');
    lines.push('');
    for (const note of runtimeNotes) {
      lines.push(`   - ${note}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  let exitCode = 0;
  try {
    const adminSession = await login('admin', 'admin123');
    const me = await trpcQuery('auth.me', undefined, adminSession.token);
    runtimeNotes.push(`管理员登录成功：${JSON.stringify(me)}`);
    const assignee = await getUserByUsername('test_outsource_dispatcher_01');
    if (!assignee?.id) {
      throw new Error('未找到 test_outsource_dispatcher_01，无法执行等通知释放恢复操作员测试');
    }

    await runRollbackTests(adminSession.token);
    await runDeleteTests(adminSession.token, adminSession.user.id);
    await runMergeTests(adminSession.token);
    await runHoldTests(adminSession.token, assignee.id);
    await runPermissionTests();
  } catch (err) {
    exitCode = 1;
    const msg = errorText(err);
    runtimeNotes.push(`主流程异常：${msg}`);
    addResult('执行器', '主流程', '失败', msg);
  } finally {
    const markdown = buildMarkdown();
    await fs.writeFile(REPORT_PATH, markdown, 'utf8');
    await fs.writeFile(JSON_PATH, JSON.stringify({ startedAt: STARTED_AT, baseUrl: BASE_URL, results, runtimeNotes }, null, 2), 'utf8');
    await cleanupTrackedData();
    await pool.end();
  }

  process.exit(exitCode);
}

main();
