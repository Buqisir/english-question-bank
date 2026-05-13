#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const traceId = (process.argv[2] || '').trim()
if (!traceId) {
  console.error('Usage: node scripts/inspect-verify-trace.mjs <traceId>')
  process.exit(1)
}

const logPath = path.resolve(process.cwd(), 'server/logs/verify-audit.log')
if (!existsSync(logPath)) {
  console.log(JSON.stringify({ traceId, events: [] }, null, 2))
  process.exit(0)
}

const events = []
for (const line of readFileSync(logPath, 'utf8').split('\n')) {
  if (!line.trim()) continue
  try {
    const entry = JSON.parse(line)
    if (entry.traceId === traceId) {
      events.push(entry)
    }
  } catch {
    // ignore malformed lines
  }
}

console.log(JSON.stringify({ traceId, events }, null, 2))
