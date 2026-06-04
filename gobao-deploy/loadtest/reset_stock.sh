#!/usr/bin/env bash
# 压测前置：把目标商品库存重置为指定值，并清理该商品的历史订单，
# 使每轮压测都从干净、已知的状态开始，便于压测后精确对账。
#
# 用法：
#   ./reset_stock.sh [PRODUCT_ID] [QUANTITY]
# 示例：
#   ./reset_stock.sh 1004001 50      # 小档：验证不超卖
#   ./reset_stock.sh 1004001 5000    # 大档：压吞吐
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_DIR=$(dirname "$SCRIPT_DIR")
ROOT_DIR=$(dirname "$DEPLOY_DIR")
COMPOSE="docker compose --env-file ${ROOT_DIR}/.env -f ${DEPLOY_DIR}/docker-compose.yml"

PID="${1:-1004001}"
QTY="${2:-50}"

echo "[reset] 商品 ${PID} 库存重置为 ${QTY}"
$COMPOSE exec -T mysql-product mysql -uroot -proot product -e \
  "UPDATE stocks SET quantity=${QTY}, version=version+1 WHERE product_id=${PID};
   SELECT product_id, quantity, version FROM stocks WHERE product_id=${PID};"

echo "[reset] 清理商品 ${PID} 的历史订单"
$COMPOSE exec -T mysql-order mysql -uroot -proot order -e \
  "DELETE oi, o FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id=${PID};
   SELECT COUNT(*) AS remaining_order_items FROM order_items WHERE product_id=${PID};"

echo "[reset] 完成。若发现下单时库存读取陈旧，可执行 'docker compose restart product' 清理商品缓存。"
