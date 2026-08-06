# `generate-video.yml` 通知改造片段

以下片段用于改造 MoneyPrinterTurbo 的 `.github/workflows/generate-video.yml`。

## 1. 新增 workflow input

```yaml
request_id:
  description: External request id for downstream notification.
  required: false
  default: ""
  type: string
```

## 2. 新增 job env

```yaml
REQUEST_ID: ${{ inputs.request_id }}
MPT_NOTIFY_CHANNEL: ${{ vars.MPT_NOTIFY_CHANNEL || 'callback' }}
UPSTASH_REDIS_REST_URL: ${{ secrets.UPSTASH_REDIS_REST_URL }}
UPSTASH_REDIS_REST_TOKEN: ${{ secrets.UPSTASH_REDIS_REST_TOKEN }}
MPT_CALLBACK_URL: ${{ secrets.MPT_CALLBACK_URL }}
MPT_CALLBACK_TOKEN: ${{ secrets.MPT_CALLBACK_TOKEN }}
```

## 3. 给 artifact 上传步骤增加 id

```yaml
- name: Upload generated artifacts
  id: upload_artifact
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: generated-video-${{ github.run_id }}
    path: |
      generate-result.json
      storage/tasks/**/*.mp4
      storage/tasks/**/*.mp3
      storage/tasks/**/*.srt
      storage/tasks/**/*.json
    if-no-files-found: warn
    retention-days: 7
```

## 4. 生成统一完成事件

```yaml
- name: Build workflow notification event
  id: build_notification_event
  if: always()
  env:
    JOB_STATUS: ${{ job.status }}
    ARTIFACT_ID: ${{ steps.upload_artifact.outputs.artifact-id }}
    ARTIFACT_DIGEST: ${{ steps.upload_artifact.outputs.artifact-digest }}
  run: |
    uv run --no-sync python - <<'PY'
    import json
    import os
    from datetime import datetime, timezone

    repository = os.environ.get("GITHUB_REPOSITORY", "")
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    run_attempt = os.environ.get("GITHUB_RUN_ATTEMPT", "")
    event = {
        "event_type": "mpt.video.workflow.completed",
        "request_id": os.environ.get("REQUEST_ID", ""),
        "repository": repository,
        "workflow": "generate-video.yml",
        "run_id": run_id,
        "run_attempt": run_attempt,
        "run_url": f"https://github.com/{repository}/actions/runs/{run_id}",
        "status": os.environ.get("JOB_STATUS", ""),
        "conclusion": os.environ.get("JOB_STATUS", ""),
        "artifact_id": os.environ.get("ARTIFACT_ID", ""),
        "artifact_name": f"generated-video-{run_id}",
        "artifact_digest": os.environ.get("ARTIFACT_DIGEST", ""),
        "head_sha": os.environ.get("GITHUB_SHA", ""),
        "video_subject": os.environ.get("VIDEO_SUBJECT", ""),
        "video_count": os.environ.get("VIDEO_COUNT", ""),
        "video_aspect": os.environ.get("VIDEO_ASPECT", ""),
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    with open("workflow-event.json", "w", encoding="utf-8") as f:
        json.dump(event, f, ensure_ascii=False)
    print(json.dumps(event, ensure_ascii=False))
    PY
```

## 5. API Callback 通知

```yaml
- name: Notify callback endpoint
  if: always()
  env:
    MPT_NOTIFY_CHANNEL: ${{ vars.MPT_NOTIFY_CHANNEL || 'callback' }}
    MPT_CALLBACK_URL: ${{ secrets.MPT_CALLBACK_URL }}
    MPT_CALLBACK_TOKEN: ${{ secrets.MPT_CALLBACK_TOKEN }}
  run: |
    if [ "$MPT_NOTIFY_CHANNEL" != "callback" ] && [ "$MPT_NOTIFY_CHANNEL" != "both" ]; then
      echo "MPT_NOTIFY_CHANNEL=$MPT_NOTIFY_CHANNEL, skip callback notification."
      exit 0
    fi

    if [ -z "${MPT_CALLBACK_URL:-}" ] || [ -z "${MPT_CALLBACK_TOKEN:-}" ]; then
      echo "MPT_CALLBACK_URL or MPT_CALLBACK_TOKEN is missing, skip callback notification."
      exit 0
    fi

    curl -fsS --retry 2 --retry-delay 5 --max-time 30 \
      -X POST "$MPT_CALLBACK_URL" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $MPT_CALLBACK_TOKEN" \
      -H "X-MPT-Event-Type: mpt.video.workflow.completed" \
      -H "X-MPT-Request-Id: $REQUEST_ID" \
      -H "X-GitHub-Run-Id: $GITHUB_RUN_ID" \
      --data-binary @workflow-event.json
```

## 6. Redis Stream 通知

```yaml
- name: Notify Upstash Redis Stream
  if: always()
  env:
    MPT_NOTIFY_CHANNEL: ${{ vars.MPT_NOTIFY_CHANNEL || 'callback' }}
    UPSTASH_REDIS_REST_URL: ${{ secrets.UPSTASH_REDIS_REST_URL }}
    UPSTASH_REDIS_REST_TOKEN: ${{ secrets.UPSTASH_REDIS_REST_TOKEN }}
  run: |
    if [ "$MPT_NOTIFY_CHANNEL" != "redis" ] && [ "$MPT_NOTIFY_CHANNEL" != "both" ]; then
      echo "MPT_NOTIFY_CHANNEL=$MPT_NOTIFY_CHANNEL, skip Redis notification."
      exit 0
    fi

    if [ -z "${UPSTASH_REDIS_REST_URL:-}" ] || [ -z "${UPSTASH_REDIS_REST_TOKEN:-}" ]; then
      echo "UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing, skip Redis notification."
      exit 0
    fi

    uv run --no-sync python - <<'PY'
    import json
    import os
    import subprocess

    with open("workflow-event.json", "r", encoding="utf-8") as f:
        event = json.load(f)

    args = ["XADD", "mpt:video:events", "*"]
    for key, value in event.items():
        args.extend([key, "" if value is None else str(value)])

    url = os.environ["UPSTASH_REDIS_REST_URL"].rstrip("/")
    token = os.environ["UPSTASH_REDIS_REST_TOKEN"]
    subprocess.run(
        [
            "curl",
            "-fsS",
            "-X",
            "POST",
            f"{url}/pipeline",
            "-H",
            f"Authorization: Bearer {token}",
            "-H",
            "Content-Type: application/json",
            "--data-binary",
            json.dumps([args], ensure_ascii=False),
        ],
        check=True,
    )
    PY
```

## 7. 注意事项

- `workflow-event.json` 是 Redis Stream 和 API Callback 的共同源。
- API Callback 不加外层 envelope。
- `MPT_NOTIFY_CHANNEL=callback` 可直接替换 Redis 通知。
- Redis REST 的 URL 和 body 格式需在实装时按 Upstash 当前文档验证。
