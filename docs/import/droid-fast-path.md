# Droid 快速导题操作卡（扫描版 PDF + 听力）

本卡是 `agent-contract.md` 的执行顺序摘要，不替代合同。所有 CLI 门禁保留；省掉的是
重复计算、串行等待和多余的子 Agent 轮次。编排脚本是
`scripts/import-pipeline/fast-import.mjs`，状态在 `imports/ocr-proofread/<id>/fast/state.json`，
每条 CLI 的完整输出在 `fast/logs/<步骤>.log`，耗时在 `fast/timeline.txt`。

Review 目标由 worktree 的 `.amp/import-review-origin` 决定：回环地址走本地 Review（脚本按需
重启它）；其他地址就是那个 Review，用 import_agent 账号登录（见下文“送生产”）。

实测：温州二模首跑（逐条手动）1 小时 52 分；杭州二模用本卡流程 40.5 分钟到本地
`awaiting_review`，其中机器步骤合计 198 秒，其余是两轮子 Agent 和途中修工具。

## 前置

- Node 24：每条命令前缀 `PATH="/opt/homebrew/opt/node@24/bin:$PATH"`。
- 听力 ASR venv：`~/.local/share/eqbank-listening-asr`（faster-whisper 1.2.1），模型
  `Systran/faster-whisper-small.en@d1d751a5…` 已在 HF 缓存。可用 `EQB_ASR_VENV`、`EQB_ASR_MODEL` 覆盖。
- `tesseract`（chi_sim+eng）、`magick`、`pdftoppm`、`pdftotext`、`ffmpeg`。
- 页面重放缓存：`EQB_OCR_RASTER_CACHE_DIR`（编排脚本默认 `~/.cache/eqbank/ocr-raster-v1`），
  键含 PDF sha256、页码、144 DPI 和 pdftoppm/magick 版本，可随时删除。

## 流程（主 Agent 共 6 次命令 + 2 轮并行子 Agent）

| # | 命令 / 动作 | 内容 | 杭州二模实测 |
| --- | --- | --- | --- |
| 1 | `fast-import.mjs prep <id> --audio <mp3> --proofreaders N -- <init 参数>` | init；并行 OCR evidence、（本地目标时）重启本地 Review、stage 音频；后台开/关 VAD 两遍整文件 ASR；生成 worksheets；按字数分页并打印第一轮提示词 | 34 s |
| 2 | 第一轮：N 个校对 worker 并行 | 每人 1–3 页 `drafts/`，规则 `ocr-proofread-rules.md`；同时顺带记录 `source-flags/<首页>.json`（原卷语法错、答案、小标题、水印） | 约 3 分 |
| 3 | `fast-import.mjs after-proofread <id>` | compile → push/proofread/pull OCR → materialize →（issues 停下）→ presentation → 图宽还原 → 小标题与水印 → 拼写审查自动生成并 finalize → verify → 答案核对 → build → 摘要/metadata/听力审查请求 → 等 ASR；打印第二轮提示词 | 约 1.5 分 |
| 4 | 第二轮：6 个 worker 并行 | 摘要 3 片、metadata 1 份、听力 2 半 | 约 4 分 |
| 5 | `fast-import.mjs finish <id>` | 装摘要/metadata/听力审查 → OCR 更正报告 → 后台三版分页（三个进程）同时建写作源参考 → 合并分页计划 → 四款并行冻结 → 缩略总览与 pdftotext | 约 4 分（分页 168 s） |
| 6 | 主 Agent 目检 PDF | 四款缩略总览逐页、写作源参考分段 | 约 2 分 |
| 7 | `fast-import.mjs submit <id> [--resolves <ids>]` | push Candidate → 登录 Review 截 Screen | 约 1 分 |
| 8 | 主 Agent 抽查 Screen 截图后 `fast-import.mjs report <id> --screen "…" --pdf "…"` | 写 evidence v4 与 `校正报告与预处理完成表.md` | 数秒 |

脚本遇到需要判断的情况以退出码 2 停下并说明（Materialization issues、答案不一致等），
处理后加 `--issues-resolved` 重跑同一命令；已完成步骤自动跳过。

## 送生产

- 绑定写 `https://eqbank.cc`；账号 `droid-import`（import_agent，member），密码只在钥匙串
  服务 `eqbank-import-agent`，`review.mjs` 登录后用会话 Cookie。可用
  `QUESTION_BANK_IMPORT_OPS_AGENT_USERNAME` 换账号。上传 Candidate 只针对 Owner 当前批次授权里的卷；
  发布始终由 Owner 在网页操作。
- OCR 确认绑定服务端 revision，本地确认过的卷换到生产要从 OCR 确认起重做（没有 fast 状态的旧卷
  直接整卷重导）。
- 生产是 2 GB 内存的单进程服务；`GET /api/import-agent-reviews/papers/<id>` 每次都在请求线程上
  哈希该修订全部文件并做投影。连续请求大卷会把进程挤进 swap，整站 API 卡住几分钟
  （2026-10-17 实测约 30 分钟）。因此：prep 可多卷同时跑；after-proofread、submit、report 一次只跑一卷；
  不批量读别的卷的状态，读慢了不重试。
- 卷列表 `GET /api/import-agent-reviews`（以及 Owner 的 `/api/import-reviews`）对每套 Candidate 卷
  同步重算一次 renderer 源码树哈希（生产未设 `QUESTION_BANK_BUILD_ID`），2026-10-17 实测超过 15 秒
  不返回。批量编排不调用它；卷不存在时 `papers/<id>` 只查一张表并返回 404，可以当作轻量的卷号探测。
- Node 24 自带的 OpenSSL 默认发后量子混合密钥交换，本机代理会重置大部分这类握手；`review.mjs`
  已限定经典曲线，截图用的 Chromium 也关掉了同一特性。

### 辅助命令

- `fast-import.mjs status <id>`：各步骤耗时与后台任务。
- `fast-import.mjs asr-extra <id> --start <s> --end <s> --tag <名>`：错开窗口边界重转一段
  （开/关 VAD 各一遍），证据写成 `listening-review-evidence/{vad,novad}-<名>-window-NNN.json`。
  听力 worker 报 `review_required` 且原因是首遍起点漂移时用它，然后 resume 那个 worker。
- `--redo-from <步骤>`：忘掉该步骤及之后所有步骤，并把对应已装 sidecar 和 `products/` 挪进
  `superseded/`。上游改了 Materialization 后从 `figure-sizes` 或更早重做；第二轮作者稿按 ID
  复用，不需要重派 worker。

## 批量编排（batch-run.mjs）

在已授权的导题 worktree 内使用 Node 24：

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
node scripts/import-pipeline/batch-run.mjs intake --batch 浙江十月 --keys '["浙江模拟题/目录名一","浙江模拟题/目录名二"]'
node scripts/import-pipeline/batch-run.mjs run --batch 浙江十月 --dry-run --submit
node scripts/import-pipeline/batch-run.mjs run --batch 浙江十月 --parallel 3 --max-agents 8
node scripts/import-pipeline/batch-run.mjs run --batch 浙江十月 --submit
node scripts/import-pipeline/batch-run.mjs status --batch 浙江十月
```

`--keys` 接受 inventory 的显式 key 或 `prov/paper`，支持 JSON 字符串数组、逗号或换行分隔。
intake 优先选 10 页题卷、原速音频，自己渲染首页；Luna 提取卷名、考试年月、slug。
不明确项写入 `needsReview`，临时卷号用 `paper-mock-pending-*`，不会进入导入。
确认后可修改尚未开跑的 queue JSON（改卷号时同时改文件名）；已开跑队列禁止静默改源。

模型分工：Sol / medium 做逐页校对、摘要、听力、PDF 与 Screen 初筛，以及 `after-proofread`
退出码 2 的本卷修复（每个停点修一次，最多 3 个停点；代码缺陷只报 `needs_code_fix`，不在批次里
改共享代码）；Luna / medium 做 intake 和 metadata。Astra / high 是省着用的高档模型，只在
Sol 修过的同一停点再次停下时复修一次，每卷至多一次，再停即 blocked。
模型可用 `EQB_BATCH_SOL`、`EQB_BATCH_LUNA`、`EQB_BATCH_ASTRA` 覆盖；
另有 `EQB_BATCH_DROID`、`EQB_BATCH_INVENTORY`、`EQB_BATCH_SOURCE_ROOT`。
两轮按 `fast/round1.json`、`fast/round2.json` 的期望产出派发；每个 worker 最长 25 分钟，
失败重试一次，产出 JSON 与哈希收据齐全才记完成。修复员不重试。
子 Agent 没有执行工具，校对员交稿后由编排器跑 `ocr-proofread.mjs compile --pages`
（只检查不写），不通过就带着报错返工一次，仍不通过则该卷 blocked。

`--parallel` 限制同时处理的卷数，`--max-agents` 限制本次运行中所有 Agent 的总并发。
同 worktree 只允许一个 run；修复期间其他卷照常运行。修复员结束后比较 `git status --porcelain`
和文件哈希（包含已有脏文件，排除其他卷目录与 `imports/batch/`），越界保留现场并暂停整批，绝不自动回滚。
`after-proofread` 只有 OCR 上传/确认步骤开始后未完成才算生产结果未知（暂停整批）；
其前后的本地步骤失败只阻塞本卷。
修复只能落在本卷 OCR 工作目录和 papers 数据目录，每处写入 `materialization-edits.json`；
不能改代码、源文件、生产收据或 fast 状态。源卷印刷错报 `needs_owner`，代码缺陷报
`needs_code_fix`，剩余判断和 PDF/Screen 硬约束问题报 `needs_main_review`。

生产护栏：

- `after-proofread`、`submit`、`report` 共用 `imports/batch/production.lock`，带 PID、
  活跃阶段与死锁检测，相邻步骤至少隔 30 秒。首次 OCR 上传前也做查重。
- 查重只对照本地：`imports/batch/submitted.json`（每卷在首次 OCR 上传前记 `ocr`，送审时记
  `submitting`）和手工维护的生产快照 `imports/batch/production-sources.json`（绑定 origin，
  `papers.<paperId>` 写 `paperName` 与源 `sha256`；编排器只读不刷新）。intake 不联网，按归一化卷名
  和卷号预先标出待核对项；没有快照时只覆盖本地 ledger，卷单需 Owner 确认后才 `--submit`。
- 首次 OCR 上传前探测一次 `papers/<id>`：只有返回 `IMPORT_REVIEW_NOT_FOUND` 才放行；卷已存在就
  blocked，因为 OCR 上传会给已有卷追加 revision。卷存在时不读响应体。fast-import 既有单卷调用
  仍由生产锁串行包住。
- 同 paperId、任意同源 sha256 都会拒绝；归一化卷名相同（可能是早先 DOCX 导入的同场考试）报
  `needs_owner`。唯一正常过渡是本卷自己 ledger 里的 `ocr` 记录 → 首次 Candidate；不允许批量重送。
- 送审前后检查 `/api/health`。超过 5 秒，或相对本批基线超过 3 倍且超过 2 秒，
  暂停整批且不重试。生产请求超时也暂停；结果未知、死进程活跃锁均保留证据，人工
  只读核对后才能恢复，禁止清掉记录直接重放。
- 脚本只调白名单 fast 阶段。子 Agent 只开放 Read/Grep/Glob/LS/ApplyPatch，
  禁用执行命令与联网工具；所有提示词禁止联网、发布、Git 提交与越界写入。

finish 后以 `pdfinfo`、`pdftotext`、`pdffonts` 校验页数、空白页、字体嵌入、题号顺序和
答案号覆盖，再渲染全部页面为 50 dpi 图片交 Sol 初筛。无听力产品按分页计划校验
21 起的原题号；省纸固定 8 页。听力原文疑似 OCR 折行只记 warning。低分辨率初筛
不等于逐字或直接听审认证；硬约束拿不准时升级，不把版式偏好当阻塞。

不加 `--submit` 停在 `ready_to_submit`，**但 after-proofread 仍会访问生产 Review**。
只有 `run --dry-run` 完全不启动 Agent、不访问 Review、不写状态。加 `--submit` 后
Sol 必须看实际 Screen 图，并引用 PDF 检查结果生成如实说明，才能调用 report。
主 Agent 读 `imports/batch/<名>/status.json` 和 `escalations.md`；完整日志、提示词、
图片与检查 JSON 都在 `logs/`。正常中断重跑同一 run 即续跑，已完成 worker 复用哈希
收据；blocked 与批次 paused 不自动清除。人工处理后用 `run --retry <paperId,…>` 重排 blocked 卷，
只读核对生产结果后用 `run --clear-pause` 解除暂停（释放无活进程的生产锁、清 pending 标记，
原记录留在 history）。不能删除提交 ledger 来“重试”。退出码 0 表示本轮正常结束，2 表示有阻塞卷，3 表示整批暂停。

## 为什么更快

- **Candidate 推导不再重放全卷 OCR 页图**：`nck1OcrSourceEvidence.mjs` 的页面光栅化按内容
  缓存，`stable.mjs` 在 Node 下用原生 sha256；`verify` 37 s → 3 s，Candidate 摘要不变。
- **进程级并行**：Chromium 池在单进程内串行，所以三版分页和四款冻结各开独立进程
  （`freeze-products.mjs --parallel`，每个子进程自验输入摘要）；合并后的分页计划与串行逐字节相同。
- **4 轮子 Agent 并成 2 轮**：拼写审查、答案抄录、小标题和水印由校对 worker 顺带记录，
  `text-review-parts.mjs auto` 复刻服务端标点规范化后生成审查报告（温州二模 340 条 0 差异）。
- **ASR 一开始就跑**：绑定不可变的 `source/listening-audio.*`，不等 Materialization。

## PDF 目检口径

格式标准（`docs/product/exam-paper-format-standards.md` §3b 与整卷重排）的精神是规范内的 friendly：
硬约束很少，其余是可退让的偏好。目检先查硬约束，偏好只在明显难看时提，不当缺陷报。

- **硬约束**：页数（省纸恰好 8、大字不超上限）；不缩字、不删改、不裁图；单道小题、挖空横线、
  写作作答框不拆；七选五选项库不跨页；无溢出、叠字；OCR 物理折行已合并。
- **偏好**：题组完整、少翻面、标题随后文（部/节标题留页尾明确允许）、篇章不跨页；作答框优先
  65/57 mm，压缩后尽量恢复（下限应用文 24 mm、续写 24/27 mm）。

## 已踩过的坑

- **分页必须在摘要、metadata、听力审查装好之后。** Candidate 要求这些 sidecar；源参考
  可以和分页同时建，合并时用 `candidateDigest` 拒绝过期报告。
- **OCR producer 把所有图都设成 `widthRatio: 1`。** 杭州二模阅读 C 的流程图原卷只占正文宽 36%，
  按 1 渲染多出一页，三版分页全部失败。`figure-sizes` 按“裁图宽 ÷ 该页正文宽”还原并记入
  `materialization-edits.json`。
- **答案卷写作范文可能只有裸标题。** “第四部分 写作”下只有“第一节（满分15分）”“第二节（满分25分）”、
  没有 Possible Version 时，producer 报 `NCK1_ANSWER_WRITING_SAMPLE_BOUNDARY_AMBIGUOUS`：
  主 Agent 按原页顺序从已确认 OCR 文本填两篇 `officialModelAnswer` 并记录；`references`
  已识别这种裸标题。
- **source-flags 只记文字 item。** 整图保留的流程图里的文字不审校（grammar 片段也只能是英文词和空格）。
- **先改 Materialization，再做拼写审查。** 拼写审查绑定 `materializationSha256`；之后的改动
  要用 `--redo-from` 重绑。
- **CLI 输出拒绝覆盖。** 重做时旧文件挪到 `imports/ocr-proofread/<id>/superseded/`，不删除。
- **ASR 窗口时间是相对时间**，要加窗口的 `startSeconds`；窗口重叠只有 5 秒，跨边界的首遍
  容易漂移，用 `asr-extra` 错开边界。
- **OCR 更正报告只收能精确定位的条目**；其余列为 skipped，已体现在确认文本里。
- **写作源参考**：小写字母开头的行接续上一句，即使上一行提前折行；跨页仍拆成两个带定位的段。
  “One possible version”“Possible version:”是范文标签；“评分原则：”“【评分说明】”“【各档次的给分…】”
  单独捕获为评分（不印）；【审题重点】这类讲解和范文后中文起首的行跳过到下一标签或英文行，并写进
  `review`。finish 末尾的分段总览要看一眼：范文里不该有中文段，评分不该混进范文。
- **改了 producer 要用 `--redo-from materialize`。** producer 缓存按输入摘要命中、不看代码，
  redo 会把产物、receipt、review 和媒体挪开；之前手工补过的 Materialization 改动要重新补。
- **作答框最小高度可能放不下源给的开头。** 五档规划都失败时，规划器按实测最小可渲染高度二分重试
  （湖丽衢：大字版应用文 40 mm、经济版 35 mm），并在汇报里写明框高。
- **七选五空可能占小标题位。** worker 会把它记成 `__39__`，小标题匹配按同样写法渲染空。
- **生产 Screen 字体加载慢。** `submit` 截图等到字体就绪且正文出现后再截；只重拍截图时删掉
  `state.json` 里的 `screen` 步骤再跑 `submit`，`push` 已完成不会重推。
- **后台跑 finish/submit 要用真正脱离会话的方式**（Droid 用 fireAndForget）；`nohup … &` 随调用
  shell 退出会被一起结束，时间线里没有新步骤、日志为空。

## 已知未修（另立任务）

- OCR producer 默认图宽应在 producer 内按源几何计算（目前由 `figure-sizes` 补）。
- producer 的范文边界解析不认无标记的裸节标题（目前由主 Agent 处理 issue）。
- 续写材料的故事标题按正文段渲染；纯答案版听力原文保留原 PDF 行内换行；
  producer 的续写 `officialModelAnswer` 遇到“考场作文”时取错（四款产品读源参考，不受影响）。
- OCR 听力原文按物理行拼接，句中断行进入 Canonical（违反格式标准“先合并 OCR 物理折行”）；
  只应在说话人标签前保留换行。修在 OCR 进入 producer 之前，不改 DOCX 路径。
- 源参考的范文标题按正文段输出，没有标成 `title`。
- 部/节标题留在页尾是格式标准明确允许的（Owner 2026-09-21），不算缺陷。
