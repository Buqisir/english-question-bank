#!/usr/bin/env node

import {
  createVerifier,
  readText,
  repoRootFrom,
} from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier(
  'Canonical Paper Group surface adapter declaration parity verify',
)

const DTS =
  'shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.d.ts'
const DMTS =
  'shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.d.mts'

function normalizeDeclarations(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}():,])\s*/g, '$1')
    .trim()
}

section('canonicalPaperGroupSurfaceAdapter declaration companions')

const dts = readText(ROOT, DTS)
const dmts = readText(ROOT, DMTS)

assert(dts.length > 0, `${DTS} exists`)
assert(dmts.length > 0, `${DMTS} exists`)
assert(
  normalizeDeclarations(dts) === normalizeDeclarations(dmts),
  'canonicalPaperGroupSurfaceAdapter .d.ts and .d.mts declarations match',
)
assert(
  dmts.includes('Keep this file in sync')
    && dmts.includes('canonicalPaperGroupSurfaceAdapter.d.ts'),
  `${DMTS} names its parity companion`,
)

summary()
