# GitHub Actions CI cutover

## Current status

Native authority is active after [PR #460](https://github.com/Buqisir/english-question-bank/pull/460).
Owner re-opened and confirmed classic main protection on 2026-09-14 at
14:57:01 CST: only `verify`/`e2e` from GitHub Actions are required; strict,
linear history and no bypass remain; force push/deletion are disabled. REST
readback remains 403; this is explicit Owner evidence, not API evidence.

The [natural PR run](https://github.com/Buqisir/english-question-bank/actions/runs/34808775227)
and [natural main run](https://github.com/Buqisir/english-question-bank/actions/runs/34815848519)
passed both jobs. Main `c8cdaea7703aca48ab49fdf74f1dd9d793b2f554` has parent
`4784ce86b8a47dae626a37141c36271837c3ea92`; Full reported 177 PASS / 2 SKIP /
0 FAIL. The SKIPs are the absent off-repo teaching fixture and local DB perf.
The Deployment Orb installed that exact clean main checkout and passed `plan`
with App 15368/run 34815848519/attempt 1 and both jobs; focused tests passed
684/0 on Node 24.20.0 (hosted CI used 24.21.0). No SSH or deployment occurred.
GitHub hook 672661674 was disabled and read back `active:false` at
07:36:34Z. Old Orb/platform registration termination and inaccessible private
queue/receipts remain unverified; do not claim their deletion or replay them.

### E2E worker topology

Required checks remain `verify` and `e2e`. The v2 workflow runs independent
`e2e-seams` (all six fixed browser seams) and `e2e-render` (selected pack e2e
lane) workers; `e2e` always runs after both and requires each result to be
`success`. No protection settings change is needed. Inspect both workers as
well as the required checks on natural PR and exact-main runs. Deployment and
watcher readers recognize only exact v1 `{verify, e2e}` or v2
`{verify, e2e-seams, e2e-render, e2e}` job sets; every job must succeed for
authority. A source update alone does not prove the installed reader is current.

### Initial baseline (historical)

Initial read-only baseline on 2026-09-14:
main `4784ce86b8a47dae626a37141c36271837c3ea92`; no workflows on main or in the
Actions workflow listing. Main protection REST returned 403; rulesets listing
was empty. Historical Owner evidence says the classic main rule requires only
`Amp Orb Verify` with strict/up-to-date and no bypass. Reconfirm in the UI; a
403 is not proof of either protection or lack of protection.

The original CI Orb's private state is inaccessible after executor replacement.
Do not initialize a new empty queue, replay events or treat a fresh checkout as
the old installation. Actual dual execution may be unavailable; report that
limitation rather than manufacturing an Amp Check.

Deployment environment was read-only checked on 2026-09-14 in the existing
[Deployment thread](https://ampcode.com/threads/T-01a061fa-0f5d-70d9-80eb-48b76ee4b052).
It retains the restricted SSH configuration and deployment evidence, but has no
clean checkout of current main. Its installation is a repository checkout, not
a global package. Use a new clean `main` clone at the reviewed merged SHA for
reader acceptance; preserve existing workspaces and incident evidence. The old
Amp App-ID variable is absent. No SSH/preflight/deploy ran during this check;
host transaction state and project privacy were not independently re-attested.

## 1. Validate native PR checks while old protection remains

Publish the reviewed migration branch as a normal PR to main. Leave the old
required Check and webhook untouched. In repository **Actions**, verify Actions
is allowed if the natural PR event creates no run:

https://github.com/Buqisir/english-question-bank/settings/actions

Do not loosen organization policy or token permissions unnecessarily. The
workflow needs contents read and standard checkout/setup-node actions, not
write tokens or repository secrets. If GitHub requests approval of a first-time
contributor's run, approve only the reviewed current commit. Do not substitute
workflow_dispatch or a fabricated check for the natural PR event.

Record the PR head/base, run/attempt/check IDs, tested merge parents/tree,
GitHub Actions App identity, and both `verify` and `e2e` conclusions. Resolve all
failures. Keep the complete registry and six E2E seams; declared fixture SKIPs
must be reported, not relabelled PASS. Check the deployment-reader regressions
and independent Standards/Spec review before requesting rule cutover.

## 2. Owner saves the replacement required-check set, without an empty interval

Only after the current natural PR run has both jobs green, use:

https://github.com/Buqisir/english-question-bank/settings/branches

Under **Branch protection rules**, edit the rule matching **main**. If protection
is now implemented by a ruleset instead, stop and capture that rule's equivalent
fields at https://github.com/Buqisir/english-question-bank/settings/rules.
Do not create a conflicting second rule.

- Keep **Require a pull request before merging** and existing review requirements.
- Keep **Require status checks to pass before merging** enabled.
- Keep **Require branches to be up to date before merging** enabled.
- Add **verify** and **e2e**, selecting **GitHub Actions** as the expected source.
  Confirm the exact names/App from the successful natural run, not from guesses.
- In the same edit remove **Amp Orb Verify**; save once with both native checks
  selected. Never save a version with no required checks.
- Preserve **Do not allow bypassing the above settings**, linear history and
  existing force-push/deletion restrictions; add no actor/App bypass exception.

Capture the saved rule and re-open it to confirm persistence. Agent API readback
is preferred; if it remains 403, retain the Owner's exact UI confirmation and
state the limitation. Re-read the PR and checks before ordinary squash merge.
No admin merge, direct-main push, empty bootstrap commit or Check spoofing.

## 3. Validate natural exact-main and Deployment reader

After protected merge, resolve actual main SHA/parent. Wait for its natural
`push` run of the fixed workflow and both successful jobs. Keep unrelated merges
paused until that exact-main run succeeds. A successful PR tree does not replace
the new main run. On failure retain checks/logs and diagnose before a rerun;
do not advance the batch or retire old infrastructure to hide the failure.

The following Orb installation steps apply to the 2026-09 CI cutover period;
current deployment follows [AGENTS.md — Owner Mac deployment](../../AGENTS.md#owner-mac-deployment)
and [ADR-0027](../adr/0027-owner-local-website-deployment.md).

In the private Deployment Orb, install only the reviewed reader closure from the
merged commit, preserving existing SSH/controller configuration. Follow the
reader's configuration contract; never copy its SSH key to this development Orb.
Remove `QUESTION_BANK_DEPLOY_AMP_CHECK_APP_ID` if present and keep
`QUESTION_BANK_DEPLOY_CI_AUTHORITY_MODE` absent. The GitHub Actions App ID 15368
is fixed in code; there is no replacement App-ID environment variable. Existing
GitHub authentication needs read access to Actions and check-suite metadata,
not a new writer token.

From the new clean `main` clone, run `node scripts/amp-orb-deploy.mjs plan`.
This refreshes only that checkout with fetch/fast-forward and reads GitHub
authority; it does not dispatch SSH. Do not use `preflight` for this acceptance:
that command also contacts the production controller. Confirm the plan resolves
the intended exact live main, workflow/run/attempt and both jobs.
Prove current native success is accepted and old Amp/manual/wrong-SHA evidence
is rejected using the focused reader verifier, without mutating live Checks.
A local unit test is not proof the remote reader was installed.
Record actual installed identity, successful `plan` output and configuration transition;
the final report must mark these pending until observed.

## 4. Retire old CI only after steps 2 and 3 pass

At https://github.com/Buqisir/english-question-bank/settings/hooks identify the
exact old CI webhook from retained ID/URL fingerprint and event subscriptions.
Do not touch unrelated source-intake/import hooks. First disable **Active** and
save; preserve its ID and delivery evidence before considering deletion. Never
print its secret. Verify no new CI deliveries are being accepted by that hook.

Stop only identified old CI services/controller launchers once their work is
settled; do not restart/load plugins to inspect them. Disable the corresponding
old CI registration and Amp-specific watcher/selection automation. Do not delete
the App installation if other authorized systems still use it. Preserve private
queue/receipt/log snapshots with hashes and permissions. Do not drain or replay.
Inaccessible old Orb evidence/termination remains an explicit retirement risk,
not a completed cleanup. Source removal alone is not live retirement.

## Recovery and completion record

Before rule cutover, leave old protection in place and fix the candidate. After
cutover, keep native requirements while diagnosing failures; do not fall back
to an unverified Amp installation or remove requirements to make merges work.

Completion requires links/identities for natural PR and main runs, both job
results and SKIPs, protection before/after evidence, successful installed-reader
`plan`, webhook/service/watcher retirement receipts and preserved evidence.
Report inaccessible artifacts or remaining live registrations explicitly.
Reply to the originating Puck thread with the same findings as the task's final
response. No claim of closure while required Owner actions remain pending.
