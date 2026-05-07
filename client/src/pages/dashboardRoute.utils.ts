export type DashboardRouteSource = {
  originCity?: string | null;
  destinationCity?: string | null;
  warehouseName?: string | null;
  originAddress?: string | null;
  deliveryAddress?: string | null;
  shippingNote?: string | null;
  remarks?: string | null;
};

const EMPTY_ROUTE_VALUES = new Set(["", "?", "？", "-", "--", "未知", "未识别"]);
const LONG_CITY_PREFIXES = [
  "石家庄", "哈尔滨", "齐齐哈尔", "佳木斯", "牡丹江", "七台河", "双鸭山", "鄂尔多斯",
  "呼和浩特", "乌鲁木齐", "克拉玛依", "张家口", "秦皇岛", "葫芦岛", "驻马店", "平顶山",
  "三门峡", "马鞍山", "连云港", "景德镇", "锡林郭勒",
];

export function normalizeRouteValue(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, "").trim();
  return EMPTY_ROUTE_VALUES.has(text) ? "" : text;
}

export function extractCityFromText(value: unknown) {
  const text = normalizeRouteValue(value);
  if (!text) return "";

  const directMatch = text.match(/北京市|天津市|上海市|重庆市|香港特别行政区|澳门特别行政区/);
  if (directMatch) return directMatch[0];

  const textWithoutProvince = text.replace(/^[\u4e00-\u9fa5]{2,8}(?:省|自治区|特别行政区)/, "");
  const cityMatch = textWithoutProvince.match(/([\u4e00-\u9fa5]{2,8}(?:市|自治州|州|盟|地区))/);
  if (cityMatch?.[1]) return cityMatch[1];

  const districtMatch = textWithoutProvince.match(/([\u4e00-\u9fa5]{2,8}(?:区|县|旗))/);
  if (districtMatch?.[1]) return districtMatch[1];

  const prefix = textWithoutProvince
    .split(/仓库|仓|货站|物流园|园区|分拨中心|配送中心|中心|站点|站|场站|场/)[0]
    ?.replace(/[^\u4e00-\u9fa5]/g, "");

  if (!prefix) return "";
  if (/^(北京|天津|上海|重庆)/.test(prefix)) return `${prefix.slice(0, 2)}市`;
  if (/^(香港|澳门)/.test(prefix)) return prefix.slice(0, 2);

  const longCity = LONG_CITY_PREFIXES.find((candidate) => prefix.startsWith(candidate));
  if (longCity) return longCity;

  if (prefix.length <= 3) return prefix;
  return prefix.slice(0, 2);
}

export function resolveDashboardRouteOrigin(order: DashboardRouteSource) {
  return normalizeRouteValue(order.originCity)
    || extractCityFromText(order.originAddress)
    || extractCityFromText(order.warehouseName)
    || extractCityFromText(order.shippingNote)
    || "?";
}

export function resolveDashboardRouteDestination(order: DashboardRouteSource) {
  return normalizeRouteValue(order.destinationCity)
    || extractCityFromText(order.deliveryAddress)
    || extractCityFromText(order.remarks)
    || "?";
}
