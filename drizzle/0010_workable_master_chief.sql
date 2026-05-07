CREATE TABLE `overdue_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`podId` int NOT NULL,
	`orderId` int NOT NULL,
	`level` enum('yellow','orange','red') NOT NULL,
	`recipientRole` varchar(50) NOT NULL,
	`recipientUserId` int,
	`overdueDays` int NOT NULL,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `overdue_notifications_id` PRIMARY KEY(`id`)
);
