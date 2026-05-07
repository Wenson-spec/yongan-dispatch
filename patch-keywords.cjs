'use strict';
const fs = require('fs');

const distFile = process.env.YONGAN_DIST_FILE || '/var/www/yongan/dist/index.js';
let code = fs.readFileSync(distFile, 'utf8');
let changes = 0;

const inlinedStart = code.indexOf('REGEX_SMART_PASTE_INLINED_START');
const inlinedEnd = code.indexOf('REGEX_SMART_PASTE_INLINED_END');
if (inlinedStart < 0 || inlinedEnd < 0) {
  console.error('未找到内联区域标记，请先执行主修复脚本');
  process.exit(1);
}

// ============================================================
// 1. 加急关键词 — 全面覆盖物流行业常见加急表达
// ============================================================
const oldUrgent = '/(加急|急发|优先|马上|立即|尽快|今天到|明早到|催送)/';
const newUrgent = '/(加急|急单|急件|急发|急货|紧急|优先|马上|立即|尽快|催送|催货|赶货|插单|限时|今天到|今天内|今天必须|必须今天|当天到|当天送|明天到|明早到|今晚到|下午到|上午到|明天必须|后天到|尽早|越快越好|抓紧|速发|速送|特急|十万火急)/';
if (code.includes(oldUrgent)) {
  code = code.split(oldUrgent).join(newUrgent);
  changes++;
  console.log('已修复: URGENT_RE 全面覆盖加急关键词');
}

// ============================================================
// 2. 价格关键词 — 全面覆盖物流行业价格表达
// ============================================================
const oldPrice = /\/\(\?:客户运价\|客户单价\|单价\|运费\|价格\)\\s\*:\?\\s\*\(\\d\+\(\?:\\.\\d\+\)\?\)\/i/g;
const newPrice = '/(?:客户运价|客户单价|单价|运费|价格|总价|报价|费用|金额|运价|合计|应收|应付|结算|收费|总费用|运输费|配送费|物流费|托运费|货运费|总金额|总运费)\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?)/i';
const oldPriceStr1 = "/(?:客户运价|客户单价|单价|运费|价格)\\s*:?\\s*(\\d+(?:\\.\\d+)?)/i";
const oldPriceStr2 = '/(?:客户运价|客户单价|单价|运费|价格)\\s*:?\\s*(\\d+(?:\\.\\d+)?)/i';
if (code.includes(oldPriceStr1)) {
  code = code.split(oldPriceStr1).join(newPrice);
  changes++;
  console.log('已修复: 价格正则全面覆盖(变体1)');
} else if (code.includes(oldPriceStr2)) {
  code = code.split(oldPriceStr2).join(newPrice);
  changes++;
  console.log('已修复: 价格正则全面覆盖(变体2)');
} else {
  // 尝试在函数内查找
  const priceFuncIdx = code.indexOf('__regexSmartPasteExtractCustomerPrice');
  if (priceFuncIdx >= 0) {
    const area = code.slice(priceFuncIdx, priceFuncIdx + 600);
    const m = area.match(/\/\(\?:[^/]+单价[^/]+\)\\s\*[^/]*\/i?/);
    if (m) {
      code = code.replace(m[0], newPrice);
      changes++;
      console.log('已修复: 价格正则全面覆盖(模糊匹配)');
    } else {
      console.log('警告: 未找到价格正则，请手动检查');
    }
  }
}

// ============================================================
// 3. 总价按重量比例分配逻辑
// ============================================================
const returnOrdersMarker = "return { orders };";
const section = code.slice(inlinedStart, inlinedEnd);
const returnIdx = section.lastIndexOf(returnOrdersMarker);

if (returnIdx >= 0 && !section.includes('总价按重量比例分配')) {
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
  code = code.slice(0, absoluteIdx) + priceAllocCode + code.slice(absoluteIdx + returnOrdersMarker.length);
  changes++;
  console.log('已修复: 添加总价按重量比例分配逻辑');
} else if (section.includes('总价按重量比例分配')) {
  console.log('跳过: 总价分配逻辑已存在');
}

// ============================================================
// 4. 备注(remarks)提取 — 全面覆盖物流调度相关备注
// ============================================================
const remarksEmpty = "remarks: '',";
const section2 = code.slice(inlinedStart, inlinedEnd);
const remarksIdx = section2.indexOf(remarksEmpty);
if (remarksIdx >= 0) {
  const absoluteIdx = inlinedStart + remarksIdx;
  const newRemarks = `remarks: (function(t) {
      var lines = t.split(/\\n+/).map(function(l) { return l.trim(); }).filter(Boolean);
      var remarkLines = lines.filter(function(l) {
        return /(急单|急件|急发|急货|加急|紧急|催送|催货|赶货|插单|限时|今天内|今天必须|必须今天|当天到|当天送|明天到|明早到|今晚到|越快越好|抓紧|速发|特急|十万火急|先装|先卸|先送|后装|后卸|后送|装卸顺序|送货顺序|预约|预计|最晚|最迟|不晚于|样板|订货会|展厅|展会|请安排|共.*吨|转仓|自提|送货上门|等通知|等电话|电话联系|提前联系|送前电话|到付|现付|月结|回单|签收单|需要回单|开票|发票|不含税|含税|上楼|搬上楼|卸车|叉车|吊车|人工卸|机械卸|轻拿轻放|防雨|防潮|不能压|易碎|堆码|码放|打托|打木架|木架|铁架|加固|缠膜|包装要求)/.test(l);
      });
      return remarkLines.filter(function(v, i, a) { return a.indexOf(v) === i; }).join('；');
    })(cleanBlock || text),`;
  code = code.slice(0, absoluteIdx) + newRemarks + code.slice(absoluteIdx + remarksEmpty.length);
  changes++;
  console.log('已修复: remarks 字段全面提取调度/加急/装卸/包装等备注');
} else {
  console.log('跳过: remarks 已被修改过');
}

// ============================================================
// 5. 货物关键词 — 补充更多货物名称
// ============================================================
const oldCargo = "['岩板', '瓷砖', '地砖', '墙砖', '板材', '石材', '陶瓷', '玻璃']";
const newCargo = "['岩板', '瓷砖', '地砖', '墙砖', '板材', '石材', '陶瓷', '玻璃', '大理石', '花岗岩', '马赛克', '卫浴', '洁具', '五金', '建材', '家具', '木材', '钢材', '水泥', '涂料', '油漆', '管材', '电缆', '电线', '设备', '机械', '配件', '零件', '食品', '饮料', '服装', '布料', '纸箱', '包裹']";
if (code.includes(oldCargo)) {
  code = code.split(oldCargo).join(newCargo);
  changes++;
  console.log('已修复: 货物关键词全面扩展');
}

// ============================================================
// 6. 发货备注提取关键词扩展
// ============================================================
const oldShippingNote = '/(按.+执行|要求|备注|注意|回单|加急|尽快|送货前|联系|上楼|叉车|卸货)/';
const newShippingNote = '/(按.+执行|要求|备注|注意|回单|加急|急单|急件|尽快|送货前|联系|上楼|叉车|卸货|预约|自提|送货上门|等通知|到付|现付|月结|签收|发票|防雨|防潮|易碎|轻放|包装|打托|木架|铁架|加固|缠膜|吊车|人工|搬运|码放|堆码|不能压|限高|限重)/';
if (code.includes(oldShippingNote)) {
  code = code.split(oldShippingNote).join(newShippingNote);
  changes++;
  console.log('已修复: 发货备注提取关键词全面扩展');
}

// ============================================================
// 7. 特殊要求关键词扩展
// ============================================================
const oldSpecReq = '/(上楼|叉车|卸货|签回单|回单|代收|加急|急发|大板发货|岩板发货)/';
const newSpecReq = '/(上楼|搬上楼|叉车|吊车|卸货|人工卸|机械卸|签回单|回单|签收单|代收|代收货款|到付|现付|月结|加急|急单|急件|急发|急货|大板发货|岩板发货|预约送货|送货上门|自提|等通知|等电话|送前电话|提前联系|防雨|防潮|易碎|轻拿轻放|不能压|打托|打木架|加固|缠膜|包装要求|限高|限重)/';
if (code.includes(oldSpecReq)) {
  code = code.split(oldSpecReq).join(newSpecReq);
  changes++;
  console.log('已修复: 特殊要求关键词全面扩展');
}

// ============================================================
// 8. 地名黑名单扩展（避免把地名误识别为人名）
// ============================================================
const oldNameBlacklist = '/(广东|广西|福建|江西|湖南|湖北|浙江|江苏|上海|北京|重庆|天津|佛山|清远|南昌|南庄|红谷滩|工业园|物流|仓库|电话|手机|收货|地址|发货|客户|备注|要求)/';
const newNameBlacklist = '/(广东|广西|福建|江西|湖南|湖北|浙江|江苏|上海|北京|重庆|天津|四川|云南|贵州|河南|河北|山东|山西|陕西|甘肃|安徽|海南|辽宁|吉林|黑龙江|内蒙古|新疆|西藏|青海|宁夏|佛山|清远|南昌|南庄|丰城|赣州|九江|吉安|景德镇|萍乡|新余|抚州|宜春|上饶|深圳|东莞|中山|珠海|惠州|江门|肇庆|广州|武汉|长沙|成都|杭州|南京|合肥|苏州|无锡|宁波|温州|红谷滩|工业园|物流|仓库|电话|手机|收货|地址|发货|客户|备注|要求|大板|岩板|瓷砖|陶瓷|石材|建材|总价|单价|运费)/';
if (code.includes(oldNameBlacklist)) {
  code = code.split(oldNameBlacklist).join(newNameBlacklist);
  changes++;
  console.log('已修复: 人名黑名单扩展，避免地名误识别');
}

fs.writeFileSync(distFile, code, 'utf8');
console.log('共完成 ' + changes + ' 处修改');
if (changes === 0) {
  console.log('注意: 没有找到需要修改的内容，可能已经修复过了');
}
