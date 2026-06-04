CREATE DATABASE IF NOT EXISTS `order` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `order`;

CREATE TABLE IF NOT EXISTS `orders` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `order_no` VARCHAR(64) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `request_id` VARCHAR(64) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `total_amount` BIGINT NOT NULL,
  `total_quantity` INT NOT NULL,
  `receiver_name` VARCHAR(64) NOT NULL DEFAULT '',
  `receiver_phone` VARCHAR(32) NOT NULL DEFAULT '',
  `province` VARCHAR(64) NOT NULL DEFAULT '',
  `city` VARCHAR(64) NOT NULL DEFAULT '',
  `district` VARCHAR(64) NOT NULL DEFAULT '',
  `address_line` VARCHAR(255) NOT NULL DEFAULT '',
  `postal_code` VARCHAR(32) NOT NULL DEFAULT '',
  `expire_at` DATETIME(3) NOT NULL,
  `closed_at` DATETIME(3) NULL DEFAULT NULL,
  `close_reason` VARCHAR(32) NOT NULL DEFAULT '',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_orders_order_no` (`order_no`),
  KEY `idx_orders_user_id` (`user_id`),
  KEY `idx_orders_request_id` (`request_id`),
  KEY `idx_orders_status` (`status`),
  KEY `idx_orders_expire_at` (`expire_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `order_items` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT NOT NULL,
  `product_id` BIGINT NOT NULL,
  `sku_id` BIGINT NOT NULL,
  `sku_code` VARCHAR(100) NOT NULL DEFAULT '',
  `sku_title` VARCHAR(200) NOT NULL DEFAULT '',
  `name` VARCHAR(200) NOT NULL,
  `image_url` VARCHAR(500) NOT NULL DEFAULT '',
  `option_summary` VARCHAR(255) NOT NULL DEFAULT '',
  `price` BIGINT NOT NULL,
  `quantity` INT NOT NULL,
  `amount` BIGINT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_order_items_order_id` (`order_id`),
  KEY `idx_order_items_product_id` (`product_id`),
  KEY `idx_order_items_sku_id` (`sku_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
