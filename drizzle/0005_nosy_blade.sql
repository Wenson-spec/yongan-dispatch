ALTER TABLE `orders` MODIFY COLUMN `orderNumber` varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `mergedPlanNumber` varchar(100);--> statement-breakpoint
ALTER TABLE `orders` ADD `customerPrice` decimal(10,4);