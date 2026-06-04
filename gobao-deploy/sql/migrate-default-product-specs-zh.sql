-- 将默认初始化商品的规格配置改为中文字段名。
-- 仅更新内置演示商品组与商品 ID，不影响后台后续新增的商品数据。
-- 手动执行时必须使用 utf8mb4 连接；这里显式声明，避免 MySQL 客户端默认 latin1 导致中文写入乱码。

SET NAMES utf8mb4;

UPDATE product_groups
SET spec_keys_json = '["芯片","内存","存储"]'
WHERE id = 5001;

UPDATE product_groups
SET spec_keys_json = '["颜色","存储"]'
WHERE id IN (5002, 5003);

UPDATE product_groups
SET spec_keys_json = '["连接方式"]'
WHERE id = 5004;

UPDATE products
SET spec_values_json = '{"芯片":"M4","内存":"16GB","存储":"256GB"}'
WHERE id = 1001001;

UPDATE products
SET spec_values_json = '{"芯片":"M4","内存":"16GB","存储":"512GB"}'
WHERE id = 1001002;

UPDATE products
SET spec_values_json = '{"颜色":"沙漠色","存储":"256GB"}'
WHERE id = 1002001;

UPDATE products
SET spec_values_json = '{"颜色":"原色","存储":"512GB"}'
WHERE id = 1002002;

UPDATE products
SET spec_values_json = '{"颜色":"深空灰","存储":"128GB"}'
WHERE id = 1003001;

UPDATE products
SET spec_values_json = '{"颜色":"星光色","存储":"256GB"}'
WHERE id = 1003002;

UPDATE products
SET spec_values_json = '{"连接方式":"USB-C 版"}'
WHERE id = 1004001;
