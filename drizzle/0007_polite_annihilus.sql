ALTER TABLE `ltl_inquiries` ADD `packageCount` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `originProvince` varchar(100);--> statement-breakpoint
ALTER TABLE `orders` ADD `destinationProvince` varchar(100);--> statement-breakpoint
ALTER TABLE `orders` ADD `chargeableWeight` decimal(10,3);--> statement-breakpoint
ALTER TABLE `orders` ADD `packageCount` int;