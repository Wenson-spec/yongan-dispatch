import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

export type BackupConfig = {
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: "ssl" | "tls" | "none";
  smtpUser: string;
  smtpPassword: string;
  senderEmail: string;
  senderName: string;
  recipientEmails: string;
  retentionDays: number;
  backupDir: string;
};

export type BackupHistoryEntry = {
  timestamp: string;
  status: "success" | "failed";
  fileName?: string;
  filePath?: string;
  sizeBytes?: number;
  trigger?: string;
  durationMs?: number;
  message?: string;
};

const DEFAULT_BACKUP_DIR = path.join(PROJECT_ROOT, "backups");
const DEFAULT_CONFIG: BackupConfig = {
  dbHost: "127.0.0.1",
  dbPort: 3306,
  dbName: "yongan_dispatch",
  dbUser: "yongan",
  dbPassword: "",
  smtpHost: "smtp.example.com",
  smtpPort: 465,
  smtpSecure: "ssl",
  smtpUser: "backup@example.com",
  smtpPassword: "",
  senderEmail: "backup@example.com",
  senderName: "永安调度系统",
  recipientEmails: "admin@example.com",
  retentionDays: 30,
  backupDir: DEFAULT_BACKUP_DIR,
};

const CONFIG_KEY_MAP = {
  DB_HOST: "dbHost",
  DB_PORT: "dbPort",
  DB_NAME: "dbName",
  DB_USER: "dbUser",
  DB_PASSWORD: "dbPassword",
  SMTP_HOST: "smtpHost",
  SMTP_PORT: "smtpPort",
  SMTP_SECURE: "smtpSecure",
  SMTP_USER: "smtpUser",
  SMTP_PASSWORD: "smtpPassword",
  SENDER_EMAIL: "senderEmail",
  SENDER_NAME: "senderName",
  RECIPIENT_EMAILS: "recipientEmails",
  RETENTION_DAYS: "retentionDays",
  BACKUP_DIR: "backupDir",
} as const;

function stripShellQuotes(value: string) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function toPositiveInt(value: string | number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getBackupConfigPath() {
  return path.join(PROJECT_ROOT, "backup.config");
}

export function getBackupScriptPath() {
  return path.join(PROJECT_ROOT, "backup.sh");
}

export function getSetupBackupScriptPath() {
  return path.join(PROJECT_ROOT, "setup-backup.sh");
}

export async function ensureBackupConfigExists() {
  const configPath = getBackupConfigPath();
  try {
    await fs.access(configPath);
  } catch {
    await writeBackupConfig(DEFAULT_CONFIG);
  }
  return configPath;
}

export async function readBackupConfig(): Promise<BackupConfig> {
  const configPath = await ensureBackupConfigExists();
  const raw = await fs.readFile(configPath, "utf-8");
  const merged: BackupConfig = { ...DEFAULT_CONFIG };

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim() as keyof typeof CONFIG_KEY_MAP;
    const rawValue = stripShellQuotes(trimmed.slice(idx + 1).trim());
    const mappedKey = CONFIG_KEY_MAP[key];
    if (!mappedKey) continue;

    if (mappedKey === "dbPort" || mappedKey === "smtpPort" || mappedKey === "retentionDays") {
      (merged[mappedKey] as number) = toPositiveInt(rawValue, DEFAULT_CONFIG[mappedKey]);
    } else if (mappedKey === "smtpSecure") {
      merged.smtpSecure = rawValue === "tls" || rawValue === "none" ? rawValue : "ssl";
    } else {
      (merged[mappedKey] as string) = rawValue;
    }
  }

  return merged;
}

export async function writeBackupConfig(input: Partial<BackupConfig>) {
  const current = await readBackupConfig().catch(() => DEFAULT_CONFIG);
  const next: BackupConfig = {
    ...current,
    ...input,
    dbPort: toPositiveInt(input.dbPort, current.dbPort),
    smtpPort: toPositiveInt(input.smtpPort, current.smtpPort),
    retentionDays: toPositiveInt(input.retentionDays, current.retentionDays),
    smtpSecure: input.smtpSecure ?? current.smtpSecure,
    backupDir: input.backupDir?.trim() || current.backupDir,
  };

  const content = `# 永安调度系统自动备份配置\n# 该文件由后台“备份管理”页面和 setup-backup.sh 维护\n\nDB_HOST=${shellEscape(next.dbHost)}\nDB_PORT=${next.dbPort}\nDB_NAME=${shellEscape(next.dbName)}\nDB_USER=${shellEscape(next.dbUser)}\nDB_PASSWORD=${shellEscape(next.dbPassword)}\n\nSMTP_HOST=${shellEscape(next.smtpHost)}\nSMTP_PORT=${next.smtpPort}\nSMTP_SECURE=${shellEscape(next.smtpSecure)}\nSMTP_USER=${shellEscape(next.smtpUser)}\nSMTP_PASSWORD=${shellEscape(next.smtpPassword)}\nSENDER_EMAIL=${shellEscape(next.senderEmail)}\nSENDER_NAME=${shellEscape(next.senderName)}\nRECIPIENT_EMAILS=${shellEscape(next.recipientEmails)}\n\nRETENTION_DAYS=${next.retentionDays}\nBACKUP_DIR=${shellEscape(next.backupDir)}\n`;

  await fs.writeFile(getBackupConfigPath(), content, "utf-8");
  await fs.mkdir(next.backupDir, { recursive: true });
  return next;
}

export async function getBackupHistoryLogPath() {
  const config = await readBackupConfig();
  await fs.mkdir(config.backupDir, { recursive: true });
  return path.join(config.backupDir, "backup-history.jsonl");
}

export async function listBackupHistory(): Promise<BackupHistoryEntry[]> {
  const config = await readBackupConfig();
  await fs.mkdir(config.backupDir, { recursive: true });
  const logPath = path.join(config.backupDir, "backup-history.jsonl");
  const entries: BackupHistoryEntry[] = [];

  try {
    const raw = await fs.readFile(logPath, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as BackupHistoryEntry);
      } catch {
        // ignore malformed lines
      }
    }
  } catch {
    // no history yet
  }

  const files = await fs.readdir(config.backupDir).catch(() => []);
  const fileMap = new Map<string, BackupHistoryEntry>();
  for (const entry of entries) {
    if (entry.fileName) {
      fileMap.set(entry.fileName, entry);
    }
  }

  for (const fileName of files.filter(name => name.endsWith(".sql.gz"))) {
    if (fileMap.has(fileName)) continue;
    const filePath = path.join(config.backupDir, fileName);
    try {
      const stat = await fs.stat(filePath);
      entries.push({
        timestamp: stat.mtime.toISOString(),
        status: "success",
        fileName,
        filePath,
        sizeBytes: stat.size,
        trigger: "unknown",
        message: "从备份目录自动补全",
      });
    } catch {
      // ignore
    }
  }

  return entries
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map(entry => ({
      ...entry,
      filePath: entry.fileName ? path.join(config.backupDir, entry.fileName) : entry.filePath,
    }));
}

export async function resolveBackupFilePath(fileName: string) {
  const config = await readBackupConfig();
  const normalized = path.basename(fileName);
  const fullPath = path.resolve(config.backupDir, normalized);
  const backupRoot = path.resolve(config.backupDir);
  if (!fullPath.startsWith(backupRoot)) {
    throw new Error("非法文件路径");
  }
  await fs.access(fullPath);
  return fullPath;
}

export async function runBackupNow(triggeredBy: string) {
  await ensureBackupConfigExists();
  const scriptPath = getBackupScriptPath();

  return await new Promise<{ success: boolean; stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      "bash",
      [scriptPath, "--run-once"],
      {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          BACKUP_TRIGGER_SOURCE: triggeredBy,
        },
        timeout: 1000 * 60 * 10,
        maxBuffer: 1024 * 1024 * 20,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || stdout || error.message));
          return;
        }
        resolve({ success: true, stdout, stderr });
      },
    );
  });
}

export async function sendBackupTestEmail(triggeredBy: string) {
  await ensureBackupConfigExists();
  const scriptPath = getBackupScriptPath();

  return await new Promise<{ success: boolean; stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      "bash",
      [scriptPath, "--test-email"],
      {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          BACKUP_TRIGGER_SOURCE: triggeredBy,
        },
        timeout: 1000 * 60 * 5,
        maxBuffer: 1024 * 1024 * 10,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || stdout || error.message));
          return;
        }
        resolve({ success: true, stdout, stderr });
      },
    );
  });
}

export function getProjectRoot() {
  return PROJECT_ROOT;
}

export function getDefaultBackupConfig() {
  return { ...DEFAULT_CONFIG };
}
