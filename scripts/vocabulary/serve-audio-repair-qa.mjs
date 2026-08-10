#!/usr/bin/env node

import { createReadStream, existsSync } from "node:fs"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { basename, dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDirectory, "../..")
const uiDirectory = join(scriptDirectory, "audio-repair-qa")

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const batchPath = resolve(repoRoot, readArgument("--batch", ".scratch/vocabulary-audio-repair-v1/batch.json"))
const candidateDirectory = resolve(repoRoot, readArgument("--candidate-dir", ".scratch/vocabulary-audio-repair-v1/candidates"))
const candidateManifestPath = resolve(repoRoot, readArgument("--candidate-manifest", ".scratch/vocabulary-audio-repair-v1/candidate-manifest.json"))
const statePath = resolve(repoRoot, readArgument("--state-file", ".scratch/vocabulary-audio-repair-v1/qa-state.json"))
const originalAudioDirectory = resolve(repoRoot, readArgument("--original-dir", "app/public/vocabulary-assets/wanwei-round-one-v1/audio/eqb-british-teacher-v1"))
const requestedPort = Number(readArgument("--port", "5418"))
if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) throw new Error(`Invalid --port value: ${requestedPort}`)

const [batch, candidateManifest] = await Promise.all([
  readFile(batchPath, "utf8").then(JSON.parse),
  readFile(candidateManifestPath, "utf8").then(JSON.parse),
])
if (batch.schemaVersion !== "wanwei-vocabulary-audio-repair-batch-v1" || !batch.entries?.length) {
  throw new Error("Expected a non-empty frozen repair batch")
}
if (candidateManifest.schemaVersion !== "wanwei-vocabulary-audio-repair-candidates-v1" || candidateManifest.entries?.length !== batch.entries.length) {
  throw new Error("Expected a complete candidate manifest matching the repair batch")
}

const candidateById = new Map(candidateManifest.entries.map((entry) => [entry.entryId, entry]))
const expectedCandidateLabels = candidateManifest.entries[0]?.candidates?.map((candidate) => candidate.label) ?? []
if (expectedCandidateLabels.length < 1 || expectedCandidateLabels.length > 4 || new Set(expectedCandidateLabels).size !== expectedCandidateLabels.length) {
  throw new Error("Repair candidates must use one to four unique labels")
}
const entries = batch.entries.map((entry) => {
  const repair = candidateById.get(entry.entryId)
  if (!repair || repair.candidates?.length !== expectedCandidateLabels.length
    || repair.candidates.some((candidate, index) => candidate.label !== expectedCandidateLabels[index])) {
    throw new Error(`Incomplete repair candidates: ${entry.entryId}`)
  }
  const originalFilename = basename(entry.original.path)
  if (!existsSync(join(originalAudioDirectory, originalFilename))) throw new Error(`Missing original audio: ${entry.entryId}`)
  const candidates = repair.candidates.map((candidate) => {
    const filename = basename(candidate.path)
    if (!existsSync(join(candidateDirectory, filename))) throw new Error(`Missing candidate audio: ${entry.entryId} ${candidate.label}`)
    return { ...candidate, audioUrl: `/candidate/${filename}` }
  })
  return { ...entry, originalUrl: `/original/${originalFilename}`, candidates }
})

const entryIds = new Set(entries.map((entry) => entry.entryId))
const candidateLabels = new Set(expectedCandidateLabels)
const originalFilenames = new Set(entries.map((entry) => basename(entry.original.path)))
const candidateFilenames = new Set(entries.flatMap((entry) => entry.candidates.map((candidate) => basename(candidate.path))))

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
  if (!value || value.schemaVersion !== 1 || value.batchId !== batch.batchId || !Number.isInteger(value.cursor)) {
    throw new Error("Invalid repair QA state envelope")
  }
  if (value.cursor < 0 || value.cursor >= entries.length) throw new Error("Invalid repair QA cursor")
  if (!value.decisions || typeof value.decisions !== "object" || Array.isArray(value.decisions)) {
    throw new Error("Invalid repair QA decisions")
  }
  for (const [entryId, decision] of Object.entries(value.decisions)) {
    if (!entryIds.has(entryId)) throw new Error(`Unknown repair QA entry: ${entryId}`)
    if (!decision || !["selected", "unresolved"].includes(decision.status)) throw new Error(`Invalid repair decision: ${entryId}`)
    if (decision.status === "selected" && !candidateLabels.has(decision.candidate)) throw new Error(`Invalid selected candidate: ${entryId}`)
    if (decision.status === "unresolved" && decision.candidate != null) throw new Error(`Unresolved decision cannot select a candidate: ${entryId}`)
    if (decision.note != null && (typeof decision.note !== "string" || decision.note.length > 200)) throw new Error(`Invalid repair note: ${entryId}`)
  }
  const history = Array.isArray(value.history) ? value.history.slice(-entries.length) : []
  for (const item of history) {
    if (!item || !entryIds.has(item.entryId) || !Number.isInteger(item.previousCursor)) throw new Error("Invalid repair QA history")
  }
  return {
    schemaVersion: 1,
    batchId: batch.batchId,
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
    if (error?.code === "ENOENT") {
      return { schemaVersion: 1, batchId: batch.batchId, cursor: 0, decisions: {}, history: [], updatedAt: null }
    }
    throw error
  }
}

async function readJsonBody(request) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > 300_000) throw new Error("Repair QA state is too large")
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

const server = (await import("node:http")).createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    if (request.method === "GET" && url.pathname === "/api/entries") return json(response, 200, entries)
    if (request.method === "GET" && url.pathname === "/api/state") return json(response, 200, await readState())
    if (request.method === "PUT" && url.pathname === "/api/state") {
      const savedState = validateState(await readJsonBody(request))
      await writeState(savedState)
      return json(response, 200, { ok: true })
    }
    if (request.method === "GET" && url.pathname.startsWith("/original/")) {
      const filename = basename(url.pathname)
      if (!originalFilenames.has(filename)) return text(response, 404, "Not found")
      return serveFile(response, join(originalAudioDirectory, filename))
    }
    if (request.method === "GET" && url.pathname.startsWith("/candidate/")) {
      const filename = basename(url.pathname)
      if (!candidateFilenames.has(filename)) return text(response, 404, "Not found")
      return serveFile(response, join(candidateDirectory, filename))
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
  console.log(`Vocabulary audio repair QA: http://127.0.0.1:${requestedPort}/`)
  console.log(`Repair progress file: ${statePath}`)
})

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)))
