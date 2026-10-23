# 听力导航切段：listening-segment-rule-v4

实现仅位于 `scripts/import-pipeline/`，沿用服务端 `listening-review-v1` 契约。
Apple SpeechAnalyzer 为主引擎；失败组只按独立锚定成功的相邻骨架组收窄裁窗，由已安装的 Whisper
`small.en` 单次复核。两份原始结果、失败信息和规则判定均保留。无播报不直接判错；
正文唯一性、全卷单调顺序和相邻组边界仍须有证据。缺少相邻组的离线裁窗不能替代全卷证明。

## 参数和判定

唯一参数入口为 `lib-listening-segment-rule.mjs` 的 `LISTENING_SEGMENT_RULE`：

| 参数 | 值 |
| --- | --- |
| 规则 / 等价表版本 | `listening-segment-rule-v4` / `listening-equivalences-v4` |
| 首尾连续锚 | 6 词；歧义扩为 12 词，仍歧义则复核 |
| 可选模糊锚 | 默认关闭；至少 20 词，12 词连续锚中恰好 1 处替换，每遍另一端须精确 |
| 短材料 / 其他材料 | 少于 40 词：源词匹配率和含插入惩罚的编辑相似度均 ≥0.95；其他均 ≥0.90 |
| 边词时间跨度 / 开头词间空档异常 | >2 秒即复核，不据此截断 |
| 两遍时长比 | 第一遍 / 第二遍须在 0.85–1.15 |
| 局部边界证据 | 相邻静音需距首尾 run ≤2 秒，边界位于静音内，包住完整 run，至少多留 0.02 秒 |
| 静音检测 | `-35dB`，最短 0.08 秒 |
| 双引擎边界冲突容差 | >0.5 秒仍复核；仅满足下述无词争议区间规则时取并集 |
| 单引擎孤立边词 | 最多 3 词，整个边缘词串总跨度最多 1.5 秒（含端点）；另一引擎须覆盖该区间且完全无词 |

印刷遍数仍解析原卷说明，记录原文、来源定位及组级/节级；组级优先。同级冲突或未知
均 `review_required`。支持中文一/两/二/1/2 遍以及英文 once/twice。
Owner 2026-10-23：音频实际遍数优先；每一遍首尾均可靠定位、所有首尾候选均配对、
没有部分遍次或其他阻塞时，`READING_COUNT_MISMATCH` 降为 `notes`，播放范围覆盖全部遍。
遍数校正还须有完整录音覆盖和对应的全局精确首尾证据；单个裁窗不能证明另一遍不存在。
原印刷值保留在 `expectedReadings`，实际值由 `occurrences.length` 表示，
`readingCountEvidence` 记录差异及说明校正需求。第二遍缺尾等情况仍拦。
新交付题卷按 [既有说明校正路径](listening-review.md#correct-repetition-instructions-without-rewriting-sources)
改为实际遍数；保留原 PDF、音频和旧 revision，不直接修改 Materialization。
明确的 Text N、「第 N 段」「第 a 至 b 题」播报都须一致，后来的正确播报
不能抵消前面的冲突。

次数未知时只报 `READING_COUNT_UNKNOWN`，不把数字遍数与字符串 `unknown` 比较而误报
`READING_COUNT_MISMATCH`；未知状态仍需复核。

顺序骨架由正文、次数、唯一锚和物理边界独立通过的组构成。先冻结骨架，再按题号比较；
倒序、重叠或跨越发音边界同时标记双方。缺失或失败组只扩大区间，不能让其余组连锁失败。
无播报组的每一遍必须严格位于前一骨架组最后发音结束之后、后一骨架组首次发音开始之前；
卷首/尾缺少一侧骨架时该侧无邻组约束。失败组保持失败，任何顺序失败都清空批准播放区间。
Apple 和 Whisper 合并后再次校验同一骨架规则；局部 Whisper 结果不能自行代表整卷通过。

每遍独立连续对齐，禁止拼接两遍的首尾。尾锚包含真实末话轮的结尾；短末话轮连同前文
构造。漏整话轮、正文低匹配仍要求复核。数字、货币、否定词、时间及情态词的
删除、插入和替换仍记录在 `alignment.differences`，不把不同字词当作等价。
Owner 2026-10-23：当全部遍次首尾与正文门槛都通过时，
`CRITICAL_WORD_MISSING` / `CRITICAL_WORD_DIFFERENCE` 降为组及逐遍的记录性 `notes`，
不再仅因 ASR 字词不同阻塞，也不改写原文。边缘长 run、尾锚缺失、正文低匹配、
时长冲突、首尾无法确定等问题仍拦截。
正文内部观察到超过 2 秒的静音也保守
要求复核，避免拼接分离片段。重复和重叠窗口先按绝对时间选择一致窗口区间，再计遍数。

相邻两遍若分别选择同一静音内的边界而发生播放重叠，只能在该已观测静音内选择共同分界点，
并同时保留前遍末 run 与后遍首 run 的完整发音及原有 0.02 秒余量；否则仍报
`READINGS_OVERLAP`。`boundaryAdjustments` 保留原边界、静音区间及共同分界点。

等价规则先于关键字门禁执行，源文与 ASR 使用同一规范化路径；全部插入、删除、替换仍检查
规范化后的两侧数值、序数、货币、否定和时间。当前版本 `listening-equivalences-v4`
保留下列 v2 规则，并追加文末列出的有限缩写规则：

| 类别 | 确定等价范围 | 保守边界 |
| --- | --- | --- |
| 固定拼写 / 基数 / 货币 | 既有 OK/okay、Hi/Hey、hm/hmm、英美拼写；0–999999 整数（含千分位）；`$`/`£` 与两位分值 | 不增加人名或同音词；`too` ≠ `two` |
| 序数 | `1st`–`31st` 与 first–thirty-first；连字符或空格均可 | 保留 first / second / third 等不同值，以及序数与基数的区别；错误后缀不修正 |
| AM / PM | `a.m.` / `AM` / `am` 与 `p.m.` / `PM` / `pm`；附在数字后亦支持 | AM 与 PM 不互换；只在明确 AM/PM 前省略整点 `o'clock` |
| 时刻 | `HH:MM`（小时 0–23、分钟 00–59），如 `7:30` / seven thirty；整点仍对应 o'clock；个位分钟保留 oh | 不猜测 12/24 小时换算；裸 `930` 仍为 nine hundred thirty |
| 明确 meridiem 的数字时刻 | `1.15pm` / `1:15 pm` / `115 p.m.`，附 AM/PM 且小时 1–12、分钟合法；跨 run 的 `1` + `.15pm` 同样支持 | 没有 AM/PM 的 `7.30` 保留数值小数，不自动当 `7:30`；无后缀裸整数不补冒号 |
| 明确 half past | half past one–twelve（或 1–12）对应该小时 thirty | 不加入 half seven、quarter to 等额外读法，也不推断上午/下午 |
| 年份分组读法 | 2001–2099；2026 / twenty twenty-six / two thousand and twenty-six、2006 / twenty oh six；复用基数展开 | 仅整段为年份表达式，或紧接 in/since/during/until/by/before/after/from/year；等价须一侧为四位年份字面量、另一侧为明确单词读法；不将时刻展开结果或分离数字改成年份，不跨句点/逗号，货币或时长单位后缀不按年份改写 |

`first` ≠ `second`、`7:30` ≠ `7:13`、`2026` ≠ `2027`，相同数值的表示转换不改变
这些保护。专名和其他正文差异仍进入原编辑距离及话轮检查，不因等价表更新而被消除。
规范化 token 保留 `expressionType`（year/time/cardinal/ordinal，普通正文为 text）、
原字面量/单词形式、原表达式文本及年份值。年份读取器只消费原始单词，
对齐同时检查年份类型和形式；展开文字相同也不能消除 year/time 或 year/cardinal 差异，
这些替换进入 `CRITICAL_WORD_DIFFERENCE` 并记录两侧表达式类型。相同原表达式照常匹配。

Apple attributed run 可包含多个词。新路径先保留字符范围，再将同一 segment 内跨 run
的确定表达式一起规范化，保留原 run 文本、起止时间与编号范围。插值显式标记为
`interpolated_within_run` 或 `interpolated_within_normalized_span`；只有原 run 的最外
规范化 token 可证明发音边界，内部 token 不会获得新的物理边界。表达式不能跨越失败、
倒序时间戳、超过 2 秒的空档或 segment 边界。源词原文同样按字符范围映射，不覆盖源文。

Apple 缺词而 Whisper 提供完整唯一证据时允许通过；身份、次数、顺序或物理边界出现
可证实冲突时保留 `review_required`。所有 unresolved 组都不输出已批准 playback。
结论仅用于教师导航，不是直接听审、逐字认证或整录音安全认证。

`engineConflicts` 分别记录 `attempt_hard_conflict`（某引擎自身存在锚/身份等不确定性）、
`complete_occurrence_count` 和 `playback_boundary`（含逐遍有符号差值）。
`observed_critical_word_difference` 在独立完整引擎确定全部遍次时移到 `engineNotes`；
没有完整参考时不据此放行。`playback_boundary`（仍为 0.5 秒容差）、
`occurrence_identity_or_order`、`partial_occurrence_identity`、`observed_speech_identity`、
`unassigned_edge_speech` 等边界/身份问题默认保留在 `engineConflicts`，继续阻塞。
两引擎都完整时，采用包含更多可靠遍次的参考，避免只播放其中一遍。
第一类不能解释为两引擎给出了相反身份。顺序冲突由合并后的
骨架统一裁定，不再把先前某引擎的派生顺序失败直接当作跨引擎矛盾。

Owner 2026-10-23 补充，仍使用尚未发布的 v4：

- A：只有一个引擎识别的孤立边词，可记录为 `engineNotes.isolated_edge_asr`。
  必须同时满足最多 3 词、整个词串跨度 ≤1.5 秒、位于本遍开头/结尾或两遍间隙，
  且另一引擎原始窗口覆盖该时间段并完全无词。正文内部不适用；
  同一边缘区域的词一起计数和计时，不通过拆分长串放行。两引擎在相同区域识别同词、
  相邻材料开头、Text N/第 N 段播报或说明指令均不适用。中文提示保留原始 run 检查，
  不能因英文规范化后没有 token 而消失。原始证据不删除，规则比较及合并语音重查仅排除
  已满足 A 的词串。
- B：物理播放边界相差 >0.5 秒时，两个边界之间的争议区间必须被两引擎原始窗口覆盖，
  并且都无识别词，或只有满足 A 的词，才记录 `silent_playback_boundary_union`，
  每遍取最早起点和最晚终点，并同步组级播放范围及对应静音证据。
  任一非 A 词仍阻塞；所有候选并集一起检查，不得重叠另一遍或相邻组。
  之后仍执行全卷顺序及合并语音边界检查。notes 记录原差值、争议区间和并集范围。

这两项不替代独立完整参考、首尾成对、遍数证明、正文门槛、时长、身份或顺序门禁。
例如同一 Thank/you 词串跨度为 2.04 秒时仍不能用 A 放行；另一引擎同区间识别到
I'm 时，单引擎的 And 也不满足“另一引擎无词”。

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

### 在途卷只重算规则，不触发推理

保持当前卷、请求和历史 attempt 的 Source/Candidate/音频/全文绑定一致，运行：

```sh
node scripts/import-pipeline/listening-segment.mjs \
  --paper-dir <卷目录> --request <listening-review-request.json> \
  --replay-attempt <旧 attempt 目录> --output <新的输出目录>
```

该分支校验旧 evidence 的字节 SHA/长度、来源说明和静音参数，只读取原始 Apple /
Whisper JSON 与静音记录；不读取模型、不启动 ASR、不重试 UNKNOWN 任务。
所有旧 receipt 按 historical 保留，不改签；新 attempt 记录当前规则版本、
`historicalRuleVersion`、`inference: not_run` 和新 `ruleCacheKey`（包含规则代码 SHA）。
保留旧 attempt 中已有的所有回退证据，即使主引擎在新规则下通过，也继续核查其边界反证。
当前 `listening-review-v1` 的严格字段不变，notes 放在规则证据及报告 `limits` 中。

fast 编排使用原有 redo 入口，并显式指定只重算来源：

```sh
node scripts/import-pipeline/fast-import.mjs after-proofread <paperId> \
  --redo-from asr-apple-rule-v2 --listening-replay-attempt <旧 attempt 目录>
node scripts/import-pipeline/fast-import.mjs finish <paperId>
```

只有该 flag 才保证重算阶段不启动 ASR；单独 `--redo-from` 仍可能调度 Whisper。
旧版本或规则代码 SHA 不同的已完成缓存不能冒充当前 v4，编排会提示上述重算命令。redo 保留旧证据，但会归档后续
sidecar/PDF 完成标记；`finish` 可能需要重新完成下游产物。批次私有 continuation /
`--pre-import` 增量须由唯一写入者另行保留整合，本命令不隐含这些未随主线提供的选项。

如 `readingCountEvidence.instructionCorrectionRequired` 为真，先按既有
`prepare/finalize/verify-listening-instruction-correction` 完成整节核对及卷面说明校正，
再按该路径重绑新 Source/Candidate 并重建四 PDF。该校正改变打印语义，不能把旧 subject
直接用于上述严格重放；旧音频 ASR 字节仍保留，可按现有复核编写入口重新绑定，
不得为了绕过绑定检查而修改旧 receipt。

离线回放只读取已有评测目录的 `manifest.json`、`apple/group-*.json` 和 `group-*.json`，
只重新测量静音，不重跑 ASR。45 个样本均按组裁窗处理，不混入另两份补充全录音。
离线投影位于 `lib-listening-replay.mjs`，只输出统计，不生成导入 sidecar 或批准播放区间：

- `includingOrder`：有其他问题的组计入 `review_required`，其余计入非失败状态
  `ORDER_NOT_EVALUABLE_IN_REPLAY`，不能算成完整导入可用。
- `orderNotEvaluable`：明确排除整卷顺序后的局部规则分布。
- `orderStatusCounts`：全部 45 组均缺少本次回放可用的整卷顺序证据。

真实导入仍执行整卷顺序校验和原有送审门禁，没有回放覆盖开关。

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
  括号数字不据此拦截。按编号到下一个编号/分隔符之间的完整局部条目判断语言，
  DIY/BBQ 等英文缩写不能掩盖后面的汉字；英文引文先屏蔽，再判条目中的中文。
  不因整串或兄弟 inline 项含中文就拦截英文引文；既有独立英文 inline 从句保留，
  编号起首的 run、纯编号 run 和跨 run 的括号仍从合并条目获取语境。
  规则不自动改写原卷内容。

没有 Owner 覆盖开关。门禁不取代现有服务端的 subject、哈希、证据覆盖和顺序校验。

## 2026-10-20 修正后证据

45 组、22 卷裁窗回放：含顺序为 `usable=0 / review_required=16 /
ORDER_NOT_EVALUABLE_IN_REPLAY=29`；顺序不可评估的局部分布为
`usable=29 / review_required=16`。Apple 局部为 26/19，Whisper 局部为 21/24。
原因可重叠：次数不符 6、锚歧义 5、引擎冲突 10、正文低匹配 1、尾锚缺失 1、
次数未知 7、关键字缺失 2。所有阈值与等价表保持原值。

基线 16 个引擎冲突、15 个次数不符、7 个次数未知涉及 23 个不同组。
下面沿用基线的证据范围诊断旧问题；其中山东核心素养、青岛三适原基线曾混用全录音，
其余为组裁窗。新回放统一只用裁窗，因此不能把范围变化当作同一输入的准确率提升。
原完整说明、页码/区域或 OCR observation、逐遍发音/物理播放边界、配对后的有符号
`Whisper − Apple` 差值、缺失源词和原始窗口路径均保存在
`.scratch/listening-rule-v2-replay-followup/baseline-diagnostics-2026-10-20T19-15-46-445Z.json`；
最近回放在同目录 `replay-2026-10-20T19-15-23-638Z.json`。

表中 C/N/U 分别指基线 `ENGINE_CONFLICT` / `READING_COUNT_MISMATCH` /
`READING_COUNT_UNKNOWN`；边界单位为秒，格式为“发音范围 [物理播放范围]”，保留三位
小数，JSON 保留原精度。`∅` 表示没有获准 occurrence 或没有物理边界，不能解释为音频不存在。
“原说明”仅摘录次数条款；完整原文和出处见上述 JSON。

| 样本 / paperId / group | 基线标记 | 原说明次数条款 | Apple | Whisper | 具体诊断 / 分类 |
| --- | --- | --- | --- | --- | --- |
| 0 / paper-hz-2026-apr-gaosan-quality / listening-text-4 | N | 每段录音读两遍。 | 0 遍：∅ | 2 遍：193.400–204.900 [193.155–206.288]；206.800–218.300 [206.288–223.758] | 证据问题：Apple 尾锚 service→surface，故 0 遍；Whisper 完整 2 遍，当前可回退通过。 |
| 2 / paper-hz-2026-apr-gaosan-quality / listening-text-9 | C | 每段录音读两遍。 | 2 遍：740.080–805.480 [740.060–807.044]；806.980–872.560 [806.960–882.793] | 1 遍：807.660–872.500 [807.044–882.793] | 证据问题：Whisper 首遍首锚缺失，完整次数 2:1；旧顺序缺陷曾触发多余回退，当前 Apple 独立通过。 |
| 4 / paper-mock-jiangnan-shixiao-2025-10-first-comprehensive-quality-test / listening-text-9 | C | 每段对话或独白读两遍。 | 2 遍：671.220–739.800 [670.896–741.702]；742.860–811.200 [741.702–821.668] | 1 遍：743.000–811.420 [741.702–821.668] | 证据问题：Whisper 首遍首锚缺失且第二遍漏 nine；旧顺序缺陷曾触发多余回退，当前 Apple 独立通过。 |
| 6 / paper-mock-jiaxing-2026-apr-m179 / listening-text-2 | C | 每段录音读两遍。 | 2 遍：136.160–154.700 [134.942–156.093]；156.020–174.560 [156.000–179.864] | 2 遍：136.700–154.920 [136.680–156.093]；156.720–174.780 [156.093–179.864] | 证据问题：正文/次数一致，第一遍播放起点差 +1.738 秒；当前 Apple 独立通过，不再触发回退。 |
| 12 / paper-mock-shandong-2026-04-core-literacy-assessment / listening-text-1 | N | 每段录音读两遍。 | 0 遍：∅ | 0 遍：∅ | 证据问题：首锚 Cris→Chris（两引擎均无获准遍）；专名不加入等价表，继续复核。 |
| 14 / paper-mock-shandong-binzhou-2026-05-second-mock / listening-text-1 | C | 每段录音播两遍。 | 2 遍：141.540–154.620 [140.840–155.941]；156.120–169.080 [155.941–174.424] | 1 遍：156.680–169.320 [155.941–174.424] | 证据问题：Whisper 首遍首锚缺失，完整次数 2:1；当前 Apple 独立通过。 |
| 15 / paper-mock-shandong-dongying-2026-04-adaptability / listening-text-1 | C/N | 每段对话仅读一遍。 | 2 遍：68.240–76.940 [68.220–78.069]；78.080–86.420 [78.060–92.196] | 2 遍：68.860–76.840 [68.422–78.069]；78.720–86.680 [78.069–92.196] | 证据问题：说明仅读一遍，两引擎却各匹配 2 遍；身份没有引擎间矛盾，ENGINE_CONFLICT 来自保守的单引擎 ANCHOR_AMBIGUOUS。 |
| 19 / paper-mock-shandong-qingdao-2026-05-third-adaptability / listening-text-1 | C/N | 每段对话仅读一遍。 | 2 遍：179.640–192.240 [179.620–193.728]；195.300–206.460 [193.728–211.748] | 0 遍：∅ | 证据问题：说明仅读一遍，Apple 匹配 2 遍；基线 Whisper 全录音缺失该组首锚。需核对音频/试卷配套关系。 |
| 22 / paper-mock-shandong-zaozhuang-2026-05-third-mock / listening-text-1 | C | 每段录音播两遍。 | 2 遍：100.180–109.660 [99.215–111.173]；111.100–120.640 [111.080–126.114] | 2 遍：100.800–109.960 [100.780–111.173]；112.000–120.880 [111.173–126.114] | 证据问题：正文/次数一致，第一遍播放起点差 +1.565 秒；当前 Apple 独立通过，不再触发回退。 |
| 24 / paper-mock-tianyu-2026-m4 / listening-text-2 | C/N | 每段对话仅读一遍。 | 2 遍：84.500–97.760 [84.480–98.900]；98.780–111.980 [98.760–117.884] | 2 遍：85.020–97.980 [84.780–98.900]；99.360–112.200 [98.900–117.884] | 证据问题：说明仅读一遍，两引擎均匹配 2 遍；ENGINE_CONFLICT 来自单引擎锚计数歧义，并非身份相反。 |
| 25 / paper-mock-tianyu-2026-m4 / listening-text-3 | C/N | 每段对话仅读一遍。 | 0 遍：∅ | 0 遍：∅ | 证据问题：两引擎尾锚 and→in，扩到 12 词仍无完整尾锚；首锚出现两次但说明只读一次。 |
| 26 / paper-mock-tianyu-2026-m4 / listening-text-4 | C | 每段对话仅读一遍。 | 1 遍：178.600–194.860 [178.434–200.895] | 2 遍：161.240–177.180 [161.117–178.434]；178.940–194.900 [178.434–200.895] | 证据问题：说明一遍，Apple 1 遍/Whisper 2 遍；Apple 首尾锚计数不一致也触发歧义。重合遍身份一致。 |
| 31 / paper-mock-zhejiang-ningbo-2025-11-first-mock / listening-text-7 | C | 每段对话或独白读两遍。 | 2 遍：480.180–530.640 [480.160–532.363]；533.700–583.020 [532.363–588.633] | 1 遍：533.040–583.220 [532.363–588.633] | 证据问题：Whisper 缺首遍且第二遍漏 thousand/dollars；旧顺序缺陷曾触发多余回退，当前 Apple 独立通过。 |
| 32 / paper-mock-zj-2026-03-m171 / listening-text-7 | C/N/U | 物化缺失；原 OCR：每段录音读两遍。 | 2 遍：457.320–499.320 [457.300–501.157]；502.440–543.900 [501.157–551.508] | 1 遍：502.140–544.080 [501.157–551.508] | 上游提取缺陷：原 OCR 读两遍但物化说明缺失；证据问题：完整次数 2:1；实现缺陷：unknown 曾被误报为次数不符，已修。 |
| 33 / paper-mock-zj-hangzhou2-2026-mar / listening-text-10 | C/N/U | 物化缺失；原 OCR：每段录音读两遍。 | 2 遍：972.860–1044.200 [972.392–1045.717]；1045.820–1118.120 [1045.717–1125.950] | 1 遍：1046.440–1118.500 [1045.717–1125.950] | 上游提取缺陷：原 OCR 读两遍但物化说明缺失；证据问题：完整次数 2:1，且均漏 twenty/one；unknown 误报已修。 |
| 34 / paper-mock-zj-jinliqu-2026-mar-m2 / listening-text-1 | N/U | 物化缺失；原 OCR：每段录音读两遍。 | 2 遍：79.740–95.820 [79.666–97.479]；97.800–114.060 [97.479–119.414] | 2 遍：80.160–96.060 [79.666–97.479]；98.160–114.060 [97.479–119.414] | 上游提取缺陷：原 OCR 读两遍但物化说明缺失；两引擎各 2 遍、物理边界一致。unknown 误报已修，仍待恢复来源说明。 |
| 35 / paper-mock-zj-jinliqu-2026-mar-m2 / listening-text-6 | N/U | 物化缺失；原 OCR：每段录音读两遍。 | 2 遍：367.680–395.460 [367.660–395.528]；398.520–425.220 [397.107–425.240] | 2 遍：368.240–395.560 [∅]；398.100–425.240 [∅] | 上游提取缺陷：原 OCR 读两遍但物化说明缺失；各 2 遍，但 Whisper 物理边界不足。unknown 误报已修。 |
| 36 / paper-mock-zj-qiangji-2026-mar / listening-text-7 | C/N/U | 物化缺失；原 OCR：每段录音读两遍。 | 2 遍：463.280–513.380 [463.260–513.400]；516.500–565.340 [514.981–565.360] | 2 遍：463.780–513.640 [463.653–514.981]；515.820–565.600 [514.981–573.630] | 上游提取缺陷：原 OCR 读两遍但物化说明缺失；证据问题：两遍播放终点差分别 +1.581/+8.270 秒；unknown 误报已修。 |
| 37 / paper-mock-zj-qiangji-2026-mar / listening-text-8 | N/U | 物化缺失；原 OCR：每段录音读两遍。 | 0 遍：∅ | 0 遍：∅ | 上游提取缺陷：原 OCR 读两遍但物化说明缺失；证据问题：首锚 erhu→aahu/r/arhu，均 0 遍；unknown 误报已修。 |
| 38 / paper-mock-zj-qiangji-2026-mar / listening-text-9 | C/N/U | 物化缺失；原 OCR：每段录音读两遍。 | 2 遍：778.000–848.380 [777.958–849.838]；851.440–920.860 [849.838–929.015] | 1 遍：850.900–920.960 [849.838–929.015] | 上游提取缺陷：原 OCR 读两遍但物化说明缺失；证据问题：Whisper 首遍首锚缺失，完整次数 2:1；unknown 误报已修。 |
| 40 / paper-mock-zj-shaoxing-2026-apr-m181 / listening-text-8 | C | 每段录音读两遍。 | 2 遍：661.960–724.900 [661.940–727.535]；728.680–792.280 [727.535–800.575] | 2 遍：661.660–725.160 [660.765–727.535]；729.360–792.500 [727.535–800.575] | 证据问题：两引擎均漏 no，第一遍播放起点差 -1.175 秒；播报均指 Text 8，无组身份冲突。 |
| 42 / paper-mock-zj-taizhou-2026-m2 / listening-text-2 | N | 每段录音读两遍。 | 0 遍：∅ | 2 遍：127.660–141.420 [127.246–142.778]；143.820–157.400 [142.778–161.861] | 证据问题：Apple 尾锚 here→hear，故 0 遍；Whisper 完整 2 遍，当前可回退通过。 |
| 43 / paper-mock-zj-taizhou-2026-m2 / listening-text-8 | N | 每段录音读两遍。 | 0 遍：∅ | 2 遍：621.900–681.560 [∅]；683.760–743.300 [682.951–750.218] | 证据问题：Apple 首锚 Chen→Jen，故 0 遍；Whisper 2 遍但首遍缺物理边界，不能回退通过。 |

已确认的实现缺陷有三项：缺失组导致顺序连锁失败、`unknown` 被误报成数字次数不符、
同一静音的独立边界导致两遍播放区间重叠，均已修复。7 个未知次数组的根因是上游物化
未带入说明；原 OCR 明确有“读两遍”，当前计数解析器没有收到这些文本，不能误称为
“播两遍”词法不支持，也不能由音频两遍推断原说明。此次没有修改纸卷源。

16 个旧引擎冲突中没有发现可确证的“两引擎播报了不同组身份”。其中单引擎锚歧义、
完整 occurrence 数量差、物理边界差是不同性质的证据问题；当前输出明确区分。
旧冲突中的 2/4/6/14/22/31 号样本现在 Apple 独立通过，不再因错误的顺序失败触发
Whisper 回退。旧差异仍保留在诊断中，不将“未调用回退”解释为差异已解决。

后续建议（均未实施，阈值变化须由父任务批准）：

1. 从原 OCR 的 document/page/observations 恢复 7 组所属节的来源说明，并单独校对物化；
   无需放宽阈值，也不应增加 ASR 倒推次数的通路。
2. 先核对“一遍说明、两遍录音”的东营/青岛/天域试卷与音频配套关系。
3. 人工定位并听核专名、erhu、service/surface、here/hear 及关键否定/数字，决定是否需要
   独立来源校对；不自动扩充专名等价表或放宽连续锚要求。
4. 将 `attempt_hard_conflict` 对外原因进一步与“跨引擎实际矛盾”拆分属于策略/命名建议；
   本次只增加原因明细，保持其原有保守拦截。
5. 对 +1.738/+1.565/-1.175 秒起点差、+1.581/+8.270 秒终点差，先听核静音和 ASR run
   的关系。若未来讨论按静音区间等价判断，需另定规则并经父任务批准；本次仍为 0.5 秒。

山东完整流程复用了原 Apple 全录音及失败组的既有 Whisper 原始结果，只对失败组回退，
新 attempt 未覆盖旧证据。8 组可用、2 组复核；重新从现有来源派生 subject，并通过未修改的
`validateListeningReview`。证据目录：
`.scratch/listening-rule-v2-e2e/followup/attempt-2026-10-20T19-15-10-905Z-e377bf82/`。

| 山东组 | 结果 | 原因 / 最终播放范围（秒） |
| --- | --- | --- |
| listening-text-1 | review_required | READING_COUNT_MISMATCH |
| listening-text-2 | usable | 120.220–146.480；完整 2 遍及骨架顺序通过 |
| listening-text-3 | usable | 159.040–194.927；完整 2 遍及骨架顺序通过 |
| listening-text-4 | usable | 207.201–241.405；完整 2 遍及骨架顺序通过 |
| listening-text-5 | usable | 254.918–292.364；完整 2 遍及骨架顺序通过 |
| listening-text-6 | review_required | BOUNDARY_EVIDENCE_INSUFFICIENT, ENGINE_CONFLICT |
| listening-text-7 | usable | 451.960–553.499；完整 2 遍及骨架顺序通过 |
| listening-text-8 | usable | 589.300–697.595；完整 2 遍及骨架顺序通过 |
| listening-text-9 | usable | 739.971–878.092；完整 2 遍及骨架顺序通过 |
| listening-text-10 | usable | 917.800–1062.349；完整 2 遍及骨架顺序通过 |

验证：完整 import-pipeline 测试最终 `373 passed / 0 failed / 0 skipped`；命令为
`TMPDIR=<worktree>/.scratch/listening-test-tmp node --test --test-concurrency=1 scripts/import-pipeline/*.test.mjs scripts/import-pipeline/replay/*.test.mjs`。
默认并发的一次复跑在既有 1500ms agent timeout 测试中失败；保留失败日志，使用单文件并发
完整复跑通过，没有改动超时实现或测试阈值。新增覆盖含缺组不级联、倒序双方失败、无播报组越界、
unknown 不误报、同一静音分界及服务端真实 sidecar 校验、回放不可评估状态，以及骨架组在静音
空档内的播放区间重叠同时阻止双方。阈值与等价表逐项和父 commit 比较一致。

## 2026-10-21 审查修复及可选模糊锚评测（normalization v1 历史基线）

当前候选修复三项审查问题：失败/歧义组的部分首锚不再截断正常组的候选配对；
Whisper 裁窗忽略失败邻组的 occurrence；关键差异检查覆盖对齐两侧；中文编号门禁
允许英文引文及英文 inline 子项。先无邻组约束独立判定，再冻结成功骨架用于候选配对。
已观测精确尾词沿用原有的播报分段用途，不能据此充当成功骨架或收窄裁窗。

模糊锚由 `LISTENING_SEGMENT_RULE.fuzzyAnchorsEnabled=false` 控制，尚未启用默认。
适配器及回放 CLI 都接受 `--fuzzy-anchors` / `--no-fuzzy-anchors`，实际配置写入 attempt。
精确 6 词锚缺失时才尝试 12 词锚，只有同长度窗口中最多 1 处替换，绝不以插入/删除匹配。
每遍首尾合计最多 1 处替换，另一端 12 词须精确。替换两侧均不得为数字、否定、
货币、时间或该组题干/选项的实词。题目按 `canonicalNumber` / `sourceNumber` 绑定，
所有相关题干和选项缺一则不能批准模糊候选；实词采用保守的非功能词集合。

同源自身、其他源文组、当前录音和全录音均用相同的“最多 1 处替换”规则枚举候选，
被保护词替换的候选仍参与歧义计数。全录音 ASR 窗口必须连续覆盖录音，且首尾候选数
与来源次数一致；回退裁窗还须与全录音候选在 0.5 秒内对应。仅 Whisper 裁窗不能证明
全卷唯一。适配器保留 Apple 全录音作为全局证据；45 组裁窗回放不混入补充全录音。
不足 20 词不能模糊匹配；20–23 词因两锚重叠仍需复核，只有另一引擎给出完整精确且
通过其余门禁的证据，合并时才能选择该精确结论。次数、顺序、末话轮、物理边界、
双引擎冲突与 0.95/0.90 阈值均未放宽，等价表与规范化算法未扩充。

`anchors.fuzzy` 保留候选位置及全局唯一性证据；每遍 `anchorSubstitutions` 保留端点、
源词/ASR 词、源词下标/ASR 下标、原始源词和 ASR run 文本。源文不改写。

最终完整 import-pipeline 测试：`389 passed / 0 failed / 0 skipped`（新增 16 项）。
测试覆盖 Astra 反例、成功骨架裁窗、双侧关键字差异、英文引文、模糊锚禁区和全局唯一性。
命令：

```sh
TMPDIR=<worktree>/.scratch/listening-v2-fix-tests node --test --test-concurrency=1 \
  scripts/import-pipeline/*.test.mjs scripts/import-pipeline/replay/*.test.mjs
```

最终缓存评测结果如下；45 组来自 22 卷，复用原 ASR，不重跑识别。

| 范围 | 模糊锚关 | 模糊锚开 |
| --- | --- | --- |
| 45 组局部规则，排除不可评估的整卷顺序 | usable 23 / review_required 22 | usable 23 / review_required 22 |
| 45 组含顺序状态 | usable 0 / review_required 22 / ORDER_NOT_EVALUABLE_IN_REPLAY 23 | 相同 |
| Apple 原规则判定 | usable 18 / review_required 27 | 相同 |
| Whisper 原规则判定 | usable 17 / review_required 28 | 相同 |
| 山东完整流程，含全卷顺序及原服务端 sidecar 校验 | usable 8 / review_required 2 / 校验 PASS | 相同 |

开关导致最终 `usable/review_required` 改变的组为 **0**，没有新增或可疑放行。
以下列出全部新增模糊候选，包括最终结果不变的组；样本号沿用 manifest 的零起始 index。

| 样本 / 卷 / 组 | 替换词对 | 开启后的处置 |
| --- | --- | --- |
| 0 / 杭州 / text-4 | service → surface（Apple） | 属于题干/选项保护词，且缺全录音唯一证据；继续选择原先精确通过的 Whisper |
| 2 / 杭州 / text-9 | helpline → heartline（Whisper） | 保护词、缺全录音证据且次数不足；原 Apple 精确结论不变 |
| 12 / 山东核心素养 / text-1 | Cris → Chris（两引擎） | 裁窗缺全录音唯一证据且正文低于 0.95；维持复核 |
| 37 / 浙江强基 / text-8 | erhu → aahu（Apple）；erhu → arhu（Whisper） | Apple 未形成唯一完整首尾配对；Whisper 命中保护词；两者次数来源未知，维持复核 |
| 42 / 台州 / text-2 | here → hear（Apple） | 缺全录音唯一证据；继续选择原先精确通过的 Whisper |
| 43 / 台州 / text-8 | Chen → Jen（Apple） | 缺全录音唯一证据；Whisper 原有首遍边界不足，维持复核 |

山东完整流程中，text-1 的 Apple 全录音可以证明候选唯一，但正文两遍的匹配率/编辑
相似度均为 0.903226，仍不满足短材料 0.95；故复核原因从次数不足变为正文低匹配。
text-6 仍为边界不足和引擎冲突；text-2–5、text-7–10 仍可用。两种配置各调用 4 个
失败组的既有 Whisper 输出，未启动 ASR。两次完整结果均通过未改动的
`validateListeningReview`。

相较此前历史回放的 29/16，本轮 23/22 的差异来自更完整的关键字门禁，
与模糊锚开关无关。新增复核样本为 4、5、11、27、28、44，涉及 AM/PM/整点表示、
`first/1st`、`second/2nd` 和插入 `hundred` 等差异；其中含规范化范围尚未覆盖的
表示差异，不能把这些保守复核一律解释为真实录音内容错误。本轮没有自动扩充等价规则。

本工作树的最终证据：

- `.scratch/listening-v2-fix-suite-final.log`
- `.scratch/listening-v2-fix-replay-final-off/replay-2026-10-20T19-29-02-871Z.json`
- `.scratch/listening-v2-fix-replay-final-on/replay-2026-10-20T19-29-02-876Z.json`
- `.scratch/listening-v2-fix-e2e-off/attempt-2026-10-20T19-29-18-867Z-76934f40/`
- `.scratch/listening-v2-fix-e2e-on/attempt-2026-10-20T19-29-19-339Z-7ecf379f/`

## 2026-10-21 normalization v2 追加验证

模糊锚继续默认关闭。此次只扩展前述确定等价表达式及其原始字符/时间映射，
关键字检查仍位于规范化之后，0.95/0.90、次数、顺序、边界、冲突和送审策略不变。
下表 index 均为 manifest 零起始编号；“通过”仅指本次裁窗局部规则，整卷顺序仍不可评估。

| 样本 / 组 | v1 的具体表示差异 | v2 最终结果及保留的疑点 |
| --- | --- | --- |
| 4 / 江南十校 / text-9 | 源 `9:00 am` 展开为 nine o'clock am；Apple `9` + `a.m.` 变 nine a m；Whisper `9am` 的 9 未展开，形成伪数字/整点差异 | Apple 两遍通过，选择 Apple。Whisper 时间表示修复后仍只有一遍完整首尾锚，保留 `READING_COUNT_MISMATCH`。ha-ha 缺词及第二遍 read/ready 差异仍计分，Apple 匹配率 0.989071 / 0.983607。 |
| 5 / 江南十校 / text-10 | 源 `1:00 pm` 与 one p.m. 的 o'clock/meridiem 差异；first 与 `1st`（旧为 one st）；`1:15 pm` 与 Apple `115 p.m.`（旧多 hundred）；Whisper `1pm`、跨 run `1` + `.15pm`、`2` + `.45pm` 的附字母数字未展开 | 两引擎两遍均通过，选择 Apple。明确 PM 与合法 HMM/H.MM 保证小时/分钟值确定，不对裸整数套此规则；to gather/together 差异未加入等价表，仍计分。两引擎每遍匹配率均 0.989848。 |
| 11 / 宁波 m2 / text-10 | 源 first 与 Apple `1st`；源 `9:00` / o'clock 与 Whisper 跨 run `o` + `'clock`，旧拆为 o / clock | 两引擎两遍通过，选择 Apple；can/could 仍作为替换计分，每遍匹配率 0.994382。 |
| 27 / 天域 m4 / text-9 | 源 second 与 Apple `2nd`（旧为 two nd）；Whisper 首遍另有 too → two | Apple 两遍通过（各 0.984925）；Whisper 的 too/two 不是等价表示，仍报 `CRITICAL_WORD_DIFFERENCE`。kingdoms/kingdom、seminar's/seminar、was/with、gotta/got to 仍按原阈值计分，没有改写源文或新增同音类。 |
| 28 / 天域 m4 / text-10 | 源 `09:30`；Apple 首遍 `9.30`、第二遍 `930`（旧多 hundred）；Whisper 两遍 `9.30`；另有源 `12:00` 与 Whisper 跨 run `o` + `'clock` 的伪差异 | **仍复核**。12:00 的分词差异已修，但无 AM/PM 的 `9.30` 可能是小数，裸 930 可能是整数，不自行补冒号；两引擎都保留 `CRITICAL_WORD_MISSING` / `CRITICAL_WORD_DIFFERENCE`。Whisper 两遍匹配率 0.968254 / 0.973545 仍被关键字门禁挡住。专名等替换继续计分；这属于表示尚不确定，不能仅凭 ASR 断言录音内容错误。 |
| 44 / 台州 m2 / text-9 | 源 `3:00 p.m.` 旧为 three o'clock p m；Apple `3 pm` / Whisper meridiem 表示缺少或拆开 o'clock/p/m | 两引擎两遍通过，选择 Apple；Apple 1 / 0.989899，Whisper 1 / 1。Apple 第二遍 we'll/will 仍计分。 |

由 v1 的 23/22 变为 **28/17**，仅 4、5、11、27、44 五组从复核变为局部可用；
原有可用组没有新增失败。开发阶段一次 29/16 的试跑把裸 `9.30` 当数字片段后与
9:30 重合；数值反例揭示此歧义后，最终明确保留未标注小数，28 号恢复保守复核。
没有为达到更高通过率而推断时间意义。

| 最终范围 | 模糊锚关 | 模糊锚开 |
| --- | --- | --- |
| 45 组 / 22 卷，排除整卷顺序的局部分布 | usable 28 / review_required 17 | 相同 |
| 包含顺序状态 | usable 0 / review_required 17 / ORDER_NOT_EVALUABLE_IN_REPLAY 28 | 相同 |
| orderStatusCounts | 全部 45 组 ORDER_NOT_EVALUABLE_IN_REPLAY | 相同 |
| Apple | usable 25 / review_required 20 | 相同 |
| Whisper | usable 20 / review_required 25 | 相同 |
| 山东完整流程，含全卷顺序及未改动服务端 sidecar 校验 | usable 8 / review_required 2 / 校验 PASS | 相同 |

模糊锚开关对最终决策影响仍为 0。山东 text-1 仍为 Cris/Chris 首锚问题：
默认关闭报次数不足；开启后 Apple 两遍匹配率均 0.903226，低于短材料 0.95，继续复核。
text-6 仍为物理边界证据不足及引擎冲突，其余 8 组可用。两种配置各只调用 text-1、
text-6 的缓存 Whisper 输出，共 2 组；text-7、text-10 由此前 Whisper 回退通过变为
Apple 独立通过。没有启动新 ASR，也未将缓存裁窗冒充本次重新识别结果。

完整 import-pipeline/replay 测试 **398 passed / 0 failed / 0 skipped**（新增 9 项）：
31 个序数、meridiem/时刻/half past/年份等价，千分位与货币兼容，小数歧义，
跨 run 原始文本与边界，失败/倒序时间戳及空档，不等序数/分钟/AM-PM/年份/金额、
否定和 too/two 的公共规则入口硬阻断。Node 24.15.0：

```sh
TMPDIR=<worktree>/.scratch/listening-equivalences-v2-test-tmp \
node --test --test-concurrency=1 scripts/import-pipeline/*.test.mjs scripts/import-pipeline/replay/*.test.mjs
```

最终证据均位于当前工作树；早期 v1 / 试跑证据保留，未覆盖：

- `.scratch/listening-equivalences-v2-suite-final.log`
- `.scratch/listening-equivalences-v2-replay-final-off/replay-2026-10-20T19-44-01-824Z.json`
- `.scratch/listening-equivalences-v2-replay-final-on/replay-2026-10-20T19-44-01-834Z.json`
- `.scratch/evaluate-listening-equivalences-v2.mjs`（仅复用缓存的本地完整流程入口）
- `.scratch/listening-equivalences-v2-e2e-comparison-final.json`
- `.scratch/listening-equivalences-v2-e2e-off/attempt-2026-10-20T19-43-57-881Z-710455f0/`
- `.scratch/listening-equivalences-v2-e2e-on/attempt-2026-10-20T19-43-59-011Z-4c547e75/`

## 2026-10-21 Astra 复审修正：表达式类型与编号条目

修复两个可复现漏拦，未改阈值，模糊锚仍默认关闭：

- P1：原路径先展开时刻/数字，再把 `twenty ...` 当成年份，丢失原始表达式类型。
  现在年份读取器只接受原始单词；token 带原始类型、形式、文本及年份值，
  源文/ASR 对齐检查年份类型兼容性。`by 2026` / `by 20:26`、
  `before 2013` / `before 20:13`、`in 2026` / ASR 分离 run 的 `in 20 26`
  全部为 `review_required`，含 `CRITICAL_WORD_DIFFERENCE`。
  混合数字读法如 `in 2 thousand 26` 即使展开文字一致也不能绕过门禁。
  四位年份与 twenty twenty-six / two thousand and twenty-six 等明确单词读法
  仍双向等价；两个不同的纯单词年份表达式不新增互换许可，相同表达式照常匹配。
- P2：原路径只选 `after || before || prior` 的首个相邻词，DIY/BBQ 会掩盖条目中文。
  现在检查直到下一个编号/分隔符的整项，包括跨 inline run 的内容，
  英文引文先屏蔽；`要点：(1) DIY 活动；(2) BBQ 晚会` 报出两个编号。
  保留英文引文、独立英文 inline 从句、跨 run 括号和省略号条目的既有行为，
  不把下一编号条目的中文传给当前英文条目，不改写物化内容。

Node 24.15.0 完整 import-pipeline/replay 测试 **409 PASS / 0 FAIL / 0 SKIP**，
较上一提交新增 11 项（年份/类型 7 项、编号条目 4 项）。

| 最终验证 | 修正前 | 修正后 |
| --- | --- | --- |
| 45 组 / 22 卷局部 usable / review_required | 28 / 17 | 28 / 17 |
| Apple、Whisper 各自 usable / review_required | 25 / 20、20 / 25 | 25 / 20、20 / 25 |
| 含顺序状态 usable / review / ORDER_NOT_EVALUABLE_IN_REPLAY | 0 / 17 / 28 | 0 / 17 / 28 |
| 山东完整流程 usable / review_required | 8 / 2 | 8 / 2 |
| 山东缓存 Whisper 回退组数；原服务端 sidecar 校验 | 2；PASS | 2；PASS |

模糊锚 OFF / ON 都是上述分布，最终决策差异为 0；与上一提交逐组比较，
45 组和山东的决策、原因均无变化。45 组仍全部缺少可证明整卷顺序的覆盖，
局部 28 组可用不等于整卷批准。山东 text-1、text-6 仍复核；
text-1 在 OFF 为次数不匹配，在 ON 为正文匹配率低，text-6 为边界不足/引擎冲突。
仅复用原缓存 ASR，没有新识别；新 `input.json` 中 rule/adapter 哈希已核对当前实现。

本轮新增证据（当前工作树内独立目录，保留原证据）：

- `.scratch/listening-astra-type-fix-suite-final.log`
- `.scratch/listening-astra-type-fix-replay-off/replay-2026-10-20T19-56-40-504Z.json`
- `.scratch/listening-astra-type-fix-replay-on/replay-2026-10-20T19-56-40-518Z.json`
- `.scratch/evaluate-listening-astra-type-fix.mjs`
- `.scratch/listening-astra-type-fix-e2e-comparison-final.json`
- `.scratch/listening-astra-type-fix-e2e-off/attempt-2026-10-20T19-56-35-280Z-f151ec8c/`
- `.scratch/listening-astra-type-fix-e2e-on/attempt-2026-10-20T19-56-36-396Z-32085c2f/`

## 2026-10-21 normalization v3：真实整卷误拦修复

规则版本保持 v2；等价版本升为 `listening-equivalences-v3`。阈值仍为短材料
0.95、其他 0.90，精确首尾锚仍为 6 词，模糊锚默认关闭。没有新增专名、同音词、
动词屈折或任意所有格等价。

新增的确定缩写规则在源文和 timed ASR 的同一路径中执行，先展开再对齐及检查关键字：

| 类别 | 有限范围 | 保守边界 |
| --- | --- | --- |
| 否定助动词 | do/does/did/is/are/was/were/has/have/had/could/would/should/must/might/need/ought/dare + n't；can't/cannot → can not；won't → will not；shan't → shall not | not 必须保留；doesn't ↔ does、can't ↔ can、won't ↔ will 双向都拦截；未列形式不猜测 |
| 确定的肯定缩写 | I'm；you/we/they + 're；i/you/we/they/could/would/should/might/must + 've；i/you/he/she/it/we/they/there/that/who/what + 'll | 展开为 am/are/have/will，不移除主语或助动词 |
| 's | 紧邻 been → has；代词主语紧邻 being → is；he/she/it/there/that/who/what 紧邻有限表语 wrong/ready/afraid/happy/sorry/here/there 或物主限定词 my/your/his/her/its/our/their → is | 只接受这些标准英语谓语语境；John's running、city's park、it's gone、he's finished、it's not 等歧义保留；不将 's 本身作为关键字 |
| 'd | 代词主语紧邻 been/better → had；紧邻 be/have/like/love/prefer/rather/go/work/join/say/take/give/need/want → would | read 等有 had/would 歧义的形式保留，不统一改为 would |

上下文缩写保留完整表达式的原始字符范围和原 run 边界；不能跨句点、segment、
失败/倒序时间戳或超过 2 秒的空档展开。多 token 展开不能为内部 token 创造物理播放边界。
即使规范化后的纯文本相等，既有 year/time/cardinal/ordinal 类型门禁仍执行。

边界修复：先过滤不能容纳完整原 run 与既有 0.02 秒余量的静音候选，再按既有先后
规则选取相邻静音。候选仍必须是实际测得的静音且距 run ≤2 秒；没有合格静音仍复核。
跳过不合格候选时还须执行下节 Astra P1 的双侧语音间隙保护，不能仅凭余量选择更远静音。
没有更改 silence 参数、2 秒窗口、0.02 秒余量、时长比、双引擎冲突或骨架策略。

### 六组诊断

下表首尾为修复前规范化的连续 6 词（已去说话人标签；Hey 已按既有规则变为 hi）。
时间为录音绝对秒，第一/第二遍以分号分隔；“首/尾”各列给出相应六词时间范围。
所有尾词与源一致，山东 Text 6 展开后的尾六词为 `right now we will talk later`。

| 组 | 源首六词 / 源尾六词 | 根因与修复后的结论 |
| --- | --- | --- |
| 潍坊 Text 3 | `mr white i'm afraid i have` / `a guide for the returning graduates` | 两引擎读作 `mr white i am afraid i`，缺缩写展开导致首锚为零。恢复后还发现 what's wrong / what is wrong、it's our… / it is our…；有限谓语语境展开后 Apple 两遍匹配率/编辑相似度均 1，可用。Whisper 首遍 Mr. 提前到 184.70、White 188.84，缺 anniversary，仍有开头空档及两遍时长比异常；原始证据保留，本轮 Apple 独立成功不调用该缓存。 |
| 潍坊 Text 5 | `this subway transfer hall is huge` / `a lot on improving public spaces` | city’s been / city has been 是漏归一化；makes / make 是两引擎一致的真实转写差异，未消除。前者修复后仍为短材料（39 词），两遍两项分数均 38/39 = 0.974359，原阈值内可用；不是单纯把 0.947 放行。 |
| 潍坊 Text 7 | `hi leo you've improved a lot` / `be there this week thanks leo` | 两引擎首部均为 `hi leo you have improved a`；非标签、中文播报或窗口问题。展开后 Apple 两遍匹配率均 0.992537，编辑相似度 0.985185/0.977941，可用。it's way / it is way 仍保留差异，不为提高分数扩展歧义形式。 |
| 潍坊 Text 10 | `last month a group of university` / `hearts it becomes alive and meaningful` | 源 doesn’t，两个引擎均 does not；旧关键字检查看到未匹配的 doesn't 和插入 not，形成伪否定冲突。展开后否定一致，Apple 两遍匹配率 0.988636/0.982955，编辑相似度 0.977528/0.966480，可用；learned/learn、Wuqinxi/wu ching shi、textbooks/text books 仍计差异。没有剥除源 TCM 括号说明。 |
| 山东核心素养 Text 1 | `hi cris i love your suit` / `bought me this for my birthday` | 两引擎均 Chris，专名差异没有等价授权；Apple 两遍首锚为零，Whisper 还缺首遍。继续 READING_COUNT_MISMATCH，playback 为 null，不用模糊锚绕过。ASR 本身不能证明源文拼写错误。 |
| 山东核心素养 Text 6 | `hi george congratulations on your promotion` / `office right now we'll talk later` | Apple 两遍正文均完整；第二遍末 run 到 412.500，旧 find 选 412.419167–412.503333 的微小静音，无法留足 0.02 秒；随后 412.922–422.580792 的合格静音被忽略。修复后第二遍终点 417.751396，Apple 独立两遍通过。Whisper 首遍整个开头缺失，首个后续 token 为 I@365.84，第二遍完整；不把 2/1 改成虚假一致，本轮不再触发回退。 |

| 组 | Apple 首 / 尾 | Whisper 首 / 尾 |
| --- | --- | --- |
| 潍坊 Text 3 | 187.20–190.26 / 202.56–204.42；206.22–209.16 / 221.40–223.32 | 184.70–190.26 / 202.64–204.64；206.78–209.10 / 221.48–223.48 |
| 潍坊 Text 5 | 303.36–306.36 / 317.22–319.56；321.36–324.18 / 335.10–337.98 | 303.00–306.34 / 317.20–319.82；321.66–324.18 / 335.06–337.80 |
| 潍坊 Text 7 | 529.80–533.88 / 584.34–586.92；588.54–592.32 / 642.72–645.36 | 530.58–533.82 / 584.02–586.72；589.30–592.40 / 642.60–645.34 |
| 潍坊 Text 10 | 1051.32–1054.38 / 1129.20–1132.86；1135.92–1137.90 / 1212.66–1215.78 | 1051.58–1054.62 / 1129.26–1132.40；1135.48–1138.06 / 1212.68–1215.80 |
| 山东 Text 1（首为 `hi chris i love your suit`） | 78.30–81.36 / 88.68–90.00；91.44–94.56 / 101.76–103.56 | 首遍缺失；92.20–94.56 / 101.84–103.44 |
| 山东 Text 6 | 357.00–361.14 / 382.20–384.18；385.50–389.40 / 410.94–412.50 | 首遍首锚缺失，尾 382.50–384.38；386.10–389.70 / 411.00–412.82 |

Text 5 的 city/has/been：Apple 首遍 316.14–316.68、第二遍 333.90–334.62；
Whisper 首遍 316.06–316.74、第二遍 333.86–334.58。
Text 10 的 does/not：Apple 1123.20–1123.74、1206.54–1207.02；
Whisper 1123.08–1123.62、1206.50–1207.04。
以上均复用 2026-10-20 整卷重跑的原始 evidence，没有再次识别。

### 验证

- 完整 import-pipeline/replay 测试 **431 PASS / 0 FAIL / 0 SKIP**，新增 7 项。
  两条既有断言改为检查展开后的 not，以及插入+替换不能生成模糊锚候选，未减弱否定保护。
- 45 组、22 卷局部回放仍为 **28 usable / 17 review_required**；含顺序状态为
  **0 usable / 17 review_required / 28 ORDER_NOT_EVALUABLE_IN_REPLAY**，
  45 组整卷顺序均不可评估。Apple 25/20；Whisper 21/24（此前 20/25）。
  同一缓存与 HEAD 原规则逐组比对，最终决策变化为 0；除 normalizationVersion 外，
  `LISTENING_SEGMENT_RULE` 所有参数逐项相等。
- 潍坊整卷 **6/4 → 10/0**，全部由 Apple 独立通过，本轮 0 次 Whisper 回退。
- 山东核心素养整卷 **8/2 → 9/1**，只有 Text 1 回退到原 Whisper 缓存，仍需复核。
  两卷均通过未改动的 `validateListeningReview`；原物化、活动 sidecar 和分页文件哈希未变。
- 新 ASR 调用为 0。新 attempt 保留本次算法/代码哈希、原缓存窗口范围、判定和未批准组；
  不安装到纸卷、不送审、不发布。

证据在当前工作树下：

- `.scratch/listening-v3-group-diagnostics.json`：六组原首尾锚、逐 token/raw run/时间及缓存文件绝对路径。
- `.scratch/listening-v3-cached-e2e.mjs`、`.scratch/listening-v3-cached-e2e-summary.json`：缓存整卷入口与汇总。
- `.scratch/listening-v3-cached-e2e/paper-mock-shandong-weifang-2026-04-second-mock/attempt-2026-10-20T20-48-13-040Z-52dbd99d/`
- `.scratch/listening-v3-cached-e2e/paper-mock-shandong-2026-04-core-literacy-assessment/attempt-2026-10-20T20-48-13-176Z-0c876835/`
- `.scratch/listening-v3-replay-final/replay-2026-10-20T20-48-28-107Z.json`
- `.scratch/listening-v3-replay-baseline-comparison.json`：45 组逐项基线对照与参数不变断言。
- `.scratch/listening-v3-suite-final-2.log`

命令：

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
TMPDIR="$PWD/.scratch/listening-v3-test-tmp" node --test --test-concurrency=1 \
  scripts/import-pipeline/*.test.mjs scripts/import-pipeline/replay/*.test.mjs
node scripts/import-pipeline/replay-listening-rule.mjs .scratch/asr-eval-20261020 \
  .scratch/listening-v3-replay-final --no-fuzzy-anchors
node .scratch/listening-v3-cached-e2e.mjs
```

## 2026-10-21 Astra P1 跟进：跳过静音的语音保护与情态词

修复原反例：正文末 run 结束于 4.200，静音 4.120–4.203 无法保留 0.02 秒余量；
4.250–4.550 是 timed `Text Two`，后续静音为 4.620–7.200，下一组正文从 8.200 开始。
原路径会批准前组到 5.910，包含下一组播报。现前组为 `review_required`，
每遍和组均记录 `BOUNDARY_EVIDENCE_INSUFFICIENT`，组的批准 playback 清空，
下一组仍独立可用。

跳过候选改选更远静音时，末 run 结束至所选静音起点之间不得有任何已观测 timed ASR
语音；起点侧对称检查所选更早静音终点至首 run 开始之间的间隙。
正文、播报、普通提示、中文提示均计入；检查原始 run/word 时间区间，不依赖英文规范化、
播报分类或正文选窗。仅有 segment 文字及时间时也保守保留该区间。
重复/重叠窗口中没有参与正文对齐的语音同样保留。
`boundarySpeech` 存紧凑的绝对时间区间并集；每遍 `boundaryEvidence`
记录选中/跳过的静音、阻挡语音与终点限制。按组携带证据，保证适配器和回放提取组后仍可使用；
合并时汇总所有已观测引擎和组的时间区间，复查先前通过的主引擎边界，包括别组回退窗口中的语音。
合并不修改原引擎 attempt 的 occurrence。

终点仍须在真实静音内包住完整末 run，并保留 0.02 秒余量；静音中点若越过下一遍正文开头
或成功骨架邻组的 playback 起点，只允许在同一已观测静音内收紧。
限制落在静音之外或不能保留余量时复核；保留原有共享静音的安全分界。
双引擎合并后再检查下一遍/冻结骨架的限制。普通相邻静音不额外套用“跳过候选”的间隙条件。

情态词按上文 Owner 策略全部加入关键字门禁，等价表版本仍为 v3，数值阈值未变。
新增覆盖九词逐一插入/删除/替换、确定缩写等价和缩写丢词；
边界回归覆盖原 Astra 秒数、起点侧、中文/非播报提示、被舍弃窗口、其他引擎/其他组窗口、
下一遍和骨架限制、静音外的非法收紧。原反例先失败，再通过修复后的公共入口。

| 最终验证（与 f5e048e2 相同缓存） | 上一提交 | 本次 |
| --- | --- | --- |
| 完整 import-pipeline/replay 测试 | 431 PASS | 439 PASS / 0 FAIL / 0 SKIP |
| 45 组 / 22 卷局部 usable / review_required | 28 / 17 | 27 / 18 |
| Apple、Whisper 各自 usable / review_required | 25 / 20、21 / 24 | 24 / 21、20 / 25 |
| 含顺序 usable / review / ORDER_NOT_EVALUABLE_IN_REPLAY | 0 / 17 / 28 | 0 / 18 / 27 |
| 潍坊整卷 usable / review_required；缓存回退组数 | 10 / 0；0 | 10 / 0；0 |
| 山东核心素养整卷 usable / review_required；缓存回退组数 | 9 / 1；1 | 9 / 1；1 |
| 两卷未改动的 validateListeningReview | PASS | PASS |

唯一新增复核为样本 11、`paper-mock-nb-2026-m2` / `listening-text-10`：
源 `I can see`，Apple 和 Whisper 各两遍均为 `I could see`。
两引擎每遍仍有 179/180 = 0.994444 的匹配率及编辑相似度；
现在触发 `CRITICAL_WORD_MISSING` / `CRITICAL_WORD_DIFFERENCE`，属于已有缓存中的实际词义差异，
没有将 can/could 加为等价。45 组没有因跳过静音保护而新增复核；
全部 45 组仍缺整卷顺序证据，局部 27 组可用不能当作整卷批准。
其他 44 组最终决策和原因不变。

两卷无新增拦截：潍坊仍全部 Apple 独立通过；山东只读取 Text 1 的旧 Whisper 缓存，
仍因 Cris/Chris 首锚缺失而报次数不足。山东 Text 6 的 tiny pause 后没有额外 timed 语音，
可继续使用合格静音。未调用回退不代表已消除了旧缓存中的跨引擎差异。
新 ASR 调用为 0；原物化、活动 sidecar、分页文件哈希前后相同。
所有新结果仅写入独立 scratch attempt，没有装入纸卷、送审、push 或生产动作。

最终证据（均在当前工作树）：

- `.scratch/listening-p1-final-suite.log`
- `.scratch/listening-p1-final-replay/replay-2026-10-20T21-03-47-919Z.json`
- `.scratch/listening-p1-final-comparison.json`
- `.scratch/listening-p1-final-cached-e2e.mjs`
- `.scratch/listening-p1-final-cached-e2e-summary.json`
- `.scratch/listening-p1-final-cached-e2e/paper-mock-shandong-weifang-2026-04-second-mock/attempt-2026-10-20T21-03-24-615Z-687a8c03/`
- `.scratch/listening-p1-final-cached-e2e/paper-mock-shandong-2026-04-core-literacy-assessment/attempt-2026-10-20T21-03-24-889Z-bcaa0104/`

最终执行命令：

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
TMPDIR="$PWD/.scratch/listening-v3-test-tmp" node --test --test-concurrency=1 \
  scripts/import-pipeline/*.test.mjs scripts/import-pipeline/replay/*.test.mjs
node scripts/import-pipeline/replay-listening-rule.mjs .scratch/asr-eval-20261020 \
  .scratch/listening-p1-final-replay --no-fuzzy-anchors
node .scratch/listening-p1-final-cached-e2e.mjs
```
