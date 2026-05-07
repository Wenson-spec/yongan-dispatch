ALTER TABLE `approvals` MODIFY COLUMN `requestedAmount` decimal(14,4);--> statement-breakpoint
ALTER TABLE `approvals` MODIFY COLUMN `approvedAmount` decimal(14,4);--> statement-breakpoint
ALTER TABLE `ltl_inquiries` MODIFY COLUMN `quotedPrice` decimal(14,4);--> statement-breakpoint
ALTER TABLE `ltl_inquiries` MODIFY COLUMN `confirmedPrice` decimal(14,4);--> statement-breakpoint
ALTER TABLE `ltl_inquiries` MODIFY COLUMN `unitPrice` decimal(14,4);--> statement-breakpoint
ALTER TABLE `ltl_inquiries` MODIFY COLUMN `deliveryFee` decimal(14,2);--> statement-breakpoint
ALTER TABLE `ltl_inquiries` MODIFY COLUMN `otherFee` decimal(14,2);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `customerPrice` decimal(14,4);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `quotedPrice` decimal(14,4);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `dispatchPrice` decimal(14,4);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `actualFreight` decimal(14,4);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `deliveryFee` decimal(14,4);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `extraFee` decimal(14,4);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `totalCost` decimal(14,4);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `ltlFreightPrice` decimal(14,4);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `ltlUnitPrice` decimal(14,4);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `ltlDeliveryFee` decimal(14,2);--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `ltlOtherFee` decimal(14,2);