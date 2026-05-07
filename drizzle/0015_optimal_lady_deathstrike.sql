CREATE TABLE `paste_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerName` varchar(200) NOT NULL,
	`templateName` varchar(200),
	`sampleText` text NOT NULL,
	`fieldMapping` json,
	`successCount` int NOT NULL DEFAULT 0,
	`lastUsedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdByName` varchar(100),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paste_templates_id` PRIMARY KEY(`id`)
);
