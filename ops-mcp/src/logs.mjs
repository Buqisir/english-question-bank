import { openSync, readSync, closeSync, statSync } from 'node:fs'
import { LOG_READ_MAX_BYTES } from './config.mjs'
import { sanitizeLogLine } from './redact.mjs'

export class LogReadError extends Error {
  constructor(message) {
    super(message)
    this.name = 'LogReadError'
  }
}

function parseJournalTimestamp(line) {
  const match = /^(\d{4}-\d{2}-\d{2}T[0-9:.+-]+)\s/u.exec(line)
  if (!match) return null
  const ms = Date.parse(match[1])
  return Number.isFinite(ms) ? ms : null
}

function isErrorLine(line) {
  return /\b(error|err|fatal|panic|exception|fail(?:ed|ure)?)\b/iu.test(line)
}

function readTail(file, maxBytes) {
  let fd
  try {
    const stat = statSync(file)
    if (!stat.isFile()) throw new LogReadError('log source is not a file')
    fd = openSync(file, 'r')
    const start = Math.max(0, stat.size - maxBytes)
    const length = stat.size - start
    const buffer = Buffer.alloc(length)
    const bytesRead = readSync(fd, buffer, 0, length, start)
    return {
      text: buffer.subarray(0, bytesRead).toString('utf8'),
      fileBytes: stat.size,
      readBytes: bytesRead,
      truncatedRead: start > 0,
    }
  } catch (error) {
    if (error instanceof LogReadError) throw error
    throw new LogReadError(`log read failed: ${error.message}`)
  } finally {
    if (fd != null) closeSync(fd)
  }
}

export function searchServiceLogs({
  logFile,
  minutes,
  limit,
  keyword,
  errorsOnly = false,
  now = Date.now(),
  maxBytes = LOG_READ_MAX_BYTES,
}) {
  const started = now
  const sinceMs = started - minutes * 60 * 1000
  const read = readTail(logFile, maxBytes)
  const lines = read.text.split(/\r?\n/u)
  const entries = []
  let omitted = 0
  let scanned = 0
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (!line) continue
    scanned += 1
    const timestamp = parseJournalTimestamp(line)
    if (timestamp != null && timestamp < sinceMs) continue
    if (errorsOnly && !isErrorLine(line)) continue
    if (keyword && !line.toLowerCase().includes(keyword.toLowerCase())) continue
    const text = sanitizeLogLine(line)
    if (text == null) {
      omitted += 1
      continue
    }
    entries.push({
      timestamp: timestamp ? new Date(timestamp).toISOString() : null,
      text,
    })
    if (entries.length >= limit) break
  }
  entries.reverse()
  return {
    source: 'eqb.service-export',
    queryMinutes: minutes,
    queryLimit: limit,
    keyword: keyword || null,
    errorsOnly,
    scannedLines: scanned,
    omittedSensitive: omitted,
    truncated: read.truncatedRead,
    fileBytes: read.fileBytes,
    readBytes: read.readBytes,
    range: {
      from: new Date(sinceMs).toISOString(),
      to: new Date(started).toISOString(),
    },
    entries,
  }
}
