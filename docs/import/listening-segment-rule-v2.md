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

次数未知时只报 `READING_COUNT_UNKNOWN`，不把数字遍数与字符串 `unknown` 比较而误报
`READING_COUNT_MISMATCH`；未知状态仍需复核。

顺序骨架由正文、次数、唯一锚和物理边界独立通过的组构成。先冻结骨架，再按题号比较；
倒序、重叠或跨越发音边界同时标记双方。缺失或失败组只扩大区间，不能让其余组连锁失败。
无播报组的每一遍必须严格位于前一骨架组最后发音结束之后、后一骨架组首次发音开始之前；
卷首/尾缺少一侧骨架时该侧无邻组约束。失败组保持失败，任何顺序失败都清空批准播放区间。
Apple 和 Whisper 合并后再次校验同一骨架规则；局部 Whisper 结果不能自行代表整卷通过。

每遍独立连续对齐，禁止拼接两遍的首尾。尾锚包含真实末话轮的结尾；短末话轮连同前文
构造。漏整话轮、数字/货币/否定词均要求复核。正文内部观察到超过 2 秒的静音也保守
要求复核，避免拼接分离片段。重复和重叠窗口先按绝对时间选择一致窗口区间，再计遍数。

相邻两遍若分别选择同一静音内的边界而发生播放重叠，只能在该已观测静音内选择共同分界点，
并同时保留前遍末 run 与后遍首 run 的完整发音及原有 0.02 秒余量；否则仍报
`READINGS_OVERLAP`。`boundaryAdjustments` 保留原边界、静音区间及共同分界点。

等价表仅包含明列的 OK/okay、Hi/Hey、hm/hmm、部分英美拼写，以及代码中确定的数字、
整点时间和货币读法；不添加专名。Apple attributed run 可包含多个词，词时按 run
内插值并显式标记；只有 run 的外边界能证明发音边界，不能把整段时间冒充每个词的时间。

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
  括号数字不据此拦截。规则不自动改写原卷内容。

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
