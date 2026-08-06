# 联调验收清单

## 1. 配置验收

- [ ] MoneyPrinterTurbo 仓库配置 `MPT_NOTIFY_CHANNEL`。
- [ ] 使用 callback 时配置 `MPT_CALLBACK_URL`。
- [ ] 使用 callback 时配置 `MPT_CALLBACK_TOKEN`。
- [ ] 当前服务器配置同一个 `MPT_CALLBACK_TOKEN`。
- [ ] 当前服务器配置 `GITHUB_TOKEN`。
- [ ] 当前服务器配置 `AUTO_PUBLISH_DIR=/Users/fumingzhen/project/auto_publish`。
- [ ] `auto_publish/.browser-data/toutiao` 登录态可用。

## 2. Workflow 验收

- [ ] `generate-video.yml` 支持 `request_id` input。
- [ ] artifact 上传步骤有 `id: upload_artifact`。
- [ ] workflow 会生成 `workflow-event.json`。
- [ ] `workflow-event.json` 包含 `request_id`。
- [ ] `workflow-event.json` 包含 `artifact_id`。
- [ ] `workflow-event.json` 包含 `video_subject`。
- [ ] callback 模式会 POST 到当前服务器。
- [ ] redis 模式会 XADD 到 `mpt:video:events`。

## 3. API Callback 验收

- [ ] 缺少 token 返回 `401`。
- [ ] token 错误返回 `401`。
- [ ] `event_type` 错误返回 `400`。
- [ ] 缺少 `request_id` 返回 `400`。
- [ ] 合法事件返回 `202 accepted` 或 `200 ok`。
- [ ] 合法事件进入统一处理函数。

## 4. Artifact 下载验收

- [ ] 能根据 `artifact_id` 下载 zip。
- [ ] zip 保存到 `<WORKDIR>/<request_id>/artifact.zip`。
- [ ] zip 能解压到 `<WORKDIR>/<request_id>/artifact/`。
- [ ] 能找到 `storage/tasks/**/final-1.mp4`。
- [ ] 不处理 `final-2.mp4` 或其他视频。

## 5. auto_publish 验收

- [ ] 能创建 `auto_publish/resources/YYYY-MM-DD_HHMMSS_<slug>/`。
- [ ] 能写入 `video.mp4`。
- [ ] 能写入 `description.txt`。
- [ ] 能写入 `metadata.json`。
- [ ] 能写入 `source.json`。
- [ ] 调用命令包含 `--publish`。
- [ ] 调用命令不包含 `--cover-file`。
- [ ] 标题来自 `video_subject`。
- [ ] `auto_publish` 返回 `submitted` 或 `submitted_unverified`。

## 6. 状态和日志验收

- [ ] 每个 `request_id` 有本地日志。
- [ ] 日志包含 callback/redis 原始事件。
- [ ] 日志包含 artifact 下载路径。
- [ ] 日志包含 `final-1.mp4` 路径。
- [ ] 日志包含 auto_publish stdout/stderr。
- [ ] 状态记录包含 `archiveDir`。
- [ ] 状态记录包含 `pageUrl` 或 `manageUrl`。

## 7. 端到端验收

- [ ] 外部 API 触发 GitHub Actions。
- [ ] GitHub Actions 生成视频成功。
- [ ] 当前服务器收到完成事件。
- [ ] 当前服务器下载并解压 artifact。
- [ ] 当前服务器提取 `final-1.mp4`。
- [ ] 当前服务器调用 `auto_publish --publish`。
- [ ] 头条发布脚本返回完成状态。

## 8. 本期可接受但需记录的问题

- [ ] 登录态失效。
- [ ] 头条页面结构变化。
- [ ] artifact 下载过期。
- [ ] callback 重复请求。
- [ ] Redis 消息重复消费。
- [ ] auto_publish 返回 `submitted_unverified`。
