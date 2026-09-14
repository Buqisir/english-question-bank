# App-only CI cutover

Historical Amp-authority cutover evidence. For the reverse migration and current
Ship instructions use [GitHub Actions cutover](github-actions-cutover.md) and
ADR-0026. The procedures below do not authorize restarting the old CI system.

## Normal operation

GitHub webhook → trusted CI controller → isolated Fast/Full lanes → GitHub
`Amp Orb Verify` Check. Read that exact-SHA Check directly on GitHub for normal
Ship; do not send Focused/Low a per-commit reporting task, wait for an agent, or
retrieve private receipts as a gate. The original High thread is only the
infrastructure host. Low is used only when troubleshooting is requested.
Receipts and logs support recovery/diagnosis, not a second authority.

## Boundary and evidence

The Owner goal is to replace Hosted Verify with the existing signed GitHub
webhook → dedicated CI Orb → `Amp Orb Verify` Check. Production application,
Deployment Orb configuration, and Secrets are out of scope. Keep Hosted and
its existing rules until both failure-blocking and success-admission evidence
are verified. Never merge the deliberate failure probe.

The trusted App is numeric ID **4835036**, slug
`eqb-amp-ci-authoritative-checks`. Match name, numeric App ID, exact SHA and
`v4:<testedSha>:<naturalDeliveryId>` for main; text or Commit Status names are not trust.
For a PR, query its **current head SHA**, with
`v5-pr:<number>:<headSha>:<baseSha>:<testedSha>:<naturalDeliveryId>`. The tested
merge retains exact ordered base/head parents; the controller additionally
requires base ancestry in head and equal tested-merge/head trees. For deployment, only
the exact live `main` SHA qualifies. A newer pending or failed Check is not
replaced by an older success.

Observed 2026-09-06, before any cutover by this task:

- Main `1120ec08b9cbace150124c8e588346c7fe70b715`: Check
  [101404346983](https://github.com/Buqisir/english-question-bank/runs/101404346983),
  completed success, trusted App, Fast 98.0s, Full 657.5s,
  PASS 164 / SKIP 3 / FAIL 0, tracked clean.
- Main `45c8d8c24ba51acc409bbcf80bc28cad68f60fe9`: Check
  [101422114883](https://github.com/Buqisir/english-question-bank/runs/101422114883),
  completed success at 03:44:46 UTC. These are historical exact-SHA successes,
  not authority for a subsequently advanced main.
- [PR #351](https://github.com/Buqisir/english-question-bank/pull/351): head
  `8f80612d26c71313357bb364678bf02613a39c1d`, base
  `45c8d8c24ba51acc409bbcf80bc28cad68f60fe9`, test merge
  `b041afec366fd3458544837136b9f6e67b3af280`; original natural opened delivery
  `7e04f1e0-a9a4-11f1-8bea-e9056fb3fba0`. Check
  [101423651801](https://github.com/Buqisir/english-question-bank/runs/101423651801)
  started at 03:46:59 UTC. Matching private 0600 queue and receipt prove
  enqueue, merge resolution and POST succeeded. It was initially mistaken for
  missing because it is not attached to the head SHA. Full hit the deliberate
  TS2322 probe. The same Check completed **failure** at 03:48:49 UTC:
  Fast PASS 104.8s / Full FAIL 17.8s / tracked clean. GitHub reported the PR
  blocked, but this task cannot independently attribute that to the App rule
  without protection access. The approximately eight-minute ingress-to-start
  delay has no proven historical cause.
- PR351 success after removing the probe: head
  `2b63cda4a0b417c9be8b262cf71404dfface2e44`, same base, current test merge
  `f6b23d313b60ca600889c07ed4a9df2f094762bb`. Natural synchronize delivery
  `94857af0-a9b0-11f1-8ad9-632d12729a5e` produced Check
  [101440529442](https://github.com/Buqisir/english-question-bank/runs/101440529442)
  from App 4835036, completed **success** at 06:33:46 UTC. Independent GitHub
  reread confirmed exact name, SHA, App and external ID. Fast PASS 101.3s /
  Full PASS 707.4s / PASS 164 / SKIP 3 / FAIL 0 / tracked clean. The three SKIPs
  are i16a's external fixture, paper-assets DB cross-check, and list-groups DB
  performance; none is counted as PASS. The CI host matched the 0600 receipt
  and natural delivery; queue removal was automatic, with no manual replay.
  GitHub now reports OPEN/unmerged/MERGEABLE/**UNSTABLE**, not CLEAN:
  `UNSTABLE` means "Mergeable with non-passing commit status", whereas
  `BLOCKED` means "The merge is blocked." This completes the observed
  failure/blocking → success/admission acceptance. Do not merge this probe PR;
  its success is not authority for a later main SHA or a production deployment.
- This task's credential can read checks and webhook metadata, but REST
  `branches/main/protection` and GraphQL `branchProtectionRules` return 403.
  Repository `permissions.admin: true` does not grant that integration the
  endpoint permission. Rulesets list was empty. No rule mutation has been made
  by this task; do not infer that main is unprotected from the 403.

The changed deployment reader was also exercised read-only against these real
GitHub responses: main `45c8d8c2…` success accepted; PR351 test-merge failure
rejected; that main success reused for the other SHA rejected; the same Check
under a different pinned App ID rejected. These prove reader behavior, not
GitHub branch-rule enforcement or production deployment.

## Rule evidence and cleanup status

The parent task's human UI record confirms `Amp Orb Verify` from the dedicated
App is the **only required Check**, pending disables merge, and non-CI
protections were preserved. The earlier UI observation recorded linear history,
administrator bypass disabled, and force pushes/deletions disallowed. No API
policy snapshot or saved strict/up-to-date readback is available to this task;
do not promote the UI account into independent API proof.

Subsequent Owner UI confirmation (2026-09-06, PR409 binding repair): main's
classic rule has strict/up-to-date enabled, only `Amp Orb Verify` from
EQB Amp CI Authoritative Checks (App 4835036) required, Do not allow bypass
enabled with no role/App exceptions, and no rulesets. This supplies the explicit
protection precondition for stable-head Checks; API protection reads remain 403.
Strict protection must remain enforced: a newer base not in the head requires
an updated head and new Check. No protection change is part of this repair.

PR409 exposed an availability defect in merge-attached Checks: successful Check
[101454460436](https://github.com/Buqisir/english-question-bank/runs/101454460436)
was attached to a merge SHA later regenerated with identical ordered parents
and tree. The new merge and head had no Check, so ordinary merge required an
expected Check. The v5-pr repair attaches new PR Checks only to head, still tests
the exact merge, and isolates old receipts rather than copying their success.
Local regressions do not establish GitHub merge acceptance: enable only the
reviewed candidate in the existing CI host under a bounded authorization, then
observe a natural failing head blocked and a natural successful head admitted
through ordinary protected merge. No synthetic Check, replay, bypass, or
deployment is authorized by this procedure.

Hosted `verify/e2e` continued to run during acceptance; running did not imply
they were still required. The current human record identifies no remaining
Hosted required rule to delete. This task makes **no blind rule mutation**.
The cleanup PR deletes the Hosted workflow and its obsolete assertions only
after the App gate was established and acceptance completed. Until that PR is
merged, the workflow remains on main. This ordering introduces no intended
ungated window; the exact final PR still requires its own successful App Check.

## Authorized execution, without an unprotected interval

The following is a fallback procedure for a future authorized policy change,
not a second activation checklist for the completed PR351 acceptance. If the
App-only gate is already present, do not reapply or remove it.

Use an already authorized administrator session; do not copy tokens into chat,
Git, arguments, or this file. Stop on any unreadable or unexpected policy.
GitHub has no transaction spanning branch policy and a Git commit, so use the
following safe order rather than deleting protection and recreating it.

1. Finish the natural PR351 failure Check. Record its exact head/test merge,
   parents, delivery, Check ID, numeric App ID and completed `failure`; inspect
   the Full failure and confirm the PR cannot merge. Correct the probe through
   an ordinary non-forced commit in its owning task, then record the new exact
   test-merge's natural completed success and merge eligibility. Do not use a
   synthetic success Check, redelivery, or manual drain as acceptance evidence.
2. Read and privately save **all** applicable branch protection and repository/
   organization rulesets, including bypass actors, strictness, review and
   conversation settings. Confirm the intended PR/base still match the reviewed
   candidate. The commands below touch only required checks, not other policy:

   ```bash
   set -euo pipefail
   umask 077
   repo=Buqisir/english-question-bank
   evidence=$(mktemp -d)
   endpoint="repos/$repo/branches/main/protection/required_status_checks"
   gh api "repos/$repo/branches/main/protection" > "$evidence/protection.json"
   gh api "repos/$repo/rulesets?includes_parents=true" > "$evidence/rulesets.json"
   gh api "$endpoint" > "$evidence/checks-before.json"
   # Inspect every listed ruleset individually before proceeding.
   # Preserve existing checks and strengthen to strict test-merge freshness.
   jq '{strict:true, contexts:[], checks:
     ((.checks + [{context:"Amp Orb Verify",app_id:4835036}])
       | unique_by([.context,.app_id]))}' \
     "$evidence/checks-before.json" > "$evidence/checks-overlap.json"
   gh api --method PATCH "$endpoint" --input "$evidence/checks-overlap.json"
   gh api "$endpoint" > "$evidence/checks-overlap-readback.json"
   jq -e '.strict == true and any(.checks[];
     .context == "Amp Orb Verify" and .app_id == 4835036)' \
     "$evidence/checks-overlap-readback.json"
   ```

   A policy supplied by a ruleset requires its own scoped update preserving
   every other rule and bypass restriction. Do not proceed from a partial
   branch-only view. Never remove the old gate first. Inspect returned JSON;
   uncertain mutation outcomes require a fresh read, not a blind retry.
3. With the App requirement visibly enforced, replace only Hosted `verify`
   and `e2e` requirements, retaining any unrelated required check:

   ```bash
   jq '{strict:true,contexts:[],checks:
     [.checks[] | select(.context != "verify" and .context != "e2e")]}' \
     "$evidence/checks-overlap-readback.json" > "$evidence/checks-app.json"
   jq -e 'any(.checks[]; .context == "Amp Orb Verify" and .app_id == 4835036)' \
     "$evidence/checks-app.json"
   gh api --method PATCH "$endpoint" --input "$evidence/checks-app.json"
   gh api "$endpoint" > "$evidence/checks-after.json"
   jq -e '.strict == true and any(.checks[];
     .context == "Amp Orb Verify" and .app_id == 4835036) and
     all(.checks[]; .context != "verify" and .context != "e2e")' \
     "$evidence/checks-after.json"
   ```

   Re-read all applicable rulesets and verify their final policy as well.
   Record an App failure/pending PR blocked by this policy and an exact successful
   PR eligible under it; unrelated failing requirements cannot prove the App gate.
4. Only after the above evidence, delete `.github/workflows/verify.yml` and
   its obsolete housekeeping assertions in the cleanup PR. Preserve Fast's
   six E2E commands and Full `verify:all` in the CI sandbox. Review, validate
   and merge through the App gate, never `--admin` bypass. Resolve the actual
   post-merge main SHA and confirm its natural App Check succeeds.
5. Record policy before/overlap/after, PR and main Check identities and literal
   PASS/SKIP/FAIL. No Focused-human wait, ten-count, Shadow/Dual, or Nightly
   stage is required. Nothing here deploys an application or changes Secrets.

## Rollback

Keep App protection enforced while reverting the single cleanup commit through
a PR. Restore Hosted workflow first, obtain fresh successful Hosted evidence on
the exact rollback candidate/main, then restore the saved required-check policy.
Read back all policy fields. Never remove the App gate while Hosted is absent,
and never treat rollback as permission to bypass a failing Check or replay a
production incident. Historical incident records and the root-owned SSH safety
boundary remain unchanged.
