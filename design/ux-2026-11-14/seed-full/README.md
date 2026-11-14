# 全量种子实测（INVENTORY_SEED=full）

日期 2026-11-14。标注：**【量】** = 这次实际跑出来的；**【推】** = 读代码推断、没有实跑验证。

## 怎么复现

```sh
# 终端 1：起站（偏移 55：网页 5354，接口 9967；账号 owner / inventory-owner-pw-1）
INVENTORY_PORT_OFFSET=55 INVENTORY_SEED=full node scripts/component-inventory/rig.mjs
# 终端 2：走一遍，截图进 shots/，记录进 walk.json
node design/ux-2026-11-14/seed-full/walk.mjs
```

- `INVENTORY_SEED` 不设（默认）：和原来一字不差，只种 paper-2026-i 四篇阅读（`rig.mjs` 的 else 分支就是原来那三行）。
- `INVENTORY_SEED=full`：`scripts/lib/canonicalFullSeed.mjs` 的 `seedFullCanonicalStore` 把数据仓里所有当前版本的卷整卷种进去。
- `INVENTORY_STORE=<目录>`：换数据仓（相对仓库根或绝对路径），默认 `test-fixtures/paper-canonical/publications/ticket-32-remaining-v1/store`。真卷来了就设成 `test-fixtures/paper-canonical/publications/real-papers-v1/store`。

全量种子做的事（详见文件头注释）：
1. 卷目录复制到临时 paper-assets，照 `scripts/lib/productionCanonicalBackfill.mjs` 的映射把 `versions/vN/paper-asset.json`（封存源字节）挪成 `versions/vN/canonical/source-asset.bin`，字节不改。
2. 封存源（source-capture-v1）里每份文档都记着原来的位置（`app/public/paper-assets/<id>/latest/<文件>`）和 sha256。按原相对路径放回 `versions/vN/` 和 `latest/`：`paper-asset.json`、`import-meta.json`、`answer-key.json`、`figures/…`。放之前逐份核对 sha256。这就是 C7 导入上线时这两个目录里该有的文件（`server/paper-import/storage.mjs` 的 `enumeratePaperImportOutputs`、`swapPaperImportLatest`）。
3. 题库表照 `server/paper-import/publisher.mjs` 的 `upsertPaperAssetToDb` 逐字段写：sources、passages、question_groups、questions、options、tags、tag_links、question_group_topic_labels、paper_asset_versions。
4. `canonical_paper_publications` 照数据仓自己的 publication.sqlite 逐行抄。`paper_import_runs` 只在版本目录里真有 `publish-report.json` 时照抄，没有就不写。
5. 写完用服务端自己的 `listCanonicalPaperCatalog` 和 `createCanonicalConsumerRuntime`（screen / print_pdf）逐卷核一遍，结果打印在起站日志里（`[seed full] …`）。

种子结果【量】：29 套里 28 套整卷上线，Screen 和 Print/PDF 都能 load，共 238 个题组进了题库。剩下的 **paper-2025-i** 封存源是 DOCX，数据仓里没有 paper-asset-v1 投影，题组进不了库，整卷也不上线。29 套里听力题组 0 个、听力音频 0 份、`source-references-v1.json` 0 份、`publish-report.json` 0 份。起站种子约 2.4 秒。

## 走查结果（shots/，1440×900，DPR 1）

搜「2024 阅读」，打开「2024年新课标Ⅰ卷」。

| 步 | 截图 | 结果【量】 |
|---|---|---|
| 1 | 01-登录后首页 | 首页 4 个「看整卷」，0 个「整卷未上线」 |
| 2 | 02-搜索结果 | 3 行结果，3 个「看整卷」，0 个「整卷未上线」 |
| 3 | 03-展开题组 | 展开后列出 4 篇 |
| 4 | 04-题组详情 | 没有「这份卷还没上线」，「看整卷」「加入草稿卷」都在 |
| 5 | 05-从题组详情看整卷 | 整卷预览打开，9 个题组都有加入键 |
| 6 | 06-回结果行点看整卷 | 从结果行也能打开整卷预览 |
| 7 | 07-整卷里加3个题组 | Reading A/B/C 加入，草稿丸显示「草稿卷（3 组）」。加入键要鼠标移到卡片上才出现 |
| 8 | 08-打开草稿卷 | 3 组，分页预览约 35 秒出完 |
| 9 | 09-PDF版本菜单 | 大字完整版置灰「要有完整的两个听力题组」（LISTENING_PAIR_REQUIRED）；大字无听力版、省纸版可选；纯答案版置灰「选中的题组还没有审过的参考答案」（ANSWER_SOURCE_MISSING） |
| 10 | 10-选大字无听力版 | 切换成功 |
| 11 | 11-导出菜单 | 「下载 PDF（大字无听力版）」「另存为 PDF…」「保存 PDF 到个人空间」三项都能点 |
| 12 | 12-下载题卷PDF | 下载到 %PDF，4 页，166807 字节（PDF 只存在临时目录，没进仓库） |
| 13 | 13-试答案PDF | 直接请求 answerOnly：400「选中的题组没有同版本已审源参考答案；不能以教师卷替代」 |

另外用接口探了几件事（2024-i，不进截图）：
- 【量】省纸版只放 1 篇阅读：菜单里显示可选，但导出搜了 351 秒，最后报 400「未在有界搜索内找到合格的八页省纸版」。省纸版要排满整 8 页（`studentProductPolicy` 里 `atMost` 为 false），可用性检查发现不了这种情况。放 7 个题组时 102 秒导出成功（250617 字节）。走查里因此改用大字无听力版下载。
- 【量】完形、七选五、读后续写单组导出大字无听力版：成功，各 8–9 秒。
- 【量】**语法填空、应用文加进草稿卷都失败**，见下面「还不能按」第 3 条。

## 每个按钮现在怎样

### 现在能按了
1. **结果行「看整卷」**【量】。原来按不了的原因【量】：`listCanonicalPaperCatalog`（`server/search/canonicalPaperCatalog.mjs`）直接读 `<id>/latest/paper-asset.json`，没有这个文件就读最新版本目录的 `paper-asset.json`，要求是 paper-asset-v1（有 `paper.paperId` 和 `content.blocks`）。默认种子只复制了数据仓：latest/ 里只有 ref，`versions/v4/paper-asset.json` 是 source-capture 封存外壳。实测默认种子下目录收录 0 套，所以 `canonicalPaperId` 为空（`server/api.mjs` 第 1535–1559 行），结果行就显示「整卷未上线」（`ConciergePaperRow.tsx` 第 118、362 行）。**属于 rig 种法不够，不是数据缺。**
2. **题组详情「看整卷」**，不再显示「这份卷还没上线」【量】。原因同上：`getQuestionGroupDetail` 也走 `attachCanonicalPaperAvailability`（`server/api.mjs` 第 1851 行）。属于 rig 种法不够。
3. **整卷预览**【量】。前端从 `/paper-assets/<id>/versions/vN/paper-asset.json` 取卷面，并直接读 `content.blocks`（`PaperBrowsePage.tsx` 第 1010–1023 行，`paperBrowseCanonicalAssetProjection.ts` 第 35 行）。版本目录里放封存外壳时，页面报「Cannot read properties of undefined (reading 'blocks')」。全量种子第一版就是这样，所以改成了 backfill 的生产布局。
4. **整卷里「加入草稿卷」**（阅读、七选五、完形、读后续写）、**打开草稿卷**、**导出菜单**、**大字无听力版下载**【量】。
5. **省纸版**【量】：题组够排满 8 页时能导出。题组太少时菜单显示可用，但导出要等约 6 分钟才报错，这是产品本身的行为，和种子无关。

### 还不能按、缺的是什么
1. **大字完整版**：置灰「要有完整的两个听力题组」。条件【量·代码】：`preparePaperProduct`（`draftPaperStore.mjs` 第 1781–1788 行）先数草稿卷里 `group_type='listening'` 的题组，交给 `studentProductPolicy`（`studentProductPdf.mjs` 第 15–18 行），要求恰好 2 个；再要求这两个出自同一套源卷（LISTENING_PAIR_SAME_SOURCE）。**属于数据本身没有**【量】：29 套卷的 plan 里 `listening.short-dialogue`、`listening.long-form` 两个槽位全是 `inactive`，question-groups 里没有 listening family，manifest 里也没有 `listeningAudio`。种子再怎么写也凑不出来。
2. **纯答案版 / 答案 PDF**：置灰「还没有审过的参考答案」。条件【量·代码】：`readSourceReferencePublication`（`server/paper-import/sourceReferencePublication.mjs`）要求以下几项**同时**满足：
   - `paper_import_runs` 里，这个 paper_id 加 asset_version 恰好有 1 行 `status='published'`，其中 `publish_report_json.sourceReferencePublication` 承诺（`schemaVersion: source-reference-publication-v1`、`approvalId`、`revisionId`、`paperName`，以及 `bundleDigest`、`sourceDigest`、`candidateDigest`、`materializationDigest`、`sourceReferencesDigest` 五个摘要）齐全；report 里的 `paperId`、`assetVersion`、`versionName`、`canonicalPublicationDigest` 都要和当前上线版本一致。
   - `paper_asset_versions` 里有同版本、`status='published'` 的一行。
   - 版本目录里有 `source-references-v1.json`，sha256 等于承诺里的摘要。
   - 版本目录里有 `canonical/source-asset.bin` 和封存 manifest。
   - 封存源里有唯一的 `nck1_source_materialization` 文档，或者唯一的 `nck1_analyzed_package_manifest` 加上它的成员文档，能重放出承诺里的 materialization 摘要。

   上面任何一项不满足，`buildAssembledAnswerOnlyHtml`（`server/answer-renderer.mjs` 第 263 行）就报 ANSWER_SOURCE_MISSING。**属于数据本身没有**【量】：29 套都没有 `source-references-v1.json`、`publish-report.json`，封存源的 inputKey 只有 `latest_asset_projection / latest_source_provenance / latest_official_answer_lead / ticket_26_*`（2025-i 是 `source_docx / docx_source_envelope`），没有 nck1 材料化。数据里的 `answer-key.json`（answer-key-v1，「AI 导题：答案解析版抽取」）不算「已审源参考答案」。种子不能也不该自己编一份承诺。
3. **语法填空、应用文进不了草稿卷，进去后整份草稿卷打不开**【量】。加 `group-2024-i-grammar-fill` 时接口返回 400「Canonical Grammar Fill chrome immutable source digest disagrees」，但这一项**已经写进了草稿卷**，之后 `GET /api/draft-papers/current` 一直返回 500，只能按条目 id 删掉才恢复。加 `group-2024-i-writing-application` 时报「Canonical visible page-break source digest disagrees」。
   - 原因【量·代码】：`grammarFillPrintSourceBinding.mjs` 第 131–143 行和 `loadPublicationBoundSourceAssetRepresentation`（`sourceAssetRepresentation.mjs` 第 76 行）对「非 DOCX」的封存源，要求 `versions/vN/paper-asset.json` 就是封存字节。整卷预览页却要求同一个文件是 paper-asset-v1 投影。ticket-26 封存外壳这两者不是同一份字节，所以同一路径满足不了两边。**属于数据形态（ticket-26 外壳）和现有服务端、前端读法冲突，rig 种法改不了**：保留外壳，整卷预览会崩；换成投影，语法填空和应用文会坏。这次选了和生产 backfill 一致、整卷预览能用的那种。
   - 【推】生产上用 backfill 补进来的这批卷大概也是这样，没核实。
   - 【推】「加入失败但已写入」是服务端的另一个问题（写入在校验之前），不在本次范围，建议单独开任务。
4. **paper-2025-i** 整卷未上线，题组也搜不到【量】：数据仓里只有 DOCX 封存源，没有 paper-asset-v1 投影。属于数据本身缺。
5. 听力播放【推】：没有听力，所以没测。`/paper-assets/<id>/versions/vN/listening/playback.mp3` 先通过 `paper_import_runs.publish_report_json.fileStorage` 去 blob 存储取（`server/paper-import/blobStore.mjs` 第 197 行），report 里没有 fileStorage 时退回静态文件。

## 服务端还在哪些地方读这三样东西（摸底）
- **整卷上线 `canonical_paper_publications`**：`search/canonicalPaperCatalog.mjs`（找题和详情的 canonicalPaperId，还有 `agent-api/agentCatalog.mjs`）；`paper-canonical/publication.mjs`（所有 Screen/Print 的 consumption load，靠 `is_current` 加 `latest/canonical-paper-publication-ref-v1.json` 双重绑定）；`search/listeningMaterialProjection.mjs`（读当前版本的 `analyses/listening-analysis-v1.json`）；`draft-paper/draftPaperStore.mjs` 第 1710 行（整卷冻结产品下载）；`paper-import/frozenProducts.mjs`；`paper-import/sourceReferencePublication.mjs`；`import-review/singlePaperPromotion.mjs`。
- **已审答案 `paper_import_runs.publish_report_json.sourceReferencePublication` 加 `source-references-v1.json`**：`sourceReferencePublication.mjs`（纯答案版）；`frozenProducts.mjs`（整卷的冻结 PDF 产品，读 report 里的 `pdfProducts`）；`publisher.mjs`（上线时自查）。
- **听力音频 `manifest.listeningAudio`**：`publication.mjs` 的 `capturedListeningAudio`（新 manifest 版本里，有听力就必须有 `listening_audio_descriptor`，见第 445–455 行）；`paper-import/blobStore.mjs` 的 `loadStoredPlayback`；`server/api.mjs` 第 4046 行的 `/paper-assets/…/listening/playback.mp3` 路由；`paper-import/listeningAudioEvidence.mjs`。
- **正常上线写哪些表**【量·代码】：
  - 只走 canonical 发布（`publication.mjs` 的 `publishCanonicalPaperPublication`）：只写 `canonical_paper_publications`，外加 `versions/vN/` 和 `latest/` 的 ref。
  - C7 或 NCK1 导入（`publisher.mjs` 的 `publishPreparedPaperImport`）：一个事务里写 `sources`、`passages`、`question_groups`、`questions`、`options`、`tags`、`tag_links`、`question_group_topic_labels`、`paper_asset_versions`、`paper_import_runs`（validation 和 publish report，已审答案承诺、文件存储、PDF 产品都在 publish report 里）、`canonical_paper_publications`。文件写进 `versions/vN/`（paper-asset.json、answer-key.json、import-meta.json、analyses/、source-references-v1.json、pagination-plan.json、canonical/、frozen products、validation-report.json、publish-report.json），再整份换进 `latest/`。

## 给 Owner：真卷要满足的条件（所有按钮都亮）

真卷放在 `test-fixtures/paper-canonical/publications/real-papers-v1/store/`，用 `INVENTORY_STORE=` 指过去。每套卷：

1. **数据仓索引**：`store/publication.sqlite` 里有 `canonical_paper_publications` 表，每套卷恰好一行 `is_current=1`。`<paperId>/latest/canonical-paper-publication-ref-v1.json` 的 paperId、versionName、sourceAssetVersion、publicationDigest 和这一行完全一致。
2. **版本目录用 C7 布局**（`<paperId>/versions/vN/`）：
   - `paper-asset.json` 是 **paper-asset-v1**（有 `paper.paperId`、`content.blocks`、`content.groups`、`content.questions`）。封存源放在 `canonical/source-asset.bin`。
   - `import-meta.json`（import-meta-v1：`paper.year`、`region`、`paperName`、`sourceType` 取 真题/模拟题/自编题/校本题，可选 `month`、`defaultTags`、`groups.<id>.difficulty/summary/tags/displayTitleOverride`）。
   - `answer-key.json`（answer-key-v1）。
   - `canonical/` 下有 manifest、plan、question-groups、source-capture、normalization-report。plan 的 `slotBindings` 里 bound 的题组和 `content.blocks` 里的 group 块一一对应，否则整卷目录不收（`canonicalPaperCatalog.mjs`）。
   - 没有 paper-asset-v1 投影的（比如只有 DOCX，像 2025-i）进不了库。
3. **语法填空、应用文要能加进草稿卷**【推】：封存源和 `versions/vN/paper-asset.json` 必须是**同一份字节**（JSON 源），或者封存源是 DOCX（媒体类型 `application/vnd.openxmlformats-officedocument.wordprocessingml.document`）。ticket-26 外壳那种「投影 ≠ 封存源」的卷，这两类题组会坏。建议真卷入库前，把一套含语法填空、应用文的卷加进草稿卷试一次。
4. **大字完整版**：每套卷 plan 里 `listening.short-dialogue`、`listening.long-form` 两个槽位都要 `bound`。paper-asset 里有 2 个 `groupType: "listening"` 的题组，入库后 `question_groups.group_type='listening'`。草稿卷要选同一套卷的这两个题组。
5. **听力音频**：封存源里要有唯一的 `listening_audio_descriptor` 文档，manifest 里有 `listeningAudio`（`relativePath` 固定为 `listening/playback.mp3`，`mediaType: audio/mpeg`，`sha256`、`byteLength`、`durationSeconds`）。音频文件放在 `versions/vN/listening/playback.mp3`，sha256 和长度要对上。有 `listening/playback-ui-v1.json` 的也一起放。没有 publish report 的 `fileStorage` 时，服务端退回读这个静态文件【推】。
6. **纯答案版、答案 PDF（已审源参考答案）**，每套卷的当前版本都要有：
   - `versions/vN/source-references-v1.json`（按 `schemas/paper-import/source-references-*.schema.json` 校验通过）。
   - `versions/vN/publish-report.json`，里面有 `paperId`、`assetVersion`、`versionName: "vN"`、`canonicalPublicationDigest`（等于当前上线 digest），以及 `sourceReferencePublication`：`schemaVersion: "source-reference-publication-v1"`、`approvalId`、`revisionId`、非空 `paperName`、`bundleDigest`、`sourceDigest`、`candidateDigest`、`materializationDigest`、`sourceReferencesDigest`（等于 source-references-v1.json 的 sha256）。可选 `validation-report.json`。全量种子会把这两份照抄进 `paper_import_runs`。
   - 封存源里有唯一的 `nck1_source_materialization` 文档（或者 `nck1_analyzed_package_manifest` 加全部成员文档），重放出来的 digest 等于 `materializationDigest`。
   - 也就是说，要走过 Import Review 的「批准」，由正式发布器产出，不能手写。
7. **省纸版**：题组要够排满 8 页（整卷或接近整卷）。这是产品规则，不是数据问题。
8. 可选，让找题更好用：`public-search-metadata-v1.json`（话题标签、文体、字数）、`analyses/*.json`（摘要来源）。全量种子读到就照写。

## 风险
- `canonicalFullSeed.mjs` 复刻了 `publisher.mjs` 里没导出的 `upsertPaperAssetToDb` 和映射表。服务端改了这些，种子不会跟着改，要手动同步。
- 默认种子（不设 `INVENTORY_SEED`）下，整卷依然未上线，这是原来的行为，本次没改。
- 全量种子起站后，往草稿卷里加语法填空或应用文，会让当前草稿卷打不开（500），要删掉那一项才能恢复（见上面「还不能按」第 3 条）。
