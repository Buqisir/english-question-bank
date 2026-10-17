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
  不批量读别的卷的状态，读慢了不重试；查重读
  `GET /api/import-agent-reviews/revisions/<id>/files?path=universal-source-manifest.json`。
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

## 为什么更快

- **Candidate 推导不再重放全卷 OCR 页图**：`nck1OcrSourceEvidence.mjs` 的页面光栅化按内容
  缓存，`stable.mjs` 在 Node 下用原生 sha256；`verify` 37 s → 3 s，Candidate 摘要不变。
- **进程级并行**：Chromium 池在单进程内串行，所以三版分页和四款冻结各开独立进程
  （`freeze-products.mjs --parallel`，每个子进程自验输入摘要）；合并后的分页计划与串行逐字节相同。
- **4 轮子 Agent 并成 2 轮**：拼写审查、答案抄录、小标题和水印由校对 worker 顺带记录，
  `text-review-parts.mjs auto` 复刻服务端标点规范化后生成审查报告（温州二模 340 条 0 差异）。
- **ASR 一开始就跑**：绑定不可变的 `source/listening-audio.*`，不等 Materialization。

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
- 题目卷节标题会孤悬页底（`print-renderer.mjs` 的 `.section-header` 没有 `break-after: avoid`）；
  杭州、温州、湖丽衢、金华都有。属于共享渲染器改动，修后要重排已送审的卷。
- 源参考的范文标题按正文段输出，没有标成 `title`。
