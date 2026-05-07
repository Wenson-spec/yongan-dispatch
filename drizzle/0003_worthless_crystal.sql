ALTER TABLE `orders` ADD `depositAmount` decimal(10,2);--> statement-breakpoint
ALTER TABLE `orders` ADD `depositRefundable` boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE `orders` ADD `depositStatus_order` enum('none','paid','refunded','not_refundable') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `stationReceiptUrl` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `stationReceiptUploadedAt` timestamp;