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

function normalizeDeclarations(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}():,])\s*/g, '$1')
    .trim()
}

function assertDeclarationCompanions({
  label,
  dtsPath,
  dmtsPath,
}) {
  section(`${label} declaration companions`)

  const dts = readText(ROOT, dtsPath)
  const dmts = readText(ROOT, dmtsPath)

  assert(dts.length > 0, `${dtsPath} exists`)
  assert(dmts.length > 0, `${dmtsPath} exists`)
  assert(
    normalizeDeclarations(dts) === normalizeDeclarations(dmts),
    `${label} .d.ts and .d.mts declarations match`,
  )
  assert(
    dmts.includes('Keep this file in sync')
      && dmts.includes(dtsPath.split('/').at(-1)),
    `${dmtsPath} names its parity companion`,
  )
}

assertDeclarationCompanions({
  label: 'canonicalPaperGroupSurfaceAdapter',
  dtsPath:
    'shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.d.ts',
  dmtsPath:
    'shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.d.mts',
})

assertDeclarationCompanions({
  label: 'consumerProjection',
  dtsPath: 'shared/paper-canonical/consumerProjection.d.ts',
  dmtsPath: 'shared/paper-canonical/consumerProjection.d.mts',
})

summary()
