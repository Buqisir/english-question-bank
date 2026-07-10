# CR — draft-student-field (E4)

- Reviewer: fresh Opus cold read (did not implement).
- Range: `b5bfdff..af8e80f` (incl. checkpoint `a442e2b`). Worktree
  `worktree-agent-a7c246116ea527404`. Working tree clean (all committed).
- Level: small-medium, additive nullable column + passthrough. CR-lite promoted
  to formal CR to adjudicate whitelist deviations.
- **Recommendation: APPROVE** (0 Must Fix). Should Watch below.

## Changed Scope

Whitelist-in: `app/src/domain/questionBank.ts`, `app/src/features/draft-paper/*`,
`app/src/features/my-space/*`, `server/draft-paper/draftPaperStore.mjs`,
`scripts/verify-draft-student-field.mjs` + registry (`verify-ci.mjs`,
`scripts/README.md`). Routes file (`draftPaperRoutes.mjs`) needed **no** change —
the update route already forwards `input` generically (line 107), so studentLabel
passes through unmodified; not touching an allowed file is fine.

Deviations from plan whitelist (three, all necessary/minimal):
- ① `draftPaperStore.mjs` lazy PRAGMA-guarded ALTER instead of `data/sql/schema.sql`.
- ② `server/my-space/mySpace.mjs` (+22) — plan **design** section requires the
  chip; whitelist omission.
- ③ `app/src/services/draftPapers.ts` (+1) — **not called out in the task**; a
  one-line `Pick<'title'>` → `Pick<'title'|'studentLabel'>` widening so the client
  can send the field. In-spirit (client analog of the route passthrough), minimal.

Forbidden (`server/api.mjs`, `server/search/**`, `print-renderer.mjs`,
`server/exports/**`, `shared/**`, `paper-intelligence/**`): **zero diff**,
confirmed from `git diff --stat` on those paths (empty).

## Deviation ① — lazy ALTER: DEV rationale is TRUE, design is correct

- `data/sql/schema.sql` has **no** `draft_papers` (grep empty) — the table lives
  in the user DB and its only evolution mechanism is `ensureUserDatabaseShape`
  in `server/api.mjs` (line 694, which itself does the `user_id`/difficulty
  ALTERs). That file is Forbidden. So the plan's `schema.sql` whitelist target
  was simply wrong; carrying the ALTER in the store is the correct place. **Deviation justified.**
- Idempotency: module flag + PRAGMA existence check + a second PRAGMA re-check
  inside the writable fallback before ALTER. verify proves it (legacy column-less
  row survives; column present after first read; re-running the shared migration
  does not crash with duplicate-column). Re-ran: **20 passed, 0 failed.**
- Readonly fallback (DEV's self-reported unconstructed path): a readonly GET /
  print-html first touch → `getDraftPaper`/`listDraftPapers` open `readOnly:true`
  → `ensureStudentLabelColumn` → `ALTER` throws readonly → opens a short-lived
  writable connection, ALTERs, closes → the readonly caller's subsequent SELECT
  sees the column (same sqlite file). The print-html route (line 183 readonly →
  getDraftPaper line 194) takes the **structurally identical** store path that the
  verify **does** exercise (`listDraftPapers` readonly self-open, line 114–125;
  re-`getDraftPaper` line 140). The specific HTTP route isn't constructed, but the
  store code branch (readonly userDb → writable fallback → column added → row
  survives null) is behaviorally covered. Accepted.

## Deviation ② — my-space live-join + PRAGMA defense: minimal and correct

`studentLabelSelectExpr(db)` emits `dp.student_label` when the column exists, else
literal `NULL`. Column-absent → `NULL AS source_draft_student_label` → `row.… || ''`
→ `''` → `MySpacePage` gates the chip on truthy, so nothing renders. Correct
degrade when a my-space read races ahead of any draft-paper write. Mirrors the
existing `sourceDraftTitle` live-join pattern. PRAGMA runs per call (no cache) —
cheap, and DEV comments the choice. Chip style is neutral (`--eqb-color-desk`
bg, border, `--eqb-color-text-muted`, 11px pill), non-墨绿, per plan; QA confirmed
visually.

## Hard boundary (student_label never on the paper face): CLOSED

- Whole-file grep: the only consumers of `student_label`/`studentLabel` are
  `mapDraftPaperRow` (output object) and `updateDraftPaper` (write). No print /
  export / block builder reads it.
- `buildDraftPrintHtml` (line 210, the real screen-preview + PDF print entry)
  derives everything from `buildDraftPaperExportInput` output + question-group
  details; it never reads `draftPaper.studentLabel`. PDF line
  (`exportDraftPaperPdf` → `buildDraftPrintHtml` → `print-renderer.mjs`) consumes
  the same HTML, and `print-renderer.mjs` is grep-clean per the backstop.
- Runtime QA (not in CI): fetched both print-html versions (student 13263 /
  teacher 20407 chars), `html.includes('王小明')` false on both. Same HTML print
  and PDF consume.

## Findings

### Must Fix
None.

### Should Watch (non-blocking)

1. **CI source backstop leaves the actual print entry uncovered.** The backstop
   slices only `buildDraftPaperBlocks` (153–178) and `buildDraftPaperExportInput`
   (178–196, ends at `addDraftFooterCss`). `buildDraftPrintHtml` (210) sits
   *after* that slice and is **not** asserted. It is clean today (delegates to the
   covered function, never touches `studentLabel`), and the runtime fetch-negative
   caught it — but that negative is **not in CI**. A future edit dropping the name
   directly into `buildDraftPrintHtml` would pass `verify:all`. Recommend
   extending the source backstop to also assert `buildDraftPrintHtml` is
   student_label-free. Does not block: field currently never renders.
2. **`app/src/services/draftPapers.ts` is a whitelist miss** (deviation ③,
   unflagged by the task). Correct and minimal, but record it so plan hygiene
   accounts for the client passthrough alongside the server passthrough.
3. **Readonly-fallback side effects, single-user only.** Opening the writable
   fallback connection triggers a full `ensureUserDatabaseShape` (api.mjs line
   674) as a side effect — heavier but harmless, once per process. On a brand-new
   DB with no `draft_papers` table reached readonly-first, the ALTER throws
   `no such table` (not readonly) and rethrows → 500; but the pre-change SELECT
   already threw there, so it is not a regression and is unreachable in the normal
   flow (readonly opens don't create tables). Negligible for a local single-user app.
4. **Concurrent title-debounce + student-blur PATCH race.** Both writers share the
   `saveStatus` machine and each sends only its own field; the server merges by
   `hasOwnProperty`, so no field is lost. Worst case is a cosmetic last-writer-wins
   on local `saveStatus`/`draftPaper`, reconciled on reload. Acceptable.

## Self-Review Blind Spots

- I did not spin up the HTTP server to construct the literal readonly GET/print-html
  route against a truly-unmigrated on-disk user DB; I traced the store path and
  relied on the verify's readonly self-open branch, which is the same store code.
- SQLite DDL-under-concurrent-readonly-connection lock behavior is judged safe by
  reasoning (no active read txn at migration time, single-user) rather than a
  contention test.
- The runtime paper-face negative rests on DEV's QA notes (fetch on both versions);
  I confirmed it at source level independently but did not re-run the browser fetch.

## Verification Evidence (re-run by CR, not copied)

- `node scripts/verify-draft-student-field.mjs` → **20 passed, 0 failed.**
- `node scripts/verify-draft-workbench-visual-unify.mjs` → exit 0.
  Whitelist `{138,152,338}`→`{149,163,349}` is a uniform +11 line shift tracking
  CSS growth; still gated on `#ffffff` + line, set size unchanged; added CSS uses
  `var()` tokens (no new hex). Mechanical, no behavioral loosening.
- `node scripts/verify-error-copy-mainline.mjs` → exit 0. Counts 10→11 reflect the
  real new `saveStudentLabel` catch; the safety assertion `clearsState.length === 0`
  is **unchanged** and the bump is a tightening (new catch must route through
  `describeError` and must not clear state). No loosening.
- `npx tsc --noEmit` (app) → exit 0.
- New script registered in `scripts/verify-ci.mjs` and documented in
  `scripts/README.md` — it actually runs in the gate.
- Forbidden paths `git diff --stat` → empty.

## Failure / Attack Angle

The one durable weakness is Should Watch #1: the paper-face invariant — the entire
point of the cut — is enforced in CI only for two helper functions, not for the
actual print-HTML entry `buildDraftPrintHtml`. A future agent adding a header like
`学生：${draftPaper.studentLabel}` into `buildDraftPrintHtml` would leak the name
onto every printed/exported paper and still pass `verify:all`, because the only
check that would have caught it (the browser fetch-negative) is not in CI. Today
the leak does not exist; the risk is regression durability, which is why it is a
Should Watch and not a merge blocker.

## Residual Risk

Low. Additive nullable column, passthrough-only, forbidden scope untouched,
behavioral verify green, paper-face boundary clean at source and runtime. Residual
risk is entirely the CI-durability gap (#1) and cosmetic single-user races (#3, #4).

## Recommendation

**APPROVE** — mergeable as-is. Address Should Watch #1 (extend backstop to
`buildDraftPrintHtml`) opportunistically; log #2 for plan hygiene.
