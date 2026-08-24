# 04 — Migrate Shenzhen Question 33 through exact Owner-confirmed media

Status: ready-for-agent
Blocked by: `01 — Bind visual candidates to exact Teacher Confirmation`; `03 — Render one Figure Option set across Screen, Print, and PDF`

Spec: `docs/cuts/source-faithful-visual-import/spec.md`

## What to build

Use Shenzhen first mock Reading D Question 33 as the first real canary for the
completed source-faithful Figure Option path. Preserve the existing 1380×220
strip as immutable source evidence, establish four source-position-bound Option
observations, and prepare coherent source-crop, vector-authored, and
reference-restored candidate sets at one fixed target-size intent.

Prepare the exact comparison state and stop for Owner visual confirmation. Only
after the Owner selects four exact candidate digests may the canary be migrated
locally. The resulting Canonical question has one literal stem, four stable
Figure Options, renderer-owned A–D labels, the existing source-backed answer,
and no detached whole-strip content or `[Fig.]` placeholder on any supported
surface.

## Acceptance criteria

- [ ] The original full-width PNG remains byte-identical immutable source
      evidence and the comparison baseline; it is not admitted as Passage
      content after migration.
- [ ] Four source observations bind source position to the existing A–D Option
      identities without using answer correctness to infer association.
- [ ] The comparison package contains four source-crop baselines, one coherent
      vector-authored set, and one coherent reference-restored set, all shown at
      the same target image-box size, background, and renderer layout.
- [ ] Each Option is checked independently for count, order, orientation,
      containment, connectivity, gaps, labels, dark/light regions, and every
      other source-authored relationship. Missing, added, swapped, relabeled,
      or topologically changed elements fail visual QA.
- [ ] The implementing Agent prepares the exact service, paper, question focus,
      candidate comparison, Screen, Student/Teacher Print views, and PDF, then
      stops. It does not approve visual fidelity on the Owner's behalf.
- [ ] Owner Confirmation selects four exact candidate digests, explicitly
      chooses the source-crop fallback, or leaves the canary unresolved. A mixed
      method is accepted only when each Option is individually reviewed and the
      combined set remains coherent at the shared target size.
- [ ] After confirmation, Question 33 contains one typed stem, four
      renderer-owned labels, four Option-owned Figures, zero `[Fig.]` strings,
      and no Passage-level duplicate of the old strip.
- [ ] The admitted `correctOptionId` and official answer remain unchanged; the
      canary is neither re-solved nor re-graded.
- [ ] The four selected digests and Option associations remain identical in
      Screen, Student Print, Teacher Print, and PDF. Normal-size QA is the
      acceptance view; enlarged inspection is diagnostic only.
- [ ] Existing Shenzhen Reading A `framed_columns`, the application-writing
      lamp, all other questions, and all unrelated paper assets remain
      unchanged.
- [ ] Focused canary and rendered-behavior checks, `pnpm -C app verify:paper`,
      one final `pnpm -C app verify:all`, one independent Standards review, and
      one independent Spec review are recorded. Every `SKIP` remains `SKIP`.
- [ ] The result remains a draft PR at the Owner QA stop. No production
      publication, deployment, R2 mutation, release action, or content push is
      performed by this ticket.

## Verification

- Compare every candidate against the immutable source at one fixed physical
  target size before requesting Owner confirmation.
- After confirmation, run the focused canary contract and cross-surface checks
  and capture exact-page Screen, Student/Teacher Print, and PDF evidence.
- Run the shared Paper pack during work and the full repository suite once at
  the final shared-contract gate; retain independent Standards and Spec review
  findings literally.
- Use the Owner QA handoff template so the Owner does not reconstruct the test
  state.

## Out of scope

- Migrating any other historical Figure paper or Option set.
- Changing Shenzhen Reading A `framed_columns` or the application-writing lamp.
- Automatic visual scoring, model self-approval, or answer-based image
  selection.
- Public SVG, mixed Option modes, website import UI, production publication,
  deployment, R2 mutation, merge, or content push.

## Result

Not started. Record exact selected digests, Owner decision, implementation
commit, all verification and review results, rendered evidence, and any
remaining unresolved visual issue here.
