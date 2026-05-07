import mysql from 'mysql2/promise';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 未配置');

  const conn = await mysql.createConnection(url);
  try {
    const [totals] = await conn.query(`
      SELECT
        COUNT(*) AS totalUsers,
        SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) AS activeUsers,
        COUNT(DISTINCT openId) AS distinctOpenIds,
        COUNT(DISTINCT username) AS distinctUsernames,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS adminUsers
      FROM users
    `);

    const [roles] = await conn.query(`
      SELECT role, COUNT(*) AS total, SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) AS active
      FROM users
      GROUP BY role
      ORDER BY total DESC, role ASC
    `);

    const [duplicateOpenIds] = await conn.query(`
      SELECT openId, COUNT(*) AS cnt, MIN(id) AS oldestId, MAX(id) AS newestId
      FROM users
      GROUP BY openId
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC, newestId DESC
      LIMIT 20
    `);

    const [duplicateUsernames] = await conn.query(`
      SELECT username, COUNT(*) AS cnt, MIN(id) AS oldestId, MAX(id) AS newestId
      FROM users
      WHERE username IS NOT NULL AND username <> ''
      GROUP BY username
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC, newestId DESC
      LIMIT 20
    `);

    const [recentAdmins] = await conn.query(`
      SELECT id, openId, username, name, role, isActive, createdAt, lastSignedIn
      FROM users
      WHERE role = 'admin'
      ORDER BY id DESC
      LIMIT 20
    `);

    const [indexes] = await conn.query(`SHOW INDEX FROM users`);

    console.log(JSON.stringify({
      totals: totals[0],
      roles,
      duplicateOpenIds,
      duplicateUsernames,
      recentAdmins,
      indexes,
    }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
