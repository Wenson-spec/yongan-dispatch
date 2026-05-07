import { SignJWT } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000/api/trpc/smartPaste.parse';
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

const encoder = new TextEncoder();
const now = Math.floor(Date.now() / 1000);
const token = await new SignJWT({
  openId: 'local_admin_bootstrap',
  appId: 'yongan-local',
  name: '管理员'
}).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuedAt(now).setExpirationTime(now + 365 * 24 * 60 * 60).sign(encoder.encode(JWT_SECRET));

async function callSmartPaste(text) {
  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ json: { text } })
  });
  const raw = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  return {
    status: response.status,
    raw,
    data: parsed?.result?.data?.json || null
  };
}

const tests = [
  {
    name: 'text1_single_order_price_and_address',
    text: `F0002284704   33473.73 KG，不打托 重庆永川仓-- 陕西省西安市莲湖区陕西省西安市莲湖区昆明路598号西安延腾置业有限公司自建房共有产权住房项目

4619.37`,
    evaluate(result) {
      const order = result?.data?.orders?.[0] || {};
      const findings = {
        status: result.status,
        orderCount: result?.data?.orders?.length || 0,
        orderNumber: order.orderNumber,
        weight: order.weight,
        warehouseName: order.warehouseName,
        originCity: order.originCity,
        destinationCity: order.destinationCity,
        deliveryAddress: order.deliveryAddress,
        receiverName: order.receiverName,
        remarks: order.remarks,
        shippingNote: order.shippingNote,
        customerPrice: order.customerPrice,
        isLargeSlab: order.isLargeSlab,
        businessType: order.businessType,
        cargoSpec: order.cargoSpec,
        parentRemarks: result?.data?.parentRemarks || ''
      };
      const ok = findings.status === 200
        && findings.orderCount === 1
        && findings.orderNumber === 'F0002284704'
        && String(findings.weight) === '33.474'
        && findings.warehouseName === '重庆永川仓'
        && findings.originCity === '永川'
        && findings.destinationCity === '西安'
        && findings.deliveryAddress === '陕西省西安市莲湖区昆明路598号西安延腾置业有限公司自建房共有产权住房项目'
        && findings.receiverName === ''
        && String(findings.remarks || '').includes('不打托')
        && findings.shippingNote === ''
        && String(findings.customerPrice) === '4619.37'
        && findings.isLargeSlab === false
        && findings.businessType === 'outsource'
        && findings.cargoSpec === '';
      return { ok, findings };
    }
  },
  {
    name: 'text3_merge_address_receiver_and_remarks',
    text: `F0002285006，6486KG 丰城大板仓···上海市松江区新浜镇林天路8号   杜彬彬
F0002285012，564KG 丰城大板仓···上海市松江区新浜镇林天路8号   杜彬彬	"已经打好托
2600*900=150箱，4个1100宽木架"
合并计划号P0000052353，

总价：2,830   共7.050吨`,
    evaluate(result) {
      const orders = Array.isArray(result?.data?.orders) ? result.data.orders : [];
      const findings = {
        status: result.status,
        orderCount: orders.length,
        orderNumbers: orders.map((order) => order.orderNumber),
        addresses: orders.map((order) => order.deliveryAddress),
        receivers: orders.map((order) => order.receiverName),
        remarks: orders.map((order) => order.remarks),
        shippingNotes: orders.map((order) => order.shippingNote),
        businessTypes: orders.map((order) => order.businessType),
        mergedPlanNumbers: orders.map((order) => order.mergedPlanNumber),
        cargoSpecs: orders.map((order) => order.cargoSpec),
        parentRemarks: result?.data?.parentRemarks || ''
      };
      const addressOk = findings.addresses.every((value) => value === '上海市松江区新浜镇林天路8号');
      const receiverOk = findings.receivers.every((value) => value === '杜彬彬');
      const remarksOk = findings.remarks.every((value) => String(value || '').includes('已经打好托') && String(value || '').includes('2600*900=150箱，4个1100宽木架'));
      const shippingNoteOk = findings.shippingNotes.every((value) => value === '');
      const ok = findings.status === 200
        && findings.orderCount === 2
        && findings.orderNumbers.includes('F0002285006')
        && findings.orderNumbers.includes('F0002285012')
        && addressOk
        && receiverOk
        && remarksOk
        && shippingNoteOk;
      return { ok, findings };
    }
  }
];

const report = [];
for (const test of tests) {
  try {
    const result = await callSmartPaste(test.text);
    const evaluated = test.evaluate(result);
    report.push({ name: test.name, ok: evaluated.ok, findings: evaluated.findings, rawData: result.data });
  } catch (error) {
    report.push({ name: test.name, ok: false, error: error?.message || String(error) });
  }
}

console.log(JSON.stringify(report, null, 2));
