#!/usr/bin/env node

import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { DatabaseSync } from "node:sqlite"
import { applyAmericanVocabularyPhonetics } from "../../server/vocabulary/americanPhonetics.mjs"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDirectory, "../..")

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex")
}

const statePath = resolve(repoRoot, readArgument("--state", ".scratch/vocabulary-audio-owner-qa-state.json"))
const manifestPath = resolve(repoRoot, readArgument("--manifest", "data/vocabulary/wanwei-audio-manifest-v1.json"))
const databasePath = resolve(repoRoot, readArgument("--database", "data/question-bank.sqlite"))
const outputPath = resolve(repoRoot, readArgument("--output", ".scratch/vocabulary-audio-repair-v1/batch.json"))

const [stateBytes, manifestBytes] = await Promise.all([readFile(statePath), readFile(manifestPath)])
const state = JSON.parse(stateBytes)
const manifest = JSON.parse(manifestBytes)
if (state.schemaVersion !== 1 || !state.decisions || typeof state.decisions !== "object") {
  throw new Error("Expected the completed first-pass audio QA state")
}
if (manifest.schemaVersion !== "wanwei-vocabulary-audio-manifest-v1" || manifest.entries?.length !== 1600) {
  throw new Error("Expected the formal 1600-entry audio manifest")
}

const problemIds = new Set(
  Object.entries(state.decisions)
    .filter(([, decision]) => decision?.status === "problem")
    .map(([entryId]) => entryId),
)
const passCount = Object.values(state.decisions).filter((decision) => decision?.status === "pass").length
if (passCount !== 1530 || problemIds.size !== 70 || Object.keys(state.decisions).length !== 1600) {
  throw new Error(`First-pass QA must be frozen at 1530 pass / 70 problem; got ${passCount} / ${problemIds.size}`)
}

const manifestById = new Map(manifest.entries.map((entry) => [entry.entryId, entry]))
const database = new DatabaseSync(databasePath, { readOnly: true })
const rows = database.prepare(`
  SELECT
    id,
    source_order AS sourceOrder,
    headword,
    phonetic,
    part_of_speech AS partOfSpeech,
    teaching_sense AS teachingSense,
    example_english AS exampleEnglish
  FROM vocabulary_entries
  ORDER BY source_order
`).all()
database.close()

const entries = rows
  .filter((entry) => problemIds.has(entry.id))
  .map((entry) => {
    const formal = manifestById.get(entry.id)
    if (!formal) throw new Error(`Missing formal audio manifest entry: ${entry.id}`)
    const displayEntry = applyAmericanVocabularyPhonetics(entry)
    return {
      entryId: entry.id,
      sourceOrder: entry.sourceOrder,
      headword: entry.headword,
      audioText: formal.text,
      phonetic: displayEntry.phonetic,
      partOfSpeech: entry.partOfSpeech,
      teachingSense: entry.teachingSense,
      exampleEnglish: entry.exampleEnglish,
      original: {
        path: formal.path,
        bytes: formal.bytes,
        sha256: formal.sha256,
      },
    }
  })

if (entries.length !== 70 || new Set(entries.map((entry) => entry.entryId)).size !== 70) {
  throw new Error(`Expected 70 unique repair entries, found ${entries.length}`)
}
if (entries.some((entry, index) => index > 0 && entry.sourceOrder <= entries[index - 1].sourceOrder)) {
  throw new Error("Repair entries are not in source order")
}

const payload = {
  schemaVersion: "wanwei-vocabulary-audio-repair-batch-v1",
  batchId: "wanwei-audio-repair-v1",
  source: {
    firstPassStateFile: "first-pass-state.json",
    firstPassStateSha256: sha256(stateBytes),
    formalManifestSha256: sha256(manifestBytes),
    passCount,
    problemCount: entries.length,
  },
  formalAssetsChanged: false,
  entries,
}

await mkdir(dirname(outputPath), { recursive: true })
const frozenStatePath = resolve(dirname(outputPath), "first-pass-state.json")
try {
  const frozenStateBytes = await readFile(frozenStatePath)
  if (sha256(frozenStateBytes) !== sha256(stateBytes)) {
    throw new Error(`Frozen first-pass state differs from current QA state: ${frozenStatePath}`)
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error
  await writeFile(frozenStatePath, stateBytes)
}
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
console.log(JSON.stringify({ output: outputPath, entries: entries.length, first: entries[0].headword, last: entries.at(-1).headword }))
