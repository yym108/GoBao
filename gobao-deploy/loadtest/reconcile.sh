#!/usr/bin/env bash
# 压测后对账：比对「库存扣减量」与「订单数」，判定是否超卖、是否账平。
# 权威数据直接来自 MySQL：product 库的 stocks（剩余库存）、order 库的 order_items（订单项）。
#
# 用法：
#   ./reconcile.sh INITIAL_STOCK [PRODUCT_ID]
# 示例（压测前用 reset_stock.sh 设的初始库存填到这里）：
#   ./reconcile.sh 50 1004001
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_DIR=$(dirname "$SCRIPT_DIR")
ROOT_DIR=$(dirname "$DEPLOY_DIR")
COMPOSE="docker compose --env-file ${ROOT_DIR}/.env -f ${DEPLOY_DIR}/docker-compose.yml"

INITIAL="${1:?需提供压测前的初始库存，例如 ./reconcile.sh 50 1004001}"
PID="${2:-1004001}"

# -N -B 输出纯数值（无表头无边框）；tr 清掉可能的回车/空白。
REMAIN=$($COMPOSE exec -T mysql-product mysql -uroot -proot -N -B product \
  -e "SELECT quantity FROM stocks WHERE product_id=${PID};" | tr -d '[:space:]')
ORDERS=$($COMPOSE exec -T mysql-order mysql -uroot -proot -N -B order \
  -e "SELECT COUNT(*) FROM order_items WHERE product_id=${PID};" | tr -d '[:space:]')

DEDUCT=$((INITIAL - REMAIN))

echo "──────── 对账结果（商品 ${PID}）────────"
echo "初始库存 : ${INITIAL}"
echo "剩余库存 : ${REMAIN}"
echo "扣减数量 : ${DEDUCT}  (初始 - 剩余)"
echo "订单项数 : ${ORDERS}  (order_items 中该商品行数)"
echo "────────────────────────────────────"

rc=0
if [ "${REMAIN}" -ge 0 ]; then
  echo "✔ 未超卖：剩余库存 ${REMAIN} >= 0"
else
  echo "✘ 超卖：剩余库存 ${REMAIN} 为负！"
  rc=1
fi

if [ "${DEDUCT}" -eq "${ORDERS}" ]; then
  echo "✔ 账平：库存扣减量 == 订单数 (${DEDUCT})"
else
  echo "✘ 账不平：扣减 ${DEDUCT} != 订单数 ${ORDERS}"
  rc=1
fi

exit "${rc}"
