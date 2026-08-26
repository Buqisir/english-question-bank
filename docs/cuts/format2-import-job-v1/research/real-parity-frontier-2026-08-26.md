# Format 2 real-parity frontier — 2026-08-26

Status: Owner-approved graph; Ticket 04 implemented
Fixed point: `ece39897b08390642c13bc0957f68e0cf0a8da70`

## Why this preflight exists

Tickets 01 and 02 proved the public Format 2 Job with a compact synthetic
fixture. Before treating Shenzhen Q33 and `paper-2026-i` as data-only parity
work, this preflight compared their accepted predecessor artifacts with the
generic schema, adapter, Candidate/Confirmation, Canonical, publication, and
consumer seams at the fixed point.

The comparison disproved the original published frontier: Shenzhen Q33 and
`paper-2026-i` were not data-only additions yet. Their parity work has moved to
Tickets 05 and 06. Their legacy materializer and registry entry remain
supported until the applicable shared tickets and real parity pass.

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

## Complete blocker register and approved ownership

| ID | Status at fixed point | Real parity gap or Owner decision | Approved owner |
| --- | --- | --- | --- |
| B01 | no | Q33 accepted `source_crop.reproducibility` cannot reach the Candidate body, so exact Candidate/package digests and prior-confirmation rebind drift. | Ticket 03 |
| B02 | no | Seven Choices, Cloze, and Grammar Fill cannot retain source paragraph boundaries and interleaved blank order. | Ticket 03 |
| B03 | no | Complete provenance, content-node/page-region source maps, and literal printed-ordinal transformations cannot be retained. | Ticket 03 |
| B04 | no | Shenzhen Reading A contains a real table nested inside `framed_columns`; the generic shape admits only string paragraphs. | Ticket 04 |
| B05 | no | Application and Continuation Writing source composition/current contracts do not replay faithfully. | Ticket 04 |
| B06 | no | `paper-2026-i` has an accepted non-empty passage Figure caption; the generic path emits an empty caption. | Ticket 04 |
| B07 | no | Accepted Listening structured-document bytes/digests are not retained when the adapter reserializes compact JSON. | Ticket 03 |
| B08 | resolved by Owner | Preserve paper/slot/group/question/Option/media identities, order/numbering, answers, owners, and source bindings. Compiler-owned block/inline/row/cell/blank/writing-task and `bank`/`shared-bank` child IDs need only be deterministic, unique, and internally closed; recompute `semanticDigest` from successor semantics. | Ticket 03 uniquely owns the shared schema/adapter implementation; Tickets 05–08 only verify the applied boundary |
| B09 | retained human stop | `paper-2026-i` has no predecessor Visual Candidate plus exact Visual Teacher Confirmation for its table. Whole-Canonical confirmation cannot be reinterpreted as visual confirmation. | Ticket 06 requires normal direct Owner confirmation |
| B10 | resolved by Owner | Require semantic parity for active Screen, Student/Teacher Print, PDF, Analysis, and question listing/detail/search/similar/figure consumers through the Canonical Consumer Interface or one bounded read-only Adapter. Do not recreate exact legacy answer-key/import-meta/Listening paths or canonical-media figures manifests; unaffected historical assets remain supported. | Ticket 04 |

## Owner-approved graph ruling

- Ticket 03 is ready. It owns B01, B02, B03, and B07 and uniquely owns B08
  shared schema/adapter implementation in the
  schema/validator/trusted-adapter/compiler source-evidence seam only. Tickets
  05–08 verify the applied B08 boundary; they do not own or reimplement it.
- Ticket 04 is implemented after Ticket 03. It closes B04, B05, B06, and B10
  in the shared rich whole-paper and active-consumer compatibility seam.
- On 2026-08-26 the Owner approved one scoped Format 2 rich Candidate authority
  successor after the executable v46 closure rejected the modern Continuation
  contract. It combines the existing Reading Figure capability with a new
  versioned modern Continuation family and source-v2 closure. Format 2 Job alone
  binds the exact digest-bound ref; global/current authority, historical
  authorities/assets, renderer/CSS, and paper data do not change. The merger
  gate therefore adds `verify:paper`, one final `verify:all`, and one
  independent Standards/Spec review.
- Ticket 05 is ready to replay Shenzhen Q33 as per-paper data and retire the
  Q33-only materializer only after parity.
- Ticket 06 may proceed to its normal direct Owner visual confirmation required
  by B09. It replays `paper-2026-i` and retires its registry entry only after
  parity.
- Ticket 07 is blocked by Tickets 05 and 06. It imports Jining from its admitted
  source pair to exact Teacher Confirmation.
- Ticket 08 is blocked by Ticket 07 and that exact Owner confirmation. It
  resumes Jining, prepares rendered Owner QA, and closes the cut.
- The interrupted Ticket 02D worktree remains unaccepted implementation
  evidence and cannot satisfy Ticket 03. Do not publish additional lettered
  repair tickets from an individual blocker.
