#!/usr/bin/env bash

set -euo pipefail

# 检查基础命令是否存在，避免部署脚本在半途中断。
require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令: $1"
    exit 1
  fi
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

require_cmd docker

if ! docker compose version >/dev/null 2>&1; then
  echo "当前环境未检测到 docker compose"
  exit 1
fi

if [ ! -f "${ROOT_DIR}/.env" ]; then
  cp "${ROOT_DIR}/.env.example" "${ROOT_DIR}/.env"
  echo "已生成 ${ROOT_DIR}/.env"
else
  echo "检测到已有 ${ROOT_DIR}/.env，保留现有配置"
fi

# 统一赋予部署脚本执行权限，便于跨机器 clone 后直接运行。
chmod +x \
  "${ROOT_DIR}/scripts/bootstrap.sh" \
  "${ROOT_DIR}/scripts/deploy.sh" \
  "${ROOT_DIR}/scripts/stop.sh" \
  "${ROOT_DIR}/scripts/reset.sh" \
  "${ROOT_DIR}/scripts/switch-env-mode.sh"

echo "基础检查完成，可以继续执行 bash scripts/deploy.sh"
