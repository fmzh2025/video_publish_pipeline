# GitHub Actions 视频生成到头条自动发布实施任务计划

## 1. 目标

按已评审需求实现一条可运行链路：

```text
外部触发 API
  -> GitHub Actions 生成 MoneyPrinterTurbo 视频
  -> Redis Stream 或 API Callback 上报统一完成事件
  -> 当前服务器下载 artifact
  -> 提取 final-1.mp4
  -> 调用 auto_publish 全自动发布头条视频
```

本计划默认优先实现 `API Callback` 通道；`Redis Stream` 按同一事件契约保留兼容实现位。

## 2. 交付物

### 2.1 文档交付

- 需求文档：`docs/github-action-video-to-toutiao-requirements.md`
- 实施任务计划：`docs/implementation-task-plan.md`
- API Callback 契约：`docs/api-callback-contract.md`
- GitHub Actions 改造片段：`docs/snippets/generate-video-workflow-notification.md`
- Worker 处理流程说明：`docs/worker-processing-design.md`
- 联调验收清单：`docs/acceptance-checklist.md`

### 2.2 配置交付

- 环境变量模板：`config/example.env`
- 统一事件样例：`docs/schemas/workflow-completed-event.example.json`

### 2.3 后续代码交付

代码实现建议放在：

```text
video_publish_pipeline/src/
  trigger/
  notification/
  worker/
```

本轮先生成任务计划和配套内容，不直接实现运行代码。

## 3. 阶段计划

### P0：准备与契约固化

目标：冻结事件格式、配置项和模块边界。

| ID | 任务 | 输出 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| P0-1 | 固化统一完成事件字段 | `workflow-completed-event.example.json` | 需求文档 | Redis 和 Callback 使用同一字段集合 |
| P0-2 | 固化 API Callback 契约 | `api-callback-contract.md` | P0-1 | 包含请求头、请求体、响应、错误码 |
| P0-3 | 固化环境变量 | `config/example.env` | 需求文档 | 包含 GitHub、Callback、Redis、auto_publish 配置 |
| P0-4 | 固化 Workflow 改造片段 | `generate-video-workflow-notification.md` | P0-1 | 可复制到 `generate-video.yml` 改造 |

完成标准：

- 事件样例可直接作为 Redis entry 或 Callback JSON body。
- API Callback 不添加外层 `payload/data/event` 包装。
- 通知通道由 `MPT_NOTIFY_CHANNEL=redis|callback|both` 控制。

### P1：GitHub Actions 改造

目标：MoneyPrinterTurbo 的 `generate-video.yml` 生成视频后能上报统一完成事件。

| ID | 任务 | 输出 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| P1-1 | 新增 `request_id` workflow input | workflow patch | P0 | 手动触发时可填写 request_id |
| P1-2 | 给 artifact 上传步骤增加 `id` | workflow patch | P0 | 可读取 `steps.upload_artifact.outputs.artifact-id` |
| P1-3 | 生成 `workflow-event.json` | workflow patch | P1-1/P1-2 | 文件内容匹配统一事件样例 |
| P1-4 | 增加 Redis Stream `XADD` 通知 | workflow patch | P1-3 | `MPT_NOTIFY_CHANNEL=redis/both` 时生效 |
| P1-5 | 增加 API Callback `curl` 通知 | workflow patch | P1-3 | `MPT_NOTIFY_CHANNEL=callback/both` 时生效 |
| P1-6 | 手动触发联调 | GitHub run | P1-1~P1-5 | callback 或 Redis 收到完成事件 |

完成标准：

- 成功、失败、取消都执行通知步骤。
- 成功时事件包含 artifact 信息。
- 非成功时也上报 `status/conclusion`，Worker 不进入下载发布。

### P2：当前服务器接收与下载

目标：当前服务器能接收事件，下载 artifact，提取 `final-1.mp4`。

| ID | 任务 | 输出 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| P2-1 | 实现统一事件处理函数 | `handleWorkflowCompletedEvent` | P0 | Redis 和 Callback 共用同一函数 |
| P2-2 | 实现 API Callback Handler | HTTP endpoint | P2-1 | 能校验 token 并接收 JSON body |
| P2-3 | 实现 GitHub artifact 下载 | downloader | P2-1 | 输入 artifact_id 输出 zip 路径 |
| P2-4 | 实现 artifact 解压 | extractor | P2-3 | 输出解压目录 |
| P2-5 | 实现 `final-1.mp4` 定位 | extractor | P2-4 | 找到并复制到 workdir |
| P2-6 | 本地事件样例联调 | test run | P2-1~P2-5 | 使用样例事件可走到视频提取 |

完成标准：

- Callback 收到事件后能返回 accepted。
- 下载使用 GitHub token。
- `final-1.mp4` 是唯一被发布的目标文件。

### P3：auto_publish 适配

目标：把下载到的视频交给现有 `auto_publish` 全自动发布头条。

| ID | 任务 | 输出 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| P3-1 | 创建 auto_publish 资源目录 | adapter | P2-5 | 目录位于 `auto_publish/resources` |
| P3-2 | 写入 `description.txt` | adapter | P3-1 | 内容默认等于 `video_subject` |
| P3-3 | 写入 `metadata.json` 和 `source.json` | adapter | P3-1 | 包含 request_id、run_id、artifact_id |
| P3-4 | 复制视频为 `video.mp4` | adapter | P3-1 | 文件存在且可读 |
| P3-5 | 调用 `npm run toutiao:video -- --publish` | adapter | P3-1~P3-4 | auto_publish 返回 submitted 或 submitted_unverified |
| P3-6 | 记录发布结果 | Redis hash 或本地状态 | P3-5 | 包含 archiveDir、pageUrl、manageUrl |

完成标准：

- 命令中必须包含 `--publish`。
- 不传 `--cover-file`。
- 标题来自 `video_subject`。

### P4：外部触发 API

目标：提供一个服务端 API，触发 GitHub Actions 视频生成。

| ID | 任务 | 输出 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| P4-1 | 定义触发 API 请求体 | API spec | P0 | 字段与 workflow inputs 对齐 |
| P4-2 | 实现 request_id 生成 | trigger API | P4-1 | 每次触发有唯一 request_id |
| P4-3 | 调用 GitHub Workflow Dispatch API | trigger API | P4-2 | GitHub Actions run 被创建 |
| P4-4 | 返回触发结果 | trigger API | P4-3 | 返回 request_id 和 dispatch 状态 |
| P4-5 | 端到端联调 | e2e run | P1/P2/P3/P4 | 从触发到头条发布完成 |

完成标准：

- 触发 API 不阻塞等待视频生成完成。
- 响应中返回 `request_id`，用于查询日志和状态。

## 4. 任务依赖图

```text
P0 契约固化
  -> P1 GitHub Actions 通知
  -> P2 当前服务器事件处理和 artifact 下载
  -> P3 auto_publish 发布适配
  -> P4 外部触发 API
  -> 端到端联调
```

P2 和 P3 可在 P1 完成前用样例事件和本地 artifact zip 并行开发。

## 5. 优先级

| 优先级 | 内容 |
| --- | --- |
| 必须 | API Callback 通道、统一事件、artifact 下载、final-1.mp4 提取、auto_publish 发布 |
| 应该 | Redis Stream 兼容通道、Redis hash 状态回写、本地日志 |
| 可后置 | 失败重试、重复发布防护、pending 消息回收、登录态预检、封面生成 |

## 6. 里程碑

### M1：通知可达

- Workflow 能生成 `workflow-event.json`。
- 当前服务器能收到 API Callback。

### M2：视频可下载

- 当前服务器能下载 artifact zip。
- 能提取 `final-1.mp4`。

### M3：头条可发布

- 当前服务器能调用 `auto_publish`。
- `auto_publish` 返回 `submitted` 或 `submitted_unverified`。

### M4：端到端可用

- 外部 API 触发后，自动完成 GitHub Actions 生成、回调、下载、解压、头条发布。

## 7. 联调顺序

1. 用静态 JSON 调 Callback Handler。
2. 用本地 artifact zip 测下载后的解压和 `final-1.mp4` 提取。
3. 用本地 MP4 测 `auto_publish` dry-run。
4. 用本地 MP4 测 `auto_publish --publish`。
5. 手动触发 GitHub Actions，验证 callback 事件。
6. 用真实 artifact 完成下载和发布。
7. 用外部触发 API 跑端到端。

## 8. 风险接受

本期接受以下风险，不作为阻塞项：

- 登录态失效导致发布失败。
- 头条页面变化导致 Playwright 脚本失败。
- Callback 或 Redis 事件重复导致重复发布。
- Worker 异常退出导致消息未确认。
- GitHub artifact 过期导致无法下载。

后续生产化阶段再补齐失败重试、幂等、登录态预检和告警。
