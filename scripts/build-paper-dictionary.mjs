#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { DICTIONARY_ATTRIBUTION, DICTIONARY_SCHEMA } from '../shared/paper-dictionary/constants.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = process.argv[2]
  || path.join(rootDir, 'data', 'paper-dictionary', 'upstream', 'distribution.sqlite')
const outDir = path.join(rootDir, 'data', 'paper-dictionary')
const outPath = path.join(outDir, 'eqb-dictionary.sqlite')
const manifestPath = path.join(outDir, 'manifest.json')
const gzPath = path.join(outDir, 'upstream', 'distribution.sqlite.gz')

if (!existsSync(sourcePath)) {
  if (!existsSync(gzPath)) {
    console.error(`Missing upstream sqlite: ${sourcePath}`)
    process.exit(1)
  }
  const output = openSync(sourcePath, 'w')
  const unpacked = spawnSync('gzip', ['-dc', gzPath], { stdio: ['ignore', output, 'inherit'] })
  closeSync(output)
  if (unpacked.status !== 0) {
    console.error('Failed to unpack distribution.sqlite.gz')
    process.exit(unpacked.status || 1)
  }
}


const upstreamSha256 = existsSync(gzPath)
  ? createHash('sha256').update(readFileSync(gzPath)).digest('hex')
  : null

const db = new DatabaseSync(outPath)
db.exec(`
  PRAGMA journal_mode = OFF;
  PRAGMA synchronous = OFF;
  DROP TABLE IF EXISTS pronunciations;
  DROP TABLE IF EXISTS senses;
  DROP TABLE IF EXISTS forms;
  DROP TABLE IF EXISTS pos_groups;
  DROP TABLE IF EXISTS entries;
  DROP TABLE IF EXISTS meta;
  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE entries (
    entry_id TEXT PRIMARY KEY,
    headword TEXT NOT NULL,
    normalized_headword TEXT NOT NULL
  );
  CREATE TABLE pos_groups (
    entry_id TEXT NOT NULL,
    pos_group_index INTEGER NOT NULL,
    pos TEXT NOT NULL,
    etymology_id TEXT,
    PRIMARY KEY (entry_id, pos_group_index)
  );
  CREATE TABLE forms (
    entry_id TEXT NOT NULL,
    pos_group_index INTEGER NOT NULL,
    form_text TEXT NOT NULL,
    form_fold TEXT NOT NULL,
    tags_json TEXT NOT NULL
  );
  CREATE TABLE senses (
    entry_id TEXT NOT NULL,
    pos_group_index INTEGER NOT NULL,
    sense_id TEXT NOT NULL,
    meaning_index INTEGER NOT NULL,
    priority TEXT NOT NULL,
    short_gloss TEXT,
    learner_explanation TEXT,
    PRIMARY KEY (entry_id, pos_group_index, sense_id)
  );
  CREATE TABLE pronunciations (
    entry_id TEXT NOT NULL,
    pos_group_index INTEGER NOT NULL,
    pronunciation_index INTEGER NOT NULL,
    ipa TEXT,
    tags_json TEXT NOT NULL,
    audio_url TEXT,
    audio_source TEXT,
    audio_author TEXT,
    audio_license TEXT,
    audio_license_url TEXT,
    PRIMARY KEY (entry_id, pos_group_index, pronunciation_index)
  );
`)

const quotedSource = sourcePath.replaceAll("'", "''")
db.exec(`ATTACH '${quotedSource}' AS src`)
db.exec('BEGIN')
db.exec(`
  INSERT INTO entries (entry_id, headword, normalized_headword)
  SELECT entry_id, headword, normalized_headword FROM src.entries;

  INSERT INTO pos_groups (entry_id, pos_group_index, pos, etymology_id)
  SELECT entry_id, pos_group_index, pos, etymology_id FROM src.pos_groups;

  INSERT INTO forms (entry_id, pos_group_index, form_text, form_fold, tags_json)
  SELECT entry_id, pos_group_index, text, lower(text), tags_json
  FROM src.pos_group_forms
  WHERE text != '' AND text != '-' AND length(text) <= 128;

  INSERT INTO forms (entry_id, pos_group_index, form_text, form_fold, tags_json)
  SELECT e.entry_id, g.pos_group_index, e.headword, e.normalized_headword, '["lemma"]'
  FROM src.entries e
  JOIN src.pos_groups g ON g.entry_id = e.entry_id
  WHERE length(e.headword) <= 128
    AND NOT EXISTS (
      SELECT 1 FROM src.pos_group_forms f
      WHERE f.entry_id = e.entry_id
        AND f.pos_group_index = g.pos_group_index
        AND f.text = e.headword
    );

  INSERT INTO senses (
    entry_id, pos_group_index, sense_id, meaning_index, priority, short_gloss, learner_explanation
  )
  SELECT entry_id, pos_group_index, sense_id, meaning_index, priority, short_gloss, learner_explanation
  FROM src.meanings;

  INSERT INTO pronunciations (
    entry_id, pos_group_index, pronunciation_index, ipa, tags_json,
    audio_url, audio_source, audio_author, audio_license, audio_license_url
  )
  SELECT entry_id, pos_group_index, pronunciation_index, ipa, tags_json,
         NULL, NULL, NULL, NULL, NULL
  FROM src.pos_group_pronunciations
  WHERE ipa IS NOT NULL AND ipa != '';
`)
db.exec('COMMIT')
db.exec('DETACH src')
db.exec(`
  CREATE INDEX forms_fold_idx ON forms(form_fold);
  CREATE INDEX forms_exact_idx ON forms(form_text);
  CREATE INDEX entries_headword_idx ON entries(headword);
  CREATE INDEX entries_fold_idx ON entries(normalized_headword);
`)

const count = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c
const meta = {
  schema_version: DICTIONARY_SCHEMA,
  dictionary_version: 'open-dictionary-v2.0+eqb-dictionary-v1',
  upstream_tag: 'v2.0',
  upstream_entry_schema: 'distribution_entry_v5',
  upstream_sqlite_schema: 'distribution_sqlite_v1',
  upstream_sha256: upstreamSha256 || '',
  conversion_version: 'eqb-dictionary-v1',
  attribution: DICTIONARY_ATTRIBUTION,
  license: 'CC BY-SA 4.0 dictionary data; MIT upstream code',
  entry_count: String(count('entries')),
  form_count: String(count('forms')),
  sense_count: String(count('senses')),
  pronunciation_count: String(count('pronunciations')),
  audio_count: '0',
  built_at: new Date().toISOString(),
}
const insertMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
for (const [key, value] of Object.entries(meta)) insertMeta.run(key, value)
db.close()

const bytes = statSync(outPath).size
const manifest = { ...meta, bytes, path: outPath }
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({ outPath, bytes, ...meta }))
