# 听力导航切段：listening-segment-rule-v2

实现仅位于 `scripts/import-pipeline/`，沿用服务端 `listening-review-v1` 契约。
Apple SpeechAnalyzer 为主引擎；失败组按相邻候选收窄裁窗，由已安装的 Whisper
`small.en` 单次复核。两份原始结果、失败信息和规则判定均保留。无播报不直接判错；
正文唯一性、全卷单调顺序和相邻组边界仍须有证据。缺少相邻组的离线裁窗不能替代全卷证明。

## 参数和判定

唯一参数入口为 `lib-listening-segment-rule.mjs` 的 `LISTENING_SEGMENT_RULE`：

| 参数 | 值 |
| --- | --- |
| 规则 / 等价表版本 | `listening-segment-rule-v2` / `listening-equivalences-v1` |
| 首尾连续锚 | 6 词；歧义扩为 12 词，仍歧义则复核 |
| 短材料 / 其他材料 | 少于 40 词：源词匹配率和含插入惩罚的编辑相似度均 ≥0.95；其他均 ≥0.90 |
| 边词时间跨度 / 开头词间空档异常 | >2 秒即复核，不据此截断 |
| 两遍时长比 | 第一遍 / 第二遍须在 0.85–1.15 |
| 局部边界证据 | 相邻静音需距首尾 run ≤2 秒，边界位于静音内，包住完整 run，至少多留 0.02 秒 |
| 静音检测 | `-35dB`，最短 0.08 秒 |
| 双引擎边界冲突容差 | 有物理边界证据的播放边界相差 >0.5 秒即复核 |

朗读次数只解析原卷说明，记录原文、来源定位及组级/节级；组级优先。同级冲突或未知
均 `review_required`，不由 ASR 找到的遍数倒推。支持中文一/两/二/1/2 遍以及英文
once/twice。明确的 Text N、「第 N 段」「第 a 至 b 题」播报都须一致，后来的正确播报
不能抵消前面的冲突。

每遍独立连续对齐，禁止拼接两遍的首尾。尾锚包含真实末话轮的结尾；短末话轮连同前文
构造。漏整话轮、数字/货币/否定词均要求复核。正文内部观察到超过 2 秒的静音也保守
要求复核，避免拼接分离片段。重复和重叠窗口先按绝对时间选择一致窗口区间，再计遍数。

等价表仅包含明列的 OK/okay、Hi/Hey、hm/hmm、部分英美拼写，以及代码中确定的数字、
整点时间和货币读法；不添加专名。Apple attributed run 可包含多个词，词时按 run
内插值并显式标记；只有 run 的外边界能证明发音边界，不能把整段时间冒充每个词的时间。

Apple 缺词而 Whisper 提供完整唯一证据时允许通过；身份、次数、顺序或物理边界出现
可证实冲突时保留 `review_required`。所有 unresolved 组都不输出已批准 playback。
结论仅用于教师导航，不是直接听审、逐字认证或整录音安全认证。

## 本地运行和证据

`fast-import prep` 启动 Apple，`after-proofread` 生成规则 attempt，
`finish` 把已绑定的证据和 sidecar 装入本地纸卷工作区。旧 worker 听力判词不再作为安装输入。
Apple 和 Whisper 共用既有 `asr-slot.py` 整机锁；磁盘不足 10 GB 暂停。

单独运行适配器（仅本地，不送审）：

```sh
python3 scripts/import-pipeline/transcribe-listening-apple.py \
  <playback.mp3> <持久输出目录>
node scripts/import-pipeline/listening-segment.mjs \
  --paper-dir <卷目录> --request <listening-review-request.json> \
  --apple-evidence <attempt/evidence.json> --output <持久输出目录>
```

每次执行新增带时间戳和随机标识的 attempt，旧原始结果不覆盖。`completed.json` 只是指向
最近 Apple attempt 的指针，复用时校验音频哈希。证据包括引擎、macOS version/build、
架构、请求/实际 locale、API 选项、适配器代码哈希、音频和 PCM 哈希、PCM 格式和裁窗偏移；
规则说明记录原文哈希、物化源哈希、等价表、规则版本和代码哈希。Apple 未公开模型版本，
明确记 `not_exposed`。Whisper 使用本地 checkpoint，禁止在此流程下载模型。

离线回放读取已有评测目录的 `manifest.json`、`apple/group-*.json` /
`apple/whole-*.json`、`group-*.json` / `whole-*.json`，只重新测量静音，不重跑 ASR：

```sh
node scripts/import-pipeline/replay-listening-rule.mjs \
  .scratch/asr-eval-20261020 .scratch/listening-rule-v2-replay
node --test scripts/import-pipeline/*.test.mjs scripts/import-pipeline/replay/*.test.mjs
```

## 无覆盖开关的送审门禁

`fast-import submit`（包括本地预览）和 `review.mjs push` 都在上传前强制检查；
即使之前 push 步骤被缓存，也重新读取当前来源和 sidecar：

- `IMPORT_SUBMIT_LISTENING_NOT_USABLE`：任一听力组缺失或不是 `usable`，列出 segmentId。
- `IMPORT_SUBMIT_CHINESE_HALF_WIDTH_NUMBERING`：中文文本或中文 inline runs 中出现
  `(1)`、`(2)` 等半角数字编号，列出字段路径；改为 `（1）`、`（2）`。纯英文内容中的
  括号数字不据此拦截。规则不自动改写原卷内容。

没有 Owner 覆盖开关。门禁不取代现有服务端的 subject、哈希、证据覆盖和顺序校验。
