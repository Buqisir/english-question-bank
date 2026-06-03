# Derived dimensions consolidate into a DB generic-attribute store, built incrementally

Status: accepted (PM grill 2026-06-03, PO 黄学伟)

Context: The bank will launch publicly and its derived teaching dimensions
(per ADR-0008 — difficulty, topic, verb axes, vocabulary load, genre, …) will
keep being added: new fields and new search dimensions, indefinitely. Today the
storage is split. Topic labels (#181) live in a DB table joined into the question
cards. But the teaching-facet index (#180) and the verb-axes sidecar (#183) live
as on-disk JSON walked into an in-memory `Map` rebuilt on every cache invalidation.
That file-walk + single-process in-memory index does not scale to online,
multi-user, thousands-of-papers use, and — just as important — every new dimension
today requires editing a central retrieval file (`teachingFacets.mjs`). The grill
asked: when we are live and want field #15 / search #8, is adding it cheap and
scalable? With the current shape, no.

Decision: derived dimensions converge onto a **DB-backed generic attribute store**,
keyed roughly by `(entity_id, dimension, value, source_version, confidence, source)`
— extending the #181 topic-labels shape to all dimensions. Search becomes indexed DB
queries. Adding a dimension becomes **data + a catalog entry, not a central-code edit**;
adding a search becomes an indexed query. SQLite today; a later SQLite→Postgres move
is a migration that preserves the model.

Two guardrails (the value column is untyped, so the DB cannot enforce correctness):
1. **Every dimension has a registered vocabulary + code validation** (the existing
   facet/verb-axes registries are this — keep the habit). Prevents a "junk drawer".
2. **A heavily-filtered dimension may be promoted to its own typed column/table** if
   query performance needs it. The generic store is the default, not a dogma.

Rhythm: **incremental, not big-bang.** The NEXT derived dimension is built DB-backed.
The current file-based facet index (#180) and verb-axes sidecar (#183) stay until
naturally migrated — they are derived, so they can be re-backfilled into the store
cheaply with zero data loss. We do NOT rebuild anything for today's ~18-record bank.

Consequences:
- A coexistence period (some dimensions in files, some in DB) is accepted V0 /
  launch-prep debt; an eventual cleanup migrates the file-based ones into the store.
- Carries the staleness mechanism floated against ADR-0008 (borrowed from feature
  stores): stamp each derived row with `source_version` so stale derived data after a
  re-import is detectable and re-computable, without re-running the primary import.
- This is the substrate decision behind every future "should this gate import / where
  does this field live?" question, alongside ADR-0008's primary-vs-derived split.
