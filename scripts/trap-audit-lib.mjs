/**
 * trap-audit-lib.mjs — shared, deterministic judgment logic for the
 * r2-trap-audit cut (docs/cuts/r2-trap-audit/plan.md Scope 步骤 1/3).
 *
 * Every check here is a pure function over one `trap` object (+ its sibling
 * option-level fields) with zero AI / zero randomness, so a re-run always
 * reproduces the same findings — this is what lets scan-report.md's counts
 * be recomputed from scan-findings.json (plan.md 强调「报告数字必须可由
 * findings.json 复算」). trap-audit-scan.mjs (read-only survey) and
 * trap-audit-apply-suspension.mjs (data-writing batch) both import this
 * module so the judgment definition can never drift between "what we found"
 * and "what we suspended".
 *
 * Five trap primaryTypes are controlled per app/src/domain/paperAsset.ts:
 * sourceLexicalTrap / polarityReversal / scopeShift / entityMismatch /
 * unsupportedClaim. Each has its own required-field shape (sourceLexicalTrap
 * uses sourceText/relationNote instead of sourceQuote/explanation — the one
 * program.md explicitly calls out as the type the scanner must adapt to).
 */

export const CONTROLLED_TRAP_TYPES = [
  'sourceLexicalTrap',
  'polarityReversal',
  'scopeShift',
  'entityMismatch',
  'unsupportedClaim',
]

export const CHECK_IDS = {
  ROGUE_TYPE: 'rogueType',
  LABEL_EXPLANATION_CONTRADICTION: 'labelExplanationContradiction',
  STRUCTURAL_INCOMPLETENESS: 'structuralIncompleteness',
  EVIDENCE_FIELD_LEAK: 'evidenceFieldLeak',
}

// Checks whose finding gets an automatic suspension write in step 3 (plan.md:
// "机判实锤自动摘牌批...按 findings.json 中「机器可证伪」子集（自相矛盾 +
// 子结构坏死 + 野类型）批量写 suspension"). evidenceFieldLeak is deliberately
// excluded — it stays for the second-段 owner judgment battle.
export const AUTO_SUSPEND_CHECK_IDS = new Set([
  CHECK_IDS.ROGUE_TYPE,
  CHECK_IDS.LABEL_EXPLANATION_CONTRADICTION,
  CHECK_IDS.STRUCTURAL_INCOMPLETENESS,
])

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

// A quoted English-letter substring inside the explanation — the exact
// pattern behind the owner-reviewed sample #18 (2026-07-10 抽检基线):
// an `unsupportedClaim` ("无中生有" — nothing in the passage supports this
// option) whose own explanation nonetheless quotes real source wording as
// if it were grounding evidence. Requires >=3 letters inside a quote pair
// (ASCII '/" or curly “”/'') so it only fires on an actual quoted English
// phrase, not on the routine Chinese negation prose ("原文未提及...", which
// is legitimate, non-contradictory reasoning and must not be flagged).
const QUOTED_ENGLISH_HOOK = /["'“']([a-zA-Z][a-zA-Z0-9 ,.'-]{2,})["'”']/

/**
 * checkId: labelExplanationContradiction — plan.md's own parenthetical
 * definition: "sourceQuote/sourceText 非空 或 解释文本含引号引原文".
 * `unsupportedClaim` per the domain schema never declares sourceQuote /
 * sourceText fields, but the check still defends against a stray leaked key
 * of either name (copy-paste from another trap shape) in addition to the
 * quoted-hook text pattern this corpus actually contains.
 */
export function isLabelExplanationContradiction(trap) {
  if (!trap || trap.primaryType !== 'unsupportedClaim') return false
  if (nonEmpty(trap.sourceQuote) || nonEmpty(trap.sourceText)) return true
  return QUOTED_ENGLISH_HOOK.test(String(trap.explanation || ''))
}

/**
 * checkId: evidenceFieldLeak (懒人桶引证泄漏) — an `unsupportedClaim`
 * ("无中生有": nothing in the passage supports this option) whose sibling
 * option-level evidence fields (`trapEvidence` / the correct-option-only
 * `evidence`) are nonetheless populated with a real quote — i.e. the record
 * itself carries passage evidence for a claim it says the passage has none
 * for. Held out of the auto-suspend batch (plan.md step 3) — the owner
 * reviews this bucket's edge cases in the second-段 judgment battle.
 */
export function isEvidenceFieldLeak(option) {
  const trap = option?.trap
  if (!trap || trap.primaryType !== 'unsupportedClaim') return false
  const trapEvidenceHasQuote = Array.isArray(option.trapEvidence)
    && option.trapEvidence.some((item) => nonEmpty(item?.quote))
  const evidenceHasQuote = Array.isArray(option.evidence)
    && option.evidence.some((item) => nonEmpty(item?.quote))
  return trapEvidenceHasQuote || evidenceHasQuote
}

// Required-field shape per controlled primaryType (子结构完整性判据),
// keyed by primaryType so the scanner can adapt per type as program.md
// requires (sourceLexicalTrap's sourceText/relationNote pair is its own
// shape, not sourceQuote/explanation like the other four).
const REQUIRED_FIELDS_BY_TYPE = {
  sourceLexicalTrap: {
    strings: ['sourceText', 'optionText', 'relationNote'],
    enums: { matchType: ['exact', 'wordFamily'] },
  },
  polarityReversal: {
    strings: ['sourceQuote', 'sourceHighlight', 'optionText', 'optionHighlight', 'explanation'],
    enums: {
      subtype: [
        'oppositeAction',
        'oppositeAttitude',
        'oppositeTrend',
        'causeEffectReversal',
        'timeOrderReversal',
        'negationReversal',
      ],
    },
  },
  scopeShift: {
    strings: ['sourceQuote', 'sourceHighlight', 'optionText', 'optionHighlight', 'explanation'],
    enums: {
      subtype: ['overgeneralization', 'overstatement', 'understatement', 'conditionRemoved'],
    },
  },
  entityMismatch: {
    strings: ['sourceQuote', 'sourceEntity', 'optionText', 'optionEntity', 'explanation'],
    enums: {},
  },
  unsupportedClaim: {
    strings: ['claim', 'explanation'],
    enums: {},
  },
}

/**
 * checkId: structuralIncompleteness — per-type required field/enum
 * completeness. Returns the list of missing/invalid field names (empty
 * array = structurally intact). Only defined for the five controlled
 * types — a rogue primaryType is caught by isRogueType instead, not double
 * counted here.
 */
export function structuralIncompletenessFields(trap) {
  const shape = REQUIRED_FIELDS_BY_TYPE[trap?.primaryType]
  if (!shape) return []
  const missing = []
  for (const field of shape.strings) {
    if (!nonEmpty(trap[field])) missing.push(field)
  }
  for (const [field, allowed] of Object.entries(shape.enums)) {
    if (!allowed.includes(trap[field])) missing.push(field)
  }
  return missing
}

export function isRogueType(trap) {
  return Boolean(trap) && !CONTROLLED_TRAP_TYPES.includes(trap.primaryType)
}

/**
 * A rogue-typed trap can still be structurally a byte-for-byte match of one
 * of the four sourceQuote-based shapes (this corpus's one confirmed rogue
 * record, `primaryType: 'timeOrderReversal'`, is exactly this — it is a
 * complete polarityReversal/scopeShift-shaped object filed under the wrong
 * label). When the fields line up, the explanation is safely extractable
 * (badge: hide the mislabeled type, keep the explanation). When nothing
 * lines up, there is no safe field to read (row: hide the whole thing).
 */
export function rogueTypeHasSafeExplanationShape(trap) {
  if (!trap) return false
  if (nonEmpty(trap.relationNote)) return true
  if (nonEmpty(trap.explanation)) return true
  return false
}

/**
 * Runs all four checks against one wrong option's trap, returning zero or
 * more `{ checkId, level }` hits. `level` is `null` for checks that are not
 * part of the auto-suspend batch (evidenceFieldLeak) or that this specific
 * hit does not resolve to a suspendable level.
 */
export function evaluateOption(option) {
  const trap = option?.trap
  if (!trap) return []
  const hits = []

  if (isRogueType(trap)) {
    hits.push({
      checkId: CHECK_IDS.ROGUE_TYPE,
      level: rogueTypeHasSafeExplanationShape(trap) ? 'badge' : 'row',
    })
  }

  if (isLabelExplanationContradiction(trap)) {
    hits.push({ checkId: CHECK_IDS.LABEL_EXPLANATION_CONTRADICTION, level: 'badge' })
  }

  // Structural completeness is only evaluated for the five controlled
  // types — a rogueType hit already covers the "wrong bucket entirely"
  // case above, so this check stays scoped to type-declared field shapes.
  if (!isRogueType(trap)) {
    const missing = structuralIncompletenessFields(trap)
    if (missing.length > 0) {
      hits.push({ checkId: CHECK_IDS.STRUCTURAL_INCOMPLETENESS, level: 'row', missing })
    }
  }

  if (isEvidenceFieldLeak(option)) {
    hits.push({ checkId: CHECK_IDS.EVIDENCE_FIELD_LEAK, level: null })
  }

  return hits
}
