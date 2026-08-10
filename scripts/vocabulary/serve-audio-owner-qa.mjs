#!/usr/bin/env node

import { createReadStream, existsSync } from "node:fs"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { basename, dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { DatabaseSync } from "node:sqlite"
import { applyAmericanVocabularyPhonetics } from "../../server/vocabulary/americanPhonetics.mjs"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDirectory, "../..")
const uiDirectory = join(scriptDirectory, "audio-owner-qa")
const databasePath = join(repoRoot, "data/question-bank.sqlite")
const audioDirectory = join(repoRoot, "app/public/vocabulary-assets/wanwei-round-one-v1/audio/eqb-british-teacher-v1")

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const statePath = resolve(repoRoot, readArgument("--state-file", ".scratch/vocabulary-audio-owner-qa-state.json"))
const requestedPort = Number(readArgument("--port", "5417"))
if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) throw new Error(`Invalid --port value: ${requestedPort}`)
if (!existsSync(databasePath)) throw new Error(`Missing vocabulary database: ${databasePath}`)
if (!existsSync(audioDirectory)) throw new Error(`Missing vocabulary audio directory: ${audioDirectory}`)

const database = new DatabaseSync(databasePath, { readOnly: true })
const entries = database.prepare(`
  SELECT
    id,
    source_order AS sourceOrder,
    headword,
    phonetic,
    part_of_speech AS partOfSpeech,
    teaching_sense AS teachingSense,
    source_day AS day,
    source_stage AS stage,
    audio_path AS audioPath
  FROM vocabulary_entries
  ORDER BY source_order
`).all()
  .map((entry) => applyAmericanVocabularyPhonetics(entry))
  .map((entry) => ({ ...entry, audioUrl: `/audio/${basename(entry.audioPath)}` }))
database.close()

if (entries.length !== 1600) throw new Error(`Expected 1600 vocabulary entries, found ${entries.length}`)
const entryIds = new Set(entries.map((entry) => entry.id))
const audioFilenames = new Set(entries.map((entry) => basename(entry.audioPath)))
for (const filename of audioFilenames) {
  const assetPath = join(audioDirectory, filename)
  if (!existsSync(assetPath)) throw new Error(`Missing formal audio asset: ${assetPath}`)
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
}

function json(response, statusCode, value) {
  response.writeHead(statusCode, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" })
  response.end(`${JSON.stringify(value)}\n`)
}

function text(response, statusCode, value) {
  response.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" })
  response.end(value)
}

function validateState(value) {
  if (!value || value.schemaVersion !== 1 || !Number.isInteger(value.cursor)) throw new Error("Invalid QA state envelope")
  if (value.cursor < 0 || value.cursor >= entries.length) throw new Error("Invalid QA cursor")
  if (!value.decisions || typeof value.decisions !== "object" || Array.isArray(value.decisions)) throw new Error("Invalid QA decisions")
  for (const [entryId, decision] of Object.entries(value.decisions)) {
    if (!entryIds.has(entryId)) throw new Error(`Unknown QA entry: ${entryId}`)
    if (!decision || !["pass", "problem"].includes(decision.status)) throw new Error(`Invalid QA decision: ${entryId}`)
  }
  const history = Array.isArray(value.history) ? value.history.slice(-entries.length) : []
  for (const item of history) {
    if (!item || !entryIds.has(item.entryId) || !Number.isInteger(item.previousCursor)) throw new Error("Invalid QA history")
    if (item.previousDecision && !["pass", "problem"].includes(item.previousDecision.status)) throw new Error("Invalid prior QA decision")
  }
  return {
    schemaVersion: 1,
    cursor: value.cursor,
    decisions: value.decisions,
    history,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  }
}

async function readState() {
  try {
    return validateState(JSON.parse(await readFile(statePath, "utf8")))
  } catch (error) {
    if (error?.code === "ENOENT") return { schemaVersion: 1, cursor: 0, decisions: {}, history: [], updatedAt: null }
    throw error
  }
}

async function readJsonBody(request) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > 2_000_000) throw new Error("QA state is too large")
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

async function writeState(state) {
  await mkdir(dirname(statePath), { recursive: true })
  const temporaryPath = `${statePath}.incoming`
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8")
  await rename(temporaryPath, statePath)
}

function serveFile(response, path) {
  const extension = extname(path)
  response.writeHead(200, {
    "cache-control": extension === ".mp3" ? "public, max-age=3600" : "no-store",
    "content-type": mimeTypes[extension] ?? "application/octet-stream",
  })
  createReadStream(path).pipe(response)
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    if (request.method === "GET" && url.pathname === "/api/entries") return json(response, 200, entries)
    if (request.method === "GET" && url.pathname === "/api/state") return json(response, 200, await readState())
    if (request.method === "PUT" && url.pathname === "/api/state") {
      const savedState = validateState(await readJsonBody(request))
      await writeState(savedState)
      return json(response, 200, { ok: true })
    }
    if (request.method === "GET" && url.pathname.startsWith("/audio/")) {
      const filename = basename(url.pathname)
      if (!audioFilenames.has(filename)) return text(response, 404, "Not found")
      return serveFile(response, join(audioDirectory, filename))
    }
    if (request.method === "GET" && url.pathname === "/shared-tokens.css") {
      return serveFile(response, join(repoRoot, "app/src/shared-ui/tokens.css"))
    }
    if (request.method === "GET" && ["/", "/index.html"].includes(url.pathname)) return serveFile(response, join(uiDirectory, "index.html"))
    if (request.method === "GET" && ["/app.js", "/styles.css"].includes(url.pathname)) return serveFile(response, join(uiDirectory, basename(url.pathname)))
    return text(response, 404, "Not found")
  } catch (error) {
    console.error(error)
    return json(response, 400, { error: error instanceof Error ? error.message : "Request failed" })
  }
})

server.listen(requestedPort, "127.0.0.1", () => {
  console.log(`Vocabulary audio Owner QA: http://127.0.0.1:${requestedPort}/`)
  console.log(`Progress file: ${statePath}`)
})

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)))
