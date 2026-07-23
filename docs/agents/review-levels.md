# Review Gate Levels

This repo uses first-principles, razor-cut review gates. Review strength follows risk, not anxiety.

First principles decide **why** a cut needs review. Razor discipline decides **where review stops**.

## Roles

- **PO**: product owner / final acceptance.
- **PA**: plan architect. Reviews roadmap, scope, architecture, and product boundary before implementation in a fresh independently addressable task; follows `docs/agents/pa-persona.md`.
- **DEV**: implementation agent. Runs as a fresh independently addressable task
  explicitly pinned from `docs/agents/model-routing.md`.
- **verification**: fresh non-implementing task after DEV; consumes real exit
  codes and binds evidence to the exact implementation head before fresh CR.
- **CR**: code reviewer. Medium / Large CR runs as a fresh independently addressable no-DEV-history task following `docs/agents/cr-persona.md`; it must not have implemented the code (reviewer ≠ implementer). CR-lite is only the PM's Small-cut cold read.
- **QA**: product / browser / visual acceptance. A fresh direct QA coordinator
  owns the `human-QA` pause and its evidence; the owner does final PO QA.
- **RM**: release manager. A fresh direct RM successor owns release execution;
  Medium / Large run the artifact gate and final sanity check after fresh CR /
  required QA and before merge.

## Default Rule

- At the start of a cut, ask in order:
  1. **Irreversibility**: Does this affect future modules or contracts? If yes, use PA.
  2. **Visibility**: Can a teacher/user see it? If yes, use QA.
  3. **Runtime risk**: Does it enter runtime code? If yes, use CR.
  4. **Evidence fit**: Prefer static verify when it proves the risk. Do not run heavy gates that cannot observe the changed surface.
- Use **PA before DEV** per the AGENTS.md Current Operating Reality trigger: large cuts, or touches to an irreversible surface / data-contract semantics; purely additive, reversible work may downgrade to PA-lite with the reason recorded in the plan header (CR reviews the downgrade). PA writes `docs/cuts/<CUT>/pa.md`; when a revision is needed, PA relays to one fresh PM plan-revision task, which records the follow-up decisions in `plan.md` before DEV.
- Use **CR after DEV** for any PR that will be merged.
- Use **QA before RM** only when the change is user-visible or affects visual / interaction behavior.
- Docs-only and type-only cuts do not need browser QA.

## Levels

These L levels classify the **change type** to pick gates; they map onto
the small / medium / large cut tiers in
`docs/steering/cut-workflow-protocol.md` roughly as L0–L1 ≈ small,
L2–L3 ≈ medium, L3–L4 ≈ large. Tier (from the protocol) decides process
ceremony; the L row decides which gates the change type needs. When in
doubt, the protocol's tier rules win.

| Level | Change Type | Required Gates | QA? | Examples |
| --- | --- | --- | --- | --- |
| L0 | Pure record: inventory, checklist, sidecar doc that does not make product decisions | DEV completion + RM sanity check | No | sidecar inventory docs, QA checklist docs |
| L1 | Decision doc, ADR, types-only contract, verify-only planning cut | PA or CR, then RM | No | PaperSurface B1.5 ADR, B2 adapter plan |
| L2 | Isolated runtime module not mounted in product UI | PA + DEV + CR + static verify | No browser QA before merge | PaperSurface B3 module v1 |
| L3 | User-visible UI / route / interaction change | PA + DEV + CR + QA + RM | Yes | Paper Intelligence route integration, basket popover, insight interaction |
| L4 | High-risk core data, persistence, export, migration, or print/PDF path | PA + DEV + CR + QA + release checklist; consider second CR | Yes | print renderer, PDF export, Paper Set persistence, data migration |

## Stop Rules

Use these to prevent review from expanding forever.

### PA Stops When

- Scope is clear.
- Forbidden scope is clear.
- Verify / QA method is clear.
- The next cut answers exactly one core question.

### CR Stops When

- There are no Must Fix findings.
- Watch items do not block the current cut.
- Scope did not drift.
- Verify strength matches the risk.

### QA Stops When

- The main path works.
- No blocking user-visible experience issue remains.
- Polish items are recorded as follow-up, not absorbed into the current cut.

## Review depth

CR-lite is only a Small-cut PM cold read. Medium / Large always retain fresh CR;
Big CR is added only for risk or an explicit owner request. Do not use hit-rate
to downgrade the Medium / Large fresh-CR gate.

同法理扩展到 **owner PO QA**（owner 拍板 2026-07-11）：

- 同一刀类 owner QA 连续 **3 把**零发现，该类降为**抽查**：每 3-4 把抽
  1 把仍请 owner 实点，其余由该刀的 fresh direct QA coordinator 做浏览器
  QA、对照单归档。
- 任何渠道（抽查 / 使用中发现 / 生产事故）命中 1 个 owner 级发现，该类
  **立即**回到每把必 QA，重新累计。
- 不适用面同上（L4 高危面 / 首次触碰的新面 / 不可逆触发器覆盖的刀）
  永不降档。
- QA 请求默认附对照单（`docs/cuts/_templates/qa-checklist.md`，3-5 项
  操作 + 预期），把 owner QA 从自由探索变成 ≤5 分钟的对照验收。

- **Must Fix**: blocks the current PR.
- **Should Watch**: record and monitor; do not automatically turn it into a task.
- **Follow-up Gate**: must be resolved before a named future stage.
- **Nice-to-have**: do not schedule unless PO explicitly asks.
- **Self-Review Blind Spots**: when a review feeds a later Big CR, it must
  list the places the implementer / reviewer suspects are weak but cannot
  confidently judge; Big CR inspects those first, then continues normal
  risk-based review.

## Operating Notes

- Do not give every small cut an L3/L4 process. That burns time without improving quality.
- Do not downgrade tree-trunk work just because the diff looks small. Data contracts and runtime surface boundaries can be high risk even with few lines.
- One tree-trunk DEV at a time. Parallel agents may work on leaves: docs, inventories, QA checklists, examples, migration research, or static review prep.
- Night work should bias toward low-risk cleanup, docs, merge administration, and planning notes. Avoid major architecture decisions late at night.
- Current operating reality (authority: `AGENTS.md` "Current Operating Reality"):
  阿澈 provides PM direction / UI direction, while every relay role — including
  PM plan revision, PA, DEV, verification, CR, QA, and RM — is its own fresh
  direct task pinned from `docs/agents/model-routing.md`. No ancestor remains
  to perform RM or consume a successor's result. The owner does PO QA, not code
  review.
- Multi-agent handoff context is repo-first. PA / CR prompts and
  reports, DEV goal prompts, decisions, handoffs, QA contracts, and Cut
  Notes should be written to named repo paths. Chat messages route the
  agent to those files; chat history is not an authoritative review
  artifact.
- Default simplification:
  - L0 does not need formal CR unless it makes a decision.
  - L1 uses PA or CR, not both by default.
  - L2 uses PA + CR.
  - L3 adds QA.
  - L4 may add second CR / release checklist.
- External-agent orchestration is dormant. If an external agent is ever reintroduced, follow the archived rules in `docs/agents/external-agents.md`.
