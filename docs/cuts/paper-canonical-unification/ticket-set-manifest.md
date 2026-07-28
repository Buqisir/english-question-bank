# Paper canonical unification amended replacement ticket-set manifest

Status: published; owner manifest-digest approval pending
Source phase: fresh to-tickets re-entry after owner scope amendment
Source HEAD: `b41ad774bca35864fce21aa80a19d0dbfcb9e91c`
Accepted spec: `docs/cuts/paper-canonical-unification/spec.md`
Accepted spec SHA-256: `c6cbbe778d94e1205612fa5ac535e2198020317b09064190fec1d0b6660d868b`
Bound Wayfinder map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`
Bound Wayfinder map SHA-256: `a7f94131c90f9fdcdb91155073e29776cff599410f77783f84bfa15bb485b200`
Preserved completed ticket count: 15
New unfinished-route ticket count: 8
Current total ticket count: 23
Unique initial implementation frontier after all four gates pass: Ticket 16
Implementation dispatch: forbidden
Coordinator dispatch: forbidden

## Binding

This manifest binds the owner-approved replacement route: completed Tickets
01–15 remain the accepted baseline, and Tickets 16–23 replace only the
unfinished route under the amended specification.

Before publication, the owner received every proposed Title, Blocked by edge,
What it delivers statement, old-ticket mapping, and the proposed current total
of 23 tickets. The owner explicitly approved that granularity and required two
hard boundaries:

1. Ticket 22 is zero-write diagnostics only and may not repair corpus
   problems.
2. Ticket 23 may only use measured Ticket 22 results to propose follow-on
   tickets and must wait for fresh explicit owner approval before publishing
   them.

The owner has approved the proposal but has not yet approved this manifest's
exact SHA-256. Every current ticket path, byte, SHA-256, blocker, route field,
bound authority, or manifest byte change invalidates any later digest approval.
Implementation and coordinator dispatch remain forbidden until the owner
separately commits approval of the exact current manifest digest and all four
implementation gates verify.

## Superseded historical route

The former Tickets 16–71, their manifest, and their bound owner approval are
preserved byte-for-byte under
`docs/cuts/paper-canonical-unification/history/2026-07-26-superseded-ticket-set/`.
That directory is historical evidence only, is outside the current tracker
path, is absent from this manifest, and must never be used as parallel dispatch
authority.

Historical manifest SHA-256:
`462290bb40ac17c3adf8db4f2b09d29d30d6fb78958b05b63174f6a3c9a5f476`.

Historical owner-approval SHA-256:
`a0475a4d4dd51a8d80d706bd3ea62b38bc4ff2387c47ea15dcf308bdd858d267`.

## Route and checkpoints

- Ticket 16 is the sole possible implementation frontier after the four
  implementation gates pass.
- Ticket 16 requires independent review and exact-HEAD owner QA before Ticket
  17.
- Ticket 17 requires independent review before canonical import admission.
- Tickets 18–20 preserve Atomic Import Admission,
  Recovery/Retry/Rollback, and Backend Pilot in that order.
- Ticket 20 requires independent review and exact-HEAD owner QA before the
  frozen-corpus phase.
- Ticket 21 freezes the 33-paper denominator.
- Ticket 22 performs zero-write compile-only diagnostics, performs no corpus
  fix, and requires independent review.
- Ticket 23 is a hard measured-replan checkpoint. It cannot implement or
  publish a diagnostic cluster, canary, cohort, retirement, or release route
  before a fresh complete proposal and explicit owner granularity approval.
- No ticket after Ticket 23 exists yet. The eventual initiative total is
  intentionally unknown until measured diagnostics make it defensible.

## Preserved completed baseline

| Ticket | SHA-256 |
| --- | --- |
| `docs/cuts/paper-canonical-unification/tickets/01-canonical-foundation.md` | `9e70c9e90fb4459dbc87b8d93181a15647aa3bb592c7a5388fe1710e56ae45e7` |
| `docs/cuts/paper-canonical-unification/tickets/02-route-authority-repair.md` | `04ce4fb192fee857f7170151283f83c63f0e650a70c189996ea0af608b55c19d` |
| `docs/cuts/paper-canonical-unification/tickets/03-cloze-grammar-canonical-publication.md` | `925ecfe91390903af0d9eedd497d8d01152a0deecfd8d8d0dacc5906d5a7b0d4` |
| `docs/cuts/paper-canonical-unification/tickets/04-shared-abcd-rendered-placement.md` | `16b5129c84e832337c4e2df5f3a39f8ec891846416aff7b94cc0141f89f67322` |
| `docs/cuts/paper-canonical-unification/tickets/05-cloze-grammar-canonical-consumption.md` | `55801572beb9f786da19d21e063a550a4a196fe9784dcc1190d67dc5b03819c5` |
| `docs/cuts/paper-canonical-unification/tickets/06-seven-choices-canonical-publication.md` | `a5dc27b0b2d06b0472b1aa0191c888226dc570d933130051c1a4e88d114749de` |
| `docs/cuts/paper-canonical-unification/tickets/07-seven-choices-rendered-behavior.md` | `c12880f871fc058ffa84aebcebae7ebf83445c2e9cd38733e5e98911ec46cc0f` |
| `docs/cuts/paper-canonical-unification/tickets/08-reading-canonical-publication.md` | `c116559d1a32a7e0f945734a8e28c853e178318c562af399818a508370b8bbf6` |
| `docs/cuts/paper-canonical-unification/tickets/09-reading-rendered-behavior.md` | `859f32b784a20e9fa14b3bc29f9ddc84ca4786a0fb402a933a1bfc57b02d0d9d` |
| `docs/cuts/paper-canonical-unification/tickets/10-application-writing-canonical-publication.md` | `1a6fa5adce51f15c8f68ad8c390531837f13877d5efec180ca7311cb07c7e833` |
| `docs/cuts/paper-canonical-unification/tickets/11-application-writing-rendered-behavior.md` | `284f12dd3a4eb511d5894be4d74ae3ab017edd4e4d0e5871c400f8a5e2e3db2d` |
| `docs/cuts/paper-canonical-unification/tickets/12-continuation-writing-canonical-publication.md` | `e2d28a7af7853e6d6af71a9725b44f7bbfce11e88480ba79906abdb530991abf` |
| `docs/cuts/paper-canonical-unification/tickets/13-continuation-writing-rendered-behavior.md` | `a8ceabbe8b0ceae7acdc4ca1b933ae3f4b71e999faf6e4146553c5af01578406` |
| `docs/cuts/paper-canonical-unification/tickets/14-listening-inactive-canonical-closure.md` | `d5836012a1b129319cbd4b0c75b3ee758401a0c9f5e1bb5b5fd9d4abfe7b177f` |
| `docs/cuts/paper-canonical-unification/tickets/15-listening-zero-occurrence-proof.md` | `e935b4dc172c92f9aa6458e70c60e65e5553a2d744d5ec09c63abd804b313439` |

## Approved replacement route

| Ticket | SHA-256 |
| --- | --- |
| `docs/cuts/paper-canonical-unification/tickets/16-disconnect-generated-docx-capability.md` | `e41d9e335c066d22dae99ace1816c5e1b611e49eb8597db9704a0c9ef93b76e0` |
| `docs/cuts/paper-canonical-unification/tickets/17-delete-docx-output-implementation.md` | `92614ac355c1cf19de25575828944fd8795a950ca16d2ac3f09255221c7cd2bf` |
| `docs/cuts/paper-canonical-unification/tickets/18-atomic-canonical-import-admission.md` | `d482db1d5dca39eecca9bc8bd95bc0fc42a77cd5fa3cd60255989148d017dfc0` |
| `docs/cuts/paper-canonical-unification/tickets/19-import-recovery-retry-rollback.md` | `6abdf76b554ad8f11c7394a66f1143f45418639a04530ba6533cb6822f1655aa` |
| `docs/cuts/paper-canonical-unification/tickets/20-backend-canonical-import-pilot.md` | `b1eb6b765f81806507d2a44e77cd1db3c5c41a77b6302e554c4d3df8a9f831f8` |
| `docs/cuts/paper-canonical-unification/tickets/21-freeze-corpus-migration-ledger.md` | `1f25438f9e9a4fb7cf86755b99251310a5e56741bab767635fe74da8b08847c9` |
| `docs/cuts/paper-canonical-unification/tickets/22-full-corpus-zero-write-dry-run.md` | `0c3dff2f039e8f2af6e9237367bfd244c6e3d9a3973be7290853d7194744dca2` |
| `docs/cuts/paper-canonical-unification/tickets/23-hard-measured-migration-replan.md` | `6a88ee82808be4f6330bc80be84fc556ae3ec46f596fc5d33479fc27e7a613e0` |
