ALTER TABLE `orders` ADD `podOwnership` enum('current_order','delivery_outsource','none') DEFAULT 'current_order' NOT NULL;--> statement-breakpoint
ALTER TABLE `pod_records` ADD `podOwnership` enum('current_order','delivery_outsource','none') DEFAULT 'current_order' NOT NULL;
