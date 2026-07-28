/**
 * attach-paper-assets-extras.mjs <paperId>
 *
 * Post-publish step for nck1-paper-standard.md §4/§8: copies the pipeline's
 * staging listening/ + figures/ raw-material folders
 * (scripts/import-pipeline/papers/<paperId>/{listening,figures}/) into the
 * PUBLISHED paper-asset tree (app/public/paper-assets/<paperId>/{latest,
 * versions/vN}/{listening,figures}/), where N is every currently-published
 * version. This remains the bridge for separately staged listening files and
 * PDF/manual figure captures. DOCX source shapes are now published atomically
 * by publishPaperImportPackage itself; this script refuses to overwrite those
 * publisher-owned figure manifests.
 *
 * Run this AFTER `node 02-publish.mjs <config> --publish` has succeeded.
 * Safe to re-run (idempotent overwrite) if listening/figures content changes
 * before the next publish.
 *
 * Usage: node scripts/import-pipeline/attach-paper-assets-extras.mjs <paperId>
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')

const paperId = process.argv[2]
if (!paperId) {
  console.error('Usage: node attach-paper-assets-extras.mjs <paperId>')
  process.exit(1)
}

const stagingDir = path.join(__dirname, 'papers', paperId)
const stagingListening = path.join(stagingDir, 'listening')
const stagingFigures = path.join(stagingDir, 'figures')

const liveDir = path.join(rootDir, 'app/public/paper-assets', paperId)
if (!existsSync(liveDir)) {
  console.error(`FAIL: ${liveDir} does not exist — publish the paper first (02-publish.mjs <config> --publish).`)
  process.exit(1)
}

const targets = [path.join(liveDir, 'latest')]
const versionsDir = path.join(liveDir, 'versions')
if (existsSync(versionsDir)) {
  for (const entry of readdirSync(versionsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && /^v\d+$/.test(entry.name)) {
      targets.push(path.join(versionsDir, entry.name))
    }
  }
}

let copied = 0
for (const target of targets) {
  if (!existsSync(target)) continue
  for (const [label, src] of [['listening', stagingListening], ['figures', stagingFigures]]) {
    if (!existsSync(src)) {
      console.warn(`WARN: staging ${label}/ not found at ${src} — skipping for ${target}`)
      continue
    }
    const dest = path.join(target, label)
    if (label === 'figures') {
      const manifestPath = path.join(dest, 'manifest.json')
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        const hasPublisherOwnedDocxFigures = (manifest.figures || []).some(
          (figure) => typeof figure.sourcePart === 'string' && figure.sourcePart.startsWith('word/'),
        )
        if (hasPublisherOwnedDocxFigures) {
          console.error(`FAIL: refusing to overwrite publisher-owned DOCX figures at ${dest}`)
          process.exit(1)
        }
      }
    }
    mkdirSync(dest, { recursive: true })
    cpSync(src, dest, { recursive: true })
    console.log(`copied ${label}/ -> ${dest}`)
    copied += 1
  }
}

if (copied === 0) {
  console.error('FAIL: nothing copied — check staging listening/figures exist and liveDir has latest/versions.')
  process.exit(1)
}
console.log(`\nDone. ${copied} folder-copy operation(s) across ${targets.length} target dir(s).`)
console.log(`Next: node scripts/import-pipeline/verify-nck1-standard.mjs ${paperId}  (should now show POST-PUBLISH mode, all green)`)
