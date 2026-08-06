你正在执行 18:30 头条视频自动发布任务的内容生成阶段。

工作目录固定为 `/Volumes/T7/project/project_fmzh/2026/video_publish_pipeline`。

目标：生成一条适合 MoneyPrinterTurbo 生成竖版视频、并适合头条发布的中文短视频内容。你只负责生成调度输入 JSON，不要调用 GitHub API，不要发布头条。

必须读取环境变量：

- `EVENING_VIDEO_REQUEST_ID`：本次请求 ID。
- `EVENING_VIDEO_OUTPUT_JSON`：必须写入的 JSON 文件路径。
- `EVENING_VIDEO_RECENT_RESOURCE_ROOT`：近期已发布内容目录，通常是 `/Users/fumingzhen/project/auto_publish/resources`。

内容要求：

1. 先读取 `EVENING_VIDEO_RECENT_RESOURCE_ROOT` 下最近 20 个资源目录中的 `metadata.json`、`body.txt`、`description.txt`，做语义去重。
2. 主题必须是 2-30 个中文字符，适合头条短视频标题。
3. 成片旁白脚本必须是中文，适合 45-75 秒视频朗读；不要写标题、分镜编号、旁白标签、Markdown。
4. 脚本内容优先选择生活趣味观察、轻松历史小故事、轻产品推广软文之一；避免敏感政治、医疗金融承诺、低俗、夸张虚假。
5. 画面素材会来自 Pexels/Pixabay 这类公开视频素材库，所以脚本必须能被具体视觉词表达；不要依赖难以搜到的抽象概念。
6. 生成 6-8 个素材搜索词，必须按脚本叙事顺序排列；每个搜索词用英文，具体到场所、物件、动作或天气，例如 `summer park shade`, `people drinking iced tea`, `city heat wave street`。
7. 搜索词不要使用抽象词，例如 `life`, `feeling`, `memory`, `story`。
8. 保证视频标题、脚本、搜索词三者指向同一个主题，避免画面与文字脱节。

必须写入 `EVENING_VIDEO_OUTPUT_JSON`，内容只能是一个 JSON 对象，字段如下：

```json
{
  "request_id": "<使用 EVENING_VIDEO_REQUEST_ID>",
  "video_subject": "<2-30 个中文字符标题>",
  "video_script": "<完整中文旁白脚本>",
  "video_terms": ["<英文搜索词1>", "<英文搜索词2>"],
  "video_source": "pexels",
  "video_aspect": "9:16",
  "video_count": "1",
  "voice_name": "zh-CN-XiaoxiaoNeural-Female",
  "bgm_type": "random",
  "subtitle_enabled": true,
  "match_materials_to_script": true
}
```

写入后读取该 JSON 文件确认可解析，并检查：

- `video_subject` 非空且 2-30 个中文字符。
- `video_script` 非空，且不是标题的简单重复。
- `video_terms` 是 6-8 个英文搜索词数组。
- `match_materials_to_script` 是 `true`。

最终只输出一行简短结果：`generated <EVENING_VIDEO_OUTPUT_JSON>`。
