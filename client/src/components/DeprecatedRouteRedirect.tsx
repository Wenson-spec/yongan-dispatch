import { useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";

export type DeprecatedRouteRedirectProps = {
  title: string;
  description: string;
  targetPath: string;
};

export default function DeprecatedRouteRedirect({
  title,
  description,
  targetPath,
}: DeprecatedRouteRedirectProps) {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    const currentSearch = typeof window !== "undefined" ? window.location.search : "";
    const fallbackLocation = `${location}${currentSearch}`;
    const shouldPreserveSearch = !targetPath.includes("?") && currentSearch;
    const nextPath = shouldPreserveSearch ? `${targetPath}${currentSearch}` : targetPath;

    if (fallbackLocation !== nextPath) {
      setLocation(nextPath, { replace: true });
    }
  }, [location, setLocation, targetPath]);

  return (
    <div className="p-6">
      <Card className="border-amber-200 bg-amber-50/60">
        <CardContent className="space-y-2 p-6">
          <div className="text-base font-semibold text-amber-900">{title}</div>
          <p className="text-sm leading-6 text-amber-800">{description}</p>
          <p className="text-xs text-amber-700">正在跳转到正式入口，请稍候。</p>
        </CardContent>
      </Card>
    </div>
  );
}
