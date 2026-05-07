import { SignJWT } from 'jose';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000/api/trpc';
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

const client = createTRPCProxyClient({
  transformer: superjson,
  links: [
    httpBatchLink({
      url: BASE_URL,
      headers() {
        return {
          authorization: `Bearer ${token}`
        };
      }
    })
  ]
});

const tests = [
  {
    name: 'text1_single_order_price_and_address',
    text: `F0002284704   33473.73 KG，不打托 重庆永川仓-- 陕西省西安市莲湖区陕西省西安市莲湖区昆明路598号西安延腾置业有限公司自建房共有产权住房项目

4619.37`,
    assert(result) {
      const order = result?.orders?.[0] || {};
      const findings = {
        orderCount: result?.orders?.length || 0,
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
        parentRemarks: result?.parentRemarks || ''
      };
      const ok = findings.orderCount === 1
        && findings.orderNumber === 'F0002284704'
        && ['33.474', '33.47373', '33.4737'].includes(String(findings.weight))
        && findings.warehouseName === '重庆永川仓'
        && findings.originCity === '永川'
        && findings.destinationCity === '西安'
        && findings.deliveryAddress === '陕西省西安市莲湖区昆明路598号西安延腾置业有限公司自建房共有产权住房项目'
        && findings.receiverName === ''
        && String(findings.remarks || '').includes('不打托')
        && findings.shippingNote === ''
        && String(findings.customerPrice) === '4619.37'
        && findings.isLargeSlab === false
        && findings.businessType === 'outsource';
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
    assert(result) {
      const orders = Array.isArray(result?.orders) ? result.orders : [];
      const remarksOk = orders.every((order) => String(order.remarks || '').includes('已经打好托') && String(order.remarks || '').includes('2600*900=150箱，4个1100宽木架'));
      const addressOk = orders.every((order) => order.deliveryAddress === '上海市松江区新浜镇林天路8号');
      const receiverOk = orders.every((order) => order.receiverName === '杜彬彬');
      const shippingNoteOk = orders.every((order) => order.shippingNote === '');
      const businessTypeSet = Array.from(new Set(orders.map((order) => order.businessType)));
      const findings = {
        orderCount: orders.length,
        orderNumbers: orders.map((order) => order.orderNumber),
        addresses: orders.map((order) => order.deliveryAddress),
        receivers: orders.map((order) => order.receiverName),
        remarks: orders.map((order) => order.remarks),
        shippingNotes: orders.map((order) => order.shippingNote),
        businessTypes: businessTypeSet,
        mergedPlanNumbers: orders.map((order) => order.mergedPlanNumber),
        parentRemarks: result?.parentRemarks || ''
      };
      const ok = findings.orderCount === 2
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

const output = [];
for (const test of tests) {
  try {
    const result = await client.smartPaste.parse.mutate({ text: test.text });
    const evaluated = test.assert(result);
    output.push({
      name: test.name,
      ok: evaluated.ok,
      findings: evaluated.findings,
      rawResult: result
    });
  } catch (error) {
    output.push({
      name: test.name,
      ok: false,
      error: error?.message || String(error)
    });
  }
}

console.log(JSON.stringify(output, null, 2));
