-- 为存量 product_groups 增加规格维度定义列 spec_keys_json。
-- 由商品组定义可选规格维度，子商品只能填这些维度的值。
-- 对已存在该列的库重复执行会报错，可按需手动跳过。
ALTER TABLE product_groups
    ADD COLUMN spec_keys_json VARCHAR(1000) NOT NULL DEFAULT '[]' AFTER sort_order;
