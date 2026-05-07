#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${PROJECT_ROOT}"

ensure_command() {
  local cmd="$1"
  local pkg="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    return 0
  fi
  sudo apt-get update -y
  sudo apt-get install -y "$pkg"
}

ensure_command mysqldump default-mysql-client
ensure_command crontab cron
sudo systemctl enable cron >/dev/null 2>&1 || true
sudo systemctl start cron >/dev/null 2>&1 || true

chmod +x "${PROJECT_ROOT}/backup.sh" "${PROJECT_ROOT}/setup-backup.sh"
mkdir -p "${PROJECT_ROOT}/backups"

CRON_LINE="0 3 * * * cd ${PROJECT_ROOT} && BACKUP_TRIGGER_SOURCE=cron ${PROJECT_ROOT}/backup.sh --run-once >> ${PROJECT_ROOT}/backups/cron.log 2>&1"
(
  crontab -l 2>/dev/null | grep -v -F "${PROJECT_ROOT}/backup.sh --run-once" || true
  echo "${CRON_LINE}"
) | crontab -

echo "已写入每日凌晨 3 点自动备份计划任务。"
echo "开始发送测试邮件..."
BACKUP_TRIGGER_SOURCE=setup "${PROJECT_ROOT}/backup.sh" --test-email

echo "setup-backup.sh 执行完成。"
