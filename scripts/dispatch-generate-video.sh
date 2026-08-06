#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Dispatch MoneyPrinterTurbo Generate Video workflow.

Usage:
  scripts/dispatch-generate-video.sh [options]

Options:
  --request-id <id>       External request id. Default: local-YYYYMMDD-HHMMSS
  --subject <text>        Video subject. Default: VIDEO_SUBJECT env or sample subject
  --ref <ref>             Git ref. Default: GITHUB_REF env or main
  --dry-run               Print the GitHub dispatch payload without calling the API
  -h, --help              Show this help

Environment:
  GITHUB_TOKEN            Required unless --dry-run is used. Needs Actions write.
  GITHUB_OWNER            Default: fmzh2025
  GITHUB_REPO             Default: MoneyPrinterTurbo
  GITHUB_WORKFLOW         Default: generate-video.yml

Optional input environment overrides:
  LLM_PROVIDER            Default: moonshot
  VIDEO_SOURCE            Default: pexels
  VIDEO_ASPECT            Default: 9:16
  VIDEO_COUNT             Default: 1
  VOICE_NAME              Default: zh-CN-XiaoxiaoNeural-Female
  BGM_TYPE                Default: random
  SUBTITLE_ENABLED        Default: true
  STOP_AT                 Default: video
USAGE
}

owner="${GITHUB_OWNER:-fmzh2025}"
repo="${GITHUB_REPO:-MoneyPrinterTurbo}"
workflow="${GITHUB_WORKFLOW:-generate-video.yml}"
ref="${GITHUB_REF:-main}"
request_id="local-$(date +%Y%m%d-%H%M%S)"
video_subject="${VIDEO_SUBJECT:-热浪习习的日子你会在哪里避暑}"
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --request-id)
      request_id="${2:?--request-id requires a value}"
      shift 2
      ;;
    --subject)
      video_subject="${2:?--subject requires a value}"
      shift 2
      ;;
    --ref)
      ref="${2:?--ref requires a value}"
      shift 2
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

payload="$(
  REF="$ref" \
  REQUEST_ID="$request_id" \
  VIDEO_SUBJECT="$video_subject" \
  LLM_PROVIDER="${LLM_PROVIDER:-moonshot}" \
  VIDEO_SOURCE="${VIDEO_SOURCE:-pexels}" \
  VIDEO_ASPECT="${VIDEO_ASPECT:-9:16}" \
  VIDEO_COUNT="${VIDEO_COUNT:-1}" \
  VOICE_NAME="${VOICE_NAME:-zh-CN-XiaoxiaoNeural-Female}" \
  BGM_TYPE="${BGM_TYPE:-random}" \
  SUBTITLE_ENABLED="${SUBTITLE_ENABLED:-true}" \
  STOP_AT="${STOP_AT:-video}" \
  node --input-type=module - <<'NODE'
const boolFromEnv = (value) => !["0", "false", "no", "off"].includes(String(value || "").toLowerCase());

const payload = {
  ref: process.env.REF,
  inputs: {
    request_id: process.env.REQUEST_ID,
    video_subject: process.env.VIDEO_SUBJECT,
    llm_provider: process.env.LLM_PROVIDER,
    video_source: process.env.VIDEO_SOURCE,
    video_aspect: process.env.VIDEO_ASPECT,
    video_count: process.env.VIDEO_COUNT,
    voice_name: process.env.VOICE_NAME,
    bgm_type: process.env.BGM_TYPE,
    subtitle_enabled: boolFromEnv(process.env.SUBTITLE_ENABLED),
    stop_at: process.env.STOP_AT
  }
};

process.stdout.write(JSON.stringify(payload, null, 2));
NODE
)"

if [[ "$dry_run" == "1" ]]; then
  printf '%s\n' "$payload"
  exit 0
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "GITHUB_TOKEN is required. Export a token with Actions write permission." >&2
  exit 2
fi

curl -i -X POST \
  "https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  --data-binary "$payload"
