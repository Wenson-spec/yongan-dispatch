import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';
import { getDb, getUserByOpenId, upsertUser } from './db';
import { users } from '../drizzle/schema';

const TEST_OPEN_ID = `vitest_dedupe_${Date.now()}`;

async function cleanupTestUser() {
  const db = await getDb();
  if (!db) throw new Error('数据库不可用');
  await db.delete(users).where(eq(users.openId, TEST_OPEN_ID));
}

function createAnonymousContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: 'https',
      headers: {},
    } as TrpcContext['req'],
    res: {
      clearCookie: () => {},
      cookie: vi.fn(),
    } as TrpcContext['res'],
  };
}

describe('用户去重与测试账号登录', () => {
  beforeAll(async () => {
    await cleanupTestUser();
  });

  afterAll(async () => {
    await cleanupTestUser();
  });

  it('同一 openId 重复写入时只保留一条账号记录', async () => {
    await upsertUser({
      openId: TEST_OPEN_ID,
      name: '第一次写入',
      role: 'ltl_cs',
      loginMethod: 'oauth',
      lastSignedIn: new Date('2026-04-04T06:00:00.000Z'),
    });

    await upsertUser({
      openId: TEST_OPEN_ID,
      email: 'dedupe@test.local',
      lastSignedIn: new Date('2026-04-04T06:05:00.000Z'),
    });

    const db = await getDb();
    if (!db) throw new Error('数据库不可用');

    const rows = await db.select().from(users).where(eq(users.openId, TEST_OPEN_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe('dedupe@test.local');

    const existing = await getUserByOpenId(TEST_OPEN_ID);
    expect(existing?.role).toBe('ltl_cs');
  });

  it('保留的测试账号可以正常使用用户名密码登录', async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    const result = await caller.auth.login({
      username: 'test_order_entry_01',
      password: 'Test@123456',
    });

    expect(result.success).toBe(true);
    expect(result.user.username).toBe('test_order_entry_01');
    expect(result.user.role).toBe('order_entry');
  });
});
