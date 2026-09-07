/**
 * Verifies that PaperSurface `.mjs` TypeScript declaration companions
 * cannot drift silently.
 *
 * TypeScript classic consumers use `.d.ts`; the app bundler-mode build
 * resolves `.mjs` imports through `.d.mts`. The two files may have
 * different header comments, but their uncommented declarations must
 * stay equivalent.
 */

import { readdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import {
  createVerifier,
  readText,
  repoRootFrom,
} from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier('PaperSurface declaration parity verify')

const DECLARATION_DIR = 'shared/papersurface'
const dirAbs = resolve(ROOT, DECLARATION_DIR)

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

function normalizeDeclarations(source) {
  return stripComments(source)
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}():,])\s*/g, '$1')
    .trim()
}

section('PaperSurface .mjs declaration companion files')

const runtimeMjsFiles = readdirSync(dirAbs)
  .filter((file) => file.endsWith('.mjs'))
  .sort()

assert(runtimeMjsFiles.length > 0, 'shared/papersurface has .mjs runtime modules')

for (const runtimeFile of runtimeMjsFiles) {
  const stem = basename(runtimeFile, '.mjs')
  const dtsPath = `${DECLARATION_DIR}/${stem}.d.ts`
  const dmtsPath = `${DECLARATION_DIR}/${stem}.d.mts`

  const dts = readText(ROOT, dtsPath)
  const dmts = readText(ROOT, dmtsPath)

  assert(dts.length > 0, `${dtsPath} exists`)
  assert(dmts.length > 0, `${dmtsPath} exists`)
  assert(
    normalizeDeclarations(dts) === normalizeDeclarations(dmts),
    `${stem}: .d.ts and .d.mts uncommented declarations match`
  )
}

summary()
