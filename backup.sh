#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${PROJECT_ROOT}/backup.config"
TRIGGER_SOURCE="${BACKUP_TRIGGER_SOURCE:-cron}"
ACTION="${1:---run-once}"

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "backup.config 不存在：${CONFIG_FILE}" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "${CONFIG_FILE}"

normalize_secure() {
  local value="${1:-ssl}"
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    true|ssl|465) echo "ssl" ;;
    tls|starttls) echo "tls" ;;
    false|none|0) echo "none" ;;
    *) echo "ssl" ;;
  esac
}

SMTP_SECURE_NORMALIZED="$(normalize_secure "${SMTP_SECURE:-ssl}")"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-yongan_dispatch}"
DB_USER="${DB_USER:-yongan}"
DB_PASSWORD="${DB_PASSWORD:-}"
BACKUP_DIR_RAW="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
SENDER_EMAIL="${SENDER_EMAIL:-${SMTP_USER:-}}"
SENDER_NAME="${SENDER_NAME:-永安调度系统}"
RECIPIENT_EMAILS="${RECIPIENT_EMAILS:-${SMTP_USER:-}}"

if [[ "${BACKUP_DIR_RAW}" = /* ]]; then
  BACKUP_DIR="${BACKUP_DIR_RAW}"
else
  BACKUP_DIR="${PROJECT_ROOT}/${BACKUP_DIR_RAW#./}"
fi
mkdir -p "${BACKUP_DIR}"
HISTORY_LOG="${BACKUP_DIR}/backup-history.jsonl"

json_escape() {
  python3.11 - <<'PY' "$1"
import json, sys
print(json.dumps(sys.argv[1], ensure_ascii=False))
PY
}

append_history() {
  local status="$1"
  local file_name="${2:-}"
  local size_bytes="${3:-0}"
  local duration_ms="${4:-0}"
  local message="$5"
  python3.11 - <<'PY' \
    "${HISTORY_LOG}" "${status}" "${file_name}" "${size_bytes}" "${duration_ms}" "${TRIGGER_SOURCE}" "${message}"
import json, sys, datetime
path, status, file_name, size_bytes, duration_ms, trigger, message = sys.argv[1:8]
entry = {
    "timestamp": datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(),
    "status": status,
    "fileName": file_name or None,
    "sizeBytes": int(size_bytes or 0),
    "trigger": trigger,
    "durationMs": int(duration_ms or 0),
    "message": message,
}
with open(path, 'a', encoding='utf-8') as f:
    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
PY
}

send_mail() {
  local subject="$1"
  local body="$2"
  local attachment="${3:-}"
  python3.11 - <<'PY' \
    "${SMTP_HOST:-}" "${SMTP_PORT:-465}" "${SMTP_USER:-}" "${SMTP_PASSWORD:-}" \
    "${SMTP_SECURE_NORMALIZED}" "${SENDER_EMAIL}" "${SENDER_NAME}" "${RECIPIENT_EMAILS}" \
    "$subject" "$body" "$attachment"
import os, sys, smtplib
from email.message import EmailMessage
from email.utils import formataddr

smtp_host, smtp_port, smtp_user, smtp_password, smtp_secure, sender_email, sender_name, recipients_raw, subject, body, attachment = sys.argv[1:12]
recipients = [item.strip() for item in recipients_raw.replace(';', ',').split(',') if item.strip()]
if not smtp_host or not recipients:
    raise SystemExit('SMTP_HOST 或 RECIPIENT_EMAILS 未配置')
msg = EmailMessage()
msg['Subject'] = subject
msg['From'] = formataddr((sender_name, sender_email or smtp_user))
msg['To'] = ', '.join(recipients)
msg.set_content(body)
if attachment and os.path.isfile(attachment):
    with open(attachment, 'rb') as f:
        data = f.read()
    msg.add_attachment(data, maintype='application', subtype='gzip', filename=os.path.basename(attachment))
port = int(smtp_port or 465)
secure = (smtp_secure or 'ssl').lower()
if secure == 'ssl':
    server = smtplib.SMTP_SSL(smtp_host, port, timeout=30)
elif secure == 'tls':
    server = smtplib.SMTP(smtp_host, port, timeout=30)
    server.starttls()
else:
    server = smtplib.SMTP(smtp_host, port, timeout=30)
try:
    if smtp_user:
        server.login(smtp_user, smtp_password)
    server.send_message(msg)
finally:
    server.quit()
PY
}

run_test_email() {
  local body
  body="永安调度系统测试邮件\n\n时间：$(date '+%F %T %z')\n触发来源：${TRIGGER_SOURCE}\nSMTP 主机：${SMTP_HOST:-未配置}\n"
  send_mail "[永安调度系统] 备份测试邮件" "$body"
  append_history "success" "" 0 0 "测试邮件发送成功"
  echo "测试邮件发送成功"
}

run_backup() {
  local started_at epoch_start timestamp dump_file archive_file size_bytes duration_ms body
  epoch_start="$(date +%s%3N)"
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  dump_file="${BACKUP_DIR}/${DB_NAME}-${timestamp}.sql"
  archive_file="${dump_file}.gz"

  export MYSQL_PWD="${DB_PASSWORD}"
  if ! command -v mysqldump >/dev/null 2>&1; then
    append_history "failed" "" 0 0 "mysqldump 不存在，请先执行 setup-backup.sh"
    send_mail "[永安调度系统] 数据备份失败" "备份失败：未找到 mysqldump，请先执行 setup-backup.sh 安装依赖。"
    echo "未找到 mysqldump" >&2
    exit 1
  fi

  if mysqldump \
      --host="${DB_HOST}" \
      --port="${DB_PORT}" \
      --user="${DB_USER}" \
      --default-character-set=utf8mb4 \
      --single-transaction \
      --routines --triggers --events \
      "${DB_NAME}" > "${dump_file}"; then
    gzip -f "${dump_file}"
    size_bytes="$(stat -c '%s' "${archive_file}")"
    find "${BACKUP_DIR}" -maxdepth 1 -type f -name '*.sql.gz' -mtime +"${RETENTION_DAYS}" -delete || true
    duration_ms="$(( $(date +%s%3N) - epoch_start ))"
    body="永安调度系统数据库备份成功。\n\n数据库：${DB_NAME}\n时间：$(date '+%F %T %z')\n触发来源：${TRIGGER_SOURCE}\n备份文件：$(basename "${archive_file}")\n大小：${size_bytes} 字节\n保留天数：${RETENTION_DAYS}\n"
    append_history "success" "$(basename "${archive_file}")" "${size_bytes}" "${duration_ms}" "备份成功"
    send_mail "[永安调度系统] 数据备份成功" "$body" "${archive_file}"
    echo "备份成功：${archive_file}"
  else
    duration_ms="$(( $(date +%s%3N) - epoch_start ))"
    rm -f "${dump_file}" "${archive_file}"
    append_history "failed" "" 0 "${duration_ms}" "mysqldump 执行失败"
    send_mail "[永安调度系统] 数据备份失败" "永安调度系统数据库备份失败。\n\n数据库：${DB_NAME}\n时间：$(date '+%F %T %z')\n触发来源：${TRIGGER_SOURCE}\n原因：mysqldump 执行失败，请检查数据库连接与权限配置。"
    echo "备份失败" >&2
    exit 1
  fi
}

case "${ACTION}" in
  --test-email)
    run_test_email
    ;;
  --run-once|"")
    run_backup
    ;;
  *)
    echo "不支持的参数：${ACTION}" >&2
    exit 2
    ;;
esac
