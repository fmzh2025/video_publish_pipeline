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
npm run evening:install
```

为避免 macOS LaunchAgent 直接执行外置盘脚本时被 System Policy 拦截，安装过程会复制本机 runner 和 env 到：

```text
/Users/fumingzhen/Library/Application Support/video_publish_pipeline/evening-video/
```

LaunchAgent 的运行时文件放在 Home 目录，源码和提示词仍从 T7 仓库读取：

```text
/Users/fumingzhen/Library/Application Support/video_publish_pipeline/evening-video/runtime/workdir
/Users/fumingzhen/Library/Application Support/video_publish_pipeline/evening-video/runtime/.locks
```

LaunchAgent 日志位于：

```text
/Users/fumingzhen/Library/Logs/video_publish_pipeline/com.codex.toutiao-autopublish.1830.out.log
/Users/fumingzhen/Library/Logs/video_publish_pipeline/com.codex.toutiao-autopublish.1830.err.log
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

## 主题风格

晚间任务默认生成 MoneyPrinterTurbo/AI 内容创作相关主题，不再走泛生活观察或泛历史故事方向。

主题优先围绕：

- AI 工具使用
- 普通人机会
- 效率提升
- 内容生产
- 短视频创作
- 职场变化
- 自动化工作流

标题需要有一点关注度和反差感，但不能承诺暴富或制造过度焦虑。推荐风格类似：

```text
不会用AI的人正在掉队
普通人也能用AI做视频
AI正在偷走重复劳动
会提问的人先赚到时间
短视频创作正在变简单
```

## Callback 常驻服务

当前本地 callback 服务监听：

```text
0.0.0.0:32199/api/mpt/video/workflow-callback
```

外网回调域名：

```text
https://callback.foxhello.cn/api/mpt/video/workflow-callback
```

MoneyPrinterTurbo 仓库的 GitHub Actions secrets 需要配置：

```text
MPT_CALLBACK_URL=https://callback.foxhello.cn/api/mpt/video/workflow-callback
MPT_CALLBACK_TOKEN=<与本机 config/local.env 相同的 token>
```

如果使用 GitHub API 自动设置 secrets，PAT 需要具备仓库 Actions secrets 读写权限；普通 workflow dispatch/artifact 下载 token 不足以修改 secrets。

安装或刷新 callback LaunchAgent：

```bash
cd /Volumes/T7/project/project_fmzh/2026/video_publish_pipeline
npm run callback:install
```

LaunchAgent 配置：

- Label: `com.codex.video-publish-callback`
- RunAtLoad: 登录后自动启动
- KeepAlive: 进程退出后自动拉起
- stdout: `/Users/fumingzhen/Library/Logs/video_publish_pipeline/com.codex.video-publish-callback.out.log`
- stderr: `/Users/fumingzhen/Library/Logs/video_publish_pipeline/com.codex.video-publish-callback.err.log`

手动查看监听：

```bash
lsof -nP -iTCP:32199 -sTCP:LISTEN
```

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
MPT_CALLBACK_HOST=0.0.0.0
MPT_CALLBACK_PORT=32199
MPT_CALLBACK_PATH=/api/mpt/video/workflow-callback
MPT_CALLBACK_TOKEN=你的回调鉴权 token
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
/Users/fumingzhen/Library/Application Support/video_publish_pipeline/runtime/workdir/<request_id>.status.json
```
