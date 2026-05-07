/**
 * 安全的 parseFloat 封装
 * 遇到空字符串、null、undefined 或非数字返回 0
 * 绝对不会返回 NaN 或 Infinity
 */
export function safeParseFloat(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = parseFloat(String(value));
  return isNaN(n) || !isFinite(n) ? 0 : n;
}

/**
 * 安全的金额字符串转换
 * 将 safeParseFloat 的结果转为字符串，用于存入数据库
 */
export function safeAmountString(value: string | number | null | undefined): string {
  return String(safeParseFloat(value));
}
