#!/usr/bin/env bash
set -euo pipefail

SOURCE_PIPELINE_DIR="/Volumes/T7/project/project_fmzh/2026/video_publish_pipeline"
LABEL="com.codex.video-publish-callback"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs/video_publish_pipeline"
RUNNER_DIR="$HOME/Library/Application Support/video_publish_pipeline"
APP_DIR="$RUNNER_DIR/app"
RUNNER="$RUNNER_DIR/run-callback-service.sh"
RUNNER_ENV="$RUNNER_DIR/local.env"
RUNTIME_DIR="$RUNNER_DIR/runtime"
PATH_VALUE="/Users/fumingzhen/.nvm/versions/node/v22.22.0/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR" "$RUNNER_DIR" "$RUNTIME_DIR/workdir"
"$SOURCE_PIPELINE_DIR/scripts/deploy-home-runtime.sh" "$SOURCE_PIPELINE_DIR" "$APP_DIR"
if [[ -f "$SOURCE_PIPELINE_DIR/config/local.env" ]]; then
  cp "$SOURCE_PIPELINE_DIR/config/local.env" "$RUNNER_ENV"
  chmod 600 "$RUNNER_ENV"
fi

cat > "$RUNNER" <<RUNNER
#!/usr/bin/env bash
set -euo pipefail

PIPELINE_DIR="${APP_DIR}"
ENV_FILE="${RUNNER_ENV}"
PATH_VALUE="${PATH_VALUE}"

export PATH="\$PATH_VALUE"
export PIPELINE_ROOT="\${PIPELINE_ROOT:-\$PIPELINE_DIR}"
export MPT_CALLBACK_HOST="\${MPT_CALLBACK_HOST:-0.0.0.0}"
export MPT_CALLBACK_PORT="\${MPT_CALLBACK_PORT:-32199}"
export MPT_CALLBACK_PATH="\${MPT_CALLBACK_PATH:-/api/mpt/video/workflow-callback}"
export WORKDIR="\${WORKDIR:-${RUNTIME_DIR}/workdir}"
export LOGS_DIR="\${LOGS_DIR:-${LOG_DIR}}"

if [[ -f "\$ENV_FILE" ]]; then
  set -a
  source "\$ENV_FILE"
  set +a
fi

export PIPELINE_ROOT="\${PIPELINE_ROOT:-\$PIPELINE_DIR}"
export MPT_CALLBACK_HOST="\${MPT_CALLBACK_HOST:-0.0.0.0}"
export MPT_CALLBACK_PORT="\${MPT_CALLBACK_PORT:-32199}"
export MPT_CALLBACK_PATH="\${MPT_CALLBACK_PATH:-/api/mpt/video/workflow-callback}"
export WORKDIR="\${WORKDIR:-${RUNTIME_DIR}/workdir}"
export LOGS_DIR="\${LOGS_DIR:-${LOG_DIR}}"

if [[ -z "\${MPT_CALLBACK_TOKEN:-}" ]]; then
  echo "MPT_CALLBACK_TOKEN is required. Put it in \$ENV_FILE." >&2
  exit 1
fi

if [[ -z "\${GITHUB_TOKEN:-}" ]]; then
  echo "GITHUB_TOKEN is required. Put it in \$ENV_FILE." >&2
  exit 1
fi

mkdir -p "\$LOGS_DIR" "\$WORKDIR"
cd "\$PIPELINE_DIR"

exec npm run callback
RUNNER
chmod 755 "$RUNNER"

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
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${PATH_VALUE}</string>
    <key>PIPELINE_ROOT</key>
    <string>${APP_DIR}</string>
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
launchctl kickstart -k "gui/$(id -u)/${LABEL}"
launchctl print "gui/$(id -u)/${LABEL}"
