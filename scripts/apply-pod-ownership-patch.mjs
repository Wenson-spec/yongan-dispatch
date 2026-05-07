import mysql from "mysql2/promise";

const POD_OWNERSHIP_SQL = "enum('current_order','delivery_outsource','none') NOT NULL DEFAULT 'current_order'";

async function hasColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function ensureColumn(connection, tableName) {
  const exists = await hasColumn(connection, tableName, "podOwnership");
  if (exists) {
    return { tableName, changed: false };
  }
  await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`podOwnership\` ${POD_OWNERSHIP_SQL}`);
  return { tableName, changed: true };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL 未配置");
  }

  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const results = [];
    results.push(await ensureColumn(connection, "orders"));
    results.push(await ensureColumn(connection, "pod_records"));
    console.log(JSON.stringify({ success: true, results }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
