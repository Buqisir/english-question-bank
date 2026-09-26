#!/usr/bin/env node
import path from 'node:path'
import { initializeUsageLedger } from '../server/paper-translation/usageLedger.mjs'

// First-time setup only. Lost production accounting must be restored, not reset.
const [operation, filePath, ...extra] = process.argv.slice(2)
if (operation !== '--new' || !filePath || extra.length > 0 || !path.isAbsolute(filePath)) {
  console.error('Usage: node scripts/initialize-paper-translation-ledger.mjs --new /absolute/stable/path/translation-usage.sqlite')
  process.exitCode = 1
} else {
  try {
    initializeUsageLedger({ filePath })
    console.log('Initialized a new translation usage ledger. Translation settings were not changed.')
  } catch (error) {
    console.error(error.code === 'EEXIST'
      ? 'Refusing to overwrite an existing ledger. Restore accounting from a verified backup if needed.'
      : 'Ledger initialization failed. Inspect the file before retrying; no existing ledger was overwritten.')
    process.exitCode = 1
  }
}
