import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { resolveBackupFilePath } from "../backupService";
import { getUserByOpenId } from "../db";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { sdk as sdkInstance } from "./sdk";
import path from "path";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Direct Express login route (bypasses tRPC for better Safari cookie compatibility)
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "请输入用户名和密码" });
      }

      const dbModule = await import("../db");
      const user = await dbModule.getUserByUsername(username);
      if (!user || !user.isActive || !user.passwordHash) {
        return res.status(401).json({ error: "用户名或密码错误" });
      }

      const bcrypt = await import("bcryptjs");
      const isValid = await bcrypt.default.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "用户名或密码错误" });
      }

      // Ensure user has openId
      let openId = user.openId;
      if (!openId) {
        openId = `local_${user.id}_${Date.now()}`;
        await dbModule.updateUserOpenId(user.id, openId);
      }

      const { sdk: sdkInstance } = await import("./sdk");
      const { COOKIE_NAME, ONE_YEAR_MS } = await import("@shared/const");
      const { getSessionCookieOptions } = await import("./cookies");

      const sessionToken = await sdkInstance.createSessionToken(openId, {
        name: user.name || user.username || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Update last signed in
      await dbModule.upsertUser({ openId, lastSignedIn: new Date() });

      return res.json({
        success: true,
        token: sessionToken,
        user: { id: user.id, name: user.name, role: user.role, username: user.username },
      });
    } catch (err: any) {
      console.error("[Login] Error:", err);
      return res.status(500).json({ error: "登录失败，请稍后重试" });
    }
  });

  // 获取当前session token（供前端存入localStorage）
  app.get("/api/auth/session-token", async (req, res) => {
    try {
      const { COOKIE_NAME } = await import("@shared/const");
      const { parse: parseCookieHeader } = await import("cookie");
      const cookies = parseCookieHeader(req.headers.cookie || "");
      const token = cookies[COOKIE_NAME];
      if (!token) {
        return res.status(401).json({ error: "No session" });
      }
      // Verify the token is valid
      const { sdk: sdkInstance } = await import("./sdk");
      const session = await sdkInstance.verifySession(token);
      if (!session) {
        return res.status(401).json({ error: "Invalid session" });
      }
      return res.json({ token });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to get session token" });
    }
  });

  app.get("/api/backup/download/:fileName", async (req, res) => {
    try {
      const cookies = parseCookieHeader(req.headers.cookie || "");
      const token = cookies[COOKIE_NAME];
      if (!token) {
        return res.status(401).json({ error: "未登录" });
      }

      const session = await sdkInstance.verifySession(token);
      if (!session?.openId) {
        return res.status(401).json({ error: "登录状态已失效" });
      }

      const user = await getUserByOpenId(session.openId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "仅管理员可下载备份文件" });
      }

      const fullPath = await resolveBackupFilePath(req.params.fileName);
      return res.download(fullPath, path.basename(fullPath));
    } catch (error) {
      return res.status(404).json({ error: `备份文件不可用：${(error as Error).message}` });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);

    // 启动超期回单自动通知定时任务
    import("../podOverdueChecker").then(({ startPodOverdueChecker }) => {
      startPodOverdueChecker();
    }).catch(err => {
      console.warn("[PodOverdueChecker] 启动失败:", err);
    });

    // 启动调度员积压预警定时任务
    import("../dispatcherBacklogChecker").then(({ startBacklogChecker }) => {
      startBacklogChecker();
    }).catch(err => {
      console.warn("[BacklogChecker] 启动失败:", err);
    });
  });
}

startServer().catch(console.error);
