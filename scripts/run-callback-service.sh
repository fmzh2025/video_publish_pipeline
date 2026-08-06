#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_PIPELINE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -f "$DEFAULT_PIPELINE_DIR/app/package.json" ]]; then
  DEFAULT_PIPELINE_DIR="$DEFAULT_PIPELINE_DIR/app"
fi
PIPELINE_DIR="${PIPELINE_ROOT:-$DEFAULT_PIPELINE_DIR}"
ENV_FILE="${PIPELINE_LOCAL_ENV_FILE:-$PIPELINE_DIR/config/local.env}"
PATH_VALUE="/Users/fumingzhen/.nvm/versions/node/v22.22.0/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

export PATH="$PATH_VALUE"
export PIPELINE_ROOT="${PIPELINE_ROOT:-$PIPELINE_DIR}"
export MPT_CALLBACK_HOST="${MPT_CALLBACK_HOST:-0.0.0.0}"
export MPT_CALLBACK_PORT="${MPT_CALLBACK_PORT:-32199}"
export MPT_CALLBACK_PATH="${MPT_CALLBACK_PATH:-/api/mpt/video/workflow-callback}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

export PIPELINE_ROOT="${PIPELINE_ROOT:-$PIPELINE_DIR}"
export MPT_CALLBACK_HOST="${MPT_CALLBACK_HOST:-0.0.0.0}"
export MPT_CALLBACK_PORT="${MPT_CALLBACK_PORT:-32199}"
export MPT_CALLBACK_PATH="${MPT_CALLBACK_PATH:-/api/mpt/video/workflow-callback}"

if [[ -z "${MPT_CALLBACK_TOKEN:-}" ]]; then
  echo "MPT_CALLBACK_TOKEN is required. Put it in $ENV_FILE." >&2
  exit 1
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "GITHUB_TOKEN is required. Put it in $ENV_FILE." >&2
  exit 1
fi

mkdir -p "${LOGS_DIR:-$PIPELINE_DIR/logs}" "${WORKDIR:-$PIPELINE_DIR/workdir}"
cd "$PIPELINE_DIR"

exec npm run callback
