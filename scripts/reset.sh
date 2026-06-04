#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/gobao-deploy/docker-compose.yml"

echo "即将清理当前 Compose 容器、网络和卷中的测试数据"

# 彻底清理联调数据，保证每次测试可以从干净环境重新开始。
docker compose --env-file "${ROOT_DIR}/.env" -f "${COMPOSE_FILE}" down -v
