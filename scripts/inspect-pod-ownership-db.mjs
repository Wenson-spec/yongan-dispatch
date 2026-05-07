import mysql from "mysql2/promise";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL 未配置");
  }

  const connection = await mysql.createConnection(databaseUrl);
  try {
    const [ordersColumns] = await connection.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'orders'
      ORDER BY ORDINAL_POSITION
    `);

    const [podColumns] = await connection.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'pod_records'
      ORDER BY ORDINAL_POSITION
    `);

    let migrationTables = [];
    const [tableRows] = await connection.query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('__drizzle_migrations', '__drizzle_migrations__', 'drizzle_migrations')
    `);
    migrationTables = tableRows;

    const result = {
      ordersHasPodOwnership: ordersColumns.some((col) => col.COLUMN_NAME === 'podOwnership'),
      podRecordsHasPodOwnership: podColumns.some((col) => col.COLUMN_NAME === 'podOwnership'),
      ordersColumns,
      podColumns,
      migrationTables,
      migrationRows: {},
    };

    for (const row of migrationTables) {
      const tableName = row.TABLE_NAME;
      const [migrationRows] = await connection.query(`SELECT * FROM \`${tableName}\` ORDER BY 1 DESC LIMIT 20`);
      result.migrationRows[tableName] = migrationRows;
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
