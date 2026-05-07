'use strict';
const fs = require('fs');

const distFile = process.env.YONGAN_DIST_FILE || '/var/www/yongan/dist/index.js';
let code = fs.readFileSync(distFile, 'utf8');
let changes = 0;

// ============================================================
// 修复1: 价格 — 去掉 buildOrder 中的 context.customerPrice 继承
// ============================================================
// 精确搜索并替换
const priceInherit = '|| context.customerPrice ||';
if (code.includes(priceInherit)) {
  code = code.replace(priceInherit, '||');
  changes++;
  console.log('已修复: 去掉子单继承全局customerPrice');
}

// ============================================================
// 修复2: 备注 — 用精确字符串替换，不用括号匹配
// ============================================================
// 当前 remarks 可能是以下几种形式之一:
// a) remarks: '',
// b) remarks: (function(t) { ... })(cleanBlock || text),
// 
// 无论哪种，我们用一个安全的方式：
// 在内联区域中找到 "remarks:" 然后找到下一个已知字段名 "isUrgent:"
// 替换中间的内容

const inlinedStart = code.indexOf('REGEX_SMART_PASTE_INLINED_START');
const inlinedEnd = code.indexOf('REGEX_SMART_PASTE_INLINED_END');
if (inlinedStart < 0 || inlinedEnd < 0) {
  console.error('未找到内联区域标记');
  process.exit(1);
}

const inlined = code.slice(inlinedStart, inlinedEnd);

// 找到 buildOrder 函数中的 remarks 和 isUrgent
// 在对象字面量中，remarks 后面紧跟 isUrgent
const remarksKeyIdx = inlined.indexOf("remarks:");
const isUrgentIdx = inlined.indexOf("isUrgent:", remarksKeyIdx > 0 ? remarksKeyIdx + 1 : 0);

if (remarksKeyIdx >= 0 && isUrgentIdx > remarksKeyIdx) {
  // 找到 remarks: 到 isUrgent: 之间的内容并替换
  const absRemarksStart = inlinedStart + remarksKeyIdx;
  const absIsUrgentStart = inlinedStart + isUrgentIdx;
  
  // 新的 remarks 代码 — 注意结尾要有换行和正确缩进
  const newRemarksBlock = `remarks: (function(blockText, fullText) {
      var t = blockText || fullText || '';
      var lines = t.split(/\\n+/).map(function(l) { return l.trim(); }).filter(Boolean);
      var remarkLines = lines.filter(function(l) {
        if (/^[A-Z]{1,3}\\d{6,}/.test(l)) return false;
        if (/^\\d+(\\.\\d+)?\\s*(KG|吨|T)\\s*$/i.test(l)) return false;
        if (/^P\\d{6,}/i.test(l)) return false;
        if (/^总吨|^总价|^合计/.test(l)) return false;
        return /(急单|急件|急发|急货|加急|紧急|催送|催货|赶货|插单|限时|今天内|今天必须|必须今天|当天到|当天送|明天到|明早到|今晚到|越快越好|抓紧|速发|特急|先装|先卸|先送|后装|后卸|装卸顺序|送货顺序|预约送货|最晚|最迟|样板|订货会|请安排|转仓|自提|送货上门|等通知|等电话|提前联系|到付|现付|月结|回单|签收单|上楼|叉车|吊车|人工卸|轻拿轻放|防雨|防潮|不能压|易碎|打托|打木架|木架|铁架|加固|缠膜|包装要求|拼托|同规格|按大板|岩板发货|大板发货)/.test(l);
      });
      return remarkLines.filter(function(v, i, a) { return a.indexOf(v) === i; }).join('；');
    })(cleanBlock, text),
    `;
  
  code = code.slice(0, absRemarksStart) + newRemarksBlock + code.slice(absIsUrgentStart);
  changes++;
  console.log('已修复: remarks 过滤订单数据行，只保留真正备注');
}

// ============================================================
// 修复3: shippingNote — 同样过滤订单数据行
// ============================================================
// 重新读取内联区域（因为上面的替换可能改变了位置）
const newInlinedStart = code.indexOf('REGEX_SMART_PASTE_INLINED_START');
const newInlinedEnd = code.indexOf('REGEX_SMART_PASTE_INLINED_END');
const newInlined = code.slice(newInlinedStart, newInlinedEnd);

// shippingNote 后面紧跟 remarks:
const shipNoteIdx = newInlined.indexOf("shippingNote:");
const remarksAfterIdx = newInlined.indexOf("remarks:", shipNoteIdx > 0 ? shipNoteIdx + 1 : 0);

if (shipNoteIdx >= 0 && remarksAfterIdx > shipNoteIdx) {
  const absShipStart = newInlinedStart + shipNoteIdx;
  const absRemarksAfter = newInlinedStart + remarksAfterIdx;
  
  const newShipNoteBlock = `shippingNote: (function(blockText, fullText) {
      var t = blockText || fullText || '';
      var lines = t.split(/\\n+/).map(function(l) { return l.trim(); }).filter(Boolean);
      var noteLines = lines.filter(function(l) {
        if (/^[A-Z]{1,3}\\d{6,}/.test(l)) return false;
        if (/^P\\d{6,}/i.test(l)) return false;
        if (/^总吨|^总价|^合计/.test(l)) return false;
        if (/^\\d+(\\.\\d+)?\\s*(KG|吨|T)\\s*$/i.test(l)) return false;
        return /(按.+执行|要求|备注|注意|回单|加急|急单|尽快|送货前|联系|上楼|叉车|卸货|预约|自提|送货上门|等通知|到付|现付|月结|签收|防雨|防潮|易碎|轻放|包装|打托|木架|铁架|加固|缠膜|吊车|人工|搬运|不能压|\\d+个.*架|\\d+宽.*架|拼托|同规格|按大板|岩板发货|大板发货)/.test(l);
      });
      var ctxNote = (context.shippingNote || '').trim();
      if (ctxNote) noteLines.unshift(ctxNote);
      return noteLines.filter(function(v, i, a) { return a.indexOf(v) === i; }).join('；');
    })(cleanBlock, text),
    `;
  
  code = code.slice(0, absShipStart) + newShipNoteBlock + code.slice(absRemarksAfter);
  changes++;
  console.log('已修复: shippingNote 过滤订单数据行');
}

// ============================================================
// 修复4: 确保总价按重量比例分配逻辑存在
// ============================================================
const finalInlined = code.slice(code.indexOf('REGEX_SMART_PASTE_INLINED_START'), code.indexOf('REGEX_SMART_PASTE_INLINED_END'));
if (!finalInlined.includes('总价按重量比例分配')) {
  const returnMarker = 'return { orders };';
  const returnIdx = finalInlined.lastIndexOf(returnMarker);
  if (returnIdx >= 0) {
    const absoluteIdx = code.indexOf('REGEX_SMART_PASTE_INLINED_START') + returnIdx;
    const priceAllocCode = `// 总价按重量比例分配
  var totalPriceMatch = __regexSmartPasteCleanupText(text).match(/(?:总价|合计|总金额|总运费|总费用)\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?)/);
  var totalPriceStr = totalPriceMatch ? totalPriceMatch[1] : '';
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
    console.log('已修复: 添加总价按重量比例分配');
  }
} else {
  console.log('跳过: 总价分配逻辑已存在');
}

fs.writeFileSync(distFile, code, 'utf8');
console.log('共完成 ' + changes + ' 处修改');
