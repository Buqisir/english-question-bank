# BUB-90 第一阶段实施规格：内容审查对象与构建兼容凭证

基线：`c42f8b649b8956dcd2383a9540f0dca0156fd808`。文件行号沿用该基线的只读核对结果；实施时重新定位。本文定义实施，不授权生产迁移、部署或发布试卷。

## 1. 目标与非目标

**Owner 批准的是卷的内容，不是网站代码。** 内容包括题目、答案、解析、图片与媒体、版面产品清单、冻结 PDF 字节，以及 Screen 实际消费的数据载荷（paperAsset、analysisSidecars、consumption）。前端题面组件、CSS、字体与已发布卷一样，由代码审查和 CI 把关；它们的变化不使待审卷作废。

- 使用目标服务端构建从封存输入重新派生内容，与原内容基准比较。内容相等保留原审查资格，不自动批准、不触发发布。
- 保留历史 rendererBuildId、revision、approval、preview 和已发布身份。不以恢复兼容为由重置 state、issue、request 到期时间或批准回执。正常业务状态迁移继续按原规则进行。
- 新增 `review_subject`、`review_compatibility`，兼容结果只追加。所有批准/发布入口使用统一内容判断。
- 不采集或比较 Screen 代码闭包，不设计 Screen 版本化，不要求旧 app/dist、旧 release 或旧运行环境。
- 不重渲染 PDF，不运行分页、OCR、ASR、AI 或浏览器；只核验原冻结字节和清单。
- 不放宽 Canonical admission、authority、Source Capture、Teacher Confirmation、媒体确认、权限、issue 和原子发布/journal。
- 本阶段自动兼容覆盖 finalized candidate 且有完整冻结产品的 revision；OCR 沿原流程。无冻结产品的历史 candidate 缺少本契约要求的内容证据，判 unknown，不自动恢复。
- #538 的前端标签/展示代码变化本身不再阻断；服务端重算载荷、Candidate 或产品内容实际改变才阻断。不能据提交标题推断每卷结果。

## 2. 数据契约

### 2.1 迁移方式及 DDL

基线没有编号式 migration runner。`server/import-review/importReviewStore.mjs:442` 的 `ensureShape()` 使用幂等建表和 `PRAGMA table_info`，初始化在 816–818。新增 `server/import-review/reviewCompatibilitySchema.mjs`，导出 `ensureReviewCompatibilityShape(db)`，由旧表就绪后的 `ensureShape()` 调用；标识 `review-compatibility-schema-v1`，不编造全库编号或修改 bank DB 的 user_version。

两表/索引在短 `BEGIN IMMEDIATE` 中一起创建，不做文件 I/O、历史扫描或回填；已有外层事务时不得嵌套 BEGIN。首次生产执行属于明确授权的 schema 扩展 Goal。

```sql
CREATE TABLE IF NOT EXISTS review_subject (
  revision_id TEXT PRIMARY KEY REFERENCES import_review_revisions(id),
  subject_version TEXT NOT NULL CHECK(subject_version = 'review-content-subject-v1'),
  origin TEXT NOT NULL CHECK(origin IN ('finalize','stored_evidence')),
  source_renderer_build_id TEXT NOT NULL,
  bundle_digest TEXT NOT NULL,
  identity_digest TEXT NOT NULL,
  consumer_digest TEXT NOT NULL,
  sidecar_digest TEXT NOT NULL,
  media_digest TEXT NOT NULL,
  products_digest TEXT NOT NULL,
  inventory_digest TEXT NOT NULL,
  subject_digest TEXT NOT NULL,
  subject_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_compatibility (
  revision_id TEXT NOT NULL REFERENCES import_review_revisions(id),
  target_build_id TEXT NOT NULL,
  comparator_version TEXT NOT NULL,
  attempt_no INTEGER NOT NULL CHECK(attempt_no > 0),
  subject_digest TEXT,
  bundle_digest TEXT NOT NULL,
  result TEXT NOT NULL CHECK(result IN ('equal','different','unknown')),
  reason_code TEXT NOT NULL,
  evidence_digest TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY(revision_id, target_build_id, comparator_version, attempt_no),
  CHECK(result <> 'equal' OR subject_digest IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_review_compatibility_lookup
  ON review_compatibility(revision_id, target_build_id, comparator_version, attempt_no DESC);
```

外键默认 NO ACTION，保留证据；不用 `INSERT OR REPLACE`。迁移验证 foreign_key_check。

字段及约束：

- `subject_version='review-content-subject-v1'`；`comparator_version='review-content-equivalence-v1'`。此前规格未实施，旧设计不是线上 schema，不需要为草稿设计编写迁移。内容范围、映射、允许差异或比较算法改变时升级 comparator；subject 形状变更另升级 subject/schema，不改历史 JSON。
- `source_renderer_build_id` 仅记录原 revision 身份，不参加与当前网站代码的比较。
- `origin=stored_evidence` 表示从原服务端记录及封存文件提取，不表示用当前代码补造旧结果。两种 origin 使用完全相同的内容契约。
- 各 digest 用 `sha256:<64 lowercase hex>`。JSON 用 `digestJson`；文件用流式 Node crypto SHA-256。subject_json 保存具名内容对象/摘要和文件描述，不重复保存 PDF、音频、源文档二进制；上限 8 MiB，超限 unknown，不截断。
- provenance_json 记录原 preview payload_digest、manifest/证据摘要、提取器版本、采集来源；不含 Secrets。时间及操作人不参与内容 digest。
- `subject_digest=digestJson({subjectVersion,revisionId,sourceRendererBuildId,bundleDigest,components})`；原始缺省采用明确 null，数组顺序保留。
- target_build_id 标识执行服务端比较及发布的目标代码/运行输入，见 3.2；它是缓存命名空间，不是 Owner 批准的对象。
- 逻辑键是 revision × target build × comparator；attempt_no 为追加尝试序号，读取最新有效 attempt。无记录为 unknown/NOT_CHECKED。
- subject 每 revision 只 INSERT 一次。equal 必须匹配唯一 subject/bundle。无 subject 的 unknown 可以 subject_digest=NULL。
- evidence_json 记录目标分项摘要、差异 JSON pointer/文件路径、错误分类、资源指标及发布映射版本，不记录完整题文；evidence_digest 校验该 JSON。
- 完整且不可变输入上的 equal/different 为终态。unknown 可在证据补齐或瞬态故障消除后追加尝试；不得覆盖。终态重算矛盾或封存文件被篡改是完整性故障，立即拒绝读取/发布，不能继续使用旧 equal 或选择有利结果。

### 2.2 内容 subject 的精确定义

目标计算复用 `server/import-review/revisionProjection.mjs:1660` 的 `buildNck1ReviewProjection(root,{requireAnalyses:true,expectedCandidateDigest})`，`finalizeComputation.mjs:11`，store `assertProjectionIdentity:1116`。原基准则只从持久记录和与 manifest SHA 相符的封存文件提取；两条路径必须分开，禁止以目标计算结果填入原基准。

1. **identity**：原 revision/manifest 的 paperId、reviewKind、importProfile、sourceDigest、candidateDigest、visibleStructureDigest，以及该 profile 要求的 analysisDigest 或 paragraphSummariesDigest/publicSearchMetadataDigest。必要字段缺失即 unknown；profile 合法的“不适用”明确为 null，不能把缺字段当 null 放行。保留原 bundle/manifest 摘要。
2. **consumer**：完整旧 `import_review_product_previews.payload_json`，精确包括 paperAsset、analysisSidecars、consumption；校验 payload_digest、revision_id、bundle_digest、renderer_build_id 与原 revision 的绑定。抽出 store `saveProductPreview:1568–1582` 为纯 `buildProductPreviewPayload(revision,projection)`，目标代码生成同形 payload 后完整比较。题目/答案/解析、header/sourceType、选项与顺序、projectedOccurrence、媒体描述、听力 duration/segments/url 全部参与。同 revision URL 应完全相等，不泛化删除。原 payload 某必要嵌套字段缺失/形状不受支持，unknown。
3. **sidecar**：原 manifest 中所有非产品/非媒体输入的有序 `{path,role,mediaType,byteLength,sha256}`，以及经 hash 校验的配置、analysis、段落摘要、检索 metadata、sourceReferences、OCR correction、listening review、paginationPlan 等 JSON 内容。完整文件 inventory 兜住新增角色，不依赖有限文件名白名单。目标仍执行当前验证器及已持久化的派生摘要校验；不得仅看文件名相同。原始文件内容相等不意味着所有目标派生物自动相等，派生的展示内容必须同时落入 consumer 比较或第 5 节的发布内容映射。
4. **media**：原 manifest 的媒体/原图/candidate 图/源图页/音频及分段文件描述和已核验字节，以及原 preview 中的媒体描述、presentation/选择结果、听力数据。媒体确认回执沿用原身份 guard（store:1156），不得仅比较 mediaId。原 preview 未保存的纯诊断 mediaDerivations 不冒充历史展示基准；若发布必须使用未被原 payload、封存 sidecar 或媒体确认绑定的新选择，unknown。
5. **products**：原 `products/manifest-v1.json` 的原始 hash、完整解析内容、inputDigest，以及每个产品 edition/path/mediaType/pageCount/sha256/byteLength 与 PDF 实际字节。集合通过 `manifestProductFiles` 解析，不假定总有四款；无听力产品有独立 schema。复用 `frozenProducts.mjs:29,41` 的输入/清单规则。增删产品、PDF 任意字节变化均 different。
6. **inventory**：完整原 manifest.files 与 import_review_files 记录逐项一致，按 POSIX path 码点序排序并核验所有文件字节。目标 inventory 用 `reviewBundleFilePathsForProjection:593` / `finalizeInventory`，新增/删除/角色变化均不得略过。禁止重复路径、symlink 逃逸、非标准相对路径。

**完整 Canonical、Source Capture 内部表示、normalizationReport 和完整 publish package 不再作为必须与旧值相等的 subject component。** 原系统未完整保存它们，而且 Owner 批准的是内容。新 revision 也使用同一规则，不形成两套批准标准。它们仍须通过当前严格 admission 与来源绑定；诊断信息可以写入本次 evidence，但不得反过来作为下一次的“旧内容基准”。正式发布的实际内容必须映射回以上基准，不能因删掉旧 canonical_digest 就允许任意发布对象。

相关函数位置：`buildNck1ReviewConsumption:1163`、`buildNck1CompatibilityPaperAsset:1268`、`buildNck1CompatibilityPackage:1538`；projection 构造 compilation:1672、analysis:1697、metadata:1707、source refs:1713、pagination:1733。比较使用 `shared/paper-canonical/stable.mjs:5` 的规范化 JSON，不比较 JSON 文本键序；文件仍比较原字节。禁止递归删除名为 digest/version/timestamp 的字段或把数组改成集合。

## 3. 比较器、构建身份与 worker

### 3.1 输入、输出及判定

新增 `reviewSubject.mjs`（证据提取/目标内容提取）、`reviewCompatibility.mjs`（纯比较）、`reviewCompatibilityStore.mjs`、`reviewCompatibilityWorker.mjs` / `runReviewCompatibilityWorker.mjs`。

输入：原 revision、原 preview 和 manifest 证据、唯一 subject（若已有）、封存目录、目标服务端 build descriptor、CAS token。输出：
`{result,reasonCode,subjectDigest,targetBuildId,comparatorVersion,componentDigests,differences,metrics}`。

顺序：

1. 校验服务端目标身份、原记录绑定和证据完整性；已有 subject 必须与原持久证据一致。
2. 以目标构建读取封存输入、执行当前验证并提取完整 payload、identity、inventory、sidecar/media/products 内容；所有必需项逐项相等才 equal。
3. 完整可信的内容/摘要明确不同 => different/SUBJECT_CHANGED；读取成功而文件 hash 不同 => different/SEALED_FILE_CHANGED。损坏的原记录自相矛盾不能作为可信基准，unknown/BASELINE_UNTRUSTED，并按完整性错误封锁。
4. 缺必要证据、无冻结产品、原 payload 不支持、旧 authority 不可执行、无法映射的新增发布内容、I/O 异常、超时/OOM、无法完成计算 => unknown。Candidate 成功派生且摘要确实不同 => different；编译失败没有完整对象 => unknown。
5. 不比较前端组件、CSS、字体、旧新代码 hash 是否相等；代码变化只可能引发目标命名空间改变和重新计算，不直接决定 different。
6. 每次针对原 subject 比较，不用 A≈B、B≈C 传递推导。新 finalize 在同一事务保存 preview/subject 后可写 self equal；旧 revision 即使 renderer ID 恰好相同仍须满足内容证据契约。
7. missing 必需项不得用新值补齐；profile 明确不适用的字段不算缺项。新增消费字段不是默认忽略项：若目标完整 payload 多一个字段，按内容不同处理。

### 3.2 目标构建身份

保留 `api.mjs:93–123` 旧 renderer hash 算法及 `rendererBuildIdProvider.mjs:4` 的历史语义；兼容资格不再依赖它。不建立 Screen closure、浏览器依赖解析器或 Screen release manifest。

新增 `reviewBuildIdentity.mjs`，为当前不可变服务端 release 生成/读取一次 `review-target-build-v1` fingerprint：

- 输入：`server/**`、`shared/**`、`schemas/**`、各服务端 package/lockfile、实际读取的 registry/config/prompts，以及 Node 版本和影响投影/发布的非秘密运行配置。
- 每项 `{repoRelativePosixPath,sha256,byteLength}` 码点排序，连同运行配置做 digestJson。当前 server tree 包含 answer-renderer、publisher、review projection，避免旧 hash 漏项。依赖安装须受锁文件及现有可信部署流程约束。
- 不含 app/src、app/dist、CSS、字体或只服务前端的工具配置；shared 目录可保守全纳入，纯共享 UI 文件变化最多触发重新比较，不会直接作废。
- 不含原 DB、上传、日志、Secrets。运行数据另由每次 subject/文件检查绑定。服务端读取清单外可变代码/配置时须补齐 fingerprint，不能复用旧凭证。
- 使用部署的不可变 release 路径和同一目标 descriptor；生产初始化缓存一次，开发文件变化重新计算。调用者提供的任意 build label 不能代替此身份。
- 无需旧 release fingerprint。新旧 source_renderer_build_id 不相等也完全可以得到 equal。

### 3.3 资源与调度

- 全主机 compatibility job 并发 1，使用独占调度/leader，不能仅靠单进程 boolean；多进程 leader 不明则不启动扫描。
- 在 worker_threads/子进程计算，初始 heap 384 MiB、每卷 deadline 120 秒、每批最多 5 卷、卷间至少 1 秒让步；finalize/promotion 活跃时暂停新 job。数值待真实 fixture 测量，不声称已压测。
- 不调用 Chromium、分页或 renderer。`readFrozenProducts:78` 原来会跑 pdfinfo；新增只供封存比较的内部读取 seam，依据已 finalize 的原清单与相同 PDF 字节复用既有页数验证，不重复 pdfinfo。首次 finalize 保留原完整验证，不提供公共“跳过校验”开关。
- 大文件逐项流式 hash；不跨 worker 传 PDF/音频，不缓存多卷 projection。现有构造仍可能加载大对象，超限 unknown，不转主线程执行。
- API 列表/批准只读凭证并排队，不同步重建。启动扫描 latest candidate 的 awaiting_review/changes_requested/approved，忽略 superseded 和已有 publishing 操作。
- 瞬态 unknown 最多自动重试两次（30 秒、5 分钟调度），证据缺失不热循环。pending 不改变审查状态，也不触发自动重送。

## 4. 守卫替换与 CAS

统一 `getReviewCompatibility(db,revision,targetDescriptor)` 和事务内 `assertReviewCompatible(...)`；仅 equal 可批准/开始发布。保留旧 `IMPORT_REVIEW_RENDERER_STALE` 错误码兼容客户端，增加结构化 reason，含义转为内容兼容尚未成立。历史身份校验与当前兼容判断不能混为一谈。

基线完整 renderer 判断清单（store 均为 `server/import-review/importReviewStore.mjs`）：

| 位置 | 修改 |
|---|---|
| store:185 | approval.rendererBuildId == revision.rendererBuildId 保留；听力 publication proof 入口另查当前兼容 |
| :921 | 同 bundle 重用：uploading 保留；finalized 仅重用 latest、非 superseded、exact equal 的 revision；保留 expectedBaseRevisionId |
| :1433–1434、1505–1508 | list/detail rendererStale 从 compatibility != equal 派生；批量查凭证，不在列表重建 |
| :1600–1601 | prepareProductPreview 不凭当前 renderer 拒绝；已有原 preview 验证后只读保留。历史缺 preview 不得用当前代码填充来获得 equal，返回 MISSING_BASELINE |
| :1625 | preview/revision 历史 renderer、bundle、payload_digest 绑定保留；不以代码变化阻止查看原封存 payload |
| :2047–2051 | approve 改事务内 assertReviewCompatible |
| :2053 | request.renderer == 当前 改成 request.renderer == revision.renderer 的历史绑定 + 当前兼容；保留 expiry/state/approval |
| :2374 | assertCurrentApprovedRevision 改统一兼容判断，原身份/issue/文件检查保留 |
| :2633 | registerPublicationRequest 事务内查兼容；request 仍存原 revision renderer |
| :2680、2735 | grant/beginScopedPromotion 保留 request 对 revision 的历史绑定，并由共享入口查当前兼容 |
| :2968–2972 | agentPaperStatus 派生兼容状态；原 approval 数据保留，不把 unknown 暴露为可发布 |
| :3023 | acquireShippingGuard 事务内查兼容 |
| singlePaperPromotion.mjs:380 | input.rendererBuildId == revision.rendererBuildId 保留；detail/事务都使用兼容结果 |
| api.mjs:93–123、rendererBuildIdProvider.mjs:4 | 保留旧身份算法，另注入内容比较用 targetDescriptor |

无直接 renderer 判断但须接入的入口：

- `projectionForRevision:1551` 当前代码动态重建：对 candidate 使用兼容 gate；内部 comparator/finalize 使用单独只读构造入口，避免递归依赖。OCR 原流程不变。
- 原 `productPreviewForRevision:1615`、routes consumption:801 / asset:1028 可以在 unknown 时提供**已校验的原缓存载荷**，以新前端代码显示。它们不是目标重算结果，页面须显示“尚未完成内容核验”，不能据可查看放行批准。原 preview 缺失不能借 GET 补造。
- routes candidateProjectionForRevision:139、teaching:670、media:811、source-visuals:857 等：读取封存原件的分支继续可读；实时派生内容的分支必须 equal 或返回明确未核验，不能把新派生内容伪装成原基准。
- `/products:1050`、`/pdf?edition:1124`、`/print?edition:1096`、`/files:1162` 保留原件 hash/auth 检查，unknown 时也可只读看原冻结证据。
- 无 edition 的动态 Print/PDF（1100/1135）不属于冻结审查证据，不能作为批准/兼容证明；只在当前内容兼容成立后按既有代码能力提供，**不得再以 renderer hash 不同拒绝**。无冻结产品历史候选因缺本契约证据仍 unknown。后台比较不调用这些接口。
- `import-ops/lib/probe.mjs:45,274,461,709,736`、`public/app.js:452,883,900,914` 区分 pending/unknown/different，不持久写成 changes_requested 或自动启动重送。
- prepareProductPreview 的已有缓存早返回可保留只读语义，但必须验证旧缓存身份；不得隐式构造 missing baseline。新 uploading revision 的首次 finalize 正常生成并原子封存 preview。

CAS：

1. 计算前读取 revision/bundle/state/updatedAt、latestRevisionId、approvalId、preview payload_digest、manifest/files inventory 摘要、subjectDigest 和 targetDescriptor，释放 DB。
2. worker 只读计算；短 `BEGIN IMMEDIATE` 内重读全部 token。不同、shipping guard 已出现或目标已切换则丢弃本次提交/重新排队。issue/媒体确认按相关记录摘要或同事务复核，不能只依赖 revision.updatedAt。
3. subject 用条件 INSERT 绑定 exact revision 和证据；已有 subject 只核对不覆盖。兼容 attempt 在事务内取 MAX+1 并 INSERT；冲突重读，终态矛盾封锁。
4. approve/request/grant/beginPromotion/shipping guard 在原 BEGIN IMMEDIATE 内读 equal，再验证 latest/state/issues/approval/request。条件 UPDATE 绑定预期 state/updatedAt 或同一写事务重读，并检查 changes=1。
5. 发布前还要核验实际对象与原证据。文件在读取时再次 hash，不能让已缓存 equal 兜底篡改。部署排空旧 worker；旧目标结果不能写成新目标凭证。

## 5. promotion/publisher 发布前实际对象核验

链路：`singlePaperPromotion.execute:197` → projection:215 → materialize:231 → publish:308；publisher projection:1252 → package:1361 → admitPackage:1394 → prepared:1495/1613 → onPrepared:1631 → writeVersion:1643。

新增内部 `approvedReviewSubject` 与 `assertPreparedReviewSubject` 能力/回调，不能由 HTTP 参数伪造：

1. beginPromotion 在事务内查 equal、approval/issue，并持有原 shipping guard，绑定 subjectDigest/targetBuildId/comparatorVersion，不改旧 approval。
2. execute 从封存输入重建内容，先与原 subject 比较，再进行 archiveReviewFiles:221。归档异步返回后重读 guard/目标并再校验。
3. publisher 自己重建的 projection 必须生成完整同形 payload 并比较，不能只信 execute。原 inventory、字节、source refs、pdf approval/fileStorage 检查（1266–1314）全部保留。
4. **不要求正式 compilation 与缺失的历史 Canonical/normalizationReport 完全相同。** 对实际 admission.compilation 调用 `buildNck1ReviewConsumption`，应用与 preview 相同的 header/sourceType/听力 decorator，组成同形消费载荷，再与原 payload 比较。实际 admission 的当前来源验证、authority、全部 consumer contract 仍必须通过。这样挡住“preview 没变、正式编译却改变题目”的反例。
5. 直接核验真正 `admission.consumers` 的内容，不只检查重新投影的理论结果：selections、可见结构、选项/顺序、mediaArtifacts、header/sourceType、听力内容等必须与原 payload 对应。publication envelope 中 sourceAssetVersion/publicationDigest、发布音频 URL 等允许通过**逐字段映射**转换；转换值必须绑定真实 sealed.manifest、目标版本、音频 SHA/长度/segments。sourceAssetDigest 必须绑定真实入库 source。禁止删除所有 digest/version/url 字段后比较。
6. 新增 `reviewPublicationContent.mjs` 的显式映射契约 `review-publication-content-v1`，覆盖实际 package/writer/DB 的内容：paperAsset、answerKey、各 analysis 对应原 preview；源参考答案、分页产品、媒体选择对应已校验的封存 sidecar、产品和确认回执；paper/importMeta 的源事实对应 config、已保存 metadata/analysis。原 payload 不含的 title/summary 等派生展示字段，必须能逐字段证明与这些已存内容对应，不能用“当前函数重算两次一样”代替历史依据。
7. sourceReferenceApproval/pdfProductApproval/fileStorage 等运行身份绑定 exact approval/revision/bundle/文件集合；pagination canonicalSourceDigest 绑定 admission。技术索引、分配的数据库 ID、诊断报告可随代码改变，但须具名标注为非内容映射，不得把题文、答案、媒体选择或展示 metadata 归入此类。
8. 若某 profile 存在实际发布内容既不在原 payload 中、也不能从已存源事实直接建立上述映射，则 unknown/UNSUPPORTED_PUBLICATION_MAPPING，不默默忽略。此映射是实施 A/C 的交付项，必须对真实 profile fixture 列出完整字段覆盖；不是留给实现者现场猜测的宽泛 normalize。
9. 真正 admissionResult/version 选好后、onPrepared/writeVersion 前执行现场比较；版本变更重新 admit 路径也检查。worker equal 表示保留内容审查资格，不保证所有当前 admission 都成功；发布失败可以是当前合规/契约错误，不能改写成自动重新批准。
10. 已 committed promotion 的补录先读既有 target/journal 做 reconciliation，不因新构建重新发布；新写操作依旧需要当前资格。已知拒绝且未写资产时按原失败协议处理；未知异常保留 guard/journal，不一概释放。保持 ADR-0020 两阶段恢复协议。

实际写出的冻结 PDF 必须与原 subject 字节相同。不能比较过一个对象后再读取另一份未验证文件；经检查的 snapshot/字节直接交给 writer。代码变了而内容完全相同可以发布，代码没变但内容不同也必须拒绝。

### C 实施的实际发布字段覆盖

下表为 `review-publication-content-v1` 的穷举规则。A = 内容相等；B = 明确的运行 envelope/技术派生；C = 无法证明映射，返回 `unknown/UNSUPPORTED_PUBLICATION_MAPPING`。B 不是按字段名全局删除：只在具名位置执行转换，剩余完整对象仍比较。`preparedReviewContent.mjs` 同时核验实际 compilation 的消费投影、`admission.consumers` 和从实际 writer 的 `sealed` 字节重新加载的 consumers；三者任一不等都拒绝。

| 实际字段/写出物 | 类别 | 原基准与精确规则 |
|---|---|---|
| `paperAsset` 全部字段（paper、sources、layoutTree、content、answerKey、analysis） | A；两项 B | 完整比较原 preview；仅 `paper.assetVersion` 可为实际目标版本、`paper.status` 可为 `published`，映回原值。标题、sourceType、题文/选项/顺序/答案不改写 |
| 独立 `answerKey` | A + B | schema/paperId、完整 answers 等于原 asset；`sourceAssetVersion` 仅原版本或实际目标版本 |
| 六个 `readingAnalysis/scAnalysis/clozeAnalysis/grammarFillAnalysis/writingAnalysis/listeningAnalysis` | A + B | 对应原 preview 的六个具名 analysisSidecars；非 writing 的顶层版本、四类客观题 teachingContent 版本只按 writer 的规则转换；其余全量相等。合法缺项必须两侧均缺 |
| `paragraphSummariesBytes/publicSearchMetadataBytes/sourceReferencesBytes` | A | 对应三个具名封存 sidecar 的原字节 SHA；不适用时两侧均缺 |
| `paginationPlan` | A | 等于封存 `pagination-plan.json` 的完整 JSON，缺失对应 null |
| `frozenProducts.manifest/digest/bytes` | A | 顶层仅这三键；完整原 manifest、manifest 原 SHA；bytes 路径集合完全相同，清单和所有 PDF SHA/长度逐项相等；writer 直接使用已核验的这些 bytes |
| `importMeta.schemaVersion/paperId` | B | 固定 `import-meta-v1`，paperId 等于 subject |
| `importMeta.sourceFileName/sourceFileSha256`、package `sourceAssetDigest` | A + B | 封存 universal source manifest 中选中的首个 `question_source/question_and_answers` 文档，或 analyzed package 的 `content` member；文件名仅 POSIX basename，后两项仅移除 SHA 的 `sha256:` 前缀；必须绑定 inventory 的实际 SHA/长度 |
| `importMeta.sourceProvenance` | A | 仅 external analyzed package 存在，完整等于原 preview `paperAsset.sources.provenance` |
| `importMeta.paper` | A + B | year、region/source、paperName、sourceType、defaultTags 直接取封存 config；month 取已封存产品 examDate；examCode 仅移除 `paper-`，subject 固定 English，默认 tags 为 `[sourceType,String(year)]`。缺少可证明的年份等源事实则 C，不用当前推断补旧事实 |
| `importMeta.groups` | A + B | 只生成原 asset 中已有且有对应原 analysis 的四类客观题组；summary 为原 analysis overview → 原 group.title → 固定题型名，displayTitle 为原 title → 题型名，difficulty 固定中、tags 固定对应题型名；完整比较结果 |
| `paperHeader` / `sealed.manifest.paperHeader` | A + B | 完整等于封存 config 的明确 `headerTitle` 与 provenance.paperName；沿既有 subject-free title 验证；同时对应原消费载荷 header，不允许现场重新命名 |
| `sourceReferenceApproval` | B | schema、paperName、approvalId/revisionId/bundleDigest/sourceDigest/candidateDigest、sourceReferencesDigest 全部 exact；materializationDigest 绑定本次已严格验证的实际 materialization，是运行身份而非新的历史内容基准；源答案内容另由原 bytes 比较 |
| `pdfProductApproval` | B | exact 原 approval/revision/bundle，manifestDigest exact 原产品清单 SHA |
| `paginationPlanBinding` | B | schema/paper/source/candidate/planDigest exact；canonicalSourceDigest 绑定本次实际 admission 的 source；writer 只增加实际 sourceAssetVersion |
| `fileStorage.schemaVersion/bundleDigest/files/reviewManifest` | B | 固定 schema、exact bundle；文件路径集合、每项 sha256/byteLength/mediaType 全部等于原 inventory；reviewManifest descriptor 绑定真实 approved manifest 的 `JSON.stringify(manifest)+"\n"` 字节 |
| `fileStorage.store` | B | 允许本次归档返回的 `local` 或 `r2:host/bucket` 存储位置；不是内容，不要求与历史存储位置相同；存储上传/读回与完整 descriptors 的原守卫保留 |
| 实际 `consumption` 中题文、selections、visibleStructure、mediaArtifacts、authority/profile、diagnostics 等其余全部内容 | A | 完整等于原 consumption；完整 compilation 不是旧基准，但由实际 compilation 重投影出的内容也必须相等 |
| consumption `sourceAssetVersion/publicationDigest/sourceAssetDigest` | B | 版本和 publicationDigest exact 实际 sealed manifest；真实 `sealed.sourceAsset` 字节必须等于封存 manifest 明确指定的 materializationPath 或 external content 文件，再映回原 Review source digest；不接受任意 caller digest |
| consumption `consumerContractRef` | B | 每个实际 consumer 必须先匹配已注册的该 consumer contract，随后只把 Print/Screen 的执行身份映到原 Screen ref 以比较同一内容；不忽略 selections 差异 |
| `paperSourceType/paperHeaderTitle` decorator | A + B | admission 的内存 candidate store 没有 compatibility asset 时，从实际 package 的已比较 sourceType、sealed header 补入；已存在的值不覆盖，必须原值相等 |
| `listeningAudio`、`sealed.playbackDerivatives` | A + B | 原音频 SHA/长度/mediaType/duration/relativePath/segments 全部相等；URL 仅允许 exact `/paper-assets/{paperId}/versions/v{version}/{relativePath}` → 原 revision URL；唯一 UI derivative 的完整 `{playbackAudioSha256,durationSeconds,segments,digest}` 必须绑定原 preview；不接受新增 derivative 文件 |
| 听力 occurrence `firstSectionPlayback` 及对应 digest | B | 仅原 preview 省略、正式 occurrence 明确 `twice_default` 的 short-dialogue 默认值可消去；先验证实际 occurrence digest，再仅重算该项映射后的 digest。`once_explicit`、其他题组或其他内容改变不归入 envelope |
| writer `import-meta.paginationPlanBinding`、normalized-groups、DB 检索/关联索引 | B | 仅从以上已比较 package/实际版本按现有 writer/DB 函数派生，并保留当前 normalization/DB/admission 验证；索引、分配 ID 不作为旧内容基准，题文/标题/答案/解析仍由上列字段覆盖 |
| writer 完整输出路径及 `sealed.artifacts/sourceEvidence/playbackDerivatives` | A + B | 比较器与 writer 共用纯函数 `buildPaperImportOutputInventory`，列出 package、派生物、raw/figures、reports、Canonical 和 source 的全部路径、来源及复制后的字节。artifacts/sourceEvidence 必须与 manifest 描述符完整对应（含独立音频），逐项 SHA/长度相等；playback 仅允许具名 UI 文件并核验其内容摘要及音频绑定。额外路径、缺项、跨集合/覆盖 package 的冲突、文件与目录前缀冲突均在创建 staging 前拒绝；同时拒绝大小写/Unicode 路径别名。最终比较只从这份清单重载 consumers，writer 复核清单后只写清单项且使用 `wx`，不再遍历任意 sealed 对象写盘。reasonCode 为 `UNDECLARED_PUBLICATION_OUTPUT`、`MISSING_PUBLICATION_OUTPUT`、`PUBLICATION_OUTPUT_PATH_CONFLICT`、`PUBLICATION_OUTPUT_DESCRIPTOR_MISMATCH`、`INVALID_PUBLICATION_OUTPUT_PATH` 或 `PUBLICATION_OUTPUT_INVENTORY_CHANGED` |
| 实际 `publishReport` | A + B | exact paper/version/publicationDigest 与前三个批准/存储对象；仅 `generatedAt`、旧 `searchHref` 为具名非内容诊断，要求字符串而不比较历史值；新增 report 字段 C |
| validation/publish diagnostics、生成时间、journal 临时路径、数据库分配 ID、Canonical/Source Capture 内部表示和 normalizationReport | B | 不是原内容 component，不要求旧字节相同；已有当前严格验证与 journal 恢复仍执行。`publicValidation.readingGroups` 是已比较 asset 的组号/题号/标题索引，不能携带另一份题文 |
| 新 package 字段、未知身份回执键、无法从原 preview/封存源事实证明的实际内容 | C | 立即 unknown 并拒绝；不通过递归删除 digest/version/url、整对象忽略或两次当前重算放行 |

C 的内部锁入口为 `store.withPromotionContentGuard`：持有既有 shipping guard，在 `BEGIN IMMEDIATE` 内复核当前 approved/latest、旧 renderer 守卫、issues、文件、subject 和目标 equal。第一次捕获 subjectDigest/targetBuildId/comparatorVersion 及 revision/paper/preview/files/confirmations/issues/guard token，异步归档期间不持 SQLite 事务；归档后必须匹配该 token。最终 `onPrepared` 先保存不可变目标，随后再次在该 Review 事务内检查实际目标，并包住同步现场比较、writer/journal 与 bank DB 提交；不引入跨 SQLite 的伪原子承诺。比较器明确证明尚未执行 writer 的拒绝沿原 `markPromotionFailed` 记录失败并释放该 guard；竞态、I/O 或响应丢失等未知异常不带这个证明，保留 publishing/guard/evidence。提交后 Review 回执丢失沿原 target/journal reconciliation 补录，不创建第二个版本。

本步保留全部旧 renderer 判断。`beginPromotion`/scoped begin 的资格入口由 D 再统一切换；C 在 guard 已取得之后额外要求 equal，不能单独宣称跨构建发布已恢复。新增 `scripts/verify-review-publication-content.mjs` 使用真实 native NCK1 听力 profile 的自编 fixture，完整六类 analysis、源参考答案、四份冻结 PDF 和 header；不使用生产数据、浏览器或远端服务。

## 6. 历史 revision 回填与无需重送恢复

### 6.1 可信性结论

**Owner 新规则下，原服务端 preview 载荷、既存身份摘要、完整 bundle/文件 SHA、产品清单与冻结 PDF 字节，是充分且可执行的内容审查基准。** 它们证明当时提供给 Owner 的内容，不证明 Owner 实际看过每一页；是否已批准仍由原状态/回执决定。无需恢复旧代码或证明旧前端显示像素一致。

回填步骤：

1. 读取 finalized revision 及原 `import_review_product_previews`。验证 payload_digest 自洽、revision/bundle/历史 renderer 绑定正确，profile 所需字段齐全。
2. 验证 manifest/bundleDigest、DB inventory 一致，逐文件对 SHA/长度；解析原产品清单、sidecar 和媒体确认，检查 frozen PDF 字节及产品 inputDigest。
3. **只用上述已存证据**构造原 subject（origin=stored_evidence）；缺必需证据不写一个“完整 subject”。已有可信完整基准可以保存，即便随后目标比较 different。
4. 用当前目标服务端从封存输入重算 identity、同形 preview payload、inventory 和内容分量，逐项比较；全部相等 equal，明确不同 different，任一必要项缺失/不可计算 unknown。
5. CAS 追加 subject/compatibility，不改原 revision、旧 preview 或 approval。不得“先补 preview 再比较自己”，不得把新增当前派生字段当成历史已存字段。

### 6.2 原来没有的 component 怎样处理

| 历史缺项 | 新契约处理 |
|---|---|
| 完整 canonicalPaper、Source Capture 内部 JSON、normalizationReport | 不是恢复审查所需历史 component，不伪造/回填。当前 admission 仍校验来源与结构；实际发布的内容投影回原 payload/封存内容 |
| 完整旧 publish package | 不要求旧 package hash；实际 writer 内容逐字段映射到原 payload/封存 sidecar。无法建立映射的真实内容字段 unknown |
| 旧 Screen/CSS/字体/原 release | 不属于 Owner 内容基准，不需要也不比较 |
| 原 preview、必要 identity digest、产品清单或某冻结文件 | 属于必需证据，缺失 unknown；当前重算不能补作旧证据 |
| profile 明确不适用的 sidecar/听力产品 | 合法 absence，按该历史 profile 契约处理，不强制凑齐四份产品 |
| payload 以外曾实时展示的诊断/原件入口 | 原件绑定 bundle；非内容诊断受代码审查。新的题文、解析、媒体选择不能借“诊断”绕过原 payload/sidecar |

判断不能退化为“candidateDigest、visibleStructureDigest 一样就 equal”：必须同时比较完整 preview、所有封存内容及 PDF。既存证据自相矛盾先封锁调查，不能择一采信。

### 6.3 能否让旧卷恢复

**可以。** 历史记录完整且目标重算内容相同的 revision，在第一阶段上线后可无需重送恢复可用；代码、CSS、字体改变不再阻断。保留原 awaiting_review/approved 状态；changes_requested、有 unresolved issue、过期 request 不因 equal 获得发布资格。

不承诺约 29 套都 equal：本任务未读取生产 DB，而且它们正在重送；worker 只处理 latest，不能恢复 superseded。以后具备同样证据的旧卷可走这条自动恢复路径。上线盘点应统计 preview/必要摘要/封存文件完整性及 equal/different/unknown，不再盘点旧 release 是否保留。

可提供 `scripts/backfill-review-subjects.mjs` dry-run 诊断入口，默认只读本地指定 DB/封存目录，复用 worker 比较器；写入走授权维护入口和 CAS。不需要导出旧运行环境，不将试卷原件或题文写入仓库/日志。

## 7. 分步实施、验收和部署顺序

步骤共享契约及 store/publisher，串行实施。可分别提交/合并；正式 Ship 遵守当前 high-risk 持久化/发布 gate，自然 CI Full/E2E 和独立审查。下表为要实现的验收，不代表已执行。

| 步骤 | 文件与交付 | 验收重点 |
|---|---|---|
| A | reviewSubject/reviewCompatibility/reviewPublicationContent、纯 preview payload 提取；verify-review-compatibility | 完整旧证据可建基准；旧新同内容 equal；题文/答案/解析/顺序/header/媒体/PDF 任一改变拒绝；缺证据 unknown；Canonical 诊断变化不误伤 |
| B | schema/store、finalize 原子写 preview+subject+self equal、后台 worker/目标 provider、dry-run 诊断 | 幂等迁移、事务回滚、重复 finalize、CAS、终态不可覆盖、历史原行不变、资源和 pending 状态 |
| C | singlePaperPromotion/publisher、实际 admission/writer 内容映射 | preview 不变而正式 admission 改题必须阻断；正常版本 envelope 不误伤；未映射内容 unknown；异步归档竞态、crash recovery 不重复发布 |
| D | store 全守卫、api/provider、routes 和 probe 接线 | 所有 approve/request/grant/shipping 路径一致；同 renderer ID 的不同目标不复用；旧 preview 可看但不能绕过资格 |
| E | owner-review.js、app.js、verify-import-pagination-ui | pending/unknown/different 禁用批准发布；equal 保留原状态；新 CSS/字体/前端代码不会产生 stale；原权限/CSRF 不变 |

现有测试面：`scripts/verify-scoped-publication.mjs`、`verify-import-review-bundle-reuse.mjs`、`verify-import-review-finalize-worker.mjs`、`verify-public-paper-review-consumer.mjs`、`verify-import-review-file-hash.mjs`、`verify-import-review-media-derivation.mjs`、`verify-import-review-teaching-route.mjs`、`import-ops/verify.mjs`。替换旧“任何 renderer 变化皆 stale”断言，保留防内容变化及权限检查。

并发矩阵：

- worker 计算时新 revision finalized：旧结果不能放行新 revision，superseded 不恢复；
- issue/媒体确认/批准在计算期间变化：CAS 或业务事务拒绝，不覆盖 Owner 状态；
- 两 worker 同 revision/target：单一 subject，终态不冲突；
- approve/request 期间到期或 supersede：事务失败；
- A 构建 worker 在 B 启动后返回：不能写作 B 凭证；
- promotion guard 阻止新的 finalize/issue 按原规则突入；
- 缓存 equal 后文件篡改：读取及发布现场 hash 拒绝；
- worker timeout/OOM/exit：unknown，API 继续响应；
- 新增 payload 字段或实际 writer 内容未被映射：拒绝，不因“都是同一构建”跳过；
- 前端/CSS/字体只改代码、服务端载荷不变：批准资格保留；服务端输出变化即使前端没变也拒绝。

### 分步部署的修订结论

**不再要求所有实施步骤一次性部署，但全部资格守卫与发布前复核必须在同一启用边界切换。** 去掉 Screen 阻断没有自动删除旧代码的 renderer guard；过渡版本是否会误失效仍需实际检查。

允许两段部署：

1. **Additive/shadow**：仅加 schema、旁路 helper、target provider、worker 和 subject 采集，旧权限保持保守，尚不以 equal 放行。可单独部署，但必须确认没有改变 `actualRendererBuildId:94–107` 覆盖的文件；例如 helper 放 `server/import-review` 新文件可行，而提前改 revisionProjection/shared/app/src 会改变旧 hash。若 shadow 必须改这些路径，就合并到第二段，不宣称它不会影响待审卷。此段也需迁移授权。
2. **统一切换**：C/D 全部守卫、实际发布映射及必要 UI 状态处理一并启用；从此内容等价为唯一跨构建资格。可预先生成目标构建凭证降低 pending，或切换后串行计算；两种方式都不得改业务审查状态。纯流程文案可独立部署，但不能让 UI 可发布状态领先服务端能力。

上线后无需“一次性部署”约束：前端变化不改变服务端目标 fingerprint 时直接复用凭证；服务端 fingerprint 改变后重新比较，暂时 pending，不使卷永久作废。不得先放宽 approve 再补 publisher 实际对象检查。若不需要 shadow，上线完整功能一次切换仍是更简单的默认方案。

## 8. 迁移、回滚与证据

- 两表/索引为 additive，不改旧表和 PDF。迁移前备份 Review DB 并记录原行摘要，后查 schema、foreign_key_check、原行未变及服务健康。
- 默认不做 down migration；删新表会丢证据。代码回滚保留表，旧代码不查询它们，结构上无害。
- 回滚到 c42f8b64 会恢复旧 renderer guard，跨构建已兼容卷可能再次 stale；这是旧代码的可用性限制，不应通过修改历史 renderer/approval 规避。必要时优先回滚到已支持内容比较的修复版本。
- 已发布资产/版本不删，不能用部署前 DB 快照覆盖上线后业务写入。未决 promotion 保留 guard/journal/target，先只读 reconciliation，禁止盲目重试。
- 本次仅修订规格，没有执行生产盘点、迁移、测试或部署。

## 9. UI 文案

`import-ops/public/owner-review.js:102`：
- 原：`预览版本已过期，请在 Amp 重新送审。`
- 改：`预览版本需要更新，请在 Droid 中核验后重新送审`
- 同步 `scripts/verify-import-pagination-ui.mjs:161`。

该文案仅用于确定内容不同，或已查明证据缺失、需要人工核验的结果，不因部署/代码变化直接显示。NOT_CHECKED/处理中显示 `正在核验预览内容…`；暂时故障显示可重试的核验失败，不诱导重新送审。未知时仍可查看校验通过的原 preview 和冻结 PDF，但批准/发布不可用。旧 rendererStale boolean 保留为兼容字段，新 UI 优先读取内容 compatibility/reason。

## 10. 工作量与最大风险

估算 **4–6 个工程日**：内容契约/旧证据提取 1 日，schema/worker/CAS/守卫 1–1.5 日，实际发布映射/恢复 1–1.5 日，UI/真实 fixture/独立审查修正 1–2 日。不再承担 Screen 闭包工具与旧 release 回放，较前版减少；部署窗口不计入。若实际 publish profile 存在大量未映射字段，先报告具体缺口，不能用宽泛忽略列表压缩工期。

最大风险转为**原 preview/封存证据与实际写入资产之间的内容覆盖缺口**：只证明 preview 相等，却遗漏 answerKey、解析、媒体选择或 DB 展示字段的变化。对策是完整 payload 比较、原字节绑定、具名 publication 映射和实际 admission/writer 反例测试。缺完整旧 Canonical 本身不是风险豁免，也不再是自动拒绝理由；未被证明对应原内容的实际发布字段才是 unknown。