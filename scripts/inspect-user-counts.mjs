import mysql from 'mysql2/promise';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL 未配置');
  }

  const conn = await mysql.createConnection(url);
  try {
    const [totals] = await conn.query(`
      SELECT
        COUNT(*) AS total_users,
        SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) AS active_users,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admin_users
      FROM users
    `);

    const [roles] = await conn.query(`
      SELECT
        role,
        COUNT(*) AS total,
        SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) AS active
      FROM users
      GROUP BY role
      ORDER BY total DESC, role ASC
    `);

    const [recent] = await conn.query(`
      SELECT id, openId, username, name, role, isActive, createdAt, lastSignedIn
      FROM users
      ORDER BY id DESC
      LIMIT 20
    `);

    console.log(JSON.stringify({
      totals: totals[0],
      roles,
      recent,
    }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
