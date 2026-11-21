# 云端讲评审阅

## 本地交接

第一批 3 套，之后每批 10 套。本地写完该批讲评并送审后，在 Linear 的 Bubu 团队、English Question Bank 项目建「讲评抽查 · 第 N 批」，贴「待云端抽查」标签。逐卷列出卷名、`paperId`、`revisionId` 和该版本的审卷链接。

目前两个标签均未创建，由主会话创建「待云端抽查」和「云端已审」。

## 云端逐卷审阅

只审讲评内容。解析 PDF 的版式（分页、字号、排列）不在云端范围：它由共用渲染器统一生成，改渲染器时由本地对照真实 PDF 检查。PDF 里的讲评文字和网页讲评同出一份数据，审网页讲评就覆盖了。

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
