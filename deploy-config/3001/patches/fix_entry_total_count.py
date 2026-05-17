#!/usr/bin/env python3
"""
修复录单台"全部订单"标签初始数字为0的问题。

根本原因：
  order.list.useQuery 有 enabled: n === "total" 条件，
  页面初始 tab 是 "orders"（待分流），所以查询不执行，La = undefined，
  $a.total = La?.total ?? 0 = 0。
  只有点击"全部订单"标签后才触发查询，数字才更新。

修复方案：
  将 enabled: n === "total" 改为 enabled: true，
  让查询在页面加载时就执行一次获取总数。
  保留 refetchInterval 条件（只在 total tab 时轮询，节省资源）。
"""

import shutil
import os

ASSETS_DIR = "/var/www/yongan_test/dist/public/assets"
JS_FILE = os.path.join(ASSETS_DIR, "index-CTp6isfg-v113432.js")
BACKUP_FILE = JS_FILE + ".bak_entry_total"

# 备份原文件
if not os.path.exists(BACKUP_FILE):
    shutil.copy2(JS_FILE, BACKUP_FILE)
    print(f"Backed up to {BACKUP_FILE}")
else:
    print(f"Backup already exists: {BACKUP_FILE}")

# 读取文件
with open(JS_FILE, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# 定义要替换的内容
OLD = 'enabled: n === "total",\n      refetchInterval: n === "total" ? 15e3 : !1,'
NEW = 'enabled: !0,\n      refetchInterval: n === "total" ? 15e3 : !1,'

# 验证目标存在
count = content.count(OLD)
print(f"Target occurrences: {count}")
if count == 0:
    print("ERROR: Target not found!")
    exit(1)
if count > 1:
    print(f"WARNING: Multiple occurrences ({count}), replacing first only")

# 执行替换
new_content = content.replace(OLD, NEW, 1)

# 验证替换成功
if NEW not in new_content:
    print("ERROR: Replacement failed!")
    exit(1)

# 写回文件
with open(JS_FILE, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"SUCCESS: Fixed {JS_FILE}")
print(f"Changed: enabled: n === 'total' → enabled: !0 (always true)")
print("Effect: order.list query now runs on page load, showing correct total count immediately")
