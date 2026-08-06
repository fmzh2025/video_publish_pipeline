# Evening Codex Video Workflow

## 调用链路

18:30 定时任务执行：

```bash
cd /Volumes/T7/project/project_fmzh/2026/video_publish_pipeline
npm run evening:video
```

安装或刷新 18:30 LaunchAgent：

```bash
cd /Volumes/T7/project/project_fmzh/2026/video_publish_pipeline
scripts/install-evening-video-launchd.sh
```

完整链路：

1. `scripts/run-codex-evening-video-workflow.sh` 创建本次 `request_id` 和工作目录。
2. 脚本调用 Codex，读取 `automation/prompts/evening-video-codex.md`。
3. Codex 读取近期 `auto_publish/resources` 内容做去重，生成：
   - `video_subject`
   - `video_script`
   - `video_terms`
   - `match_materials_to_script=true`
4. Codex 写入：

   ```text
   workdir/codex-evening/<request_id>/dispatch-input.json
   ```

5. wrapper 调用：

   ```bash
   npm run dispatch -- --input workdir/codex-evening/<request_id>/dispatch-input.json
   ```

6. GitHub Action 生成 `final-1.mp4`，结束后回调当前服务器。
7. 本地 callback worker 下载 artifact，解压 `final-1.mp4`。
8. 本地 worker 调用 `auto_publish` 上传并发布到头条。

## 为什么不再消耗 Kimi 生成文本

MoneyPrinterTurbo 中的 `llm_provider=moonshot` 主要用于两件事：

- 没有 `video_script` 时生成视频旁白脚本。
- 没有 `video_terms` 时生成公开视频素材搜索词。

晚间 Codex 工作流会提前生成 `video_script` 和 `video_terms`，所以 Action 里不会再调用 Kimi 做这两步。Action 仍会使用 Pexels/Pixabay 等素材 API 搜索并下载视频素材。

如果 Codex 生成的 JSON 缺少 `video_script` 或 `video_terms`，MoneyPrinterTurbo 会回退到 Action 中配置的 LLM provider。

## 改善画面和文字不匹配

晚间任务默认设置：

```json
{
  "match_materials_to_script": true
}
```

MoneyPrinterTurbo 会把素材搜索词按脚本叙事顺序下载和拼接，避免第一个泛关键词下载过多素材，导致后半段文案没有对应画面。

## 本地配置

定时任务需要 GitHub token。不要提交 token，把它放到本地忽略文件：

```bash
cat > /Volumes/T7/project/project_fmzh/2026/video_publish_pipeline/config/local.env <<'EOF'
GITHUB_TOKEN=你的 GitHub PAT
EOF
```

Token 至少需要：

- MoneyPrinterTurbo 仓库 `Actions: Read and write`
- MoneyPrinterTurbo 仓库 `Contents: Read`

## 日志

晚间任务日志：

```text
/Volumes/T7/project/project_fmzh/2026/video_publish_pipeline/logs/evening-video-workflow.log
```

GitHub Action 回调后的本地处理状态：

```text
/Volumes/T7/project/project_fmzh/2026/video_publish_pipeline/workdir/<request_id>.status.json
```
