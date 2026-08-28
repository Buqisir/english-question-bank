# 01 — 通用 NCK1 网页认可后本地原子发布

Status: done
Blocked by: None
Next on PASS: `02-import-skill-and-state.md`
Terminal: no

Spec: `docs/cuts/import-agent-closed-loop/spec.md`

## What to build

为 `review.mjs` 增加 `publish <paperId>`。它只接受 `accept` 已经写出的精确认可、
Teacher Confirmation 和 Canonical request，从通用 Source Materialization 生成确定性
兼容资产，并通过现有 paper-import publisher 的共享原子核心提交本地正式版本。

旧 package publisher 继续走同一核心且行为不变。通用路径不生成旧 AI analysis
文件，不经过需要伪造 `groups.json` / analysis 的反向转换。

## Acceptance criteria

- [x] 已认可 fixture 发布成功；九题组、45 个 active 权威答案、数据库、版本目录、
      `latest` 和 Canonical current ref 使用同一版本。
- [x] committed Screen / Print consumers reload ready，visible digest 等于认可 projection。
- [x] 通用版本无 analysis sidecar。
- [x] 陈旧或篡改的 source/request/confirmation/approval 在第一次写入前失败。
- [x] 一个 commit 前注入故障留下零 DB/latest/version 残留。
- [x] 一个 commit 后 reload 中断可由同版本幂等重试恢复。
- [x] 既有 legacy publisher failure matrix 保持通过。
- [x] 文档和 probe 使用 `approved -> locally_published -> ready_to_ship`，不再把
      `latest` 放在网页 QA 之前。

## Constraints

- 不改生产环境、不导入真实卷、不部署、不 push Git。
- 不伪造 reading、seven、cloze、grammar 或 writing analysis。
- Canonical admission 必须先于 compatibility write；PaperAsset 不能成为语义权威。
- 保留现有原子事务、恢复和版本协议，不另建发布器。

## Verification

- `node scripts/verify-universal-nck1-publish.mjs`
- 受影响的既有 paper-import publication/failure checks
- `pnpm -C app verify:paper`
- 最终候选一次 `pnpm -C app verify:all`
- 冻结 in-scope patch 的独立 Standards / Spec review
