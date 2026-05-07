'use strict';
const fs = require('fs');

const distFile = process.env.YONGAN_DIST_FILE || '/var/www/yongan/dist/index.js';
let code = fs.readFileSync(distFile, 'utf8');
let changes = 0;

// 问题: DeepSeek 不支持 response_format: { type: "json_schema", json_schema: {...} }
// 解决: 把 json_schema 类型强制转换为 json_object 类型
//
// 在编译后的代码中，normalizeResponseFormat 函数会返回 { type: "json_schema", json_schema: {...} }
// 我们需要在 payload.response_format 赋值之后，把它改为 { type: "json_object" }
//
// 最安全的方式：找到 fetch 调用前的 payload 构建，在 response_format 赋值后加一行转换

// 方案: 找到 "payload.response_format" 赋值的地方，在其后面添加转换逻辑
// 或者更简单：找到 normalizeResponseFormat 函数，修改它的返回值

// 方案1: 直接在 normalizeResponseFormat 函数中，把 json_schema 改为 json_object
// 找到: type: "json_schema"  在 return 语句中
// 改为: type: "json_object" 并去掉 json_schema 属性

// 在编译后的代码中找到关键模式
// 源码: return { type: "json_schema", json_schema: { name: schema.name, schema: schema.schema, ... } }

// 策略: 在 payload 赋值 response_format 之后，添加一行代码把 json_schema 转为 json_object
const payloadResponseFormat = 'payload.response_format = normalizedResponseFormat';
if (code.includes(payloadResponseFormat)) {
  const replacement = `payload.response_format = normalizedResponseFormat;
  // DeepSeek 兼容: json_schema -> json_object
  if (payload.response_format && payload.response_format.type === "json_schema") {
    payload.response_format = { type: "json_object" };
  }
  void 0`;
  code = code.replace(payloadResponseFormat, replacement);
  changes++;
  console.log('已修复: payload.response_format json_schema -> json_object (方案1)');
} else {
  console.log('未找到方案1模式，尝试方案2...');
  
  // 方案2: 搜索编译后的变体
  // 编译后可能是: payload.response_format = xxx; 或 xxx && (payload.response_format = xxx)
  const patterns = [
    /payload\.response_format\s*=\s*normalizedResponseFormat\s*;?/,
    /payload\.response_format\s*=\s*[a-zA-Z_$]+\s*;?/,
    /payload\["response_format"\]\s*=\s*[a-zA-Z_$]+\s*;?/,
  ];
  
  let found = false;
  for (const pattern of patterns) {
    const match = code.match(pattern);
    if (match) {
      const original = match[0];
      const replacement = original + '\n  if (payload.response_format && payload.response_format.type === "json_schema") { payload.response_format = { type: "json_object" }; }';
      code = code.replace(original, replacement);
      changes++;
      console.log('已修复: response_format json_schema -> json_object (方案2, 匹配: ' + original.slice(0, 60) + ')');
      found = true;
      break;
    }
  }
  
  if (!found) {
    console.log('未找到方案2模式，尝试方案3...');
    
    // 方案3: 在 fetch 调用之前，强制修改 payload
    // 找到 fetch(resolveApiUrl() 或类似的调用
    const fetchPattern = /const\s+response\s*=\s*await\s+fetch\s*\(/;
    const fetchMatch = code.match(fetchPattern);
    if (fetchMatch) {
      const fetchIdx = code.indexOf(fetchMatch[0]);
      const injection = '// DeepSeek 兼容: json_schema -> json_object\n  if (payload.response_format && payload.response_format.type === "json_schema") { payload.response_format = { type: "json_object" }; }\n  ';
      code = code.slice(0, fetchIdx) + injection + code.slice(fetchIdx);
      changes++;
      console.log('已修复: 在 fetch 前注入 response_format 转换 (方案3)');
    } else {
      console.log('警告: 无法找到 fetch 调用位置');
      
      // 方案4: 全局搜索 "json_schema" 字符串并替换
      // 这是最暴力的方案
      const jsonSchemaCount = (code.match(/type:\s*["']json_schema["']/g) || []).length;
      console.log('代码中 json_schema 出现次数: ' + jsonSchemaCount);
      
      if (jsonSchemaCount > 0) {
        // 只替换 normalizeResponseFormat 返回值中的
        // 找到 return 语句中的 type: "json_schema"
        code = code.replace(
          /return\s*\{\s*type:\s*["']json_schema["']/g, 
          'return { type: "json_object"'
        );
        // 同时去掉 json_schema 属性（因为 json_object 不需要）
        // 但这比较危险，先不做
        changes++;
        console.log('已修复: 全局替换 json_schema -> json_object (方案4)');
      }
    }
  }
}

// 额外: 确保 prompt 中要求返回 JSON 格式（因为 json_object 模式需要在 prompt 中说明）
// DeepSeek 的 json_object 模式要求 messages 中包含 "json" 关键词
// 这个通常在 smartPaste 的 system prompt 中已经有了，不需要额外修改

fs.writeFileSync(distFile, code, 'utf8');
console.log('共完成 ' + changes + ' 处修改');
if (changes === 0) {
  console.log('警告: 没有找到需要修改的内容');
  process.exit(1);
}
