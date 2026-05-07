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

const body = {
  json: {
    text: `F0002284704   33473.73 KG，不打托 重庆永川仓-- 陕西省西安市莲湖区陕西省西安市莲湖区昆明路598号西安延腾置业有限公司自建房共有产权住房项目\n\n4619.37`
  }
};

const response = await fetch(BASE_URL, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`
  },
  body: JSON.stringify(body)
});

const text = await response.text();
console.log(JSON.stringify({ status: response.status, statusText: response.statusText, headers: Object.fromEntries(response.headers.entries()), body: text }, null, 2));
