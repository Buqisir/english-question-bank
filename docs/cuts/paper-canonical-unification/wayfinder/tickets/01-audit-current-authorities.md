# 审计现有试卷标准的权威、缺口与矛盾

Status: closed
Type: research
Claim: claimed
Blocked by: None
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/02-census-assets-producers-consumers.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

Across `CONTEXT.md`, the relevant ADRs, `paper-asset-v1.md`, `nck1-paper-standard.md`, `exam-paper-format-standards.md`, schemas, import runbooks, and current verification gates, what is authoritative today for source truth, semantic truth, paper structure, numbering/scoring, typography, publication, and consumption? Identify every substantive gap, duplicated ruling, stale statement, or contradiction that the canonical initiative must resolve, including the mismatch between the NEEA gold reference's four-column/two-by-two/one-column A–D option layouts and today's incomplete prose rules plus divergent fixed-grid/length-threshold renderer behavior. Classify each finding by the future owner module: Source Capture, normalization, Paper Format Profile, Canonical Paper Plan, Canonical Question Group, Analysis supplement, or renderer ruling. Produce a linked research asset with exact file/line evidence and no proposed implementation.

## Resolution

[研究资产：现有试卷标准的权威、缺口与矛盾审计](../../research/current-authorities-audit.md)

当前不存在单一 canonical authority：owner/normative ruling、admission contract
与 de facto producer/consumer behavior 共同决定现状，且彼此有实质漂移。研究资产
记录了 23 项有精确文件/行号证据的 gap、duplicated ruling、stale statement 或
contradiction，并逐项归入 Source Capture、normalization、Paper Format Profile、
Canonical Paper Plan、Canonical Question Group、Analysis supplement 或 renderer
ruling。A–D 专项确认：owner 的 whole-set 四列 / two-by-two / 一列 densest-fit
invariant 尚未进入既有 prose 或共同可执行规则；Screen 固定网格、Print/PDF 与
DOCX 字符阈值、完形 inline 分支仍然不等价。本 resolution 只审计现状，不提出
schema、迁移、接口或 renderer 实现方案。
