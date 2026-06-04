#!/usr/bin/env bash
# smoke-i2a.sh — I2a 阶段端到端冒烟测试
# 覆盖 12 个场景：健康检查、登录鉴权、类目 CRUD、商品 CRUD、公开读接口。
# 用法：
#   BASE=http://localhost:18000 bash scripts/smoke-i2a.sh

set -uo pipefail

BASE="${BASE:-http://localhost:18000}"
PASS=0
FAIL=0
EMAIL="smoke-i2a-$(date +%s)@test.com"
PASSWORD="Test@12345"
NICKNAME="smoker-i2a"
CATEGORY_NAME="数码-$(date +%s)"
UPDATED_CATEGORY_NAME="${CATEGORY_NAME}-已更新"
PRODUCT_NAME="Phone-$(date +%s)"
UPDATED_PRODUCT_NAME="${PRODUCT_NAME}-Pro"
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

cleanup_data() {
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

echo "=== I2a 冒烟测试 ==="
echo "BASE=$BASE"
echo ""

# ── 1. healthz ──
echo "[1/12] healthz"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/healthz")
assert_status "GET /healthz" 200 "$STATUS"

# ── 2. 注册 + 登录 ──
echo "[2/12] 注册并登录"
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

# ── 3. 创建类目 ──
echo "[3/12] 创建类目"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" -X POST "$BASE/api/v1/categories" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$CATEGORY_NAME\",\"sort_order\":1}")
assert_status "POST /categories" 201 "$STATUS"
CATEGORY_ID=$(extract_json_number id)
echo "    category_id=$CATEGORY_ID"

# ── 4. 更新类目 ──
echo "[4/12] 更新类目"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" -X PUT "$BASE/api/v1/categories/$CATEGORY_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$UPDATED_CATEGORY_NAME\",\"sort_order\":2}")
assert_status "PUT /categories/:id" 200 "$STATUS"
if grep -q "\"name\":\"$UPDATED_CATEGORY_NAME\"" "$TMP"; then
  echo "  ✅ 类目更新成功"
  PASS=$((PASS+1))
else
  echo "  ❌ 类目更新结果不正确"
  FAIL=$((FAIL+1))
fi

# ── 5. 公开查询类目列表 ──
echo "[5/12] 查询类目列表"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" "$BASE/api/v1/categories")
assert_status "GET /categories" 200 "$STATUS"
if grep -q "\"name\":\"$UPDATED_CATEGORY_NAME\"" "$TMP"; then
  echo "  ✅ 类目列表包含新建类目"
  PASS=$((PASS+1))
else
  echo "  ❌ 类目列表未包含新建类目"
  FAIL=$((FAIL+1))
fi

# ── 6. 创建商品 ──
echo "[6/12] 创建商品"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" -X POST "$BASE/api/v1/products" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$PRODUCT_NAME\",\"description\":\"smoke\",\"price\":99900,\"category_id\":$CATEGORY_ID,\"image_url\":\"\",\"initial_stock\":100}")
assert_status "POST /products" 201 "$STATUS"
PRODUCT_ID=$(extract_json_number id)
echo "    product_id=$PRODUCT_ID"

# ── 7. 公开查询商品详情（含库存） ──
echo "[7/12] 查询商品详情"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" "$BASE/api/v1/products/$PRODUCT_ID")
assert_status "GET /products/:id" 200 "$STATUS"
if grep -q "\"name\":\"$PRODUCT_NAME\"" "$TMP" && grep -q '"stock_quantity":100' "$TMP"; then
  echo "  ✅ 商品详情返回初始库存 100"
  PASS=$((PASS+1))
else
  echo "  ❌ 商品详情库存不正确"
  FAIL=$((FAIL+1))
fi

# ── 8. 公开分页查询商品列表 ──
echo "[8/12] 查询商品列表"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" "$BASE/api/v1/products?page=1&page_size=10")
assert_status "GET /products" 200 "$STATUS"
if grep -q "\"id\":$PRODUCT_ID" "$TMP"; then
  echo "  ✅ 商品列表包含新建商品"
  PASS=$((PASS+1))
else
  echo "  ❌ 商品列表未包含新建商品"
  FAIL=$((FAIL+1))
fi

# ── 9. 更新商品 ──
echo "[9/12] 更新商品"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" -X PUT "$BASE/api/v1/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$UPDATED_PRODUCT_NAME\",\"description\":\"smoke-updated\",\"price\":109900,\"category_id\":$CATEGORY_ID,\"image_url\":\"\",\"status\":1}")
assert_status "PUT /products/:id" 200 "$STATUS"
if grep -q "\"name\":\"$UPDATED_PRODUCT_NAME\"" "$TMP"; then
  echo "  ✅ 商品更新成功"
  PASS=$((PASS+1))
else
  echo "  ❌ 商品更新结果不正确"
  FAIL=$((FAIL+1))
fi

# ── 10. 再次查询商品详情验证更新结果 ──
echo "[10/12] 复查商品详情"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" "$BASE/api/v1/products/$PRODUCT_ID")
assert_status "GET updated /products/:id" 200 "$STATUS"
if grep -q "\"name\":\"$UPDATED_PRODUCT_NAME\"" "$TMP"; then
  echo "  ✅ 商品详情返回更新后的名称"
  PASS=$((PASS+1))
else
  echo "  ❌ 商品详情未返回更新后的名称"
  FAIL=$((FAIL+1))
fi

# ── 11. 删除商品后再次查询应 404 ──
echo "[11/12] 删除商品"
DELETED_PRODUCT_ID="$PRODUCT_ID"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/v1/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN")
assert_status "DELETE /products/:id" 204 "$STATUS"
PRODUCT_ID=""

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/products/$DELETED_PRODUCT_ID")
assert_status "GET deleted /products/:id" 404 "$STATUS"

# ── 12. 删除类目后列表中不再出现 ──
echo "[12/12] 删除类目"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/v1/categories/$CATEGORY_ID" \
  -H "Authorization: Bearer $TOKEN")
assert_status "DELETE /categories/:id" 204 "$STATUS"
CATEGORY_ID=""

STATUS=$(curl -s -o "$TMP" -w "%{http_code}" "$BASE/api/v1/categories")
assert_status "GET /categories after delete" 200 "$STATUS"
if grep -q "\"name\":\"$UPDATED_CATEGORY_NAME\"" "$TMP"; then
  echo "  ❌ 已删除类目仍出现在列表中"
  FAIL=$((FAIL+1))
else
  echo "  ✅ 已删除类目不再出现在列表中"
  PASS=$((PASS+1))
fi

echo ""
echo "=== 结果：$PASS 通过，$FAIL 失败（共 $((PASS+FAIL))） ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
