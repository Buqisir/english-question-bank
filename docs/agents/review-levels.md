# Review Gate Levels

This repo uses first-principles, razor-cut review gates. Review strength follows risk, not anxiety.

First principles decide **why** a cut needs review. Razor discipline decides **where review stops**.

## Roles

- **PO**: product owner / final acceptance.
- **PA**: plan architect. Reviews roadmap, scope, architecture, and product boundary before implementation. Runs as a fresh subagent context so PM and PA are separated; follows `docs/agents/pa-persona.md`.
- **DEV**: implementation agent. Runs as a pinned DEV subagent (Sonnet, per the AGENTS.md tier table) by default.
- **CR**: code reviewer. Routine CR-lite and Big CR both run as fresh subagent contexts following `docs/agents/cr-persona.md`. CR must run in a context that did not implement the code (reviewer ≠ implementer).
- **QA**: product / browser / visual acceptance. The orchestrator does first QA for UI direction and user-visible quality; the owner does final PO QA.
- **RM**: release manager. The orchestrator owns RM / release execution; medium / large cuts run the RM artifact gate and final sanity check in the CR + RM session before the merge executes.

## Default Rule

- At the start of a cut, ask in order:
  1. **Irreversibility**: Does this affect future modules or contracts? If yes, use PA.
  2. **Visibility**: Can a teacher/user see it? If yes, use QA.
  3. **Runtime risk**: Does it enter runtime code? If yes, use CR.
  4. **Evidence fit**: Prefer static verify when it proves the risk. Do not run heavy gates that cannot observe the changed surface.
- Use **PA before DEV** per the AGENTS.md Current Operating Reality trigger: large cuts, or touches to an irreversible surface / data-contract semantics; purely additive, reversible work may downgrade to PA-lite with the reason recorded in the plan header (CR reviews the downgrade). PA writes `docs/cuts/<CUT>/pa.md`; the orchestrator then compresses PA follow-up decisions into `plan.md` before DEV.
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

## Hit-Rate Adaptive Depth（命中率降档，owner 拍板 2026-07-10）

评审深度跟实测命中率走，不跟焦虑走：

- **降档**：同一刀类（如纯 UI polish / 纯 docs / 纯 CSS token 替换）连续
  **3 把** fresh CR 均 0 Must Fix，则该类默认降为 CR-lite（主代理冷读
  diff），并保留**随机抽查**：每 3-4 把该类刀抽 1 把仍走 fresh CR。
- **回升**：抽查或任何渠道在该类命中 1 个 Must Fix，该类**立即**回到
  fresh CR 默认档，重新累计。
- **不适用**：L4 高危面（数据/迁移/导出/print）、首次触碰的新面、以及
  AGENTS 不可逆触发器覆盖的刀——这些永不降档。
- 判断依据就是 STATUS 收官行里的 CR 结论记录（"CR APPROVE 0 MF"），
  不另建表。降档决定由主代理在派工时一句话记录在 plan/派工 prompt 里。

- **Must Fix**: blocks the current PR.
- **Should Watch**: record and monitor; do not automatically turn it into a task.
- **Follow-up Gate**: must be resolved before a named future stage.
- **Nice-to-have**: do not schedule unless PO explicitly asks.

## Operating Notes

- Do not give every small cut an L3/L4 process. That burns time without improving quality.
- Do not downgrade tree-trunk work just because the diff looks small. Data contracts and runtime surface boundaries can be high risk even with few lines.
- One tree-trunk DEV at a time. Parallel agents may work on leaves: docs, inventories, QA checklists, examples, migration research, or static review prep.
- Night work should bias toward low-risk cleanup, docs, merge administration, and planning notes. Avoid major architecture decisions late at night.
- Current operating reality (authority: `AGENTS.md` "Current Operating Reality"): one orchestrator (the main agent) wears the PM / UI-direction / RM hats; PA, DEV, and CR run in fresh subagent contexts so reviewer ≠ implementer and PM ≠ PA. When one context must cover multiple hats, record the exception — role contracts and gates do not downgrade. The owner does PO QA, not code review.
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
