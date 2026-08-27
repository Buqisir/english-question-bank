# 03 — 通用 NCK1 Candidate adapter

Status: done
Blocked by: `02-mixed-table-media-contract.md`
Next on PASS: `04-agent-materializer-and-orchestration.md`
Terminal: no

Spec: `docs/cuts/universal-nck1-import/spec.md`

## What to build

从不可变原始文档和已校验 Source Materialization 确定性派生 Import Candidate，接入
现有 Teacher Confirmation、Canonical compile 和原子 publication 请求。拒绝调用方
Canonical 语义、源/candidate 漂移和未解决 source issue。

## Acceptance criteria

- [x] 两操作公共缝返回 candidate/issues 与 canonical/unresolved issues。
- [x] 重跑 digest 一致；篡改任一输入或 stale confirmation 失败。
- [x] 九题组、答案、媒体、Listening closure 均来自 Materialization。
- [x] 生成可由 `loadCanonicalImportRequest` 加载的 request。
- [x] 无发布写入的 dry-run 证明。

## Out of scope

- Agent 生成 Materialization、真实卷发布、生产。
