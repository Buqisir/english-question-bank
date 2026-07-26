# 凝结已闭合地图并转入 normal spec/tickets

Status: closed
Type: task
Claim: claimed
Blocked by: 制定 33 套 latest 存量迁移与 legacy 退役计划
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/01-canonical-foundation.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

After every preceding Wayfinder ticket is closed, synthesize their linked resolutions—without duplicating or reopening them—into one coherent `docs/cuts/paper-canonical-unification/spec.md` and a blockers-first set of normal vertical implementation tickets. Re-evaluate the map's Fog: graduate any newly precise question into a final Wayfinder ticket instead of guessing; proceed to the normal spec/ticket path only when no unresolved decision can change the canonical interface, authority graph, rollout, migration, verification, or release boundaries. The first normal ticket must be the accepted canonical foundation slice at the declared `Next on PASS` path.

## Resolution

The closed map is synthesized into
[EQB 试卷 Canonical 大一统实施规范](../../spec.md), which is an
implementation index over the 16 linked decision resolutions rather than a
second store of their field-level answers.

The accepted foundation-first route is now a blockers-first chain of 29 normal
vertical tickets under `docs/cuts/paper-canonical-unification/tickets/`:

1. authority/evidence/compiler/Profile/Group/Publication/loader foundation;
2. Cloze/Grammar reference conformance and the shared A–D selector;
3. Seven Choices, Reading, Application Writing, Continuation Writing, and
   listening inactive slices;
4. canonical-required new-import admission;
5. frozen 33-paper dry run, then eight bounded M3 family/conformance queues in
   the accepted order;
6. four-paper canary and the remaining national, Zhejiang, and NCK1 cohorts;
7. full-corpus closure while legacy remains available;
8. one reviewed retirement ticket per family in the accepted Cloze →
   Grammar Fill → Seven Choices → Reading → Application Writing →
   Continuation Writing order;
9. repository release closeout.

The first implementation frontier is exactly
[`01 — Canonical authority/evidence/publication foundation`](../../tickets/01-canonical-foundation.md).
Every later ticket is blocked by its immediate predecessor and carries one
deterministic `Next on PASS`; the release ticket alone is terminal.

Fog was re-evaluated without inventing another decision. Exact implementation
slicing is now resolved by the normal tickets and was removed from Fog. The
remaining items are explicitly future versioned contracts, optional operator
UX, post-retirement cleanup, unsupported future scope, or a separate
production-authorized deployment/backfill cut. The accepted v1 manifest,
fail-closed compatibility rules, immutable inputs, and explicit release
boundary prevent them from changing this initiative's canonical interface,
authority graph, local rollout, 33-paper migration, verification, or
repository release closeout. No final Wayfinder ticket is required.

Recorded verification:

- all 16 predecessor tickets are `Status: closed`;
- normal tickets form one continuous `01`–`29` route, with `Terminal: no`
  until `29`, then `Next on PASS: DONE` / `Terminal: yes`;
- every relative decision link in `spec.md` resolves;
- fixed point to pre-resolution HEAD corpus/code diff for
  `app/public/paper-assets`, `server`, `app/src`, `scripts/import-pipeline`,
  `docs/import`, and `docs/product` — empty;
- `node scripts/verify-paper-assets-consistency.mjs` — 199/199 PASS;
- `node scripts/verify-paper-asset-v1.mjs` — 3182/3182 PASS;
- `git diff --check` — PASS.
