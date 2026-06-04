USE product;
SET NAMES utf8mb4;

-- 运行期迁移说明：
-- 1. 兼容已经启动过的旧 product 数据库；
-- 2. 为详情多图、本地媒体静态目录与媒体绑定表补齐结构；
-- 3. 追加最小测试数据，让现有前端能直接联调多图详情页。

-- 兼容旧库：仅在字段缺失时补齐 cover_image_url。
SET @has_cover_image_url := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'product_groups'
      AND COLUMN_NAME = 'cover_image_url'
);
SET @alter_cover_image_url_sql := IF(
    @has_cover_image_url = 0,
    'ALTER TABLE product_groups ADD COLUMN cover_image_url VARCHAR(500) NULL AFTER hero_image_url',
    'SELECT 1'
);
PREPARE alter_cover_image_url_stmt FROM @alter_cover_image_url_sql;
EXECUTE alter_cover_image_url_stmt;
DEALLOCATE PREPARE alter_cover_image_url_stmt;

CREATE TABLE IF NOT EXISTS media_assets (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    storage_key VARCHAR(500) NOT NULL UNIQUE,
    public_url VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    width INT NOT NULL DEFAULT 0,
    height INT NOT NULL DEFAULT 0,
    alt_text VARCHAR(255) NOT NULL DEFAULT '',
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_group_media_bindings (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    group_id BIGINT NOT NULL,
    media_id BIGINT NOT NULL,
    usage_type VARCHAR(32) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_group_media_usage (group_id, media_id, usage_type),
    INDEX idx_group_media_group (group_id),
    INDEX idx_group_media_media (media_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_media_bindings (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    product_id BIGINT NOT NULL,
    media_id BIGINT NOT NULL,
    usage_type VARCHAR(32) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_product_media_usage (product_id, media_id, usage_type),
    INDEX idx_product_media_product (product_id),
    INDEX idx_product_media_media (media_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

UPDATE product_groups
SET hero_image_url = CASE id
        WHEN 5001 THEN '/media/groups/5001/hero/macbook-air-hero.jpg'
        WHEN 5002 THEN '/media/groups/5002/hero/iphone-17-pro-hero.jpg'
        WHEN 5003 THEN '/media/groups/5003/hero/ipad-air-hero.png'
        WHEN 5004 THEN '/media/groups/5004/hero/airpods-pro-2-hero.jpg'
        ELSE hero_image_url
    END,
    cover_image_url = CASE id
        WHEN 5001 THEN '/media/groups/5001/cover/macbook-air-cover.jpg'
        WHEN 5002 THEN '/media/groups/5002/cover/iphone-17-pro-cover.jpg'
        WHEN 5003 THEN '/media/groups/5003/cover/ipad-air-cover.png'
        WHEN 5004 THEN '/media/groups/5004/cover/airpods-pro-2-cover.jpg'
        ELSE cover_image_url
    END
WHERE id IN (5001, 5002, 5003, 5004);

UPDATE products
SET image_url = CASE id
        WHEN 1001001 THEN '/media/products/1001001/main/macbook-air-m4-16-256-main.jpg'
        WHEN 1001002 THEN '/media/products/1001002/main/macbook-air-m4-16-512-main.jpg'
        WHEN 1002001 THEN '/media/products/1002001/main/iphone-17-pro-desert-256-main.jpg'
        WHEN 1002002 THEN '/media/products/1002002/main/iphone-17-pro-natural-512-main.jpg'
        WHEN 1003001 THEN '/media/products/1003001/main/ipad-air-gray-128-main.png'
        WHEN 1003002 THEN '/media/products/1003002/main/ipad-air-starlight-256-main.png'
        WHEN 1004001 THEN '/media/products/1004001/main/airpods-pro-2-usbc-main.jpg'
        ELSE image_url
    END
WHERE id IN (1001001, 1001002, 1002001, 1002002, 1003001, 1003002, 1004001);

INSERT INTO media_assets (
    id,
    storage_key,
    public_url,
    file_name,
    mime_type,
    size_bytes,
    width,
    height,
    alt_text
) VALUES
    (1, 'groups/5001/hero/macbook-air-hero.jpg', '/media/groups/5001/hero/macbook-air-hero.jpg', 'macbook-air-hero.jpg', 'image/jpeg', 0, 0, 0, 'MacBook Air 主视觉'),
    (2, 'groups/5001/cover/macbook-air-cover.jpg', '/media/groups/5001/cover/macbook-air-cover.jpg', 'macbook-air-cover.jpg', 'image/jpeg', 0, 0, 0, 'MacBook Air 封面'),
    (3, 'groups/5001/gallery/macbook-air-gallery-1.jpg', '/media/groups/5001/gallery/macbook-air-gallery-1.jpg', 'macbook-air-gallery-1.jpg', 'image/jpeg', 0, 0, 0, 'MacBook Air 展示图 1'),
    (4, 'groups/5001/gallery/macbook-air-gallery-2.jpg', '/media/groups/5001/gallery/macbook-air-gallery-2.jpg', 'macbook-air-gallery-2.jpg', 'image/jpeg', 0, 0, 0, 'MacBook Air 展示图 2'),
    (5, 'products/1001001/main/macbook-air-m4-16-256-main.jpg', '/media/products/1001001/main/macbook-air-m4-16-256-main.jpg', 'macbook-air-m4-16-256-main.jpg', 'image/jpeg', 0, 0, 0, 'MacBook Air 16GB 256GB 主图'),
    (6, 'products/1001001/gallery/macbook-air-m4-16-256-side.jpg', '/media/products/1001001/gallery/macbook-air-m4-16-256-side.jpg', 'macbook-air-m4-16-256-side.jpg', 'image/jpeg', 0, 0, 0, 'MacBook Air 16GB 256GB 侧视图'),
    (7, 'products/1001002/main/macbook-air-m4-16-512-main.jpg', '/media/products/1001002/main/macbook-air-m4-16-512-main.jpg', 'macbook-air-m4-16-512-main.jpg', 'image/jpeg', 0, 0, 0, 'MacBook Air 16GB 512GB 主图'),
    (8, 'products/1001002/gallery/macbook-air-m4-16-512-side.jpg', '/media/products/1001002/gallery/macbook-air-m4-16-512-side.jpg', 'macbook-air-m4-16-512-side.jpg', 'image/jpeg', 0, 0, 0, 'MacBook Air 16GB 512GB 侧视图'),
    (9, 'groups/5002/hero/iphone-17-pro-hero.jpg', '/media/groups/5002/hero/iphone-17-pro-hero.jpg', 'iphone-17-pro-hero.jpg', 'image/jpeg', 0, 0, 0, 'iPhone 17 Pro 主视觉'),
    (10, 'groups/5002/cover/iphone-17-pro-cover.jpg', '/media/groups/5002/cover/iphone-17-pro-cover.jpg', 'iphone-17-pro-cover.jpg', 'image/jpeg', 0, 0, 0, 'iPhone 17 Pro 封面'),
    (11, 'groups/5002/gallery/iphone-17-pro-gallery-1.jpg', '/media/groups/5002/gallery/iphone-17-pro-gallery-1.jpg', 'iphone-17-pro-gallery-1.jpg', 'image/jpeg', 0, 0, 0, 'iPhone 17 Pro 展示图 1'),
    (12, 'groups/5002/gallery/iphone-17-pro-gallery-2.jpg', '/media/groups/5002/gallery/iphone-17-pro-gallery-2.jpg', 'iphone-17-pro-gallery-2.jpg', 'image/jpeg', 0, 0, 0, 'iPhone 17 Pro 展示图 2'),
    (13, 'products/1002001/main/iphone-17-pro-desert-256-main.jpg', '/media/products/1002001/main/iphone-17-pro-desert-256-main.jpg', 'iphone-17-pro-desert-256-main.jpg', 'image/jpeg', 0, 0, 0, 'iPhone 17 Pro 沙漠色 256GB 主图'),
    (14, 'products/1002002/main/iphone-17-pro-natural-512-main.jpg', '/media/products/1002002/main/iphone-17-pro-natural-512-main.jpg', 'iphone-17-pro-natural-512-main.jpg', 'image/jpeg', 0, 0, 0, 'iPhone 17 Pro 原色 512GB 主图'),
    (15, 'groups/5003/hero/ipad-air-hero.png', '/media/groups/5003/hero/ipad-air-hero.png', 'ipad-air-hero.png', 'image/png', 0, 0, 0, 'iPad Air 主视觉'),
    (16, 'groups/5003/cover/ipad-air-cover.png', '/media/groups/5003/cover/ipad-air-cover.png', 'ipad-air-cover.png', 'image/png', 0, 0, 0, 'iPad Air 封面'),
    (17, 'groups/5003/gallery/ipad-air-gallery-1.png', '/media/groups/5003/gallery/ipad-air-gallery-1.png', 'ipad-air-gallery-1.png', 'image/png', 0, 0, 0, 'iPad Air 展示图 1'),
    (18, 'products/1003001/main/ipad-air-gray-128-main.png', '/media/products/1003001/main/ipad-air-gray-128-main.png', 'ipad-air-gray-128-main.png', 'image/png', 0, 0, 0, 'iPad Air 深空灰 128GB 主图'),
    (19, 'products/1003002/main/ipad-air-starlight-256-main.png', '/media/products/1003002/main/ipad-air-starlight-256-main.png', 'ipad-air-starlight-256-main.png', 'image/png', 0, 0, 0, 'iPad Air 星光色 256GB 主图'),
    (20, 'groups/5004/hero/airpods-pro-2-hero.jpg', '/media/groups/5004/hero/airpods-pro-2-hero.jpg', 'airpods-pro-2-hero.jpg', 'image/jpeg', 0, 0, 0, 'AirPods Pro 2 主视觉'),
    (21, 'groups/5004/cover/airpods-pro-2-cover.jpg', '/media/groups/5004/cover/airpods-pro-2-cover.jpg', 'airpods-pro-2-cover.jpg', 'image/jpeg', 0, 0, 0, 'AirPods Pro 2 封面'),
    (22, 'groups/5004/gallery/airpods-pro-2-gallery-1.jpg', '/media/groups/5004/gallery/airpods-pro-2-gallery-1.jpg', 'airpods-pro-2-gallery-1.jpg', 'image/jpeg', 0, 0, 0, 'AirPods Pro 2 展示图 1'),
    (23, 'products/1004001/main/airpods-pro-2-usbc-main.jpg', '/media/products/1004001/main/airpods-pro-2-usbc-main.jpg', 'airpods-pro-2-usbc-main.jpg', 'image/jpeg', 0, 0, 0, 'AirPods Pro 2 USB-C 主图')
ON DUPLICATE KEY UPDATE
    public_url = VALUES(public_url),
    file_name = VALUES(file_name),
    mime_type = VALUES(mime_type),
    alt_text = VALUES(alt_text),
    updated_at = CURRENT_TIMESTAMP(3);

INSERT INTO product_group_media_bindings (
    id,
    group_id,
    media_id,
    usage_type,
    sort_order,
    is_primary
) VALUES
    (1, 5001, 1, 'gallery', 1, 1),
    (2, 5001, 3, 'gallery', 2, 0),
    (3, 5001, 4, 'gallery', 3, 0),
    (4, 5002, 9, 'gallery', 1, 1),
    (5, 5002, 11, 'gallery', 2, 0),
    (6, 5002, 12, 'gallery', 3, 0),
    (7, 5003, 15, 'gallery', 1, 1),
    (8, 5003, 17, 'gallery', 2, 0),
    (9, 5004, 20, 'gallery', 1, 1),
    (10, 5004, 22, 'gallery', 2, 0)
ON DUPLICATE KEY UPDATE
    sort_order = VALUES(sort_order),
    is_primary = VALUES(is_primary),
    updated_at = CURRENT_TIMESTAMP(3);

INSERT INTO product_media_bindings (
    id,
    product_id,
    media_id,
    usage_type,
    sort_order,
    is_primary
) VALUES
    (1, 1001001, 5, 'gallery', 1, 1),
    (2, 1001001, 6, 'gallery', 2, 0),
    (3, 1001002, 7, 'gallery', 1, 1),
    (4, 1001002, 8, 'gallery', 2, 0),
    (5, 1002001, 13, 'gallery', 1, 1),
    (6, 1002002, 14, 'gallery', 1, 1),
    (7, 1003001, 18, 'gallery', 1, 1),
    (8, 1003002, 19, 'gallery', 1, 1),
    (9, 1004001, 23, 'gallery', 1, 1)
ON DUPLICATE KEY UPDATE
    sort_order = VALUES(sort_order),
    is_primary = VALUES(is_primary),
    updated_at = CURRENT_TIMESTAMP(3);
