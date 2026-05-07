import DeprecatedRouteRedirect from "@/components/DeprecatedRouteRedirect";

/**
 * @deprecated 已并入零担统一工作台。
 * 历史入口仅保留重定向兼容，避免继续维护独立页面逻辑。
 */
export default function LtlInquiryStation() {
  return (
    <DeprecatedRouteRedirect
      title="零担询价发运台已废弃"
      description="该历史页面已合并至零担统一工作台，原有询价动作请在统一工作台的“待询价”或“已询价”视图中继续处理。"
      targetPath="/station/ltl-workspace?tab=pending"
    />
  );
}
