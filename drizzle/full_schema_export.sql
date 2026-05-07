Reading schema files:
/home/ubuntu/yongan-outsource-rebuild/drizzle/schema.ts

CREATE TABLE `approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`approvalType` enum('initial_price','vehicle_quote','surcharge') NOT NULL,
	`applicantId` int NOT NULL,
	`applicantName` varchar(100),
	`approverId` int,
	`approverName` varchar(100),
	`approvalStatus` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`previousStatus` varchar(50),
	`requestedAmount` decimal(14,4),
	`approvedAmount` decimal(14,4),
	`reason` text,
	`approverComment` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `approvals_id` PRIMARY KEY(`id`)
);

CREATE TABLE `cargo_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cargo_types_id` PRIMARY KEY(`id`)
);

CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`phone` varchar(20),
	`salesperson` varchar(100),
	`settlementType` enum('monthly','cash','collect') NOT NULL DEFAULT 'monthly',
	`department` varchar(100),
	`remarks` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);

CREATE TABLE `departments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `departments_id` PRIMARY KEY(`id`)
);

CREATE TABLE `dispatcher_regions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dispatcherId` int NOT NULL,
	`province` varchar(100) NOT NULL,
	`city` varchar(100),
	`priority` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dispatcher_regions_id` PRIMARY KEY(`id`)
);

CREATE TABLE `drivers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`phone` varchar(20),
	`idCard` varchar(20),
	`driverType` enum('own','outsource') NOT NULL DEFAULT 'own',
	`commonPlateNumber` varchar(20),
	`depositAmount` decimal(10,2),
	`depositStatus` enum('none','paid','refunded') NOT NULL DEFAULT 'none',
	`remarks` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `drivers_id` PRIMARY KEY(`id`)
);

CREATE TABLE `freight_stations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`address` text,
	`phone` varchar(20),
	`contactPerson` varchar(100),
	`coverageArea` text,
	`remarks` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `freight_stations_id` PRIMARY KEY(`id`)
);

CREATE TABLE `ltl_dispatch_batch_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`orderId` int NOT NULL,
	`remark` text,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ltl_dispatch_batch_orders_id` PRIMARY KEY(`id`)
);

CREATE TABLE `ltl_dispatch_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchCode` varchar(50) NOT NULL,
	`plateNumber` varchar(20) NOT NULL,
	`driverName` varchar(100) NOT NULL,
	`driverPhone` varchar(20),
	`dispatchDate` timestamp NOT NULL DEFAULT (now()),
	`remark` text,
	`createdBy` int,
	`createdByName` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ltl_dispatch_batches_id` PRIMARY KEY(`id`)
);

CREATE TABLE `ltl_inquiries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`freightStationId` int NOT NULL,
	`finalStationName` varchar(200),
	`quotedPrice` decimal(14,4),
	`confirmedPrice` decimal(14,4),
	`unitPrice` decimal(14,4),
	`deliveryFee` decimal(14,2),
	`otherFee` decimal(14,2),
	`packageCount` int,
	`inquiryStatus` enum('pending','quoted','confirmed','cancelled') NOT NULL DEFAULT 'pending',
	`inquiredBy` int NOT NULL,
	`remarks` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ltl_inquiries_id` PRIMARY KEY(`id`)
);

CREATE TABLE `note_change_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`field` enum('shippingNote','receivingNote') NOT NULL,
	`oldValue` text,
	`newValue` text,
	`changedByUserId` int NOT NULL,
	`changedByUserName` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `note_change_logs_id` PRIMARY KEY(`id`)
);

CREATE TABLE `operation_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`userName` varchar(100),
	`action` varchar(50) NOT NULL,
	`targetType` varchar(50) NOT NULL,
	`targetId` varchar(100),
	`changes` json,
	`ipAddress` varchar(50),
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operation_logs_id` PRIMARY KEY(`id`)
);

CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNumber` varchar(100) NOT NULL,
	`systemCode` varchar(50) NOT NULL,
	`mergedPlanNumber` varchar(100),
	`businessType` enum('outsource','self','ltl') NOT NULL,
	`department` varchar(100),
	`status` enum('pending_assign','pending_dispatch','pending_price','priced','pending_vehicle','pending_approval','pending_inquiry','inquiry_confirmed','shipped','dispatched','in_transit','delivered','signed','settled','on_hold','cancelled','merged') NOT NULL DEFAULT 'pending_assign',
	`isUrgent` boolean NOT NULL DEFAULT false,
	`urgentReason` text,
	`customerId` int,
	`customerName` varchar(200),
	`customerPhone` varchar(20),
	`settlementType_order` enum('monthly','cash','collect') DEFAULT 'monthly',
	`cargoName` varchar(200),
	`weight` decimal(10,3),
	`packagingType` enum('pallet','loose','pallet_loaded'),
	`cargoSpec` text,
	`specialRequirements` text,
	`warehouseId` int,
	`warehouseName` varchar(200),
	`originCity` varchar(100),
	`originProvince` varchar(100),
	`deliveryAddress` text,
	`destinationCity` varchar(200),
	`destinationProvince` varchar(100),
	`receiverName` varchar(100),
	`receiverPhone` varchar(20),
	`customerPrice` decimal(14,4),
	`quotedPrice` decimal(14,4),
	`dispatchPrice` decimal(14,4),
	`actualFreight` decimal(14,4),
	`deliveryFee` decimal(14,4),
	`extraFee` decimal(14,4),
	`totalCost` decimal(14,4),
	`assignedDispatcherId` int,
	`driverId` int,
	`vehicleId` int,
	`plateNumber` varchar(20),
	`driverName` varchar(100),
	`driverPhone` varchar(20),
	`freightStationId` int,
	`freightStationName` varchar(200),
	`ltlFinalStation` varchar(200),
	`ltlFreightPrice` decimal(14,4),
	`ltlInquiryStatus` enum('pending','quoted','confirmed','cancelled'),
	`depositAmount` decimal(10,2),
	`depositRefundable` boolean DEFAULT true,
	`depositStatus_order` enum('none','paid','refunded','not_refundable') NOT NULL DEFAULT 'none',
	`ltlUnitPrice` decimal(14,4),
	`ltlDeliveryFee` decimal(14,2),
	`ltlOtherFee` decimal(14,2),
	`freightWaybillNumber` varchar(100),
	`inquiryPhone` varchar(50),
	`isLargeSlab` boolean DEFAULT false,
	`chargeableWeight` decimal(10,3),
	`packageCount` int,
	`stationReceiptUrl` text,
	`stationReceiptUploadedAt` timestamp,
	`podStatus` enum('none','uploaded','verified','original_sent','original_received') DEFAULT 'none',
	`autoAssignedAt` timestamp,
	`autoAssignedRegion` varchar(200),
	`orderDate` timestamp,
	`dispatchDate` timestamp,
	`loadingDate` timestamp,
	`transitDate` timestamp,
	`deliveryDate` timestamp,
	`signedDate` timestamp,
	`approvalDate` timestamp,
	`depositRefundDate` timestamp,
	`podDate` timestamp,
	`podSentDate` timestamp,
	`podTrackingNumber` varchar(100),
	`verificationNumber` varchar(100),
	`dispatcherRemark` text,
	`shippingNote` text,
	`receivingStatus` enum('receivable','wait_notice','not_receivable'),
	`expectedReceiveAt` timestamp,
	`nextFollowUpAt` timestamp,
	`receivingReason` text,
	`receivingNote` text,
	`receivingConfirmedAt` timestamp,
	`receivingConfirmedBy` int,
	`receivingConfirmedByName` varchar(100),
	`parentId` int,
	`isMerged` boolean DEFAULT false,
	`remarks` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);

CREATE TABLE `overdue_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`podId` int NOT NULL,
	`orderId` int NOT NULL,
	`level` enum('yellow','orange','red') NOT NULL,
	`recipientRole` varchar(50) NOT NULL,
	`recipientUserId` int,
	`overdueDays` int NOT NULL,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `overdue_notifications_id` PRIMARY KEY(`id`)
);

CREATE TABLE `paste_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerName` varchar(200) NOT NULL,
	`templateName` varchar(200),
	`sampleText` text NOT NULL,
	`fieldMapping` json,
	`successCount` int NOT NULL DEFAULT 0,
	`lastUsedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdByName` varchar(100),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paste_templates_id` PRIMARY KEY(`id`)
);

CREATE TABLE `pod_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`deliveryNoteUrl` text,
	`ocrResult` json,
	`ocrVerified` boolean DEFAULT false,
	`ocrVerifiedBy` int,
	`ocrVerifiedAt` timestamp,
	`originalStatus` enum('pending','sent','received','lost') NOT NULL DEFAULT 'pending',
	`originalSentAt` timestamp,
	`originalReceivedAt` timestamp,
	`originalReceivedBy` int,
	`depositLinked` boolean DEFAULT false,
	`depositAmount` decimal(10,2),
	`depositRefunded` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pod_records_id` PRIMARY KEY(`id`)
);

CREATE TABLE `role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`role` varchar(50) NOT NULL,
	`permissionKey` varchar(100) NOT NULL,
	`allowed` boolean NOT NULL DEFAULT false,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `role_permissions_id` PRIMARY KEY(`id`)
);

CREATE TABLE `system_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`config_key` varchar(100) NOT NULL,
	`config_value` text NOT NULL,
	`description` varchar(255),
	`updated_by_id` int,
	`updated_by_name` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_config_config_key_unique` UNIQUE(`config_key`)
);

CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`username` varchar(64),
	`passwordHash` varchar(255),
	`name` text,
	`email` varchar(320),
	`phone` varchar(20),
	`loginMethod` varchar(64),
	`role` enum('admin','order_entry','ltl_cs','chain_cs','ltl_dispatcher','outsource_dispatcher','fleet_dispatcher','field_manager','cs_manager','finance_assistant') NOT NULL DEFAULT 'order_entry',
	`region` varchar(200),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);

CREATE TABLE `vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`plateNumber` varchar(20) NOT NULL,
	`vehicleType` enum('own','outsource') NOT NULL DEFAULT 'own',
	`model` varchar(100),
	`capacity` decimal(10,2),
	`driverId` int,
	`status` enum('available','in_transit','maintenance','inactive') NOT NULL DEFAULT 'available',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vehicles_id` PRIMARY KEY(`id`)
);

CREATE TABLE `warehouses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`city` varchar(100),
	`address` text,
	`phone` varchar(20),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `warehouses_id` PRIMARY KEY(`id`)
);

