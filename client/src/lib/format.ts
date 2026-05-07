/**
 * 格式化金额显示：去除多余的小数位
 * - 整数显示为整数（如 400.0000 → 400）
 * - 有效小数保留最多2位（如 578.40 → 578.4, 123.45 → 123.45）
 */
export function fmtAmount(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === "") return "";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return String(val);
  // 使用 toFixed(2) 然后去除末尾的0
  const fixed = num.toFixed(2);
  // 去除末尾的0和多余的小数点
  return fixed.replace(/\.?0+$/, "");
}
