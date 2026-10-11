# 真题导入管线 / Paper import pipeline

确定性切卷 + AI 解析 + 原子发布的离线工具。**离线、不在产品运行路径上**(手动跑来把真题导进库),所以它的 bug = 一次坏导入(被发布期校验 + QA 拦住),不是用户运行时 bug。

> 来历:本管线先在 `.scratch/import-pilot/`(gitignored)成型,#188 用它导了 12 套新课标真题、#190 用 `topic-driver` 点亮主题维度。本目录是从那个沼泽里**挑出的耐用子集,原样固化**(唯一改动:`gen-configs.mjs` 的 papers 路径从 cwd 字面量改成 import.meta 相对)。**`lib.mjs` 的格式启发式只在 2 种新课标格式上验证过**——导新格式的卷时按需硬化,别当它已通用。

## Agent 执行入口

任何 agent 要导一套新卷,先读 `docs/import/agent-contract.md`（唯一进场）。
项目级 `importing-nck1-papers` skill 会自动匹配导题、继续某卷、审核返工、状态查询
和认可后的上线准备。新卷只由 Owner 在 Amp 明确发起，使用专用 Import Project 的
本地源文件入口；Owner给源材料与考试年月，Agent读取题卷正式题头并处理其余字段。
专用环境使用 `.agents/import-pre-setup` 选择 `.agents/setup --import`，不初始化开发库、
CI用户、服务或ASR模型。代码和skill须到达默认分支才作用于后续项目Orb。
已有卷或历史 source-intake handoff 后运行：

```bash
node scripts/import-pipeline/review.mjs preflight <paperId>
```

远端修订恢复复用已完成的 Candidate，不重新 OCR 或重新生成源材料：

```bash
node scripts/import-pipeline/review.mjs hydrate <paperId>
node scripts/import-pipeline/review.mjs hydrate <paperId> --revision <exact-revision-id>
```

不指定 `--revision` 时恢复当前最新 finalized Candidate；显式指定时只恢复该卷的
那一版，未知、未完成或 OCR-stage revision 都失败，不回退到最新版本。文件逐一核对
大小和 SHA，并重建 projection 校验身份；已有本地工作目录不会覆盖。
有 OCR correction report 的 Candidate 同时取回它绑定的历史校对回执（即使该 OCR
revision 已被后续版本取代），不新造确认、不移交旧 source-intake lease。
本地 `signals/review-restore.json` 记录来源站点、revision 和 bundle。后续 `push`
以恢复的 revision 为基线；创建和 finalize 都拒绝过期基线，不自动追认较新的版本。
恢复旧版不授权覆盖较新的远端修订，也不证明备份完成或允许清理原本地副本。

产品页的 Amp 讨论线程由执行者明确关联，Owner 不需要管理绑定表：

```bash
node scripts/import-pipeline/review.mjs link-thread <paperId> --thread <T-uuid>
node scripts/import-pipeline/review.mjs link-thread <paperId> --thread <new-T-uuid> --from <old-T-uuid>
```

创建后用第一条命令明确关联；`push` 不从 `AMP_THREAD_ID` 或审计头推断绑定。
换负责人线程时必须传准确旧值，冲突停止；后续上传也不会覆盖它。
同目标关联可幂等返回；关联不属于内容 bundle，不改变产品或授予审批/发布权限。
网页只复制卷名、稳定 ID、正在看的版本及链接，再打开对应线程，用户自行粘贴聊天。
没有绑定则只复制，不猜线程；复制失败显示手动复制文本，弹窗被拦截显示明确链接。
交付既有批次前须逐卷核实真实关联，不能把临时预览线程或发布审计线程当作负责人。

本地清理盘点（只读，不删除）：

```bash
node scripts/import-pipeline/review.mjs cleanup-plan <paperId> --revision <exact-revision-id>
```

仅检查该卷标准工作目录，对照精确 finalized Candidate manifest 逐文件核对。
Git 跟踪文件、本地改动、manifest 外文件、符号链接和特殊文件均标记保留；不扫描
Downloads、不跟随目录链接。输出逻辑大小、分配大小和硬链接数，`reclaimableBytes`
为未知，不能当作释放空间估算。当前始终 `eligibleForDeletion: false`：远端文件与
产品可读、独立备份恢复、任务归属和停点、限定删除授权仍须另行证明。
此命令不会为你删除文件，也不会补造备份或审批证据。

以下台账命令仅用于 Owner 明确要求继续的历史 submission，不是新卷默认入口。
通过私有队列取得同一份 immutable submission；不要从 webhook 文本或网页字段重建文件：

```bash
QUESTION_BANK_IMPORT_OPS_ORIGIN='<private origin>' \
QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN='<secret>' \
  node scripts/import-pipeline/source-intake.mjs list
node scripts/import-pipeline/source-intake.mjs claim <submissionId>
node scripts/import-pipeline/source-intake.mjs download <submissionId>
node scripts/import-pipeline/source-intake.mjs init <submissionId> --paper-id <paperId>
node scripts/import-pipeline/source-intake.mjs handoff <submissionId> --paper-id <paperId>
```

历史 submission 恢复使用两个有界入口：

```bash
node scripts/import-pipeline/source-intake.mjs status <submissionId>
node scripts/import-pipeline/source-intake.mjs continue <submissionId>
```

按返回的 `nextCommand` 执行；`--paper-id` 可选，不是 claim 前置条件。
新 raw-source 默认使用 `paper-<submission UUID>`；新 analyzed package 从下载 ZIP 的
`package.json.paperId` 取身份；补听力/修订使用不可变 `targetPaperId`，冲突即停止。
初始化核验后按返回的 `handoffCommand` 显式交接，**先 handoff，再生成摘要/metadata、
Review push 或等待审核**。handoff 结束 lease，不代表 OCR/source review 或发布获准。
成功交接保留本地完成收据，后续 status/continue 转向 Review preflight，不再重领。

`status` 只读远端队列/当前 lease，并重验本地摘要收据，不 heartbeat、不下载、不写文件。
`continue` 用 submission 和 paper 两级排他锁串行 claim → download → init → raw-source
materialize/preflight，stdout 始终只有一份机器可读 JSON；子进程诊断进入 stderr。每个远端或
昂贵步骤开始前写 mode-0600 原子进度记录；若没有完成收据，恢复返回 `*_outcome_unknown`
而不自动重放。它不 handoff、不 needs-owner、不派解析、不自动断言听力/OCR 审查通过。
`analyzed_package` 在确定性 init 后即 `source_ready`，不进入 OCR/materialize/model fallback。
初始化与材料化期间每 30 秒串行续租，单次请求最多等待 15 秒；失败会终止步骤进程组，
记录 unknown 并停止。中断遗留锁须先确认原进程已结束再人工处理，禁止删除活跃锁。
源/音频检查前及持有 lease 期间至少每 10 分钟执行 `lease.renewalCommand`；过期只报告
阻断，不自动重领。听力 init 后尚无 finalized receipt 时返回带命令与路径的 `tasks`，
不以进度记录代替音频证据；
协调线程须核对源绑定，按待办运行材料化与内容 review，再显式 finalize。
当前 public-paper OCR 走真实 Agent `proofread-ocr` 与不可变receipt；不冒充Owner，
不伪造确认。源文本用Candidate-bound v3记录明确纠错，原始OCR与Source bytes保留。
Owner在Amp看校正说明与最终Screen／四PDF，不另设OCR清单或报告门户。

新协调与 public-paper-v1 摘要/检索生成统一使用内置 `low` 和 `features: []`，
模型与推理档位跟随 Amp 的 Low 配置，不在仓库固定。模式不可用则停止，不自动切换模式。
下文 Low + fast 仅描述保留的旧解析路径，不适用于新公共卷。

自动接卷已退休；只接受 Owner 在 Amp 明确发起导题，按 `docs/import/agent-contract.md`
的本地文件入口执行。`source-intake-dispatch.mjs` 仅保留原 controller 的只读 status，
不再创建、绑定或派单。预览确认不等于上线，单卷 promotion 仍需后来明确授权。
私有 journal 位于 `.scratch/source-intake-dispatch`，禁止输出、复制或删除以重试。
本地代码停用不等于远端 webhook 已注销；须独立核实 live handler 与生产通知配置。

新 raw-source 初始化会明确写入 `public-paper-v1`。材料化与源审查完成后不派发九份教学
分析，而是运行：

```bash
node scripts/import-pipeline/review.mjs prepare-summaries <paperId> --output /abs/summary-request.json
node scripts/import-pipeline/review.mjs verify-summaries <paperId>
node scripts/import-pipeline/review.mjs prepare-search-metadata <paperId> --output /abs/metadata-request.json
node scripts/import-pipeline/review.mjs finalize-search-metadata <paperId> --input /abs/authored-metadata.json
node scripts/import-pipeline/review.mjs verify-search-metadata <paperId>
```

prepare 命令不依赖尚不存在的 summary sidecar，也不递归调用完整 Review projection；请求
包含精确 IDs/digests、schema、prompt、每个目标的完整 group/source-answer context。
需要模型时只把此请求交给内置 `low`（`features: []`），不自动调用、不生成教学 prose。
摘要输出保存为 paper 根目录 `paragraph-summaries-v1.json` 后验证。metadata prepare 同样可在
sidecar 不存在时运行；只把该显式请求交给内置 `low`（`features: []`），再由 finalize
确定性补全/写入 `public-search-metadata-v1.json`，最后 verify。`verify-analyses` 对该 profile
显式失败并指向 `verify-summaries`。历史 absent-profile、listening supplement hydration 与
external analyzed_package 原合同不变，不得为恢复方便改 profile 或 approval identity。

`claim` 写入 mode 0600 的 gitignored lease receipt；`download` 再核对响应 digest、
字节长度、snapshot SHA-256 及 manifest/snapshot 完整文件集合。长任务用
`heartbeat <submissionId>` 延长有限 lease。
文件不完整或语义不清时改用
`needs-owner <submissionId> --code <reason> --message '<需要 Owner 判断的事实>'`，
不得生成答案或绕过来源缺口。`init` 只显式调用既有 universal NCK1 初始化；
它会在 gitignored `signals/` 写入绑定 submission digest 的本地初始化收据。
`handoff` 会再次核对该收据、源文件与本地 workspace，并拒绝已被 Import Review
使用的 `paperId`；它仍不认可、不 publish、不 ship。

该只读命令把 Orb 内 Source / Materialization / 收据与 Review API 当前 revision 合成
`materializing`、`awaiting_review`、`changes_requested`、`approved`、
`locally_published`、`ready_to_ship`、`shipped` 或 `failed`，并给出可审计的
`next.action`。Agent 据此恢复；Owner 无需记下面的机械命令。

新卷默认使用 `universal-nck1.mjs`,不再选择格式①/②/③；下列旧 stages
只用于已登记存量卷复现。

```bash
node scripts/import-pipeline/universal-nck1.mjs preflight
node scripts/import-pipeline/universal-nck1.mjs init <paperId> \
  --paper-name '<题卷正式题头>' --provenance '<源出处>' \
  --year <Owner给定年份> --month <Owner给定月份> \
  --source question_source=/abs/questions.pdf \
  --source official_answers=/abs/answers.docx
node scripts/import-pipeline/universal-nck1.mjs materialize <paperId>
node scripts/import-pipeline/universal-nck1.mjs verify <paperId>
node scripts/import-pipeline/universal-nck1.mjs build <paperId>
node scripts/import-pipeline/review.mjs verify-summaries <paperId>
node scripts/import-pipeline/review.mjs verify-search-metadata <paperId>
QUESTION_BANK_IMPORT_OPS_ORIGIN=https://eqbank.cc \
QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN='<secret>' \
  node scripts/import-pipeline/review.mjs push <paperId>
```

题卷与答案在同一份DOCX/PDF时只登记一个
`--source question_and_answers=/abs/paper-with-answers.pdf`。只有完整题卷后恰好一个明确
答案heading才拆分；无/双heading或位置不明返回
`NCK1_COMBINED_SOURCE_BOUNDARY_AMBIGUOUS`。纯答案键与带逐题详解/写作范文的答案源都只
生成同一套完整21–65答案值。写作源范文与评分参考另外捕获到绑定来源的
`source-references-v1.json`；纯答案版使用源参考，不使用AI范文或逐题详解。
原source bytes/digest仍保留。只有ABCD而缺56–65答案仍失败关闭。

### 新卷四产品与音频准备

按[四产品合同](../../docs/product/paper-pdf-products-v1.md)准备
`largeComplete`／`largeNoListening`／`economy8`／`answerOnly`，不再选择学生／教师版。
源名与Owner年月分别封存；不从学年、导入日期或文件名猜月份，不虚构具体日。
新音频用 `stage-listening-audio <paperId> --audio <original.mp3> --signal-only`，
信号分段保留 `contentValidation: not_performed`，不能冒称内容或ASR通过。
最终normalized playback预计算50ms RMS波形并绑定SHA，Screen复用、PDF不打印；
已有合法波形不重算，历史缺失仍可播放。规则见导题合同的音频波形预处理节。

源审查、摘要、metadata、源参考、波形与分页稳定后，Review push前运行：

```bash
node scripts/import-pipeline/freeze-products.mjs --paper-dir <workspace>
```

四PDF与`products/manifest-v1.json`冻结进精确Review清单，不覆盖已有products目录。
原卷预览／下载读取已审固定版本，不在下载时重排；返修另建工作副本、新revision和
授权发布版本，保留旧链接与字节。私有存储配置、生产部署及卷子发布仍需相应授权；
本地接线不是上线证明。正式验收按AGENTS的Ship节奏执行，不跳过单卷输入门禁。

### 阅读解析的精确位置准备

以下本节仅适用于历史 absent-profile / external `analyzed_package` 的既有分析合同；
`public-paper-v1` 不进入该路径。Owner 选择 B：专用 `english-question-bank-import` 项目内 Low + fast 直接生成，
不调用顾问；协调者保留原卷/lease，逐组取回并正式校验。项目规格保持 Medium。
完整派工、文件传递与失败停止规则见 `docs/import/agent-contract.md` 的 B 路径。

`.agents/setup` 的 `npm ci --prefix server` 安装锁文件中的 Ajv，不需要 Python
jsonschema。生成前必须实际检查 Node 24 / Ajv；完整 setup 失败造成缺失时，先在
环境准备阶段运行 `bash .agents/setup --analysis-only`，不安装 Desktop/OCR/ASR，
不初始化数据库。它不是完整导题或渲染环境的通过证明。
所有题型的单组输出使用同一条命令（只读，失败返回非零，不修复坐标）：

```bash
node scripts/import-pipeline/validate-analysis.mjs request.json analysis-reading-b.json
```

替换输出文件名即可；`request.json` 是生成时保留的单组请求，`group` 与
`sourceGroup.groupKey` 必须一致。协调者准备请求，不让 worker 根据结果重造源材料：

| group | sourceGroup.material | authoritativeAnswers |
| --- | --- | --- |
| `reading-a`–`reading-d`、`seven`、`cloze`、`grammar` | `{paper, group}`：paper 包含 paperId/sourceAssetVersion；group 使用现有分析器输入（groupId、paragraphs、questions，及该题型的 optionBank/blankId/prompt 等） | 以 questionId 为键、值为 `{questionId, answer}` 的完整本组答案表 |
| `application`、`continuation` | `{paper, group, writingTask}`：writingTask 使用 PaperAsset Writing Task 形状，保留 groupId/taskType/instruction、wordCountTarget、materialText/continuationStarters/applicationGiven 等来源字段 | `{officialModelAnswer: 原文字符串或null}`；必须与 writingTask 中的来源范文一致，无官方范文明确为 null |
| `listening-unit` | 直接使用 `buildListeningAnalysisAgentRequest` 生成的 material（paperId/sourceAssetVersion/materials），不得传全卷 | 同一 builder 生成的 `{questionId: officialAnswer}` |

复用既有 schema、教学内容与题型语义校验，以及全卷路径的题号/答案/版本闭合检查。
语法填空在内存副本上派生确定字段后校验，不改原文件。应用文还调用既有题目格式/字数
校验，续写检查原文和段首证据；听力检查材料、题号、官方答案和精确引文，软提醒原样输出。
退出码：0 通过，1 数据或校验失败，2 命令参数错误。
单组通过不替代 `review.mjs verify-analyses <paperId>`、听力音频审核或教师内容审核。

未接纳的阅读 AI 输出可先显式计算精确位置，再通过原 validator：

```bash
node scripts/import-pipeline/derive-reading-ranges.mjs \
  request.json raw-analysis-reading-b.json derived-analysis-reading-b.json
```

阅读修复只接受 `group: reading-a` 至 `reading-d`。只能使用已核对源材料的请求，
不得为适配模型结果改写源文或答案。保留 raw 文件，输出必须是一个不存在的新文件。
这不是 Review 上传、认可或发布命令，也不修改原卷 workspace 或在线状态。

程序只改 `start/end`：译文段落相对整篇 `fullTranslationZh`，标注相对指定段落，
下划线相对 `displayText`，全部按 Unicode code point 计数。有效的重复片段位置保留；
其他位置必须由唯一精确引文定位，找不到、引用了错误段落或重复不明均拒绝。
不补写文字、不修改关联、不选取第一个重复匹配。只有原 JSON Schema、阅读语义、
答案和 teachingContent 校验全部通过才写出文件。人工仍须检查教学内容；程序通过
不是 Owner Review 认可。此步骤只支持阅读，不扩展到填空或写作。

完形/语法填空的本地小验收另有显式准备入口（未切换默认生成流程）：

```bash
node scripts/import-pipeline/prepare-objective-analysis.mjs request.json draft.json prepared.json
```

准备稿附加合同见 `prompts/objective-analysis-preparation-v1.md`：模型保留答案、
解释、译文、精确引文和语义关联，可省略数字坐标、completedSourceTexts.text 和
精选句 displayText；下划线可提供唯一精确的 underlineTexts。程序复用权威答案
补全函数生成文本，按 blankId/questionId 识别真实插入位置，按指定段落精确定位。
它不会修复误译、换段寻找引文、改写引文或解释，也不会猜中英对应关系。
重复且未明确定位的引文、错误关联和原 validator 拒绝的内容一律失败。
只有原单组正式校验通过后才以排他创建写出新文件，不覆盖原稿或已有结果；
完整 Review/发布合同不变。测试：`node scripts/verify-objective-preparation.mjs`。

### 自动拆题与 Agent 备用路径

统一的是 Source Materialization 和后续校验，不是要求所有源版式都由脚本自动理解。
DOCX 优先读原始段落、表格和编号下划线样式；文本 PDF 优先读文字层和 bbox。
明确连续的横排选项、答案行按源坐标读取，不当作文章多栏；只有页底且页码/总页数
均与原 PDF 一致的 `第 N 页 共 M 页` 才作为页码排除，正文同文不删。
合订题答支持以卷名开头的明确答案标题，但双边界、错序、缺答案仍拒绝。

`needs_agent_review` 是局部源核对入口，不等于需要 Owner 处理普通版式。唯一 writer
读取 producer review 的 `required`，对照对应不可变源页/段落，只修正工作副本
`materialization/nck1-source-materialization-v1.json` 中有证据的结构与问题；保留已正确
题组、权威答案及全部 source locators，再运行 `verify` / `build`。不得只清空 issues
来过闸，不修改 producer receipt、已 finalize 的 Review revision 或原始文件。
同版本 `materialize` 的 `agent_modified` 表示保留该工作副本，不会用机器输出覆盖它。

扫描/图片页或文字层顺序不确定时，使用已有 `stage-ocr` → `confirm-ocr` → `materialize`
路径，由 Agent 确认转写、阅读顺序和正文/装饰分类。初次 PDF 自动材料化失败后，只有
旧输出未被修改、来源摘要一致、failed review 与 receipt 闭合且无媒体时，切换 OCR 才会
先将旧输出、review 和 receipt 按原 bytes 留在 `materialization/producer-history/`，然后
生成 OCR 输出；旧 PDF review/receipt 仍保留。已成功的输出、Agent 改过的输出、来源变化
或证据不完整一律拒绝替换。听力附件和九份教学解析不属于这次切换的写入范围。

源页阅读正文或题干含局部粗体/下划线时，确认文档使用
`schemaVersion: "nck1-ocr-source-confirmation-v2"`，在对应 ordered item 加
`sourceEmphasis: [{start, end, marks: ["bold", "underline"]}]`（按实际可只选一种）。
坐标是该 item 已核对 `text` 的原始 UTF-16 区间，包含题号前缀；不得标到题号或
选项，不得按题意猜标记。CLI 自动把两份 OCR 文件绑定并带入 Candidate/Review，
Materialization 仍只写原文。历史 v1 不增补字段、不迁移。详见试卷格式合同。

暂时只有题卷、没有权威答案时，不运行`init`或分配可发布`paperId`。使用
source-only状态先保留DOCX/PDF或显式排序图片页：

```bash
node scripts/import-pipeline/universal-nck1.mjs capture-source-only <sourceSetId> \
  --paper-name '<卷名>' --provenance '<题卷出处>' \
  --source question_source=/abs/questions.pdf
node scripts/import-pipeline/universal-nck1.mjs source-only-status <sourceSetId>
node scripts/import-pipeline/universal-nck1.mjs list-source-only
```

记录位于gitignored `imports/source-only/`；补答案前Materialization、Candidate、Review和
publication均稳定拒绝。以后找到答案，按status中的exact `questionSetDigest`创建新的正常
complete source set；旧capture与题卷bytes保持不变，独立successor receipt只记录后继：

```bash
node scripts/import-pipeline/universal-nck1.mjs attach-answers \
  <sourceSetId> <newPaperId> \
  --question-set-digest 'sha256:…' --answer-provenance '<答案出处>' \
  --source official_answers=/abs/answers.pdf
```

图片题卷和图片答案分别用重复的
`--source-page question_source:<页码>=/abs/page.png`和
`--source-page official_answers:<页码>=/abs/page.png`，不把整页图当Canonical正文。

`preflight` 一次性启动 magick、ffmpeg、soffice、pdfinfo、pdftoppm、unzip，并在
macOS 检查 magick/ffmpeg 动态链接；失败就开工前停，中途不得安装或升级依赖。
`init` 也先执行同一检查，再复制并摘要绑定本地源，DOCX 同时生成确定性 PDF
rendition；源文件、Materialization 与 canonical evidence 均 gitignored。已知
NCK1 结构的试题 DOCX + 权威答案 DOCX 用 `materialize` 生成逐段 locator、九题组
骨架、答案与结构化复核清单。`public-paper-v1` 必须生产并验证逐正文段落摘要；仅历史
absent-profile / external `analyzed_package` 必须生产 4× reading、seven、cloze、grammar、
application、continuation 共九份教学分析。不确定的
section/题号/blank/答案/表格或视觉语义进入 `review.required` 并失败关闭，AI 禁止
解题补答案。producer receipt 绑定版本和 source digest；未变源直接 resume，检测到
Agent 已编辑输出时绝不覆盖。同一 paperId 仍单 writer；两份写作分析可并行纯读后
由该 writer 汇总。其他载体由 Agent 写统一
Materialization：DOCX 每个源 `<w:p>` 一对一保留为独立 paragraph block，禁止合并
相邻段落；阅读 A/B/C/D 等独立篇目标记不写入正文。表格为网格，图为原媒体
配方。应用文和读后续写按“题干/逐段材料 → 注意与词数、格式 → 框内给定内容”
保留源顺序；续写材料逐段映射，标题、称呼与两条开头语不并入正文。`verify` 会用
不可变 DOCX 源检查 paragraph block 未跨越段落边界，并拒绝写作注意块缺失、词数
冲突、续写材料合段或框内给定内容错位。媒体助手：

```bash
node scripts/import-pipeline/universal-nck1.mjs extract-docx-media \
  <source.docx> <word/media/entry> <output> [--density 300]
node scripts/import-pipeline/universal-nck1.mjs crop-pdf \
  <source.pdf> <page> <x,y,width,height> <output.png> [--density 300]
```

SVG 内容媒体必须用固定 density 转 PNG；DOCX shape 先用 init 生成的 PDF
rendition，再按 `pdf_crop` 路径裁。当前工具只支持确定性媒体；清晰图只裁准/摆准。
低清图的AI辅助候选政策已登记在能力矩阵Ticket 04，但在原图永久保留、source/candidate
digest绑定、禁止去水印及`/ops/`并排+overlay/闪烁人工确认gate实现前，不得用于导入。
`verify` 只派生 Candidate，`build` 只生成
Candidate 摘要和 `confirmed: false` 的 Teacher Confirmation 模板。公共卷在 push 前由
`review.mjs verify-summaries` 校验摘要覆盖与绑定；旧分析合同由 `verify-analyses`
校验九份输入及其确定性五份 Screen sidecar projection。`push` 把不可变源、Candidate
与当前 profile 的摘要或原始 analysis bytes 作为新 revision 上传到
`/ops/`。Owner 在真实
Screen/Print/PDF 上审核；Agent 用自己的 `import_agent` 网页待办箱或下列命令
读取、回复和提交修订：

单卷 Materialization 文件的 changed-file 路由使用
`pnpm -C app verify:import-paper`：它保留 schema/Candidate admission、权威答案与
digest、Screen、Student/Teacher Print、PDF、publication/recovery 的独立失败层，
不再误跑普通 feature pack。共享 producer/Canonical/renderer 或未知、混合变更仍
失败关闭到 `verify:all`。

```bash
node scripts/import-pipeline/review.mjs preflight <paperId>
node scripts/import-pipeline/review.mjs verify-summaries <paperId> # public-paper-v1
# 仅旧分析合同：node scripts/import-pipeline/review.mjs verify-analyses <paperId>
node scripts/import-pipeline/review.mjs status <paperId>
node scripts/import-pipeline/review.mjs reply <paperId> <issueId> --message '<回复>'
node scripts/import-pipeline/review.mjs push <paperId> --resolves <issueId>[,<issueId>]
```

定页 PDF 问题只调整同一 Candidate 的分页方案，不重新生成正文或当前 profile 的摘要／分析。先让既有
24 次上限的规划器渲染真实学生卷，并生成 PDF、逐页 PNG 与 `report.json`：

```bash
node scripts/import-pipeline/review.mjs pagination-qa <paperId> --edition friendly8 --auto
node scripts/import-pipeline/review.mjs pagination-qa <paperId> --edition friendly10 --auto
# Owner 选定长卷后另跑：10／12 为上限，报告保留真实页数，不补页
node scripts/import-pipeline/review.mjs pagination-qa <paperId> --edition long10 --auto
node scripts/import-pipeline/review.mjs pagination-qa <paperId> --edition long12 --auto
```

报告列出可复制的 canonical `slotId`、题组页码、跨正反面／题组选项库拆分警告和建议
break。友好版必须精确达到目标页数；长卷版须在上限内，应用文题面和完整作答框
同页，不压缩作答框或拆开选项库。需要修复时只用参数试一个明确方案；命令会以同一
原子校验器实际渲染一次。确认后才加 `--save-plan` 原子写入可选
`pagination-plan.json`，不允许 CSS、路径或任意几何：

```bash
node scripts/import-pipeline/review.mjs pagination-qa <paperId> --edition friendly10 \
  --break-slots reading.b,reading.d,language.cloze --cover-gaps 54,54 --save-plan
node scripts/import-pipeline/review.mjs push <paperId> --resolves <pdfIssueId>
```

长卷方案保存为绑定当前 Source/Candidate 的 `paper-pagination-plan-v2`，不会将
旧版 `friendly8/10` 迁移或更改语义。自动长卷只尝试批准的六档卷首留白，先用
正常 65／57mm 写作框；如正常页数合格但应用文分离，每档至多加试一次在完整
应用文题组前断页，仍不合格再试下一档（最多 12 次渲染）。全部失败
则保持失败诊断，不能直接将自然 PDF 改名为合格长卷。Screen、自然版和教师版
不受定页方案影响；旧版 v1 四 PDF 交付仍维持原来的精确 8／10 语义。

新自动方案的 8/10 页均保留通用卷首。先比较 72/72、54/72、54/54、18/36、0/18、−25.5/18pt
六档卷首位置的自然分页，再尝试题组起页；最后一档仅把卷首真实占位上移约9mm，
标题框顶仍距纸顶约12mm，正文、其余页边距和答题框不变，总预算仍为24次。
`--cover-gaps -25.5,18` 等可复现同一档；旧已绑定省略卷首方案仍按原样重放，
若要恢复正式卷首，用 `--auto` 重新 QA 后保存新方案，不手改 digest。Plan 绑定
source/Candidate 与 bundle bytes；若 8/10 页自动规划必须允许完整选项之间分页，命令会把
`allowSplitOptionBank: true` 一并保存，显式方案重放同一 PDF-only 策略（旧 plan 缺省为
`false`；单条选项始终不可拆）。自动规划失败仍以非零状态退出，但会留下独立命名的
`*-diagnostic-natural.pdf`、实际 `diagnostic-page-*.png` 清单与
`failure-report.json`，供 Agent 按 slot/page 修复；失败绝不保存 plan。`--auto` 不得与
`--break-slots` 或 `--cover-gaps` 混用。finalized revision 不可原地修改，必须提交新 revision
并用 `--resolves` 指向原 PDF issue。

写作框问题先分清数据归属，不能靠分页参数掩盖。`pagination-qa` 在渲染前检查
应用文给定文字：标题／称呼／开头在框内上方，结束语／签名在下方；同一给定源段落
不得重复归入题干。不同源段落即使同文也不擅自去重。不强求每题都有标题，
源卷确无给定语时沿用已有的来源确认。
若遇到 `legacy_opaque`，先对照题卷答题区，在现有 Source Materialization 的
`writingTask.givenSkeleton` 写明每个固定段落的 `text` 与 `role`
（`title|salutation|opening|closing|signature`），保留对应源段落与定位；内容必须
与「注意」后的源给定段落逐一相等。用既有 `universal-nck1.mjs verify <paperId>` 和
`universal-nck1.mjs build <paperId>` 重建 Candidate，重新进行该卷 QA，再提交 revision。
无须新建渲染器或改 PDF DOM；
不得为历史卷凭空补来源证据、覆盖已发布资产，或把兼容模式当成“空白答题框已确认”。

新卷格式归属的必经检查在 `validateNck1SourceMaterialization`，不是只在可选
`pagination-qa`：本地 verify/build、Review push、服务端 finalize 和 promotion
重建都经过同一入口。注意块及框内给定语的源顺序检查沿用该入口；注意／注意事项、
合并／分段编号的识别与渲染共用 `applicationWritingDisplay.mjs`。
`MATERIALIZATION_PASSAGE_INSTRUCTION_SUSPECTED` 表示客观题正文中出现了疑似作答说明，
返回的 path 指向具体 block（其 source 即源定位），message 给出 slot 与 blockId。
Agent 应对照该处源材料修正分段归属，不得在渲染器删文字，不得删源证据或修改规则过闸；
无法确定时停下交 Owner 核对。词数只从已确认的注意块取，给定语只按该块后的源顺序绑定。
PDF 页数／溢出检查仍在实际生成时执行；本轮不新增认可状态或 PDF 审批凭证，
不得把结构校验成功当成已经检查过最终 PDF。

Owner 网页认可只写绑定当前 revision 与全部 digest 的 approval，Agent 随即停下。
`accept`/`publish` 仍保留给离线 verifier 与存量本地恢复，但不再是 Review-backed
生产上线步骤，也不能从 Orb 整库上传。只有 Owner 后来在当前对话明确说
`上线 <paperId>`，才使用本 README 下方的服务端单卷 `promote` 命令。

机械 how-to 见 `docs/import/agent-runbook.md`；本 README 只是它引用的工序
参考,不重复讲工序。数据契约权威见 `docs/product/nck1-paper-standard.md`。
格式③（试题 DOCX + 答案解析 DOCX）映射见该标准附录 A。切卷：
`node scripts/import-pipeline/03-split-docx-pair.mjs papers/<id>/config.json`。
canonical 物化：
`node scripts/import-pipeline/build-docx-pair-canonical-request.mjs <试题.docx> <答案解析.docx> --output-dir papers/<id>/canonical-evidence --expected-paper-id <paperId> --write`。
身份以开局 `paperId` 为准，不按标题派生。

## 已导入(13 套,paperId `paper-<year>-{i,ii}`)

2020–2025 全国新课标 Ⅰ+Ⅱ(12 套,DOCX 答案版格式)+ 2026 新课标 Ⅰ
(PDF 试题卷+独立答案 PDF 格式,首套见 `pdf-extract.mjs` + `docs/import-ledger.md`)。
每套 9 题组(reading a–d / cloze / grammar-fill / seven-choices / writing application+continuation),听力原料另存(`listening/` 原料区,不建题组)。

## 源 DOCX(off-repo,gitignored)

`~/Desktop/教学资料库/05_真题模拟与试卷库/高考真题/阅读解析与答案版/真题答案版/`。导**答案版**(不是解析版)。`gen-configs.mjs` 的 `DIR` 硬编码指这里、且文件名匹配规则专属 新课标——换卷源/格式要改它。

## 阶段(deterministic 部分在此;AI 解析扇出是 ad-hoc Workflow)

1. **`gen-configs.mjs`** — 扫源文件夹,为每套写 `papers/<paperId>/config.json`(`{docxPath, paperId, provenance}`)。
2. **`01-split.mjs <config>`** — 确定性切卷(`lib.mjs`):两种试卷格式(简化「一二三」答案版 + 官方「第X部分/第X节」);滤分值标注 `(N分)`;空标记 `__NN__`;标准重排 21–35/36–40/41–55/56–65。产 `papers/<id>/groups.json` + 每组 `analyze-<key>-combined.txt`(shape-gate 走 shipped `build*AnalysisMessages`)。
3. **解析扇出 = ad-hoc Workflow**(不在本目录;每次现写):一组一 agent,喂 `analyze-<key>-combined.txt`,产 `analysis-<key>.json`,用 `validate-one.mjs` 自校验 + 重试。
4. **`validate-one.mjs <config> <key>`** — 单组校验(注入 shipped `analyze*ImportCandidate`)。
5. **`02-publish.mjs <config> [--publish]`** — 校验全组 → 打包(shipped `buildPaperImportAiPackageFiles`)→ **产包后改写 import-meta 出处**(sourceType/region/paperName/year/tags)→ `--publish` 走 shipped `publishPaperImportPackage` 入库。格式③（以及任何已交出 `analysis-application.json` / `analysis-continuation.json` 的卷）在入库后把写作分析写入 `latest/analyses/writing-analysis-v1.json`；缺稿不得 `--publish`。`--publish` 前格式①须先跑 trusted-DOCX producer（见下），并把 `config.canonicalRequestPath` 指到产物。隔离根可用 `QUESTION_BANK_DB` / `QUESTION_BANK_PAPER_ASSET_ROOT`；默认仍是本机库与 `app/public/paper-assets/`。

格式① canonical 物化（dry-run / publish-gate / `verify-nck1` PRE 之后、`--publish` 之前）：

```bash
node scripts/import-pipeline/build-trusted-docx-canonical-request.mjs \
  <docxPath> \
  --output-dir scripts/import-pipeline/papers/<paperId>/canonical-evidence \
  --expected-paper-id <paperId> \
  --write
```

不要手写 Canonical Paper，不要套用格式② PDF envelope。同一命令去掉 `--write` 可证明 byte-reproducible。派生身份必须与开局 `paperId` 一致。

格式③ canonical 物化（dry-run / publish-gate / `verify-nck1` PRE 之后、`--publish` 之前）：

```bash
node scripts/import-pipeline/build-docx-pair-canonical-request.mjs \
  <试题.docx> \
  <答案解析.docx> \
  --output-dir scripts/import-pipeline/papers/<paperId>/canonical-evidence \
  --expected-paper-id <paperId> \
  --write
```

不要手写 Canonical Paper，不要套用格式①标题派生或格式② PDF envelope。开局 `paperId` 必填，且不得占用 `paper-YYYY-i` / `paper-zj-YYYY-jan`。

### 格式②:PDF 试题卷 + 独立答案 PDF(2026 起)

不走 `gen-configs.mjs`/`01-split.mjs`(那是 DOCX 答案版专属)。改用:

- **`pdf-extract.mjs <paperId>`** — 取代 `01-split.mjs` 的角色,但不复用
  `lib.mjs` 的正则切卷(源排版是全新的试题卷视觉约定,详见
  `docs/import/agent-runbook.md` §2 的理由)。改为读脚本内 `CONTENT` 登记表
  (agent 直读源 PDF 手工转录,一 paperId 一条目,先例同
  `zj-inject-answers.mjs` 的 `KEYS` 表)→ 组装候选结构 → 过同一套 shipped
  shape-gate(`build*AnalysisMessages`)→ 产 `groups.json` +
  `analyze-<key>-combined.txt`(与 `01-split.mjs` 产物同形状,下游
  `validate-one.mjs`/`02-publish.mjs` 零改动直接吃)。
- **`verify-nck1-standard.mjs <paperId>`** — 标准 §6 全量校验(9 题组/题号段/
  分值前置条件/客观题答案数量/听力原料/figures 双存一致性),发布前后同一条
  命令自动识别模式。
- **`attach-paper-assets-extras.mjs <paperId>`** — 发布后把 staging 的
  `listening/`+`figures/` 拷进 `app/public/paper-assets/<id>/{latest,versions/vN}/`
  (纯文件拷贝,不碰 shipped 发布/回滚逻辑)。

完整流程(前置检查→…→台账)见 `docs/import/agent-runbook.md`,不在此重复。

## 派生维度 backfill(导入后)

- **`topic-driver.mjs list|list-unlabeled|build <id>|persist <id> <labelsJson>`** — 主题标签(#190)。`list-unlabeled` 圈出所有无标签题组(后续导入卷的回填范围;`list` 仍是当年 108 组的老口径);`build` 打印 `buildTopicLabelMessages` 的 messages(喂分析会话);`persist` normalize + `bindTopicLabelsToQuestionGroup` 落库。扇出同样用 ad-hoc Workflow(一组一 agent 自写结果文件)。
- **`persist-dir.mjs <dir>`** — 批量把 `labels-out/<groupId>.json` 落库。

## 硬纪律

- **发布/落库串行**:`02-publish --publish` 与 `topic persist` **直写 SQLite**(`data/question-bank.sqlite`)。批量前**先停 API** 释放写锁:`lsof -ti :8787 | xargs kill`;发完**重启 API 刷缓存**(直连发布不 invalidate 路由缓存):`nohup node --env-file-if-exists=.env server/api.mjs &`(别用裸 `node ... &`,工具退出会回收子进程)。
- **新格式先 `01-split` 便宜预检**(无 AI)再扇出解析,别盲批量产垃圾。
- **DB / 中间数据 gitignored**:`papers/<id>/` 只跟踪 `config.json`;`groups.json`/`full.txt`/`analyze-*`/`analysis-*`/`labels-out/` 是可再生产物,见本目录 `.gitignore`。

## 上线（内容，非代码）

Owner 在 Review 认可后，Agent 必须停下。只有 Owner 后来在当前对话明确说
`上线 <paperId>`，才运行：

```bash
node scripts/import-pipeline/review.mjs promote <paperId> --owner-said-ship
```

命令需要 `QUESTION_BANK_IMPORT_OPS_ORIGIN`、低权限 Agent token 和只在本次明确上线
动作中提供的独立 `QUESTION_BANK_IMPORT_OPS_SHIP_TOKEN`。服务端重新验证最新 approval
与不可变 bytes/digests，在 Review 事务内先建立 `publishing`+guard，再调用共享
publisher 只提交这一卷的正式 rows、Canonical current、五份 sidecar、`versions/vN`、
`latest` 与媒体。已提交但回执缺失的 exact retry 不创建 vN+1：

```bash
node scripts/import-pipeline/review.mjs promote <paperId> --owner-said-retry-ship
```

Review-backed paper 的 `pull-run-push push` 已退役并会拒绝；`pull` 与 manifest/历史维护
仍保留。日常 Orb Secret 只有 Agent token；网页无按钮。详见
`docs/import/agent-contract.md`「上线」。

## 待办(productionization 续)

- `lib.mjs` 格式启发式(2020 双试卷、`Paragragh` 拼写、grammar Format-2 阈值、continuation starter 四策略)未通用 —— 导新格式时硬化 + 补 verify 锁。
- topic-label 的 taxonomy/normalize 簇仍在 `server/api.mjs`(#190 加了 4 个 export);后续抽进 `server/topic-labels/` 模块。
