#!/usr/bin/env bash
set -euo pipefail

LABEL="com.codex.toutiao-autopublish.preflight"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
SUPPORT_DIR="$HOME/Library/Application Support/video_publish_pipeline"
APP_DIR="$SUPPORT_DIR/app"
RUNNER_DIR="$SUPPORT_DIR/evening-video"
RUNNER="$RUNNER_DIR/run-codex-evening-video-workflow.sh"
RUNNER_ENV="$RUNNER_DIR/local.env"
RUNNER_PROMPT="$RUNNER_DIR/evening-video-codex.md"
RUNTIME_DIR="$RUNNER_DIR/runtime"
LOG_DIR="$HOME/Library/Logs/video_publish_pipeline"
OUT_LOG="$LOG_DIR/${LABEL}.out.log"
ERR_LOG="$LOG_DIR/${LABEL}.err.log"
PATH_VALUE="/Users/fumingzhen/.nvm/versions/node/v22.22.0/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

for required in "$APP_DIR/package.json" "$RUNNER" "$RUNNER_ENV" "$RUNNER_PROMPT"; do
  if [[ ! -e "$required" ]]; then
    echo "Missing installed runtime file: $required" >&2
    exit 1
  fi
done

cleanup() {
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
  rm -f "$PLIST"
}
trap cleanup EXIT

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
: > "$OUT_LOG"
: > "$ERR_LOG"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${RUNNER}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${RUNNER_DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${PATH_VALUE}</string>
    <key>PIPELINE_LOCAL_ENV_FILE</key>
    <string>${RUNNER_ENV}</string>
    <key>PIPELINE_ROOT</key>
    <string>${APP_DIR}</string>
    <key>WORKDIR</key>
    <string>${RUNTIME_DIR}/workdir</string>
    <key>LOGS_DIR</key>
    <string>${LOG_DIR}</string>
    <key>EVENING_VIDEO_LOCK_ROOT</key>
    <string>${RUNTIME_DIR}/.locks</string>
    <key>EVENING_VIDEO_PROMPT_FILE</key>
    <string>${RUNNER_PROMPT}</string>
    <key>EVENING_VIDEO_CODEX_WORKDIR</key>
    <string>${RUNNER_DIR}</string>
    <key>EVENING_VIDEO_PREFLIGHT_ONLY</key>
    <string>true</string>
    <key>EVENING_VIDEO_PREFLIGHT_CODEX</key>
    <string>true</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${OUT_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${ERR_LOG}</string>
</dict>
</plist>
PLIST

chmod 644 "$PLIST"
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

for _ in $(seq 1 120); do
  job_state="$(launchctl print "gui/$(id -u)/${LABEL}" 2>/dev/null || true)"
  if grep -q "runs = 1" <<<"$job_state" && grep -q "state = not running" <<<"$job_state"; then
    if grep -q "last exit code = 0" <<<"$job_state"; then
      cat "$OUT_LOG"
      cat "$ERR_LOG" >&2
      echo "LaunchAgent evening preflight passed"
      exit 0
    fi
    cat "$OUT_LOG"
    cat "$ERR_LOG" >&2
    echo "LaunchAgent evening preflight failed" >&2
    exit 1
  fi
  sleep 1
done

cat "$OUT_LOG"
cat "$ERR_LOG" >&2
echo "LaunchAgent evening preflight timed out" >&2
exit 1
