#!/usr/bin/env bash
set -euo pipefail

SOURCE_PIPELINE_DIR="${1:-/Volumes/T7/project/project_fmzh/2026/video_publish_pipeline}"
RUNTIME_APP_DIR="${2:-$HOME/Library/Application Support/video_publish_pipeline/app}"

if [[ ! -f "$SOURCE_PIPELINE_DIR/package.json" || ! -d "$SOURCE_PIPELINE_DIR/src" ]]; then
  echo "Invalid pipeline source directory: $SOURCE_PIPELINE_DIR" >&2
  exit 1
fi

mkdir -p "$RUNTIME_APP_DIR/src"
/usr/bin/rsync -a --delete "$SOURCE_PIPELINE_DIR/src/" "$RUNTIME_APP_DIR/src/"
cp "$SOURCE_PIPELINE_DIR/package.json" "$RUNTIME_APP_DIR/package.json"

if [[ -f "$SOURCE_PIPELINE_DIR/package-lock.json" ]]; then
  cp "$SOURCE_PIPELINE_DIR/package-lock.json" "$RUNTIME_APP_DIR/package-lock.json"
fi

chmod -R u+rwX,go-rwx "$RUNTIME_APP_DIR"
echo "Deployed pipeline runtime to $RUNTIME_APP_DIR"
