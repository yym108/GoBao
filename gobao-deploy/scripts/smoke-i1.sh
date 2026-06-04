#!/usr/bin/env bash
# smoke-i1.sh — I1 阶段端到端冒烟测试
# 覆盖 8 个场景：健康检查、注册、登录、鉴权访问、无 token 拒绝、重复注册、错误密码
# 用法：docker-compose up -d --build && sleep 20 && bash scripts/smoke-i1.sh

set -uo pipefail

BASE="http://localhost:18000"
PASS=0
FAIL=0
EMAIL="smoke-$(date +%s)@test.com"
PASSWORD="Test@12345"
NICKNAME="smoker"
TMP=$(mktemp)

assert_status() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✅ $desc (HTTP $actual)"
    PASS=$((PASS+1))
  else
    echo "  ❌ $desc — 期望 $expected，实际 $actual"
    FAIL=$((FAIL+1))
  fi
}

trap 'rm -f "$TMP"' EXIT

echo "=== I1 冒烟测试 ==="
echo ""

# ── 1. healthz ──
echo "[1/8] healthz"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/healthz")
assert_status "GET /healthz" 200 "$STATUS"

# ── 2. 注册 ──
echo "[2/8] 注册新用户"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" -X POST "$BASE/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"nickname\":\"$NICKNAME\"}")
assert_status "POST /auth/register" 201 "$STATUS"
USER_ID=$(grep -o '"user_id":[0-9]*' "$TMP" | cut -d: -f2)
echo "    user_id=$USER_ID"

# ── 3. 登录 ──
echo "[3/8] 登录"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
assert_status "POST /auth/login" 200 "$STATUS"
TOKEN=$(grep -o '"access_token":"[^"]*"' "$TMP" | cut -d'"' -f4)
echo "    token=${TOKEN:0:20}..."

# ── 4. 带 token 访问 /auth/me ──
echo "[4/8] 带 token 访问 /auth/me"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" "$BASE/api/v1/auth/me" \
  -H "Authorization: Bearer $TOKEN")
assert_status "GET /auth/me" 200 "$STATUS"
echo "    body=$(cat "$TMP")"

# ── 5. 带 token 访问 /ping ──
echo "[5/8] 带 token 访问 /ping"
STATUS=$(curl -s -o "$TMP" -w "%{http_code}" "$BASE/api/v1/ping" \
  -H "Authorization: Bearer $TOKEN")
assert_status "GET /ping (with token)" 200 "$STATUS"
echo "    body=$(cat "$TMP")"

# ── 6. 无 token 访问 /ping → 401 ──
echo "[6/8] 无 token 访问 /ping"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/ping")
assert_status "GET /ping (no token)" 401 "$STATUS"

# ── 7. 重复注册 → 409 ──
echo "[7/8] 重复注册"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"nickname\":\"$NICKNAME\"}")
assert_status "POST /auth/register (duplicate)" 409 "$STATUS"

# ── 8. 错误密码登录 → 401 ──
echo "[8/8] 错误密码登录"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrong-password\"}")
assert_status "POST /auth/login (wrong password)" 401 "$STATUS"

# ── 汇总 ──
echo ""
echo "=== 结果：$PASS 通过，$FAIL 失败（共 $((PASS+FAIL))） ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1