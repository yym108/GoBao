#!/usr/bin/env bash
# smoke-i2b.sh — I2b 阶段秒杀链路基础冒烟测试
# 覆盖场景：注册登录、创建类目和商品、插入秒杀活动、查询、预热、首次抢购成功、重复请求冲突、库存打空后再次抢购冲突。

set -uo pipefail

BASE="${BASE:-http://localhost:18000}"
MYSQL_PRODUCT_HOST="${MYSQL_PRODUCT_HOST:-127.0.0.1}"
MYSQL_PRODUCT_PORT="${MYSQL_PRODUCT_PORT:-3308}"
MYSQL_PRODUCT_USER="${MYSQL_PRODUCT_USER:-root}"
MYSQL_PRODUCT_PASSWORD="${MYSQL_PRODUCT_PASSWORD:-root}"
MYSQL_PRODUCT_DB="${MYSQL_PRODUCT_DB:-product}"
PASS=0
FAIL=0
EMAIL="smoke-i2b-$(date +%s)@test.com"
PASSWORD="Test@12345"
NICKNAME="smoker-i2b"
CATEGORY_NAME="秒杀类目-$(date +%s)"
PRODUCT_NAME="秒杀商品-$(date +%s)"
SECKILL_TITLE="秒杀活动-$(date +%s)"
SECKILL_STOCK=3
SECKILL_ACTIVITY_ID=""
CATEGORY_ID=""
PRODUCT_ID=""
TMP=$(mktemp)

assert_status() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✅ $desc (HTTP $actual)"
    PASS=$((PASS+1))
  else
    echo "  ❌ $desc — 期望 ${expected}，实际 ${actual}"
    FAIL=$((FAIL+1))
  fi
}

extract_json_number() {
  local key="$1"
  grep -o "\"$key\":[0-9]*" "$TMP" | head -n1 | cut -d: -f2
}

extract_json_string() {
  local key="$1"
  grep -o "\"$key\":\"[^\"]*\"" "$TMP" | head -n1 | cut -d'"' -f4
}

mysql_exec() {
  local sql="$1"
  MYSQL_PWD="$MYSQL_PRODUCT_PASSWORD" mysql \
    -h"$MYSQL_PRODUCT_HOST" \
    -P"$MYSQL_PRODUCT_PORT" \
    -u"$MYSQL_PRODUCT_USER" \
    -D"$MYSQL_PRODUCT_DB" \
    -N -e "$sql"
}

cleanup_data() {
  if [ -n "$SECKILL_ACTIVITY_ID" ]; then
    mysql_exec "DELETE FROM seckill_activities WHERE id = $SECKILL_ACTIVITY_ID;" >/dev/null 2>&1 || true
  fi
  if [ -n "$PRODUCT_ID" ]; then
    curl -s -o /dev/null -X DELETE "$BASE/api/v1/products/$PRODUCT_ID" \
      -H "Authorization: Bearer $TOKEN" >/dev/null 2>&1 || true
  fi
  if [ -n "$CATEGORY_ID" ]; then
    curl -s -o /dev/null -X DELETE "$BASE/api/v1/categories/$CATEGORY_ID" \
      -H "Authorization: Bearer $TOKEN" >/dev/null 2>&1 || true
  fi
}

trap 'cleanup_data; rm -f "$TMP"' EXIT

echo "=== I2b 秒杀链路冒烟测试 ==="
echo "BASE=$BASE"
echo "MYSQL_PRODUCT_HOST=$MYSQL_PRODUCT_HOST"
echo "MYSQL_PRODUCT_PORT=$MYSQL_PRODUCT_PORT"
echo ""

# ── 1. healthz ──
echo "[1/7] healthz"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/healthz")
assert_status "GET /healthz" 200 "$STATUS"

# ── 2. 注册 + 登录 ──
echo "[2/7] 注册并登录"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"nickname\":\"$NICKNAME\"}")
assert_status "POST /auth/register" 201 "$STATUS"

STATUS=$(curl -s -o "$TMP" -w "%{http_code}" -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
assert_status "POST /auth/login" 200 "$STATUS"
TOKEN=$(extract_json_string access_token)
echo "    token=${TOKEN:0:20}..."

# ── 3. 创建类目、商品并插入秒杀活动 ──
echo "[3/7] 创建商品与秒杀活动"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" -X POST "$BASE/api/v1/categories" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$CATEGORY_NAME\",\"sort_order\":1}")
assert_status "POST /categories" 201 "$STATUS"
CATEGORY_ID=$(extract_json_number id)

STATUS=$(curl -s -o "$TMP" -w "%{http_code}" -X POST "$BASE/api/v1/products" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$PRODUCT_NAME\",\"description\":\"smoke-i2b\",\"price\":19900,\"category_id\":$CATEGORY_ID,\"image_url\":\"\",\"initial_stock\":100}")
assert_status "POST /products" 201 "$STATUS"
PRODUCT_ID=$(extract_json_number id)

START_AT=$(date -u -d '1 minute ago' '+%Y-%m-%d %H:%M:%S' 2>/dev/null || python3 - <<'PY'
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc)-timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M:%S"))
PY
)
END_AT=$(date -u -d '1 hour' '+%Y-%m-%d %H:%M:%S' 2>/dev/null || python3 - <<'PY'
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc)+timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S"))
PY
)
SECKILL_ACTIVITY_ID=$(mysql_exec "INSERT INTO seckill_activities (product_id, title, seckill_price, seckill_stock, status, start_at, end_at) VALUES ($PRODUCT_ID, '$SECKILL_TITLE', 9900, $SECKILL_STOCK, 2, '$START_AT', '$END_AT'); SELECT LAST_INSERT_ID();")
echo "    category_id=$CATEGORY_ID"
echo "    product_id=$PRODUCT_ID"
echo "    seckill_activity_id=$SECKILL_ACTIVITY_ID"

# ── 4. 查询秒杀活动 ──
echo "[4/7] 查询秒杀活动"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" "$BASE/api/v1/seckill/activities/$SECKILL_ACTIVITY_ID")
assert_status "GET /seckill/activities/:id" 200 "$STATUS"
if grep -q "\"id\":$SECKILL_ACTIVITY_ID" "$TMP"; then
  echo "  ✅ 秒杀活动详情返回目标活动"
  PASS=$((PASS+1))
else
  echo "  ❌ 秒杀活动详情未返回目标活动"
  FAIL=$((FAIL+1))
fi
echo "    product_id=$PRODUCT_ID"

# ── 5. 预热秒杀活动 ──
echo "[5/7] 预热秒杀活动"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" -X POST "$BASE/api/v1/seckill/activities/$SECKILL_ACTIVITY_ID/prewarm" \
  -H "Authorization: Bearer $TOKEN")
assert_status "POST /seckill/activities/:id/prewarm" 200 "$STATUS"
if grep -q '"meta_key":"seckill:activity:' "$TMP" && grep -q '"stock_key":"seckill:activity:' "$TMP"; then
  echo "  ✅ 预热返回 meta_key / stock_key"
  PASS=$((PASS+1))
else
  echo "  ❌ 预热返回缺少 meta_key / stock_key"
  FAIL=$((FAIL+1))
fi

# ── 6. 首次抢购成功 + 重复请求冲突 ──
echo "[6/7] 首次抢购与重复请求"
REQUEST_ID="smoke-i2b-first-$(date +%s)"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" -X POST "$BASE/api/v1/seckill/activities/$SECKILL_ACTIVITY_ID/purchase" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"request_id\":\"$REQUEST_ID\",\"quantity\":1}")
assert_status "POST /seckill/activities/:id/purchase first" 202 "$STATUS"
if grep -q '"queued":true' "$TMP" && grep -q "\"request_id\":\"$REQUEST_ID\"" "$TMP"; then
  echo "  ✅ 首次抢购成功入队"
  PASS=$((PASS+1))
else
  echo "  ❌ 首次抢购返回不符合预期"
  FAIL=$((FAIL+1))
fi

STATUS=$(curl -s -o "$TMP" -w "%{http_code}" -X POST "$BASE/api/v1/seckill/activities/$SECKILL_ACTIVITY_ID/purchase" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"request_id\":\"$REQUEST_ID\",\"quantity\":1}")
assert_status "POST /seckill/activities/:id/purchase duplicate" 409 "$STATUS"
if grep -q '重复请求' "$TMP"; then
  echo "  ✅ 重复请求被幂等守卫拦截"
  PASS=$((PASS+1))
else
  echo "  ❌ 重复请求未返回预期错误"
  FAIL=$((FAIL+1))
fi

# ── 7. 用不同 request_id 循环抢购，直到库存打空后返回 409 ──
echo "[7/7] 打空库存验证"
EMPTY_HIT=0
for i in $(seq 1 $((SECKILL_STOCK + 5))); do
  RID="smoke-i2b-drain-$(date +%s)-$i"
  STATUS=$(curl -s -o "$TMP" -w "%{http_code}" -X POST "$BASE/api/v1/seckill/activities/$SECKILL_ACTIVITY_ID/purchase" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"request_id\":\"$RID\",\"quantity\":1}")
  if [ "$STATUS" = "409" ] && grep -q '库存不足' "$TMP"; then
    EMPTY_HIT=1
    echo "  ✅ 库存耗尽后返回 409"
    PASS=$((PASS+1))
    break
  fi
done

if [ "$EMPTY_HIT" -ne 1 ]; then
  echo "  ❌ 在预期尝试次数内未观察到库存耗尽后的 409"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== 结果：$PASS 通过，$FAIL 失败（共 $((PASS+FAIL))） ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
