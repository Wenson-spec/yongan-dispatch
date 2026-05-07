import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("缺少 DATABASE_URL，无法执行回单状态校准。");
  process.exit(1);
}

const DISPLAY_ONLY_STATUSES = new Set(["uploaded", "verified", "none", null]);

function deriveExpectedOrderSnapshot(row) {
  const currentPodStatus = row.orderPodStatus ?? "none";
  const currentOrderStatus = row.orderStatus ?? null;
  const currentSignedDate = row.orderSignedDate ?? null;
  const podOriginalStatus = row.podOriginalStatus ?? null;

  let expectedPodStatus = currentPodStatus;
  let expectedPodSentDate = row.orderPodSentDate ?? null;
  let expectedPodDate = row.orderPodDate ?? null;
  let expectedOrderStatus = currentOrderStatus;
  let expectedSignedDate = currentSignedDate;

  if (podOriginalStatus === "received") {
    expectedPodStatus = "original_received";
    expectedPodSentDate = row.podOriginalSentAt ?? row.orderPodSentDate ?? null;
    expectedPodDate = row.podOriginalReceivedAt ?? row.orderPodDate ?? row.podUpdatedAt ?? null;

    if (currentOrderStatus === "delivered") {
      expectedOrderStatus = "signed";
      expectedSignedDate = row.podOriginalReceivedAt ?? row.orderPodDate ?? row.podUpdatedAt ?? currentSignedDate;
    }
  } else if (podOriginalStatus === "sent") {
    expectedPodStatus = "original_sent";
    expectedPodSentDate = row.podOriginalSentAt ?? row.orderPodSentDate ?? row.podUpdatedAt ?? null;
    expectedPodDate = null;

    if (currentOrderStatus === "signed" && currentPodStatus === "original_received") {
      expectedOrderStatus = "delivered";
      expectedSignedDate = null;
    }
  } else if (podOriginalStatus === "pending" || podOriginalStatus === "lost") {
    expectedPodStatus = DISPLAY_ONLY_STATUSES.has(currentPodStatus) ? (currentPodStatus ?? "none") : "none";
    expectedPodSentDate = null;
    expectedPodDate = null;

    if (currentOrderStatus === "signed" && currentPodStatus === "original_received") {
      expectedOrderStatus = "delivered";
      expectedSignedDate = null;
    }
  }

  return {
    expectedPodStatus,
    expectedPodSentDate,
    expectedPodDate,
    expectedOrderStatus,
    expectedSignedDate,
  };
}

function isSameTime(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

function buildDiff(row, expected) {
  const diff = {};

  if ((row.orderPodStatus ?? "none") !== expected.expectedPodStatus) {
    diff.podStatus = {
      from: row.orderPodStatus ?? "none",
      to: expected.expectedPodStatus,
    };
  }

  if (!isSameTime(row.orderPodSentDate, expected.expectedPodSentDate)) {
    diff.podSentDate = {
      from: row.orderPodSentDate,
      to: expected.expectedPodSentDate,
    };
  }

  if (!isSameTime(row.orderPodDate, expected.expectedPodDate)) {
    diff.podDate = {
      from: row.orderPodDate,
      to: expected.expectedPodDate,
    };
  }

  if ((row.orderStatus ?? null) !== expected.expectedOrderStatus) {
    diff.orderStatus = {
      from: row.orderStatus ?? null,
      to: expected.expectedOrderStatus,
    };
  }

  if (!isSameTime(row.orderSignedDate, expected.expectedSignedDate)) {
    diff.signedDate = {
      from: row.orderSignedDate,
      to: expected.expectedSignedDate,
    };
  }

  return diff;
}

function formatTime(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

const connection = await mysql.createConnection(DATABASE_URL);

try {
  const [rows] = await connection.query(`
    SELECT
      o.id,
      o.orderNumber,
      o.businessType,
      o.status AS orderStatus,
      o.podStatus AS orderPodStatus,
      o.podSentDate AS orderPodSentDate,
      o.podDate AS orderPodDate,
      o.signedDate AS orderSignedDate,
      o.podOwnership AS orderPodOwnership,
      p.id AS podRecordId,
      p.originalStatus AS podOriginalStatus,
      p.originalSentAt AS podOriginalSentAt,
      p.originalReceivedAt AS podOriginalReceivedAt,
      p.updatedAt AS podUpdatedAt,
      p.podOwnership AS podRecordOwnership
    FROM orders o
    LEFT JOIN pod_records p ON p.orderId = o.id
    WHERE (
      o.businessType = 'outsource'
      OR o.podStatus IN ('original_sent', 'original_received')
      OR p.id IS NOT NULL
    )
    ORDER BY o.id ASC
  `);

  const candidates = [];
  const missingPodRecordRows = [];

  for (const row of rows) {
    if (!row.podRecordId) {
      if (["original_sent", "original_received"].includes(row.orderPodStatus)) {
        missingPodRecordRows.push({
          orderId: row.id,
          orderNumber: row.orderNumber,
          orderPodStatus: row.orderPodStatus,
        });
      }
      continue;
    }

    const expected = deriveExpectedOrderSnapshot(row);
    const diff = buildDiff(row, expected);

    if (Object.keys(diff).length > 0) {
      candidates.push({ row, expected, diff });
    }
  }

  const summary = {
    scannedRows: rows.length,
    fixableMismatches: candidates.length,
    missingPodRecordRows: missingPodRecordRows.length,
    applyMode: APPLY,
  };

  console.log("=== 外请回单统一状态源历史校准 ===");
  console.log(JSON.stringify(summary, null, 2));

  if (missingPodRecordRows.length > 0) {
    console.log("\n--- 缺少 pod_records 但订单仍显示原件状态的订单（需人工复核） ---");
    for (const row of missingPodRecordRows.slice(0, 20)) {
      console.log(`${row.orderId}\t${row.orderNumber}\t${row.orderPodStatus}`);
    }
    if (missingPodRecordRows.length > 20) {
      console.log(`... 其余 ${missingPodRecordRows.length - 20} 条未展开`);
    }
  }

  if (candidates.length > 0) {
    console.log("\n--- 可校准样例（最多展示前 20 条） ---");
    for (const item of candidates.slice(0, 20)) {
      console.log(JSON.stringify({
        orderId: item.row.id,
        orderNumber: item.row.orderNumber,
        podRecordId: item.row.podRecordId,
        podOriginalStatus: item.row.podOriginalStatus,
        diff: item.diff,
      }, null, 2));
    }
  }

  if (!APPLY) {
    console.log("\n当前为 dry-run，仅输出诊断结果。若确认执行，请使用: node pod_status_reconcile.mjs --apply");
    process.exit(0);
  }

  await connection.beginTransaction();

  for (const item of candidates) {
    await connection.query(
      `
        UPDATE orders
        SET podStatus = ?, podSentDate = ?, podDate = ?, status = ?, signedDate = ?
        WHERE id = ?
      `,
      [
        item.expected.expectedPodStatus,
        formatTime(item.expected.expectedPodSentDate),
        formatTime(item.expected.expectedPodDate),
        item.expected.expectedOrderStatus,
        formatTime(item.expected.expectedSignedDate),
        item.row.id,
      ],
    );
  }

  await connection.commit();

  console.log(`\n已完成校准，共更新 ${candidates.length} 条订单展示记录。`);
} catch (error) {
  try {
    await connection.rollback();
  } catch {
    // noop
  }
  console.error("回单状态校准失败：", error);
  process.exit(1);
} finally {
  await connection.end();
}
