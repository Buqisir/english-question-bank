# 听力导航切段：listening-segment-rule-v2

实现仅位于 `scripts/import-pipeline/`，沿用服务端 `listening-review-v1` 契约。
Apple SpeechAnalyzer 为主引擎；失败组只按独立锚定成功的相邻骨架组收窄裁窗，由已安装的 Whisper
`small.en` 单次复核。两份原始结果、失败信息和规则判定均保留。无播报不直接判错；
正文唯一性、全卷单调顺序和相邻组边界仍须有证据。缺少相邻组的离线裁窗不能替代全卷证明。

## 参数和判定

唯一参数入口为 `lib-listening-segment-rule.mjs` 的 `LISTENING_SEGMENT_RULE`：

| 参数 | 值 |
| --- | --- |
| 规则 / 等价表版本 | `listening-segment-rule-v2` / `listening-equivalences-v2` |
| 首尾连续锚 | 6 词；歧义扩为 12 词，仍歧义则复核 |
| 可选模糊锚 | 默认关闭；至少 20 词，12 词连续锚中恰好 1 处替换，每遍另一端须精确 |
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

次数未知时只报 `READING_COUNT_UNKNOWN`，不把数字遍数与字符串 `unknown` 比较而误报
`READING_COUNT_MISMATCH`；未知状态仍需复核。

顺序骨架由正文、次数、唯一锚和物理边界独立通过的组构成。先冻结骨架，再按题号比较；
倒序、重叠或跨越发音边界同时标记双方。缺失或失败组只扩大区间，不能让其余组连锁失败。
无播报组的每一遍必须严格位于前一骨架组最后发音结束之后、后一骨架组首次发音开始之前；
卷首/尾缺少一侧骨架时该侧无邻组约束。失败组保持失败，任何顺序失败都清空批准播放区间。
Apple 和 Whisper 合并后再次校验同一骨架规则；局部 Whisper 结果不能自行代表整卷通过。

每遍独立连续对齐，禁止拼接两遍的首尾。尾锚包含真实末话轮的结尾；短末话轮连同前文
构造。漏整话轮，以及对齐任一侧的数字、货币、否定词或时间差异均要求复核；
删除、插入和替换均记录在 `alignment.differences`，新增 `not` 不能因源词全匹配而放行。
正文内部观察到超过 2 秒的静音也保守
要求复核，避免拼接分离片段。重复和重叠窗口先按绝对时间选择一致窗口区间，再计遍数。

相邻两遍若分别选择同一静音内的边界而发生播放重叠，只能在该已观测静音内选择共同分界点，
并同时保留前遍末 run 与后遍首 run 的完整发音及原有 0.02 秒余量；否则仍报
`READINGS_OVERLAP`。`boundaryAdjustments` 保留原边界、静音区间及共同分界点。

等价规则先于关键字门禁执行，源文与 ASR 使用同一规范化路径；全部插入、删除、替换仍检查
规范化后的两侧数值、序数、货币、否定和时间。当前版本 `listening-equivalences-v2`：

| 类别 | 确定等价范围 | 保守边界 |
| --- | --- | --- |
| 固定拼写 / 基数 / 货币 | 既有 OK/okay、Hi/Hey、hm/hmm、英美拼写；0–999999 整数（含千分位）；`$`/`£` 与两位分值 | 不增加人名或同音词；`too` ≠ `two` |
| 序数 | `1st`–`31st` 与 first–thirty-first；连字符或空格均可 | 保留 first / second / third 等不同值，以及序数与基数的区别；错误后缀不修正 |
| AM / PM | `a.m.` / `AM` / `am` 与 `p.m.` / `PM` / `pm`；附在数字后亦支持 | AM 与 PM 不互换；只在明确 AM/PM 前省略整点 `o'clock` |
| 时刻 | `HH:MM`（小时 0–23、分钟 00–59），如 `7:30` / seven thirty；整点仍对应 o'clock；个位分钟保留 oh | 不猜测 12/24 小时换算；裸 `930` 仍为 nine hundred thirty |
| 明确 meridiem 的数字时刻 | `1.15pm` / `1:15 pm` / `115 p.m.`，附 AM/PM 且小时 1–12、分钟合法；跨 run 的 `1` + `.15pm` 同样支持 | 没有 AM/PM 的 `7.30` 保留数值小数，不自动当 `7:30`；无后缀裸整数不补冒号 |
| 明确 half past | half past one–twelve（或 1–12）对应该小时 thirty | 不加入 half seven、quarter to 等额外读法，也不推断上午/下午 |
| 年份分组读法 | 2001–2099；2026 / twenty twenty-six、2006 / twenty oh six；复用基数展开 | 仅整段为年份表达式，或紧接 in/since/during/until/by/before/after/from/year；不跨句点/逗号，货币或时长单位后缀不按年份改写；twenty six 不猜成 2006 |

`first` ≠ `second`、`7:30` ≠ `7:13`、`2026` ≠ `2027`，相同数值的表示转换不改变
这些保护。专名和其他正文差异仍进入原编辑距离及话轮检查，不因等价表更新而被消除。

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
第一类沿用原有保守拦截策略，不能解释为两引擎给出了相反身份。顺序冲突由合并后的
骨架统一裁定，不再把先前某引擎的派生顺序失败直接当作跨引擎矛盾。

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
  括号数字不据此拦截。按编号的局部语言和引号判断，不因整串或兄弟 inline 项含中文
  就拦截英文引文；纯编号 run 和跨 run 的括号仍从相邻文本获取语境。
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
