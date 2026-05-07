'use strict';
const fs = require('fs');

const distFile = process.env.YONGAN_DIST_FILE || '/var/www/yongan/dist/index.js';
let code = fs.readFileSync(distFile, 'utf8');
let changes = 0;

// DeepSeek 的 json_object 模式要求 messages 中必须包含 "json" 这个词
// 系统提示词中虽然有 JSON.stringify 等代码，但那是在变量中
// 需要确保 system message 的文本中直接包含 "json" 或 "JSON"
//
// 最简单的方案：在 invokeLLM 调用前，给 messages 中的第一条 system message 
// 追加一句 "请以JSON格式返回结果"
//
// 更安全的方案：直接修改 invokeLLM 函数，在发送前自动处理

// 方案: 修改 invokeLLM 函数，在构建 payload 后、发送前，
// 检查 response_format 是否为 json_object，如果是，确保 messages 中包含 "json"
// 如果不包含，在第一条 system message 中追加

// 找到 invokeLLM 函数中 fetch 调用的位置
const fetchCallPattern = /const\s+response\s*=\s*await\s+fetch\s*\(\s*resolveApiUrl\s*\(\s*\)/;
const fetchMatch = code.match(fetchCallPattern);

if (fetchMatch) {
  const fetchIdx = code.indexOf(fetchMatch[0]);
  
  // 在 fetch 调用前注入代码
  const injection = `
  // DeepSeek 兼容: json_object 模式要求 prompt 中包含 "json"
  if (payload.response_format && payload.response_format.type === "json_object") {
    var msgs = payload.messages;
    var hasJson = JSON.stringify(msgs).toLowerCase().includes("json");
    if (!hasJson && msgs && msgs.length > 0) {
      if (typeof msgs[0].content === "string") {
        msgs[0].content = msgs[0].content + "\\n\\nPlease respond in valid JSON format.";
      }
    }
  }
  `;
  
  code = code.slice(0, fetchIdx) + injection + code.slice(fetchIdx);
  changes++;
  console.log('已修复: 在 fetch 前注入 json prompt 保证');
} else {
  console.log('未找到标准 fetch 模式，尝试备选方案...');
  
  // 备选: 搜索 fetch( 和 resolveApiUrl 附近
  const resolveIdx = code.indexOf('resolveApiUrl()');
  if (resolveIdx >= 0) {
    // 往前找最近的 fetch
    const searchArea = code.slice(Math.max(0, resolveIdx - 200), resolveIdx);
    const fetchInArea = searchArea.lastIndexOf('fetch(');
    if (fetchInArea >= 0) {
      const absoluteFetchIdx = Math.max(0, resolveIdx - 200) + fetchInArea;
      const injection = `
  // DeepSeek 兼容: json_object 模式要求 prompt 中包含 "json"
  if (payload.response_format && payload.response_format.type === "json_object") {
    var msgs2 = payload.messages;
    var hasJson2 = JSON.stringify(msgs2).toLowerCase().includes("json");
    if (!hasJson2 && msgs2 && msgs2.length > 0) {
      if (typeof msgs2[0].content === "string") {
        msgs2[0].content = msgs2[0].content + "\\n\\nPlease respond in valid JSON format.";
      }
    }
  }
  `;
      code = code.slice(0, absoluteFetchIdx) + injection + code.slice(absoluteFetchIdx);
      changes++;
      console.log('已修复: 在 fetch 前注入 json prompt 保证(备选)');
    }
  }
}

// 另外，也可以直接在 response_format 转换那里同时处理
// 检查之前的补丁是否已经加了 json_schema -> json_object 的转换
if (code.includes('json_schema -> json_object') || code.includes("json_schema")) {
  console.log('确认: json_schema -> json_object 转换已存在');
}

fs.writeFileSync(distFile, code, 'utf8');
console.log('共完成 ' + changes + ' 处修改');
if (changes === 0) {
  console.log('警告: 没有找到需要修改的内容');
  process.exit(1);
}
