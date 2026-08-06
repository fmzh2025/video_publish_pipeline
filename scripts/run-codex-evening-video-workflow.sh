#!/usr/bin/env bash
set -euo pipefail

export PATH="/Users/fumingzhen/.nvm/versions/node/v22.22.0/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

PIPELINE_DIR="/Volumes/T7/project/project_fmzh/2026/video_publish_pipeline"
CODEX_BIN="${CODEX_BIN:-/Users/fumingzhen/.nvm/versions/node/v22.22.0/bin/codex}"
PROMPT_FILE="$PIPELINE_DIR/automation/prompts/evening-video-codex.md"
LOG_DIR="$PIPELINE_DIR/logs"
LOCK_DIR="$PIPELINE_DIR/.locks/evening-video-workflow.lock"
REQUEST_ID="evening-video-$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$PIPELINE_DIR/workdir/codex-evening/$REQUEST_ID"
OUTPUT_JSON="$RUN_DIR/dispatch-input.json"

mkdir -p "$LOG_DIR" "$PIPELINE_DIR/.locks" "$RUN_DIR"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "$(date '+%Y-%m-%d %H:%M:%S %Z') another evening video run is active, skip" >> "$LOG_DIR/evening-video-workflow.log"
  exit 0
fi

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT

load_env_file() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$env_file"
    set +a
  fi
}

load_env_file "$PIPELINE_DIR/.env"
load_env_file "$PIPELINE_DIR/config/local.env"

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "GITHUB_TOKEN is required. Put it in $PIPELINE_DIR/config/local.env or export it in the LaunchAgent environment." >&2
  exit 2
fi

export EVENING_VIDEO_REQUEST_ID="$REQUEST_ID"
export EVENING_VIDEO_OUTPUT_JSON="$OUTPUT_JSON"
export EVENING_VIDEO_RECENT_RESOURCE_ROOT="${EVENING_VIDEO_RECENT_RESOURCE_ROOT:-/Users/fumingzhen/project/auto_publish/resources}"

cd "$PIPELINE_DIR"

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') evening video start request_id=$REQUEST_ID ====="
  "$CODEX_BIN" exec \
    --cd "$PIPELINE_DIR" \
    --dangerously-bypass-approvals-and-sandbox \
    "$(cat "$PROMPT_FILE")"

  if [[ ! -s "$OUTPUT_JSON" ]]; then
    echo "Codex did not write dispatch JSON: $OUTPUT_JSON" >&2
    exit 1
  fi

  npm run dispatch -- --input "$OUTPUT_JSON"
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') evening video dispatched request_id=$REQUEST_ID ====="
} >> "$LOG_DIR/evening-video-workflow.log" 2>&1
