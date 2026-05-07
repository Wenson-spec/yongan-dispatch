import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { PermissionKey } from "@shared/permissions";
import { getUserPermissions } from "../db";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * 权限检查中间件工厂
 * 用法: permissionProcedure("order.create") 或 permissionProcedure(["order.create", "order.edit"])
 * 传入数组时，拥有任一权限即可通过
 */
export function permissionProcedure(requiredPermissions: PermissionKey | PermissionKey[]) {
  const perms = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
  return protectedProcedure.use(
    t.middleware(async ({ ctx, next }) => {
      // 管理员始终拥有所有权限
      if (ctx.user!.role === 'admin') {
        return next({ ctx });
      }
      const userPerms = await getUserPermissions(ctx.user!.role);
      const hasPermission = perms.some(p => userPerms.includes(p));
      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `权限不足，需要以下权限之一: ${perms.join(', ')}`,
        });
      }
      return next({ ctx });
    }),
  );
}
