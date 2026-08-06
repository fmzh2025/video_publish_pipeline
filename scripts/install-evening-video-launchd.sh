#!/usr/bin/env bash
set -euo pipefail

PIPELINE_DIR="/Volumes/T7/project/project_fmzh/2026/video_publish_pipeline"
LABEL="com.codex.toutiao-autopublish.1830"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs/video_publish_pipeline"
RUNNER_DIR="$HOME/Library/Application Support/video_publish_pipeline/evening-video"
RUNNER="$RUNNER_DIR/run-codex-evening-video-workflow.sh"
RUNNER_ENV="$RUNNER_DIR/local.env"
RUNNER_PROMPT="$RUNNER_DIR/evening-video-codex.md"
RUNTIME_DIR="$RUNNER_DIR/runtime"
PATH_VALUE="/Users/fumingzhen/.nvm/versions/node/v22.22.0/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR" "$RUNNER_DIR" "$RUNTIME_DIR/workdir" "$RUNTIME_DIR/.locks"

if [[ ! -f "$PIPELINE_DIR/config/local.env" ]]; then
  echo "Missing local environment file: $PIPELINE_DIR/config/local.env" >&2
  exit 1
fi

cp "$PIPELINE_DIR/scripts/run-codex-evening-video-workflow.sh" "$RUNNER"
cp "$PIPELINE_DIR/config/local.env" "$RUNNER_ENV"
cp "$PIPELINE_DIR/automation/prompts/evening-video-codex.md" "$RUNNER_PROMPT"
chmod 755 "$RUNNER"
chmod 600 "$RUNNER_ENV"
chmod 644 "$RUNNER_PROMPT"

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
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>18</integer>
    <key>Minute</key>
    <integer>30</integer>
  </dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${PATH_VALUE}</string>
    <key>PIPELINE_LOCAL_ENV_FILE</key>
    <string>${RUNNER_ENV}</string>
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
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/${LABEL}.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/${LABEL}.err.log</string>
</dict>
</plist>
PLIST

chmod 644 "$PLIST"
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl print "gui/$(id -u)/${LABEL}"
