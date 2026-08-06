# Local GitHub Action Dispatch

本地触发 MoneyPrinterTurbo 生成视频 workflow 使用：

```bash
cd /Volumes/T7/project/project_fmzh/2026/video_publish_pipeline
export GITHUB_TOKEN='你的 GitHub PAT'

npm run dispatch:action -- \
  --request-id local-20260805-001 \
  --subject '热浪习习的日子你会在哪里避暑'
```

成功时 GitHub API 返回 `204 No Content`。

先检查 payload，不实际调用 GitHub：

```bash
npm run dispatch:action -- \
  --dry-run \
  --request-id local-20260805-001 \
  --subject '热浪习习的日子你会在哪里避暑'
```

脚本位置：

```bash
video_publish_pipeline/scripts/dispatch-generate-video.sh
```

脚本不会保存 token，必须通过 `GITHUB_TOKEN` 环境变量传入。Fine-grained PAT 至少需要：

- `Actions: Read and write`
- `Contents: Read`

默认发送的 workflow input 保持在 10 个以内，避免 GitHub `workflow_dispatch` API 的 input 数量限制。
