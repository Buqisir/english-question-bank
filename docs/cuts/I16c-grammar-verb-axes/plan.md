# I16·C Plan — 语法填空·动词教学维度（时态 / 语态 / 主谓一致）

## Cut Size

**medium（偏大）**。Touches schema/**data contract** = **yes（新增结构化动词维度产物 + 检索契约）**；product boundary（"按动词专题找题"，含 owner 最初要的"搜被动题"）= **yes**；**teaching interpretation** = **yes（时态/语态/数的判定是教学解读）**；新 **AI prompt**（解析可靠性风险）。
→ 全门：**fresh Opus PA before DEV**、DEV(TDD)、CR-lite、verify-ci、PO QA、RM。**无新 UI（见 Locked）→ 不需要浏览器 QA**。

加性、隔离、复用两套成熟模式：**#180（I16·A）on-disk teaching-facets 检索层** + **#181（I16·B）可注入回填编排**。

## Objective

让"按动词专题找题"成立——第一刀就是 owner 最初问的**"搜被动题"**，并顺带"搜某时态 / 搜主谓一致"。

决定性事实（已核实代码）：语法填空分析每个空只产 `facetKey`（16 叶）/`blankType`/`role`(仅非谓语)/`evidence[]`/`reason`/`teachingNote`/`answer`——**谓语动词只有一个 `grammar-fill.given.verb.finite` 叶子，里面时态/语态/数全没拆**（`analyzeGrammarFill.mjs:32-42,259-289`）。所以"搜被动"现在最多搜到"谓语动词填空"，再往下没了。

第一刀 = 给**谓语动词空（finite verb blank）**补三根正交轴，并让检索层能按这三根轴 filter：

1. **时态轴**：`present` / `past` / `present-perfect` / `past-perfect` / `progressive` / `other`
2. **语态轴**：`active` / `passive` ← owner 最初要的"被动"在这
3. **主谓一致（数）轴**：`singular` / `plural` / `na`（轻量独立轴）

**非谓语动词不在本刀**（owner：再说）。**完形/阅读不在本刀**。

## Why（owner-locked, 2026-06-03）

PM grill + 对照真题考点研究（《高中英语语法填空专项训练·高考版》「考点速查·动词时态」+「考点共性」）定案：

- **时态就锁这 5 个 + 兜底**（依据：速查·高考版动词时态只立这 5 章——一般现在/一般过去/现在完成/过去完成/进行；**无独立"一般将来时"章**，语法填空里将来时极罕见）。owner 拍：进行时态**合并**为一个值（不拆现在/过去进行）。
- **语态是独立轴、跨时态**（材料就是这么编的：被动语态单立专题，内部按"一般现在时被动 / 一般过去时被动 / 情态+被动"再分）→ **一个谓语空 = 时态+语态+数 同时成立 → 多标签（每根轴一个值），不是单选**。
- **主谓一致给一根轻量独立轴**（owner 拍）。材料里它本是寄生在一般现在时的 is/are 选择里，无独立专题；但"搜主谓一致题"是 owner 真实诉求，且单复数客观好判 → 单列 `singular/plural/na`。
- **标"全形态(A)"，不标"只标考点(B)"**（owner 拍）：按正确答案的形态客观标满三根轴（`was built`→past+passive+singular），AI 判得稳、搜得全。

**复用 #181 的教训**：分类**绝不重塞解析 prompt**（`94950a1` "keep import analysis metadata scoped" 的回退教训）——动词维度走**独立的分析/回填通道**，不污染 `grammar-fill-analysis-v1.md` 解析 prompt，不动 frozen 的 `validateGrammarFillShape`。

## Code Reality（verified — design around it）

- **现有产物（frozen，只读复用）**：grammar-fill 分析在 `analyzeGrammarFill.mjs`，import 时产出，存盘 `app/public/paper-assets/<paperId>/.../analyses/grammar-fill-analysis-v1.json`。`validateGrammarFillShape`（:210）严格校验 v1；**谓语 finite 叶子无任何动词子字段**。
- **gitignore 真相（MF-3 改正）**：`app/public/paper-assets/**` **并非全部 gitignored**——`.gitignore:52` 只 ignore 了 `app/public/paper-assets/*/versions/`；**扁平 `analyses/` 和 `latest/` 是 git 跟踪的**（`git ls-files` 见 `paper-2024-jslk-english/analyses/*.json` 已提交）。→ sidecar 落在跟踪路径，**必须显式不 stage**（见 Forbidden）。
- **读路径真相（MF-1 改正）**：`resolvePaperAssetReadPaths(paperAssetsDir, paperId)`（storage.mjs:32-48）解析 baseDir 时，**`latest/` 不存在则回退 `versions/<latest>/`**。live 唯一的 grammar-fill paper `paper-960d0f8d` **没有 `latest/` 目录**，索引实际读 `versions/v1/`。→ sidecar **不能硬编码写 `latest/`**，必须写进 `resolvePaperAssetReadPaths` 返回的同一 baseDir 的 `analyses/`。
- **存盘机制（关键约束）**：`writePaperImportVersion`（`server/paper-import/storage.mjs:105`）是**整版原子写**，入参需完整 `packageData`（含源 docx buffer），**没有"补丁单个分析文件"的 helper**；`swapPaperImportLatest`（:161）把某版分析文件逐个拷进 `latest/`。→ **不能简单 append 进 frozen 的 grammar-fill-analysis-v1.json**（无补丁通道、且任何重导会覆盖它）。
- **检索层（#180，扩展点）**：`server/search/teachingFacets.mjs` 从 on-disk 分析 JSON 建索引并缓存：`analysisConfigs`（:22）声明每种分析文件 → `extractGroupFacets`（:72）按 groupType 抽 facet → `createTeachingFacetIndex`（:192）遍历 paper-assets 建 `Map<groupId, bucket>` → `queryGroupsByTeaching`（:289）按 filter AND 查 → `GET /api/teaching-facets`（:338）。
  - ⚠️ **索引覆盖写约束**：`index.set(groupId, {...facets, groupType})`（:239-242）对同一 groupId **每个 config 覆盖**。→ **不能新开一个并行 config 产同组 bucket**（会把 grammarFill bucket 冲掉）。必须 **(a)** 把动词轴塞进 grammarFill 的同一抽取趟，或 **(b)** 把 index build 从"覆盖"改成"按 groupId 合并 bucket"。
  - ⚠️ `queryGroupsByTeaching`（:289）已存在但 **endpoint 没用它**（`/api/teaching-facets` 现返回全部组、不收 filter）。"搜被动"要真能调，需把 filter query 参数接进 endpoint。
- **回填编排模板（#181，复用形状）**：`server/topic-labels/backfillTopicLabels.mjs`——纯编排、依赖全注入（`listUnlabeledGroupIds`/`classify`/`bind`）、逐组 try/catch 计入 `failed`、返回 `{processed, labeled, skipped, failed[]}`。本刀照此形状，但 `classify`=新动词分析器、`persist`=写动词维度产物（见存储决策）。
- **AI 通道**：`callDeepSeekJson`（`server/ai-providers/deepseek.mjs`）+ `extractFirstJsonObject`，key 入参缺省回退 `DEEPSEEK_API_KEY` 环境变量——与现有分析器一致。

## Storage / Retrieval 架构决策（PM 推荐；fresh PA 重点压）

**推荐方案：sidecar 分析文件 + 索引合并。**

- **存储**：新建 **sidecar 文件** `analyses/grammar-fill-verb-profile-v1.json`（与 grammar-fill-analysis 同目录），keyed 同 `blanks[questionId]`，每个 finite-verb 空带 `{ tense, voice, agreement }`，带 `schemaVersion` + `paperId`。**CREATE 新文件、不补丁 frozen v1**（不碰 `validateGrammarFillShape`、不碰 import 路径）。**写盘目标（MF-1）**：先 `resolvePaperAssetReadPaths(paperAssetsDir, paperId)` 解析 baseDir，原子 temp+rename 写进**该 baseDir 的 `analyses/`**（与索引 `teachingFacets.mjs:205,228` 走的同一 baseDir）——**绝不硬编码 `latest/`**（live paper 无 `latest/`，会读不到）。
- **检索**：把 sidecar 作为 teachingFacets 的**新 config**接入，并把 `createTeachingFacetIndex` 的 build 从**覆盖**改为**按 groupId 合并 bucket**（修掉上面的覆盖写约束）；bucket 加 `tenses`/`voices`/`agreements` 三个 Set；`serializeFacets` + `queryGroupsByTeaching` + `matchesFacetFilters` 加 `tense`/`voice`/`agreement` 三个 filter。
- **触发/QA 面**：`POST /api/grammar-fill/verb-profiles/backfill`（经 route factory，**不往字面量 push 路由**）跑回填；**把 filter query 参数接进 `GET /api/teaching-facets`**（复用现成 `queryGroupsByTeaching`）→ `GET /api/teaching-facets?voice=passive` 即可验证"搜被动命中"。**本刀 API-level QA（同 #180 的后端检索性质），不做 UI。**

**为什么不选另两条**（写给 PA 评判）：
- ❌ **塞进 frozen grammar-fill-analysis-v1.json**：无补丁 helper、`writePaperImportVersion` 需完整 packageData、重导会覆盖、要改 frozen validator——风险/成本最高。
- 🟡 **DB 表（如 #181）**：写路径干净，但 teachingFacets 索引是 **disk-based**，动词轴是结构化 filter（非关键词文本），DB 数据要么给索引加 DB 分支、要么另起检索路径，并引入 schema migration——与"按教学维度找题"这一 disk-based 检索特性**不同 grain**。

## Must Do（TDD：纯逻辑/可注入先写断言→实现到绿）

### Step 0 — 枚举注册表（frozen 契约）
- 新建 `server/paper-import-ai/grammar-fill-verb-axes-v1.json`（仿 `grammar-fill-facets-v1.json`）：固化三轴合法值 + 中文展示名映射（`present→一般现在时` 等）。检索/分析/校验都从此单一来源读。

### Step 1 — 动词分析器（确定性优先 + AI 兜底，可注入）
- 新建 `server/paper-import-ai/analyzeGrammarFillVerbProfile.mjs`：输入 = 一个 grammar-fill group 的 passage + 其 **finite-verb 空**（从已存分析里 `facetKey==='grammar-fill.given.verb.finite'` 筛出，带 answer/blankId）。
- **判定策略（MF-4）**：owner 选"标全形态 A"。对**简单 80%**，答案串本身够判且更稳/更省——确定性 parser：`was/were+过去分词`→past+passive、`has/have+过去分词`→present-perfect+active、`is/are`/第三人称 `-s`→present+数。**AI 只兜底真歧义边角**（无助动词的裸过去 vs 过去分词、不规则、**数需要主语**的情形）。**不是丢掉 AI prompt**（owner 选 A），是不假装简单情形也要 AI。
- **主语上下文必达 prompt（MF-4 关键）**：`agreement`（单/复）常来自主语、不在答案串里（live 的 `"are"` 来自主语 `vitamins and minerals`，不是 `are` 本身）。所以 prompt/parser **必须拿到每个 finite 空所在句子 + 主语上下文**，否则无法可靠定 `agreement`。
- 新 prompt `prompts/grammar-fill-verb-profile-v1.md`；**严格校验**三轴值都在 Step 0 注册表内，否则按现有 retry 逻辑重试/抛错。providerCaller 注入，测试不打真 DeepSeek。
- Verification：合法三轴通过；非法时态值/缺字段被拒；只对 finite 空产 profile（非谓语/非动词空不产）；**`agreement` 由主语上下文判定的用例**（光给裸答案判不出，给句子+主语才对）。

### Step 2 — 回填编排（仿 #181，可注入）
- 新建 `server/.../backfillVerbProfiles.mjs`：`backfillVerbProfiles({ listGrammarFillGroups, classify, persist, apiKey, model, limit? })` 纯编排——列出**有 grammar-fill 分析、finite 空未 profile** 的组 → 逐组 `classify` → `persist`（写 sidecar）→ 收集 `{processed, profiled, skipped, failed[]}`；单组 try/catch；**幂等**（已 profile 的 finite 空跳过，可安全重跑）。`classify`/`persist`/`listGrammarFillGroups` 注入。
- Verification：mock classify → 多组全 profiled、已 profile 组跳过、某组 classify 抛错计入 failed 不中断、摘要计数正确。

### Step 3 — sidecar 持久化（原子写，可测）
- 新建持久化 helper：把一组的 `{questionId: {tense,voice,agreement}}` 原子写进 `latest/analyses/grammar-fill-verb-profile-v1.json`（temp+rename，参照 storage.mjs 既有 idiom；**不经 writePaperImportVersion**——那是整版导入）。带 `schemaVersion: 'grammar-fill-verb-profile-v1'` + `paperId`，供检索层按 paperId 校验。
- Verification：写入后再读，三轴值往返一致；并发安全（temp 名带 uuid）；不动同目录其它分析文件。

### Step 4 — 检索层扩展（#180 teachingFacets）
- `analysisConfigs` 加 verb-profile config；`createEmptyFacetBucket` 加 `tenses/voices/agreements`；`extractGrammarFillVerbFacets`（新）从 sidecar `blanks[].{tense,voice,agreement}` 填 bucket；**index build 改"按 groupId 合并 bucket"**（修覆盖写）；`serializeFacets`/`queryGroupsByTeaching`/`matchesFacetFilters` 加三轴。
- 把 filter query（`tense`/`voice`/`agreement`/含现有 `facetKey` 等）**接进 `GET /api/teaching-facets`** → 复用 `queryGroupsByTeaching`，返回匹配组（无 filter 仍返回全部，保持向后兼容）。
- Verification（**含 #180 回归，MF-2 点名断言**）：用一个**同组既有 grammar-fill 主分析、又有 verb-profile sidecar** 的 fixture，断言合并后 bucket **仍含** 原 `facetKeys`（含 `grammar-fill.given.verb.finite`）、`blankTypes`、`roles`、`groupType:'grammarFill'`，**且新增** `tenses/voices/agreements`；断言 reading `skills`、cloze `pos`、sevenChoices facets **未被动**；`?voice=passive` 只返回有被动 finite 空的组；`?tense=present-perfect&voice=passive` 交叉 AND；无 filter = 原行为（#180 向后兼容）。

### Step 5 — 触发路由 + Verifier + CI
- `POST /api/grammar-fill/verb-profiles/backfill`（经 route factory 加进 `serverRoutes` 组合，**不往 `api.mjs:436` 字面 push**），body 取 apiKey/model，调 Step 2 编排，返回摘要 JSON，跑完 invalidate teachingFacets 缓存。
- 新建 `scripts/verify-i16c-grammar-verb-axes.mjs`：注入 mock 跑 Step1/2/4 断言 + **diff 围栏**（断言**没碰** `prompts/grammar-fill-analysis-v1.md`、`analyzeGrammarFill.mjs` 的 `validateGrammarFillShape`、不重建 facets 注册表）。注册进 `verify-ci.mjs` + `scripts/README.md`。
- Verification：`node scripts/verify-i16c-grammar-verb-axes.mjs` 绿；`verify-ci.mjs` 绿；`npm run build --prefix app` 绿（若无前端改动，build 仅作回归）。

## Forbidden

- **不碰解析 prompt / frozen 分析契约**：不改 `prompts/grammar-fill-analysis-v1.md`、不改 `analyzeGrammarFill.mjs` 的 `validateGrammarFillShape` / 16-叶 facets / `grammar-fill-facets-v1.json`、不给主 grammar-fill 分析加动词子字段。动词维度只走**独立 sidecar + 独立分析/回填通道**（尊重 `94950a1`）。
- **不做非谓语**（不定式/动名词/分词）、**不做完形/阅读**、**不做难度**、**不做 concierge 集成**、**不做前端 chip / variant E**。
- **不新建 DB 表 / 不动 schema.sql**（推荐方案是 disk sidecar；若 PA 改判 DB，回 plan 再定）。
- **合并不得伤现有 facet（MF-2）**：index 合并 by-groupId **不得丢/覆盖**任何已有 per-type facet Set 或 `groupType` 标签；verb-profile config 无主分析、**不得把 grammarFill 的 groupType 抹空**。
- **诚实覆盖（MF-5）**：摘要讲清"已 profile N 组 / 跳过 M（已 profile 或无 finite 空）/ 失败 K（无分析或 AI 无返回）"；**当前真实覆盖 = 1 组 / 1 个 finite 空 / 0 被动**，摘要不得暗示更广。
- **paper-assets 不是全 gitignored（MF-3）**：`latest/` 与扁平 `analyses/` 是 **git 跟踪**的（只 `*/versions/` 被 ignore）。verb-profile sidecar 落在跟踪路径 → **绝不 stage sidecar**；DEV 提交前 `git status` 确认无 sidecar / 无 `app/public/paper-assets/**`。**禁止 `git add -A`**，显式 stage。
- 路由经 factory 注册（非字面 push）。**不提交** `.env` / `.claude/launch.json`。

## Suggested Files

- `server/paper-import-ai/grammar-fill-verb-axes-v1.json`（新：三轴枚举注册表）
- `prompts/grammar-fill-verb-profile-v1.md`（新：标全形态 A 的分类 prompt）
- `server/paper-import-ai/analyzeGrammarFillVerbProfile.mjs`（新：AI 分析器 + 校验）
- `server/grammar-verb-profile/backfillVerbProfiles.mjs` + sidecar 持久化 helper（新：编排 + 原子写）
- `server/search/teachingFacets.mjs`（扩展：config + 合并 bucket + 三轴 filter）
- `server/api.mjs` / 相关 routes 工厂（回填路由 + endpoint filter 接线 + 暴露注入依赖）
- `scripts/verify-i16c-grammar-verb-axes.mjs`（新）+ `scripts/verify-ci.mjs` + `scripts/README.md`
- `CONTEXT.md`（加术语：语法专题 / 时态 / 语态 / 主谓一致——领域语言补全）

## Verification

- 定向：`node scripts/verify-i16c-grammar-verb-axes.mjs`、`git diff --check`。
- 全门：`node scripts/verify-ci.mjs`、`npm run build --prefix app`。
- PO QA（API-level，**覆盖诚实，MF-5**）：填 key → `POST /api/grammar-fill/verb-profiles/backfill` → 摘要显示"已 profile **1** 组 / 1 个 finite 空"。
  - **真数据 demo（记录用）**：`GET /api/teaching-facets?tense=present&voice=active&agreement=plural` 命中**那唯一一组**（answer `"are"`）；抽查 sidecar 三轴 = present/active/plural。
  - **被动路径靠 fixture 验，不靠 live 库**（live 0 被动，owner 已拍 fixture 验收）：verifier 里用含被动 finite 空的 fixture 断言 `?voice=passive` 命中 + `?tense=&voice=` 交叉 AND。

## DEV Readiness & PA Attention Asks

本 plan committed → **fresh Opus PA before DEV**（`pa-reviewer` 写 `pa.md`；data contract + teaching interpretation + 新 AI prompt）。PA Must Fix → 回 `plan.md` 的 `PA Follow-Up Decisions` 映射后再 DEV。DEV 用 **TDD**（Step1/2 注入 mock 先断言→绿，再接持久化/检索/路由）。

**PA 重点压：**
1. **存储 home**：sidecar disk 文件（PM 推荐）vs DB 表 vs 补丁 frozen v1。给定 `writePaperImportVersion` 整版原子写无补丁 helper、paper-assets gitignored——手写原子 sidecar create 可接受吗？还是该上 DB + 检索层合并？
2. **索引合并重构**（覆盖→按 groupId 合并）：会不会回归 #180 现有 facet 检索？必须有回归断言。
3. **AI 分类 vs 从已存 `answer` 字符串确定性推导**三轴：finite 答案多含助动词（was built/has made/are），确定性 parser 能走多远？AI（贵但稳、与代码库一致）值不值，还是 parser 更安全/够用？owner 已选"标全形态 A"。
4. **sidecar 版本化**：只写 `latest/`（检索读 latest）V0 够吗，还是必须镜像进 `versions/<v>/`？
5. **重导覆盖主分析但不覆盖 sidecar**（陈旧风险）——记为已知限制可接受吗？
6. **覆盖量（PA 已核实，记录）**：live = **1 组 grammar-fill**（DB 存为 `group_type='grammar_cloze'`，但 paper-asset content groupType=`grammarFill`，索引读后者）、**1 个 finite 空**（answer `"are"` = present/active/plural）、**0 被动**。基建幂等：owner 已拍"先建基建"，被动 fixture 验，以后导入真题再回填点亮。

## Out of Scope（后续）

- **非谓语动词维度**（不定式/动名词/分词；被动在非谓语=过去分词）——下一刀。
- **完形 / 阅读的动词维度**、**难度**、**第三维"解题线索/evidenceType"可搜**（`analyzeGrammarFill` 已有 evidence.type，将来可暴露）。
- **concierge/经典搜集成** + **前端找题 chip（variant E）**——随找题 UI（Claude Design）。
- **import 时自动产 verb profile**（本刀只回填存量；新导入待后续 wire）。
- **重打/纠错已 profile 的组**（本刀只填空白）。

## PA Follow-Up Decisions

PA verdict（`pa.md`）：**APPROVE WITH MUST FIX**（方向对、切得好；5 MF 全机械可折、不改方向；存储 home 确认 sidecar 对，别 DB / 别补丁 frozen）。5 MF 已折入本 plan：

| PA item | `plan.md` 处置 | Status |
| --- | --- | --- |
| MF-1 sidecar 写盘目标错（硬编码 `latest/`，但 live 无 `latest/`，索引读 `versions/v1/`）| Code Reality「读路径真相」+ Storage 决策 + Step 3 改：先 `resolvePaperAssetReadPaths` 解析 baseDir，写进该 baseDir 的 `analyses/` | Closed |
| MF-2 合并缺回归契约 | Step 4 Verification 点名"合并保留现有 facetKeys/blankTypes/roles/groupType + 跨类未动 + 新增三轴"断言；Forbidden 加"合并不得伤现有 facet"。**实现优于 plan 原案**：没把 verb-profile 加成并行 config（那才会触发 `index.set` clobber，也要改 `extractGroupFacets` 签名→打断 #180 verify），而是 `extractGroupFacets` 签名**原样不动**，buildIndex 里**额外加一趟 `mergeVerbProfileAxes`**，只 augment 已有 grammarFill bucket。clobber 从构造上消除，#180 零回归（verify-i16a 仍绿 + Req9 断言）| Closed |
| MF-3 gitignore 声明假（只 `*/versions/` 被 ignore）| Code Reality「gitignore 真相」改正；Forbidden 点名 `latest/`+扁平 `analyses/` 被跟踪、sidecar 绝不 stage、提交前 `git status` 核 | Closed |
| MF-4 主谓一致需主语上下文（光看答案 `"are"` 判不出数）| Step 1 改：确定性优先 + AI 兜底；**主语/句子上下文必达 prompt**；verifier 加 agreement-from-subject 用例 | Closed |
| MF-5 覆盖 = 1 组/1 finite/0 被动，headline demo 会空 | PA ask #6 记录真实覆盖；PO QA 重写为覆盖诚实（真 demo = present/active/plural 命中那一组；**被动靠 fixture 验**）；Forbidden 加诚实覆盖 | Closed |

**Open PO Decision #1（被动 demo 数据）→ owner 已拍（2026-06-03）**：fixture 验被动可接受，**不为取数阻塞本刀**（owner 选"先建基建"）。以后导入含被动 finite 空的语法填空真题，重跑回填即点亮。

**SW（记录，不阻塞）**：SW-1 重导覆盖主分析不覆盖 sidecar→陈旧（V0 可接受，未来用 `sourceAssetVersion` 戳跳过）；SW-2 sidecar 只写 latest baseDir、不镜像 versions（避免重引入整版写耦合）；SW-3 `other` 时态桶要可搜、prompt 说清何时用；SW-5 `na` 触发（祈使/情态/非第三人称数无关）要在注册表+prompt 精确定义，别过报。
