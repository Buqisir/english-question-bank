# Burden baseline and risk language

Source HEAD: `9cc1da509cdc8d5276e93a56b5ceff533b9490f6`

This is a planning baseline, not a performance KPI or a new policy authority.
It freezes named path sets, count definitions, and the current control actions
that later tickets may test with deletion and change simulations. Raw elapsed
time and lines of code may locate burden; neither determines whether a control
is kept, downgraded, or deleted.

## Reproduction recipe

Run from the repository root. Every file list and line count is read from Git
blobs at the bound source commit, so a dirty or later worktree cannot alter the
result. `wc -l` is the line definition. The regular expressions below are the
denominators; do not merge their results into a single ratio.

```bash
SOURCE_COMMIT=9cc1da509cdc8d5276e93a56b5ceff533b9490f6
TASK_ALL_PATHS=$(mktemp)
git ls-tree -r --name-only "$SOURCE_COMMIT" > "$TASK_ALL_PATHS"

count_set() {
  TASK_LABEL=$1
  TASK_REGEX=$2
  TASK_MATCHED_PATHS=$(mktemp)
  awk -v re="$TASK_REGEX" '$0 ~ re' "$TASK_ALL_PATHS" > "$TASK_MATCHED_PATHS"
  TASK_FILE_COUNT=$(wc -l < "$TASK_MATCHED_PATHS" | tr -d ' ')
  TASK_LINE_COUNT=0
  while IFS= read -r TASK_FILE_PATH; do
    [ -n "$TASK_FILE_PATH" ] || continue
    TASK_ONE_LINES=$(git show "$SOURCE_COMMIT:$TASK_FILE_PATH" | wc -l | tr -d ' ')
    TASK_LINE_COUNT=$((TASK_LINE_COUNT + TASK_ONE_LINES))
  done < "$TASK_MATCHED_PATHS"
  printf '%s files=%s lines=%s\n' "$TASK_LABEL" "$TASK_FILE_COUNT" "$TASK_LINE_COUNT"
}

printf 'tracked files=%s\n' "$(wc -l < "$TASK_ALL_PATHS" | tr -d ' ')"
count_set code '[.](js|jsx|ts|tsx|mjs|cjs)$'
count_set verify '^scripts/verify-.*[.]mjs$'
count_set canonical '^(standards|schemas)/paper-canonical/'
count_set cut_tickets '^docs/cuts/.*/tickets/.*[.]md$'
count_set manifest_versions '^standards/paper-canonical/manifest-v[0-9]+[.]json$'
count_set consumer_json '^standards/paper-canonical/consumers/.*[.]json$'
count_set ci_workflows '^[.]github/workflows/.*[.]ya?ml$'
count_set package_manifests '^(app|server)/package[.]json$'
count_set root_package '^package[.]json$'
git show "$SOURCE_COMMIT:scripts/verify-paper-canonical-import-pilot.mjs" | wc -l
```

The two package-entry counts are reproduced without loading worktree files:

```bash
git show "$SOURCE_COMMIT:app/package.json" |
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(Object.keys(JSON.parse(s).scripts||{}).length))'
git show "$SOURCE_COMMIT:server/package.json" |
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(Object.keys(JSON.parse(s).scripts||{}).length))'
git show "$SOURCE_COMMIT:.github/workflows/verify.yml" |
  rg '^  (verify|e2e):|^      - name:|^        run:'
```

## Exact inventory and metric disposition

| Inventory | Exact denominator | Result | Disposition | Limitation and later use |
| --- | --- | ---: | --- | --- |
| Tracked files | every blob path from `git ls-tree -r --name-only` | 2,530 files | Downgrade | Reproducible drift signal only. File count does not measure control value. The earlier 2,516 count belonged to source HEAD `bd967162ed58e322dc2a79fcae88bf32b9e99d7c`; the supplied 2,557 figure has no accepted denominator here. |
| JS/TS-family source | tracked paths ending in `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, or `.cjs` | 432 files / 170,936 lines | Downgrade | LOC is a locator for inspection, not depth, leverage, quality, or burden. The supplied 170,307 figure is deleted as a baseline because its HEAD/path definition is not bound. |
| Verify scripts | tracked `scripts/verify-*.mjs` | 140 files / 82,247 lines | Keep file denominator; downgrade LOC | The set locates verification fan-out. A verifier is kept only for its named failure and public Interface, not because it is large. The supplied 81,618 figure is deleted as a baseline. |
| Import-pilot verifier | exact blob `scripts/verify-paper-canonical-import-pilot.mjs` | 18,975 lines | Downgrade | A hotspot locator for Ticket 03/05. Size alone cannot show redundancy or justify deletion. |
| Canonical standards and schemas | tracked `standards/paper-canonical/**` plus `schemas/paper-canonical/**` | 434 files / 28,280 lines | Keep file/path denominator; downgrade LOC | Separates the high-blast-radius contract surface from the rest of the repo. Deletion still requires caller, persisted-data, and public-seam evidence. |
| Cut tickets | tracked `docs/cuts/**/tickets/*.md` | 135 files / 7,909 lines | Keep file denominator; downgrade LOC | Measures current durable ticket artifacts, not historical task count, human effort, or required ceremony. The supplied 165-ticket figure is deleted as a baseline because no exact included cut set was supplied. |
| Manifest versions | tracked `standards/paper-canonical/manifest-v[0-9]+.json` | 36 JSON files / 4,868 lines | Keep, separate | A reproducible authority-version history denominator. Never merge with consumer versions: their sequences and roles differ. |
| Consumer contracts | tracked `standards/paper-canonical/consumers/*.json` | 73 JSON files / 989 lines | Keep, separate | Exact consumer-version fan-out: Screen and Print/PDF contract artifacts only. It excludes migration Markdown, schemas, public paper assets, and untracked build output. |
| CI workflows | tracked `.github/workflows/*.{yml,yaml}` | 1 file / 127 lines; 2 jobs (`verify`, `e2e`) | Keep entry topology; downgrade LOC | The workflow contains one aggregate `pnpm run verify:all` step and six direct browser/E2E verifier steps. Install/setup commands are not verification entrypoints. |
| Package manifests | tracked `app/package.json` and `server/package.json`; root `package.json` counted separately | 2 manifests; app 8 scripts; server 0 scripts; root 0 files | Keep, separate | `app` owns `verify:all -> node ../scripts/verify-ci.mjs`; the server has no package scripts. Do not infer a root package command. |

The raw supplied counts `2,557 / 170,307 / 81,618 / 79 / 165` are therefore
not a comparable baseline. The first three lack a common exact HEAD/path
definition; `79` conflates or omits the current 73 JSON consumer contracts;
`165` lacks an included ticket path set. Later work may recount them only by
declaring a new exact denominator, never by silently replacing these values.

## Canonical risk language

These terms sharpen the current map and repository authorities; they do not
change the product domain glossary or create a new gate.

- **Data Addition** — publication of another paper whose source format and
  content shape are already admitted by the unchanged accepted Adapter,
  schemas, authority, publisher, loader, and renderer Interfaces. It changes
  data identity and content, not shared behavior. A novel shape, new diagnostic
  rule, caller-authored semantic escape, or required shared-code change is not
  a Data Addition.
- **Shared Contract Change** — a change to an accepted shared Interface or its
  invariants at an Adapter, schema, authority manifest, compiler, publication,
  loader, authentication/persistence seam, or Screen/Print/PDF renderer. Its
  blast radius includes callers or durable data beyond one addition.
- **UI Micro-change** — the current atomic fast-path case: a small CSS-only,
  purely visual parameter change with no new class/data attribute/selector
  structure, no TS/TSX, layout, scroll, positioning, responsive, accessibility,
  `shared/papersurface/**`, print, PDF, export, domain, server, auth, or
  persistence impact. Any failed predicate escalates to ordinary or high-risk
  UI handling; proximity to a risky file does not by itself decide the tier.
- **Atomic Publication** — one Canonical Paper version, including every bound
  field and sidecar, becomes the committed current version together or not at
  all; exact reload observes that same immutable version, and retry/recovery
  cannot expose a mixture. It does not mean re-proving every unchanged consumer
  for every paper.
- **Risk Tier** — the repository's `normal` or `high` handling derived from the
  concrete change's blast radius, reversibility/irreversibility, and automation
  authority. It is a classification, not a score from LOC or speed. Shared
  schema/data-contract semantics, migrations, permissions/authentication,
  persistence, production configuration, PaperSurface anchors, Print/PDF/DOCX,
  cross-cut architecture, and irreversible decisions are current high-risk
  triggers.
- **Risk Closure** — the least-heavy existing mechanism that demonstrably
  prevents one named failure at the earliest useful gate. A closure is not a
  document or verifier by default. Delete or downgrade it when a lighter
  existing mechanism closes the same failure and removal does not measurably
  increase risk; retain or strengthen it when blast radius, irreversibility, or
  automation authority makes the failure consequential.

The architecture test is Interface-centered: a deep Module earns **Depth** by
hiding behavior behind a small Interface and gives callers **Leverage** and
maintainers **Locality**. LOC cannot measure Depth. Replace shallow or duplicate
tests with behavioral proof at the public Interface; do not layer a new ledger
or verifier over the same Seam.

## Before-state workflow action counts

### Counting definition

One action is one mandatory, separately observable control or gate in the
current repository authorities for the representative workflow. Several shell
commands that jointly prove one closure count once; implementation/content work
itself and optional diagnostics do not count. A conditional action is counted
only where the representative case satisfies its predicate. Common delivery
mechanics are included when authority requires them because they prevent stale
or ambiguous continuation. These are action counts, not time, cost, quota,
token, or model-quality measurements.

### Ordinary Canonical Paper Data Addition — 10 actions

Representative case: a user-visible paper through unchanged accepted shared
behavior, as defined by `docs/agents/testing-cadence.md` and the unchanged-seam
lanes such as `docs/cuts/paper-canonical-unification/tickets/27-nck1-confirmation-lane.md`.

| # | Current action | Named failure closed | Baseline classification |
| ---: | --- | --- | --- |
| 1 | Verify exact worktree, branch, HEAD, authority, scope, and exclusive writer. | Stale authority, wrong worktree, or overlapping writes. | Keep. |
| 2 | Bind exact Source, candidate, Teacher Confirmation, and Publication identities. | Wrong-source or substituted-candidate publication. | Keep. |
| 3 | Run affected narrow deterministic admission checks through the unchanged public Interface. | Malformed, unsupported, or semantically unresolved input admitted. | Keep. |
| 4 | Obtain candidate-bound Teacher Confirmation. | AI/compiler interpretation becoming authority without the teacher trust decision. | Keep. |
| 5 | Publish all fields/version atomically and reload the exact committed version. | Partial or mixed-version visibility. | Keep. |
| 6 | Exercise interrupted recovery, idempotent retry, and valid rollback as applicable at the public publisher. | Retry corruption, split database/assets state, or unrecoverable current ref. | Keep; one public closure, not per-sidecar proofs. |
| 7 | Record fixed-denominator lane/paper accounting. | Silent omission or double counting inside the declared paper set. | Keep. |
| 8 | Run a proportionate canary/public-surface check for the actual paper. | A paper-specific anomaly that passes structural admission but fails consumption. | Keep; depth follows actual paper risk. |
| 9 | Provision real browser QA and obtain owner acceptance because the addition is user-visible. | Static evidence missing teacher-visible Screen/Print behavior. | Keep; do not automatically expand to universal manual proof. |
| 10 | Commit the bounded result and return exact HEAD plus declared route. | Unbound evidence or successor acting on an ambiguous candidate. | Keep. |

`verify:all`, an authority version bump, independent dual-axis review, and a
new approval/evidence layer are explicitly **not** current Data Addition
actions when the accepted Adapter/schema/publisher/renderer remain unchanged.
Their absence is not a deletion proposal; it is the current baseline.

### Qualifying UI Micro-change — 7 actions

Representative case: every atomic-fast-path predicate in
`docs/agents/ui-collaboration.md` passes and the change is user-visible.

| # | Current action | Named failure closed | Baseline classification |
| ---: | --- | --- | --- |
| 1 | Verify exact task/worktree/scope and exclusive writer. | Stale or overlapping edits. | Keep. |
| 2 | Prove every UI Micro-change predicate and trace shared/high-risk dependencies. | A shared, interaction, layout, PaperSurface, export, or accessibility change masquerading as local CSS. | Keep; Ticket 06 may simplify the decision surface. |
| 3 | Run the narrow affected build/lint/component or direct check. | Syntax, type/build, or local component regression. | Keep only the affected check. |
| 4 | Perform the implementation closeout/light visual sanity review. | Obvious mismatch or unintended nearby visual change. | Keep; no independent review lineage. |
| 5 | Provision and smoke-check the exact target page in a real browser. | Static/source proof missing actual rendering or interaction state. | Keep. |
| 6 | Obtain owner acceptance. | A technically valid change that is visually wrong for the teacher. | Keep under current user-visible QA authority. |
| 7 | Commit and report exact HEAD, visual intent, QA state, and legal exit. | Unbound result or ambiguous continuation. | Keep. |

No backend suite, schema/authority version, or independent dual-axis review is
justified for this representative case. If an escalation predicate fires, this
count no longer applies.

### Shared Contract Change — 9 actions

Representative case: a user-visible Canonical Paper Adapter/schema/publication/
renderer Interface changes.

| # | Current action | Named failure closed | Baseline classification |
| ---: | --- | --- | --- |
| 1 | Verify exact authority, worktree, fixed point, scope, and exclusive writer. | Stale contract edit or overlapping shared writer. | Keep. |
| 2 | Bind the accepted decision/spec/ticket and impacted public Interfaces. | Implementing an unresolved or out-of-scope contract. | Keep when the change is normal/multi-session; do not require new planning ceremony for a truly small clear fix. |
| 3 | Version the changed authority/schema/Adapter and preserve required migration/compatibility identities. | Old durable data or callers being interpreted under new semantics without an explicit route. | Keep when semantics/version changes; split from pure data addition. |
| 4 | Run affected narrow adversarial, admission, recovery, and consumer checks at public Interfaces. | Candidate forgery, invalid admission, recovery breakage, or direct consumer regression. | Keep; consolidate shallow duplicate proof. |
| 5 | Run one final `pnpm -C app run verify:all` on the final candidate. | Unmapped shared fan-out regression. | Keep under current high-risk cadence. |
| 6 | Complete ordinary Standards + Spec closeout review and fixes inside implementation. | Local standards/spec defect surviving tests. | Keep; do not split into a separate ordinary review task. |
| 7 | Pass one independent Standards/Spec review lineage from the fixed point. | High-blast-radius semantic defect or missing impacted caller. | Keep. |
| 8 | Provision real public Screen/Print/PDF evidence and owner QA when the changed contract is user-visible. | Correct internal contract but incorrect teacher/student-visible output or answer visibility. | Keep only affected surfaces; geometry changes retain actual artifacts. |
| 9 | Commit exact evidence and hand off the declared review/QA/release route. | Review or release against the wrong candidate. | Keep. |

### High-risk persistence/auth change — 9 actions

Representative case: a user-affecting change to persistence/migration plus
authentication, permissions, or per-user isolation.

| # | Current action | Named failure closed | Baseline classification |
| ---: | --- | --- | --- |
| 1 | Verify exact production posture, worktree, fixed point, scope, and exclusive writer. | Stale production assumptions, wrong environment, or overlapping writer. | Keep. |
| 2 | Bind the accepted decision/spec/ticket and affected auth/persistence Interfaces. | Security/data semantics chosen implicitly during implementation. | Keep. |
| 3 | Run affected narrow authentication, authorization, isolation, admission, and consumer checks. | Unauthorized access, cross-user leakage, or invalid state acceptance. | Keep. |
| 4 | Prove migration/recovery/rollback and zero-partial-write behavior at the public persistence Interface. | Durable data loss, split state, or unrecoverable rollout. | Keep. |
| 5 | Run one final `pnpm -C app run verify:all` on the final candidate. | Cross-cut regression outside the narrow impact map. | Keep under current high-risk cadence. |
| 6 | Complete ordinary Standards + Spec closeout review and fixes inside implementation. | Direct implementation/spec defect. | Keep; no separate ordinary review task. |
| 7 | Pass one independent Standards/Spec review lineage. | Security or durable-data defect missed by the implementing context. | Keep. |
| 8 | Provision browser/owner QA only when user-visible behavior changed. | Broken login/permission/error/recovery experience. | Keep for this representative user-visible case; otherwise not counted. |
| 9 | Commit exact evidence and hand off the declared QA/release route; production change remains separately authorized. | Ambiguous candidate or accidental production mutation. | Keep. |

## Decision rule for Tickets 02–07

For every candidate mechanism, return the concrete failure it prevents, its
blast radius/reversibility/automation authority, the lighter existing closure
tested, and the deletion simulation. Classify `keep`, `downgrade`, `delete`,
`deepen`, or `split`. A large file, slow command, repeated name, or old artifact
is only a locator. Deletion is justified only when the named failure remains
closed without it; retention is justified only when a lighter existing
mechanism is insufficient.

No time, cost, quota, billing, defect-rate, flake-rate, or model-quality result
was measured in this ticket. Those fields remain unknown rather than inferred.
