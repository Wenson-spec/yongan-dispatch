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
// 问题1: 价格 — 每个子单都拿到了全局的customerPrice(5248)
//   原因: buildOrder中 customerPrice = extractCustomerPrice(block) || context.customerPrice
//   而context.customerPrice就是全局提取的"5248"
//   需要: 子单级别不应该继承全局价格，总价应该在最后按重量分配
// ============================================================

// 修复方案: 在buildOrder中，不让子单继承context.customerPrice
// 找到 buildOrder 中的 customerPrice 赋值
const section = code.slice(inlinedStart, inlinedEnd);

// 找 "|| context.customerPrice" 并去掉它（在buildOrder函数内）
// buildOrder 中的代码类似: const customerPrice = extractCustomerPrice(block) || context.customerPrice || '';
const oldCustPrice = '|| context.customerPrice ||';
const custPriceIdx = section.indexOf(oldCustPrice);
if (custPriceIdx >= 0) {
  const absoluteIdx = inlinedStart + custPriceIdx;
  code = code.slice(0, absoluteIdx) + '||' + code.slice(absoluteIdx + oldCustPrice.length);
  changes++;
  console.log('已修复: buildOrder不再继承全局customerPrice，改由总价分配逻辑处理');
}

// 确认总价分配逻辑存在
if (section.includes('总价按重量比例分配')) {
  console.log('确认: 总价按重量比例分配逻辑已存在');
} else {
  // 如果不存在，添加总价分配逻辑
  const returnMarker = 'return { orders };';
  const returnIdx = section.lastIndexOf(returnMarker);
  if (returnIdx >= 0) {
    const absoluteIdx = inlinedStart + returnIdx;
    const priceAllocCode = `// 总价按重量比例分配
  var totalPriceStr = (function() {
    var m = __regexSmartPasteCleanupText(text).match(/(?:总价|合计|总金额|总运费|总费用)\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?)/);
    return m ? m[1] : '';
  })();
  if (totalPriceStr && orders.length > 0) {
    var totalPrice = parseFloat(totalPriceStr);
    if (totalPrice > 0) {
      var hasAnyPrice = orders.some(function(o) { return o.customerPrice && parseFloat(o.customerPrice) > 0; });
      if (!hasAnyPrice) {
        if (orders.length === 1) {
          orders[0].customerPrice = String(totalPrice);
          orders[0].confidence.customerPrice = 'high';
        } else {
          var totalWeight = orders.reduce(function(sum, o) { return sum + (parseFloat(o.weight) || 0); }, 0);
          if (totalWeight > 0) {
            orders.forEach(function(o) {
              var w = parseFloat(o.weight) || 0;
              if (w > 0) {
                o.customerPrice = (totalPrice * w / totalWeight).toFixed(2);
                o.confidence.customerPrice = 'medium';
              }
            });
          } else {
            var avg = (totalPrice / orders.length).toFixed(2);
            orders.forEach(function(o) {
              o.customerPrice = avg;
              o.confidence.customerPrice = 'low';
            });
          }
        }
      }
    }
  }
  return { orders };`;
    code = code.slice(0, absoluteIdx) + priceAllocCode + code.slice(absoluteIdx + returnMarker.length);
    changes++;
    console.log('已修复: 添加总价按重量比例分配逻辑');
  }
}

// ============================================================
// 问题2: 备注(remarks)和发货备注(shippingNote)塞了原始订单数据行
//   比如 "F0002280970 13300KG 2700*1200=200..." 出现在备注里
//   原因: 备注提取正则匹配了包含"箱""架"的行，但这些行本身是订单数据行
//   需要: 过滤掉包含订单号(F开头+数字)的行，这些是订单数据不是备注
// ============================================================

// 重写 remarks 提取逻辑，增加过滤条件
const remarksStart = section.indexOf('remarks: (function(t)');
if (remarksStart >= 0) {
  // 找到完整的 remarks 赋值
  const absStart = inlinedStart + remarksStart;
  // 找到匹配的结束位置
  let depth = 0;
  let endIdx = -1;
  let inStr = '';
  let started = false;
  for (let i = absStart; i < code.length; i++) {
    const ch = code[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = '';
      continue;
    }
    if (ch === "'" || ch === '"') { inStr = ch; continue; }
    if (ch === '`') { inStr = ch; continue; }
    if (ch === '(') { depth++; started = true; }
    if (ch === ')') {
      depth--;
      if (started && depth === 0) {
        // 找到闭合，继续找到 (cleanBlock || text), 的逗号
        const rest = code.slice(i + 1, i + 40);
        const commaMatch = rest.match(/^[^,]*,/);
        if (commaMatch) {
          endIdx = i + 1 + commaMatch[0].length;
        } else {
          endIdx = i + 1;
        }
        break;
      }
    }
  }

  if (endIdx > absStart) {
    const newRemarksCode = `remarks: (function(t) {
      var lines = t.split(/\\n+/).map(function(l) { return l.trim(); }).filter(Boolean);
      var remarkLines = lines.filter(function(l) {
        // 排除订单数据行（包含订单号的行不是备注）
        if (/^[A-Z]{1,3}\\d{6,}/.test(l)) return false;
        // 排除纯数字/重量行
        if (/^\\d+(\\.\\d+)?\\s*(KG|吨|T)\\s*$/i.test(l)) return false;
        // 排除合并计划号行
        if (/^P\\d{6,}/i.test(l)) return false;
        // 排除总吨/总价行（这些信息已经被结构化提取了）
        if (/^总吨|^总价|^合计/.test(l)) return false;
        // 匹配真正的备注关键词
        return /(急单|急件|急发|急货|加急|紧急|催送|催货|赶货|插单|限时|今天内|今天必须|必须今天|当天到|当天送|明天到|明早到|今晚到|越快越好|抓紧|速发|特急|先装|先卸|先送|后装|后卸|后送|装卸顺序|送货顺序|预约送货|最晚|最迟|不晚于|样板|订货会|展厅|展会|请安排|转仓|自提|送货上门|等通知|等电话|电话联系|提前联系|送前电话|到付|现付|月结|回单|签收单|需要回单|开票|发票|上楼|搬上楼|叉车|吊车|人工卸|机械卸|轻拿轻放|防雨|防潮|不能压|易碎|打托|打木架|加固|缠膜|包装要求|拼托|同规格|混装|分装|分开装|按大板|岩板发货|大板发货)/.test(l);
      });
      return remarkLines.filter(function(v, i, a) { return a.indexOf(v) === i; }).join('；');
    })(cleanBlock || text),`;
    code = code.slice(0, absStart) + newRemarksCode + code.slice(endIdx);
    changes++;
    console.log('已修复: remarks 过滤掉订单数据行，只保留真正的备注信息');
  }
} else {
  console.log('注意: 未找到 remarks 函数式赋值');
}

// 同样修复 shippingNote — 过滤掉订单数据行
// 找到 shippingNote 赋值
const reloadSection = code.slice(inlinedStart, code.indexOf('REGEX_SMART_PASTE_INLINED_END'));
const shipNoteStart = reloadSection.indexOf('shippingNote: (function()');
if (shipNoteStart >= 0) {
  const absStart = inlinedStart + shipNoteStart;
  let depth = 0;
  let endIdx = -1;
  let inStr = '';
  let started = false;
  for (let i = absStart; i < code.length; i++) {
    const ch = code[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = '';
      continue;
    }
    if (ch === "'" || ch === '"') { inStr = ch; continue; }
    if (ch === '`') { inStr = ch; continue; }
    if (ch === '(') { depth++; started = true; }
    if (ch === ')') {
      depth--;
      if (started && depth === 0) {
        const rest = code.slice(i + 1, i + 10);
        const commaMatch = rest.match(/^[^,]*,/);
        if (commaMatch) {
          endIdx = i + 1 + commaMatch[0].length;
        } else {
          endIdx = i + 1;
        }
        break;
      }
    }
  }

  if (endIdx > absStart) {
    const newShipNote = `shippingNote: (function() {
      var base = __regexSmartPasteExtractFallbackShippingNote(cleanBlock || text);
      var ctxNote = context.shippingNote || '';
      var lines = (cleanBlock || text).split(/\\n+/).map(function(l) { return l.trim(); }).filter(Boolean);
      var specLines = lines.filter(function(l) {
        // 排除订单数据行
        if (/^[A-Z]{1,3}\\d{6,}/.test(l)) return false;
        if (/^P\\d{6,}/i.test(l)) return false;
        if (/^总吨|^总价|^合计/.test(l)) return false;
        // 只保留包含规格/包装描述的行
        return /(\\d+\\s*个.*架|\\d+\\s*宽.*架|木架|铁架|铁托|钢架|拼托|同规格拼|按大板|岩板发货|大板发货)/.test(l);
      });
      var all = [base, ctxNote].concat(specLines).map(function(s) { return (s || '').trim(); }).filter(Boolean);
      return all.filter(function(v, i, a) { return a.indexOf(v) === i; }).join('；');
    })(),`;
    code = code.slice(0, absStart) + newShipNote + code.slice(endIdx);
    changes++;
    console.log('已修复: shippingNote 过滤掉订单数据行');
  }
} else {
  // shippingNote 可能是简单赋值格式
  const simpleShipNote = reloadSection.indexOf('shippingNote: __regexSmartPasteUniqueJoin');
  if (simpleShipNote >= 0) {
    const absStart = inlinedStart + simpleShipNote;
    const lineEnd = code.indexOf(',', absStart);
    if (lineEnd > absStart) {
      const newShipNote = `shippingNote: (function() {
      var base = __regexSmartPasteExtractFallbackShippingNote(cleanBlock || text);
      var ctxNote = context.shippingNote || '';
      var all = [base, ctxNote].map(function(s) { return (s || '').trim(); }).filter(Boolean);
      return all.filter(function(v, i, a) { return a.indexOf(v) === i; }).join('；');
    })()`;
      code = code.slice(0, absStart) + newShipNote + code.slice(lineEnd);
      changes++;
      console.log('已修复: shippingNote 简化版');
    }
  }
}

fs.writeFileSync(distFile, code, 'utf8');
console.log('共完成 ' + changes + ' 处修改');
