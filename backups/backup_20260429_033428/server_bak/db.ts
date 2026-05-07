import { eq, and, inArray, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, rolePermissions, customers, warehouses, freightStations, vehicles, drivers, departments, cargoTypes, dispatcherRegions, systemConfig, type InsertCustomer, type InsertWarehouse, type InsertFreightStation, type InsertVehicle, type InsertDriver, type InsertDepartment, type InsertCargoType, type InsertDispatcherRegion } from "../drizzle/schema";
import { ENV } from './_core/env';
import * as schema from "../drizzle/schema";
import { DEFAULT_ROLE_PERMISSIONS, type PermissionKey } from "@shared/permissions";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "phone"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    const existingUser = await getUserByOpenId(user.openId);

    if (existingUser) {
      await db.update(users).set(updateSet).where(eq(users.id, existingUser.id));
      return;
    }

    await db.insert(users).values(values);
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============================================================
// 权限查询
// ============================================================

// 内存缓存权限数据（5分钟过期）
let permissionCache: Map<string, { perms: string[]; expiry: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

export async function getUserPermissions(role: string): Promise<string[]> {
  const now = Date.now();
  const cached = permissionCache.get(role);
  if (cached && cached.expiry > now) {
    return cached.perms;
  }

  const db = await getDb();
  if (!db) {
    // 数据库不可用时使用默认权限
    return DEFAULT_ROLE_PERMISSIONS[role] ?? [];
  }

  try {
    const rows = await db.select().from(rolePermissions).where(eq(rolePermissions.role, role));
    if (rows.length === 0) {
      // 数据库中没有配置，使用默认权限
      const defaults = DEFAULT_ROLE_PERMISSIONS[role] ?? [];
      permissionCache.set(role, { perms: defaults, expiry: now + CACHE_TTL });
      return defaults;
    }
    const perms = rows.filter(r => r.allowed).map(r => r.permissionKey);
    permissionCache.set(role, { perms, expiry: now + CACHE_TTL });
    return perms;
  } catch (error) {
    console.warn("[Permission] Failed to query permissions, using defaults:", error);
    return DEFAULT_ROLE_PERMISSIONS[role] ?? [];
  }
}

export function clearPermissionCache() {
  permissionCache.clear();
}

// ============================================================
// 客户管理
// ============================================================

export async function listCustomers(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  if (activeOnly) {
    return db.select().from(customers).where(eq(customers.isActive, true));
  }
  return db.select().from(customers);
}

export async function getCustomerById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return rows[0];
}

export async function createCustomer(data: Omit<InsertCustomer, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const result = await db.insert(customers).values(data);
  return result[0].insertId;
}

export async function updateCustomer(id: number, data: Partial<InsertCustomer>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(customers).set(data).where(eq(customers.id, id));
}

// ============================================================
// 仓库管理
// ============================================================

export async function listWarehouses(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  if (activeOnly) {
    return db.select().from(warehouses).where(eq(warehouses.isActive, true));
  }
  return db.select().from(warehouses);
}

export async function createWarehouse(data: Omit<InsertWarehouse, 'id' | 'createdAt'>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const result = await db.insert(warehouses).values(data);
  return result[0].insertId;
}

export async function updateWarehouse(id: number, data: Partial<InsertWarehouse>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(warehouses).set(data).where(eq(warehouses.id, id));
}

// ============================================================
// 货站管理
// ============================================================

export async function listFreightStations(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  if (activeOnly) {
    return db.select().from(freightStations).where(eq(freightStations.isActive, true));
  }
  return db.select().from(freightStations);
}

export async function findFreightStationByName(name: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(freightStations).where(eq(freightStations.name, name)).limit(1);
  return rows[0] ?? null;
}

export async function createFreightStation(data: Omit<InsertFreightStation, 'id' | 'createdAt'>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const result = await db.insert(freightStations).values(data);
  return result[0].insertId;
}

export async function updateFreightStation(id: number, data: Partial<InsertFreightStation>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(freightStations).set(data).where(eq(freightStations.id, id));
}

// ============================================================
// 车辆管理
// ============================================================

export async function listVehicles(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  if (activeOnly) {
    return db.select().from(vehicles).where(eq(vehicles.isActive, true));
  }
  return db.select().from(vehicles);
}

export async function createVehicle(data: Omit<InsertVehicle, 'id' | 'createdAt'>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const result = await db.insert(vehicles).values(data);
  return result[0].insertId;
}

export async function updateVehicle(id: number, data: Partial<InsertVehicle>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(vehicles).set(data).where(eq(vehicles.id, id));
}

export async function findVehicleByPlate(plateNumber: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(vehicles).where(eq(vehicles.plateNumber, plateNumber)).limit(1);
  return rows[0] || null;
}

export async function searchVehiclesByPlatePrefix(prefix: string, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  const vehicleRows = await db.select().from(vehicles)
    .where(and(like(vehicles.plateNumber, `${prefix}%`), eq(vehicles.isActive, true)))
    .limit(limit);
  // 为每个车辆查找关联司机
  const results = [];
  for (const v of vehicleRows) {
    let driver = null;
    if (v.driverId) {
      const driverRows = await db.select().from(drivers).where(eq(drivers.id, v.driverId)).limit(1);
      driver = driverRows[0] || null;
    }
    if (!driver) {
      const driverRows = await db.select().from(drivers).where(eq(drivers.commonPlateNumber, v.plateNumber)).limit(1);
      driver = driverRows[0] || null;
    }
    results.push({
      plateNumber: v.plateNumber,
      vehicleType: v.vehicleType,
      model: v.model,
      capacity: v.capacity,
      driverName: driver?.name || null,
      driverPhone: driver?.phone || null,
      recentUseCount: 0,
    });
  }
  return results;
}

// 查询最近30天内常用车辆（按使用次数排序）
export async function getRecentlyUsedVehicles(limit = 5) {
  const db = await getDb();
  if (!db) return [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // 从订单表中统计最近30天内使用过的车牌号
  const rows = await db.execute(sql`
    SELECT plateNumber, COUNT(*) as useCount
    FROM orders
    WHERE plateNumber IS NOT NULL AND plateNumber != ''
      AND updatedAt >= ${thirtyDaysAgo}
    GROUP BY plateNumber
    ORDER BY useCount DESC
    LIMIT ${limit}
  `);
  const recentPlates: { plateNumber: string; useCount: number }[] = [];
  for (const row of (rows as any)[0] || []) {
    recentPlates.push({ plateNumber: row.plateNumber, useCount: Number(row.useCount) });
  }
  // 为每个常用车牌查找车辆和司机信息
  const results = [];
  for (const rp of recentPlates) {
    const vRows = await db.select().from(vehicles).where(eq(vehicles.plateNumber, rp.plateNumber)).limit(1);
    const v = vRows[0];
    if (!v) continue;
    let driver = null;
    if (v.driverId) {
      const driverRows = await db.select().from(drivers).where(eq(drivers.id, v.driverId)).limit(1);
      driver = driverRows[0] || null;
    }
    if (!driver) {
      const driverRows = await db.select().from(drivers).where(eq(drivers.commonPlateNumber, v.plateNumber)).limit(1);
      driver = driverRows[0] || null;
    }
    results.push({
      plateNumber: v.plateNumber,
      vehicleType: v.vehicleType,
      model: v.model,
      capacity: v.capacity,
      driverName: driver?.name || null,
      driverPhone: driver?.phone || null,
      recentUseCount: rp.useCount,
    });
  }
  return results;
}

export async function findDriverByPlate(plateNumber: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(drivers).where(eq(drivers.commonPlateNumber, plateNumber)).limit(1);
  return rows[0] || null;
}

export async function findDriverByNamePhone(name: string, phone?: string) {
  const db = await getDb();
  if (!db) return null;
  const conditions = [eq(drivers.name, name)];
  if (phone) conditions.push(eq(drivers.phone, phone));
  const rows = await db.select().from(drivers).where(and(...conditions)).limit(1);
  return rows[0] || null;
}
// ============================================================
// 司机管理
// =============================================================

export async function listDrivers(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  if (activeOnly) {
    return db.select().from(drivers).where(eq(drivers.isActive, true));
  }
  return db.select().from(drivers);
}

export async function createDriver(data: Omit<InsertDriver, 'id' | 'createdAt'>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const result = await db.insert(drivers).values(data);
  return result[0].insertId;
}

export async function updateDriver(id: number, data: Partial<InsertDriver>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(drivers).set(data).where(eq(drivers.id, id));
}

// ============================================================
// 业务部门配置
// ============================================================

export async function listDepartments(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  if (activeOnly) {
    return db.select().from(departments).where(eq(departments.isActive, true));
  }
  return db.select().from(departments);
}

export async function createDepartment(data: Omit<InsertDepartment, 'id' | 'createdAt'>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const result = await db.insert(departments).values(data);
  return result[0].insertId;
}

export async function updateDepartment(id: number, data: Partial<InsertDepartment>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(departments).set(data).where(eq(departments.id, id));
}

// ============================================================
// 货物类型配置
// ============================================================

export async function listCargoTypes(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  if (activeOnly) {
    return db.select().from(cargoTypes).where(eq(cargoTypes.isActive, true));
  }
  return db.select().from(cargoTypes);
}

export async function createCargoType(data: Omit<InsertCargoType, 'id' | 'createdAt'>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const result = await db.insert(cargoTypes).values(data);
  return result[0].insertId;
}

export async function updateCargoType(id: number, data: Partial<InsertCargoType>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(cargoTypes).set(data).where(eq(cargoTypes.id, id));
}

// ============================================================
// 调度员区域配置
// ============================================================

export async function listDispatcherRegions() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: dispatcherRegions.id,
      dispatcherId: dispatcherRegions.dispatcherId,
      province: dispatcherRegions.province,
      city: dispatcherRegions.city,
      priority: dispatcherRegions.priority,
      createdAt: dispatcherRegions.createdAt,
      dispatcherName: users.name,
    })
    .from(dispatcherRegions)
    .leftJoin(users, eq(dispatcherRegions.dispatcherId, users.id));
  return rows;
}

export async function createDispatcherRegion(data: Omit<InsertDispatcherRegion, 'id' | 'createdAt'>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const result = await db.insert(dispatcherRegions).values(data);
  return result[0].insertId;
}

export async function updateDispatcherRegion(id: number, data: Partial<InsertDispatcherRegion>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(dispatcherRegions).set(data).where(eq(dispatcherRegions.id, id));
}

export async function deleteDispatcherRegion(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(dispatcherRegions).where(eq(dispatcherRegions.id, id));
}

// ============================================================
// 用户管理
// ============================================================

export async function listUsers(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  if (activeOnly) {
    return db.select().from(users).where(eq(users.isActive, true));
  }
  return db.select().from(users);
}

export async function updateUserRole(id: number, role: string) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(users).set({ role: role as any }).where(eq(users.id, id));
}

export async function updateUserInfo(id: number, data: { name?: string | null; phone?: string | null; region?: string | null; isActive?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(users).set(data).where(eq(users.id, id));
}

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createUserWithPassword(data: {
  username: string;
  passwordHash: string;
  name: string;
  role: string;
  phone?: string;
  region?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const openId = `local_${data.username}_${Date.now()}`;
  const result = await db.insert(users).values({
    openId,
    username: data.username,
    passwordHash: data.passwordHash,
    name: data.name,
    role: data.role as any,
    phone: data.phone ?? null,
    region: data.region ?? null,
    loginMethod: 'password',
  });
  return result[0].insertId;
}

export async function updateUserPassword(id: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));
}

export async function updateUserOpenId(id: number, openId: string) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(users).set({ openId }).where(eq(users.id, id));
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============================================================
// 角色权限配置
// ============================================================

export async function listRolePermissions(role: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(rolePermissions).where(eq(rolePermissions.role, role));
}

export async function saveRolePermissions(role: string, permissions: { key: string; allowed: boolean }[], updatedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  // 删除旧配置
  await db.delete(rolePermissions).where(eq(rolePermissions.role, role));
  // 插入新配置
  if (permissions.length > 0) {
    await db.insert(rolePermissions).values(
      permissions.map(p => ({
        role,
        permissionKey: p.key,
        allowed: p.allowed,
        updatedBy,
      }))
    );
  }
  // 清除缓存
  clearPermissionCache();
}

// ============================================================
// 操作日志
// ============================================================

export async function createOperationLog(data: {
  userId?: number;
  userName?: string;
  action: string;
  targetType: string;
  targetId?: string;
  changes?: unknown;
  ipAddress?: string;
  description?: string;
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[Log] Cannot write log: database not available");
    return;
  }
  try {
    await db.insert(schema.operationLogs).values(data);
  } catch (error) {
    console.error("[Log] Failed to write operation log:", error);
  }
}


// ============================================================
// 删除函数（单条 + 批量）
// ============================================================

export async function deleteOrder(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(schema.orders).where(eq(schema.orders.id, id));
  return true;
}

export async function deleteOrdersBatch(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (ids.length === 0) return 0;
  await db.delete(schema.orders).where(inArray(schema.orders.id, ids));
  return ids.length;
}

export async function deleteCustomer(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(schema.customers).where(eq(schema.customers.id, id));
}

export async function deleteCustomersBatch(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (ids.length === 0) return;
  await db.delete(schema.customers).where(inArray(schema.customers.id, ids));
}

export async function deleteWarehouse(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(schema.warehouses).where(eq(schema.warehouses.id, id));
}

export async function deleteWarehousesBatch(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (ids.length === 0) return;
  await db.delete(schema.warehouses).where(inArray(schema.warehouses.id, ids));
}

export async function deleteFreightStation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(schema.freightStations).where(eq(schema.freightStations.id, id));
}

export async function deleteFreightStationsBatch(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (ids.length === 0) return;
  await db.delete(schema.freightStations).where(inArray(schema.freightStations.id, ids));
}

export async function deleteVehicle(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(schema.vehicles).where(eq(schema.vehicles.id, id));
}

export async function deleteVehiclesBatch(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (ids.length === 0) return;
  await db.delete(schema.vehicles).where(inArray(schema.vehicles.id, ids));
}

export async function deleteDriver(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(schema.drivers).where(eq(schema.drivers.id, id));
}

export async function deleteDriversBatch(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (ids.length === 0) return;
  await db.delete(schema.drivers).where(inArray(schema.drivers.id, ids));
}

export async function deleteDepartment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(schema.departments).where(eq(schema.departments.id, id));
}

export async function deleteDepartmentsBatch(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (ids.length === 0) return;
  await db.delete(schema.departments).where(inArray(schema.departments.id, ids));
}

export async function deleteCargoType(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(schema.cargoTypes).where(eq(schema.cargoTypes.id, id));
}

export async function deleteCargoTypesBatch(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (ids.length === 0) return;
  await db.delete(schema.cargoTypes).where(inArray(schema.cargoTypes.id, ids));
}

export async function deletePodRecord(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(schema.podRecords).where(eq(schema.podRecords.id, id));
}

export async function deletePodRecordsBatch(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (ids.length === 0) return;
  await db.delete(schema.podRecords).where(inArray(schema.podRecords.id, ids));
}

export async function deleteLtlInquiry(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(schema.ltlInquiries).where(eq(schema.ltlInquiries.id, id));
}

export async function deleteLtlInquiriesBatch(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (ids.length === 0) return;
  await db.delete(schema.ltlInquiries).where(inArray(schema.ltlInquiries.id, ids));
}

// ============================================================
// 批量导入函数
// ============================================================

export async function batchImportCustomers(items: Omit<InsertCustomer, 'id' | 'createdAt' | 'updatedAt'>[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (items.length === 0) return { count: 0 };
  await db.insert(customers).values(items);
  return { count: items.length };
}

export async function batchImportWarehouses(items: Omit<InsertWarehouse, 'id' | 'createdAt'>[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (items.length === 0) return { count: 0 };
  await db.insert(warehouses).values(items);
  return { count: items.length };
}

export async function batchImportFreightStations(items: Omit<InsertFreightStation, 'id' | 'createdAt'>[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (items.length === 0) return { count: 0 };
  await db.insert(freightStations).values(items);
  return { count: items.length };
}

export async function batchImportVehicles(items: Omit<InsertVehicle, 'id' | 'createdAt'>[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (items.length === 0) return { count: 0 };
  await db.insert(vehicles).values(items);
  return { count: items.length };
}

export async function batchImportDrivers(items: Omit<InsertDriver, 'id' | 'createdAt'>[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (items.length === 0) return { count: 0 };
  await db.insert(drivers).values(items);
  return { count: items.length };
}

export async function batchImportDepartments(items: Omit<InsertDepartment, 'id' | 'createdAt'>[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (items.length === 0) return { count: 0 };
  await db.insert(departments).values(items);
  return { count: items.length };
}

export async function batchImportCargoTypes(items: Omit<InsertCargoType, 'id' | 'createdAt'>[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (items.length === 0) return { count: 0 };
  await db.insert(cargoTypes).values(items);
  return { count: items.length };
}

export async function batchImportDispatcherRegions(items: Omit<InsertDispatcherRegion, 'id' | 'createdAt'>[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (items.length === 0) return { count: 0 };
  await db.insert(dispatcherRegions).values(items);
  return { count: items.length };
}

export async function deleteDispatcherRegionsBatch(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  if (ids.length === 0) return;
  await db.delete(dispatcherRegions).where(inArray(dispatcherRegions.id, ids));
}


// ============================================================
// 系统配置 helpers
// ============================================================

export async function getSystemConfig(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(systemConfig).where(eq(systemConfig.configKey, key)).limit(1);
  return rows[0]?.configValue ?? null;
}

export async function getSystemConfigWithDefault(key: string, defaultValue: string): Promise<string> {
  const val = await getSystemConfig(key);
  return val ?? defaultValue;
}

export async function getAllSystemConfigs(): Promise<Array<{ id: number; configKey: string; configValue: string; description: string | null; updatedByName: string | null; updatedAt: Date }>> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(systemConfig).orderBy(systemConfig.configKey);
}

export async function upsertSystemConfig(key: string, value: string, description: string | null, userId: number, userName: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const existing = await db.select().from(systemConfig).where(eq(systemConfig.configKey, key)).limit(1);
  if (existing.length > 0) {
    await db.update(systemConfig).set({
      configValue: value,
      description,
      updatedById: userId,
      updatedByName: userName,
    }).where(eq(systemConfig.configKey, key));
  } else {
    await db.insert(systemConfig).values({
      configKey: key,
      configValue: value,
      description,
      updatedById: userId,
      updatedByName: userName,
    });
  }
}

// 预警阈值配置 key 常量
export const CONFIG_KEYS = {
  BACKLOG_YELLOW: "backlog_threshold_yellow",
  BACKLOG_ORANGE: "backlog_threshold_orange",
  BACKLOG_RED: "backlog_threshold_red",
  POD_OVERDUE_YELLOW: "pod_overdue_threshold_yellow",
  POD_OVERDUE_ORANGE: "pod_overdue_threshold_orange",
  POD_OVERDUE_RED: "pod_overdue_threshold_red",
} as const;

export const DEFAULT_THRESHOLDS = {
  [CONFIG_KEYS.BACKLOG_YELLOW]: "5",
  [CONFIG_KEYS.BACKLOG_ORANGE]: "10",
  [CONFIG_KEYS.BACKLOG_RED]: "15",
  [CONFIG_KEYS.POD_OVERDUE_YELLOW]: "5",
  [CONFIG_KEYS.POD_OVERDUE_ORANGE]: "15",
  [CONFIG_KEYS.POD_OVERDUE_RED]: "15",
} as const;

export async function getThreshold(key: string): Promise<number> {
  const val = await getSystemConfig(key);
  const defaultVal = (DEFAULT_THRESHOLDS as Record<string, string>)[key] ?? "5";
  const num = val ? parseInt(val, 10) : parseInt(defaultVal, 10);
  return isNaN(num) ? parseInt(defaultVal, 10) : num;
}


/**
 * 获取最近使用的货站（基于订单表中freightStationName的使用频率）
 */
export async function getRecentlyUsedStations(limit = 8) {
  const db = await getDb();
  if (!db) return [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db.execute(sql`
    SELECT freightStationName, COUNT(*) as useCount
    FROM orders
    WHERE freightStationName IS NOT NULL AND freightStationName != ''
      AND updatedAt >= ${thirtyDaysAgo}
    GROUP BY freightStationName
    ORDER BY useCount DESC
    LIMIT ${limit}
  `);
  const results: { name: string; useCount: number; phone: string | null }[] = [];
  for (const row of (rows as any)[0] || []) {
    // 尝试从货站表中获取电话信息
    const stationRows = await db.select().from(freightStations).where(eq(freightStations.name, row.freightStationName)).limit(1);
    const station = stationRows[0];
    results.push({
      name: row.freightStationName,
      useCount: Number(row.useCount),
      phone: station?.phone || null,
    });
  }
  return results;
}


/**
 * 获取货站平均净单价
 * 净单价 = (实际运费 - 其他费用 - 送货费) / 货物重量
 * 只统计最近90天有完整费用和重量数据的零担订单
 */
export async function getStationAvgPrices(stationNames: string[]) {
  const db = await getDb();
  if (!db || stationNames.length === 0) return [];
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  
  // Build SQL with template literals for proper parameter binding
  const inClause = stationNames.map(n => sql`${n}`).reduce((acc, cur, i) => i === 0 ? cur : sql`${acc}, ${cur}`);
  
  const rows = await db.execute(sql`
    SELECT 
      freightStationName,
      COUNT(*) as orderCount,
      AVG(
        (COALESCE(CAST(actualFreight AS DECIMAL(14,4)), 0) 
         - COALESCE(CAST(extraFee AS DECIMAL(14,4)), 0) 
         - COALESCE(CAST(deliveryFee AS DECIMAL(14,4)), 0))
        / NULLIF(CAST(weight AS DECIMAL(10,3)), 0)
      ) as avgNetUnitPrice
    FROM orders
    WHERE freightStationName IN (${inClause})
      AND updatedAt >= ${ninetyDaysAgo}
      AND weight IS NOT NULL AND CAST(weight AS DECIMAL(10,3)) > 0
      AND actualFreight IS NOT NULL AND CAST(actualFreight AS DECIMAL(14,4)) > 0
      AND businessType = 'ltl'
    GROUP BY freightStationName
  `);
  const results: { stationName: string; avgNetUnitPrice: number; orderCount: number }[] = [];
  for (const row of (rows as any)[0] || []) {
    const price = Number(row.avgNetUnitPrice);
    if (!isNaN(price) && price > 0) {
      results.push({
        stationName: row.freightStationName,
        avgNetUnitPrice: Math.round(price * 100) / 100, // 保留2位小数
        orderCount: Number(row.orderCount),
      });
    }
  }
  return results;
}
