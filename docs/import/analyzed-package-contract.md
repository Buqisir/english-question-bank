# 完整解析包合同 v1

完整解析包是 OPS `snapshot.mode === "analyzed_package"` 的确定性输入。它生成与原卷
路径相同的 Canonical Candidate 和 Review 文件夹，但**不会**运行 OCR、切题、Sol/AI
解析或原卷回退。通过本页命令只表示 Archive + Content 准入完成，不表示 Owner 已审核
或允许发布。

## 验证命令

生产者和接收 worker 使用同一实现：

```bash
node scripts/import-pipeline/analyzed-package.mjs validate ./package-dir \
  --paper-id paper-example-2026
node scripts/import-pipeline/analyzed-package.mjs validate ./package.zip \
  --paper-id paper-example-2026
```

生成者可一次性导出冻结的提示词、真实 Schema、共享教学风格、完整三级话题表和
各题型运行时／类型合同（`KIT.json` 同时封存每个文件摘要）：

```bash
node scripts/import-pipeline/analyzed-package.mjs kit ./eqb-producer-kit-v1
```

不得只把 `objective-teaching-content-v1` 名字写进提示词；kit 内含完整
`schemas/paper-import/objective-teaching-content-v1.schema.json`。固定 Sol 工具也会把
这份实际 schema 追加到阅读 A–D、七选五、完形和语法的 `outputContract`。

`--paper-id` 必填，来自本次 OPS 新卷目标或修正版的不可变 `targetPaperId`。包内
`paperId` 必须相同；包不能自行选择要修改的外部试卷。

## ZIP 与文件清单

ZIP 根目录必须直接包含 `package.json`。限制：压缩和展开总量各不超过 256 MiB、
单文件不超过 64 MiB、最多 1024 项；只接受普通文件和目录、stored/deflate；拒绝
链接、加密、绝对/逃逸/重复/大小写冲突路径及未声明文件。原始 PDF/DOCX 是可选
`attachment`，没有原件不拒绝，也不会重新提取。

最小目录（文件名可变，身份由清单决定）：

```text
package.json
content.json
official-answers.json
analysis-reading-a.json ... analysis-reading-d.json
analysis-seven.json
analysis-cloze.json
analysis-grammar.json
analysis-application.json
analysis-continuation.json
```

若 `content.listening.state` 为 `captured`，还必须声明 `analysisKey:
"listening-unit"` 的完整听力解析和一个可解码 MP3。没有听力时不得夹带这两项。

## `package.json`

正式 JSON Schema 是
`schemas/paper-import/analyzed-package-v1.schema.json`。对象闭合，未知字段会拒绝：

```json
{
  "schemaVersion": "eqb-analyzed-package-v1",
  "paperId": "paper-example-2026",
  "profileId": "nck1",
  "paperName": "试卷名称",
  "metadata": { "year": 2026, "region": "地区", "sourceType": "真题" },
  "sources": [
    {
      "sourceId": "question-transcription",
      "role": "question_source",
      "memberId": "content",
      "description": "完整原题转录的实际来源",
      "suppliedBy": "提供方"
    },
    {
      "sourceId": "official-answer-transcription",
      "role": "official_answers",
      "memberId": "official-answers",
      "description": "官方答案转录及出处",
      "suppliedBy": "提供方"
    }
  ],
  "files": [
    { "memberId": "content", "path": "content.json", "role": "content", "mediaType": "application/json" },
    { "memberId": "official-answers", "path": "official-answers.json", "role": "official_answers", "mediaType": "application/json" },
    { "memberId": "reading-a", "path": "analysis-reading-a.json", "role": "analysis", "mediaType": "application/json", "analysisKey": "reading-a" }
  ]
}
```

`files` 必须逐项提供唯一 `memberId/path/role/mediaType`。解析键闭合为
`reading-a`、`reading-b`、`reading-c`、`reading-d`、`seven`、`cloze`、
`grammar`、`application`、`continuation`，以及条件性的 `listening-unit`。
资源使用 `media`/`audio`，可选原件使用 `attachment`；不接受 HTML、CSS、代码、
远程 URL、数据库、审核或发布收据。

## 内容、答案与定位

`content` 使用 `nck1-analyzed-package-content-v1`，保存完整题目、资源引用、45 个
笔试客观答案以及听力存在时的 20 题/答案/10 份 transcript。它没有 `documents`、
`sourceCoverage` 或伪造页码。来源定位只使用：

```json
{ "kind": "package_json_pointer", "documentId": "content", "pointer": "/groups/0/questions/0" }
```

指针必须解析到同一 typed identity/value。所有客观题 `authority.documentId` 必须指向
清单中 role 为 `official_answers` 的 JSON member，不能让 `content` 自称官方答案。
该 member 中被指位置须含相同 questionId/canonicalNumber/value（听力同理）。完整
题源和官方答案两条 `sources` 声明都必需；摘要只绑定收到的 bytes，内容真实性仍由
Owner Review 判断。

九份笔试 staged analysis 使用系统现有共享 validator，要求完整翻译、长难句、题型解析、
稳定 ID 和与官方答案完全一致。接收器不会用官方答案覆盖冲突的解析，也不会保留
未知或已退役字段。`continuationDesign`、`highlightExpressions` 等新包禁用字段会由
对应闭合 schema/validator 拒绝。

## 确定性输出和 Review

接收器自行散列每个文件并生成原生
`{kind:"nck1-analyzed-package", manifestBytes, members}`。原始 `package.json` bytes
作为保留 member `package-manifest` 纳入 Candidate identity；生产者无需再制作第二份
manifest 或计算摘要。准备过程先在临时目录完成 Canonical 导入、全部分析 projection
和 `reviewBundleFilePaths` 闭合，全部成功后才原子安装 Review 目录。输出包括：

- `config.json`
- `universal-source-manifest.json`
- `analyzed-package/native-manifest.json` 和封存 members
- 九份 staged analysis（听力存在时为十份）

后续 revision/replay 从封存 bytes 重建；改动任一 staged 文件或 member 都会摘要失败。
外部听力音频和教学解析进入 Review 时显示为
`pending_external_playback_review`。Owner 必须在当前不可变 revision 中完整播放该 MP3，
逐项确认实际声音与所提供原文一致、全部听力段落/题目/官方答案属于同一套且完整对应，
并根据实际声音确认内容适合且安全，之后才能认可。服务端写入的人审语义绑定
revision、source、Candidate、analysis、bundle 与实际音频摘要；重启后的 promotion 会重读
并复验文件 bytes、renderer、当前 approval 和音频绑定，才签发仅存于进程内的 publication
proof。认可本身仍不自动上线，包内自带、复制或序列化的 receipt 也没有 publication
权限；该路径不会伪造 ASR、相似度、自动安全检查或分数。

## 精确 revision 导出与语义往返

导出器只接受调用方指定的 `revisionId`、paperId、Review DB 和 immutable files root；
不会读取“当前最新”拼装目录。它先按 DB 清单逐文件复验 bytes，再重建并核对
source/Candidate/visible/analysis projection，上传中或被改动的 revision 会拒绝。

```bash
node scripts/import-pipeline/analyzed-package.mjs export \
  --review-db ./import-review.sqlite --files-root ./review-files \
  --revision-id rev-00000000-0000-4000-8000-000000000000 \
  --paper-id paper-example-2026 --output ./paper-example-2026.zip
```

`--include-original-attachments` 仅在原生 Review 确有 PDF/DOCX 时把它们作为可选
attachment 带出；不制造原件、ASR、crop 或 DOCX 提取证据。原生 analyzed-package
revision 按原 package manifest/member bytes 读回，因此没有原件也可再导出。现行原卷
Review 则确定性转换真实 materialization、官方答案、staged analyses、媒体和 MP3，
来源声明明确称为 external transcription/package pointer，而不冒充原始证据 replay。
不支持的媒体或旧解析字段以准确路径和 `ANALYZED_PACKAGE_EXPORT_UNSUPPORTED`（或现有
闭合 validator code）失败，不静默删除，也不制造 teaching ranges。

ZIP 写完后必须再次通过同一个真实 archive checker 和共享 loader。规范化 ZIP 不要求
逐字节相同；`compareAnalyzedPackageSemantics` 比较全部 JSON 语义和资源摘要，并把
内部 `sourceAssetVersion` 重编号单列为 version difference，不误报为内容差异。原题、
官方答案／出处、ID、topic triple、annotation 多对多关系和资源 bytes 必须保持。
这仍不是 Owner Review、真实试卷 pilot、批准或发布。
