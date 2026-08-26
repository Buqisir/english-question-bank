# Format 2 real-parity frontier — 2026-08-26

Status: task-graph replan required
Fixed point: `ece39897b08390642c13bc0957f68e0cf0a8da70`

## Why this preflight exists

Tickets 01 and 02 proved the public Format 2 Job with a compact synthetic
fixture. Before treating Shenzhen Q33 and `paper-2026-i` as data-only parity
work, this preflight compared their accepted predecessor artifacts with the
generic schema, adapter, Candidate/Confirmation, Canonical, publication, and
consumer seams at the fixed point.

The comparison disproved the published frontier: Tickets 03 and 04 are not
data-only additions yet. Their legacy materializer and registry entry remain
supported until the applicable gaps below are resolved and real parity passes.

The full local ledger is outside the repository at
`/Users/huangxuewei/.codex/working-notes/format2-import-job-v1/parity-compatibility-ledger-2026-08-26.md`,
SHA-256 `7541ffcdcbbb2799b1def968eda636f99e04d1c40286597573788ed0527acd30`.

## Primary parity sources

### Shenzhen Q33

- `scripts/import-pipeline/papers/paper-mock-sz-2026-m1/config.json`
- `scripts/import-pipeline/papers/paper-mock-sz-2026-m1/visual-candidates/q33/source-capture-v1.json`
- `scripts/import-pipeline/papers/paper-mock-sz-2026-m1/visual-candidates/q33/visual-import-candidate-v1.json`
- `scripts/import-pipeline/papers/paper-mock-sz-2026-m1/visual-candidates/q33/visual-teacher-confirmation-v1.json`
- `scripts/import-pipeline/papers/paper-mock-sz-2026-m1/visual-candidates/q33/canary/`
- `app/public/paper-assets/paper-mock-sz-2026-m1/latest/`

### paper-2026-i

- `scripts/import-pipeline/pdf-extract.mjs` (`CONTENT['paper-2026-i']`)
- `scripts/import-pipeline/papers/paper-2026-i/source/`
- `scripts/import-pipeline/papers/paper-2026-i/listening/`
- `app/public/paper-assets/paper-2026-i/latest/`
- `test-fixtures/paper-import/paper-2026-i-canonical-pilot/reviewed-evidence/`
- `test-fixtures/paper-import/paper-canonical-ticket-35-owner-qa-content-successor/paper-2026-i-v1/`

## Accepted generic capabilities

The fixed point already closes exact PDF-pair admission, answer coverage,
source/answer mutation invalidation, durable retry/idempotency, atomic
publication/recovery, stable visual owner/media/source-span identities,
source-measured Q33 layout, exact reviewed-surface rebind, Reading-first
Listening `not_supplied`, existing Analysis contracts, Grammar prompt
provision, Application given-part facts, and shared Screen/Student
Print/Teacher Print/PDF consumers.

These capabilities remain useful. They do not make an unrepresentable real
source shape data-only.

## Complete blocker register

| ID | Status at fixed point | Real parity gap | Decision owner |
| --- | --- | --- | --- |
| B01 | no | Q33 accepted `source_crop.reproducibility` cannot reach the Candidate body, so exact Candidate/package digests and prior-confirmation rebind drift. | shared source-fidelity work |
| B02 | no | Seven Choices, Cloze, and Grammar Fill cannot retain source paragraph boundaries and interleaved blank order. | shared content-composition work |
| B03 | no | Complete provenance, content-node/page-region source maps, and literal printed-ordinal transformations cannot be retained. | shared provenance work or explicit parity narrowing |
| B04 | no | Shenzhen Reading A contains a real table nested inside `framed_columns`; the generic shape admits only string paragraphs. | shared content-shape work |
| B05 | no | Application and Continuation Writing source composition/current contracts do not replay faithfully. | shared Writing work |
| B06 | no | `paper-2026-i` has an accepted non-empty passage Figure caption; the generic path emits an empty caption. | shared Figure semantics work |
| B07 | no | Accepted Listening structured-document bytes/digests are not retained when the adapter reserializes compact JSON. | shared source-fidelity work or explicit identity narrowing |
| B08 | conditional no | Existing Canonical child IDs and semantic digests cannot all be reproduced. The named Q33 group/question/Option/media IDs are representable. | Owner defines the required identity boundary |
| B09 | no/unknown authority | `paper-2026-i` has no predecessor Visual Candidate plus exact Visual Teacher Confirmation for its table. Whole-Canonical confirmation cannot be reinterpreted as visual confirmation. | Ticket 04 requires normal direct Owner confirmation |
| B10 | conditional no | Generic publication does not recreate all exact legacy public extras and paths. | Owner defines whether semantic replacement or byte/path parity is required |

## Frontier ruling

- Tickets 03 and 04 remain blocked. Their retirement steps are forbidden.
- Tickets 05 and 06 remain downstream-blocked.
- The interrupted Ticket 02D worktree is unaccepted implementation evidence;
  it does not change this fixed-point result.
- Do not publish more lettered repair tickets from individual blockers.
- Replan the shared work only after the Owner decides B08 and B10. Group the
  remaining accepted requirements into bounded vertical units, then obtain one
  graph approval before implementation resumes.
