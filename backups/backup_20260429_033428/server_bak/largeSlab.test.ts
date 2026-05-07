import { describe, it, expect, vi } from "vitest";

// ============================================================
// 大板检测函数（与前端OrderCreate.tsx中的detectLargeSlab保持一致）
// 这里复制一份用于测试，确保逻辑正确
// ============================================================
function detectLargeSlab(cargoName: string, cargoSpec?: string, remarks?: string): {
  isLargeSlab: boolean;
  detectedKeywords: string[];
  detectedSpecs: string[];
} {
  const textToCheck = `${cargoName} ${cargoSpec || ''} ${remarks || ''}`;
  const keywords: string[] = [];
  const specs: string[] = [];

  // 检测关键词
  const keywordPatterns = [
    { pattern: /大板/g, label: "大板" },
    { pattern: /铁架/g, label: "铁架" },
    { pattern: /铁托/g, label: "铁托" },
    { pattern: /岩板/g, label: "岩板" },
  ];
  for (const { pattern, label } of keywordPatterns) {
    if (pattern.test(textToCheck)) {
      keywords.push(label);
    }
  }

  // 检测规格：1800×900及以上
  const sizeRegex = /(\d+)\s*[*×xX]\s*(\d+)/g;
  let match;
  while ((match = sizeRegex.exec(textToCheck)) !== null) {
    const w = parseInt(match[1]);
    const h = parseInt(match[2]);
    if ((w >= 1800 && h >= 900) || (h >= 1800 && w >= 900)) {
      specs.push(`${match[1]}×${match[2]}`);
    }
  }

  const isLargeSlab = keywords.length > 0 || specs.length > 0;
  return { isLargeSlab, detectedKeywords: keywords, detectedSpecs: specs };
}

// ============================================================
// 后端大板自动标注逻辑（与order.ts中create接口保持一致）
// ============================================================
function serverDetectLargeSlab(cargoName: string, cargoSpec?: string, remarks?: string): boolean {
  const textToCheck = `${cargoName} ${cargoSpec || ''} ${remarks || ''}`;
  const isTile = /瓷砖|大板|石材|岩板|铁架|铁托/.test(textToCheck);
  if (!isTile) return false;

  const sizeRegex = /(\d+)\s*[*×xX]\s*(\d+)/g;
  let match;
  while ((match = sizeRegex.exec(textToCheck)) !== null) {
    const w = parseInt(match[1]);
    const h = parseInt(match[2]);
    if ((w >= 1800 && h >= 900) || (h >= 1800 && w >= 900)) {
      return true;
    }
  }

  // 如果有关键词但没有规格，也检测到
  if (/大板|岩板|铁架|铁托/.test(textToCheck)) return true;

  return false;
}

// ============================================================
// 大板必填字段校验逻辑
// ============================================================
function validateLargeSlabFields(params: {
  isLargeSlab: boolean;
  businessType: string;
  chargeableWeight?: string;
  packageCount?: number;
}): { valid: boolean; error?: string } {
  if (!params.isLargeSlab) return { valid: true };

  if (params.businessType !== "ltl") {
    // 整车大板：计费重量必填
    if (!params.chargeableWeight) {
      return { valid: false, error: "大板整车订单必须填写计费重量（客户给的包车重量）" };
    }
  } else {
    // 零担大板：架数必填
    if (!params.packageCount) {
      return { valid: false, error: "大板零担订单必须填写架数" };
    }
  }

  return { valid: true };
}

// ============================================================
// 测试用例
// ============================================================

describe("大板智能检测", () => {
  describe("关键词检测", () => {
    it("检测到货物名称中的'大板'关键词", () => {
      const result = detectLargeSlab("瓷砖大板");
      expect(result.isLargeSlab).toBe(true);
      expect(result.detectedKeywords).toContain("大板");
    });

    it("检测到备注中的'铁架'关键词", () => {
      const result = detectLargeSlab("瓷砖", undefined, "铁架装");
      expect(result.isLargeSlab).toBe(true);
      expect(result.detectedKeywords).toContain("铁架");
    });

    it("检测到规格中的'岩板'关键词", () => {
      const result = detectLargeSlab("石材", "岩板 2400x1200", undefined);
      expect(result.isLargeSlab).toBe(true);
      expect(result.detectedKeywords).toContain("岩板");
    });

    it("检测到'铁托'关键词", () => {
      const result = detectLargeSlab("瓷砖铁托装");
      expect(result.isLargeSlab).toBe(true);
      expect(result.detectedKeywords).toContain("铁托");
    });

    it("普通瓷砖不触发大板检测", () => {
      const result = detectLargeSlab("瓷砖", "800x800mm", undefined);
      expect(result.isLargeSlab).toBe(false);
      expect(result.detectedKeywords).toHaveLength(0);
    });

    it("有色金属不触发大板检测", () => {
      const result = detectLargeSlab("有色金属", undefined, undefined);
      expect(result.isLargeSlab).toBe(false);
    });
  });

  describe("规格尺寸检测", () => {
    it("检测到2700×1200大板规格", () => {
      const result = detectLargeSlab("瓷砖", "2700×1200");
      expect(result.isLargeSlab).toBe(true);
      expect(result.detectedSpecs).toContain("2700×1200");
    });

    it("检测到1800×900大板规格（边界值）", () => {
      const result = detectLargeSlab("瓷砖", "1800×900");
      expect(result.isLargeSlab).toBe(true);
      expect(result.detectedSpecs).toContain("1800×900");
    });

    it("检测到1800*900格式（星号分隔）", () => {
      const result = detectLargeSlab("瓷砖", "1800*900");
      expect(result.isLargeSlab).toBe(true);
      expect(result.detectedSpecs.length).toBeGreaterThan(0);
    });

    it("检测到1800x900格式（小写x分隔）", () => {
      const result = detectLargeSlab("瓷砖", "1800x900");
      expect(result.isLargeSlab).toBe(true);
    });

    it("检测到1800X900格式（大写X分隔）", () => {
      const result = detectLargeSlab("瓷砖", "1800X900");
      expect(result.isLargeSlab).toBe(true);
    });

    it("1799×900不触发大板检测（低于阈值）", () => {
      const result = detectLargeSlab("瓷砖", "1799×900");
      expect(result.isLargeSlab).toBe(false);
    });

    it("1800×899不触发大板检测（低于阈值）", () => {
      const result = detectLargeSlab("瓷砖", "1800×899");
      expect(result.isLargeSlab).toBe(false);
    });

    it("800×800普通砖不触发大板检测", () => {
      const result = detectLargeSlab("瓷砖", "800×800");
      expect(result.isLargeSlab).toBe(false);
    });

    it("反向规格900×1800也能检测到（宽高互换）", () => {
      const result = detectLargeSlab("瓷砖", "900×1800");
      expect(result.isLargeSlab).toBe(true);
    });
  });

  describe("混合场景", () => {
    it("同时检测到关键词和规格", () => {
      const result = detectLargeSlab("大板瓷砖", "2700×1200");
      expect(result.isLargeSlab).toBe(true);
      expect(result.detectedKeywords).toContain("大板");
      expect(result.detectedSpecs).toContain("2700×1200");
    });

    it("备注中包含大板规格信息", () => {
      const result = detectLargeSlab("瓷砖", undefined, "规格2700x1200 铁架装");
      expect(result.isLargeSlab).toBe(true);
      expect(result.detectedKeywords).toContain("铁架");
    });

    it("测试数据F0002214592：大板+常规砖混装", () => {
      // 模拟测试数据：包含2700×1200大板规格
      const result = detectLargeSlab("瓷砖", "2700×1200", "大板+常规砖混装");
      expect(result.isLargeSlab).toBe(true);
      expect(result.detectedKeywords).toContain("大板");
      expect(result.detectedSpecs).toContain("2700×1200");
    });
  });
});

describe("后端大板自动标注", () => {
  it("瓷砖+大板规格自动标注", () => {
    expect(serverDetectLargeSlab("瓷砖", "2700×1200")).toBe(true);
  });

  it("瓷砖+普通规格不标注", () => {
    expect(serverDetectLargeSlab("瓷砖", "800×800")).toBe(false);
  });

  it("含大板关键词自动标注", () => {
    expect(serverDetectLargeSlab("大板瓷砖")).toBe(true);
  });

  it("含岩板关键词自动标注", () => {
    expect(serverDetectLargeSlab("岩板")).toBe(true);
  });

  it("含铁架关键词自动标注", () => {
    expect(serverDetectLargeSlab("瓷砖铁架装")).toBe(true);
  });

  it("有色金属不标注", () => {
    expect(serverDetectLargeSlab("有色金属")).toBe(false);
  });

  it("普通散装货物不标注", () => {
    expect(serverDetectLargeSlab("散装水泥")).toBe(false);
  });
});

describe("大板必填字段校验", () => {
  describe("非大板订单", () => {
    it("非大板订单无需额外校验", () => {
      const result = validateLargeSlabFields({
        isLargeSlab: false,
        businessType: "outsource",
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("整车大板", () => {
    it("整车大板缺少计费重量应失败", () => {
      const result = validateLargeSlabFields({
        isLargeSlab: true,
        businessType: "outsource",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("计费重量");
    });

    it("整车大板填写计费重量应通过", () => {
      const result = validateLargeSlabFields({
        isLargeSlab: true,
        businessType: "outsource",
        chargeableWeight: "32",
      });
      expect(result.valid).toBe(true);
    });

    it("自运整车大板也需要计费重量", () => {
      const result = validateLargeSlabFields({
        isLargeSlab: true,
        businessType: "self",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("计费重量");
    });

    it("自运整车大板填写计费重量应通过", () => {
      const result = validateLargeSlabFields({
        isLargeSlab: true,
        businessType: "self",
        chargeableWeight: "35",
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("零担大板", () => {
    it("零担大板缺少架数应失败", () => {
      const result = validateLargeSlabFields({
        isLargeSlab: true,
        businessType: "ltl",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("架数");
    });

    it("零担大板填写架数应通过", () => {
      const result = validateLargeSlabFields({
        isLargeSlab: true,
        businessType: "ltl",
        packageCount: 3,
      });
      expect(result.valid).toBe(true);
    });

    it("零担大板架数为0应失败", () => {
      const result = validateLargeSlabFields({
        isLargeSlab: true,
        businessType: "ltl",
        packageCount: 0,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("架数");
    });
  });
});

describe("大板运价统计逻辑", () => {
  // 模拟运价计算
  function calculateLargeSlabRate(params: {
    businessType: string;
    isLargeSlab: boolean;
    driverFreight: number;
    chargeableWeight?: number;
    totalCost?: number;
    packageCount?: number;
  }): { unitPrice: number; unit: string; tier: string } | null {
    if (!params.isLargeSlab) return null;

    if (params.businessType !== "ltl") {
      // 整车大板：单价=司机运费÷计费吨位，并入30t+档
      if (!params.chargeableWeight || params.chargeableWeight <= 0) return null;
      const unitPrice = params.driverFreight / params.chargeableWeight;
      return { unitPrice: Math.round(unitPrice * 100) / 100, unit: "元/吨", tier: "30t+" };
    } else {
      // 零担大板：单价=总额÷架数，独立统计
      if (!params.packageCount || params.packageCount <= 0) return null;
      if (!params.totalCost) return null;
      const unitPrice = params.totalCost / params.packageCount;
      return { unitPrice: Math.round(unitPrice * 100) / 100, unit: "元/架", tier: "大板零担" };
    }
  }

  it("整车大板：32吨计费重量，运费8000元 → 250元/吨，30t+档", () => {
    const result = calculateLargeSlabRate({
      businessType: "outsource",
      isLargeSlab: true,
      driverFreight: 8000,
      chargeableWeight: 32,
    });
    expect(result).not.toBeNull();
    expect(result!.unitPrice).toBe(250);
    expect(result!.unit).toBe("元/吨");
    expect(result!.tier).toBe("30t+");
  });

  it("整车大板：35吨计费重量，运费9100元 → 260元/吨", () => {
    const result = calculateLargeSlabRate({
      businessType: "outsource",
      isLargeSlab: true,
      driverFreight: 9100,
      chargeableWeight: 35,
    });
    expect(result).not.toBeNull();
    expect(result!.unitPrice).toBe(260);
  });

  it("零担大板：总费用3000元，3架 → 1000元/架", () => {
    const result = calculateLargeSlabRate({
      businessType: "ltl",
      isLargeSlab: true,
      driverFreight: 0,
      totalCost: 3000,
      packageCount: 3,
    });
    expect(result).not.toBeNull();
    expect(result!.unitPrice).toBe(1000);
    expect(result!.unit).toBe("元/架");
    expect(result!.tier).toBe("大板零担");
  });

  it("零担大板：总费用5500元，5架 → 1100元/架", () => {
    const result = calculateLargeSlabRate({
      businessType: "ltl",
      isLargeSlab: true,
      driverFreight: 0,
      totalCost: 5500,
      packageCount: 5,
    });
    expect(result).not.toBeNull();
    expect(result!.unitPrice).toBe(1100);
  });

  it("非大板订单返回null", () => {
    const result = calculateLargeSlabRate({
      businessType: "outsource",
      isLargeSlab: false,
      driverFreight: 5000,
    });
    expect(result).toBeNull();
  });

  it("整车大板无计费重量返回null", () => {
    const result = calculateLargeSlabRate({
      businessType: "outsource",
      isLargeSlab: true,
      driverFreight: 8000,
    });
    expect(result).toBeNull();
  });

  it("零担大板无架数返回null", () => {
    const result = calculateLargeSlabRate({
      businessType: "ltl",
      isLargeSlab: true,
      driverFreight: 0,
      totalCost: 3000,
    });
    expect(result).toBeNull();
  });
});

describe("大板检测边界情况", () => {
  it("空字符串不触发检测", () => {
    const result = detectLargeSlab("", "", "");
    expect(result.isLargeSlab).toBe(false);
  });

  it("只有数字不触发检测", () => {
    const result = detectLargeSlab("12345");
    expect(result.isLargeSlab).toBe(false);
  });

  it("多个规格同时存在时全部检测", () => {
    const result = detectLargeSlab("瓷砖", "2700×1200 和 1800×900");
    expect(result.isLargeSlab).toBe(true);
    expect(result.detectedSpecs.length).toBe(2);
  });

  it("规格在备注中也能检测到", () => {
    const result = detectLargeSlab("瓷砖", undefined, "客户要求2700×1200大板");
    expect(result.isLargeSlab).toBe(true);
    expect(result.detectedSpecs).toContain("2700×1200");
    expect(result.detectedKeywords).toContain("大板");
  });
});
