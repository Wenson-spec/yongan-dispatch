ALTER TABLE `ltl_inquiries` ADD `unitPrice` decimal(10,4);--> statement-breakpoint
ALTER TABLE `ltl_inquiries` ADD `deliveryFee` decimal(10,2);--> statement-breakpoint
ALTER TABLE `ltl_inquiries` ADD `otherFee` decimal(10,2);--> statement-breakpoint
ALTER TABLE `orders` ADD `ltlUnitPrice` decimal(10,4);--> statement-breakpoint
ALTER TABLE `orders` ADD `ltlDeliveryFee` decimal(10,2);--> statement-breakpoint
ALTER TABLE `orders` ADD `ltlOtherFee` decimal(10,2);--> statement-breakpoint
ALTER TABLE `orders` ADD `freightWaybillNumber` varchar(100);--> statement-breakpoint
ALTER TABLE `orders` ADD `inquiryPhone` varchar(50);--> statement-breakpoint
ALTER TABLE `orders` ADD `isLargeSlab` boolean DEFAULT false;