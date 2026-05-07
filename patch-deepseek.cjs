'use strict';
const fs = require('fs');

const distFile = process.env.YONGAN_DIST_FILE || '/var/www/yongan/dist/index.js';
let code = fs.readFileSync(distFile, 'utf8');
let changes = 0;

// 1. 替换模型名: gemini-2.5-flash -> deepseek-chat
// DeepSeek 的聊天模型是 deepseek-chat
const oldModel = '"gemini-2.5-flash"';
const newModel = '"deepseek-chat"';
if (code.includes(oldModel)) {
  code = code.replaceAll(oldModel, newModel);
  changes++;
  console.log('已修复: 模型名 gemini-2.5-flash -> deepseek-chat');
}

// 也检查单引号版本
const oldModelSingle = "'gemini-2.5-flash'";
const newModelSingle = "'deepseek-chat'";
if (code.includes(oldModelSingle)) {
  code = code.replaceAll(oldModelSingle, newModelSingle);
  changes++;
  console.log('已修复: 模型名(单引号) gemini-2.5-flash -> deepseek-chat');
}

// 2. 移除 thinking 参数（DeepSeek 不支持）
// 源码中: payload.thinking = { "budget_tokens": 128 }
// 编译后可能是: payload.thinking = { budget_tokens: 128 } 或类似格式
const thinkingPatterns = [
  /payload\.thinking\s*=\s*\{[^}]*budget_tokens[^}]*\}\s*;?/g,
  /payload\.thinking\s*=\s*\{[^}]*\}\s*;?/g,
];

for (const pattern of thinkingPatterns) {
  if (pattern.test(code)) {
    code = code.replace(pattern, '// payload.thinking removed for DeepSeek compatibility');
    changes++;
    console.log('已修复: 移除 payload.thinking 参数');
    break;
  }
}

// 3. 检查是否有内联的正则补丁代码，如果有则移除
if (code.includes('REGEX_SMART_PASTE_INLINED_START')) {
  const start = code.indexOf('/* REGEX_SMART_PASTE_INLINED_START */');
  const end = code.indexOf('/* REGEX_SMART_PASTE_INLINED_END */');
  if (start >= 0 && end > start) {
    const endMarkerLen = '/* REGEX_SMART_PASTE_INLINED_END */'.length;
    code = code.slice(0, start) + code.slice(end + endMarkerLen);
    changes++;
    console.log('已修复: 移除内联的正则解析代码');
  }
}

// 4. 检查是否有 invokeLLM 被替换为 regexParseOrders 的代码，恢复它
// 如果之前的正则补丁替换了 invokeLLM 调用，需要恢复
if (code.includes('JSON.stringify(regexParseOrders(')) {
  // 这说明之前的补丁替换了 invokeLLM，但我们已经从备份恢复了，这里只是安全检查
  console.log('警告: 检测到 regexParseOrders 替换，建议从原始备份恢复');
}

fs.writeFileSync(distFile, code, 'utf8');
console.log('共完成 ' + changes + ' 处修改');
