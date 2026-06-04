CREATE DATABASE IF NOT EXISTS product CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE product;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS categories (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) UNIQUE NOT NULL,
    sort_order INT DEFAULT 0,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    group_id BIGINT NOT NULL DEFAULT 0,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    spec_label VARCHAR(255) NOT NULL DEFAULT '',
    spec_values_json TEXT,
    image_url VARCHAR(500),
    status TINYINT DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    deleted_at DATETIME(3) NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_group_id (group_id),
    INDEX idx_category_id (category_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_groups (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL UNIQUE,
    hero_title VARCHAR(255),
    hero_subtitle VARCHAR(255),
    hero_image_url VARCHAR(500),
    cover_image_url VARCHAR(500),
    category_id BIGINT NOT NULL,
    status TINYINT NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    spec_keys_json VARCHAR(1000) NOT NULL DEFAULT '[]',
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_group_category (category_id),
    INDEX idx_group_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS stocks (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    product_id BIGINT UNIQUE NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    version INT NOT NULL DEFAULT 0,
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS seckill_activities (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    product_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    seckill_price BIGINT NOT NULL,
    seckill_stock INT NOT NULL,
    status TINYINT NOT NULL DEFAULT 1,
    start_at DATETIME(3) NOT NULL,
    end_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_product_id (product_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 基础类目测试数据：与当前精品电子商店前端导航保持一致。
INSERT INTO categories (id, name, sort_order) VALUES
    (1, 'Mac', 1),
    (2, 'iPhone', 2),
    (3, 'iPad', 3),
    (4, '穿戴', 4);

-- 商品组测试数据说明：
-- 1. 一个 product_group 对应前端一个精品商品详情页；
-- 2. 同组下的多个 products 表示可切换的独立商品版本；
-- 3. 前端列表、详情、购物车与订单链路都应直接基于这些数据联调。
INSERT INTO product_groups (
    id,
    name,
    slug,
    hero_title,
    hero_subtitle,
    hero_image_url,
    cover_image_url,
    category_id,
    status,
    sort_order,
    spec_keys_json
) VALUES
    (
        5001,
        'MacBook Air',
        'macbook-air',
        'MacBook Air',
        '轻薄与性能并进',
        '/media/groups/5001/hero/macbook-air-hero.jpg',
        '/media/groups/5001/cover/macbook-air-cover.jpg',
        1,
        1,
        1,
        '["芯片","内存","存储"]'
    ),
    (
        5002,
        'iPhone 17 Pro',
        'iphone-17-pro',
        'iPhone 17 Pro',
        '高端旗舰，聚焦影像与性能',
        '/media/groups/5002/hero/iphone-17-pro-hero.jpg',
        '/media/groups/5002/cover/iphone-17-pro-cover.jpg',
        2,
        1,
        2,
        '["颜色","存储"]'
    ),
    (
        5003,
        'iPad Air',
        'ipad-air',
        'iPad Air',
        '轻薄平板，兼顾创作与娱乐',
        '/media/groups/5003/hero/ipad-air-hero.png',
        '/media/groups/5003/cover/ipad-air-cover.png',
        3,
        1,
        3,
        '["颜色","存储"]'
    ),
    (
        5004,
        'AirPods Pro 2',
        'airpods-pro-2',
        'AirPods Pro 2',
        '专注降噪与日常便携体验',
        '/media/groups/5004/hero/airpods-pro-2-hero.jpg',
        '/media/groups/5004/cover/airpods-pro-2-cover.jpg',
        4,
        1,
        4,
        '["连接方式"]'
    );

-- 独立商品版本测试数据说明：
-- 1. 每一条 products 记录都是一个真实可售卖版本；
-- 2. group_id 指向所属商品组，用于详情页同组切换；
-- 3. spec_label/spec_values_json 作为当前版本的展示与计算输入，前端只消费不自行推导。
INSERT INTO products (
    id,
    group_id,
    name,
    description,
    price,
    category_id,
    spec_label,
    spec_values_json,
    image_url,
    status,
    sort_order
) VALUES
    (
        1001001,
        5001,
        'MacBook Air',
        '轻薄笔记本产品线测试数据，采用 MacBook Air 公开售价与公开商品图，适合首页与商品卡片陈列。',
        849900,
        1,
        'M4 / 16GB / 256GB',
        '{"芯片":"M4","内存":"16GB","存储":"256GB"}',
        '/media/products/1001001/main/macbook-air-m4-16-256-main.jpg',
        1,
        1
    ),
    (
        1001002,
        5001,
        'MacBook Air',
        '轻薄笔记本产品线测试数据，采用 MacBook Air 公开售价与公开商品图，适合首页与商品卡片陈列。',
        999900,
        1,
        'M4 / 16GB / 512GB',
        '{"芯片":"M4","内存":"16GB","存储":"512GB"}',
        '/media/products/1001002/main/macbook-air-m4-16-512-main.jpg',
        1,
        2
    ),
    (
        1002001,
        5002,
        'iPhone 17 Pro',
        '高端旗舰手机测试数据，采用 iPhone 产品线公开起售价，并使用 Apple 官网公开机型展示图。',
        899900,
        2,
        '沙漠色 / 256GB',
        '{"颜色":"沙漠色","存储":"256GB"}',
        '/media/products/1002001/main/iphone-17-pro-desert-256-main.jpg',
        1,
        1
    ),
    (
        1002002,
        5002,
        'iPhone 17 Pro',
        '高端旗舰手机测试数据，采用 iPhone 产品线公开起售价，并使用 Apple 官网公开机型展示图。',
        1099900,
        2,
        '原色 / 512GB',
        '{"颜色":"原色","存储":"512GB"}',
        '/media/products/1002002/main/iphone-17-pro-natural-512-main.jpg',
        1,
        2
    ),
    (
        1003001,
        5003,
        'iPad Air',
        '轻薄平板测试数据，采用 iPad Air 公开起售价与公开商品图，用于系列筛选和购物车链路测试。',
        479900,
        3,
        '深空灰 / 128GB',
        '{"颜色":"深空灰","存储":"128GB"}',
        '/media/products/1003001/main/ipad-air-gray-128-main.png',
        1,
        1
    ),
    (
        1003002,
        5003,
        'iPad Air',
        '轻薄平板测试数据，采用 iPad Air 公开起售价与公开商品图，用于系列筛选和购物车链路测试。',
        599900,
        3,
        '星光色 / 256GB',
        '{"颜色":"星光色","存储":"256GB"}',
        '/media/products/1003002/main/ipad-air-starlight-256-main.png',
        1,
        2
    ),
    (
        1004001,
        5004,
        'AirPods Pro 2',
        '音频产品测试数据，采用 Apple 中国官网公开翻新页面价格与公开商品图，用于穿戴类展示与下单链路测试。',
        144900,
        4,
        'USB-C 版',
        '{"连接方式":"USB-C 版"}',
        '/media/products/1004001/main/airpods-pro-2-usbc-main.jpg',
        1,
        1
    );

-- 商品图片测试数据说明：
-- 1. public_url 统一走 product 服务暴露的 /media 静态目录；
-- 2. product_group_media_bindings 用于详情公共图库；
-- 3. product_media_bindings 用于某个独立 SKU 风格差异图。
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
    (23, 'products/1004001/main/airpods-pro-2-usbc-main.jpg', '/media/products/1004001/main/airpods-pro-2-usbc-main.jpg', 'airpods-pro-2-usbc-main.jpg', 'image/jpeg', 0, 0, 0, 'AirPods Pro 2 USB-C 主图');

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
    (10, 5004, 22, 'gallery', 2, 0);

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
    (9, 1004001, 23, 'gallery', 1, 1);

-- 为前端商品详情、购物车和后续下单 mock 提供可用库存。
INSERT INTO stocks (id, product_id, quantity, version) VALUES
    (1, 1001001, 12, 0),
    (2, 1001002, 8, 0),
    (3, 1002001, 18, 0),
    (4, 1002002, 9, 0),
    (5, 1003001, 15, 0),
    (6, 1003002, 10, 0),
    (7, 1004001, 30, 0);

-- 秒杀活动测试数据：
-- 1. 使用已插入的精品电子商品作为活动载体；
-- 2. 时间窗故意覆盖较长区间，便于本地联调时直接命中“进行中”状态。
INSERT INTO seckill_activities (
    id,
    product_id,
    title,
    seckill_price,
    seckill_stock,
    status,
    start_at,
    end_at
) VALUES
    (
        1,
        1002001,
        'iPhone 17 Pro 新品发售专场',
        869900,
        12,
        1,
        '2026-01-01 00:00:00.000',
        '2027-01-01 00:00:00.000'
    ),
    (
        2,
        1004001,
        'AirPods Pro 2 限量精选活动',
        129900,
        20,
        1,
        '2026-01-01 00:00:00.000',
        '2027-01-01 00:00:00.000'
    );
