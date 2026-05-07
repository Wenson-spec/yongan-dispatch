ALTER TABLE `orders` MODIFY COLUMN `status` enum('pending_assign','pending_dispatch','pending_price','priced','pending_vehicle','pending_approval','pending_inquiry','inquiry_confirmed','shipped','dispatched','in_transit','delivered','signed','settled','on_hold','cancelled','merged') NOT NULL DEFAULT 'pending_assign';--> statement-breakpoint
ALTER TABLE `orders` ADD `driverId` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `vehicleId` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `parentId` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `isMerged` boolean DEFAULT false;