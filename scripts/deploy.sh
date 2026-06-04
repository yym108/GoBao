#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/gobao-deploy/docker-compose.yml"

if [ ! -f "${ROOT_DIR}/.env" ]; then
  cp "${ROOT_DIR}/.env.example" "${ROOT_DIR}/.env"
  echo "未找到 .env，已按模板生成默认配置"
fi

# 使用统一 Compose 文件拉起依赖与后端服务，适合作为主仓一键部署入口。
docker compose --env-file "${ROOT_DIR}/.env" -f "${COMPOSE_FILE}" up -d --build

echo "GoBao 服务已启动"
echo "Gateway: http://localhost:${GATEWAY_HTTP_PORT:-18000}"
echo "Web: http://localhost:${WEB_PORT:-5173}"
echo "Admin Web: http://localhost:${ADMIN_WEB_PORT:-5174}"
echo "Prometheus: http://localhost:${PROMETHEUS_PORT:-9090}"
