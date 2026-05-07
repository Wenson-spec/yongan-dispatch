import { FileCheck, FileWarning, PackageCheck, Package } from "lucide-react";

interface PodProgressBadgeProps {
  sentCount: number;
  totalCount: number;
  /** compact模式只显示数字，不显示进度条 */
  compact?: boolean;
}

interface ReceivedProgressBadgeProps {
  receivedCount: number;
  totalCount: number;
  /** compact模式只显示数字，不显示进度条 */
  compact?: boolean;
}

/**
 * 回单寄出进度指示器
 * 显示 "X/Y 回单已寄出" 进度，颜色根据进度变化
 */
export function PodProgressBadge({ sentCount, totalCount, compact }: PodProgressBadgeProps) {
  if (totalCount === 0) return null;

  const allDone = sentCount === totalCount;
  const progress = totalCount > 0 ? (sentCount / totalCount) * 100 : 0;

  // 颜色方案：全部到齐=绿色，部分到齐=琥珀色，未开始=灰色
  const colorClass = allDone
    ? "text-green-700 bg-green-50 border-green-200"
    : sentCount > 0
    ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-gray-500 bg-gray-50 border-gray-200";

  const barColor = allDone
    ? "bg-green-500"
    : sentCount > 0
    ? "bg-amber-500"
    : "bg-gray-300";

  const Icon = allDone ? FileCheck : FileWarning;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${colorClass}`}>
        <Icon className="h-3 w-3" />
        {sentCount}/{totalCount}
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium ${colorClass}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{sentCount}/{totalCount} 回单已寄出</span>
      <div className="w-12 h-1.5 rounded-full bg-black/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

/**
 * 已收到原件进度指示器
 * 显示 "X/Y 已收到原件" 进度，颜色根据进度变化
 */
export function ReceivedProgressBadge({ receivedCount, totalCount, compact }: ReceivedProgressBadgeProps) {
  if (totalCount === 0) return null;

  const allDone = receivedCount === totalCount;
  const progress = totalCount > 0 ? (receivedCount / totalCount) * 100 : 0;
  const remaining = totalCount - receivedCount;

  // 颜色方案：全部收到=绿色，部分收到=蓝色，未收到=灰色
  const colorClass = allDone
    ? "text-green-700 bg-green-50 border-green-200"
    : receivedCount > 0
    ? "text-blue-700 bg-blue-50 border-blue-200"
    : "text-gray-500 bg-gray-50 border-gray-200";

  const barColor = allDone
    ? "bg-green-500"
    : receivedCount > 0
    ? "bg-blue-500"
    : "bg-gray-300";

  const Icon = allDone ? PackageCheck : Package;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${colorClass}`}>
        <Icon className="h-3 w-3" />
        {receivedCount}/{totalCount} 已收
        {!allDone && remaining > 0 && <span className="text-[9px] opacity-70">差{remaining}</span>}
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium ${colorClass}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{receivedCount}/{totalCount} 已收到原件</span>
      {!allDone && remaining > 0 && (
        <span className="text-[10px] opacity-70">(差{remaining}个)</span>
      )}
      <div className="w-12 h-1.5 rounded-full bg-black/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
