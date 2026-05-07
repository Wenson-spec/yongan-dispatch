import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const connection = await mysql.createConnection(databaseUrl);

try {
  const [rows] = await connection.execute(`
    SELECT
      DATE_FORMAT(orderDate, '%Y-%m') AS ym,
      COUNT(*) AS cnt,
      MIN(orderDate) AS minOrderDate,
      MAX(orderDate) AS maxOrderDate
    FROM orders
    WHERE orderDate IS NOT NULL
    GROUP BY DATE_FORMAT(orderDate, '%Y-%m')
    ORDER BY ym DESC
    LIMIT 24
  `);

  const [latestRows] = await connection.execute(`
    SELECT
      id,
      orderNumber,
      systemCode,
      status,
      businessType,
      orderDate,
      createdAt
    FROM orders
    ORDER BY COALESCE(orderDate, createdAt) DESC
    LIMIT 10
  `);

  console.log(JSON.stringify({
    monthBuckets: rows,
    latestOrders: latestRows,
  }, null, 2));
} finally {
  await connection.end();
}
