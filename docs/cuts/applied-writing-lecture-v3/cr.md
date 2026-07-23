# applied-writing-lecture-v3 · Fresh CR

Cut: `applied-writing-lecture-v3`

PR: none

Reviewer: `AWL-V3-CR-20260723-01` (`gpt-5.6-sol` / `high`)

Date: 2026-07-23

Reviewed runtime/data head:
`017164dc4697f6131747202b9a0c51b7d3593829`

Released CR input:
`43703387e4edce5790753250f19b1401ef6a10bb`

Remote handoff head:
`8e2819b269a391d0da4a9ce369b8469696de4dad`

Baseline:
`1deec0fce29852556bb60e0b2fd8a1fb6075f2d4`

## Changed Scope

- `git fetch github` resolved
  `github/codex/applied-writing-lecture-v3-20260722-01` exactly to the recorded
  handoff head. The released CR input is its ancestor.
- The baseline-to-runtime/data review diff contains exactly the plan's 16
  runtime/data files: schema/type 2, validator/verifier 2, pilot payloads 2,
  browse/writing runtime 5, and font/license/source files 5.
- No forbidden PaperSurface protocol, print/PDF/DOCX/export, student-mode,
  route, API, auth, production, migration, continuation asset, lockfile, or
  package path changed.
- The complete baseline diff contains 46 files because it also carries the
  allowed cut-local plan, prototype, screenshots, and QA evidence.
- The allowed runtime/data tree is byte-identical from the review head through
  the remote handoff head. The CR worktree was clean before activation.

## Findings

### Must Fix

1. **MF-1 — Every inactive writing answer box, including continuation, loses
   its real exam content.** `PaperBrowsePage.tsx:1465-1490` passes
   `answerBoxContent` for every `entry.kind === 'writing'`. Unless the
   application stage is active, that override is always
   `WritingAnswerBoxReview`; `WritingPaperPage.tsx:76-99` therefore never
   renders the original given-top/given-bottom content. This changes
   continuation from its starter lines to `解析未发布`, and replaces the
   application letter skeleton during non-lecture, loading, unavailable, and
   narrow-unsupported states. It directly violates the locked
   continuation-isolation and “preserve the ordinary 246 px answer box”
   contracts. Before merge, restrict the v3 action/replacement to application
   writing and preserve the original answer-box content in every inactive,
   loading, unavailable, narrow, and continuation path.

2. **MF-2 — Backend and frontend do not share the required whole-payload
   availability rule; the archived malformed test is a false green.**
   `writingAnalysisBackfillService.mjs:75-94` and
   `WritingAnswerBoxReview.tsx:23-45` accept leading/trailing whitespace in
   `reviewMarks[].note`; an exact-head mutation of the locked 2024 packet to
   `' malformed '` was accepted by the real backend validator. The frontend
   additionally checks none of the ten scalar review-card fields, so a partial
   `reviewCard` can publish and then render `undefined`. The DP-2 mutation at
   `qa/dp2-applied-writing-lecture-v3.mjs:71-82` uses precisely that accepted
   mark-note mutation. Its `解析未发布` locator can be satisfied by the
   mistakenly-added continuation button from MF-1, and it never clicks the
   mutated application answer box; zero stage DOM is therefore not proof that
   the application was unavailable. Before merge, make backend validation,
   frontend availability, and the rejection assertions symmetric for every
   review-card/mark/nested field, including trim-clean/plain/single-line rules,
   and scope the malformed browser assertion to the application group so the
   mutant demonstrably fails the current implementation.

3. **MF-3 — The production solver is not the owner-approved Variant A geometry
   and can route leaders through essay text.** The locked prototype includes
   the fifth `points[1]` lower-left preference only when its connector is
   `<= 72 px`, plus the injected-underlining micro-leader gesture. Production
   items at `WritingReviewAnnotationStage.tsx:278-295` retain no grid/index
   semantics with which to apply the fifth-mark rule, and
   `routeFrom` at `:56-86` starts horizontal/vertical routes outside the anchor
   rather than implementing the approved micro gesture. Candidate generation
   at `:144-163` checks only whether the note rectangle overlaps text; it never
   checks route samples against text obstacles. Both fallback paths at
   `:202-260` further drop route-crossing/text-traversal safety. A layout can
   therefore show 5/5 notes and 5 arrows while violating the accepted reading
   flow. Before merge, port the locked rules rather than substituting this
   simpler solver, including safe fallbacks or an explicit no-layout outcome
   that cannot produce crossing/text-traversing leaders.

4. **MF-4 — Several approved visible units are missing or mapped to the wrong
   typography.** The right rail at `PaperBrowsePage.tsx:1653-1667` renders only
   type, reader-cares, tense, and joined points; it omits the approved
   four-section structure (`基础五定`, numbered points, reader questions,
   value), the quiet paper-pointer, and has no `.awl-review-card` CSS anywhere
   in the repository. Mixed English/Chinese labels such as
   `On behalf of... 正式开篇` and review notes containing `could` are rendered
   wholly in Xiaolai by `writingPaperPage.css:239-258`; only the transfer line
   receives Shantell Sans, contrary to the locked “English annotation fragments
   use Shantell” mapping. The two tabs also have no left/right-key handler even
   though the spec requires bounded keyboard switching. Restore these approved
   visible units and interaction semantics without changing packet copy.

5. **MF-5 — DP-2 and font evidence cannot detect the principal contract
   regressions.** `stageGeometry()` only asserts stage/frame dimensions, note
   count, leader count, note containment, and note-note overlap. It does not
   assert leader crossings, leader-through-text, arrow direction, the fifth
   mark's 72 px rule, the micro leader, same-seed stability, reseed-only
   placement change, rail completeness, mixed-font mapping, or original
   answer-box preservation. The narrow test proves only a 628 px canvas, not
   the contract boundary at 794 mounted / 793 unmounted; runtime itself uses a
   `< 0.5` width tolerance at `PaperBrowsePage.tsx:399-410`. Font coverage is
   only a prose claim in `SOURCES.md:19-22`; no executable assertion reads the
   WOFF2 cmap. Before merge, make the archived behavioral assertions fail on
   each of these regressions and add the plan-required executable font coverage
   assertion. A viewport proxy is not sufficient for the 794/793 canvas check.

6. **MF-6 — The release proof remains non-green and the release diff fails the
   plan-named whitespace gate.** The original verification must remain
   `RELEASE GATE NON-GREEN`: its TypeScript command exited 1 and `verify:all`
   exited 1. The later diagnosis is credible but does not rewrite those exits.
   Independently, the correct TypeScript compiler run against this exact source
   tree exited 0 using the installed main-checkout toolchain. The three failing
   database scripts are byte-identical between the reviewed tree and the
   current main checkout and independently exit 0 against the current
   273-passage database, supporting the stale-worktree-database diagnosis.
   However, `git diff --check <baseline>..<review-head>` still exits 2 on
   `OFL-Shantell-Sans.txt:21` and `OFL-Xiaolai.txt:22`. Before merge, resolve
   those two tracked findings without silently weakening the gate, then run a
   new fresh exact-head verification after all fixes with the correct typecheck
   and a green full suite in a prepared current-data worktree or clean CI.

### Should Watch

- `paperAsset.ts` and nearby touched files include broad formatter-only churn
  unrelated to AWL v3. It is inside the allowed file set and not a separate
  correctness blocker, but the remediation diff should avoid compounding it.
- The JSON schema remains intentionally additive/optional while the production
  validator supplies the publish class. That is acceptable only if MF-2 restores
  exact validator/frontend symmetry; schema permissiveness must not be cited as
  frontend availability proof.

## Self-Review Blind Spots

- This CR did not rerun the archived Playwright DP-2 because the fresh CR
  worktree has no local `app/node_modules`. The original exact-head exit is
  preserved as evidence, while the assertions and their locators were
  cold-read. MF-2 identifies a deterministic false-positive path in those
  assertions.
- This CR did not perform owner-level visual judgment or pixel-compare the
  archived screenshots. It compared the locked visible-unit/gesture contract
  to production DOM, CSS, and solver behavior.
- The font source downloads and subsetting process were not independently
  rebuilt. Hashes and the source record were read; the absence of an executable
  cmap coverage assertion is itself recorded as MF-5.
- Export/print/student renderers were not executed because the exact diff does
  not touch them. Their file-level isolation is proven; the browse-only
  continuation regression is covered by MF-1.

## Verification Evidence

- Activation: `github` fetched; remote source
  `8e2819b269a391d0da4a9ce369b8469696de4dad`; released input ancestor check
  exit 0; allowed runtime/data diff after `017164d` empty; pre-write worktree
  clean.
- Scope: exactly 16 allowed runtime/data files; no forbidden runtime/data path.
- `node --check server/writing-analysis/writingAnalysisBackfillService.mjs`:
  original verification exit 0.
- `node scripts/verify-restart3-teacher-analysis.mjs`: fresh CR exit 0,
  148 passed / 0 failed. Mutation attack separately proved a trim-dirty
  `reviewMarks[].note` is accepted.
- Correct TypeScript compiler against the reviewed source:
  `/Users/huangxuewei/Projects/english-question-bank/app/node_modules/.bin/tsc
  --noEmit` from this worktree's `app/`: exit 0. The plan-named
  `pnpm -C app exec tsc --noEmit` could not resolve `tsc` in this fresh worktree
  because its dependencies are absent; this is environment evidence, not a
  green rerun of the original command.
- Payload parity: fresh CR exit 0 for both locked packets.
- Original DP-2: recorded exit 0, but not accepted as sufficient because MF-2
  and MF-5 show assertions that can pass without exercising the promised
  behavior.
- Database diagnosis: the three verifier file hashes match the current main
  checkout exactly; against its current database they independently exit 0 at
  `83/0`, `199/0`, and `12/0`. This attributes the original three failures to
  the verifier worktree's stale gitignored database; it does not change the
  original `verify:all` exit 1.
- Release `git diff --check`: exit 2, exactly two OFL trailing-whitespace
  findings.
- Full `verify:all` was not duplicated because runtime/data stayed unchanged
  and the original exact-head ledger already records the non-green result.

## Failure / Attack Angle

- A teacher opens a continuation group and sees `解析未发布` in place of the
  mandated starter lines; existing DP-2 still passes because it only checks
  that the application stage disappeared.
- A malformed application with a partial review card or trim-dirty review note
  is treated as published. The malformed DP-2 still finds the continuation
  group's unrelated `解析未发布` button and reports a false green.
- The solver places every note but sends an arrow through essay text or uses a
  long/ambiguous gesture for `要点②`. Count/containment checks remain green
  because they do not inspect the connector path.
- A future payload adds a code point absent from the subset font. The prose
  coverage count remains unchanged and every automated gate passes.
- A release operator accepts the PM diagnosis as if it changed the original
  exit codes, overlooks the two OFL findings, and merges without a new
  exact-head green verification.

## Residual Risk

- Geometry remains the highest-risk surface after remediation. If faithfully
  implementing the locked solver requires extra runtime files, taller paper,
  changed packet copy, a new layout abstraction, or more than two
  non-converging loops, stop under the plan's existing scope/contradiction
  rules rather than dilute the prototype.
- Browser/PO QA remains mandatory after a fresh verification and fresh CR close
  all Must Fixes. This report authorizes neither QA nor merge.

## Recommendation

**NOT MERGEABLE — 6 unresolved Must Fix findings.**

Return to PM for a bounded remediation disposition and a fresh DEV route. After
implementation, require new exact-head verification and a new fresh CR. Do not
reinterpret the original non-green verification as green, and do not start QA,
RM, merge, or deployment from this report.
