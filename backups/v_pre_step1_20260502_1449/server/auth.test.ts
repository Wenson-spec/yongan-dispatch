import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

// Mock database
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getUserByUsername: vi.fn(),
    createUserWithPassword: vi.fn(),
    updateUserPassword: vi.fn(),
    getUserById: vi.fn(),
    upsertUser: vi.fn(),
  };
});

// Mock SDK
vi.mock("./_core/sdk", () => ({
  sdk: {
    createSessionToken: vi.fn(async (openId: string) => `token_${openId}`),
  },
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-admin",
    email: "admin@test.com",
    name: "Test Admin",
    username: "admin",
    loginMethod: "password",
    role: "admin",
    phone: null,
    region: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: vi.fn(),
    } as TrpcContext["res"],
  };
}

function createAnonymousContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: vi.fn(),
    } as TrpcContext["res"],
  };
}

describe("Auth Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("login", () => {
    it("should login with correct credentials", async () => {
      const hashedPassword = await bcrypt.hash("password123", 10);
      const mockUser = {
        id: 1,
        openId: "test_user",
        username: "testuser",
        passwordHash: hashedPassword,
        name: "Test User",
        role: "admin",
        isActive: true,
        email: null,
        phone: null,
        region: null,
        loginMethod: "password",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };

      vi.mocked(db.getUserByUsername).mockResolvedValue(mockUser as any);
      vi.mocked(db.upsertUser).mockResolvedValue(undefined);

      const caller = appRouter.createCaller(createAnonymousContext());
      const result = await caller.auth.login({
        username: "testuser",
        password: "password123",
      });

      expect(result.success).toBe(true);
      expect(result.user.id).toBe(1);
      expect(result.user.username).toBe("testuser");
    });

    it("should reject with wrong password", async () => {
      const hashedPassword = await bcrypt.hash("password123", 10);
      const mockUser = {
        id: 1,
        openId: "test_user",
        username: "testuser",
        passwordHash: hashedPassword,
        name: "Test User",
        role: "admin",
        isActive: true,
        email: null,
        phone: null,
        region: null,
        loginMethod: "password",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };

      vi.mocked(db.getUserByUsername).mockResolvedValue(mockUser as any);

      const caller = appRouter.createCaller(createAnonymousContext());
      await expect(
        caller.auth.login({
          username: "testuser",
          password: "wrongpassword",
        })
      ).rejects.toThrow("用户名或密码错误");
    });

    it("should reject with non-existent user", async () => {
      vi.mocked(db.getUserByUsername).mockResolvedValue(undefined);

      const caller = appRouter.createCaller(createAnonymousContext());
      await expect(
        caller.auth.login({
          username: "nonexistent",
          password: "password123",
        })
      ).rejects.toThrow("用户名或密码错误");
    });

    it("should reject with inactive user", async () => {
      const hashedPassword = await bcrypt.hash("password123", 10);
      const mockUser = {
        id: 1,
        openId: "test_user",
        username: "testuser",
        passwordHash: hashedPassword,
        name: "Test User",
        role: "admin",
        isActive: false,
        email: null,
        phone: null,
        region: null,
        loginMethod: "password",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };

      vi.mocked(db.getUserByUsername).mockResolvedValue(mockUser as any);

      const caller = appRouter.createCaller(createAnonymousContext());
      await expect(
        caller.auth.login({
          username: "testuser",
          password: "password123",
        })
      ).rejects.toThrow("账号已被禁用");
    });
  });

  describe("createUser", () => {
    it("should create user with valid data", async () => {
      vi.mocked(db.getUserByUsername).mockResolvedValue(undefined);
      vi.mocked(db.createUserWithPassword).mockResolvedValue(2);

      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.auth.createUser({
        username: "newuser",
        password: "password123",
        name: "New User",
        role: "order_entry",
        phone: "13800138000",
        region: "广东省",
      });

      expect(result.id).toBe(2);
    });

    it("should reject duplicate username", async () => {
      const mockUser = {
        id: 1,
        username: "existinguser",
      };

      vi.mocked(db.getUserByUsername).mockResolvedValue(mockUser as any);

      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        caller.auth.createUser({
          username: "existinguser",
          password: "password123",
          name: "User",
          role: "order_entry",
        })
      ).rejects.toThrow("用户名已存在");
    });

    it("should reject if not admin", async () => {
      const nonAdminContext: TrpcContext = {
        user: {
          id: 2,
          openId: "test-user",
          email: "user@test.com",
          name: "Test User",
          username: "user",
          loginMethod: "password",
          role: "order_entry",
          phone: null,
          region: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        },
        req: {
          protocol: "https",
          headers: {},
        } as TrpcContext["req"],
        res: {
          clearCookie: () => {},
          cookie: vi.fn(),
        } as TrpcContext["res"],
      };

      const caller = appRouter.createCaller(nonAdminContext);
      await expect(
        caller.auth.createUser({
          username: "newuser",
          password: "password123",
          name: "User",
          role: "order_entry",
        })
      ).rejects.toThrow();
    });
  });

  describe("resetPassword", () => {
    it("should reset password for existing user", async () => {
      const mockUser = {
        id: 2,
        username: "testuser",
        passwordHash: "oldhash",
      };

      vi.mocked(db.getUserById).mockResolvedValue(mockUser as any);
      vi.mocked(db.updateUserPassword).mockResolvedValue(undefined);

      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.auth.resetPassword({
        userId: 2,
        newPassword: "newpassword123",
      });

      expect(result.success).toBe(true);
    });

    it("should reject if user not found", async () => {
      vi.mocked(db.getUserById).mockResolvedValue(undefined);

      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        caller.auth.resetPassword({
          userId: 999,
          newPassword: "newpassword123",
        })
      ).rejects.toThrow("用户不存在");
    });
  });

  describe("changePassword", () => {
    it("should change password with correct old password", async () => {
      const oldPassword = "oldpassword123";
      const hashedPassword = await bcrypt.hash(oldPassword, 10);
      const mockUser = {
        id: 1,
        openId: "test_user",
        username: "testuser",
        passwordHash: hashedPassword,
        name: "Test User",
        role: "admin",
        isActive: true,
        email: null,
        phone: null,
        region: null,
        loginMethod: "password",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };

      vi.mocked(db.getUserById).mockResolvedValue(mockUser as any);
      vi.mocked(db.updateUserPassword).mockResolvedValue(undefined);

      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.auth.changePassword({
        oldPassword,
        newPassword: "newpassword123",
      });

      expect(result.success).toBe(true);
    });

    it("should reject with wrong old password", async () => {
      const oldPassword = "oldpassword123";
      const hashedPassword = await bcrypt.hash(oldPassword, 10);
      const mockUser = {
        id: 1,
        openId: "test_user",
        username: "testuser",
        passwordHash: hashedPassword,
        name: "Test User",
        role: "admin",
        isActive: true,
        email: null,
        phone: null,
        region: null,
        loginMethod: "password",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };

      vi.mocked(db.getUserById).mockResolvedValue(mockUser as any);

      const caller = appRouter.createCaller(createAdminContext());
      await expect(
        caller.auth.changePassword({
          oldPassword: "wrongpassword",
          newPassword: "newpassword123",
        })
      ).rejects.toThrow("旧密码错误");
    });
  });
});
