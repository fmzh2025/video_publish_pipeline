# API Callback 接口契约

## 1. 用途

GitHub Actions 在视频生成工作流结束后，向当前服务器发送统一完成事件。该接口用于替代 Redis Stream 通知，事件字段必须与 Redis Stream 消息格式保持一致。

## 2. Endpoint

```http
POST /api/mpt/video/workflow-callback
```

建议部署地址：

```text
https://<current-server-domain>/api/mpt/video/workflow-callback
```

开发环境可使用内网地址或反向代理地址，但 GitHub Actions runner 必须能访问。

## 3. 鉴权

请求头：

```http
Authorization: Bearer <MPT_CALLBACK_TOKEN>
```

规则：

- token 不匹配返回 `401 Unauthorized`。
- token 缺失返回 `401 Unauthorized`。
- 不把 token 写入日志。

## 4. 请求头

```http
Content-Type: application/json
Authorization: Bearer <MPT_CALLBACK_TOKEN>
X-MPT-Event-Type: mpt.video.workflow.completed
X-MPT-Request-Id: <request_id>
X-GitHub-Run-Id: <run_id>
```

请求头用于快速排查和网关日志检索；业务处理以 JSON body 为准。

## 5. 请求体

请求体必须是统一完成事件 JSON，不允许增加外层包装。

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
  "artifact_digest": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "head_sha": "0000000000000000000000000000000000000000",
  "video_subject": "人工智能如何改变普通人的日常生活",
  "video_count": "1",
  "video_aspect": "9:16",
  "created_at": "2026-08-05T00:00:00Z"
}
```

## 6. 字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `event_type` | 是 | 固定为 `mpt.video.workflow.completed` |
| `request_id` | 是 | 外部触发链路 ID |
| `repository` | 是 | GitHub 仓库，例如 `fmzh2025/MoneyPrinterTurbo` |
| `workflow` | 是 | Workflow 文件名，例如 `generate-video.yml` |
| `run_id` | 是 | GitHub Actions run id |
| `run_attempt` | 是 | GitHub Actions run attempt |
| `run_url` | 是 | GitHub Actions run 页面 |
| `status` | 是 | MVP 使用 `success` 或非成功状态 |
| `conclusion` | 是 | GitHub job/workflow 结论 |
| `artifact_id` | 成功时是 | artifact id，用于下载 zip |
| `artifact_name` | 成功时是 | artifact 名称 |
| `artifact_digest` | 否 | artifact digest |
| `head_sha` | 是 | workflow 对应 commit |
| `video_subject` | 是 | 视频主题，同时作为头条标题来源 |
| `video_count` | 否 | 视频生成数量 |
| `video_aspect` | 否 | 视频画幅 |
| `created_at` | 是 | 事件生成时间 |

## 7. 响应

成功接收：

```http
HTTP/1.1 202 Accepted
Content-Type: application/json
```

```json
{
  "ok": true,
  "status": "accepted",
  "request_id": "external-request-id"
}
```

接口应只完成鉴权、字段校验和任务接收，然后尽快返回。artifact 下载和头条发布可能持续数分钟到数十分钟，不能阻塞 GitHub Actions callback 请求。

## 8. 错误响应

### 8.1 鉴权失败

```http
HTTP/1.1 401 Unauthorized
```

```json
{
  "ok": false,
  "error": "unauthorized"
}
```

### 8.2 请求不合法

```http
HTTP/1.1 400 Bad Request
```

```json
{
  "ok": false,
  "error": "invalid_event",
  "message": "missing field: request_id"
}
```

### 8.3 服务端处理失败

```http
HTTP/1.1 500 Internal Server Error
```

```json
{
  "ok": false,
  "error": "internal_error"
}
```

## 9. 处理规则

1. 校验 `Authorization`。
2. 校验 `event_type`。
3. 校验 `request_id`、`run_id`、`status`、`conclusion`。
4. 将完整 JSON body 原样写入本地日志。
5. 将完整 JSON body 投递给本地后台任务。
6. 后台任务调用统一处理函数 `handleWorkflowCompletedEvent(event)`。
7. `conclusion != success` 时记录 `workflow_failed`，不下载、不发布。
8. `conclusion == success` 时进入 artifact 下载和头条发布流程。

## 10. GitHub Actions 调用示例

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

## 11. 替换 Redis Stream 的约束

API Callback 请求体与 Redis Stream entry 字段一致：

- Redis Stream：`XADD mpt:video:events * event_type ... request_id ...`
- API Callback：`POST` 同字段 JSON body

下游处理函数只接收一个事件对象，不关心事件来自 Redis 还是 HTTP。
