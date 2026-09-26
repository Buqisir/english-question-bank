#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import readline from 'node:readline'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { dialectFromTags } from '../shared/paper-dictionary/morphology.mjs'
import {
  MIRROR_PUBLIC_PATH,
  acceptedLicense,
  cleanAuthor,
  commonsOriginalUrl,
  dialectOf,
  matchPronunciations,
  mirrorPathFor,
  normalizePos,
  playableSound,
} from './paper-dictionary-audio.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(rootDir, 'data', 'paper-dictionary')
const dictionaryPath = path.join(dataDir, 'eqb-dictionary.sqlite')
const indexPath = path.join(dataDir, 'audio-index.sqlite')
const gzPath = path.join(dataDir, 'upstream', 'raw-wiktextract-data.jsonl.gz')
const phase = process.argv[2] || 'all'
const USER_AGENT = 'eqb-paper-dictionary/1.0 (local dictionary build)'
const mirrorDir = path.join(rootDir, 'app/public', MIRROR_PUBLIC_PATH)

function openIndex() {
  const db = new DatabaseSync(indexPath)
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    CREATE TABLE IF NOT EXISTS sounds (
      word TEXT NOT NULL,
      pos TEXT NOT NULL,
      ipa TEXT NOT NULL,
      dialect TEXT NOT NULL,
      play_url TEXT NOT NULL,
      file_name TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sounds_uniq
      ON sounds(word, pos, dialect, play_url, ipa);
    CREATE TABLE IF NOT EXISTS files (
      file_name TEXT PRIMARY KEY,
      license TEXT,
      license_url TEXT,
      author TEXT,
      status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mirrors (
      original_url TEXT PRIMARY KEY,
      local_path TEXT NOT NULL,
      bytes INTEGER,
      status TEXT NOT NULL,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS assignments (
      entry_id TEXT NOT NULL,
      pos_group_index INTEGER NOT NULL,
      pronunciation_index INTEGER NOT NULL,
      play_url TEXT NOT NULL,
      file_name TEXT NOT NULL,
      PRIMARY KEY (entry_id, pos_group_index, pronunciation_index)
    );
  `)
  return db
}

function dictionaryDialect(tagsJson) {
  let tags = []
  try {
    const parsed = JSON.parse(tagsJson)
    if (Array.isArray(parsed)) tags = parsed
  } catch {
    tags = []
  }
  const dialect = dialectFromTags(tags)
  if (dialect.code === 'UK' || dialect.code === 'US') return dialect.code
  return 'unspecified'
}

function loadRows() {
  const db = new DatabaseSync(dictionaryPath, { readOnly: true })
  const rows = db.prepare(`
    SELECT p.entry_id, p.pos_group_index, p.pronunciation_index, p.ipa, p.tags_json,
           e.headword, g.pos
    FROM pronunciations p
    JOIN entries e ON e.entry_id = p.entry_id
    JOIN pos_groups g ON g.entry_id = p.entry_id AND g.pos_group_index = p.pos_group_index
  `).all()
  db.close()
  return rows.map((row) => ({
    key: `${row.entry_id}:${row.pos_group_index}:${row.pronunciation_index}`,
    entryId: row.entry_id,
    posGroupIndex: row.pos_group_index,
    pronunciationIndex: row.pronunciation_index,
    headword: row.headword,
    pos: normalizePos(row.pos),
    ipa: row.ipa || '',
    dialect: dictionaryDialect(row.tags_json),
  }))
}

async function extract() {
  const dictionary = new DatabaseSync(dictionaryPath, { readOnly: true })
  const known = new Set(dictionary.prepare('SELECT normalized_headword AS word FROM entries').all().map((row) => row.word))
  dictionary.close()
  const index = openIndex()
  index.exec('DELETE FROM sounds')
  const insert = index.prepare(`
    INSERT OR IGNORE INTO sounds (word, pos, ipa, dialect, play_url, file_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const child = spawn('gzip', ['-dc', gzPath], { stdio: ['ignore', 'pipe', 'inherit'] })
  const exitCode = new Promise((resolve) => child.on('exit', resolve))
  const lines = readline.createInterface({ input: child.stdout })
  let kept = 0
  let seen = 0
  index.exec('BEGIN')
  for await (const line of lines) {
    seen += 1
    if (seen % 200000 === 0) console.error(`scanned ${seen} kept ${kept}`)
    if (!line.includes('ogg_url') && !line.includes('mp3_url')) continue
    if (!line.includes('"lang_code": "en"') && !line.includes('"lang_code":"en"')) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry.lang_code !== 'en' || typeof entry.word !== 'string') continue
    if (!known.has(entry.word.toLowerCase())) continue
    const sounds = Array.isArray(entry.sounds) ? entry.sounds : []
    const before = kept
    for (const sound of sounds) {
      const playable = playableSound({ ...sound, word: entry.word, pos: sound.pos || entry.pos })
      if (!playable) continue
      const ipa = playable.ipa || ipaFromEntry(sounds, playable.dialect)
      insert.run(playable.word, playable.pos, ipa, playable.dialect, playable.playUrl, playable.fileName)
      kept += 1
    }
    if (Math.floor(before / 5000) !== Math.floor(kept / 5000)) {
      index.exec('COMMIT')
      index.exec('BEGIN')
    }
  }
  index.exec('COMMIT')
  const code = await exitCode
  if (code !== 0) {
    console.error(`gzip exited ${code}`)
    process.exit(code || 1)
  }
  console.log(JSON.stringify({ scanned: seen, kept, sounds: index.prepare('SELECT COUNT(*) AS c FROM sounds').get().c }))
  index.close()
}

function ipaFromEntry(sounds, dialect) {
  const ipas = []
  for (const sound of sounds) {
    if (typeof sound?.ipa !== 'string' || !sound.ipa.trim()) continue
    if (dialectOf(sound.tags, sound.audio || '') !== dialect) continue
    if (!ipas.includes(sound.ipa)) ipas.push(sound.ipa)
  }
  return ipas.length === 1 ? ipas[0] : ''
}

function match() {
  const rows = loadRows()
  const index = openIndex()
  const sounds = index.prepare('SELECT word, pos, ipa, dialect, play_url AS playUrl, file_name AS fileName FROM sounds').all()
  const assigned = matchPronunciations(rows, sounds)
  index.exec('DELETE FROM assignments')
  const insert = index.prepare(`
    INSERT INTO assignments (entry_id, pos_group_index, pronunciation_index, play_url, file_name)
    VALUES (?, ?, ?, ?, ?)
  `)
  index.exec('BEGIN')
  for (const [key, sound] of assigned) {
    const [entryId, posGroupIndex, pronunciationIndex] = key.split(':')
    insert.run(entryId, Number(posGroupIndex), Number(pronunciationIndex), sound.playUrl, sound.fileName)
  }
  index.exec('COMMIT')
  console.log(JSON.stringify({
    pronunciations: rows.length,
    sounds: sounds.length,
    assigned: assigned.size,
  }))
  index.close()
}

async function commons() {
  const index = openIndex()
  const names = index.prepare(`
    SELECT DISTINCT file_name FROM assignments
    WHERE file_name NOT IN (SELECT file_name FROM files WHERE status IN ('kept', 'dropped'))
  `).all().map((row) => row.file_name)
  const insert = index.prepare(`
    INSERT INTO files (file_name, license, license_url, author, status)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(file_name) DO UPDATE SET
      license = excluded.license,
      license_url = excluded.license_url,
      author = excluded.author,
      status = excluded.status
  `)
  let kept = 0
  let dropped = 0
  let retries = 0
  for (let indexStart = 0; indexStart < names.length; indexStart += 40) {
    const batch = names.slice(indexStart, indexStart + 40)
    const pages = await commonsBatch(batch)
    if (!pages) {
      retries += 1
      if (retries > 5) throw new Error(`Commons metadata failed at ${indexStart}`)
      console.error(`commons retry ${indexStart}`)
      await new Promise((resolve) => setTimeout(resolve, 2000))
      indexStart -= 40
      continue
    }
    retries = 0
    index.exec('BEGIN')
    for (const name of batch) {
      const meta = pages.get(name)
      if (!meta || !acceptedLicense(meta.license)) {
        insert.run(name, null, null, null, 'dropped')
        dropped += 1
        continue
      }
      insert.run(name, meta.license, meta.licenseUrl, meta.author, 'kept')
      kept += 1
    }
    index.exec('COMMIT')
    console.error(`commons ${Math.min(indexStart + batch.length, names.length)}/${names.length}`)
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  console.log(JSON.stringify({ requested: names.length, kept, dropped }))
  index.close()
}

async function commonsBatch(names) {
  const titles = names.map((name) => `File:${name.replace(/ /g, '_')}`).join('|')
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&maxlag=5&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist&titles=${encodeURIComponent(titles).replaceAll('%7C', '|')}`
  let response
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      response = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
    } catch {
      response = null
    }
    if (!response || response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
      continue
    }
    break
  }
  if (!response?.ok) return null
  const body = await response.json()
  if (body.error) return null
  const found = new Map()
  for (const page of Object.values(body.query?.pages || {})) {
    const meta = page.imageinfo?.[0]?.extmetadata || {}
    const normalized = String(page.title || '').replace(/^File:/i, '')
    const fileName = names.find((name) => name.replace(/ /g, '_').toLowerCase() === normalized.toLowerCase())
    if (!fileName) continue
    found.set(fileName, {
      license: meta.LicenseShortName?.value || '',
      licenseUrl: meta.LicenseUrl?.value || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName.replace(/ /g, '_'))}`,
      author: cleanAuthor(meta.Artist?.value || ''),
    })
  }
  return found
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// upload.wikimedia.org 对无联系方式的 UA 和并发下载会回 429；这里串行下载，
// 遵守 Retry-After，被限流后放慢，连续成功再慢慢恢复。
const MIRROR_USER_AGENT = 'EQBankDictionaryAudioMirror/1.0 (https://eqbank.cc; one-time mirror of Commons pronunciation files)'
const pacing = { gapMs: 1000 }

async function download(url) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    let response = null
    try {
      response = await fetch(url, { headers: { 'user-agent': MIRROR_USER_AGENT } })
    } catch {
      response = null
    }
    if (response?.ok) {
      pacing.gapMs = Math.max(1000, Math.round(pacing.gapMs * 0.95))
      return Buffer.from(await response.arrayBuffer())
    }
    if (response && response.status !== 429 && response.status < 500) {
      throw new Error(`HTTP ${response.status}`)
    }
    const retryAfter = Number(response?.headers.get('retry-after'))
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 30_000 * 2 ** attempt
    pacing.gapMs = Math.min(10_000, pacing.gapMs * 2)
    console.error(`mirror wait ${Math.round(waitMs / 1000)}s after ${response?.status ?? 'network error'}; gap ${pacing.gapMs}ms`)
    await sleep(waitMs)
  }
  throw new Error('download retries exhausted')
}

function transcode(input, output) {
  return new Promise((resolve, reject) => {
    // 单词读音只有一两秒人声：单声道 32 kHz / 48 kbps 听感与原版无明显差别，体积约为转码 mp3 的三分之一。
    const child = spawn('ffmpeg', [
      '-v', 'error', '-y', '-i', input,
      '-vn', '-map_metadata', '-1', '-ac', '1', '-ar', '32000',
      '-c:a', 'libmp3lame', '-b:a', '48k', '-f', 'mp3', output,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim().slice(0, 200) || `ffmpeg ${code}`))))
  })
}

async function mirror() {
  const index = openIndex()
  const transcodeOf = new Map()
  for (const row of index.prepare(`
    SELECT DISTINCT a.play_url FROM assignments a
    JOIN files f ON f.file_name = a.file_name
    WHERE f.status = 'kept'
  `).all()) {
    const original = commonsOriginalUrl(row.play_url)
    if (!transcodeOf.has(original)) transcodeOf.set(original, row.play_url)
  }
  const urls = [...transcodeOf.keys()]
  const done = new Set(index.prepare("SELECT original_url FROM mirrors WHERE status = 'ok'").all().map((row) => row.original_url))
  const record = index.prepare(`
    INSERT INTO mirrors (original_url, local_path, bytes, status, error) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(original_url) DO UPDATE SET
      local_path = excluded.local_path, bytes = excluded.bytes, status = excluded.status, error = excluded.error
  `)
  mkdirSync(mirrorDir, { recursive: true })
  const scratch = mkdtempSync(path.join(tmpdir(), 'eqb-dictionary-audio-'))
  const limit = Number(process.argv[3]) || Infinity
  const pending = urls
    .filter((url) => !done.has(url) || !existsSync(path.join(rootDir, 'app/public', mirrorPathFor(url))))
    .slice(0, limit)
  let ok = 0
  let failed = 0
  const input = path.join(scratch, 'in')
  const output = path.join(scratch, 'out.mp3')
  for (const url of pending) {
    const localPath = mirrorPathFor(url)
    const target = path.join(rootDir, 'app/public', localPath)
    try {
      let body
      try {
        body = await download(url)
      } catch (error) {
        // 少数原始文件已改名或删除（如 En-us-Mrs.ogg 回 404），Commons 仍保留当初的转码 mp3。
        const transcoded = transcodeOf.get(url)
        if (!String(error?.message).startsWith('HTTP 404') || transcoded === url) throw error
        body = await download(transcoded)
      }
      writeFileSync(input, body)
      await transcode(input, output)
      renameSync(output, target)
      record.run(url, localPath, statSync(target).size, 'ok', null)
      ok += 1
    } catch (error) {
      record.run(url, localPath, null, 'failed', String(error?.message || error))
      failed += 1
    }
    const finished = ok + failed
    if (finished % 100 === 0) console.error(`mirror ${finished}/${pending.length} failed ${failed}`)
    await sleep(pacing.gapMs)
  }
  rmSync(scratch, { recursive: true, force: true })
  const totals = index.prepare("SELECT COUNT(*) AS files, COALESCE(SUM(bytes), 0) AS bytes FROM mirrors WHERE status = 'ok'").get()
  console.log(JSON.stringify({ wanted: urls.length, attempted: pending.length, ok, failed, mirrored: totals.files, bytes: totals.bytes }))
  index.close()
}

function apply() {
  const index = openIndex()
  const mirrored = new Map(index.prepare("SELECT original_url, local_path FROM mirrors WHERE status = 'ok'").all()
    .map((row) => [row.original_url, row.local_path]))
  // 没有本站副本的录音不写进词典：网站只播放本站地址。
  const rows = index.prepare(`
    SELECT a.entry_id, a.pos_group_index, a.pronunciation_index, a.play_url,
           f.license, f.license_url, f.author, f.file_name
    FROM assignments a
    JOIN files f ON f.file_name = a.file_name
    WHERE f.status = 'kept'
  `).all()
    .map((row) => ({ ...row, local_path: mirrored.get(commonsOriginalUrl(row.play_url)) }))
    .filter((row) => row.local_path)
  const dictionary = new DatabaseSync(dictionaryPath)
  const update = dictionary.prepare(`
    UPDATE pronunciations
    SET audio_url = ?, audio_source = ?, audio_author = ?, audio_license = ?, audio_license_url = ?
    WHERE entry_id = ? AND pos_group_index = ? AND pronunciation_index = ?
  `)
  dictionary.exec('BEGIN')
  dictionary.exec(`
    UPDATE pronunciations
    SET audio_url = NULL, audio_source = NULL, audio_author = NULL, audio_license = NULL, audio_license_url = NULL
  `)
  for (const row of rows) {
    update.run(
      row.local_path,
      `Wikimedia Commons: File:${row.file_name}`,
      row.author,
      row.license,
      row.license_url,
      row.entry_id,
      row.pos_group_index,
      row.pronunciation_index,
    )
  }
  const count = dictionary.prepare(`
    SELECT COUNT(*) AS c FROM pronunciations WHERE audio_url IS NOT NULL
  `).get().c
  dictionary.prepare(`
    INSERT INTO meta (key, value) VALUES ('audio_count', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(count))
  dictionary.prepare(`
    INSERT INTO meta (key, value) VALUES ('audio_index', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run('kaikki-raw-wiktextract-data-2026-09-20')
  dictionary.exec('COMMIT')
  dictionary.close()
  index.close()
  console.log(JSON.stringify({ applied: rows.length, audioCount: count }))
}

if (phase === 'extract') await extract()
else if (phase === 'match') match()
else if (phase === 'commons') await commons()
else if (phase === 'mirror') await mirror()
else if (phase === 'apply') apply()
else if (phase === 'all') {
  await extract()
  match()
  await commons()
  await mirror()
  apply()
} else {
  console.error('Use extract, match, commons, mirror, apply, or all')
  process.exit(1)
}
