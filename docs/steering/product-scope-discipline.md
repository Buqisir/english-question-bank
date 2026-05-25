---
inclusion: auto
---

# Product scope discipline protocol

Scope: applies to product and UI decisions in the
`Buqisir/english-question-bank` repository, especially PaperSurface,
Paper Intelligence, insight, evidence, difficulty, basket, reading
mode, and teacher workbench surfaces.

Authoritative rule: before adding or preserving a feature in a UI,
ask which user task it belongs to. If the feature does not clearly
serve the current task, push back hard and move it to a better entry
point, backlog it, or cut it.

---

## 1. The hard question

For every visible feature, PM / PA / CR must ask:

- What is the teacher trying to do right now?
- Does this information help that task immediately?
- Would showing it here interrupt reading, teaching, or question
  analysis?
- Is this feature useful, or merely impressive because it is AI-made?
- Does it belong in this surface, or in a separate workflow?

Do not accept "we have the data" as a reason to show the data.

## 2. Pushback rule

If the user proposes adding or keeping a dense feature because it
feels advanced, PM should challenge it directly.

Use this tone:

- be honest, not flattering
- name the user task being harmed
- distinguish "valuable somewhere" from "valuable here"
- recommend cutting or moving the feature when the current surface
  gets noisy

The PM should not merely say "good idea" when a proposal risks
turning a focused workbench into an AI dashboard.

## 3. PaperSurface-specific rule

PaperSurface is primarily a paper-reading and lecture-analysis
surface.

Default priority:

1. the A4 paper remains readable
2. question analysis stays available
3. evidence support stays understandable
4. lightweight passage structure can help the teacher orient
5. dense AI diagnostics are secondary

For PaperSurface insight, prefer a short "passage map" over a full
AI diagnostic panel:

- one-sentence passage structure summary
- paragraph / section outline
- only the minimum labels needed to help teaching flow

Avoid putting these dense diagnostics inside PaperSurface insight
unless there is a specific teacher task that requires them there:

- vocabulary-load scoring
- grammar-load scoring
- evidence-difficulty scoring
- theme-background scoring
- large load bars / dot systems
- long key-chunk lists
- AI difficulty dashboards

These may belong in a separate workflow such as "按 AI 难度找题".
If that workflow proves weak later, it can be cut without damaging
PaperSurface.

## 4. Warning signs

Push back when any of these happen:

- a panel needs repeated width, z-index, overflow, or breakpoint hacks
  just to fit
- a feature competes with the paper for attention
- the user cannot explain the teacher task in one sentence
- the same data is being shown because it exists in the report
- the design starts looking like an admin dashboard rather than a
  teacher workbench
- QA keeps finding "it is visible but it blocks / crowds / confuses"
  bugs
- the team keeps asking for more mockups or another PA pass because
  nobody has made the product decision
- a DEV implementation needs increasingly fragile width, z-index,
  resize, or zoom workarounds to preserve a visual idea

When these signs appear, first ask whether the feature belongs here.
Do not keep polishing layout around a wrongly placed feature.

## 5. Better decisions

Prefer these moves:

- shrink the feature to the minimum task-specific version
- move advanced diagnostics to a separate entry point
- backlog the feature until its user task is clear
- split "orientation" from "analysis" instead of mixing them in one
  panel
- cut the feature if it creates more UI debt than teacher value
- stop after two inconclusive visual rounds and return to the teacher
  task instead of generating more variants
- stop before DEV when PA leaves more than three unresolved PO
  decisions

Example:

In PaperSurface passage insight, a paragraph-structure outline may
serve the immediate teaching task. A full AI difficulty system may be
valuable, but it belongs in a separate "按 AI 难度找题" workflow rather
than the A4 paper page.

## 6. Retrospective rule

When a feature is cut, moved, or simplified because of task mismatch,
record it in the Cut Note or daily product log.

Name both:

- the wrong impulse, e.g. "show all AI diagnostics because they look
  impressive"
- the better product rule, e.g. "PaperSurface insight is a passage
  map, not a difficulty dashboard"

This helps future agents learn the product taste instead of repeating
the same UI fight.
