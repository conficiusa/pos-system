ALTER TABLE `orders` ADD `order_seq` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `order_year` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `order_number` text;--> statement-breakpoint
CREATE INDEX `orders_number_idx` ON `orders` (`order_year`,`order_seq`);