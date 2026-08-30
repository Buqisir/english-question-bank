# Orb 导题与单卷生产发布闭环

Status: implementation candidate
Date: 2026-08-30
Production activation: blocked on later direct Owner approval

## Outcome

Complete the generic loop without putting an LLM or deployment action in the
website:

```text
Owner source ledger -> private project Orb import -> Import Review -> approved
  -> explicit Owner ship command -> server-side single-paper promotion -> published
```

The source-intake and Review databases remain the control plane. Candidate
bytes remain private until one exact approved revision is separately promoted.

## Fixed boundaries

- The source queue, claim/lease/heartbeat, immutable submission, exact download,
  init receipt, `needs_owner`, and handoff invariants from ADR-0018 remain.
- Import Review approval and production publication are different human acts.
- Canonical Paper is the semantic authority. Promotion reuses the accepted
  compiler/projector/publisher and never reconstructs paper meaning.
- Screen, Student Print, Teacher Print, and PDF consume the same committed
  Canonical Publication. Student outputs hide answers and official samples.
- Routine project Orb workers have only the import-agent token. The distinct
  shipping credential is used only after a current explicit ship command.
- No consumer-site import UI, web LLM, automatic publish button, paperId special
  case, whole-DB upload, synchronous R2 write, or real-paper fixture enters this
  implementation.

## 1. Durable Orb worker binding

### State and identity

`source_intake_orb_workers` owns one row per immutable submission:

```text
unbound -> reserved -> bound -> needs_owner | handed_off
                       ^             |
                       +-------------+ (re-notify resumes the same thread)
```

The row binds submission id/digest, webhook event id, finite reservation token
and expiry, Amp thread id, optional handoff paper id, state, and timestamps.
The source submission remains the queue-state authority; the worker row is only
the durable orchestration identity.

### At-least-once sequence

1. The plugin validates the exact allowlisted webhook payload and HMAC.
2. It reserves the immutable submission with `event.id` using the import-agent
   credential.
3. `resume`: append the fixed prompt to the already-bound private thread with
   `steer: true`.
4. `create`: create a private `executor: 'orb'` thread with multiplayer off;
   bind `thread.id` using the reservation token; append only after bind succeeds.
5. `busy`: another non-expired reservation owns creation; do nothing. A later
   webhook or retry may take over only after expiry.

Concurrent or stale bind attempts fail. A create/bind crash can leave one empty
thread but cannot leave an unbound prompted worker. Duplicate append is safe:
the prompt is a resume instruction and the server claim remains exclusive.

### Worker API and local proof

- Project Secret: `QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN`.
- Non-secret project environment: `QUESTION_BANK_IMPORT_OPS_ORIGIN`.
- Orb CLI requests send runtime `AMP_THREAD_ID`.
- If a bound worker exists, claim and every lease-protected operation require
  that exact thread id. Existing unbound manual recovery remains compatible.
- Claim/download receipts and source files stay mode 0600 under the gitignored
  inbox. The initialization receipt also binds Amp thread id. Handoff records the
  same thread/submission/digest/paper relation in the server transaction.

Pause, timeout, inference failure, missing secret, stale lease, stale
reservation, digest mismatch, and conflicting paper id all fail closed. The
plugin remains inert until separately enabled and connected.

## 2. Single-paper promotion

### Authority and request

The machine command requires one of:

```text
review.mjs promote <paperId> --owner-said-ship
review.mjs promote <paperId> --owner-said-retry-ship
```

The first command must follow a current Owner `上线 <paperId>` statement. Retry
is only for the same exact failed/interrupted promotion after a current Owner
`重试上线 <paperId>` statement. Flags are audited assertions, not substitutes
for the human command.

The command reads the latest approval with the low-authority token, displays the
exact revision and digests, then submits them with the separate shipping token.
The server rejects the low-authority token on the promotion route.

### Server transaction protocol

1. `BEGIN IMMEDIATE` in Import Review; verify latest Candidate revision is
   approved, renderer-current, digest-identical, issue-free, and byte-complete.
2. Insert a shipping guard and a `publishing` promotion receipt bound to the
   exact approval/revision/digests; commit this control transaction before the
   first formal publication write.
3. Re-read and digest-check the immutable revision files. Deterministically
   derive Teacher Confirmation, Canonical request, compatibility package, and
   five analysis sidecars from that revision.
4. Call `publishUniversalNck1Import` against the production question-bank DB and
   paper-assets root. Its existing staging, version journal, DB transaction,
   latest swap, Canonical current ref, rollback, and recovery stay authoritative.
5. Re-open/inspect the committed version and exact five-sidecar digest.
6. In one Import Review transaction, record the immutable `published` receipt
   and remove the matching shipping guard.

### Recovery matrix

| Failure point | Required result |
| --- | --- |
| before guard | no write |
| guard/`publishing`, before content | guard remains or known admission failure records `failed`; no public paper |
| version/latest/DB before commit | publisher restores prior DB/current/latest and removes the attempted immutable version |
| content committed, receipt missing | state stays `publishing`; exact retry recovers the same version and completes the receipt |
| duplicate successful call | inspect exact receipt/current state and return no-op |
| newer revision/issue/re-approval attempt while publishing | rejected by shipping guard |
| retry identity differs | rejected; old guard is not reused for different content |

An explicit abort remains a separate Owner-authorized recovery action after the
old process is proven absent and production state is inspected. Unknown failures
never auto-release the guard.

### Audit and status UI

Review status exposes only audit metadata: `approved`, `publishing`, `published`,
or `failed`; approval/revision ids; version; Canonical digest; and timestamps.
The Owner rail continues to show a copyable spoken command, never a publish
button. Agent/member permissions do not widen.

## 3. Legacy transport and backups

- `pull-run-push push <paperId>` refuses Review-backed paper publication once the
  server advertises this protocol. `pull` and maintenance checks remain.
- No Orb uploads `question-bank.sqlite` or synchronizes a broad asset root.
- Previous immutable paper versions remain available to the existing rollback
  seam. The daily online R2 backup remains the off-site disaster-recovery layer;
  promotion reports that boundary honestly and does not report R2 success.

## Acceptance criteria

### Orb worker

- [ ] Duplicate delivery and concurrent delivery create/resume one bound thread.
- [ ] Crash windows never append a prompt before durable bind.
- [ ] Bound-thread mismatch cannot claim, heartbeat, download, `needs_owner`, or
      handoff.
- [ ] Lease expiry, pause/resume, digest recheck, init, and handoff remain valid.
- [ ] Mac runner setting is absent from the default plugin contract.

### Promotion

- [ ] Approved synthetic Candidate is absent from ordinary DB/assets before ship.
- [ ] Agent token cannot promote; ship token cannot be equal to agent token.
- [ ] Exact promotion writes only one paper and one version with formal rows,
      Canonical current ref, five analyses, `versions/vN`, `latest`, and media.
- [ ] New revision/issue/approval drift fails before content write.
- [ ] Forced pre-commit failure restores DB/files; committed-reload retry returns
      the same version; duplicate success is no-op.
- [ ] Screen, Student Print, Teacher Print, and PDF bind the same Canonical
      publication; Student hides answers and official model answers.
- [ ] Review exposes audit state without a web publish button.
- [ ] Whole-DB paper push refuses and points to single-paper promotion.

## Verification

- focused source-intake + webhook/Orb idempotency verifiers;
- focused promotion auth, concurrency, failure/recovery, nonvisibility, and
  receipt verifier on anonymous synthetic fixtures;
- `pnpm -C app verify:changed` security/public seams;
- because v49 changes the shared Paper contract: `pnpm -C app verify:paper`,
  affected Screen/Student/Teacher/PDF checks, then one final
  `pnpm -C app verify:all`;
- report every PASS/SKIP/FAIL literally and reproduce baseline failures against
  unchanged `origin/main` in the same environment before classifying them.

## Production hold

Repository implementation and synthetic verification do not authorize plugin
enablement, Project Secret installation, webhook registration, push, deploy,
production DB/config writes, R2 action, or real Qingdao/CQ8 upload/review/
approval/promotion. Stop and request direct Owner approval in this thread before
any such action.
