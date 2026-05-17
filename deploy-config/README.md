# 部署配置备份说明

本目录包含两套独立部署的生产环境代码备份，备份时间：2026-05-17。

## 目录结构

```
deploy-config/
├── 3000/   # 主系统（生产端口，对外服务）
└── 3001/   # 外挂工作台（内部调度专用）
```

---

## 3000 — 主系统（/var/www/yongan/）

**服务**：完整物流调度系统，含录单、审批、调度全流程  
**PM2 应用名**：`yongan`  
**数据库**：MySQL `yongan_dispatch`

```
3000/
├── dist/
│   ├── index.js                          # 后端 Node.js 服务（652KB）
│   └── public/
│       ├── index.html                    # 前端入口
│       └── assets/
│           ├── index-CTp6isfg-v113432.js # 主前端 bundle（5.3MB，含所有业务逻辑）
│           ├── index-CqFsU2wZ.js         # Vendor bundle（React等，与3001共用）
│           └── index-BQou5lOb.css        # 样式文件（与3001共用）
├── config/
│   ├── ecosystem.config.cjs              # PM2 启动配置（PORT=3000）
│   └── .env.example                      # 环境变量模板
└── nginx/
    └── yongan.conf                       # Nginx 反向代理配置
```

---

## 3001 — 外挂工作台（/var/www/yongan_test/）

**服务**：叠加在主系统之上的专属调度工作台  
**PM2 应用名**：`yongan_test`  
**包含功能**：指挥台 / 找车台 / 派车台 / 零担统一工作台 / 回单管理台 / 等通知专区

> **注意**：`index-CqFsU2wZ.js`（Vendor bundle）和 `index-BQou5lOb.css`（样式）
> 与 3000 端口完全相同，部署时直接从 `deploy-config/3000/dist/public/assets/` 复制即可。

```
3001/
├── dist/
│   ├── index.js                          # 后端 Node.js 服务（含所有工作台功能补丁）
│   └── public/
│       ├── index.html                    # 前端入口（V27版本，含竖线修复CSS patch）
│       └── assets/
│           ├── index-CTp6isfg-v113432.js # 主前端 bundle（与3000不同，含工作台路由）
│           └── index-DUGwpy1H.js         # 新增 bundle（LTL零担工作台等）
│           # index-CqFsU2wZ.js 和 index-BQou5lOb.css 与3000相同，见上方说明
├── config/
│   ├── ecosystem.config.cjs              # PM2 启动配置（PORT=3001）
│   └── .env.example                      # 环境变量模板
├── nginx/
│   └── yongan-3001.conf                  # Nginx 反向代理配置
└── patches/                              # 所有 CSS/JS 补丁脚本（按版本顺序）
    ├── patch_hybrid_smartpaste.py        # 智能粘贴功能补丁
    ├── patch_urgent.py                   # 加急标记功能补丁
    ├── fix_urgent_var.py                 # 加急变量修复
    ├── fix_urgent_var2.py                # 加急变量修复 v2
    ├── fix_brand_subtitle.py             # 品牌副标题修复
    ├── fix_index_v24.py                  # V24：斑马纹 + 加急行背景色
    ├── fix_border_v25.py                 # V25：竖线修复（border-left on td:first-child）
    ├── fix_border_v25b.py                # V25b：颜色修正
    ├── fix_border_v26.py                 # V26：TR::before 方案（已废弃，table-row伪元素不渲染）
    └── fix_border_v27.py                 # V27：当前生效，td:first-child::before 绝对定位
```

---

## 部署步骤

### 恢复 3000 主系统

```bash
cp deploy-config/3000/dist/index.js /var/www/yongan/dist/index.js
cp -r deploy-config/3000/dist/public/ /var/www/yongan/dist/public/
pm2 restart yongan
```

### 恢复 3001 外挂工作台

```bash
# 后端
cp deploy-config/3001/dist/index.js /var/www/yongan_test/dist/index.js

# 前端（注意：共享文件从3000复制）
cp deploy-config/3001/dist/public/index.html /var/www/yongan_test/dist/public/index.html
cp deploy-config/3001/dist/public/assets/index-CTp6isfg-v113432.js /var/www/yongan_test/dist/public/assets/
cp deploy-config/3001/dist/public/assets/index-DUGwpy1H.js /var/www/yongan_test/dist/public/assets/
# 共享文件（与3000相同）
cp deploy-config/3000/dist/public/assets/index-CqFsU2wZ.js /var/www/yongan_test/dist/public/assets/
cp deploy-config/3000/dist/public/assets/index-BQou5lOb.css /var/www/yongan_test/dist/public/assets/

pm2 restart yongan_test
```
