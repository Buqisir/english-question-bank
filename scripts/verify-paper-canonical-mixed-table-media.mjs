#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

import {
  trustedDocxCandidateAuthorityRef,
} from '../shared/paper-canonical/authority.mjs'
import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import {
  makeMixedTableMediaCanonicalFixture,
} from '../test-fixtures/paper-canonical/mixedTableMediaFixture.mjs'
import { bindCanonicalFixtureRequest } from '../test-fixtures/paper-canonical/framedColumnsFixture.mjs'

// Frozen v37 retains the old table contract: rowSpan is inert (must be 1) and
// cell media_ref is not admitted.
const { fixture } = makeMixedTableMediaCanonicalFixture()
fixture.request.authority = trustedDocxCandidateAuthorityRef
const frozen = compileCanonicalPaper(fixture.request)
assert.notEqual(frozen.disposition, 'ready')
assert(frozen.artifacts.normalizationReport.diagnostics.some((item) =>
  item.code === 'AUTHORITY_RETIRED'))

const rowSpanFixture = makeMixedTableMediaCanonicalFixture().fixture
const table = rowSpanFixture.source.groups.find((group) =>
  group.slotId === 'reading.a').content.blocks[0]
table.rows[0].cells[0].rowSpan = 2
table.rows[1].cells.shift()
bindCanonicalFixtureRequest(rowSpanFixture, rowSpanFixture.source)
const rowSpanFrozen = compileCanonicalPaper(rowSpanFixture.request)
assert(rowSpanFrozen.artifacts.normalizationReport.diagnostics.some((item) =>
  item.code === 'RICH_TABLE_CELL_INVALID'))

// The private Candidate test derives the same mixed table through v46,
// confirms it externally, and exercises serialized-request replay.
execFileSync(process.execPath, [
  'scripts/verify-paper-canonical-nck1-materialization-candidate.mjs',
], { stdio: 'inherit' })

console.log('verify-paper-canonical-mixed-table-media: PASS')
