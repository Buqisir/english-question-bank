#!/usr/bin/env node
/**
 * verify-paper-surface-textmap-adapter-plan
 *
 * Issue #21-B2 — PaperSurface TextMap / AnnotationModel Adapter
 * Plan.
 *
 * This is a DOC + TYPES verifier. It locks the decisions in
 * `docs/paper-surface-textmap-adapter-plan.md` and the structural
 * refinements in `shared/papersurface/types.d.ts` so a future draft
 * cannot drop a constraint silently.
 *
 * Scope:
 *   - Documentation + types-only. The script does NOT inspect any
 *     runtime code. It reads the plan markdown, the types file, and
 *     consults `git diff` against merge-base.
 *
 * What it asserts (high level):
 *   1.  The plan file exists at the canonical path.
 *   2.  The plan covers each of the three adapter paths
 *       (PI report / Assembly Basket / reading-analysis).
 *   3.  The plan locks the cross-cutting invariants: TextMap is
 *       evidence-independent, PaperAnnotation stores no independent
 *       char offset, annotation payload is host-owned (not embedded
 *       on the record), and `request-read-this-sentence` is an
 *       atomic intent.
 *   4.  `shared/papersurface/types.d.ts` declares `PaperAnnotation`
 *       as a discriminated union by `scope`: question-scoped MUST
 *       carry `questionId`, passage-scoped MUST NOT.
 *   5.  `shared/papersurface/types.d.ts` declares a renderable
 *       `PaperQuestion` (stem + options) and a `PaperQuestionOption`
 *       with `label` / `text` / optional `translation`.
 *   6.  `shared/papersurface/types.d.ts` declares the v1
 *       `PaperAnnotationKind` taxonomy as a single source of truth.
 *   7.  No runtime / app / server / package / lockfile / CSS / route
 *       file is changed by this PR.
 *
 * Cloud-safe:
 *   - never spawns a browser,
 *   - never starts a build,
 *   - never needs node_modules,
 *   - only reads source files + runs `git diff` against merge-base.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, '..')

let passed = 0
let failed = 0
const issues = []

function assert(name, condition, detail) {
  if (condition) {
    passed++
    console.log(`  \u2713 ${name}`)
  } else {
    failed++
    issues.push(`${name}: ${detail || 'failed'}`)
    console.error(`  \u2717 ${name}: ${detail || 'failed'}`)
  }
}

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf-8')
}

console.log(
  '\n=== PaperSurface TextMap / AnnotationModel Adapter Plan (#21-B2) ===\n',
)

const PLAN_REL = 'docs/paper-surface-textmap-adapter-plan.md'
const TYPES_REL = 'shared/papersurface/types.d.ts'
const ADR_REL = 'docs/adr/0003-paper-surface-interaction-model.md'

/* ─── 1. Plan file exists ────────────────────────────────────────── */

console.log('Test 1: plan file exists')

assert(`${PLAN_REL} exists`, existsSync(path.join(ROOT, PLAN_REL)), PLAN_REL)
assert(`${TYPES_REL} exists`, existsSync(path.join(ROOT, TYPES_REL)), TYPES_REL)
assert(`${ADR_REL} exists`, existsSync(path.join(ROOT, ADR_REL)), ADR_REL)

const planSrc = readSrc(PLAN_REL)
const typesSrc = readSrc(TYPES_REL)

/* ─── 2. Plan front-matter / framing ─────────────────────────────── */

console.log('\nTest 2: plan is marked as a B2 planning note (doc + types-only)')

assert(
  'plan title references Issue #21-B2',
  /#\s*21-B2/.test(planSrc),
  'expected "#21-B2" in the plan title',
)
assert(
  'plan title names "TextMap / AnnotationModel Adapter Plan" (or equivalent)',
  /TextMap[\s\S]{0,80}AnnotationModel[\s\S]{0,80}Adapter\s+Plan/i.test(
    planSrc,
  ) || /Adapter\s+Plan[\s\S]{0,80}TextMap/i.test(planSrc),
  'expected "TextMap ... AnnotationModel Adapter Plan" framing',
)
assert(
  'plan carries a Status / locked-planning-note marker',
  /Locked\s+planning\s+note/i.test(planSrc),
  'expected "Locked planning note" status marker',
)
assert(
  'plan states it is documentation-only / no runtime change',
  /Documentation-only/i.test(planSrc) &&
    /(no\s+runtime\s+code|does\s+not\s+(?:change|modify|introduce)\s+runtime)/i.test(
      planSrc,
    ),
  'expected explicit doc-only / no-runtime-change statement',
)
assert(
  'plan references ADR 0003 as the contract source',
  planSrc.includes('docs/adr/0003-paper-surface-interaction-model.md'),
  'ADR 0003 reference missing',
)
assert(
  'plan references shared/papersurface/types.d.ts',
  planSrc.includes('shared/papersurface/types.d.ts'),
  'types.d.ts reference missing',
)
assert(
  'plan references shared/papersurface/anchorKeys.mjs',
  planSrc.includes('shared/papersurface/anchorKeys.mjs'),
  'anchorKeys.mjs reference missing',
)

/* ─── 3. Cross-cutting invariants ────────────────────────────────── */

console.log('\nTest 3: cross-cutting invariants are restated')

assert(
  'plan says TextMap does NOT depend on evidence',
  /TextMap[\s\S]{0,400}(?:does\s+NOT|not)\s+depend\s+on\s+evidence/i.test(
    planSrc,
  ) ||
    /(?:no|without)\s+evidence[\s\S]{0,200}TextMap/i.test(planSrc),
  'TextMap-evidence-independence statement missing',
)
assert(
  'plan says PaperAnnotation stores no independent char offset',
  /PaperAnnotation[\s\S]{0,400}(?:do\s+NOT|does\s+not|not)\s+store\s+independent\s+character\s+offset/i.test(
    planSrc,
  ) ||
    /Annotations\s+DO\s+NOT\s+store\s+independent\s+character\s+offsets/i.test(
      planSrc,
    ),
  'no-independent-char-offset statement missing',
)
assert(
  'plan says annotation payload is host-owned (not embedded on the record)',
  /payload\s+is\s+host-?owned/i.test(planSrc) &&
    /no(?:t)?\s+(?:embed|carry|carries|carried|embedded|store|stored|ship)[\s\S]{0,200}explanation\s+payload/i.test(
      planSrc,
    ),
  'host-owned payload statement missing',
)
assert(
  'plan says PaperAnnotation record carries anchors and metadata only',
  /anchors\s+and\s+metadata\s+only/i.test(planSrc),
  '"anchors and metadata only" framing missing',
)
assert(
  'plan documents that the host stores payload keyed by annotation id',
  /keyed\s+by\s+`?annotation(?:\.id)?`?[\s\S]{0,200}id/i.test(planSrc) ||
    /keyed\s+by[\s\S]{0,80}`?annotation\.id`?/i.test(planSrc) ||
    /annotation(?:\.id)?[\s\S]{0,80}lookup/i.test(planSrc),
  'host-store-keyed-by-id statement missing',
)

/* ─── 4. PI report / input → PaperTextMap ────────────────────────── */

console.log('\nTest 4: PI report / input → PaperTextMap adapter path')

assert(
  'plan has a PI section heading',
  /PI\s+report[\s\S]{0,80}PaperTextMap/i.test(planSrc),
  'PI section heading missing',
)
assert(
  'plan maps passages → sections',
  /(passages?[\s\S]{0,200}section|PassageReport[\s\S]{0,200}section)/i.test(
    planSrc,
  ),
  'passage→section mapping missing',
)
assert(
  'plan maps passageBody → paragraphs / sentences',
  /passageBody[\s\S]{0,400}paragraphs?[\s\S]{0,200}sentences?/i.test(planSrc),
  'passageBody→paragraphs/sentences mapping missing',
)
assert(
  'plan derives question id from (paperSection, questionNo)',
  /\(\s*paperSection\s*,\s*questionNo\s*\)/i.test(planSrc) ||
    /paperSection[\s\S]{0,40}questionNo[\s\S]{0,200}question(?:\s+)?id/i.test(
      planSrc,
    ),
  'question-id construction rule missing',
)
assert(
  'plan maps QuestionAnalysis.options → PaperQuestionOption',
  /QuestionAnalysis\.options[\s\S]{0,400}PaperQuestionOption/i.test(planSrc) ||
    /option(?:\.label|\.content)[\s\S]{0,400}PaperQuestionOption/i.test(
      planSrc,
    ),
  'options→PaperQuestionOption mapping missing',
)
assert(
  'plan names toEvidenceModel as the evidence-channel source',
  /toEvidenceModel/.test(planSrc),
  'toEvidenceModel reference missing',
)
assert(
  'plan keeps correct answer / explanation off PaperQuestion',
  /(answer|explanation|distractor|synonym|answerEvidence)[\s\S]{0,400}(?:NOT\s+part\s+of|stay\s+host-?owned|host-?owned|right\s+panel)/i.test(
    planSrc,
  ),
  'answer-stays-host-owned statement missing',
)

/* ─── 5. Assembly Basket / 草稿卷 → PaperTextMap ─────────────────── */

console.log('\nTest 5: Assembly Basket / 草稿卷 → PaperTextMap adapter path')

assert(
  'plan has an Assembly Basket / 草稿卷 section heading',
  /Assembly\s+Basket[\s\S]{0,80}草稿卷[\s\S]{0,80}PaperTextMap/i.test(planSrc) ||
    /草稿卷[\s\S]{0,80}PaperTextMap/i.test(planSrc),
  'basket section heading missing',
)
assert(
  'plan acknowledges 草稿卷 typically has no evidence',
  /(草稿卷[\s\S]{0,400}(?:NO|no|without|absent)[\s\S]{0,200}evidence|草稿卷[\s\S]{0,200}typically\s+has\s+NO)/i.test(
    planSrc,
  ),
  '"基本没有 evidence" statement missing',
)
assert(
  'plan emits empty annotations / evidence for basket-sourced papers',
  /annotations:\s*\[\]/.test(planSrc) && /evidence:\s*\[\]/.test(planSrc),
  'empty annotations/evidence emission rule missing',
)
assert(
  'plan maps BasketItem / QuestionGroupCard onto a section',
  /(BasketItem|QuestionGroupCard|QuestionGroupDetail)[\s\S]{0,400}section/i.test(
    planSrc,
  ),
  'basket-item→section mapping missing',
)
assert(
  'plan keeps edit chrome / basket state out of the TextMap',
  /(score\s+overrides?|sectionTitle|drag-?reorder|basket\s+persistence|note)[\s\S]{0,400}(?:does\s+NOT|do\s+not|not)\s+(?:leak|enter)/i.test(
    planSrc,
  ) ||
    /(?:does\s+NOT|do\s+not|not)\s+(?:leak|enter)[\s\S]{0,200}TextMap/i.test(
      planSrc,
    ),
  'basket-state-stays-out rule missing',
)
assert(
  'plan says PaperSurface does NOT know about basket persistence',
  /PaperSurface[\s\S]{0,400}MUST\s+NOT\s+(?:learn|know)\s+about[\s\S]{0,200}basket/i.test(
    planSrc,
  ) ||
    /PaperSurface[\s\S]{0,400}(?:does\s+NOT|not)\s+know\s+about\s+the\s+basket/i.test(
      planSrc,
    ),
  'PaperSurface-basket-blindness rule missing',
)

/* ─── 6. reading-analysis → PaperSurface ─────────────────────────── */

console.log('\nTest 6: reading-analysis → PaperSurface adapter path')

assert(
  'plan has a reading-analysis section heading',
  /reading-?analysis[\s\S]{0,80}PaperSurface/i.test(planSrc),
  'reading-analysis section heading missing',
)
assert(
  'plan acknowledges data-ra-* exists today',
  /data-ra-\*/.test(planSrc),
  'data-ra-* mention missing',
)
assert(
  'plan freezes data-ra-* for the duration of #21-B',
  /data-ra-\*[\s\S]{0,400}(?:frozen|freeze|locked)[\s\S]{0,400}#21-?B/i.test(
    planSrc,
  ) || /(?:frozen|freeze|locked)[\s\S]{0,200}data-ra-\*/i.test(planSrc),
  'data-ra-* freeze statement missing',
)
assert(
  'plan says PaperSurface does NOT copy / mirror data-ra-*',
  /(does\s+NOT|not)\s+(?:copy|mirror|rename|duplicate)[\s\S]{0,200}data-ra-\*/i.test(
    planSrc,
  ),
  'no-copy-data-ra rule missing',
)
assert(
  'plan says B4a must answer the migration vs long-lived sibling decision',
  /B4a[\s\S]{0,800}(?:migration|migrate)[\s\S]{0,400}(?:long-?lived\s+sibling|sibling)/i.test(
    planSrc,
  ) ||
    /B4a[\s\S]{0,800}(?:long-?lived\s+sibling|sibling)[\s\S]{0,400}(?:migration|migrate)/i.test(
      planSrc,
    ),
  'B4a-migration-vs-sibling rule missing',
)
assert(
  'plan describes the sentence / quote anchor mapping into PaperTextMap / PaperAnnotation',
  /(sentence[\s\S]{0,200}quote|quote[\s\S]{0,200}sentence)[\s\S]{0,800}PaperTextMap[\s\S]{0,400}PaperAnnotation/i.test(
    planSrc,
  ),
  'sentence/quote-anchor mapping statement missing',
)

/* ─── 7. request-read-this-sentence atomic intent ─────────────────── */

console.log('\nTest 7: `request-read-this-sentence` atomic-intent rationale')

assert(
  'plan documents request-read-this-sentence as an atomic intent',
  /request-read-this-sentence[\s\S]{0,400}atomic\s+intent/i.test(planSrc),
  'atomic-intent label missing',
)
assert(
  'plan explains it expresses both mode switch AND sentence focus',
  /(switch[\s\S]{0,80}reading\s+mode[\s\S]{0,400}focus[\s\S]{0,200}sentence|both[\s\S]{0,400}reading\s+mode[\s\S]{0,400}sentence)/i.test(
    planSrc,
  ),
  'mode + focus rationale missing',
)
assert(
  'plan explains the no-half-state argument',
  /half[-\s]?state/i.test(planSrc),
  '"half-state" rationale missing',
)
assert(
  'types.d.ts also embeds the atomic-intent rationale on the intent variant',
  /request-read-this-sentence[\s\S]{0,1200}atomic[\s\S]{0,800}half[-\s]?state/i.test(
    typesSrc,
  ),
  'types-side atomic-intent JSDoc missing',
)

/* ─── 8. PaperAnnotation discriminated union by scope ─────────────── */

console.log('\nTest 8: PaperAnnotation is a discriminated union by `scope`')

assert(
  'types.d.ts declares PaperQuestionAnnotation',
  /(?:type|interface)\s+PaperQuestionAnnotation\b/.test(typesSrc),
  'PaperQuestionAnnotation declaration missing',
)
assert(
  'types.d.ts declares PaperPassageAnnotation',
  /(?:type|interface)\s+PaperPassageAnnotation\b/.test(typesSrc),
  'PaperPassageAnnotation declaration missing',
)
assert(
  'PaperQuestionAnnotation discriminates on scope: \'question\'',
  /PaperQuestionAnnotation[\s\S]{0,400}readonly\s+scope\s*:\s*['"]question['"]/i.test(
    typesSrc,
  ),
  "PaperQuestionAnnotation `scope: 'question'` missing",
)
{
  /* Slice out the PaperQuestionAnnotation block specifically so the
   * check doesn't accidentally see PaperPassageAnnotation's
   * `questionId?: never`. We extract the literal between the
   * `PaperQuestionAnnotation = PaperAnnotationCommon & {` opening
   * and its matching closing brace. */
  const blockMatch = typesSrc.match(
    /export\s+type\s+PaperQuestionAnnotation\s*=\s*PaperAnnotationCommon\s*&\s*\{([\s\S]*?)\n\}/,
  )
  const block = blockMatch ? blockMatch[1] : ''
  assert(
    'PaperQuestionAnnotation requires questionId: string (not optional)',
    /readonly\s+questionId\s*:\s*string\b/.test(block) &&
      !/readonly\s+questionId\?\s*:/.test(block),
    'PaperQuestionAnnotation must declare `questionId: string` (required, not optional)',
  )
}
assert(
  'PaperPassageAnnotation discriminates on scope: \'passage\'',
  /PaperPassageAnnotation[\s\S]{0,400}readonly\s+scope\s*:\s*['"]passage['"]/i.test(
    typesSrc,
  ),
  "PaperPassageAnnotation `scope: 'passage'` missing",
)
assert(
  'PaperPassageAnnotation forbids questionId at the type level (`questionId?: never`)',
  /PaperPassageAnnotation[\s\S]{0,400}readonly\s+questionId\?\s*:\s*never\b/.test(
    typesSrc,
  ),
  'PaperPassageAnnotation must forbid questionId via `questionId?: never`',
)
assert(
  'PaperAnnotation is the union of PaperQuestionAnnotation | PaperPassageAnnotation',
  /export\s+type\s+PaperAnnotation\s*=\s*[\s\S]{0,200}\|?\s*PaperQuestionAnnotation[\s\S]{0,200}\|\s*PaperPassageAnnotation/.test(
    typesSrc,
  ),
  'PaperAnnotation union shape missing',
)
assert(
  'types.d.ts JSDoc states the scope-safe rule (question requires questionId; passage forbids it)',
  /scope[-\s]?safe[\s\S]{0,400}question[\s\S]{0,400}questionId/i.test(typesSrc) &&
    /passage[\s\S]{0,400}(?:MUST\s+NOT|forbid|forbidden|not\s+carry)[\s\S]{0,200}questionId/i.test(
      typesSrc,
    ),
  'scope-safe rule narrative missing',
)

/* ─── 9. PaperQuestion is renderable + PaperQuestionOption ────────── */

console.log('\nTest 9: PaperQuestion is renderable + PaperQuestionOption shape')

assert(
  'types.d.ts declares PaperQuestionOption',
  /(?:type|interface)\s+PaperQuestionOption\b/.test(typesSrc),
  'PaperQuestionOption declaration missing',
)
assert(
  'PaperQuestionOption has `label: string`',
  /PaperQuestionOption\s*=\s*\{[\s\S]{0,400}readonly\s+label\s*:\s*string\b/.test(
    typesSrc,
  ),
  'PaperQuestionOption `label` field missing',
)
assert(
  'PaperQuestionOption has `text: string`',
  /PaperQuestionOption\s*=\s*\{[\s\S]{0,800}readonly\s+text\s*:\s*string\b/.test(
    typesSrc,
  ),
  'PaperQuestionOption `text` field missing',
)
assert(
  'PaperQuestionOption has optional `translation?: string`',
  /PaperQuestionOption\s*=\s*\{[\s\S]{0,1200}readonly\s+translation\?\s*:\s*string\b/.test(
    typesSrc,
  ),
  'PaperQuestionOption `translation?` field missing',
)
assert(
  'PaperQuestion has `id: string`',
  /export\s+type\s+PaperQuestion\s*=\s*\{[\s\S]{0,400}readonly\s+id\s*:\s*string\b/.test(
    typesSrc,
  ),
  'PaperQuestion `id` field missing',
)
assert(
  'PaperQuestion has optional `section?: string`',
  /export\s+type\s+PaperQuestion\s*=\s*\{[\s\S]{0,800}readonly\s+section\?\s*:\s*string\b/.test(
    typesSrc,
  ),
  'PaperQuestion `section?` field missing',
)
assert(
  'PaperQuestion has `questionNo: string`',
  /export\s+type\s+PaperQuestion\s*=\s*\{[\s\S]{0,1600}readonly\s+questionNo\s*:\s*string\b/.test(
    typesSrc,
  ),
  'PaperQuestion `questionNo` field missing',
)
assert(
  'PaperQuestion has `stem: string`',
  /export\s+type\s+PaperQuestion\s*=\s*\{[\s\S]{0,2000}readonly\s+stem\s*:\s*string\b/.test(
    typesSrc,
  ),
  'PaperQuestion `stem` field missing',
)
assert(
  'PaperQuestion has optional `stemTranslation?: string`',
  /export\s+type\s+PaperQuestion\s*=\s*\{[\s\S]{0,2400}readonly\s+stemTranslation\?\s*:\s*string\b/.test(
    typesSrc,
  ),
  'PaperQuestion `stemTranslation?` field missing',
)
assert(
  'PaperQuestion has `options: ReadonlyArray<PaperQuestionOption>`',
  /export\s+type\s+PaperQuestion\s*=\s*\{[\s\S]{0,2800}readonly\s+options\s*:\s*ReadonlyArray<\s*PaperQuestionOption\s*>/.test(
    typesSrc,
  ),
  'PaperQuestion `options` field missing',
)
assert(
  'PaperQuestion does NOT carry an `answer` field',
  !/export\s+type\s+PaperQuestion\s*=\s*\{[\s\S]{0,3200}readonly\s+answer\b/.test(
    typesSrc,
  ),
  'PaperQuestion must not include the correct answer (host-owned)',
)
assert(
  'PaperQuestion does NOT carry an `explanation` field',
  !/export\s+type\s+PaperQuestion\s*=\s*\{[\s\S]{0,3200}readonly\s+explanation\b/.test(
    typesSrc,
  ),
  'PaperQuestion must not include the explanation (host-owned)',
)

/* ─── 10. PaperAnnotationKind is one taxonomy ─────────────────────── */

console.log('\nTest 10: PaperAnnotationKind taxonomy converges (single source)')

const KIND_TAXONOMY = [
  'long-sentence',
  'derived-word',
  'compound-word',
  'phrase-chunk',
  'familiar-new-meaning',
  'synonym',
  'evidence-support',
  'evidence-trap',
  'discourse-structure',
  'culture-context',
]
const KIND_BLOCK_RE =
  /export\s+type\s+PaperAnnotationKind\s*=\s*((?:\s*\|\s*['"][a-z-]+['"])+)/m
const kindBlock = typesSrc.match(KIND_BLOCK_RE)
assert(
  'types.d.ts declares PaperAnnotationKind as a string union',
  Boolean(kindBlock),
  'PaperAnnotationKind union not found',
)
if (kindBlock) {
  const declared = Array.from(kindBlock[1].matchAll(/['"]([a-z-]+)['"]/g)).map(
    (m) => m[1],
  )
  for (const kind of KIND_TAXONOMY) {
    assert(
      `PaperAnnotationKind includes '${kind}'`,
      declared.includes(kind),
      `'${kind}' missing from PaperAnnotationKind`,
    )
  }
  /* The taxonomy is closed: nothing outside the v1 list should be
   * declared as a kind in this file. */
  const extras = declared.filter((k) => !KIND_TAXONOMY.includes(k))
  assert(
    'PaperAnnotationKind has no kinds outside the v1 taxonomy',
    extras.length === 0,
    `unexpected kinds: ${extras.join(', ')}`,
  )
  /* Only ONE PaperAnnotationKind union should be declared. */
  const allKindMatches = typesSrc.match(/export\s+type\s+PaperAnnotationKind\b/g)
  assert(
    'PaperAnnotationKind is declared exactly once',
    Array.isArray(allKindMatches) && allKindMatches.length === 1,
    `found ${allKindMatches?.length ?? 0} declarations`,
  )
}
assert(
  'plan documents that adapter implementations MUST NOT invent a parallel kind',
  /(MUST\s+NOT|must\s+not)\s+invent[\s\S]{0,200}(?:parallel\s+kind|second\s+taxonomy|new\s+kind)/i.test(
    planSrc,
  ),
  'adapter "no parallel taxonomy" rule missing',
)
/* The plan body should not redeclare a different kind list. The 10
 * v1 names may appear, but no rogue extra string-quoted "kind"
 * tokens that look like an alternative taxonomy should appear. */
const ROGUE_KIND_BLACKLIST = [
  /'\s*lexical\s*'/,
  /'\s*syntactic\s*'/,
  /'\s*rhetoric\s*'/,
  /'\s*culture\s*'(?!-)/, // 'culture' alone, not 'culture-context'
]
for (const re of ROGUE_KIND_BLACKLIST) {
  assert(
    `plan body does NOT mention a retired kind ${re.source}`,
    !re.test(planSrc),
    `retired kind appears in the plan body: ${re.source}`,
  )
}

/* ─── 11. types-side invariants restated for B2 ───────────────────── */

console.log('\nTest 11: types.d.ts re-states the B2 invariants')

assert(
  'types.d.ts continues to assert PaperTextMap is a read-only position map',
  /PaperTextMap[\s\S]{0,400}read-?only\s+position\s+map/i.test(typesSrc),
  'PaperTextMap "read-only position map" invariant comment missing',
)
assert(
  'types.d.ts continues to assert PaperTextMap does NOT depend on evidence',
  /PaperTextMap[\s\S]{0,800}(?:does\s+NOT|not)\s+depend\s+on\s+evidence/i.test(
    typesSrc,
  ) ||
    /PaperTextMap[\s\S]{0,800}no\s+(?:active|selected|hover|focus)\s+state/i.test(
      typesSrc,
    ),
  'PaperTextMap "no evidence dependency" invariant comment missing',
)
assert(
  'types.d.ts continues to assert PaperAnnotation references TextMap (no own offsets)',
  /PaperAnnotation[\s\S]{0,2000}(?:references?|carrying|via)[\s\S]{0,200}(?:TextMap|PaperTextRange)/i.test(
    typesSrc,
  ),
  'PaperAnnotation "references TextMap" invariant comment missing',
)
assert(
  'types.d.ts continues to assert PaperAnnotation carries no explanation payload',
  /PaperAnnotation[\s\S]{0,2400}(?:do\s+NOT|does\s+not|DO\s+NOT)[\s\S]{0,200}(?:carry|include|store)[\s\S]{0,200}explanation\s+payload/i.test(
    typesSrc,
  ),
  'PaperAnnotation "no explanation payload" invariant comment missing',
)
assert(
  'types.d.ts does NOT import React',
  !/from\s+['"]react['"]/.test(typesSrc),
  'unexpected react import in types.d.ts',
)
assert(
  'types.d.ts does NOT import from app/',
  !/from\s+['"][^'"]*\bapp\//.test(typesSrc),
  'unexpected app/ import in types.d.ts',
)
assert(
  'types.d.ts does NOT import from server/',
  !/from\s+['"][^'"]*\bserver\//.test(typesSrc),
  'unexpected server/ import in types.d.ts',
)

/* ─── 12. Forbidden scope: no runtime / app / server / CSS / route diff */

console.log('\nTest 12: forbidden runtime scope untouched')

function safeGitDiffNames(args) {
  try {
    const out = execSync(`git diff --name-only ${args}`, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString()
      .trim()
    return out ? out.split('\n') : []
  } catch {
    return []
  }
}

const baseRef = (() => {
  try {
    return execSync('git merge-base HEAD origin/main', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString()
      .trim()
  } catch {
    try {
      return execSync('git merge-base HEAD main', {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
        .toString()
        .trim()
    } catch {
      return 'HEAD'
    }
  }
})()

const changed = safeGitDiffNames(`${baseRef}...HEAD`)

const FORBIDDEN_PATHS = [
  /^app\/src\//,
  /^server\//,
  /^app\/package\.json$/,
  /^app\/pnpm-lock\.yaml$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /\.css$/,
]
for (const re of FORBIDDEN_PATHS) {
  const offenders = changed.filter((p) => re.test(p))
  assert(
    `No edits under ${re.source}`,
    offenders.length === 0,
    `offenders: ${offenders.join(', ')}`,
  )
}

/* Forbid touching specific runtime files even if they happen to be
 * outside the broad path filters above (e.g. the prototype's TSX
 * lives under app/src/, but the explicit name guard documents the
 * intent). */
const FORBIDDEN_NAMED = [
  /paperIntelligenceRoute\.ts$/,
  /PaperIntelligencePreview\.tsx$/,
  /PaperSurfacePrototype\.tsx$/,
  /^app\/src\/features\/reading-analysis\//,
]
for (const re of FORBIDDEN_NAMED) {
  const offenders = changed.filter((p) => re.test(p))
  assert(
    `No edits under explicit runtime guard ${re.source}`,
    offenders.length === 0,
    `offenders: ${offenders.join(', ')}`,
  )
}

const ALLOWED_PATTERNS = [
  /^docs\/paper-surface-textmap-adapter-plan\.md$/,
  /^docs\/adr\/0003-paper-surface-interaction-model\.md$/,
  /^scripts\/verify-paper-surface-textmap-adapter-plan\.mjs$/,
  /^scripts\/verify-paper-surface-interaction-model-doc\.mjs$/,
  /^shared\/papersurface\/types\.d\.ts$/,
  /^shared\/papersurface\/anchorKeys\.mjs$/,
  /^shared\/papersurface\/anchorKeys\.d\.ts$/,
]
const unexpected = changed.filter(
  (p) => !ALLOWED_PATTERNS.some((re) => re.test(p)),
)
assert(
  'PR diff contains only the B2 plan + verify + types refinement (no runtime expansion)',
  unexpected.length === 0,
  `unexpected files in diff: ${unexpected.join(', ')}`,
)

/* ─── Summary ────────────────────────────────────────────────────── */

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
