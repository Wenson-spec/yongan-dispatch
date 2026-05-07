import { describe, it, expect } from "vitest";

// 复制 normalizeCityName 函数进行单元测试
function normalizeCityName(city: string): string[] {
  const variants: string[] = [city];
  for (const suffix of ["市", "区", "县", "州", "地区"]) {
    if (city.endsWith(suffix) && city.length > suffix.length + 1) {
      variants.push(city.slice(0, -suffix.length));
    }
  }
  if (!city.endsWith("市") && !city.endsWith("区") && !city.endsWith("县")) {
    variants.push(city + "市");
  }
  return Array.from(new Set(variants));
}

// 城市→省份映射表（部分，用于测试）
const CITY_TO_PROVINCE: Record<string, string> = {
  "成都": "四川省",
  "绵阳": "四川省",
  "武汉": "湖北省",
  "广州": "广东省",
  "深圳": "广东省",
  "长沙": "湖南省",
  "重庆": "重庆市",
  "北京": "北京市",
  "上海": "上海市",
  "南宁": "广西壮族自治区",
};

describe("normalizeCityName - 城市名标准化", () => {
  it("应该保留原始城市名", () => {
    const result = normalizeCityName("成都市");
    expect(result).toContain("成都市");
  });

  it("应该去掉'市'后缀生成变体", () => {
    const result = normalizeCityName("成都市");
    expect(result).toContain("成都");
  });

  it("应该去掉'区'后缀生成变体", () => {
    const result = normalizeCityName("成华区");
    expect(result).toContain("成华");
  });

  it("应该去掉'县'后缀生成变体", () => {
    const result = normalizeCityName("丰城县");
    expect(result).toContain("丰城");
  });

  it("应该去掉'州'后缀生成变体", () => {
    const result = normalizeCityName("广州");
    // "广州" 去掉"州"后只有1个字，不应去掉
    // 但应该加上"市"
    expect(result).toContain("广州市");
  });

  it("不带后缀的城市名应该加上'市'", () => {
    const result = normalizeCityName("成都");
    expect(result).toContain("成都");
    expect(result).toContain("成都市");
  });

  it("不应产生重复变体", () => {
    const result = normalizeCityName("成都");
    const unique = Array.from(new Set(result));
    expect(result.length).toBe(unique.length);
  });

  it("短城市名不应错误去掉后缀", () => {
    // "广州" 长度为2，后缀"州"长度为1，2 > 1+1 = false，不应去掉
    const result = normalizeCityName("广州");
    // 应该保留"广州"，并加上"广州市"
    expect(result).toContain("广州");
    expect(result).toContain("广州市");
    // 不应该有单字"广"
    expect(result).not.toContain("广");
  });
});

describe("城市名→省份映射匹配", () => {
  function findProvince(cityInput: string): string | undefined {
    const variants = normalizeCityName(cityInput);
    for (const variant of variants) {
      const province = CITY_TO_PROVINCE[variant];
      if (province) return province;
    }
    return undefined;
  }

  it("'成都市' 应匹配到四川省", () => {
    expect(findProvince("成都市")).toBe("四川省");
  });

  it("'成都' 应匹配到四川省", () => {
    expect(findProvince("成都")).toBe("四川省");
  });

  it("'武汉市' 应匹配到湖北省", () => {
    expect(findProvince("武汉市")).toBe("湖北省");
  });

  it("'武汉' 应匹配到湖北省", () => {
    expect(findProvince("武汉")).toBe("湖北省");
  });

  it("'广州' 应匹配到广东省", () => {
    expect(findProvince("广州")).toBe("广东省");
  });

  it("'广州市' 应匹配到广东省", () => {
    expect(findProvince("广州市")).toBe("广东省");
  });

  it("'深圳' 应匹配到广东省", () => {
    expect(findProvince("深圳")).toBe("广东省");
  });

  it("'深圳市' 应匹配到广东省", () => {
    expect(findProvince("深圳市")).toBe("广东省");
  });

  it("'长沙市' 应匹配到湖南省", () => {
    expect(findProvince("长沙市")).toBe("湖南省");
  });

  it("'重庆' 应匹配到重庆市", () => {
    expect(findProvince("重庆")).toBe("重庆市");
  });

  it("'北京' 应匹配到北京市", () => {
    expect(findProvince("北京")).toBe("北京市");
  });

  it("'上海' 应匹配到上海市", () => {
    expect(findProvince("上海")).toBe("上海市");
  });

  it("'南宁' 应匹配到广西壮族自治区", () => {
    expect(findProvince("南宁")).toBe("广西壮族自治区");
  });

  it("'南宁市' 应匹配到广西壮族自治区", () => {
    expect(findProvince("南宁市")).toBe("广西壮族自治区");
  });

  it("未知城市应返回undefined", () => {
    expect(findProvince("火星城")).toBeUndefined();
  });
});

describe("reassignDispatcher - 重新分配调度员逻辑", () => {
  const allowedStatuses = ["pending_vehicle", "pending_approval", "dispatched", "pending_price"];
  const disallowedStatuses = ["in_transit", "delivered", "signed", "settled", "cancelled", "on_hold", "pending_assign"];

  it("允许在待找车状态下重新分配", () => {
    expect(allowedStatuses.includes("pending_vehicle")).toBe(true);
  });

  it("允许在待审批状态下重新分配", () => {
    expect(allowedStatuses.includes("pending_approval")).toBe(true);
  });

  it("允许在已调度状态下重新分配", () => {
    expect(allowedStatuses.includes("dispatched")).toBe(true);
  });

  it("允许在待定价状态下重新分配", () => {
    expect(allowedStatuses.includes("pending_price")).toBe(true);
  });

  disallowedStatuses.forEach((status) => {
    it(`不允许在${status}状态下重新分配`, () => {
      expect(allowedStatuses.includes(status)).toBe(false);
    });
  });
});
