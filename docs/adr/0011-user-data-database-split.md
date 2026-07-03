# ADR 0011: User Data Database Split

Status: Proposed (M0-1 cut; becomes Accepted when the cut merges).

## Context

The launch roadmap (docs/cuts/launch-roadmap/roadmap.md, owner-ratified
2026-07-03, decision 7) commits to a shared-bank deployment model: the
question bank is curated locally by the owner and pushed to the server
as a whole SQLite file, while per-user data lives only on the server and
is never touched by deploys.

Today a single `question-bank.sqlite` holds both the shared bank tables
and four user-data tables: `draft_papers`, `draft_paper_items`,
`my_space_artifacts`, `my_space_folders`. Wholesale file replacement
would wipe user data, so the two lifecycles must be physically
separated before M1.

Relevant current facts (scouted and spot-checked 2026-07-03):

- Connection layer is `node:sqlite` `DatabaseSync`, open-per-operation,
  no pool, factory `openDatabase()` in `server/api.mjs`.
- One cross-side FK: `draft_paper_items.group_id REFERENCES
  question_groups(id) ON DELETE RESTRICT`.
- One cross-side SQL JOIN (`deleteDraftPaperItem`), used only as an
  existence check; all other cross-side reads are already
  application-layer assembly by ID.
- No transaction writes both sides. No migration framework exists.

## Decision

1. Two databases, two lifecycles:
   - `question-bank.sqlite` — shared bank. Curated locally, pushed to
     the server as a file. Created by `scripts/init-db.sh`; missing
     file is a startup error.
   - `user-data.sqlite` — user data, server-resident. Path from
     `USER_DATA_DB` env, default `data/user-data.sqlite`.
     Auto-created and shape-ensured at startup (self-healing), because
     deploys never ship it.
2. Cross-database references go by ID with application-layer assembly
   (per roadmap decision 7). No `ATTACH`, no cross-database SQL.
3. The cross-side FK is dropped and replaced by the existing
   write-side validation plus read-side orphan tolerance: a draft item
   whose question group disappeared from the bank (e.g. after a bank
   file replacement) renders as an invalid entry — deletable, excluded
   from print/export — instead of crashing.
4. The user database schema's single source of truth is code
   (`ensureUserDatabaseShape()` / `ensureMySpaceDatabaseShape()`). The
   four tables leave `data/sql/schema.sql`, and no user-schema.sql is
   created — this removes the schema.sql-vs-ensure drift risk for the
   user side instead of duplicating it.
5. Existing data moves via a one-time script
   (`scripts/migrate-user-data-split.mjs`): back up the bank file,
   copy the four tables' rows into the user database, then drop them
   from the bank. Startup never migrates or drops automatically; it
   only warns if the bank still carries user tables.

## Consequences

- The bank file becomes wholesale-replaceable (enables the M1 push
  flow and clean backups per database).
- `ON DELETE RESTRICT` protection on `group_id` is gone; the bank can
  now drop groups referenced by drafts. Orphan tolerance is therefore
  a permanent product behavior, not an edge case.
- Later M0 cuts build on this: users/auth tables (M0-2) and `user_id`
  scoping (M0-4) land in `user-data.sqlite`.
- `paper_sets` / `paper_items` / `export_jobs` stay in the bank for
  now; re-homing them is a future decision if ever needed.
