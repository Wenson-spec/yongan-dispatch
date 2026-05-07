import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const TEST_PASSWORD = 'Test@123456';
const NON_ADMIN_ROLES = [
  'order_entry',
  'ltl_cs',
  'chain_cs',
  'ltl_dispatcher',
  'outsource_dispatcher',
  'fleet_dispatcher',
  'field_manager',
  'cs_manager',
  'finance_assistant',
];

const ROLE_LABELS = {
  order_entry: '录单员',
  ltl_cs: '零担客服',
  chain_cs: '链路客服',
  ltl_dispatcher: '零担调度',
  outsource_dispatcher: '外请调度',
  fleet_dispatcher: '车队调度',
  field_manager: '现场管理员',
  cs_manager: '客服主管',
  finance_assistant: '财务助理',
};

const USER_REF_COLUMNS = [
  ['orders', 'assignedDispatcherId'],
  ['orders', 'receivingConfirmedBy'],
  ['orders', 'createdBy'],
  ['approvals', 'applicantId'],
  ['approvals', 'approverId'],
  ['operation_logs', 'userId'],
  ['dispatcher_regions', 'dispatcherId'],
  ['pod_records', 'ocrVerifiedBy'],
  ['pod_records', 'originalReceivedBy'],
  ['ltl_inquiries', 'inquiredBy'],
  ['role_permissions', 'updatedBy'],
  ['system_config', 'updated_by_id'],
];

async function tableColumnExists(conn, dbName, table, column) {
  const [rows] = await conn.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ? AND column_name = ?
      LIMIT 1
    `,
    [dbName, table, column]
  );
  return rows.length > 0;
}

async function indexExists(conn, table, keyName) {
  const [rows] = await conn.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [keyName]);
  return rows.length > 0;
}

function buildInClause(values) {
  return values.map(() => '?').join(', ');
}

async function mergeDuplicateOpenIds(conn, dbName) {
  const [duplicateGroups] = await conn.query(`
    SELECT openId, COUNT(*) AS cnt
    FROM users
    WHERE openId IS NOT NULL AND openId <> ''
    GROUP BY openId
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC, MIN(id) ASC
  `);

  const mergeSummary = [];

  for (const group of duplicateGroups) {
    const openId = group.openId;
    const [rows] = await conn.query(
      `
        SELECT id, openId, username, name, role, isActive, createdAt, lastSignedIn
        FROM users
        WHERE openId = ?
        ORDER BY
          CASE WHEN username IS NOT NULL AND username <> '' THEN 0 ELSE 1 END,
          CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
          isActive DESC,
          id ASC
      `,
      [openId]
    );

    if (!rows.length) continue;

    const keep = rows[0];
    const duplicateIds = rows.slice(1).map((row) => row.id);
    if (duplicateIds.length === 0) continue;

    for (const [table, column] of USER_REF_COLUMNS) {
      const exists = await tableColumnExists(conn, dbName, table, column);
      if (!exists) continue;
      await conn.query(
        `UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${column}\` IN (${buildInClause(duplicateIds)})`,
        [keep.id, ...duplicateIds]
      );
    }

    await conn.query(
      `
        UPDATE users
        SET role = CASE WHEN id = ? AND role = 'admin' THEN 'admin' ELSE role END,
            isActive = CASE WHEN id = ? THEN 1 ELSE isActive END
        WHERE id = ?
      `,
      [keep.id, keep.id, keep.id]
    );

    await conn.query(
      `DELETE FROM users WHERE id IN (${buildInClause(duplicateIds)})`,
      duplicateIds
    );

    mergeSummary.push({
      openId,
      keepId: keep.id,
      deletedCount: duplicateIds.length,
    });
  }

  return mergeSummary;
}

async function ensureUniqueIndexes(conn) {
  const actions = [];
  if (!(await indexExists(conn, 'users', 'users_openId_unique'))) {
    await conn.query('ALTER TABLE `users` ADD UNIQUE INDEX `users_openId_unique` (`openId`)');
    actions.push('added users_openId_unique');
  }
  if (!(await indexExists(conn, 'users', 'users_username_unique'))) {
    await conn.query('ALTER TABLE `users` ADD UNIQUE INDEX `users_username_unique` (`username`)');
    actions.push('added users_username_unique');
  }
  return actions;
}

async function ensureSingleAdmin(conn) {
  const [admins] = await conn.query(`
    SELECT id, openId, username, name, role, isActive, createdAt, lastSignedIn
    FROM users
    WHERE role = 'admin'
    ORDER BY id ASC
  `);
  if (!admins.length) {
    throw new Error('清理后没有管理员账号，已中止');
  }

  const keep = admins[0];
  const extraAdminIds = admins.slice(1).map((row) => row.id);
  if (extraAdminIds.length > 0) {
    await conn.query(
      `DELETE FROM users WHERE id IN (${buildInClause(extraAdminIds)})`,
      extraAdminIds
    );
  }

  await conn.query(
    `UPDATE users SET isActive = 1, role = 'admin', name = COALESCE(name, ?) WHERE id = ?`,
    [process.env.OWNER_NAME || '管理员', keep.id]
  );

  return { keepId: keep.id, deletedExtraAdmins: extraAdminIds.length };
}

async function pruneAndSeedRoleUsers(conn) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const summary = [];

  for (const role of NON_ADMIN_ROLES) {
    const [existing] = await conn.query(
      `
        SELECT id, username, name, isActive
        FROM users
        WHERE role = ?
        ORDER BY isActive DESC, id ASC
      `,
      [role]
    );

    const keep = existing.slice(0, 2);
    const remove = existing.slice(2);

    if (remove.length > 0) {
      await conn.query(
        `DELETE FROM users WHERE id IN (${buildInClause(remove.map((row) => row.id))})`,
        remove.map((row) => row.id)
      );
    }

    for (const row of keep) {
      if (!row.isActive) {
        await conn.query('UPDATE users SET isActive = 1 WHERE id = ?', [row.id]);
      }
    }

    let currentCount = keep.length;
    while (currentCount < 2) {
      const index = currentCount + 1;
      const username = `test_${role}_${String(index).padStart(2, '0')}`;
      const displayName = `${ROLE_LABELS[role]}测试${index}`;
      const openId = `local_${username}`;

      await conn.query(
        `
          INSERT INTO users (openId, username, passwordHash, name, role, phone, region, loginMethod, isActive, createdAt, updatedAt, lastSignedIn)
          VALUES (?, ?, ?, ?, ?, NULL, NULL, 'password', 1, NOW(), NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            passwordHash = VALUES(passwordHash),
            name = VALUES(name),
            role = VALUES(role),
            loginMethod = 'password',
            isActive = 1,
            updatedAt = NOW()
        `,
        [openId, username, passwordHash, displayName, role]
      );

      currentCount += 1;
    }

    summary.push({
      role,
      keptExisting: keep.length,
      deletedExtras: remove.length,
      finalCount: 2,
      usernames: [
        `test_${role}_01`,
        `test_${role}_02`,
      ],
    });
  }

  return summary;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 未配置');

  const conn = await mysql.createConnection(url);
  try {
    const [dbRows] = await conn.query('SELECT DATABASE() AS dbName');
    const dbName = dbRows[0].dbName;

    await conn.beginTransaction();

    const mergeSummary = await mergeDuplicateOpenIds(conn, dbName);
    const adminSummary = await ensureSingleAdmin(conn);
    const indexActions = await ensureUniqueIndexes(conn);
    const roleSummary = await pruneAndSeedRoleUsers(conn);

    const [totals] = await conn.query(`
      SELECT role, COUNT(*) AS total
      FROM users
      GROUP BY role
      ORDER BY role ASC
    `);

    await conn.commit();

    console.log(JSON.stringify({
      success: true,
      testPassword: TEST_PASSWORD,
      mergeSummary,
      adminSummary,
      indexActions,
      roleSummary,
      totals,
    }, null, 2));
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
