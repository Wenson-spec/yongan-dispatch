import { drizzle } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing');
}

const db = drizzle(process.env.DATABASE_URL);

const queries = [
  {
    title: 'summary',
    statement: sql.raw(`SELECT COUNT(*) AS total_orders, MIN(orderDate) AS min_order_date, MAX(orderDate) AS max_order_date, MIN(createdAt) AS min_created_at, MAX(createdAt) AS max_created_at FROM orders`),
  },
  {
    title: 'order_months',
    statement: sql.raw(`SELECT DATE_FORMAT(orderDate, '%Y-%m') AS order_month, COUNT(*) AS order_count FROM orders WHERE orderDate IS NOT NULL GROUP BY DATE_FORMAT(orderDate, '%Y-%m') ORDER BY order_month DESC LIMIT 12`),
  },
  {
    title: 'created_months',
    statement: sql.raw(`SELECT DATE_FORMAT(createdAt, '%Y-%m') AS created_month, COUNT(*) AS created_count FROM orders WHERE createdAt IS NOT NULL GROUP BY DATE_FORMAT(createdAt, '%Y-%m') ORDER BY created_month DESC LIMIT 12`),
  },
];

for (const query of queries) {
  const result = await db.execute(query.statement);
  const rows = Array.isArray(result?.[0])
    ? result[0]
    : Array.isArray(result?.rows)
      ? result.rows
      : Array.isArray(result)
        ? result
        : result;

  console.log(`\n=== ${query.title} ===`);
  console.log(JSON.stringify(rows, null, 2));
}
