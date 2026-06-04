#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/gobao-deploy/docker-compose.yml"

# 停止当前主仓编排的全部服务，但保留卷数据，便于下次继续联调。
docker compose --env-file "${ROOT_DIR}/.env" -f "${COMPOSE_FILE}" down
