/**
 * 基础配置管理路由
 * 客户/仓库/货站/车辆/司机/部门/货物类型/调度员区域配置
 */
import { z } from "zod";
import { router } from "../_core/trpc";
import { protectedProcedure } from "../_core/trpc";
import { permissionProcedure } from "../_core/trpc";
import { PERMISSIONS } from "@shared/permissions";
import * as db from "../db";

// ============================================================
// 客户管理
// ============================================================
export const customerRouter = router({
  list: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().default(true) }).optional())
    .query(async ({ input }) => {
      return db.listCustomers(input?.activeOnly ?? true);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return db.getCustomerById(input.id);
    }),

  create: permissionProcedure(PERMISSIONS.CONFIG_CUSTOMER)
    .input(z.object({
      name: z.string().min(1, "客户名称不能为空"),
      phone: z.string().optional(),
      salesperson: z.string().optional(),
      settlementType: z.enum(["monthly", "cash", "collect"]).default("monthly"),
      department: z.string().optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await db.createCustomer(input);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "create",
        targetType: "customer",
        targetId: String(id),
        changes: input,
        description: `创建客户: ${input.name}`,
      });
      return { id };
    }),

  update: permissionProcedure(PERMISSIONS.CONFIG_CUSTOMER)
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      phone: z.string().optional(),
      salesperson: z.string().optional(),
      settlementType: z.enum(["monthly", "cash", "collect"]).optional(),
      department: z.string().optional(),
      remarks: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await db.updateCustomer(id, data);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "update",
        targetType: "customer",
        targetId: String(id),
        changes: data,
        description: `更新客户信息: ID=${id}`,
      });
      return { success: true };
    }),

  delete: permissionProcedure(PERMISSIONS.CONFIG_CUSTOMER)
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteCustomer(input.id);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "delete", targetType: "customer", targetId: String(input.id), description: `删除客户 ID=${input.id}` });
      return { success: true };
    }),

  batchDelete: permissionProcedure(PERMISSIONS.CONFIG_CUSTOMER)
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteCustomersBatch(input.ids);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "delete", targetType: "customer", targetId: input.ids.join(","), description: `批量删除 ${input.ids.length} 个客户` });
      return { success: true, count: input.ids.length };
    }),

  batchImport: permissionProcedure(PERMISSIONS.CONFIG_CUSTOMER)
    .input(z.object({
      items: z.array(z.object({
        name: z.string().min(1, "客户名称不能为空"),
        phone: z.string().optional(),
        salesperson: z.string().optional(),
        settlementType: z.enum(["monthly", "cash", "collect"]).default("monthly"),
        department: z.string().optional(),
        remarks: z.string().optional(),
      })).min(1, "至少导入一条数据"),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await db.batchImportCustomers(input.items);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "create", targetType: "customer", targetId: "batch", description: `批量导入 ${result.count} 个客户` });
      return { success: true, count: result.count };
    }),
});

// ============================================================
// 仓库管理
// ============================================================
export const warehouseRouter = router({
  list: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().default(true) }).optional())
    .query(async ({ input }) => {
      return db.listWarehouses(input?.activeOnly ?? true);
    }),

  create: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({
      name: z.string().min(1, "仓库名称不能为空"),
      city: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await db.createWarehouse(input);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "create",
        targetType: "warehouse",
        targetId: String(id),
        changes: input,
        description: `创建仓库: ${input.name}`,
      });
      return { id };
    }),

  update: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      city: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await db.updateWarehouse(id, data);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "update",
        targetType: "warehouse",
        targetId: String(id),
        changes: data,
      });
      return { success: true };
    }),

  delete: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteWarehouse(input.id);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "delete", targetType: "warehouse", targetId: String(input.id), description: `删除仓库 ID=${input.id}` });
      return { success: true };
    }),

  batchDelete: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteWarehousesBatch(input.ids);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "delete", targetType: "warehouse", targetId: input.ids.join(","), description: `批量删除 ${input.ids.length} 个仓库` });
      return { success: true, count: input.ids.length };
    }),

  batchImport: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({
      items: z.array(z.object({
        name: z.string().min(1, "仓库名称不能为空"),
        city: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
      })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await db.batchImportWarehouses(input.items);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "create", targetType: "warehouse", targetId: "batch", description: `批量导入 ${result.count} 个仓库` });
      return { success: true, count: result.count };
    }),
});

// ============================================================
// 货站管理
// ============================================================
export const freightStationRouter = router({
  list: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().default(true) }).optional())
    .query(async ({ input }) => {
      return db.listFreightStations(input?.activeOnly ?? true);
    }),

  create: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({
      name: z.string().min(1, "货站名称不能为空"),
      address: z.string().optional(),
      phone: z.string().optional(),
      contactPerson: z.string().optional(),
      coverageArea: z.string().optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await db.createFreightStation(input);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "create",
        targetType: "freight_station",
        targetId: String(id),
        changes: input,
        description: `创建货站: ${input.name}`,
      });
      return { id };
    }),

  update: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      contactPerson: z.string().optional(),
      coverageArea: z.string().optional(),
      remarks: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await db.updateFreightStation(id, data);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "update",
        targetType: "freight_station",
        targetId: String(id),
        changes: data,
      });
      return { success: true };
    }),

  delete: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteFreightStation(input.id);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "delete", targetType: "freight_station", targetId: String(input.id), description: `删除货站 ID=${input.id}` });
      return { success: true };
    }),

  batchDelete: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteFreightStationsBatch(input.ids);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "delete", targetType: "freight_station", targetId: input.ids.join(","), description: `批量删除 ${input.ids.length} 个货站` });
      return { success: true, count: input.ids.length };
    }),

  batchImport: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({
      items: z.array(z.object({
        name: z.string().min(1, "货站名称不能为空"),
        address: z.string().optional(),
        phone: z.string().optional(),
        contactPerson: z.string().optional(),
        coverageArea: z.string().optional(),
        remarks: z.string().optional(),
      })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await db.batchImportFreightStations(input.items);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "create", targetType: "freight_station", targetId: "batch", description: `批量导入 ${result.count} 个货站` });
      return { success: true, count: result.count };
    }),

  getRecentlyUsed: protectedProcedure
    .input(z.object({ limit: z.number().default(8) }).optional())
    .query(async ({ input }) => {
      return db.getRecentlyUsedStations(input?.limit ?? 8);
    }),

  getAvgPrices: protectedProcedure
    .input(z.object({ stationNames: z.array(z.string()).min(1) }))
    .query(async ({ input }) => {
      return db.getStationAvgPrices(input.stationNames);
    }),
});

// ============================================================
// 车辆管理
// ============================================================
export const vehicleRouter = router({
  list: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().default(true) }).optional())
    .query(async ({ input }) => {
      return db.listVehicles(input?.activeOnly ?? true);
    }),

  create: permissionProcedure(PERMISSIONS.CONFIG_VEHICLE_DRIVER)
    .input(z.object({
      plateNumber: z.string().min(1, "车牌号不能为空"),
      vehicleType: z.enum(["own", "outsource"]).default("own"),
      model: z.string().optional(),
      capacity: z.string().optional(),
      driverId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await db.createVehicle(input);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "create",
        targetType: "vehicle",
        targetId: String(id),
        changes: input,
        description: `创建车辆: ${input.plateNumber}`,
      });
      return { id };
    }),

  // 根据车牌查找或创建车辆，并自动匹配司机
  lookupByPlate: protectedProcedure
    .input(z.object({
      plateNumber: z.string().min(1, "车牌号不能为空"),
    }))
    .mutation(async ({ input, ctx }) => {
      // 查找已有车辆
      let vehicle = await db.findVehicleByPlate(input.plateNumber);
      let isNew = false;
      if (!vehicle) {
        // 新车牌，自动创建外请车辆
        const id = await db.createVehicle({
          plateNumber: input.plateNumber,
          vehicleType: "outsource",
        });
        vehicle = { id, plateNumber: input.plateNumber, vehicleType: "outsource" as const, status: "available" as const, isActive: true, createdAt: new Date(), model: null, capacity: null, driverId: null };
        isNew = true;
        await db.createOperationLog({
          userId: ctx.user!.id,
          userName: ctx.user!.name ?? undefined,
          action: "create",
          targetType: "vehicle",
          targetId: String(id),
          changes: { plateNumber: input.plateNumber, vehicleType: "outsource" },
          description: `调度时自动创建车辆: ${input.plateNumber}`,
        });
      }
      // 查找关联司机
      let driver = null;
      if (vehicle.driverId) {
        const allDrivers = await db.listDrivers(true);
        driver = allDrivers.find((d: any) => d.id === vehicle!.driverId) || null;
      }
      if (!driver) {
        driver = await db.findDriverByPlate(input.plateNumber);
      }
      return {
        vehicle,
        driver: driver ? { name: driver.name, phone: driver.phone } : null,
        isNew,
      };
    }),

  update: permissionProcedure(PERMISSIONS.CONFIG_VEHICLE_DRIVER)
    .input(z.object({
      id: z.number(),
      plateNumber: z.string().min(1).optional(),
      vehicleType: z.enum(["own", "outsource"]).optional(),
      model: z.string().optional(),
      capacity: z.string().optional(),
      driverId: z.number().optional(),
      status: z.enum(["available", "in_transit", "maintenance", "inactive"]).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await db.updateVehicle(id, data);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "update",
        targetType: "vehicle",
        targetId: String(id),
        changes: data,
      });
      return { success: true };
    }),

  delete: permissionProcedure(PERMISSIONS.CONFIG_VEHICLE_DRIVER)
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteVehicle(input.id);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "delete", targetType: "vehicle", targetId: String(input.id), description: `删除车辆 ID=${input.id}` });
      return { success: true };
    }),

  batchDelete: permissionProcedure(PERMISSIONS.CONFIG_VEHICLE_DRIVER)
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteVehiclesBatch(input.ids);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "delete", targetType: "vehicle", targetId: input.ids.join(","), description: `批量删除 ${input.ids.length} 个车辆` });
      return { success: true, count: input.ids.length };
    }),

  batchImport: permissionProcedure(PERMISSIONS.CONFIG_VEHICLE_DRIVER)
    .input(z.object({
      items: z.array(z.object({
        plateNumber: z.string().min(1, "车牌号不能为空"),
        vehicleType: z.enum(["own", "outsource"]).default("own"),
        model: z.string().optional(),
        capacity: z.string().optional(),
      })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await db.batchImportVehicles(input.items);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "create", targetType: "vehicle", targetId: "batch", description: `批量导入 ${result.count} 个车辆` });
      return { success: true, count: result.count };
    }),

  // 车牌号模糊搜索（自动补全）
  searchByPlatePrefix: protectedProcedure
    .input(z.object({
      prefix: z.string().min(1, "请输入车牌前缀"),
      limit: z.number().min(1).max(20).default(10),
    }))
    .query(async ({ input }) => {
      return db.searchVehiclesByPlatePrefix(input.prefix, input.limit);
    }),

  // 获取最近30天常用车辆（按使用次数排序）
  getRecentlyUsed: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(20).default(5),
    }).optional())
    .query(async ({ input }) => {
      return db.getRecentlyUsedVehicles(input?.limit ?? 5);
    }),
});

// ============================================================
// 司机管理
// ============================================================
export const driverRouter = router({
  list: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().default(true) }).optional())
    .query(async ({ input }) => {
      return db.listDrivers(input?.activeOnly ?? true);
    }),

  create: permissionProcedure(PERMISSIONS.CONFIG_VEHICLE_DRIVER)
    .input(z.object({
      name: z.string().min(1, "司机姓名不能为空"),
      phone: z.string().optional(),
      idCard: z.string().optional(),
      driverType: z.enum(["own", "outsource"]).default("own"),
      commonPlateNumber: z.string().optional(),
      depositAmount: z.string().optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await db.createDriver(input);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "create",
        targetType: "driver",
        targetId: String(id),
        changes: input,
        description: `创建司机: ${input.name}`,
      });
      return { id };
    }),

  update: permissionProcedure(PERMISSIONS.CONFIG_VEHICLE_DRIVER)
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      phone: z.string().optional(),
      idCard: z.string().optional(),
      driverType: z.enum(["own", "outsource"]).optional(),
      commonPlateNumber: z.string().optional(),
      depositAmount: z.string().optional(),
      depositStatus: z.enum(["none", "paid", "refunded"]).optional(),
      remarks: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await db.updateDriver(id, data);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "update",
        targetType: "driver",
        targetId: String(id),
        changes: data,
      });
      return { success: true };
    }),

  delete: permissionProcedure(PERMISSIONS.CONFIG_VEHICLE_DRIVER)
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteDriver(input.id);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "delete", targetType: "driver", targetId: String(input.id), description: `删除司机 ID=${input.id}` });
      return { success: true };
    }),

  batchDelete: permissionProcedure(PERMISSIONS.CONFIG_VEHICLE_DRIVER)
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteDriversBatch(input.ids);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "delete", targetType: "driver", targetId: input.ids.join(","), description: `批量删除 ${input.ids.length} 个司机` });
      return { success: true, count: input.ids.length };
    }),

  batchImport: permissionProcedure(PERMISSIONS.CONFIG_VEHICLE_DRIVER)
    .input(z.object({
      items: z.array(z.object({
        name: z.string().min(1, "司机姓名不能为空"),
        phone: z.string().optional(),
        idCard: z.string().optional(),
        driverType: z.enum(["own", "outsource"]).default("own"),
        commonPlateNumber: z.string().optional(),
        depositAmount: z.string().optional(),
        remarks: z.string().optional(),
      })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await db.batchImportDrivers(input.items);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "create", targetType: "driver", targetId: "batch", description: `批量导入 ${result.count} 个司机` });
      return { success: true, count: result.count };
    }),
});

// ============================================================
// 业务部门配置
// ============================================================
export const departmentRouter = router({
  list: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().default(true) }).optional())
    .query(async ({ input }) => {
      return db.listDepartments(input?.activeOnly ?? true);
    }),

  create: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({
      name: z.string().min(1, "部门名称不能为空"),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await db.createDepartment(input);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "create",
        targetType: "department",
        targetId: String(id),
        changes: input,
        description: `创建部门: ${input.name}`,
      });
      return { id };
    }),

  update: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await db.updateDepartment(id, data);
      return { success: true };
    }),

  delete: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteDepartment(input.id);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "delete", targetType: "department", targetId: String(input.id), description: `删除部门 ID=${input.id}` });
      return { success: true };
    }),

  batchDelete: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteDepartmentsBatch(input.ids);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "delete", targetType: "department", targetId: input.ids.join(","), description: `批量删除 ${input.ids.length} 个部门` });
      return { success: true, count: input.ids.length };
    }),

  batchImport: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({
      items: z.array(z.object({
        name: z.string().min(1, "部门名称不能为空"),
      })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await db.batchImportDepartments(input.items);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "create", targetType: "department", targetId: "batch", description: `批量导入 ${result.count} 个部门` });
      return { success: true, count: result.count };
    }),
});

// ============================================================
// 货物类型配置
// ============================================================
export const cargoTypeRouter = router({
  list: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().default(true) }).optional())
    .query(async ({ input }) => {
      return db.listCargoTypes(input?.activeOnly ?? true);
    }),

  create: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({
      name: z.string().min(1, "货物类型名称不能为空"),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await db.createCargoType(input);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "create",
        targetType: "cargo_type",
        targetId: String(id),
        changes: input,
        description: `创建货物类型: ${input.name}`,
      });
      return { id };
    }),

  update: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await db.updateCargoType(id, data);
      return { success: true };
    }),

  delete: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteCargoType(input.id);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "delete", targetType: "cargo_type", targetId: String(input.id), description: `删除货物类型 ID=${input.id}` });
      return { success: true };
    }),

  batchDelete: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteCargoTypesBatch(input.ids);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "delete", targetType: "cargo_type", targetId: input.ids.join(","), description: `批量删除 ${input.ids.length} 个货物类型` });
      return { success: true, count: input.ids.length };
    }),

  batchImport: permissionProcedure(PERMISSIONS.CONFIG_WAREHOUSE)
    .input(z.object({
      items: z.array(z.object({
        name: z.string().min(1, "货物类型名称不能为空"),
      })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await db.batchImportCargoTypes(input.items);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "create", targetType: "cargo_type", targetId: "batch", description: `批量导入 ${result.count} 个货物类型` });
      return { success: true, count: result.count };
    }),
});

// ============================================================
// 调度员区域配置
// ============================================================
export const dispatcherRegionRouter = router({
  list: protectedProcedure
    .query(async () => {
      return db.listDispatcherRegions();
    }),

  create: permissionProcedure(PERMISSIONS.CONFIG_DISPATCHER_REGION)
    .input(z.object({
      dispatcherId: z.number(),
      province: z.string().min(1, "省份不能为空"),
      city: z.string().optional(),
      priority: z.number().default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await db.createDispatcherRegion(input);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "create",
        targetType: "dispatcher_region",
        targetId: String(id),
        changes: input,
        description: `创建调度员区域配置`,
      });
      return { id };
    }),

  update: permissionProcedure(PERMISSIONS.CONFIG_DISPATCHER_REGION)
    .input(z.object({
      id: z.number(),
      dispatcherId: z.number().optional(),
      province: z.string().min(1).optional(),
      city: z.string().optional(),
      priority: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await db.updateDispatcherRegion(id, data);
      return { success: true };
    }),

  delete: permissionProcedure(PERMISSIONS.CONFIG_DISPATCHER_REGION)
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteDispatcherRegion(input.id);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "delete",
        targetType: "dispatcher_region",
        targetId: String(input.id),
        description: `删除调度员区域配置`,
      });
      return { success: true };
    }),

  batchDelete: permissionProcedure(PERMISSIONS.CONFIG_DISPATCHER_REGION)
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteDispatcherRegionsBatch(input.ids);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "delete", targetType: "dispatcher_region", targetId: input.ids.join(","), description: `批量删除 ${input.ids.length} 个区域配置` });
      return { success: true, count: input.ids.length };
    }),

  batchImport: permissionProcedure(PERMISSIONS.CONFIG_DISPATCHER_REGION)
    .input(z.object({
      items: z.array(z.object({
        dispatcherId: z.number(),
        province: z.string().min(1, "省份不能为空"),
        city: z.string().optional(),
        priority: z.number().default(0),
      })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await db.batchImportDispatcherRegions(input.items);
      await db.createOperationLog({ userId: ctx.user!.id, userName: ctx.user!.name ?? undefined, action: "create", targetType: "dispatcher_region", targetId: "batch", description: `批量导入 ${result.count} 个区域配置` });
      return { success: true, count: result.count };
    }),
});

// ============================================================
// 用户管理
// ============================================================
export const userRouter = router({
  list: permissionProcedure(PERMISSIONS.CONFIG_USER)
    .input(z.object({ activeOnly: z.boolean().default(true) }).optional())
    .query(async ({ input }) => {
      return db.listUsers(input?.activeOnly ?? true);
    }),

  updateRole: permissionProcedure(PERMISSIONS.CONFIG_USER)
    .input(z.object({
      id: z.number(),
      role: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.updateUserRole(input.id, input.role);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "update",
        targetType: "user",
        targetId: String(input.id),
        changes: { role: input.role },
        description: `更新用户角色: ID=${input.id} -> ${input.role}`,
      });
      return { success: true };
    }),

  updateInfo: permissionProcedure(PERMISSIONS.CONFIG_USER)
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      phone: z.string().optional(),
      region: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await db.updateUserInfo(id, data);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "update",
        targetType: "user",
        targetId: String(id),
        changes: data,
      });
      return { success: true };
    }),
});

// ============================================================
// 角色权限配置
// ============================================================
export const permissionRouter = router({
  listForRole: permissionProcedure(PERMISSIONS.CONFIG_PERMISSION)
    .input(z.object({ role: z.string() }))
    .query(async ({ input }) => {
      return db.listRolePermissions(input.role);
    }),

  save: permissionProcedure(PERMISSIONS.CONFIG_PERMISSION)
    .input(z.object({
      role: z.string(),
      permissions: z.array(z.object({
        key: z.string(),
        allowed: z.boolean(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.saveRolePermissions(input.role, input.permissions, ctx.user!.id);
      await db.createOperationLog({
        userId: ctx.user!.id,
        userName: ctx.user!.name ?? undefined,
        action: "update",
        targetType: "permission",
        targetId: input.role,
        changes: { permissionCount: input.permissions.filter(p => p.allowed).length },
        description: `更新角色权限: ${input.role}`,
      });
      return { success: true };
    }),

  // 获取当前用户的权限列表（任何已登录用户都可以调用）
  myPermissions: protectedProcedure
    .query(async ({ ctx }) => {
      return db.getUserPermissions(ctx.user!.role);
    }),
});


// ============================================================
// 系统配置管理（预警阈值等）
// ============================================================
import { adminProcedure } from "../_core/trpc";

export const systemConfigRouter = router({
  // 获取所有系统配置
  list: adminProcedure
    .query(async () => {
      return db.getAllSystemConfigs();
    }),

  // 获取单个配置值
  get: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      const val = await db.getSystemConfig(input.key);
      return { key: input.key, value: val };
    }),

  // 获取所有预警阈值（含默认值兜底）
  getThresholds: protectedProcedure
    .query(async () => {
      const keys = Object.values(db.CONFIG_KEYS);
      const results: Record<string, number> = {};
      for (const key of keys) {
        results[key] = await db.getThreshold(key);
      }
      return results;
    }),

  // 更新配置（仅管理员）
  upsert: adminProcedure
    .input(z.object({
      key: z.string().min(1),
      value: z.string(),
      description: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.upsertSystemConfig(
        input.key,
        input.value,
        input.description ?? null,
        ctx.user!.id,
        ctx.user!.name || ctx.user!.username || "管理员",
      );
      return { success: true };
    }),

  // 批量更新预警阈值
  updateThresholds: adminProcedure
    .input(z.object({
      thresholds: z.array(z.object({
        key: z.string(),
        value: z.number().int().min(1, "阈值必须大于0"),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      for (const t of input.thresholds) {
        await db.upsertSystemConfig(
          t.key,
          String(t.value),
          null,
          ctx.user!.id,
          ctx.user!.name || ctx.user!.username || "管理员",
        );
      }
      return { success: true, count: input.thresholds.length };
    }),
});
