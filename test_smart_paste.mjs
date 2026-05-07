// Test smart paste API with real data - using cookie auth
const BASE_URL = 'http://localhost:3000';

async function testSmartPaste() {
  // Step 1: Login and capture cookie
  const loginRes = await fetch(`${BASE_URL}/api/trpc/auth.login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      json: { username: 'admin', password: 'admin123' }
    }),
    redirect: 'manual'
  });
  
  const cookies = loginRes.headers.getSetCookie?.() || [];
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
  console.log('Cookie:', cookieStr ? '获取成功' : '无cookie');
  
  const loginData = await loginRes.json();
  console.log('登录:', loginData.result?.data?.json?.success ? '成功' : '失败');

  // Step 2: Call smart paste
  const testText = `F0002214041 ，30870.5398KG，江西丰城仓--南宁市三塘镇创新村那沙坡和邦仓储物流园\t"样板，要开订货会，加急安排，谢谢，注意最晚要在2号到货
同规格拼托，此流程1800*900 原托3托 1500*750 10托 800*800常规托:2托"
6791.52`;

  console.log('\n=== 输入文本 ===');
  console.log(testText);
  console.log('\n=== 调用智能粘贴API ===');

  const res = await fetch(`${BASE_URL}/api/trpc/smartPaste.parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieStr
    },
    body: JSON.stringify({
      json: { text: testText }
    })
  });

  const data = await res.json();
  
  if (data.error) {
    console.log('错误:', JSON.stringify(data.error, null, 2));
    return;
  }

  const result = data.result?.data?.json;
  if (result?.orders) {
    console.log(`\n=== 识别结果 (${result.orders.length} 条订单) ===`);
    for (const order of result.orders) {
      console.log('\n--- 订单 ---');
      console.log('订单号:', order.orderNumber);
      console.log('合并计划号:', order.mergedPlanNumber);
      console.log('客户:', order.customerName);
      console.log('货物:', order.cargoName);
      console.log('重量(kg):', order.weight);
      console.log('发货城市:', order.originCity);
      console.log('仓库:', order.warehouseName);
      console.log('目的城市:', order.destinationCity);
      console.log('详细地址:', order.deliveryAddress);
      console.log('客户报价:', order.customerPrice);
      console.log('大板:', order.isLargeSlab);
      console.log('加急:', order.isUrgent);
      console.log('加急原因:', order.urgentReason);
      console.log('发货备注:', order.shippingNote);
      console.log('置信度:', order.confidence);
      console.log('低置信字段:', order.lowConfidenceFields);
    }
  } else {
    console.log('结果:', JSON.stringify(result, null, 2));
  }
}

testSmartPaste().catch(err => console.error('错误:', err.message));
