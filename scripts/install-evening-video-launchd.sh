#!/usr/bin/env bash
set -euo pipefail

PIPELINE_DIR="/Volumes/T7/project/project_fmzh/2026/video_publish_pipeline"
LABEL="com.codex.toutiao-autopublish.1830"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
PATH_VALUE="/Users/fumingzhen/.nvm/versions/node/v22.22.0/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$HOME/Library/LaunchAgents" "$PIPELINE_DIR/logs"

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
    <string>${PIPELINE_DIR}/scripts/run-codex-evening-video-workflow.sh</string>
  </array>
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
  </dict>
  <key>StandardOutPath</key>
  <string>${PIPELINE_DIR}/logs/${LABEL}.out.log</string>
  <key>StandardErrorPath</key>
  <string>${PIPELINE_DIR}/logs/${LABEL}.err.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl print "gui/$(id -u)/${LABEL}"
