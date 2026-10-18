import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

// Observability must never turn a successful import into a failed one.
export function appendTiming(file, record) {
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    appendFileSync(file, `${JSON.stringify(record)}\n`)
  } catch (error) {
    console.error(`Timing receipt unavailable: ${error.message}`)
  }
}
