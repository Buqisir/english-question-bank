-- One-off cleanup (2026-07, data-orphan-cleanup cut):
-- purge paper-fe8e7a65 (26.3浙江金丽衢十二校联考) and paper-ee10da87
-- (26.3浙江宁波十校联考) from question-bank.sqlite. Their paper-assets
-- were lost (empty/missing dirs, not in git), so the DB rows point at
-- 404s and can never render; the content is unrecoverable.
--
-- Deletes are explicit bottom-up (no reliance on PRAGMA foreign_keys,
-- which the sqlite3 CLI leaves OFF by default). Safe to re-run
-- (idempotent). Run against production question-bank.sqlite too, after
-- an online `.backup` snapshot.

BEGIN;

-- tag_links has no FK on target_id — delete by explicit target sets.
DELETE FROM tag_links WHERE target_id IN (
  SELECT q.id FROM questions q
  JOIN question_groups g ON q.group_id = g.id
  JOIN passages p ON g.passage_id = p.id
  WHERE p.source_id LIKE 'src-fe8e7a65-%' OR p.source_id LIKE 'src-ee10da87-%'
);
DELETE FROM tag_links WHERE target_id IN (
  SELECT g.id FROM question_groups g
  JOIN passages p ON g.passage_id = p.id
  WHERE p.source_id LIKE 'src-fe8e7a65-%' OR p.source_id LIKE 'src-ee10da87-%'
);
DELETE FROM tag_links WHERE target_id IN (
  SELECT p.id FROM passages p
  WHERE p.source_id LIKE 'src-fe8e7a65-%' OR p.source_id LIKE 'src-ee10da87-%'
);

DELETE FROM ai_tag_suggestions WHERE target_id IN (
  SELECT q.id FROM questions q
  JOIN question_groups g ON q.group_id = g.id
  JOIN passages p ON g.passage_id = p.id
  WHERE p.source_id LIKE 'src-fe8e7a65-%' OR p.source_id LIKE 'src-ee10da87-%'
) OR target_id IN (
  SELECT g.id FROM question_groups g
  JOIN passages p ON g.passage_id = p.id
  WHERE p.source_id LIKE 'src-fe8e7a65-%' OR p.source_id LIKE 'src-ee10da87-%'
) OR target_id IN (
  SELECT p.id FROM passages p
  WHERE p.source_id LIKE 'src-fe8e7a65-%' OR p.source_id LIKE 'src-ee10da87-%'
);

DELETE FROM options WHERE question_id IN (
  SELECT q.id FROM questions q
  JOIN question_groups g ON q.group_id = g.id
  JOIN passages p ON g.passage_id = p.id
  WHERE p.source_id LIKE 'src-fe8e7a65-%' OR p.source_id LIKE 'src-ee10da87-%'
);

DELETE FROM questions WHERE group_id IN (
  SELECT g.id FROM question_groups g
  JOIN passages p ON g.passage_id = p.id
  WHERE p.source_id LIKE 'src-fe8e7a65-%' OR p.source_id LIKE 'src-ee10da87-%'
);

DELETE FROM question_group_topic_labels WHERE question_group_id IN (
  SELECT g.id FROM question_groups g
  JOIN passages p ON g.passage_id = p.id
  WHERE p.source_id LIKE 'src-fe8e7a65-%' OR p.source_id LIKE 'src-ee10da87-%'
);

DELETE FROM reading_parse_results WHERE question_group_id IN (
  SELECT g.id FROM question_groups g
  JOIN passages p ON g.passage_id = p.id
  WHERE p.source_id LIKE 'src-fe8e7a65-%' OR p.source_id LIKE 'src-ee10da87-%'
);

DELETE FROM question_groups WHERE passage_id IN (
  SELECT p.id FROM passages p
  WHERE p.source_id LIKE 'src-fe8e7a65-%' OR p.source_id LIKE 'src-ee10da87-%'
);

DELETE FROM passages
WHERE source_id LIKE 'src-fe8e7a65-%' OR source_id LIKE 'src-ee10da87-%';

DELETE FROM sources
WHERE id LIKE 'src-fe8e7a65-%' OR id LIKE 'src-ee10da87-%';

DELETE FROM paper_asset_versions
WHERE paper_id IN ('paper-fe8e7a65', 'paper-ee10da87');

DELETE FROM paper_import_runs
WHERE paper_id IN ('paper-fe8e7a65', 'paper-ee10da87');

COMMIT;
