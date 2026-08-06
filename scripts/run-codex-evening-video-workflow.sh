#!/usr/bin/env bash
set -euo pipefail

export PATH="/Users/fumingzhen/.nvm/versions/node/v22.22.0/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

PIPELINE_DIR="/Volumes/T7/project/project_fmzh/2026/video_publish_pipeline"

load_env_file() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$env_file"
    set +a
  fi
}

LOCAL_ENV_FILE="${PIPELINE_LOCAL_ENV_FILE:-$PIPELINE_DIR/config/local.env}"
load_env_file "$PIPELINE_DIR/.env"
load_env_file "$LOCAL_ENV_FILE"

CODEX_BIN="${CODEX_BIN:-/Users/fumingzhen/.nvm/versions/node/v22.22.0/bin/codex}"
PROMPT_FILE="${EVENING_VIDEO_PROMPT_FILE:-$PIPELINE_DIR/automation/prompts/evening-video-codex.md}"
CODEX_WORKDIR="${EVENING_VIDEO_CODEX_WORKDIR:-$PIPELINE_DIR}"
WORKDIR_ROOT="${WORKDIR:-$PIPELINE_DIR/workdir}"
LOG_DIR="${LOGS_DIR:-$PIPELINE_DIR/logs}"
LOCK_ROOT="${EVENING_VIDEO_LOCK_ROOT:-$PIPELINE_DIR/.locks}"
LOCK_DIR="$LOCK_ROOT/evening-video-workflow.lock"
REQUEST_ID="evening-video-$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$WORKDIR_ROOT/codex-evening/$REQUEST_ID"
OUTPUT_JSON="$RUN_DIR/dispatch-input.json"
SUBJECT_FILE="$RUN_DIR/subject.txt"

mkdir -p "$LOG_DIR" "$LOCK_ROOT" "$RUN_DIR"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "$(date '+%Y-%m-%d %H:%M:%S %Z') another evening video run is active, skip" >> "$LOG_DIR/evening-video-workflow.log"
  exit 0
fi

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "GITHUB_TOKEN is required. Put it in $LOCAL_ENV_FILE or export it in the LaunchAgent environment." >&2
  exit 2
fi

export EVENING_VIDEO_REQUEST_ID="$REQUEST_ID"
export EVENING_VIDEO_OUTPUT_JSON="$OUTPUT_JSON"
export EVENING_VIDEO_RECENT_RESOURCE_ROOT="${EVENING_VIDEO_RECENT_RESOURCE_ROOT:-/Users/fumingzhen/project/auto_publish/resources}"

if [[ -n "${EVENING_VIDEO_SUBJECT_OVERRIDE_B64:-}" ]]; then
  SUBJECT_FILE="$SUBJECT_FILE" SUBJECT_B64="$EVENING_VIDEO_SUBJECT_OVERRIDE_B64" node --input-type=module - <<'NODE'
import fs from "node:fs";
const subject = Buffer.from(process.env.SUBJECT_B64 || "", "base64").toString("utf8").trim();
if (!subject) throw new Error("EVENING_VIDEO_SUBJECT_OVERRIDE_B64 decoded to an empty subject");
fs.writeFileSync(process.env.SUBJECT_FILE, `${subject}\n`, "utf8");
NODE
  export EVENING_VIDEO_SUBJECT_FILE="$SUBJECT_FILE"
elif [[ -n "${EVENING_VIDEO_SUBJECT_OVERRIDE:-}" ]]; then
  printf '%s\n' "$EVENING_VIDEO_SUBJECT_OVERRIDE" > "$SUBJECT_FILE"
  export EVENING_VIDEO_SUBJECT_FILE="$SUBJECT_FILE"
fi

cd "$CODEX_WORKDIR"

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') evening video start request_id=$REQUEST_ID ====="
  "$CODEX_BIN" exec \
    --cd "$CODEX_WORKDIR" \
    --dangerously-bypass-approvals-and-sandbox \
    "$(cat "$PROMPT_FILE")"

  if [[ ! -s "$OUTPUT_JSON" ]]; then
    echo "Codex did not write dispatch JSON: $OUTPUT_JSON" >&2
    exit 1
  fi

  OUTPUT_JSON="$OUTPUT_JSON" SUBJECT_FILE="${EVENING_VIDEO_SUBJECT_FILE:-}" node --input-type=module - <<'NODE'
import fs from "node:fs";

const outputJson = process.env.OUTPUT_JSON;
const data = JSON.parse(fs.readFileSync(outputJson, "utf8"));
if (!data.request_id || !data.video_subject || !data.video_script) {
  throw new Error("dispatch JSON must include request_id, video_subject, and video_script");
}
if (String(data.video_subject).includes("�")) {
  throw new Error(`dispatch JSON subject has invalid replacement characters: ${data.video_subject}`);
}
if (process.env.SUBJECT_FILE) {
  const expected = fs.readFileSync(process.env.SUBJECT_FILE, "utf8").trim();
  if (data.video_subject !== expected) {
    throw new Error(`dispatch JSON subject mismatch: expected ${expected}, got ${data.video_subject}`);
  }
}
if (!Array.isArray(data.video_terms) || data.video_terms.length < 6 || data.video_terms.length > 8) {
  throw new Error("dispatch JSON video_terms must be an array with 6-8 terms");
}
if (data.match_materials_to_script !== true) {
  throw new Error("dispatch JSON match_materials_to_script must be true");
}
NODE

  cd "$PIPELINE_DIR"
  npm run dispatch -- --input "$OUTPUT_JSON"
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') evening video dispatched request_id=$REQUEST_ID ====="
} >> "$LOG_DIR/evening-video-workflow.log" 2>&1
