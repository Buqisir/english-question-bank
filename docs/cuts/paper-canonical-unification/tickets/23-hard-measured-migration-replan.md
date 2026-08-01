# 23 — Hard measured migration replan checkpoint

Status: done
Blocked by: Ticket 22 independent review PASS
Next on PASS: owner exact manifest-digest approval
Terminal: no

## What to build

Use only the independently reviewed Ticket 22 measurements to propose the
remaining diagnostics-driven migration route, obtain explicit owner
granularity approval, and only then publish the exact approved follow-on
tickets and manifest.

## Acceptance criteria

- [x] The proposal derives every diagnostic cluster from Ticket 22's actual
      dispositions, evidence, shared recovery mechanisms, families, measured
      cost, and risk; historical guessed batch sizes are not reused as
      authority.
- [x] The first diagnostic cluster is a costed pilot, and every proposed
      ticket reserves implementation, ordinary review, and fix room within
      about 150K context.
- [x] Four boundary canaries and every remaining cohort are selected and sized
      from measured cost, diagnostic shape, and risk rather than preassigned
      paper counts.
- [x] The proposed route retains full-corpus semantic/accounting closure,
      supported Screen/Print/PDF artifact and recovery/rollback closure, the
      ordered six-family legacy retirement, independent review, owner QA, and
      repository release closeout.
- [x] Before any follow-on ticket or manifest is created or modified, the
      owner receives the complete numbered proposal with Title, Blocked by,
      What it delivers, old-ticket mapping, and proposed total count.
- [x] The task pauses in place for explicit owner granularity approval and
      iterates the proposal if requested; silence, prior approval, or agent
      judgment is not approval.
- [x] Only after that explicit approval may the exact approved follow-on set
      and manifest be published and digest-bound; before approval the tracked
      route remains unchanged.
- [x] This ticket performs no source/answer correction, corpus mutation,
      diagnostic-cluster implementation, canary, cohort migration, legacy
      retirement, release, production, or R2 work.
- [x] Appropriate route/document verifiers and `git diff --check` pass for the
      approved publication.

## Superseded-ticket mapping

- Old Tickets 21–50: their pre-guessed family correction batches are replaced
  by measured diagnostic clusters and one first costed pilot.
- Old Tickets 51–62: their preassigned canaries and cohorts are replaced by
  measured cost/risk sizing.
- Old Tickets 63–64: their full-corpus semantic, artifact, recovery, and
  rollback obligations remain mandatory in the measured follow-on route, with
  only Screen and Print/PDF artifacts.
- Old Tickets 65–70: their retirement order remains Cloze, Grammar Fill,
  Seven Choices, Reading, Application Writing, then Continuation Writing.
- Old Ticket 71: repository-only release closeout remains mandatory and still
  excludes production deployment, database/configuration mutation, R2
  synchronization, and production backfill.

## Result

Commit:
Verify:
Notes: Owner explicitly approved the complete measured proposal from Codex task `019fbdec-6f5a-7381-a0b7-53beb390b387` with: “批准 Ticket 23 measured replan 的逐票粒度，按 Tickets 24–53、总票数 53 发布。” Tickets 24–53 and the replacement manifest are published exactly at that approved granularity. This approval does not approve the manifest's exact SHA-256 and does not authorize Ticket 24.
