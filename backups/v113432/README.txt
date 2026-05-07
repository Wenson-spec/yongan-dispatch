备份时间：2026-05-01 12:00:08
前端版本：v113432
后端文件：backend-index.js
变更说明：
  1. 撤销派车时重置 tmsConfirmed=false, isSentToDriver=false, sentToDriverAt=null
  2. 新增 tmsConfirmed 字段，Tab判断改用 tmsConfirmed
  3. 删除回单管理台右上角：批量确认收到、更多流程操作、超期通知
  4. 删除派车台：批量派车、批量退回
  5. 修复已收回单Tab撤销收到按钮样式
