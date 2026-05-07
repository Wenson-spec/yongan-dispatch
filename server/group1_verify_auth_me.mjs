import { SignJWT } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'yongan-local-dev-secret-2026';
const APP_ID = process.env.VITE_APP_ID || 'yongan-local';
const users = [
  { openId: 'local_admin_1775970056413', name: '管理员' },
  { openId: 'local_test_outsource_dispatcher_01', name: '外请调度测试1' },
  { openId: 'local_test_fleet_dispatcher_01', name: '车队调度测试1' },
  { openId: 'local_test_ltl_cs_01', name: '零担客服测试1' },
];
const ports = [3000, 3001];

async function sign(user) {
  const key = new TextEncoder().encode(JWT_SECRET);
  return new SignJWT({ openId: user.openId, appId: APP_ID, name: user.name })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setExpirationTime(Math.floor((Date.now() + 3600_000) / 1000))
    .sign(key);
}

async function query(baseUrl, procedure, input, token) {
  const encodedInput = encodeURIComponent(JSON.stringify({ json: input }));
  const url = `${baseUrl}/api/trpc/${procedure}?input=${encodedInput}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  return { status: res.status, text };
}

for (const user of users) {
  const token = await sign(user);
  for (const port of ports) {
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
      const result = await query(baseUrl, 'auth.me', null, token);
      console.log(JSON.stringify({ baseUrl, user, result }, null, 2));
    } catch (error) {
      console.log(JSON.stringify({ baseUrl, user, error: String(error) }, null, 2));
    }
  }
}
