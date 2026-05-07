import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import "dotenv/config";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Parse MySQL connection string
function parseConnectionString(url) {
  const urlObj = new URL(url);
  return {
    host: urlObj.hostname,
    port: parseInt(urlObj.port || "3306"),
    user: urlObj.username,
    password: urlObj.password,
    database: urlObj.pathname.slice(1),
  };
}

async function initAdmin() {
  const config = parseConnectionString(DATABASE_URL);
  const connection = await mysql.createConnection(config);

  try {
    // Check if admin user with username exists
    const [rows] = await connection.execute(
      "SELECT id, username FROM users WHERE username = 'admin' LIMIT 1"
    );

    if (rows && rows.length > 0) {
      console.log("Admin user already exists, updating password...");
      const hash = await bcrypt.hash("admin123", 10);
      await connection.execute(
        "UPDATE users SET passwordHash = ? WHERE username = 'admin'",
        [hash]
      );
      console.log("Admin password updated to: admin123");
    } else {
      // Check if there's an existing admin by role
      const [adminRows] = await connection.execute(
        "SELECT id, openId FROM users WHERE role = 'admin' LIMIT 1"
      );

      if (adminRows && adminRows.length > 0) {
        const adminUser = adminRows[0];
        const hash = await bcrypt.hash("admin123", 10);
        await connection.execute(
          "UPDATE users SET username = 'admin', passwordHash = ? WHERE id = ?",
          [hash, adminUser.id]
        );
        console.log(`Updated existing admin (id=${adminUser.id}) with username=admin, password=admin123`);
      } else {
        const hash = await bcrypt.hash("admin123", 10);
        const openId = `local_admin_${Date.now()}`;
        await connection.execute(
          "INSERT INTO users (openId, username, passwordHash, name, role, loginMethod) VALUES (?, ?, ?, ?, ?, ?)",
          [openId, "admin", hash, "管理员", "admin", "password"]
        );
        console.log("Created admin user: username=admin, password=admin123");
      }
    }
  } finally {
    await connection.end();
  }

  process.exit(0);
}

initAdmin().catch(err => {
  console.error("Failed to init admin:", err);
  process.exit(1);
});
