import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, createOperationLog } from "../db";
import {
  customers, warehouses, freightStations, vehicles, drivers,
  orders, approvals, operationLogs, podRecords, ltlInquiries,
  departments, cargoTypes, dispatcherRegions, noteChangeLogs,
  pasteTemplates, systemConfig, ltlDispatchBatches, ltlDispatchBatchOrders,
  overdueNotifications, rolePermissions,
} from "../../drizzle/schema";
import {
  ensureBackupConfigExists,
  getBackupConfigPath,
  getBackupScriptPath,
  getSetupBackupScriptPath,
  listBackupHistory,
  readBackupConfig,
  runBackupNow,
  sendBackupTestEmail,
  writeBackupConfig,
} from "../backupService";

const backupConfigSchema = z.object({
  dbHost: z.string().min(1, "数据库主机不能为空"),
  dbPort: z.number().int().positive(),
  dbName: z.string().min(1, "数据库名不能为空"),
  dbUser: z.string().min(1, "数据库用户名不能为空"),
  dbPassword: z.string(),
  smtpHost: z.string().min(1, "SMTP 主机不能为空"),
  smtpPort: z.number().int().positive(),
  smtpSecure: z.enum(["ssl", "tls", "none"]),
  smtpUser: z.string().min(1, "SMTP 用户名不能为空"),
  smtpPassword: z.string(),
  senderEmail: z.string().email("发件人邮箱格式不正确"),
  senderName: z.string().min(1, "发件人名称不能为空"),
  recipientEmails: z.string().min(1, "收件人邮箱不能为空"),
  retentionDays: z.number().int().positive().max(3650),
  backupDir: z.string().min(1, "备份目录不能为空"),
});

const TABLE_MAP: Record<string, any> = {
  customers,
  warehouses,
  freightStations,
  vehicles,
  drivers,
  orders,
  approvals,
  operationLogs,
  podRecords,
  ltlInquiries,
  departments,
  cargoTypes,
  dispatcherRegions,
  noteChangeLogs,
  pasteTemplates,
  systemConfig,
  ltlDispatchBatches,
  ltlDispatchBatchOrders,
  overdueNotifications,
  rolePermissions,
};

const TABLE_LABELS: Record<string, string> = {
  customers: "客户",
  warehouses: "仓库",
  freightStations: "货站",
  vehicles: "车辆",
  drivers: "司机",
  orders: "订单",
  approvals: "审批",
  operationLogs: "操作日志",
  podRecords: "回单记录",
  ltlInquiries: "零担询价",
  departments: "部门",
  cargoTypes: "货物类型",
  dispatcherRegions: "调度区域",
  noteChangeLogs: "备注变更日志",
  pasteTemplates: "粘贴模板",
  systemConfig: "系统配置",
  ltlDispatchBatches: "零担派车批次",
  ltlDispatchBatchOrders: "零担派车批次订单",
  overdueNotifications: "超期通知",
  rolePermissions: "角色权限",
};

export const backupRouter = router({
  getConfig: adminProcedure.query(async () => {
    await ensureBackupConfigExists();
    const config = await readBackupConfig();
    return {
      config,
      configPath: getBackupConfigPath(),
      scriptPath: getBackupScriptPath(),
      setupScriptPath: getSetupBackupScriptPath(),
    };
  }),

  updateConfig: adminProcedure
    .input(backupConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const saved = await writeBackupConfig(input);
      await createOperationLog({
        userId: ctx.user.id,
        action: "update_backup_config",
        targetType: "system_config",
        targetId: "backup.config",
        description: `更新自动备份配置，备份目录: ${saved.backupDir}`,
      }).catch(() => undefined);
      return { success: true, config: saved };
    }),

  listHistory: adminProcedure.query(async () => {
    const history = await listBackupHistory();
    return history;
  }),

  runNow: adminProcedure.mutation(async ({ ctx }) => {
    try {
      const result = await runBackupNow(`manual:${ctx.user.username}`);
      await createOperationLog({
        userId: ctx.user.id,
        action: "run_backup_now",
        targetType: "backup",
        targetId: "manual",
        description: `手动触发备份成功: ${ctx.user.username}`,
      }).catch(() => undefined);
      return result;
    } catch (error) {
      await createOperationLog({
        userId: ctx.user.id,
        action: "run_backup_now_failed",
        targetType: "backup",
        targetId: "manual",
        description: `手动触发备份失败: ${(error as Error).message}`,
      }).catch(() => undefined);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `手动备份失败：${(error as Error).message}`,
      });
    }
  }),

  sendTestEmail: adminProcedure.mutation(async ({ ctx }) => {
    try {
      const result = await sendBackupTestEmail(`manual-test:${ctx.user.username}`);
      await createOperationLog({
        userId: ctx.user.id,
        action: "send_backup_test_email",
        targetType: "backup",
        targetId: "test-email",
        description: `发送备份测试邮件: ${ctx.user.username}`,
      }).catch(() => undefined);
      return result;
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `测试邮件发送失败：${(error as Error).message}`,
      });
    }
  }),

  getDownloadUrl: adminProcedure
    .input(z.object({ fileName: z.string().min(1) }))
    .mutation(({ input }) => {
      return {
        url: `/api/backup/download/${encodeURIComponent(input.fileName)}`,
      };
    }),

  exportBackup: adminProcedure
    .input(
      z.object({
        tables: z.array(z.string()).optional(),
      }).optional(),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库不可用" });

      const selectedTables = input?.tables?.length
        ? input.tables.filter(t => TABLE_MAP[t])
        : Object.keys(TABLE_MAP);

      const backup: Record<string, any> = {
        _meta: {
          version: "1.1",
          exportedAt: new Date().toISOString(),
          tables: selectedTables,
        },
      };

      for (const tableName of selectedTables) {
        try {
          const table = TABLE_MAP[tableName];
          const rows = await db.select().from(table);
          backup[tableName] = rows;
        } catch (e) {
          backup[tableName] = { error: `导出失败: ${(e as Error).message}` };
        }
      }

      return backup;
    }),

  getStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库不可用" });

    const stats: Array<{ table: string; label: string; count: number }> = [];

    for (const [tableName, table] of Object.entries(TABLE_MAP)) {
      try {
        const rows = await db.select().from(table);
        stats.push({
          table: tableName,
          label: TABLE_LABELS[tableName] || tableName,
          count: rows.length,
        });
      } catch {
        stats.push({ table: tableName, label: TABLE_LABELS[tableName] || tableName, count: -1 });
      }
    }

    return stats;
  }),

  getTableList: adminProcedure.query(() => {
    return Object.entries(TABLE_LABELS).map(([key, label]) => ({ key, label }));
  }),
});
