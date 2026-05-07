ALTER TABLE `orders` ADD `receivingStatus` enum('receivable','wait_notice','not_receivable');--> statement-breakpoint
ALTER TABLE `orders` ADD `expectedReceiveAt` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `nextFollowUpAt` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `receivingReason` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `receivingConfirmedAt` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `receivingConfirmedBy` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `receivingConfirmedByName` varchar(100);