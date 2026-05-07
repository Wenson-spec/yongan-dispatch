import DeprecatedRouteRedirect from "@/components/DeprecatedRouteRedirect";

/**
 * @deprecated 已被零担统一工作台替代。
 * 本文件仅保留历史入口兼容与废弃说明。
 */
export default function LtlWorkspace() {
  return (
    <DeprecatedRouteRedirect
      title="旧版零担工作台已废弃"
      description="零担工作台、询价发运台与台账入口已统一收口到零担统一工作台，历史路由将自动跳转到正式入口。"
      targetPath="/station/ltl-workspace"
    />
  );
}
