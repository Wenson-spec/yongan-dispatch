/**
 * 日期格式化工具函数
 * 统一全系统的日期显示格式
 */

/** 格式化为短日期：MM-DD HH:mm */
export function fmtShort(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** 格式化为完整日期：YYYY-MM-DD HH:mm */
export function fmtFull(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** 格式化为仅日期：YYYY-MM-DD */
export function fmtDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** 计算距今天数（用于显示"等了多久"） */
export function daysAgo(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  return `${diff}天前`;
}

/** 计算两个日期之间的天数差 */
export function daysBetween(start: string | Date | null | undefined, end: string | Date | null | undefined): string {
  if (!start || !end) return "-";
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return "-";
  const diff = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return `${diff}天`;
}
