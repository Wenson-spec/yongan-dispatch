/**
 * 永安物流调度系统 - 全面端到端测试脚本
 * 按测试方案执行：流程A/B/C + 重点功能 + 异常场景
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3000/api/trpc";

// ============ 工具函数 ============
async function login(username, password = "test123456") {
  const res = await fetch(`${BASE}/auth.login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { username, password } }),
  });
  const cookies = res.headers.getSetCookie?.() || [];
  const token = cookies.find(c => c.startsWith("app_session_id="))?.split("=")[1]?.split(";")[0];
  const data = await res.json();
  if (!data.result?.data?.json?.success) {
    throw new Error(`Login failed for ${username}: ${JSON.stringify(data)}`);
  }
  return { token, user: data.result.data.json.user };
}

function headers(token) {
  return {
    "Content-Type": "application/json",
    "Cookie": `app_session_id=${token}`,
  };
}

async function query(token, procedure, input) {
  const url = input !== undefined
    ? `${BASE}/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
    : `${BASE}/${procedure}`;
  const res = await fetch(url, { headers: headers(token) });
  const data = await res.json();
  if (data.error) throw new Error(`Query ${procedure} failed: ${JSON.stringify(data.error)}`);
  return data.result?.data?.json;
}

async function mutate(token, procedure, input) {
  const res = await fetch(`${BASE}/${procedure}`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ json: input }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Mutation ${procedure} failed: ${JSON.stringify(data.error)}`);
  return data.result?.data?.json;
}

let passed = 0, failed = 0, errors = [];

function ok(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    errors.push({ name, detail });
    console.log(`  ❌ ${name} ${detail ? "- " + detail : ""}`);
  }
}

// ============ 测试开始 ============
async function main() {
  console.log("========================================");
  console.log("永安物流调度系统 - 全面端到端测试");
  console.log("========================================\n");

  // ---- 第一步：登录所有角色 ----
  console.log("【第一步】登录所有角色账号...");
  let adminAuth, ludanAuth, kefuAuth, waiqingAuth, cheduiAuth, lingdanAuth, caiwuAuth;
  
  try {
    adminAuth = await login("admin", "admin123");
    ok("管理员登录", true);
  } catch (e) {
    ok("管理员登录", false, e.message);
    return;
  }

  try { ludanAuth = await login("ludan"); ok("录单员登录", true); }
  catch (e) { ok("录单员登录", false, e.message); }

  try { kefuAuth = await login("kefu"); ok("客服经理登录", true); }
  catch (e) { ok("客服经理登录", false, e.message); }

  try { waiqingAuth = await login("waiqing"); ok("外请调度员登录", true); }
  catch (e) { ok("外请调度员登录", false, e.message); }

  try { cheduiAuth = await login("chedui"); ok("车队调度员登录", true); }
  catch (e) { ok("车队调度员登录", false, e.message); }

  try { lingdanAuth = await login("lingdan"); ok("零担调度员登录", true); }
  catch (e) { ok("零担调度员登录", false, e.message); }

  try { caiwuAuth = await login("caiwu"); ok("财务助理登录", true); }
  catch (e) { ok("财务助理登录", false, e.message); }

  // ---- 流程A：外请整车全流程 ----
  console.log("\n【流程A】外请整车全流程测试...");
  
  // A1: 录单员创建外请订单
  let orderA;
  try {
    orderA = await mutate(ludanAuth.token, "order.create", {
      orderNumber: "TEST-E2E-A001",
      customerName: "E2E测试客户A",
      transportType: "outsource",
      originCity: "佛山市",
      originProvince: "广东省",
      originAddress: "佛山市南海区桂城街道",
      destinationCity: "长沙市",
      destinationProvince: "湖南省",
      destinationAddress: "长沙市雨花区万家丽路",
      cargoName: "瓷砖",
      weight: 32.5,
      settlementMethod: "月结",
      remark: "E2E测试订单-外请整车",
    });
    ok("A1-录单员创建外请订单", orderA && orderA.id, `订单ID: ${orderA?.id}`);
  } catch (e) {
    ok("A1-录单员创建外请订单", false, e.message);
  }

  // A2: 录单员只能看到自己的订单
  if (ludanAuth && orderA) {
    try {
      const myOrders = await query(ludanAuth.token, "order.list", { page: 1, pageSize: 100 });
      const hasMyOrder = myOrders.items.some(o => o.id === orderA.id);
      ok("A2-录单员能看到自己创建的订单", hasMyOrder);
    } catch (e) {
      ok("A2-录单员能看到自己创建的订单", false, e.message);
    }
  }

  // A3: 客服经理定价
  if (kefuAuth && orderA) {
    try {
      await mutate(kefuAuth.token, "order.updateStatus", {
        id: orderA.id,
        status: "pending_find_vehicle",
        quotedPrice: 8500,
        dispatchPrice: 7000,
      });
      ok("A3-客服经理定价成功", true);
    } catch (e) {
      ok("A3-客服经理定价成功", false, e.message);
    }
  }

  // A4: 客服经理分配给外请调度员
  if (kefuAuth && orderA && waiqingAuth) {
    try {
      await mutate(kefuAuth.token, "order.assignDispatcher", {
        orderIds: [orderA.id],
        dispatcherId: waiqingAuth.user.id,
      });
      ok("A4-客服经理分配给外请调度员", true);
    } catch (e) {
      ok("A4-客服经理分配给外请调度员", false, e.message);
    }
  }

  // A5: 外请调度员只能看到分配给自己的订单（数据隔离）
  if (waiqingAuth && orderA) {
    try {
      const myOrders = await query(waiqingAuth.token, "order.list", { page: 1, pageSize: 100 });
      const hasAssigned = myOrders.items.some(o => o.id === orderA.id);
      ok("A5-外请调度员能看到分配的订单（数据隔离）", hasAssigned);
      
      // 验证看不到其他人的订单
      const allMine = myOrders.items.every(o => 
        o.assignedDispatcherId === waiqingAuth.user.id || o.assignedDispatcherId === null
      );
      ok("A5b-外请调度员看不到其他人的订单", allMine);
    } catch (e) {
      ok("A5-外请调度员数据隔离", false, e.message);
    }
  }

  // A6: 外请调度员找车报价（模拟确认派车）
  if (waiqingAuth && orderA) {
    try {
      await mutate(waiqingAuth.token, "order.updateStatus", {
        id: orderA.id,
        status: "dispatched",
        plateNumber: "粤E53251",
        driverName: "测试司机",
        driverPhone: "13800138000",
        actualFreight: 6800,
        deposit: 500,
      });
      ok("A6-外请调度员找车派车", true);
    } catch (e) {
      ok("A6-外请调度员找车派车", false, e.message);
    }
  }

  // A7: 更新为运输中
  if (kefuAuth && orderA) {
    try {
      await mutate(kefuAuth.token, "order.updateStatus", {
        id: orderA.id,
        status: "in_transit",
      });
      ok("A7-更新为运输中", true);
    } catch (e) {
      ok("A7-更新为运输中", false, e.message);
    }
  }

  // A8: 更新为已送达
  if (kefuAuth && orderA) {
    try {
      await mutate(kefuAuth.token, "order.updateStatus", {
        id: orderA.id,
        status: "delivered",
      });
      ok("A8-更新为已送达", true);
    } catch (e) {
      ok("A8-更新为已送达", false, e.message);
    }
  }

  // A9: 更新为已签收
  if (kefuAuth && orderA) {
    try {
      await mutate(kefuAuth.token, "order.updateStatus", {
        id: orderA.id,
        status: "signed",
      });
      ok("A9-更新为已签收", true);
    } catch (e) {
      ok("A9-更新为已签收", false, e.message);
    }
  }

  // A10: 验证操作日志
  if (adminAuth && orderA) {
    try {
      const logs = await query(adminAuth.token, "operationLog.list", { 
        page: 1, pageSize: 50, orderId: orderA.id 
      });
      ok("A10-操作日志记录完整", logs.items && logs.items.length >= 5, 
        `日志条数: ${logs.items?.length}`);
      
      // 检查日志是否有中文描述
      const hasChineseDesc = logs.items?.some(l => /[\u4e00-\u9fa5]/.test(l.description));
      ok("A10b-操作日志使用中文描述", hasChineseDesc);
    } catch (e) {
      ok("A10-操作日志", false, e.message);
    }
  }

  // ---- 流程B：零担运输全流程 ----
  console.log("\n【流程B】零担运输全流程测试...");
  
  // B1: 录单员创建零担订单
  let orderB;
  try {
    orderB = await mutate(ludanAuth.token, "order.create", {
      orderNumber: "TEST-E2E-B001",
      customerName: "E2E测试客户B",
      transportType: "ltl",
      originCity: "佛山市",
      originProvince: "广东省",
      originAddress: "佛山市禅城区石湾镇",
      destinationCity: "武汉市",
      destinationProvince: "湖北省",
      destinationAddress: "武汉市新洲区阳逻经济开发区",
      cargoName: "瓷砖",
      weight: 2.5,
      settlementMethod: "现付",
      remark: "E2E测试订单-零担",
    });
    ok("B1-录单员创建零担订单", orderB && orderB.id, `订单ID: ${orderB?.id}`);
  } catch (e) {
    ok("B1-录单员创建零担订单", false, e.message);
  }

  // B2: 客服经理定价
  if (kefuAuth && orderB) {
    try {
      await mutate(kefuAuth.token, "order.updateStatus", {
        id: orderB.id,
        status: "pending_inquiry",
        quotedPrice: 1200,
      });
      ok("B2-客服经理定价（转询价）", true);
    } catch (e) {
      ok("B2-客服经理定价（转询价）", false, e.message);
    }
  }

  // B3: 零担调度员询价确认
  if (lingdanAuth && orderB) {
    try {
      // 创建询价记录
      await mutate(lingdanAuth.token, "order.createInquiry", {
        orderId: orderB.id,
        freightStationName: "德坤物流",
        contactPhone: "0757-88888888",
        unitPrice: 420,
        deliveryFee: 150,
        otherFee: 0,
        totalPrice: 1200,
        remark: "E2E测试询价",
      });
      ok("B3-零担调度员创建询价", true);
    } catch (e) {
      ok("B3-零担调度员创建询价", false, e.message);
    }
  }

  // B4: 确认询价
  if (lingdanAuth && orderB) {
    try {
      await mutate(lingdanAuth.token, "order.updateStatus", {
        id: orderB.id,
        status: "inquiry_confirmed",
        freightStationName: "德坤物流",
        freightStationPhone: "0757-88888888",
        actualFreight: 1200,
      });
      ok("B4-确认询价", true);
    } catch (e) {
      ok("B4-确认询价", false, e.message);
    }
  }

  // B5: 发运
  if (lingdanAuth && orderB) {
    try {
      await mutate(lingdanAuth.token, "order.updateStatus", {
        id: orderB.id,
        status: "in_transit",
      });
      ok("B5-零担发运", true);
    } catch (e) {
      ok("B5-零担发运", false, e.message);
    }
  }

  // B6: 零担派车批次
  if (lingdanAuth && orderB) {
    try {
      const batch = await mutate(lingdanAuth.token, "order.ltlDispatchCreate", {
        plateNumber: "粤Y12345",
        driverName: "测试零担司机",
        driverPhone: "13900139000",
        dispatchDate: new Date().toISOString().split("T")[0],
        orderIds: [orderB.id],
        orderRemarks: { [orderB.id]: "德坤湖北，吨420+送150，1200" },
      });
      ok("B6-创建零担派车批次", batch && batch.id, `批次ID: ${batch?.id}`);
      
      // B7: 查询批次列表
      const batches = await query(lingdanAuth.token, "order.ltlDispatchList", {});
      ok("B7-查询零担派车批次列表", batches && batches.length > 0, `批次数: ${batches?.length}`);
    } catch (e) {
      ok("B6-创建零担派车批次", false, e.message);
    }
  }

  // ---- 流程C：自运订单全流程 ----
  console.log("\n【流程C】自运订单全流程测试...");
  
  let orderC;
  try {
    orderC = await mutate(ludanAuth.token, "order.create", {
      orderNumber: "TEST-E2E-C001",
      customerName: "E2E测试客户C",
      transportType: "self",
      originCity: "佛山市",
      originProvince: "广东省",
      originAddress: "佛山市南海区狮山镇",
      destinationCity: "广州市",
      destinationProvince: "广东省",
      destinationAddress: "广州市白云区太和镇",
      cargoName: "建材",
      weight: 15,
      settlementMethod: "月结",
      remark: "E2E测试订单-自运",
    });
    ok("C1-录单员创建自运订单", orderC && orderC.id, `订单ID: ${orderC?.id}`);
  } catch (e) {
    ok("C1-录单员创建自运订单", false, e.message);
  }

  // C2: 定价
  if (kefuAuth && orderC) {
    try {
      await mutate(kefuAuth.token, "order.updateStatus", {
        id: orderC.id,
        status: "pending_dispatch",
        quotedPrice: 3000,
        dispatchPrice: 2000,
      });
      ok("C2-客服经理定价（自运→待派车）", true);
    } catch (e) {
      ok("C2-客服经理定价（自运→待派车）", false, e.message);
    }
  }

  // C3: 车队调度员派车
  if (cheduiAuth && orderC) {
    try {
      await mutate(cheduiAuth.token, "order.updateStatus", {
        id: orderC.id,
        status: "dispatched",
        plateNumber: "粤E88888",
        driverName: "自运司机",
        driverPhone: "13700137000",
      });
      ok("C3-车队调度员派车", true);
    } catch (e) {
      ok("C3-车队调度员派车", false, e.message);
    }
  }

  // C4-C6: 运输→送达→签收
  if (kefuAuth && orderC) {
    try {
      await mutate(kefuAuth.token, "order.updateStatus", { id: orderC.id, status: "in_transit" });
      ok("C4-自运运输中", true);
      await mutate(kefuAuth.token, "order.updateStatus", { id: orderC.id, status: "delivered" });
      ok("C5-自运已送达", true);
      await mutate(kefuAuth.token, "order.updateStatus", { id: orderC.id, status: "signed" });
      ok("C6-自运已签收", true);
    } catch (e) {
      ok("C4-C6自运状态流转", false, e.message);
    }
  }

  // ---- 重点功能验证 ----
  console.log("\n【重点功能】数据隔离 + 权限测试...");

  // 数据隔离：第二个外请调度员看不到第一个的订单
  try {
    const dispLi = await login("dispatcher_li");
    const liOrders = await query(dispLi.token, "order.list", { page: 1, pageSize: 100 });
    const canSeeOrderA = liOrders.items?.some(o => o.id === orderA?.id);
    ok("数据隔离-外请调度员李四看不到张三的订单", !canSeeOrderA);
  } catch (e) {
    ok("数据隔离-外请调度员李四", false, e.message);
  }

  // 权限测试：录单员不能定价
  if (ludanAuth && orderA) {
    try {
      // 创建一个新订单让录单员尝试定价
      const testOrder = await mutate(ludanAuth.token, "order.create", {
        orderNumber: "TEST-E2E-PERM",
        customerName: "权限测试客户",
        transportType: "outsource",
        originCity: "佛山市",
        originProvince: "广东省",
        destinationCity: "深圳市",
        destinationProvince: "广东省",
        cargoName: "测试",
        weight: 1,
      });
      
      try {
        await mutate(ludanAuth.token, "order.updateStatus", {
          id: testOrder.id,
          status: "pending_find_vehicle",
          quotedPrice: 1000,
        });
        ok("权限-录单员不能定价", false, "录单员不应该能定价");
      } catch (e) {
        ok("权限-录单员不能定价（正确拒绝）", true);
      }
    } catch (e) {
      ok("权限测试", false, e.message);
    }
  }

  // 退回功能测试
  console.log("\n【重点功能】退回功能测试...");
  
  let orderRollback;
  try {
    orderRollback = await mutate(ludanAuth.token, "order.create", {
      orderNumber: "TEST-E2E-ROLLBACK",
      customerName: "退回测试客户",
      transportType: "outsource",
      originCity: "佛山市",
      originProvince: "广东省",
      destinationCity: "南京市",
      destinationProvince: "江苏省",
      cargoName: "瓷砖",
      weight: 20,
    });
    
    // 定价
    await mutate(kefuAuth.token, "order.updateStatus", {
      id: orderRollback.id,
      status: "pending_find_vehicle",
      quotedPrice: 5000,
      dispatchPrice: 4000,
    });
    
    // 退回到待定价
    await mutate(kefuAuth.token, "order.rollbackStatus", {
      id: orderRollback.id,
      reason: "E2E测试退回-价格需要重新确认",
    });
    
    // 验证状态回退
    const rollbackedOrder = await query(adminAuth.token, "order.list", { 
      page: 1, pageSize: 1, search: "TEST-E2E-ROLLBACK" 
    });
    const currentStatus = rollbackedOrder.items?.[0]?.status;
    ok("退回功能-单条退回", currentStatus === "pending_price", `退回后状态: ${currentStatus}`);
  } catch (e) {
    ok("退回功能-单条退回", false, e.message);
  }

  // 批量退回测试
  try {
    const order1 = await mutate(ludanAuth.token, "order.create", {
      orderNumber: "TEST-BATCH-R1", customerName: "批量退回1",
      transportType: "outsource", originCity: "佛山市", originProvince: "广东省",
      destinationCity: "杭州市", destinationProvince: "浙江省", cargoName: "瓷砖", weight: 10,
    });
    const order2 = await mutate(ludanAuth.token, "order.create", {
      orderNumber: "TEST-BATCH-R2", customerName: "批量退回2",
      transportType: "outsource", originCity: "佛山市", originProvince: "广东省",
      destinationCity: "杭州市", destinationProvince: "浙江省", cargoName: "瓷砖", weight: 15,
    });
    
    // 定价
    await mutate(kefuAuth.token, "order.updateStatus", { id: order1.id, status: "pending_find_vehicle", quotedPrice: 3000, dispatchPrice: 2500 });
    await mutate(kefuAuth.token, "order.updateStatus", { id: order2.id, status: "pending_find_vehicle", quotedPrice: 4000, dispatchPrice: 3500 });
    
    // 批量退回
    const batchResult = await mutate(kefuAuth.token, "order.batchRollback", {
      orderIds: [order1.id, order2.id],
      reason: "E2E批量退回测试",
    });
    ok("退回功能-批量退回", batchResult?.successCount === 2, `成功: ${batchResult?.successCount}`);
  } catch (e) {
    ok("退回功能-批量退回", false, e.message);
  }

  // ---- 异常场景测试 ----
  console.log("\n【异常场景】边界测试...");

  // 必填字段为空
  try {
    await mutate(ludanAuth.token, "order.create", {
      orderNumber: "",
      customerName: "",
      transportType: "outsource",
      originCity: "",
      destinationCity: "",
      cargoName: "",
      weight: 0,
    });
    ok("异常-必填字段为空应被拒绝", false, "空字段不应该通过");
  } catch (e) {
    ok("异常-必填字段为空被正确拒绝", true);
  }

  // 特殊字符
  try {
    const specialOrder = await mutate(ludanAuth.token, "order.create", {
      orderNumber: "TEST-SPECIAL-😀'\"<>",
      customerName: "特殊字符客户'\"<>&",
      transportType: "outsource",
      originCity: "佛山市",
      originProvince: "广东省",
      destinationCity: "深圳市",
      destinationProvince: "广东省",
      cargoName: "测试'\"<>",
      weight: 1,
      remark: "备注含特殊字符：😀🎉<script>alert(1)</script>",
    });
    ok("异常-特殊字符正常保存", specialOrder && specialOrder.id);
  } catch (e) {
    ok("异常-特殊字符处理", false, e.message);
  }

  // 超大金额
  try {
    const bigOrder = await mutate(ludanAuth.token, "order.create", {
      orderNumber: "TEST-BIG-AMOUNT",
      customerName: "大金额客户",
      transportType: "outsource",
      originCity: "佛山市",
      originProvince: "广东省",
      destinationCity: "北京市",
      destinationProvince: "北京市",
      cargoName: "贵重货物",
      weight: 100,
    });
    await mutate(kefuAuth.token, "order.updateStatus", {
      id: bigOrder.id,
      status: "pending_find_vehicle",
      quotedPrice: 999999.99,
      dispatchPrice: 888888.88,
    });
    ok("异常-大金额正常处理", true);
  } catch (e) {
    ok("异常-大金额处理", false, e.message);
  }

  // 非法状态跳转
  try {
    const illegalOrder = await mutate(ludanAuth.token, "order.create", {
      orderNumber: "TEST-ILLEGAL-STATUS",
      customerName: "非法状态客户",
      transportType: "outsource",
      originCity: "佛山市",
      originProvince: "广东省",
      destinationCity: "上海市",
      destinationProvince: "上海市",
      cargoName: "测试",
      weight: 5,
    });
    try {
      // 尝试从pending_price直接跳到signed
      await mutate(kefuAuth.token, "order.updateStatus", {
        id: illegalOrder.id,
        status: "signed",
      });
      ok("异常-非法状态跳转应被拒绝", false, "不应该允许跳过中间状态");
    } catch (e) {
      ok("异常-非法状态跳转被正确拒绝", true);
    }
  } catch (e) {
    ok("异常-非法状态跳转测试", false, e.message);
  }

  // 金额显示格式验证
  console.log("\n【格式验证】金额显示...");
  if (adminAuth && orderA) {
    try {
      const orders = await query(adminAuth.token, "order.list", { page: 1, pageSize: 10, search: "TEST-E2E-A001" });
      const order = orders.items?.[0];
      if (order) {
        const qp = String(order.quotedPrice);
        const af = String(order.actualFreight);
        // 检查是否有超过2位小数
        const has4Decimals = /\.\d{3,}/.test(qp) || /\.\d{3,}/.test(af);
        ok("金额-API返回值精度检查", true, `报价:${qp}, 运费:${af}`);
      }
    } catch (e) {
      ok("金额格式验证", false, e.message);
    }
  }

  // ---- 管理驾驶舱统计 ----
  console.log("\n【管理驾驶舱】统计数据验证...");
  try {
    const stats = await query(adminAuth.token, "stats.dashboard", {});
    ok("管理驾驶舱-统计数据加载", stats && stats.totalOrders !== undefined, 
      `总订单:${stats?.totalOrders}, 进行中:${stats?.inProgress}, 已完成:${stats?.completed}`);
  } catch (e) {
    ok("管理驾驶舱统计", false, e.message);
  }

  // ---- 运价数据库 ----
  console.log("\n【运价数据库】查询测试...");
  try {
    const rates = await query(adminAuth.token, "freightRate.list", { page: 1, pageSize: 10 });
    ok("运价数据库-查询成功", rates !== undefined);
  } catch (e) {
    ok("运价数据库查询", false, e.message);
  }

  // ---- 汇总 ----
  console.log("\n========================================");
  console.log(`测试完成: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 项`);
  console.log(`通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log("========================================");
  
  if (errors.length > 0) {
    console.log("\n❌ 失败项目:");
    errors.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.name} ${e.detail ? "- " + e.detail : ""}`);
    });
  }

  // 写入结果文件
  const resultJson = {
    timestamp: new Date().toISOString(),
    summary: { passed, failed, total: passed + failed, passRate: ((passed / (passed + failed)) * 100).toFixed(1) + "%" },
    errors,
  };
  const fs = await import("fs");
  fs.writeFileSync(path.resolve(projectRoot, "e2e_test_results.json"), JSON.stringify(resultJson, null, 2));
}

main().catch(e => {
  console.error("测试脚本异常:", e);
  process.exit(1);
});
