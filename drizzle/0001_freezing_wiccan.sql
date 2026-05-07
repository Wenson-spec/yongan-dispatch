CREATE TABLE `approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`approvalType` enum('initial_price','vehicle_quote','surcharge','advance_payment') NOT NULL,
	`applicantId` int NOT NULL,
	`applicantName` varchar(100),
	`approverId` int,
	`approverName` varchar(100),
	`approvalStatus` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`requestedAmount` decimal(10,4),
	`approvedAmount` decimal(10,4),
	`reason` text,
	`approverComment` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cargo_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cargo_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `departments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dispatcher_regions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dispatcherId` int NOT NULL,
	`province` varchar(100) NOT NULL,
	`city` varchar(100),
	`priority` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dispatcher_regions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `ltl_inquiries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`freightStationId` int NOT NULL,
	`finalStationName` varchar(200),
	`quotedPrice` decimal(10,4),
	`confirmedPrice` decimal(10,4),
	`inquiryStatus` enum('pending','quoted','confirmed','cancelled') NOT NULL DEFAULT 'pending',
	`inquiredBy` int NOT NULL,
	`remarks` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ltl_inquiries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNumber` varchar(100),
	`systemCode` varchar(50) NOT NULL,
	`businessType` enum('outsource','self','ltl') NOT NULL,
	`department` varchar(100),
	`status` enum('pending_assign','pending_dispatch','pending_price','priced','pending_vehicle','pending_approval','pending_inquiry','inquiry_confirmed','dispatched','in_transit','delivered','signed','settled','on_hold','cancelled') NOT NULL DEFAULT 'pending_assign',
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
	`deliveryAddress` text,
	`destinationCity` varchar(200),
	`receiverName` varchar(100),
	`receiverPhone` varchar(20),
	`quotedPrice` decimal(10,4),
	`dispatchPrice` decimal(10,4),
	`actualFreight` decimal(10,4),
	`deliveryFee` decimal(10,4),
	`extraFee` decimal(10,4),
	`totalCost` decimal(10,4),
	`assignedDispatcherId` int,
	`plateNumber` varchar(20),
	`driverName` varchar(100),
	`driverPhone` varchar(20),
	`freightStationId` int,
	`freightStationName` varchar(200),
	`ltlFinalStation` varchar(200),
	`ltlFreightPrice` decimal(10,4),
	`ltlInquiryStatus` enum('pending','quoted','confirmed','cancelled'),
	`podStatus` enum('none','uploaded','verified','original_sent','original_received') DEFAULT 'none',
	`autoAssignedAt` timestamp,
	`autoAssignedRegion` varchar(200),
	`orderDate` timestamp,
	`dispatchDate` timestamp,
	`loadingDate` timestamp,
	`deliveryDate` timestamp,
	`podDate` timestamp,
	`verificationNumber` varchar(100),
	`remarks` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','order_entry','ltl_cs','chain_cs','ltl_dispatcher','outsource_dispatcher','fleet_dispatcher','field_manager','cs_manager','finance_assistant') NOT NULL DEFAULT 'order_entry';--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `region` varchar(200);--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;