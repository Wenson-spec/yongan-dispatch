from pathlib import Path
from datetime import datetime

path = Path('/var/www/yongan/dist/index.js')
text = path.read_text(encoding='utf-8')
backup = path.with_name(f"index.js.bak.hybrid.{datetime.now().strftime('%Y%m%d%H%M%S')}")
backup.write_text(text, encoding='utf-8')
original = text

helper_anchor = 'var smartPasteRouter = router({'
helper_block = r'''
function safeStringValue(value) {
  return value == null ? "" : typeof value === "string" ? value.trim() : String(value).trim();
}
function extractPackagingRemarks(text2) {
  const raw = safeStringValue(text2);
  if (!raw)
    return [];
  const packagingRemarkRegex = /[^\n，。,；;]*(?:木架|铁架|水泥胶|铺砖|木托|铁托|打包|缠膜|加固|垫板|护角|泡沫|纸箱|编织袋)[^\n，。,；;]*/g;
  return Array.from(new Set((raw.match(packagingRemarkRegex) || []).map((item) => safeStringValue(item)).filter(Boolean)));
}
function detectCityName(text2) {
  const raw = safeStringValue(text2);
  if (!raw)
    return "";
  const cityMatch = raw.match(/([\u4e00-\u9fa5]{2,6})市/);
  if (cityMatch)
    return cityMatch[1];
  const warehouseCityMatch = raw.match(/([\u4e00-\u9fa5]{2,6})(?:大板仓|仓库|配送仓|板仓|仓)/);
  if (warehouseCityMatch)
    return warehouseCityMatch[1];
  const features = extractTextFeatures(raw);
  return features.cities && features.cities.length ? features.cities[0] : "";
}
function inferCargoName(text2) {
  const raw = safeStringValue(text2);
  if (!raw)
    return "";
  if (/岩板/.test(raw))
    return "岩板";
  if (/大板/.test(raw))
    return "大板";
  if (/瓷砖/.test(raw))
    return "瓷砖";
  return "";
}
function splitSmartPasteOrderBlocks(text2) {
  const raw = safeStringValue(text2);
  if (!raw)
    return [];
  const lines = raw.split(/\n+/).map((line) => safeStringValue(line)).filter(Boolean);
  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (/[A-Za-z]\d{6,}/.test(line)) {
      if (current.length)
        blocks.push(current.join("\n"));
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length)
    blocks.push(current.join("\n"));
  if (!blocks.length && /[A-Za-z]\d{6,}/.test(raw)) {
    return raw.split(/(?=[A-Za-z]\d{6,})/).map((item) => safeStringValue(item)).filter(Boolean);
  }
  return blocks;
}
function parseWeightToTon(text2) {
  const raw = safeStringValue(text2);
  if (!raw)
    return "";
  const tonMatch = raw.match(/(\d+(?:\.\d+)?)\s*吨/);
  if (tonMatch)
    return String(Number(parseFloat(tonMatch[1]).toFixed(3)));
  const kgMatch = raw.match(/(\d+(?:\.\d+)?)\s*[kK][gG]/);
  if (kgMatch)
    return String(Number((parseFloat(kgMatch[1]) / 1e3).toFixed(3)));
  return "";
}
function extractCountValue(match) {
  if (!match)
    return "";
  const value = match[1] || "";
  const map = { "零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };
  if (/^\d+$/.test(value))
    return value;
  if (value === "十")
    return "10";
  if (value.startsWith("十") && value.length === 2)
    return String(10 + (map[value[1]] || 0));
  if (value.endsWith("十") && value.length === 2)
    return String((map[value[0]] || 0) * 10);
  if (value.length === 3 && value[1] === "十")
    return String((map[value[0]] || 0) * 10 + (map[value[2]] || 0));
  return map[value] != null ? String(map[value]) : "";
}
function buildMediumConfidence() {
  return {
    customerName: "medium",
    warehouseName: "medium",
    orderNumber: "medium",
    mergedPlanNumber: "medium",
    cargoName: "medium",
    customerPrice: "medium",
    weight: "medium",
    cargoSpec: "medium",
    packages: "medium",
    packageCount: "medium",
    palletCount: "medium",
    remarks: "medium",
    isUrgent: "medium",
    urgentReason: "medium",
    receiverPhone: "medium",
    receiverName: "medium",
    deliveryAddress: "medium",
    chargeableWeight: "medium",
    isLargeSlab: "medium",
    largeSlabShippingRequired: "medium",
    shippingNote: "medium",
    specialRequirements: "medium",
    originCity: "medium",
    destinationCity: "medium"
  };
}
function buildHybridSmartPasteOrders(text2) {
  const raw = safeStringValue(text2);
  if (!raw)
    return [];
  const regexResults = regexPreParse(raw);
  const blocks = splitSmartPasteOrderBlocks(raw);
  if (!blocks.length)
    return [];
  const mergedPlanNumber = regexResults.mergedPlanNumber || "";
  const shippingNote = extractFallbackShippingNote(raw);
  const urgent = /(急单|加急|紧急|今天内|尽快|马上|必须)/.test(raw);
  const urgentReasonMatches = raw.match(/(?:急单|加急|紧急|今天内必须[^\n，。,；;]*|今天内[^\n，。,；;]*|尽快[^\n，。,；;]*|马上[^\n，。,；;]*|必须[^\n，。,；;]*)/g) || [];
  const urgentReason = urgent ? Array.from(new Set(urgentReasonMatches.map((item) => safeStringValue(item)).filter(Boolean))).join("；") || "加急" : "";
  const totalPriceMatch = raw.match(/(?:总价|价格|金额|费用|报价)[:：]?\s*(\d+(?:\.\d+)?)/);
  const totalPrice = totalPriceMatch ? safeParseFloat(totalPriceMatch[1]) : NaN;
  const orders = blocks.map((block) => {
    const part = safeStringValue(block);
    const orderNumberMatch = part.match(/[A-Za-z]\d{6,}/);
    const orderNumber = orderNumberMatch ? orderNumberMatch[0] : "";
    const weight = parseWeightToTon(part);
    const separatorParts = part.split(/---+/);
    const leftPart = safeStringValue(separatorParts[0] || "");
    const rightPart = safeStringValue(separatorParts.slice(1).join("---") || "");
    const warehouseMatches = leftPart.match(/[\u4e00-\u9fa5A-Za-z0-9]+(?:大板仓|仓库|配送仓|板仓|仓)/g);
    const warehouseName = warehouseMatches && warehouseMatches.length ? safeStringValue(warehouseMatches[warehouseMatches.length - 1]) : "";
    const receiverPhoneMatch = rightPart.match(/1[3-9]\d{9}|0\d{2,3}-\d{7,8}/);
    const receiverPhone = receiverPhoneMatch ? receiverPhoneMatch[0] : "";
    const receiverNameMatch = rightPart.match(/([\u4e00-\u9fa5]{2,12}(?:（[^）]+）|\([^)]+\))?)\s*(?:1[3-9]\d{9}|0\d{2,3}-\d{7,8})?\s*$/);
    const receiverName = receiverNameMatch ? safeStringValue(receiverNameMatch[1]) : "";
    let deliveryAddress = rightPart;
    if (receiverPhone)
      deliveryAddress = deliveryAddress.replace(receiverPhone, " ");
    if (receiverName)
      deliveryAddress = deliveryAddress.replace(receiverName, " ");
    deliveryAddress = safeStringValue(deliveryAddress.replace(/\s+/g, " "));
    const cargoSpecMatch = part.match(/\d{3,4}\s*[xX×*]\s*\d{3,4}/);
    const cargoSpec = cargoSpecMatch ? normalizeCargoSpec(cargoSpecMatch[0]) : "";
    const specSize = parseDimensions(cargoSpec);
    const isLargeSlab = /大板|岩板/.test(part) || !!(specSize && specSize.longSide >= 1800 && specSize.shortSide >= 900);
    const packageCountMatch = part.match(/(?:预计|约|共|需|要)?\s*(\d+|[零一二两三四五六七八九十]+)\s*(?:个)?\s*(?:\d{2,4}\s*宽)?\s*(?:木架|铁架|架)/);
    const palletCountMatch = part.match(/(?:预计|约|共|需|要)?\s*(\d+|[零一二两三四五六七八九十]+)\s*(?:个)?\s*(?:木托|铁托|托)/);
    const packageCount = extractCountValue(packageCountMatch);
    const palletCount = extractCountValue(palletCountMatch);
    const remarkParts = extractPackagingRemarks(part);
    const remarks = Array.from(new Set(remarkParts)).join("；");
    return {
      customerName: "",
      warehouseName,
      orderNumber,
      mergedPlanNumber,
      cargoName: inferCargoName(part),
      customerPrice: "",
      weight,
      cargoSpec,
      packages: "",
      packageCount,
      palletCount,
      remarks,
      isUrgent: urgent,
      urgentReason,
      receiverPhone,
      receiverName,
      deliveryAddress,
      chargeableWeight: weight,
      isLargeSlab,
      largeSlabShippingRequired: isLargeSlab,
      shippingNote,
      specialRequirements: "",
      originCity: detectCityName(warehouseName || leftPart),
      destinationCity: detectCityName(deliveryAddress || rightPart),
      confidence: buildMediumConfidence()
    };
  }).filter((order) => order.orderNumber && order.weight);
  if (!orders.length)
    return [];
  const totalWeight = orders.reduce((sum, order) => sum + (safeParseFloat(order.weight) || 0), 0);
  if (Number.isFinite(totalPrice) && totalPrice > 0 && totalWeight > 0) {
    let allocatedPrice = 0;
    orders.forEach((order, index) => {
      const currentWeight = safeParseFloat(order.weight) || 0;
      let allocated = index === orders.length - 1 ? Number((totalPrice - allocatedPrice).toFixed(2)) : Number((totalPrice * currentWeight / totalWeight).toFixed(2));
      if (!Number.isFinite(allocated) || allocated < 0)
        allocated = 0;
      allocatedPrice += allocated;
      order.customerPrice = allocated ? String(Number(allocated.toFixed(2))) : "";
    });
  }
  return orders;
}
'''

if 'function buildHybridSmartPasteOrders(text2)' not in text:
    if helper_anchor not in text:
        raise SystemExit('helper anchor not found')
    text = text.replace(helper_anchor, helper_block + '\n' + helper_anchor, 1)

mutation_anchor = '  ).mutation(async ({ ctx, input }) => {\n    const regexResults = regexPreParse(input.text);\n    const db = await getDb();'
mutation_block = '  ).mutation(async ({ ctx, input }) => {\n    const regexResults = regexPreParse(input.text);\n    const hybridOrders = buildHybridSmartPasteOrders(input.text);\n    if (hybridOrders.length > 0 && hybridOrders.every((order) => Boolean(order.orderNumber) && Boolean(order.weight))) {\n      await createOperationLog({\n        userId: ctx.user.id,\n        action: "smart_paste",\n        module: "dispatch_order",\n        targetType: "order",\n        description: `智能粘贴正则快速解析，识别出${hybridOrders.length}条订单`,\n        metadata: { inputLength: input.text.length, orderCount: hybridOrders.length, mode: "regex_first" }\n      });\n      return { orders: hybridOrders, rawText: input.text };\n    }\n    const db = await getDb();'

if mutation_anchor in text:
    text = text.replace(mutation_anchor, mutation_block, 1)
elif 'mode: "regex_first"' not in text:
    raise SystemExit('mutation anchor not found')

if 'payload.max_tokens = 8192;' in text:
    text = text.replace('payload.max_tokens = 8192;', 'payload.max_tokens = 4096;')

path.write_text(text, encoding='utf-8')
print(str(backup))
print('patched' if text != original else 'unchanged')
