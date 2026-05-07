import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import * as db from "../db";

const SALT_ROUNDS = 10;

export const authRouter = router({
  // 获取当前用户信息
  me: publicProcedure.query(opts => opts.ctx.user),

  // 用户名+密码登录
  login: publicProcedure
    .input(z.object({
      username: z.string().min(1, "请输入用户名"),
      password: z.string().min(1, "请输入密码"),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await db.getUserByUsername(input.username);

      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "用户名或密码错误",
        });
      }

      if (!user.isActive) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "账号已被禁用，请联系管理员",
        });
      }

      if (!user.passwordHash) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "该账号未设置密码，请联系管理员",
        });
      }

      const isValid = await bcrypt.compare(input.password, user.passwordHash);
      if (!isValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "用户名或密码错误",
        });
      }

      // 确保用户有有效的openId（用于会话管理）
      let openId = user.openId;
      if (!openId) {
        // 如果没有openId，生成一个本地ID
        openId = `local_${user.id}_${Date.now()}`;
        // 更新用户的openId
        await db.updateUserOpenId(user.id, openId);
      }

      // 创建JWT会话
      const sessionToken = await sdk.createSessionToken(openId, {
        name: user.name || user.username || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // 更新最后登录时间
      await db.upsertUser({
        openId,
        lastSignedIn: new Date(),
      });

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          username: user.username,
        },
      };
    }),

  // 退出登录
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),

  // 修改自己的密码
  changePassword: protectedProcedure
    .input(z.object({
      oldPassword: z.string().min(1, "请输入旧密码"),
      newPassword: z.string().min(6, "新密码至少6个字符"),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await db.getUserById(ctx.user!.id);
      if (!user || !user.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "当前账号不支持密码修改",
        });
      }

      const isValid = await bcrypt.compare(input.oldPassword, user.passwordHash);
      if (!isValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "旧密码错误",
        });
      }

      const newHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
      await db.updateUserPassword(ctx.user!.id, newHash);

      return { success: true };
    }),

  // 管理员创建用户（含密码）
  createUser: adminProcedure
    .input(z.object({
      username: z.string().min(2, "用户名至少2个字符").max(64, "用户名最多64个字符")
        .regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线"),
      password: z.string().min(6, "密码至少6个字符"),
      name: z.string().min(1, "请输入姓名"),
      role: z.string(),
      phone: z.string().optional(),
      region: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // 检查用户名是否已存在
      const existing = await db.getUserByUsername(input.username);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "用户名已存在",
        });
      }

      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
      const id = await db.createUserWithPassword({
        username: input.username,
        passwordHash,
        name: input.name,
        role: input.role,
        phone: input.phone,
        region: input.region,
      });

      return { id };
    }),

  // 管理员重置用户密码
  resetPassword: adminProcedure
    .input(z.object({
      userId: z.number(),
      newPassword: z.string().min(6, "密码至少6个字符"),
    }))
    .mutation(async ({ input }) => {
      const user = await db.getUserById(input.userId);
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "用户不存在",
        });
      }

      const passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
      await db.updateUserPassword(input.userId, passwordHash);

      return { success: true };
    }),
});
