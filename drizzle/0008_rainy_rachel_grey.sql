CREATE TABLE `ltl_dispatch_batch_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`orderId` int NOT NULL,
	`remark` text,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ltl_dispatch_batch_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
