# grammar-facets-v2 (D1) — Production Sync Runbook

Plan step 6. **This document is planning only — nothing in it has been
executed against production.** Server facts below are read from
`docs/cuts/launch-deploy/go-live-record.md` (keep that record current
before trusting this runbook at execution time). Precedent followed:
体裁真值 2026-07-13 sync (`docs/cuts/launch-deploy/go-live-record.md`
"追记 2026-07-13" — 停服 → apply --write with auto-backup → 起服 → verify
N/N green).

## Why this needs a deliberate apply step (not just a normal `git pull`)

Unlike r1-genre-truth (which mutated the production **sqlite**, diverged
from git, and needed a bespoke `--write` apply script), this cut's data
migration is **33 git-tracked JSON files** under
`app/public/paper-assets/*/latest/analyses/grammar-fill-analysis-v1.json` —
they ship with the normal `git pull` + `deploy.sh` flow, no bespoke DB-apply
script needed. The reason this still needs a *deliberate* (not casual) sync
is the same one the plan calls out for the DEV-side commit: **the
`analysisConfigs` schemaVersion gate (v2-authenticates/v1-rejects) and the
33 migrated data files must land in production atomically** — deploying
the code change (server restart) before the data files finish syncing (or
vice versa) would make the whole `grammarFill` teaching-facet index and
`/api/similar-questions` grammar-fill branch go dark for the gap window
(same failure mode the plan calls out for the DEV commit: "分步会让
grammarFill 索引整桶掉线"). A single `git pull` to one commit + one service
restart already lands both atomically as long as the deploy isn't
interrupted mid-pull — the discipline below is about **verifying that**,
not about a multi-step data write.

Also in scope for this same sync: the I16·C verb-profile sidecar retirement
(11 `grammar-fill-verb-profile-v1.json` files deleted from git — production
must not be left with orphaned sidecar files it silently stops reading) and
the retired `POST /api/grammar-fill/verb-profiles/backfill` route (must
actually disappear from the running service, not just the repo).

## Pre-flight (before touching production)

1. Confirm `docs/cuts/launch-deploy/go-live-record.md` is current — in
   particular the production commit hash and any "生产落后于本地 main" gap.
   If production is more than a handful of commits behind, do a normal
   `deploy.sh` catch-up sync FIRST (unrelated to this cut) so this cut's
   diff is the only thing changing in the sync we're auditing.
2. Confirm this cut's PR is merged to `main` and `main` CI is green
   (per AGENTS.md gate — no local full re-run needed if CI already proves
   it).
3. On the production host (`eqb-hk-1`, `/opt/eqb/english-question-bank`,
   user `eqb`): confirm the R2 daily backup (`backup-to-r2.sh`, 03:30
   Beijing time cron) is current — it already covers
   `app/public/paper-assets/` (plan.md PM #6 scope), so a full-tree restore
   path exists independent of this runbook. Additionally, before stopping
   the service, take a **fast, surgical, git-independent** backup of just
   the 33 files about to change and the 11 sidecar files about to disappear
   (belt-and-suspenders — R2 restore is coarser/slower):
   ```bash
   cd /opt/eqb/english-question-bank
   tar -czf /opt/eqb/backups/grammar-fill-analyses.pre-d1.$(date +%Y%m%dT%H%M%S).tar.gz \
     app/public/paper-assets/*/latest/analyses/grammar-fill-analysis-v1.json \
     app/public/paper-assets/*/latest/analyses/grammar-fill-verb-profile-v1.json
   ```
   (the second glob will legitimately match nothing once local `main` is
   ahead of production by this cut, but run it *before* pulling, while
   production still has the v1 files + sidecars, so the tar actually
   captures the pre-migration state.)

## Apply

1. `systemctl stop eqb` (or the deploy.sh equivalent stop step).
2. `runuser -u eqb -- git -C /opt/eqb/english-question-bank pull` to the
   merged commit (or run the full `scripts/deploy.sh` if that's the house
   convention — it builds + restarts + smokes `/api/health`).
3. Confirm the 33 analysis files and the retired server/script files landed:
   ```bash
   git -C /opt/eqb/english-question-bank log -1 --oneline
   ls app/public/paper-assets/*/latest/analyses/grammar-fill-verb-profile-v1.json 2>&1  # expect: no matches
   test -f server/grammar-verb-profile/verbProfileSidecar.mjs && echo STILL PRESENT || echo retired
   ```
4. `systemctl start eqb` (or let `deploy.sh` restart it) — confirm
   `/api/health` 200 and `eqb.service` `active`.

## Post-apply verify (production, read-only)

Run the narrow verify script against the production tree (it only reads
`app/public/paper-assets/**` + source files, makes zero writes):
```bash
cd /opt/eqb/english-question-bank
node scripts/verify-grammar-facets-v2.mjs
```
Expect the same shape as the DEV-worktree run: 330 blanks, 33/33 files
`schemaVersion: grammar-fill-analysis-v2`, zero old-facetKey residue, zero
sidecar residue, distribution within ±2 of the frozen step1 baseline.

Additionally, an owner-facing smoke check (per plan collaboration workflow —
owner does post-hoc visual/product QA, not code review):
- Open a grammar-fill paper in Paper Intelligence; confirm the 语法解析 panel
  renders (proves the frontend adapter's `schemaVersion === grammar-fill-analysis-v2`
  check isn't throwing against real production data).
- Hit `/api/similar-questions` for one grammar-fill finite-verb seed and
  confirm a non-zero-scored match returns (mirrors the DEV-worktree QA in
  `docs/cuts/grammar-facets-v2/qa-step2.md`).

## Rollback

- Code + data: `git checkout <previous-production-commit>` + restart
  service (the 33 files + retired server files revert together since
  they're one git tree).
- If a production-only sidecar file existed that wasn't in git (shouldn't
  happen — sidecars were always git-tracked per `git rm` in this cut — but
  if the pre-flight tar caught something unexpected): restore from
  `/opt/eqb/backups/grammar-fill-analyses.pre-d1.*.tar.gz`.
- Full-tree fallback: R2 restore per the drill already proven in
  `docs/cuts/launch-deploy/go-live-record.md`'s 2026-07-14 R2 recovery
  rehearsal.

## Owner sign-off checklist (post-apply)

- [ ] `verify-grammar-facets-v2.mjs` green on production
- [ ] `/api/health` 200, `eqb.service` active
- [ ] 语法解析 panel renders for at least one real paper
- [ ] chips/labels for the new facet categories (八向词形转换 /
      名词的数·格 / 形容词比较等级) read sensibly in the UI — owner
      抽验 chips 文案 per plan.md 收口 checklist (随 E6 DP-3 合场)
