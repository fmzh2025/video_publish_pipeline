你正在执行 18:30 头条视频自动发布任务的内容生成阶段。

本次执行目录由调度脚本提供；必须使用环境变量指定的输出路径，不要假设输出文件位于项目源码目录。

目标：生成一条适合 MoneyPrinterTurbo 生成竖版视频、并适合头条发布的中文短视频内容。你只负责生成调度输入 JSON，不要调用 GitHub API，不要发布头条。

必须读取环境变量：

- `EVENING_VIDEO_REQUEST_ID`：本次请求 ID。
- `EVENING_VIDEO_OUTPUT_JSON`：必须写入的 JSON 文件路径。
- `EVENING_VIDEO_RECENT_RESOURCE_ROOT`：近期已发布内容目录，通常是 `/Users/fumingzhen/project/auto_publish/resources`。
- `EVENING_VIDEO_SUBJECT_OVERRIDE`：可选；如果非空，必须把它作为 `video_subject`，并围绕这个主题生成脚本和搜索词。
- `EVENING_VIDEO_SUBJECT_FILE`：可选；如果非空，读取该 UTF-8 文件内容作为指定主题，优先级高于 `EVENING_VIDEO_SUBJECT_OVERRIDE`。

内容要求：

1. 先读取 `EVENING_VIDEO_RECENT_RESOURCE_ROOT` 下最近 20 个资源目录中的 `metadata.json`、`body.txt`、`description.txt`，做语义去重。
2. 主题必须是 2-30 个中文字符，适合头条短视频标题；如果 `EVENING_VIDEO_SUBJECT_FILE` 或 `EVENING_VIDEO_SUBJECT_OVERRIDE` 非空，主题必须完全等于指定主题。
3. 成片旁白脚本必须是中文，适合 45-75 秒视频朗读；不要写标题、分镜编号、旁白标签、Markdown。
4. 默认主题风格必须围绕 MoneyPrinterTurbo 适合的 AI 视频内容：AI 工具使用、普通人机会、效率提升、内容生产、短视频创作、职场变化、自动化工作流。不要再生成纯生活观察、泛历史小故事、无关产品软文。
5. 主题表达要有一点关注度和反差感，但不能制造夸张承诺。优先使用“普通人也能理解的 AI 变化”“不会用工具的机会成本”“会提问的人更省时间”“AI 如何帮内容创作起步”等角度。
6. 标题示例风格：`不会用AI的人正在掉队`、`普通人也能用AI做视频`、`AI正在偷走重复劳动`、`会提问的人先赚到时间`、`短视频创作正在变简单`。不要照抄示例，除非用户通过主题覆盖指定。
7. 脚本必须落在可视化场景里：电脑办公、手机语音输入、剪辑时间线、素材搜索、表格整理、会议记录、商品照片、短视频发布后台、夜晚学习等。避免只谈抽象概念。
8. 避免敏感政治、医疗金融承诺、低俗、夸张虚假、暴富诱导、贩卖焦虑。可以有轻微紧迫感，但结论要落到具体工具使用和行动建议。
9. 画面素材会来自 Pexels/Pixabay 这类公开视频素材库，所以脚本必须能被具体视觉词表达；不要依赖难以搜到的抽象概念。
10. 生成 6-8 个素材搜索词，必须按脚本叙事顺序排列；每个搜索词用英文，具体到场所、物件、动作或天气，例如 `office worker laptop typing`, `phone voice input close up`, `video editing timeline`, `content creator desk setup`。
11. 搜索词不要使用抽象词，例如 `life`, `feeling`, `memory`, `story`。
12. 保证视频标题、脚本、搜索词三者指向同一个主题，避免画面与文字脱节。

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
