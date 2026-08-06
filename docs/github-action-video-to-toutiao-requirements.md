# GitHub Actions 视频生成到头条全自动发布需求文档

## 1. 背景

MoneyPrinterTurbo 仓库已有 GitHub Actions 手动生成视频工作流：

- 仓库：`git@fmzh2025.github.com:fmzh2025/MoneyPrinterTurbo.git`
- 工作流：`.github/workflows/generate-video.yml`
- 生成入口：`workflow_dispatch`
- 生成命令：`uv run --no-sync python -X utf8 cli.py ...`
- 产物：`generate-result.json` 与 `storage/tasks/**/*.mp4` 等 artifact 文件

当前工作区已有头条自动发布能力：

- 目录：`/Volumes/T7/project/project_fmzh/2026/auto_publish`
- 实际目录：`/Users/fumingzhen/project/auto_publish`
- 视频发布命令：`npm run toutiao:video`
- 视频发布脚本：`scripts/toutiao_publish_video.mjs`

本需求目标是把“外部 API 触发 GitHub Actions 生成视频”和“当前服务器自动下载并发布到头条”串成可复用模块。

## 2. 评审结论

评审结论：通过。

采用方案：

1. 外部系统通过 GitHub Workflow Dispatch API 触发 MoneyPrinterTurbo 的 `generate-video.yml`。
2. GitHub Actions 结束后构造统一完成事件，并支持通过 Upstash Redis Stream 或 API Callback 上报。
3. 当前服务器运行 Worker 监听 Redis Stream，或通过 API Callback 接收同一事件。
4. Worker 下载 GitHub Actions artifact zip，解压后只取 `final-1.mp4`。
5. Worker 使用 `video_subject` 作为头条视频标题。
6. Worker 调用 `auto_publish` 的 `npm run toutiao:video -- --publish` 完成全自动上传和发布。

本期明确不额外设计：

- 失败重试治理。
- 登录态预检查。
- 重复发布防护。
- 人工审核停留页。

这些能力若存在，复用 `auto_publish` 现有实现；若现有实现覆盖不足，留到后续迭代。

## 3. 目标

### 3.1 业务目标

实现从 API 触发视频生成到头条全自动发布的闭环：

```text
外部 API
  -> GitHub Actions 生成视频
  -> Redis Stream 或 API Callback 上报完成事件
  -> 当前服务器 Worker/Callback Handler 下载 artifact
  -> 解压 final-1.mp4
  -> auto_publish 全自动发布头条视频
```

### 3.2 技术目标

- 新增独立模块目录，后续 Redis 上报、监听、下载、发布适配都在该模块复用。
- MoneyPrinterTurbo 工作流只负责生成视频和发送完成事件。
- 当前服务器 Worker 负责下载、解压和调用 `auto_publish`。
- 头条发布不走开放平台 API，不维护头条 OAuth 或视频上传 API。

## 4. 范围

### 4.1 本期范围

1. 新增模块目录：

   ```text
   /Volumes/T7/project/project_fmzh/2026/video_publish_pipeline/
   ```

2. 提供 API 触发能力：

   - 调用 GitHub Workflow Dispatch API。
   - 传入 `video_subject` 等 `generate-video.yml` 支持的 inputs。
   - 增加 `request_id` 作为链路追踪 ID。

3. 修改 MoneyPrinterTurbo 的 `generate-video.yml`：

   - 新增 `request_id` input。
   - 上传 artifact 步骤增加 `id`，读取 `artifact-id`。
   - Workflow 结束后生成统一完成事件。
   - 支持把统一完成事件 `XADD` 到 Upstash Redis Stream。
   - 支持把统一完成事件通过 HTTP POST 回调到当前服务器 API。
   - 无论成功、失败、取消，都上报状态。

4. 新增当前服务器 Worker：

   - 监听 Upstash Redis Stream，或提供 API Callback 接口接收同一事件。
   - 收到 `success` 事件后下载 artifact zip。
   - 解压 artifact。
   - 选择 `storage/tasks/**/final-1.mp4`。
   - 准备 `auto_publish/resources/...` 资源目录。
   - 写入 `description.txt` 和 `metadata.json`。
   - 调用 `npm run toutiao:video -- --publish`。

5. 处理状态回写：

   - Worker 至少写入下载、解压、发布调用结果。
   - 如果使用 Redis Stream，状态回写到 Redis hash。
   - 如果使用 API Callback，接口可直接返回 `accepted`，后续处理状态仍建议写 Redis hash 或本地日志。
   - 本期不要求可靠重试，但需要保留可排查日志。

### 4.2 非本期范围

- 不做头条开放平台 API 接入。
- 不做失败自动重试。
- 不做 Redis pending 消息回收。
- 不做多 Worker 并发协调。
- 不做发布前人工审核。
- 不做 `final-2.mp4`、`final-3.mp4` 等多视频发布。
- 不做封面自动生成。
- 不做登录态主动检测。
- 不做重复发布幂等表。

## 5. 可行性评估

### 5.1 GitHub Actions 触发

GitHub REST API 支持创建 workflow dispatch event。外部系统可以用 GitHub token 调用接口，并传入 `ref` 与 `inputs`。

要求：

- GitHub token 需要具备目标仓库 Actions 写权限。
- `generate-video.yml` 必须保留 `workflow_dispatch`。
- 触发端需要保存 `request_id` 与 GitHub run 的对应关系。

### 5.2 GitHub Artifact 下载

`actions/upload-artifact@v4` 支持输出 `artifact-id`。Workflow 可以在上传 artifact 后把该 ID 写入统一完成事件，并投递到 Redis Stream 或 API Callback。

Worker 下载时通过 GitHub Actions artifact API 获取 zip：

- artifact 是 zip 包。
- 下载 URL 短期有效，Worker 收到消息后应尽快下载。
- 私有仓库下载需要 GitHub token。

### 5.3 Upstash Redis Stream

Upstash Redis REST API 支持 Streams，但 REST API 不支持阻塞版本的 `XREAD` 和 `XREADGROUP`。

评估结论：

- GitHub Actions 上报事件使用 REST `XADD` 可行。
- 当前服务器 Worker 推荐使用 Redis TCP 客户端消费 Stream，因为 TCP 客户端可以使用阻塞读取。
- 如果 Worker 只能用 REST 轮询，建议轮询间隔不低于 10 秒，避免 Free 计划命令数被空轮询耗尽。

Upstash Free 当前约束：

- 256 MB data size。
- 10 GB monthly bandwidth。
- 500K monthly commands。

按 10 秒轮询估算，空轮询约 `30 * 24 * 60 * 60 / 10 = 259200` 次/月，低于 500K commands/月，但剩余空间有限。生产或高频任务建议升级 Pay as You Go 或使用 TCP 长连接阻塞消费。

### 5.4 API Callback

GitHub Actions 可以在工作流结束后直接向当前服务器发起 HTTP POST 回调。该方式与 Redis Stream 使用完全相同的事件字段，区别只在投递通道。

评估结论：

- API Callback 可直接替换 Redis 通知，不影响后续下载 artifact、解压 `final-1.mp4`、调用 `auto_publish` 的处理逻辑。
- Callback 请求体必须保持和 Redis Stream 消息规范一致，不增加外层 envelope。
- 当前服务器的 Callback Handler 应把请求体交给同一个 `handleWorkflowCompletedEvent` 处理函数，避免 Redis Worker 与 HTTP 回调各写一套业务逻辑。
- GitHub Actions 内的 callback 调用建议使用短超时和有限重试。本期不要求失败补偿。

### 5.5 头条发布

`auto_publish` 已有 MP4 视频发布脚本，目标页为：

```text
https://mp.toutiao.com/profile_v4/xigua/upload-video
```

本期 Worker 通过命令行调用：

```bash
npm run toutiao:video -- \
  --title "<video_subject>" \
  --video-file "<final-1.mp4绝对路径>" \
  --description-file "<description.txt绝对路径>" \
  --publish \
  --waitLogin 300000 \
  --uploadTimeout 1800000 \
  --processTimeout 1800000 \
  --keepOpen false
```

说明：

- 标题来自 `video_subject`。
- 简介本期默认可使用 `video_subject`、生成脚本摘要或固定模板，MVP 使用 `video_subject`。
- 不传 `--cover-file`，除非后续新增封面生成。
- 加 `--publish`，执行全自动发布。

## 6. 架构设计

### 6.1 模块目录建议

```text
video_publish_pipeline/
  docs/
    github-action-video-to-toutiao-requirements.md
  src/
    trigger/
      github_workflow_dispatch.*
    actions/
      report_workflow_result.*
    worker/
      redis_stream_worker.*
      api_callback_server.*
      github_artifact_downloader.*
      artifact_extractor.*
      toutiao_auto_publish_adapter.*
  config/
    example.env
  logs/
```

具体语言可后续确定。考虑 `auto_publish` 是 Node.js 项目，Worker 用 Node.js 可减少跨语言调用复杂度；触发端也可用 Node.js 或 Python。

### 6.2 运行角色

#### 触发端 API

职责：

- 接收外部请求。
- 生成 `request_id`。
- 调用 GitHub Workflow Dispatch API。
- 返回 `request_id` 和触发状态。

#### GitHub Actions

职责：

- 按 inputs 生成视频。
- 上传 artifact。
- 构造统一完成事件。
- 按配置写入 Upstash Redis Stream 或 POST 到 API Callback。

#### 当前服务器 Worker

职责：

- 监听 Redis Stream，或提供 API Callback 接口。
- 下载 artifact。
- 解压 artifact。
- 定位 `final-1.mp4`。
- 准备 `auto_publish` 资源目录。
- 调用头条视频全自动发布。
- 回写处理结果。

## 7. 接口与事件设计

### 7.1 触发 API 输入

MVP 请求体：

```json
{
  "video_subject": "人工智能如何改变普通人的日常生活",
  "video_script": "",
  "llm_provider": "moonshot",
  "video_source": "pexels",
  "video_terms": "",
  "video_language": "zh-CN",
  "video_aspect": "9:16",
  "video_count": "1",
  "voice_name": "zh-CN-XiaoxiaoNeural-Female",
  "bgm_type": "random",
  "subtitle_enabled": true,
  "stop_at": "video"
}
```

触发端补充：

```json
{
  "request_id": "uuid-or-business-id"
}
```

### 7.2 GitHub Workflow Inputs

在现有 `generate-video.yml` 基础上新增：

```yaml
request_id:
  description: External request id for downstream notification.
  required: false
  default: ""
  type: string
```

Workflow env 新增：

```yaml
REQUEST_ID: ${{ inputs.request_id }}
UPSTASH_REDIS_REST_URL: ${{ secrets.UPSTASH_REDIS_REST_URL }}
UPSTASH_REDIS_REST_TOKEN: ${{ secrets.UPSTASH_REDIS_REST_TOKEN }}
MPT_NOTIFY_CHANNEL: ${{ vars.MPT_NOTIFY_CHANNEL || 'callback' }}
MPT_CALLBACK_URL: ${{ secrets.MPT_CALLBACK_URL }}
MPT_CALLBACK_TOKEN: ${{ secrets.MPT_CALLBACK_TOKEN }}
```

通知通道说明：

```text
MPT_NOTIFY_CHANNEL=redis     只写 Redis Stream
MPT_NOTIFY_CHANNEL=callback  只调用 API Callback
MPT_NOTIFY_CHANNEL=both      Redis Stream 和 API Callback 都投递
```

MVP 可先使用 `callback` 直接替换 Redis 通知；保留 `redis` 是为了兼容前一版设计。

### 7.3 统一通知事件规范

Redis Stream 和 API Callback 必须使用同一份事件字段。差异仅限传输方式：

- Redis Stream：将事件字段作为 Stream entry fields 写入。
- API Callback：将事件字段作为 JSON body 原样 POST。

不得在 API Callback 外层增加 `data`、`payload`、`event` 等包装字段，否则会破坏两种通知方式的直接替换能力。

### 7.4 Redis Stream

Stream key：

```text
mpt:video:events
```

Consumer group：

```text
mpt-video-workers
```

Consumer name：

```text
<hostname>-<pid>
```

### 7.5 Workflow 完成事件

字段建议：

```json
{
  "event_type": "mpt.video.workflow.completed",
  "request_id": "external-request-id",
  "repository": "fmzh2025/MoneyPrinterTurbo",
  "workflow": "generate-video.yml",
  "run_id": "123456789",
  "run_attempt": "1",
  "run_url": "https://github.com/fmzh2025/MoneyPrinterTurbo/actions/runs/123456789",
  "status": "success",
  "conclusion": "success",
  "artifact_id": "123456",
  "artifact_name": "generated-video-123456789",
  "artifact_digest": "sha256:...",
  "head_sha": "...",
  "video_subject": "人工智能如何改变普通人的日常生活",
  "video_count": "1",
  "video_aspect": "9:16",
  "created_at": "2026-08-05T00:00:00Z"
}
```

状态要求：

- `success`：Worker 继续下载和发布。
- 非 `success`：Worker 记录失败状态，本期不触发发布。

### 7.6 API Callback 接口

当前服务器提供 API Callback 接口，用于接收 GitHub Actions 完成事件。接口规范与 Redis Stream 消息格式保持一致。

请求：

```http
POST /api/mpt/video/workflow-callback
Content-Type: application/json
Authorization: Bearer <MPT_CALLBACK_TOKEN>
X-MPT-Event-Type: mpt.video.workflow.completed
X-MPT-Request-Id: <request_id>
X-GitHub-Run-Id: <run_id>
```

请求体：

```json
{
  "event_type": "mpt.video.workflow.completed",
  "request_id": "external-request-id",
  "repository": "fmzh2025/MoneyPrinterTurbo",
  "workflow": "generate-video.yml",
  "run_id": "123456789",
  "run_attempt": "1",
  "run_url": "https://github.com/fmzh2025/MoneyPrinterTurbo/actions/runs/123456789",
  "status": "success",
  "conclusion": "success",
  "artifact_id": "123456",
  "artifact_name": "generated-video-123456789",
  "artifact_digest": "sha256:...",
  "head_sha": "...",
  "video_subject": "人工智能如何改变普通人的日常生活",
  "video_count": "1",
  "video_aspect": "9:16",
  "created_at": "2026-08-05T00:00:00Z"
}
```

响应：

```json
{
  "ok": true,
  "status": "accepted",
  "request_id": "external-request-id"
}
```

接口处理规则：

- `Authorization` token 不匹配时返回 `401`。
- `event_type` 不是 `mpt.video.workflow.completed` 时返回 `400`。
- 请求体缺少 `request_id`、`run_id`、`status/conclusion` 时返回 `400`。
- 请求体字段名、含义与 Redis Stream entry 保持一致。
- 接口收到合法事件后应尽快返回 `202 Accepted` 或 `200 OK`，不能等待 artifact 下载和头条发布完成。
- 后续下载、解压、发布应交给本地后台任务执行；后台任务仍调用统一处理函数 `handleWorkflowCompletedEvent(event)`。

GitHub Actions callback 调用建议：

```bash
curl -fsS --retry 2 --retry-delay 5 --max-time 30 \
  -X POST "$MPT_CALLBACK_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MPT_CALLBACK_TOKEN" \
  -H "X-MPT-Event-Type: mpt.video.workflow.completed" \
  -H "X-MPT-Request-Id: $REQUEST_ID" \
  -H "X-GitHub-Run-Id: $GITHUB_RUN_ID" \
  --data-binary @workflow-event.json
```

### 7.7 Worker 状态回写

建议使用 Redis hash：

```text
mpt:video:jobs:<request_id>
```

字段：

```json
{
  "request_id": "external-request-id",
  "run_id": "123456789",
  "status": "publishing",
  "artifact_id": "123456",
  "artifact_zip": "/absolute/path/artifact.zip",
  "final_video": "/absolute/path/final-1.mp4",
  "toutiao_title": "人工智能如何改变普通人的日常生活",
  "toutiao_status": "submitted",
  "toutiao_page_url": "https://...",
  "updated_at": "2026-08-05T00:00:00Z"
}
```

状态枚举：

```text
received
downloading
downloaded
extracting
extracted
publishing
published
workflow_failed
failed
```

## 8. Worker 处理流程

### 8.1 接收事件

Redis Stream 模式：

1. 启动时确保 consumer group 存在。
2. 使用 `XREADGROUP GROUP mpt-video-workers <consumer> BLOCK 0 STREAMS mpt:video:events >` 监听。
3. 收到事件后解析字段。

API Callback 模式：

1. 当前服务器暴露 `POST /api/mpt/video/workflow-callback`。
2. 校验 token 和事件字段。
3. 将 JSON body 原样传给统一事件处理函数。

统一处理：

1. 如果 `status/conclusion` 不是 `success`，记录 `workflow_failed` 并结束。
2. 如果成功，进入下载流程。

本期不要求处理 pending message，不要求自动重试。

### 8.2 下载 artifact

1. 使用 GitHub token 请求 artifact 下载 API。
2. 保存 zip 到模块本地工作目录，例如：

   ```text
   video_publish_pipeline/workdir/<request_id>/artifact.zip
   ```

3. 解压到：

   ```text
   video_publish_pipeline/workdir/<request_id>/artifact/
   ```

4. 查找：

   ```text
   artifact/storage/tasks/**/final-1.mp4
   ```

5. 如果找不到 `final-1.mp4`，标记 `failed`。

### 8.3 准备 auto_publish 资源目录

资源目录：

```text
/Users/fumingzhen/project/auto_publish/resources/YYYY-MM-DD_HHMMSS_<slug>/
```

写入：

```text
description.txt
metadata.json
video.mp4
source.json
```

MVP 规则：

- 将 `final-1.mp4` 复制为资源目录下的 `video.mp4`。
- `description.txt` 写入 `video_subject`。
- `metadata.json` 记录 GitHub run、artifact、request_id、final video 原路径。
- `source.json` 保留完整通知事件。事件可能来自 Redis Stream，也可能来自 API Callback。

### 8.4 调用 auto_publish

在 `/Users/fumingzhen/project/auto_publish` 执行：

```bash
npm run toutiao:video -- \
  --title "<video_subject>" \
  --video-file "<resource-dir>/video.mp4" \
  --description-file "<resource-dir>/description.txt" \
  --publish \
  --waitLogin 300000 \
  --uploadTimeout 1800000 \
  --processTimeout 1800000 \
  --keepOpen false
```

执行结果：

- `auto_publish` stdout JSON 中 `status` 为 `submitted` 或 `submitted_unverified` 时，本期均视为发布调用完成。
- Worker 把 stdout/stderr 写入本模块日志。
- Worker 将 `auto_publish` 返回的 `archiveDir`、`pageUrl`、`manageUrl` 写回 Redis hash。

## 9. 配置项

### 9.1 GitHub Actions Secrets

MoneyPrinterTurbo 仓库新增 secrets：

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
MPT_CALLBACK_URL
MPT_CALLBACK_TOKEN
```

其中：

- 使用 Redis Stream 时配置 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`。
- 使用 API Callback 时配置 `MPT_CALLBACK_URL` 和 `MPT_CALLBACK_TOKEN`。
- 两种通道可以同时配置，具体由 `MPT_NOTIFY_CHANNEL` 控制。

MoneyPrinterTurbo 仓库新增 variable：

```text
MPT_NOTIFY_CHANNEL=redis|callback|both
```

已有生成视频所需 secrets 继续保留：

```text
MOONSHOT_API_KEY
PEXELS_API_KEY
PIXABAY_API_KEY
COVERR_API_KEY
SONILO_API_KEY
...
```

### 9.2 当前服务器 Worker 环境变量

```text
UPSTASH_REDIS_URL
UPSTASH_REDIS_TOKEN
MPT_CALLBACK_PORT=8088
MPT_CALLBACK_TOKEN
GITHUB_TOKEN
GITHUB_OWNER=fmzh2025
GITHUB_REPO=MoneyPrinterTurbo
MPT_STREAM_KEY=mpt:video:events
MPT_CONSUMER_GROUP=mpt-video-workers
AUTO_PUBLISH_DIR=/Users/fumingzhen/project/auto_publish
WORKDIR=/Volumes/T7/project/project_fmzh/2026/video_publish_pipeline/workdir
```

说明：

- Worker 推荐优先使用 Redis TCP 连接串。
- 如果仅使用 Upstash REST，则需要设置轮询间隔，建议不低于 10 秒。
- 如果使用 API Callback，则当前服务器需要暴露 `POST /api/mpt/video/workflow-callback`，并保证 GitHub Actions runner 可以访问该地址。
- API Callback 和 Redis Worker 应复用同一个事件处理函数。

## 10. 安全与权限

### 10.1 GitHub Token

触发 workflow 的 token 需要 Actions 写权限。

Worker 下载 artifact 的 token 需要 Actions 读权限。

### 10.2 Upstash Token

使用 Redis Stream 通知时，GitHub Actions 上报需要写权限。

Worker 需要读取 Stream、写入状态 hash、执行 `XACK`。

使用 API Callback 替换 Redis 通知时，GitHub Actions 不需要 Upstash 写权限，但如果仍使用 Redis hash 回写处理状态，当前服务器 Worker 仍需要 Redis 写权限。

### 10.3 Callback Token

API Callback 使用 `Authorization: Bearer <MPT_CALLBACK_TOKEN>` 鉴权。

要求：

- Token 只存放在 GitHub Actions secret 和当前服务器环境变量中。
- Callback URL 必须使用 HTTPS，除非该接口只在可信内网暴露。
- Callback Handler 不应把 token 打入日志。

### 10.4 本机权限

Worker 需要：

- 读取和写入 `video_publish_pipeline/workdir`。
- 写入 `auto_publish/resources`。
- 执行 `npm run toutiao:video`。
- 访问 `auto_publish/.browser-data/toutiao` 登录态。

## 11. 验收标准

### 11.1 触发验收

- 外部 API 能触发 `generate-video.yml`。
- GitHub Actions run 能看到传入的 `video_subject` 和 `request_id`。
- API 返回 `request_id`。

### 11.2 Workflow 上报验收

- GitHub Actions 成功结束后，按 `MPT_NOTIFY_CHANNEL` 完成上报：
  - `redis`：Redis Stream 出现一条 `mpt.video.workflow.completed` 事件。
  - `callback`：当前服务器 API 收到一条 `mpt.video.workflow.completed` JSON 请求。
  - `both`：Redis Stream 和 API Callback 都收到同一事件。
- 事件包含 `request_id`、`run_id`、`artifact_id`、`video_subject`。
- API Callback 请求体与 Redis Stream 消息字段一致，不增加外层包装。
- GitHub Actions 失败时也能上报非成功状态。

### 11.3 Worker 下载验收

- Worker 能消费 Redis Stream，或 Callback Handler 能接收 HTTP 回调。
- Redis Stream 和 API Callback 都进入同一下载发布处理函数。
- Worker 能下载 artifact zip。
- Worker 能解压 zip。
- Worker 能定位并复制 `final-1.mp4`。

### 11.4 头条发布验收

- Worker 能生成 `auto_publish/resources/<目录>`。
- Worker 能调用 `npm run toutiao:video -- --publish`。
- `auto_publish` 返回 `submitted` 或 `submitted_unverified`。
- Worker 能把 `archiveDir`、`pageUrl` 或 `manageUrl` 写回 Redis。

### 11.5 日志验收

- 每个 `request_id` 有本地日志。
- 日志包含 GitHub run、artifact 下载路径、final video 路径、auto_publish 命令输出。

## 12. 实施拆分建议

### 阶段 1：Workflow 上报

- 给 `generate-video.yml` 加 `request_id`。
- 给 artifact 上传步骤加 `id`。
- 新增统一事件生成步骤，输出 `workflow-event.json`。
- 新增 Upstash `XADD` 步骤。
- 新增 API Callback `curl` 步骤。
- 用 `MPT_NOTIFY_CHANNEL` 控制 `redis`、`callback`、`both`。
- 手动触发一次验证 Redis Stream 或 API Callback 事件。

### 阶段 2：Worker 下载

- 实现统一事件处理函数。
- 实现 Redis Stream 消费。
- 实现 API Callback 接口，并把 JSON body 交给统一事件处理函数。
- 实现 artifact 下载。
- 实现 zip 解压。
- 实现 `final-1.mp4` 定位。

### 阶段 3：auto_publish 适配

- 实现资源目录生成。
- 实现 description 与 metadata 写入。
- 调用 `npm run toutiao:video -- --publish`。
- 回写 Redis 状态。

### 阶段 4：触发 API

- 封装 GitHub Workflow Dispatch API。
- 接收业务输入。
- 生成并返回 `request_id`。

## 13. 已知风险

本期接受以下风险：

- 登录态失效时，自动发布会失败或阻塞到 `auto_publish` 现有超时。
- 头条页面 DOM 变化时，Playwright 发布脚本可能失败。
- 没有重复发布防护，同一 Redis 事件被重复处理时可能重复发布。
- 没有重复发布防护，同一 API Callback 被重复请求时可能重复发布。
- 没有失败重试，失败后需要人工排查并重放。
- 没有 pending message 回收，Worker 异常退出时可能留下未确认消息。
- API Callback URL 如果公网暴露，需要依赖 bearer token 和 HTTPS 保护；本期不增加签名校验。

这些风险不阻塞本期需求实现，但应在后续生产化迭代中处理。

## 14. 参考资料

- GitHub REST API: Workflows, Create a workflow dispatch event  
  https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
- GitHub REST API: Actions Artifacts, Download an artifact  
  https://docs.github.com/en/rest/actions/artifacts#download-an-artifact
- Upstash Redis REST API  
  https://upstash.com/docs/redis/features/restapi
- Upstash Redis pricing  
  https://upstash.com/pricing/redis
- 本地 `auto_publish` 视频发布说明  
  `/Volumes/T7/project/project_fmzh/2026/auto_publish/README.md`
