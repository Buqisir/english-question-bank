# 云端讲评审阅

## 分工（Owner 2026-11-21）

每套卷的讲评按三个格子分：「阅读理解」「七选五 + 应用文 + 读后续写」「听力 + 完形 + 语法填空」。本地写和云端审用同一套格子，云端报的问题交回写这一格的本地子代理修改。

- **本地写**：前两格要深推理，各由一个 Astra 6.0 写；「听力 + 完形 + 语法填空」格式固定、推理浅，由一个 Medium 写。一套卷 3 个子代理，用 `lecture-redo` 的请求和草稿路径。一个子代理只写自己格子里的讲评，避免一次写完整套、写到后面注意力下降。Medium 写这一格从第 2 批起试行：对比第 1 批 Astra 写的同类题型，云端挑出的问题明显变多就改回 Astra。
- **云端审内容**：每格一个子代理，逐题、逐字段读，最后列出看过的题号。
- **云端看解析 PDF**：每批一个子代理翻完该批全部解析 PDF，只报漏印、错印的内容和新出现的版式问题，已知的渲染器问题不重复报。
- **本地改**：Medium 照云端「建议」改草稿，合入后送新 revision，在工单逐条回复。

第 2 批审完后按子代理统计独有发现。某类子代理连续两批没有新发现，就合并或撤掉。

## 本地交接

第一批 3 套，之后每批 10 套。本地写完该批讲评并送审后，在 Linear 的 Bubu 团队、English Question Bank 项目建「讲评抽查 · 第 N 批」，贴「待云端抽查」标签。逐卷列出卷名、`paperId`、`revisionId` 和该版本的审卷链接。

## 云端逐卷审阅

按上面的格子审讲评内容；解析 PDF 每批由一个子代理翻看（审卷页 PDF 菜单 →「解析 PDF」），问题按同样格式回报。

用 `agent-cloud`（`owner` 角色）登录 [eqbank.cc](https://eqbank.cc)。按单中指定的 revision **逐卷看完全部讲评**，逐题核对，按[讲评审阅标准](lecture-review-standard.md)记录问题。

- **审卷页** `https://eqbank.cc/?view=ops-review&paper=<paperId>&rev=<revisionId>`。在网页预览打开「讲评」，沿卷面的题型和篇章目录逐组、逐题阅读。
- **JSON** 在同一已登录会话中，先按审卷页列出的题型确定要读的讲评文件，再对同一 `revisionId` 请求 `GET /api/import-review-preview/revisions/<rev>/asset/analyses/<file>.json`。下表列出实际文件名。该路由按单个文件读取，`/asset/paper-assets.json` 会返回 404。另读 `GET /api/import-review-preview/revisions/<rev>/asset/paper-asset.json`，按 `answerKey.answers` 中的 `questionNo` 核对题号和答案。已有 Owner 更正的条目里，`officialAnswer` 保留原官方答案，`answer` 为该版生效答案。 [审卷路由](../../server/import-review/importReviewRoutes.mjs#L1154-L1181) · [文件名](../../server/import-review/revisionProjection.mjs#L1764-L1769)

| 题型 | 文件名 |
| --- | --- |
| 听力 | `listening-analysis-v1.json` |
| 阅读四选一 | `reading-choice-analysis-v1.json` |
| 七选五 | `seven-choices-analysis-v1.json` |
| 完形填空 | `cloze-analysis-v1.json` |
| 语法填空 | `grammar-fill-analysis-v1.json` |
| 应用文与读后续写 | `writing-analysis-v1.json` |

## 在 Linear 回报

每个问题单独写一条评论。首行用 `卷名 · 题型/篇 · 题号 · 必须改|建议改(编号)`，填写其中适用的一档和标准编号。后面依次写原文、问题和建议，并在末尾署名。

```text
卷名 · 阅读 B · 第 25 题 · 必须改(2)
原文  “Some trips were cancelled.”
问题  讲解把 Some 引成 All，并据此说行程全部取消。
建议  恢复 Some，将结论收回到有些行程取消。

—— 云端 Agent 审阅（YYYY-MM-DD）
```

若全批无问题，评论写「本批无问题」，并同样署名。完成全批后，把工单标签从「待云端抽查」换成「云端已审」。

云端对题库和审卷页只读。写入限于 Linear 评论和上述标签更换。批准、发布、删除和修改讲评数据均不属于云端审阅操作。

本地收到反馈后，由 Medium 修改并送新 revision，把新版本和处理结果在工单里逐条回复，再关单。

## 云端写讲评并送审

本节用于单独认领的写稿任务。由本地在 Linear 逐卷交接 `paperId` 和冻结的 Candidate `revisionId`，云端确认认领后，本地暂停改这套卷，直到云端回报新 revision 或明确退回。仅接最新 Candidate，版本不符时请交接人重新确认。

Claude Code 云端的 setup script 运行 `bash .agents/cloud-lecture-setup.sh`。每个新容器重新准备依赖。在写稿 shell 中配置以下变量：

```bash
export PATH="$HOME/.local/node-24/bin:$PATH"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
export QUESTION_BANK_IMPORT_OPS_ORIGIN=https://eqbank.cc
export QUESTION_BANK_IMPORT_OPS_AGENT_USERNAME=agent-cloud-import
```

通过云端环境密钥注入 `QUESTION_BANK_IMPORT_OPS_AGENT_PASSWORD`。账号类型为 `import_agent`，角色为 `member`。保持 `QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN` 未设置，现有客户端会用账号换会话 cookie。

在仓库根目录，将 `paperId` 设为交接卷号，为这套卷选一个新的工作目录 `work`：

```bash
node scripts/import-pipeline/lecture-redo.mjs prepare --paper "$paperId" --work "$work"
```

对照 `$work/requests/INDEX.md` 首行确认基线 revision 与交接一致。按请求和[讲评审阅标准](lecture-review-standard.md)逐题写讲评 JSON，保存到请求中的 `draftPath`。按实际题组填草稿，输出仅含讲评对象。

```bash
node scripts/import-pipeline/lecture-redo.mjs merge --work "$work"
# 只改指定题组时，在 merge 后加 --only reading-a,reading-b 等对应键。
pdftoppm -r 120 -png "$work/ready/bundle/products/analysis.pdf" "$work/analysis-page"
```

`merge` 校验草稿、生成解析 PDF，并校验题目、答案和冻结文件。翻看导出的各页 PNG，核对题号、解析和排版。通过后送审：

```bash
node scripts/import-pipeline/lecture-redo.mjs push --work "$work"
```

在同一个 Linear 工单回报 `paperId`、原 revisionId、新 revisionId、改过的题组和检查结果，附新版本审卷链接并署名。若已生成 `upload-attempt.json` 但没有成功回执，先只读核对 Candidate 和回执，勿重试上传。

云端写稿只改讲评。禁止改题文、官方或生效答案、听力音频和图片，禁止批准、发布或删除。
