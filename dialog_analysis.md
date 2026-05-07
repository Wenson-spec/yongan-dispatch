# 工位弹窗信息完善分析

## 数据库可用字段（orders表）
- orderNumber, systemCode, mergedPlanNumber
- businessType, department, status, isUrgent, urgentReason
- customerName, customerPhone, settlementType
- cargoName, weight, packagingType, cargoSpec, specialRequirements
- warehouseName, originCity, originProvince
- deliveryAddress, destinationCity, destinationProvince, receiverName, receiverPhone
- customerPrice, quotedPrice, dispatchPrice, actualFreight, deliveryFee, extraFee, totalCost
- plateNumber, driverName, driverPhone
- freightStationName, ltlFinalStation, ltlFreightPrice
- ltlUnitPrice, ltlDeliveryFee, ltlOtherFee
- freightWaybillNumber, inquiryPhone
- isLargeSlab, chargeableWeight, packageCount
- depositAmount, depositRefundable, depositStatus
- dispatcherRemark, remarks
- orderDate, dispatchDate, loadingDate, deliveryDate

## 1. 指挥台定价弹窗 (CommandCenter.tsx)
**已有：** orderNumber, businessType, mergedPlanNumber, customerName, cargoName, weight, originCity, warehouseName, destinationCity, deliveryAddress, receiverName, receiverPhone, customerPrice, remarks, isUrgent/urgentReason
**缺少：**
- customerPhone（客户电话）
- cargoSpec（货物规格）
- specialRequirements（特殊要求）
- packagingType（包装方式）
- originProvince/destinationProvince（省份）
- isLargeSlab/chargeableWeight/packageCount（大板信息）
- orderDate（下单日期）
- department（部门）
- settlementType（结算方式）

## 2. 派车台弹窗 (DispatchVehicle.tsx)
**已有：** orderNumber, mergedPlanNumber, customerName, cargoName, weight, originCity, warehouseName, destinationCity, deliveryAddress, receiverName, receiverPhone, customerPrice, dispatchPrice, remarks, isUrgent/urgentReason
**缺少：**
- customerPhone（客户电话）
- cargoSpec（货物规格）
- specialRequirements（特殊要求）
- packagingType（包装方式）
- isLargeSlab/chargeableWeight/packageCount（大板信息）
- orderDate（下单日期）

## 3. 询价发运台弹窗 (LtlInquiryStation.tsx)
**已有：** orderNumber, mergedPlanNumber, customerName, cargoName, weight, originCity, warehouseName, destinationCity, deliveryAddress, receiverName, receiverPhone, customerPrice, dispatchPrice, remarks, isUrgent/urgentReason
**缺少：**
- customerPhone（客户电话）
- cargoSpec（货物规格）
- specialRequirements（特殊要求）
- packagingType（包装方式）
- isLargeSlab/chargeableWeight/packageCount（大板信息）
- orderDate（下单日期）
- settlementType（结算方式）
