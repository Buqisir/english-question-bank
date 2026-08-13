# 01 — 格式① DOCX 答案版的 canonical 物化 / 身份规则

Status: done
Blocked by: none（spec 执行切片第 4 片；第 1 片只建票，不在本票实现）
Spec: `docs/cuts/import-agentization/spec.md`
Contract: `docs/import/agent-contract.md`

## Problem

格式①（DOCX 答案版）可以跑完切卷、7× `validate-one`、dry-run、`verify-publish-gate`，但 **不能 `--publish`**。现行 publish 硬要 `config.canonicalRequestPath`；DOCX 身份规则与 PDF canonical producer 都不覆盖这条源路径。

试点证据（临时 id `paper-pilot-2025-zj-jan`，未入库）：

- `02-publish.mjs --publish` → `Cannot publish: config.canonicalRequestPath is required for canonical admission`（缺 envelope 时进程仍可能 exit 0，故完成信号不能看 exit code）。
- `deriveNck1Identity`（`server/paper-canonical/docxSourceAdapter.mjs`）只认 `/^\s*(\d{4})年全国高考一卷英语真题/m`。标题不匹配的新课标语义卷（如浙江 1 月答案版）→ `DOCX source lacks a supported NCK1 paper identity`。
- `scripts/import-pipeline/build-canonical-request.mjs` 是 PDF + 答案 PDF + listening/writing reviewed-evidence 专用，格式①无对等 producer。

详见 `docs/cuts/import-agentization/research/pilot-grok-2025-zj-jan.md`。

契约已写死：修好之前格式① **禁止 `--publish`**，停在 dry-run + publish-gate 绿，写 `signals/blocked.json`（`canonical_unavailable`）。

## What to build

给格式①一条 **owner 批准的** canonical 物化或身份规则，使 DOCX 答案版可以走现有 `publishPaperImportPackage` / `canonicalRequestPath` 闭环，从而允许 `--publish`。

本票要定并实现的是生产者 / 身份规则本身，不是导题后台，也不是写作合同合入。

## Acceptance criteria

- [x] 格式①在硬门禁（split → 7× validate-one → AI Answer Transcription Check → dry-run → publish-gate → verify-nck1 PRE）绿之后，可以合法 `--publish`，并出现 `app/public/paper-assets/<id>/latest/`。
- [x] 身份规则覆盖契约允许的格式① NCK1 卷（含标题不是「YYYY年全国高考一卷英语真题」但 owner 已认定新课标语义的答案版），失败仍 fail-closed。
- [x] 物化走现有 canonical 证据 / publisher 缝，不手写 Canonical Paper，不绕 `canonicalRequestPath`。
- [x] 契约删除「格式①禁止 `--publish`」停点；`canonical_unavailable` 不再是格式①的默认终点。
- [x] 不改 `docs/product/nck1-paper-standard.md` 白名单；不把写作新合同从 `wt-continuation-analysis-research-20260809` 合入 `main`；不改消费端 `app/`。

## Proved (slice 4)

- Identity: national 一卷 `paper-YYYY-i`; Zhejiang official / answer-title `paper-zj-YYYY-jan`; unknown titles throw.
- Producer: `scripts/import-pipeline/build-trusted-docx-canonical-request.mjs` writes a request `loadCanonicalImportRequest` can load; byte-reproducible without `--write`.
- Isolated `latest/` via Teacher-Confirmed trusted-DOCX admission (`publishCanonicalPaperPublication` temp sqlite/assets). Publisher admits that loaded request (DOCX source asset) and does not treat a missing request as published.
- Not proved here: a full `02-publish.mjs --publish` of a live format ① paper (needs current-gate groups/analyses). Historical `paper-2025-i` latest fails the current grammar normalization gate before package binding.

## Out of scope

- 发明临时映射、伪造 envelope、或改标准附录来「先 publish 再说」。
- 格式② producer 行为变更（除非证明是共享身份规则的必要最小面）。
- 导题后台功能、上线 / `pull-run-push`、单卷增量传输、LLM API。
- 说明 / 议论型续写。

## Notes for the implementer

先读契约「硬门禁」第 9 步与试点 §6/§8。缺 canonical 时 `--publish` 的 exit 0 是已知陷阱：本地成功只认 `latest/`。
