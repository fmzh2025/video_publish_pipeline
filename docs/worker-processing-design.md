# Worker 处理设计

## 1. 设计目标

Worker 负责把 GitHub Actions 完成事件转换为头条视频发布动作。

入口可以是：

- Redis Stream consumer。
- API Callback HTTP handler。

两个入口必须复用同一个核心函数：

```text
handleWorkflowCompletedEvent(event)
```

## 2. 核心处理流程

```text
receive event
  -> validate event
  -> record received status
  -> if conclusion != success: record workflow_failed and stop
  -> download GitHub artifact zip
  -> extract zip
  -> find storage/tasks/**/final-1.mp4
  -> prepare auto_publish resource directory
  -> run npm run toutiao:video -- --publish
  -> record publish result
```

## 3. 统一事件校验

必填字段：

```text
event_type
request_id
repository
workflow
run_id
status
conclusion
video_subject
created_at
```

成功事件额外需要：

```text
artifact_id
artifact_name
```

校验规则：

- `event_type` 必须等于 `mpt.video.workflow.completed`。
- `video_subject` 不能为空。
- `conclusion != success` 时不要求 artifact 字段。
- `conclusion == success` 时必须有 `artifact_id`。

## 4. artifact 下载

输入：

```json
{
  "repository": "fmzh2025/MoneyPrinterTurbo",
  "artifact_id": "123456"
}
```

输出：

```text
<WORKDIR>/<request_id>/artifact.zip
```

下载要求：

- 使用 `GITHUB_TOKEN`。
- 跟随 GitHub artifact download API 的重定向。
- 下载后记录文件大小。

## 5. artifact 解压

输入：

```text
<WORKDIR>/<request_id>/artifact.zip
```

输出：

```text
<WORKDIR>/<request_id>/artifact/
```

查找规则：

```text
<WORKDIR>/<request_id>/artifact/storage/tasks/**/final-1.mp4
```

只允许发布 `final-1.mp4`。

## 6. auto_publish 资源目录

目录格式：

```text
/Users/fumingzhen/project/auto_publish/resources/YYYY-MM-DD_HHMMSS_<slug>/
```

写入文件：

```text
video.mp4
description.txt
metadata.json
source.json
```

`description.txt` MVP 内容：

```text
<video_subject>
```

`metadata.json` 字段：

```json
{
  "platform": "toutiao",
  "content_type": "video",
  "workflow": "mpt_github_action_video",
  "request_id": "req-20260805-000001",
  "title": "人工智能如何改变普通人的日常生活",
  "video_file": "/Users/fumingzhen/project/auto_publish/resources/.../video.mp4",
  "description_file": "/Users/fumingzhen/project/auto_publish/resources/.../description.txt",
  "github_repository": "fmzh2025/MoneyPrinterTurbo",
  "github_run_id": "123456789",
  "github_run_url": "https://github.com/fmzh2025/MoneyPrinterTurbo/actions/runs/123456789",
  "artifact_id": "123456",
  "status": "created"
}
```

## 7. auto_publish 调用

命令：

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

结果判断：

- `status=submitted`：视为发布完成。
- `status=submitted_unverified`：本期也视为发布调用完成。
- 其他状态：记录失败，本期不自动重试。

## 8. 状态记录

建议 Redis hash：

```text
mpt:video:jobs:<request_id>
```

也必须写本地日志：

```text
video_publish_pipeline/logs/<request_id>.log
```

状态枚举：

```text
received
workflow_failed
downloading
downloaded
extracting
extracted
publishing
published
failed
```

## 9. 本期不实现

- 失败重试。
- 重复发布防护。
- Redis pending 回收。
- 登录态预检查。
- 封面生成和上传。
