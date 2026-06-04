#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
WEB_ENV_LOCAL="${ROOT_DIR}/gobao-web/.env.local"
COMPOSE_FILE="${ROOT_DIR}/gobao-deploy/docker-compose.yml"

usage() {
  cat <<'EOF'
用法:
  bash scripts/switch-env-mode.sh dev
  bash scripts/switch-env-mode.sh prod

作用:
  - 切换网关开发接口开关 GATEWAY_EXPOSE_DEV_ENDPOINTS
  - 切换用户前端开发按钮开关 VITE_EXPOSE_DEV_PASSWORD_CODE

说明:
  - 本脚本会修改根目录 .env 与 gobao-web/.env.local
  - 如需让网关新配置生效，可加 --restart-gateway

示例:
  bash scripts/switch-env-mode.sh dev --restart-gateway
  bash scripts/switch-env-mode.sh prod --restart-gateway
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令: $1"
    exit 1
  fi
}

ensure_file() {
  local target="$1"
  if [ ! -f "$target" ]; then
    mkdir -p "$(dirname "$target")"
    : > "$target"
  fi
}

set_kv() {
  local file="$1"
  local key="$2"
  local value="$3"

  ensure_file "$file"

  if grep -q "^${key}=" "$file" 2>/dev/null; then
    python3 - "$file" "$key" "$value" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
lines = path.read_text(encoding="utf-8").splitlines()
updated = []
replaced = False
for line in lines:
    if line.startswith(f"{key}="):
        updated.append(f"{key}={value}")
        replaced = True
    else:
        updated.append(line)
if not replaced:
    updated.append(f"{key}={value}")
path.write_text("\n".join(updated) + "\n", encoding="utf-8")
PY
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

MODE="${1:-}"
RESTART_GATEWAY="${2:-}"

if [[ "$MODE" != "dev" && "$MODE" != "prod" ]]; then
  usage
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  cp "${ROOT_DIR}/.env.example" "$ENV_FILE"
fi

if [ "$MODE" = "dev" ]; then
  GATEWAY_FLAG="true"
  WEB_FLAG="true"
else
  GATEWAY_FLAG="false"
  WEB_FLAG="false"
fi

set_kv "$ENV_FILE" "GATEWAY_EXPOSE_DEV_ENDPOINTS" "$GATEWAY_FLAG"
set_kv "$WEB_ENV_LOCAL" "VITE_EXPOSE_DEV_PASSWORD_CODE" "$WEB_FLAG"

echo "已切换为 ${MODE} 模式"
echo "  GATEWAY_EXPOSE_DEV_ENDPOINTS=${GATEWAY_FLAG}"
echo "  VITE_EXPOSE_DEV_PASSWORD_CODE=${WEB_FLAG}"

if [ "$RESTART_GATEWAY" = "--restart-gateway" ]; then
  require_cmd docker
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d gateway
  echo "网关已按新环境变量重建"
fi
