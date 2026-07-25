/**
 * PROTOTYPE — throw this shell away after the renderer-typography module
 * absorbs the decision recorded in NOTES.md.
 *
 * Question: can one pure, renderer-only selector reproduce the NEEA A–D
 * four-column / two-by-two / one-column choices while emitting one placement
 * plan that Screen/Print, PDF, and DOCX project without re-selection?
 *
 * The diagnostic fixtures retain labels and measured advances only. They do
 * not copy the reference-paper option text.
 */

import readline from 'node:readline'

export const RULES = Object.freeze({
  rulesetId: 'prototype:abcd-option-layout-selector-v1',
  fontFaceId: 'Times New Roman',
  fontSizeHalfPoint: 21,
  pageWidthTwip: 11906,
  horizontalMarginTwip: 1361,
  optionIndentTwip: 420,
  optionRowWidthTwip: 8764,
  minimumGutterTwip: 420,
  fitSafetyTwip: 20,
  fourColumnPitchTwip: 2080,
  twoColumnSecondTabTwip: 4020,
  oneColumnHangingIndentTwip: 420,
})

const LABELS = Object.freeze(['A', 'B', 'C', 'D'])

function sameLabels(options) {
  return (
    options.length === LABELS.length &&
    options.every((option, index) => option.label === LABELS[index])
  )
}

function columnCapacities(rules) {
  const four = [
    rules.fourColumnPitchTwip - rules.minimumGutterTwip - rules.fitSafetyTwip,
    rules.fourColumnPitchTwip - rules.minimumGutterTwip - rules.fitSafetyTwip,
    rules.fourColumnPitchTwip - rules.minimumGutterTwip - rules.fitSafetyTwip,
    rules.optionRowWidthTwip -
      rules.fourColumnPitchTwip * 3 -
      rules.fitSafetyTwip,
  ]
  const two = [
    rules.twoColumnSecondTabTwip -
      rules.minimumGutterTwip -
      rules.fitSafetyTwip,
    rules.optionRowWidthTwip -
      rules.twoColumnSecondTabTwip -
      rules.fitSafetyTwip,
    rules.twoColumnSecondTabTwip -
      rules.minimumGutterTwip -
      rules.fitSafetyTwip,
    rules.optionRowWidthTwip -
      rules.twoColumnSecondTabTwip -
      rules.fitSafetyTwip,
  ]
  const oneText =
    rules.optionRowWidthTwip -
    rules.oneColumnHangingIndentTwip -
    rules.fitSafetyTwip
  return { four, two, oneText }
}

function placementsFor(mode, rules) {
  if (mode === 'four_columns') {
    return LABELS.map((label, index) => ({
      label,
      row: 0,
      column: index,
      startTwip: index * rules.fourColumnPitchTwip,
    }))
  }
  if (mode === 'two_by_two') {
    return LABELS.map((label, index) => ({
      label,
      row: Math.floor(index / 2),
      column: index % 2,
      startTwip: (index % 2) * rules.twoColumnSecondTabTwip,
    }))
  }
  return LABELS.map((label, index) => ({
    label,
    row: index,
    column: 0,
    startTwip: 0,
    continuationStartTwip: rules.oneColumnHangingIndentTwip,
  }))
}

/**
 * Pure prototype selector.
 *
 * `measureOption` is a fixture-only internal seam in this throwaway shell. It
 * is deliberately not the production module interface: the durable verdict
 * requires the deep renderer-typography module to hide shaping and expose only
 * `layoutAbcdOptionSet(optionSet)`.
 */
function selectAbcdOptionLayout(
  optionSet,
  measureOption,
  rules = RULES,
) {
  if (optionSet.owner !== 'question' || !sameLabels(optionSet.options)) {
    return {
      status: 'not_applicable',
      reason: 'selector_requires_one_question_owned_A_B_C_D_set',
    }
  }

  const measured = optionSet.options.map((option) => ({
    label: option.label,
    ...measureOption(option.content, option.label),
  }))
  if (
    measured.some(
      (item) =>
        !Number.isInteger(item.singleLineAdvanceTwip) ||
        !Number.isInteger(item.maxUnbreakableTwip) ||
        item.singleLineAdvanceTwip < 0 ||
        item.maxUnbreakableTwip < 0,
    )
  ) {
    return {
      status: 'needs_review',
      reason: 'invalid_or_non_fixed_point_measurement',
    }
  }

  const capacities = columnCapacities(rules)
  const denseEligible = (limits) =>
    measured.every(
      (item, index) =>
        !item.unsupportedNode &&
        item.hardBreakCount === 0 &&
        item.singleLineAdvanceTwip <= limits[index],
    )

  let mode
  if (denseEligible(capacities.four)) {
    mode = 'four_columns'
  } else if (denseEligible(capacities.two)) {
    mode = 'two_by_two'
  } else if (
    measured.every(
      (item) =>
        !item.unsupportedNode &&
        item.maxUnbreakableTwip <= capacities.oneText,
    )
  ) {
    mode = 'one_column'
  } else {
    return {
      status: 'needs_review',
      reason: 'one_column_contains_unrenderable_unbreakable_content',
      measured,
      capacities,
    }
  }

  return {
    status: 'selected',
    rulesetId: rules.rulesetId,
    mode,
    measured,
    capacities,
    placements: placementsFor(mode, rules),
  }
}

function toPt(twip) {
  return Number((twip / 20).toFixed(2))
}

function trackWidths(starts, total) {
  return starts.map((start, index) =>
    (index + 1 < starts.length ? starts[index + 1] : total) - start,
  )
}

function placementSignature(plan) {
  return plan.placements
    .map(({ label, row, startTwip }) => `${label}@${row}:${startTwip}`)
    .join('|')
}

export function projectScreenPrint(plan, rules = RULES) {
  if (plan.status !== 'selected') return { status: plan.status }
  const starts =
    plan.mode === 'four_columns'
      ? [
          0,
          rules.fourColumnPitchTwip,
          rules.fourColumnPitchTwip * 2,
          rules.fourColumnPitchTwip * 3,
        ]
      : plan.mode === 'two_by_two'
        ? [0, rules.twoColumnSecondTabTwip]
        : [0, rules.oneColumnHangingIndentTwip]
  return {
    surface: 'screen_print',
    selectorRunsHere: false,
    css: {
      display: 'grid',
      gridTemplateColumnsPt: trackWidths(
        starts,
        rules.optionRowWidthTwip,
      ).map(toPt),
      gridAutoFlow: 'forbidden',
      whiteSpace:
        plan.mode === 'one_column' ? 'normal_with_hanging_indent' : 'nowrap',
    },
    explicitPlacements: plan.placements,
    logicalSignature: placementSignature(plan),
  }
}

export function projectPdf(plan, rules = RULES) {
  if (plan.status !== 'selected') return { status: plan.status }
  return {
    surface: 'pdf',
    selectorRunsHere: false,
    rows: plan.placements.map(({ label, row, startTwip }) => ({
      label,
      row,
      xPt: toPt(startTwip),
      wrap:
        plan.mode === 'one_column'
          ? { continuationXPt: toPt(rules.oneColumnHangingIndentTwip) }
          : 'forbidden',
    })),
    logicalSignature: placementSignature(plan),
  }
}

export function projectDocx(plan, rules = RULES) {
  if (plan.status !== 'selected') return { status: plan.status }
  const tabStopsTwip =
    plan.mode === 'four_columns'
      ? [
          rules.fourColumnPitchTwip,
          rules.fourColumnPitchTwip * 2,
          rules.fourColumnPitchTwip * 3,
        ]
      : plan.mode === 'two_by_two'
        ? [rules.twoColumnSecondTabTwip]
        : []
  return {
    surface: 'docx',
    selectorRunsHere: false,
    nativeUnit: 'twip',
    tabStopsTwip,
    paragraphPolicy:
      plan.mode === 'four_columns'
        ? 'one_paragraph_A_tab_B_tab_C_tab_D'
        : plan.mode === 'two_by_two'
          ? 'two_paragraphs_A_tab_B_then_C_tab_D'
          : 'four_paragraphs_with_420_twip_hanging_indent',
    resolvedStartsTwip: plan.placements.map(
      ({ label, row, startTwip }) => ({ label, row, startTwip }),
    ),
    logicalSignature: placementSignature(plan),
  }
}

function optionSet(labels = LABELS) {
  return {
    owner: 'question',
    options: labels.map((label) => ({
      label,
      content: [{ kind: 'text', text: `[diagnostic content ${label}]` }],
    })),
  }
}

function metrics(widths, overrides = {}) {
  return Object.fromEntries(
    LABELS.map((label, index) => [
      label,
      {
        singleLineAdvanceTwip: widths[index],
        maxUnbreakableTwip: widths[index],
        hardBreakCount: 0,
        unsupportedNode: false,
        ...overrides[label],
      },
    ]),
  )
}

const FIXTURES = Object.freeze([
  {
    key: '1',
    id: 'gold-page-04-q21',
    expected: 'four_columns',
    optionSet: optionSet(),
    measured: metrics([1257, 1459, 1366, 1062]),
  },
  {
    key: '2',
    id: 'gold-page-04-q23',
    expected: 'two_by_two',
    optionSet: optionSet(),
    measured: metrics([2077, 2217, 2001, 2473]),
  },
  {
    key: '3',
    id: 'gold-page-04-q22',
    expected: 'one_column',
    optionSet: optionSet(),
    measured: metrics([2721, 2760, 3869, 4377]),
  },
  {
    key: '4',
    id: 'gold-page-09-cloze-column-maxima',
    expected: 'four_columns',
    optionSet: optionSet(),
    measured: metrics([1248, 1120, 1202, 1552]),
  },
  {
    key: '5',
    id: 'explicit-hard-break',
    expected: 'one_column',
    optionSet: optionSet(),
    measured: metrics(
      [900, 900, 900, 900],
      { C: { hardBreakCount: 1, maxUnbreakableTwip: 600 } },
    ),
  },
  {
    key: '6',
    id: 'synthetic-wrappable-overflow',
    expected: 'one_column',
    optionSet: optionSet(),
    measured: metrics(
      [12000, 1000, 1000, 1000],
      { A: { maxUnbreakableTwip: 2000 } },
    ),
  },
  {
    key: '7',
    id: 'synthetic-unbreakable-overflow',
    expected: 'needs_review',
    optionSet: optionSet(),
    measured: metrics(
      [12000, 1000, 1000, 1000],
      { A: { maxUnbreakableTwip: 9000 } },
    ),
  },
  {
    key: '8',
    id: 'shared-A-G-bank-is-out-of-scope',
    expected: 'not_applicable',
    optionSet: optionSet(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
    measured: metrics([900, 900, 900, 900]),
  },
])

function runFixture(fixture) {
  const plan = selectAbcdOptionLayout(
    fixture.optionSet,
    (_content, label) => fixture.measured[label],
  )
  const actual = plan.mode ?? plan.status
  const projections =
    plan.status === 'selected'
      ? {
          screenPrint: projectScreenPrint(plan),
          pdf: projectPdf(plan),
          docx: projectDocx(plan),
        }
      : {}
  const signatures = Object.values(projections).map(
    (projection) => projection.logicalSignature,
  )
  return {
    fixture: fixture.id,
    expected: fixture.expected,
    actual,
    matchesExpected: actual === fixture.expected,
    plan,
    projections,
    projectionParity:
      signatures.length === 0 || new Set(signatures).size === 1,
  }
}

function renderFrame(fixture, clear = true) {
  if (clear && process.stdout.isTTY) console.clear()
  const state = runFixture(fixture)
  console.log('\x1b[1mA–D option layout selector — PROTOTYPE\x1b[0m')
  console.log(
    '\x1b[2mNo renderer re-selects; all projections consume one plan.\x1b[0m',
  )
  console.log(JSON.stringify(state, null, 2))
  console.log()
  console.log(
    FIXTURES.map(({ key, id }) => `\x1b[1m[${key}]\x1b[0m ${id}`).join('  '),
  )
  console.log('\x1b[1m[q]\x1b[0m quit')
}

if (process.argv.includes('--all')) {
  for (const fixture of FIXTURES) {
    console.log(JSON.stringify(runFixture(fixture), null, 2))
  }
} else if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  let current = FIXTURES[0]
  renderFrame(current, false)
  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on('keypress', (_value, key) => {
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
      process.stdin.pause()
      return
    }
    const next = FIXTURES.find((fixture) => fixture.key === key.name)
    if (next) {
      current = next
      renderFrame(current)
    }
  })
}
