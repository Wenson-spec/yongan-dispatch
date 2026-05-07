'use strict';
const fs = require('fs');

const distFile = process.env.YONGAN_DIST_FILE || '/var/www/yongan/dist/index.js';
let code = fs.readFileSync(distFile, 'utf8');
let changes = 0;

const inlinedStart = code.indexOf('REGEX_SMART_PASTE_INLINED_START');
const inlinedEnd = code.indexOf('REGEX_SMART_PASTE_INLINED_END');
if (inlinedStart < 0 || inlinedEnd < 0) {
  console.error('未找到内联区域标记');
  process.exit(1);
}

// ============================================================
// 1. 修复架数识别 JIA_RE — 支持"5个1100宽木架""3个木架""铁架2个"等
// ============================================================
// 当前: /([0-9一二三四五六七八九十两俩半]+(?:\.\d+)?)\s*架/i
// 问题: 不匹配"5个1100宽木架""3个木架"这种格式
const oldJiaRe = '/([0-9一二三四五六七八九十两俩半]+(?:\\.\\d+)?)\\s*架/i';
const newJiaRe = '/([0-9一二三四五六七八九十两俩半]+)(?:\\s*个)?(?:\\s*\\d*\\s*宽?\\s*(?:木|铁|钢)?)?\\s*架/i';
if (code.includes(oldJiaRe)) {
  code = code.split(oldJiaRe).join(newJiaRe);
  changes++;
  console.log('已修复: JIA_RE 支持"5个1100宽木架"等复合格式');
} else {
  console.log('注意: 未找到原始JIA_RE');
}

// ============================================================
// 2. 修复备注(remarks)提取 — 加入大板规格描述关键词
// ============================================================
// 找到 remarks 提取的正则，添加木架/箱/托等物流描述关键词
const section = code.slice(inlinedStart, inlinedEnd);

// 找到 remarks 函数中的正则
const remarksRegex = /(急单\|急件\|急发\|急货\|加急\|紧急\|催送\|催货\|赶货\|插单\|限时\|今天内\|今天必须\|必须今天\|当天到\|当天送\|明天到\|明早到\|今晚到\|越快越好\|抓紧\|速发\|特急\|十万火急\|先装\|先卸\|先送\|后装\|后卸\|后送\|装卸顺序\|送货顺序\|预约\|预计\|最晚\|最迟\|不晚于\|样板\|订货会\|展厅\|展会\|请安排\|共\.\*吨\|转仓\|自提\|送货上门\|等通知\|等电话\|电话联系\|提前联系\|送前电话\|到付\|现付\|月结\|回单\|签收单\|需要回单\|开票\|发票\|不含税\|含税\|上楼\|搬上楼\|卸车\|叉车\|吊车\|人工卸\|机械卸\|轻拿轻放\|防雨\|防潮\|不能压\|易碎\|堆码\|码放\|打托\|打木架\|木架\|铁架\|加固\|缠膜\|包装要求)/;

// 直接替换 remarks 提取逻辑为更强大的版本
// 找到 "remarks:" 赋值的位置
const remarksAssignIdx = section.indexOf('remarks: (function(t)');
if (remarksAssignIdx >= 0) {
  // 找到这个赋值的结束位置（匹配到 )(cleanBlock || text),）
  const searchFrom = inlinedStart + remarksAssignIdx;
  let depth = 0;
  let endIdx = -1;
  let inStr = '';
  for (let i = searchFrom; i < inlinedEnd; i++) {
    const ch = code[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth === 0) {
        // 找到 )(cleanBlock || text), 的结尾逗号
        const after = code.slice(i, i + 30);
        const commaMatch = after.match(/^\)[^,]*,/);
        if (commaMatch) {
          endIdx = i + commaMatch[0].length;
          break;
        }
      }
    }
  }

  if (endIdx > 0) {
    const newRemarksCode = `remarks: (function(t) {
      var lines = t.split(/\\n+/).map(function(l) { return l.trim(); }).filter(Boolean);
      var remarkLines = lines.filter(function(l) {
        return /(急单|急件|急发|急货|加急|紧急|催送|催货|赶货|插单|限时|今天内|今天必须|必须今天|当天到|当天送|明天到|明早到|今晚到|越快越好|抓紧|速发|特急|十万火急|先装|先卸|先送|后装|后卸|后送|装卸顺序|送货顺序|预约|预计|最晚|最迟|不晚于|样板|订货会|展厅|展会|请安排|共.*吨|转仓|自提|送货上门|等通知|等电话|电话联系|提前联系|送前电话|到付|现付|月结|回单|签收单|需要回单|开票|发票|不含税|含税|上楼|搬上楼|卸车|叉车|吊车|人工卸|机械卸|轻拿轻放|防雨|防潮|不能压|易碎|堆码|码放|打托|打木架|木架|铁架|加固|缠膜|包装要求|\\d+个.*架|\\d+宽.*架|\\d+箱|\\d+托|\\d+件|拼托|同规格|混装|分装|分开装|分开放|不能混|按大板|岩板发货|大板发货)/.test(l);
      });
      return remarkLines.filter(function(v, i, a) { return a.indexOf(v) === i; }).join('；');
    })(cleanBlock || text),`;
    code = code.slice(0, searchFrom) + newRemarksCode + code.slice(endIdx);
    changes++;
    console.log('已修复: remarks 提取增加木架/箱数/大板描述等关键词');
  } else {
    console.log('警告: 无法定位 remarks 赋值结束位置');
  }
} else {
  // remarks 可能还是空字符串
  const emptyRemarks = "remarks: '',";
  const emptyIdx = section.indexOf(emptyRemarks);
  if (emptyIdx >= 0) {
    const absoluteIdx = inlinedStart + emptyIdx;
    const newRemarksCode = `remarks: (function(t) {
      var lines = t.split(/\\n+/).map(function(l) { return l.trim(); }).filter(Boolean);
      var remarkLines = lines.filter(function(l) {
        return /(急单|急件|急发|急货|加急|紧急|催送|催货|今天内|今天必须|必须今天|当天到|明天到|越快越好|特急|先装|先卸|预约|预计|最晚|最迟|样板|订货会|请安排|共.*吨|转仓|自提|送货上门|等通知|等电话|到付|现付|月结|回单|签收单|上楼|叉车|吊车|人工卸|轻拿轻放|防雨|防潮|不能压|易碎|打托|打木架|木架|铁架|加固|缠膜|包装要求|\\d+个.*架|\\d+宽.*架|\\d+箱|\\d+托|拼托|同规格|混装|分装|按大板|岩板发货|大板发货)/.test(l);
      });
      return remarkLines.filter(function(v, i, a) { return a.indexOf(v) === i; }).join('；');
    })(cleanBlock || text),`;
    code = code.slice(0, absoluteIdx) + newRemarksCode + code.slice(absoluteIdx + emptyRemarks.length);
    changes++;
    console.log('已修复: remarks 从空字符串改为全面提取');
  } else {
    console.log('跳过: remarks 已被修改过且格式不同');
  }
}

// ============================================================
// 3. 修复 shippingNote 提取 — 加入大板/木架/箱数描述
// ============================================================
const oldShipNote = '/(按.+执行|要求|备注|注意|回单|加急|急单|急件|尽快|送货前|联系|上楼|叉车|卸货|预约|自提|送货上门|等通知|到付|现付|月结|签收|发票|防雨|防潮|易碎|轻放|包装|打托|木架|铁架|加固|缠膜|吊车|人工|搬运|码放|堆码|不能压|限高|限重)/';
const newShipNote = '/(按.+执行|要求|备注|注意|回单|加急|急单|急件|尽快|送货前|联系|上楼|叉车|卸货|预约|自提|送货上门|等通知|到付|现付|月结|签收|发票|防雨|防潮|易碎|轻放|包装|打托|木架|铁架|加固|缠膜|吊车|人工|搬运|码放|堆码|不能压|限高|限重|\\d+个.*架|\\d+宽.*架|拼托|同规格|混装|分装|分开装|按大板|岩板发货|大板发货)/';
if (code.includes(oldShipNote)) {
  code = code.split(oldShipNote).join(newShipNote);
  changes++;
  console.log('已修复: shippingNote 提取增加大板/木架描述关键词');
}

// ============================================================
// 4. 在每个子单的 shippingNote 中保留原始的规格描述行
//    比如 "2700*1200=200箱，预计5个1100宽木架" 这整行应该进入shippingNote
// ============================================================
// 找到 buildOrder 函数中 shippingNote 的赋值
const shippingNoteAssign = section.indexOf("shippingNote: __regexSmartPasteUniqueJoin");
if (shippingNoteAssign >= 0) {
  // 找到这行的结束
  const lineStart = inlinedStart + shippingNoteAssign;
  const lineEnd = code.indexOf(',', lineStart);
  if (lineEnd > lineStart) {
    const oldLine = code.slice(lineStart, lineEnd + 1);
    // 新逻辑：除了原来的shippingNote，还要把包含"箱""架""托""木架""铁架""宽"等描述的行也加入
    const newLine = `shippingNote: (function() {
      var base = __regexSmartPasteUniqueJoin([__regexSmartPasteExtractFallbackShippingNote(cleanBlock), context.shippingNote], '；');
      var lines = (cleanBlock || text).split(/\\n+/).map(function(l) { return l.trim(); }).filter(Boolean);
      var specLines = lines.filter(function(l) {
        return /(\\d+\\s*箱|\\d+\\s*个.*架|\\d+\\s*宽.*架|木架|铁架|铁托|钢架|\\d+\\s*托|拼托|同规格拼|SC\\s*:|SA\\s*:|大板|岩板)/.test(l);
      });
      var all = [base].concat(specLines).filter(Boolean);
      return all.filter(function(v, i, a) { return a.indexOf(v) === i; }).join('；');
    })(),`;
    code = code.slice(0, lineStart) + newLine + code.slice(lineEnd + 1);
    changes++;
    console.log('已修复: shippingNote 自动保留包含箱数/架数/木架/规格描述的原始行');
  }
}

// ============================================================
// 5. PACKAGE_RE 增加"箱"的识别（箱数信息）
// ============================================================
const oldPkgRe = "['岩板', '瓷砖',";
// 箱数已经在 PACKAGE_RE 中了（件|箱|包|扎|捆|片|支|块）
// 但需要确认 packageCount 是否正确提取了箱数
// 实际上 packageCount 在系统中是"架数"，箱数应该进入备注而不是packageCount
// 所以我们不改 packageCount 的逻辑，而是确保箱数信息进入 shippingNote/remarks

fs.writeFileSync(distFile, code, 'utf8');
console.log('共完成 ' + changes + ' 处修改');
