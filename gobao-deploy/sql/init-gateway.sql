CREATE DATABASE IF NOT EXISTS `gateway` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `gateway`;

CREATE TABLE IF NOT EXISTS `favorites` (
  `user_id` BIGINT NOT NULL,
  `product_id` BIGINT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`, `product_id`),
  KEY `idx_favorites_user_created_at` (`user_id`, `created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
