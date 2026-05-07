CREATE TABLE `note_change_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`field` enum('shippingNote','receivingNote') NOT NULL,
	`oldValue` text,
	`newValue` text,
	`changedByUserId` int NOT NULL,
	`changedByUserName` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `note_change_logs_id` PRIMARY KEY(`id`)
);
