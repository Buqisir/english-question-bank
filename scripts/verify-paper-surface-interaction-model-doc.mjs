#!/usr/bin/env node
/**
 * verify-paper-surface-interaction-model-doc
 *
 * Issue #21-B1.5 — PaperSurface Future Interaction Model ADR.
 *
 * This is a DOC verifier. It locks the decisions in
 * `docs/adr/0003-paper-surface-interaction-model.md` so a future
 * draft cannot quietly drop a constraint from the #21-B1.5 grill.
 *
 * Scope:
 *   - Documentation-only. The script does NOT inspect runtime code.
 *   - The script does NOT exercise any tooling that requires
 *     `node_modules` or network. It only reads source files and
 *     consults `git diff` against merge-base.
 *
 * What it asserts (high level):
 *   1.  The ADR file exists at the canonical path.
 *   2.  The ADR is marked as a documentation-only / locked design
 *       note that does not change runtime code.
 *   3.  Annotation generation policy: pre-generated curated teacher
 *       annotation pack; not click-time generated; not encyclopedic.
 *   4.  v1 audience scope: teacher-only; no student-audience field
 *       reserved in v1 schema.
 *   5.  v1 mutability: read-only on PaperSurface; teachers cannot
 *       edit / hide / star / add / delete annotations.
 *   6.  v1 export scope: no export / PDF integration in v1.
 *   7.  Annotation importance + ordering: `core | extended`,
 *       `teachingPriority`, `sourceOrder`; reading mode default
 *       shows only `core`; ordering is core → teachingPriority →
 *       sourceOrder; not bucketed by `kind`.
 *   8.  Reading mode: enters on passage overview; A/B/C/D pills;
 *       per-passage `readingFocusBySection`; ReadingFocus union
 *       includes `overview` and `sentence` with optional
 *       `activeAnnotationId`.
 *   9.  Lecture mode: whole-paper global focus; `lectureFocus` with
 *       `activeEvidenceId` as a secondary focus; clicking evidence
 *       does NOT switch right panel out of Question Analysis.
 *  10.  Mode switching + memory: `mode = 'lecture' | 'reading'`;
 *       default lecture; cross-mode switches restore (do not clear)
 *       the other mode's focus; reading-click-question returns to
 *       lecture; lecture-click-sentence does NOT auto-switch.
 *  11.  Mode-switch UI: segmented control `[讲题] [读文]` at the
 *       PaperSurface chrome top-right; not inlaid into paper body;
 *       does not change overall layout.
 *  12.  Reading-mode visual policy: core-annotated sentences carry a
 *       lightweight always-visible mark; word/phrase tags are not
 *       always visible; active annotation is uniquely highlighted.
 *  13.  Right panel: SINGLE slot; not an 8-tab panel; "读这句" entry
 *       inside Question Analysis switches to reading-mode sentence
 *       focus.
 *  14.  PaperSurface interface implications: `PaperSurfaceMode`,
 *       `LectureFocus`, `ReadingFocus`, `PaperSurfaceFocusState`
 *       shapes are documented; PaperSurface does NOT own this state
 *       (controlled component / props in, intents out).
 *  15.  Companion + scope guards: ADR references the B1 follow-up
 *       doc and the shared tokens module; runtime files are NOT
 *       modified by this PR.
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

console.log('\n=== PaperSurface Future Interaction Model doc (#21-B1.5) ===\n')

const ADR_REL = 'docs/adr/0003-paper-surface-interaction-model.md'
const FOLLOW_UP_REL = 'docs/paper-surface-spike-follow-up.md'
const TOKENS_REL = 'shared/papersurface/tokens.mjs'

/* ─── 1. ADR file exists ─────────────────────────────────────────── */

console.log('Test 1: ADR file exists')

assert(
  `${ADR_REL} exists`,
  existsSync(path.join(ROOT, ADR_REL)),
  ADR_REL,
)

const adrSrc = readSrc(ADR_REL)

/* Helpers for case-insensitive phrase / pattern checks. */
const adrLower = adrSrc.toLowerCase()
function hasAll(text, phrases) {
  return phrases.every((p) => text.includes(p.toLowerCase()))
}

/* ─── 2. ADR is doc-only / locked design note ────────────────────── */

console.log('\nTest 2: ADR is marked as doc-only / locked design note')

assert(
  'ADR title references Issue #21-B1.5',
  /#\s*21-B1\.5/.test(adrSrc),
  'expected "#21-B1.5" in the ADR',
)
assert(
  'ADR title names "PaperSurface Future Interaction Model" (or equivalent)',
  /PaperSurface[\s\S]{0,40}Interaction\s+Model/i.test(adrSrc),
  'expected "PaperSurface ... Interaction Model" in the title',
)
assert(
  'ADR carries a Status / locked-design-note marker',
  /Locked\s+design\s+note/i.test(adrSrc),
  'expected "Locked design note" status marker',
)
assert(
  'ADR states it is documentation-only / no runtime change',
  /Documentation-only/i.test(adrSrc) &&
    /(no\s+runtime\s+code|does\s+not\s+(?:change|modify)\s+runtime)/i.test(adrSrc),
  'expected an explicit doc-only / no-runtime-change statement',
)

/* ─── 3. Annotation generation policy ────────────────────────────── */

console.log('\nTest 3: Annotation generation policy (pre-generated curated teacher pack)')

assert(
  'ADR uses the phrase "pre-generated curated teacher annotation pack"',
  /pre-?generated\s+curated\s+teacher\s+annotation\s+pack/i.test(adrSrc),
  'exact phrase missing',
)
assert(
  'ADR explicitly says annotations are NOT generated on click',
  /(not\s+generated\s+on\s+click|click-?time\s+is\s+display-?time|not\s+a\s+model\s+round-?trip\s+per\s+click)/i.test(
    adrSrc,
  ),
  'on-click rejection missing',
)
assert(
  'ADR explicitly rejects encyclopedic / unbounded annotation dump',
  /(encyclopedic|unbounded\s+(?:dump|annotation))/i.test(adrSrc),
  'encyclopedic rejection missing',
)
assert(
  'ADR names Paper Intelligence pipeline as the pre-generator',
  /Paper\s+Intelligence\s+pipeline/i.test(adrSrc),
  'PI pipeline ownership missing',
)

/* ─── 4. v1 audience scope: teacher-only ─────────────────────────── */

console.log('\nTest 4: v1 audience scope is teacher-only')

assert(
  'ADR says v1 is teacher-only',
  /teacher-?only/i.test(adrSrc),
  '"teacher-only" missing',
)
assert(
  'ADR explicitly excludes student audience in v1',
  /(no\s+student\s+audience|student[-\s]?facing[\s\S]{0,40}(?:later|future|separate\s+ADR))/i.test(
    adrSrc,
  ),
  'student-audience exclusion missing',
)
assert(
  'ADR forbids reserving a student-audience field in v1 schema',
  /(does\s+not\s+reserve|do\s+not\s+(?:pre-?bake|reserve))[\s\S]{0,80}student/i.test(
    adrSrc,
  ) || /no\s+`?studentAudience`?\s+field/i.test(adrSrc),
  'no-reserved-student-field rule missing',
)
assert(
  'ADR defers student variant to a separate ADR / schema migration',
  /(separate\s+ADR|new\s+ADR|schema\s+migration)/i.test(adrSrc),
  'student variant deferral missing',
)

/* ─── 5. v1 mutability: read-only ────────────────────────────────── */

console.log('\nTest 5: v1 is read-only on PaperSurface')

assert(
  'ADR says v1 annotation pack is read-only',
  /read-?only/i.test(adrSrc),
  '"read-only" missing',
)
const READ_ONLY_VERBS = ['edit', 'hide', 'star', 'add', 'delete']
for (const verb of READ_ONLY_VERBS) {
  assert(
    `ADR explicitly forbids teacher action: ${verb}`,
    new RegExp(`\\b${verb}\\b`, 'i').test(adrSrc),
    `"${verb}" not mentioned in the read-only rule`,
  )
}
assert(
  'ADR defers lesson notes / margin annotations to a future capability',
  /(lesson\s+notes|margin\s+annotations|讲义\s*批注|课堂\s*备注)/i.test(adrSrc) &&
    /(future|separate|deferred|later)/i.test(adrSrc),
  'lesson-notes deferral missing',
)

/* ─── 6. v1 export scope: no export / PDF ────────────────────────── */

console.log('\nTest 6: v1 does not plumb annotations into export / PDF')

assert(
  'ADR says annotations are NOT plumbed into export / PDF in v1',
  /(no\s+export\s*\/\s*PDF|does\s+not\s+plumb[\s\S]{0,40}export|export[\s\S]{0,40}deferred|not\s+enter[\s\S]{0,40}export)/i.test(
    adrSrc,
  ),
  'export/PDF exclusion missing',
)
assert(
  'ADR scopes annotation pack to on-screen 讲题 / 读文',
  /(on-?screen[\s\S]{0,40}(?:讲题|读文)|interactive[\s\S]{0,40}(?:讲题|读文)|讲题\s*\/\s*读文)/i.test(
    adrSrc,
  ),
  'on-screen 讲题/读文 scope missing',
)

/* ─── 7. Annotation importance + ordering ────────────────────────── */

console.log('\nTest 7: Annotation importance + ordering')

assert(
  "ADR documents importance: 'core' | 'extended'",
  /importance\s*:\s*['"]core['"]\s*\|\s*['"]extended['"]/.test(adrSrc),
  "literal `importance: 'core' | 'extended'` missing",
)
assert(
  'ADR documents `teachingPriority`',
  /\bteachingPriority\b/.test(adrSrc),
  '`teachingPriority` missing',
)
assert(
  'ADR documents `sourceOrder`',
  /\bsourceOrder\b/.test(adrSrc),
  '`sourceOrder` missing',
)
assert(
  'ADR says reading mode default shows only `core`',
  /(reading\s+mode[\s\S]{0,80}only\s+`?core`?|only\s+`?core`?\s+annotations\s+by\s+default)/i.test(
    adrSrc,
  ),
  'core-only default missing',
)
assert(
  'ADR says `extended` annotations are folded by default',
  /extended[\s\S]{0,40}(?:folded|fold|collapsed|hidden)/i.test(adrSrc),
  'extended-folded rule missing',
)
assert(
  'ADR specifies sort order core → teachingPriority → sourceOrder',
  /core[\s\S]{0,80}teachingPriority[\s\S]{0,80}sourceOrder/i.test(adrSrc),
  'sort-order chain missing',
)
assert(
  'ADR rejects bucketing annotations into many sections by `kind`',
  /(not\s+bucket(?:ed)?\s+by\s+`?kind`?|NOT\s+bucketed[\s\S]{0,40}kind|not\s+stack(?:ed)?\s+(?:into|as)\s+(?:many\s+)?sections\s+by[\s\S]{0,30}kind)/i.test(
    adrSrc,
  ),
  'kind-bucketing rejection missing',
)

/* ─── 8. Reading mode behaviour ──────────────────────────────────── */

console.log('\nTest 8: Reading mode behaviour')

assert(
  'ADR says reading mode lands on the passage overview',
  /reading\s+mode[\s\S]{0,200}(?:lands|enters|defaults)\s+(?:on|to|into)[\s\S]{0,40}overview/i.test(
    adrSrc,
  ) ||
    /switching\s+to\s+reading\s+mode[\s\S]{0,80}overview/i.test(adrSrc),
  'reading-mode overview entry missing',
)
assert(
  'ADR documents the contextual passage priority chain (active question → scroll → A)',
  /active\s+question[\s\S]{0,200}scroll[\s\S]{0,200}(?:passage\s+A|fallback)/i.test(
    adrSrc,
  ),
  'contextual passage priority chain missing',
)
assert(
  'ADR exposes A / B / C / D passage pills',
  /A\s*\/\s*B\s*\/\s*C\s*\/\s*D[\s\S]{0,40}(?:passage\s+)?pills/i.test(adrSrc) ||
    /passage\s+pills[\s\S]{0,40}A\s*\/\s*B\s*\/\s*C\s*\/\s*D/i.test(adrSrc),
  'A/B/C/D passage pills missing',
)
assert(
  'ADR defines `readingFocusBySection: Record<paperSection, ReadingFocus>` (or equivalent)',
  /readingFocusBySection\s*:\s*Record<\s*[\w\s]+\s*,\s*ReadingFocus\s*>/.test(adrSrc),
  'readingFocusBySection shape missing',
)
assert(
  'ADR defines ReadingFocus = overview | sentence (with sentenceId)',
  /kind\s*:\s*['"]overview['"]/.test(adrSrc) &&
    /kind\s*:\s*['"]sentence['"][\s\S]{0,200}sentenceId\s*:\s*string/.test(adrSrc),
  'ReadingFocus union missing',
)
assert(
  'ADR allows optional `activeAnnotationId?: string` in sentence focus',
  /activeAnnotationId\??\s*:\s*string/.test(adrSrc),
  'activeAnnotationId on sentence focus missing',
)
assert(
  'ADR says reading overview includes passage insight (篇章洞察)',
  /篇章\s*洞察|passage\s+insight/i.test(adrSrc),
  'passage insight in reading overview missing',
)
assert(
  'ADR keeps existing insight popover as a shortcut summary entry',
  /(insight\s+popover[\s\S]{0,80}shortcut|popover[\s\S]{0,40}(?:retained|preserved|kept)[\s\S]{0,80}shortcut)/i.test(
    adrSrc,
  ),
  'insight popover shortcut role missing',
)

/* ─── 9. Lecture mode behaviour ──────────────────────────────────── */

console.log('\nTest 9: Lecture mode behaviour')

assert(
  'ADR says lecture mode is whole-paper / global focus (not per-passage)',
  /(whole-?paper|global\s+focus)/i.test(adrSrc) &&
    /(does\s+NOT|not)\s+remember[\s\S]{0,80}per\s*-?\s*passage/i.test(adrSrc) ||
    /lecture[\s\S]{0,80}whole[-\s]?paper[\s\S]{0,200}per[-\s]?passage/i.test(adrSrc),
  'lecture-mode global-focus rule missing',
)
assert(
  "ADR defines lectureFocus with kind: 'question' and questionId",
  /lectureFocus[\s\S]{0,200}kind\s*:\s*['"]question['"][\s\S]{0,200}questionId\s*:\s*string/i.test(
    adrSrc,
  ),
  'lectureFocus shape missing',
)
assert(
  'ADR allows optional `activeEvidenceId?: string` as a secondary focus',
  /activeEvidenceId\??\s*:\s*string/.test(adrSrc) &&
    /(secondary\s+focus|secondary,\s*question-internal)/i.test(adrSrc),
  'activeEvidenceId secondary-focus rule missing',
)
assert(
  'ADR says clicking evidence does NOT switch right panel out of Question Analysis',
  /(does\s+NOT\s+switch[\s\S]{0,80}Question\s+Analysis|Question\s+Analysis[\s\S]{0,80}stays\s+on)/i.test(
    adrSrc,
  ),
  'evidence-click-stays-in-QA rule missing',
)
assert(
  'ADR says "读这句" entry triggers reading mode + sentence focus',
  /读\s*这\s*句/.test(adrSrc) &&
    /reading\s+mode[\s\S]{0,80}sentence\s+focus/i.test(adrSrc),
  '"读这句" → reading sentence focus rule missing',
)

/* ─── 10. Mode switching + memory ────────────────────────────────── */

console.log('\nTest 10: Mode switching + memory')

assert(
  "ADR fixes mode = 'lecture' | 'reading'",
  /mode\s*:\s*['"]lecture['"]\s*\|\s*['"]reading['"]/.test(adrSrc),
  "literal mode union missing",
)
assert(
  'ADR says default mode is `lecture`',
  /(default\s+(?:mode\s+)?(?:on\s+entry\s+)?is\s+`?lecture`?)/i.test(adrSrc),
  'default-lecture rule missing',
)
assert(
  "ADR says switching mode does NOT clear the other mode's focus",
  /(does\s+NOT\s+clear[\s\S]{0,80}other\s+mode|cross[-\s]?mode\s+switches\s+restore[\s\S]{0,80}(?:never|do\s+not)\s+clear)/i.test(
    adrSrc,
  ),
  'no-clear-on-switch rule missing',
)
assert(
  'ADR says reading → lecture restores last lectureFocus',
  /(reading[\s\S]{0,40}(?:→|->|to)\s+lecture[\s\S]{0,80}restore[\s\S]{0,80}(?:lectureFocus|question))/i.test(
    adrSrc,
  ),
  'reading→lecture restore rule missing',
)
assert(
  'ADR says lecture → reading restores readingFocusBySection[currentSection]',
  /(lecture[\s\S]{0,40}(?:→|->|to)\s+reading[\s\S]{0,200}readingFocusBySection)/i.test(
    adrSrc,
  ),
  'lecture→reading restore rule missing',
)
assert(
  'ADR says clicking a question in reading mode returns to lecture mode and focuses that question',
  /(reading\s+mode[\s\S]{0,200}clicking\s+a\s+question[\s\S]{0,200}lecture[\s\S]{0,80}focus(?:es)?\s+that\s+question)/i.test(
    adrSrc,
  ),
  'reading-click-question-returns-to-lecture rule missing',
)
assert(
  'ADR says clicking a sentence/annotation in lecture mode does NOT auto-switch to reading',
  /(lecture\s+mode[\s\S]{0,400}(?:does\s+NOT|not)\s+auto-?switch)/i.test(adrSrc),
  'lecture-click-no-auto-switch rule missing',
)

/* ─── 11. Mode-switch UI: segmented control [讲题] [读文] ─────────── */

console.log('\nTest 11: Mode-switch UI')

assert(
  'ADR specifies a segmented control labelled [讲题] [读文]',
  /segmented\s+control[\s\S]{0,200}\[\s*讲题\s*\][\s\S]{0,40}\[\s*读文\s*\]/i.test(
    adrSrc,
  ) ||
    /\[\s*讲题\s*\]\s*\[\s*读文\s*\][\s\S]{0,200}segmented\s+control/i.test(adrSrc),
  '[讲题] [读文] segmented control missing',
)
assert(
  'ADR places the segmented control at PaperSurface chrome top-right',
  /chrome[\s\S]{0,40}top-?right|top-?right[\s\S]{0,40}chrome/i.test(adrSrc),
  'chrome top-right placement missing',
)
assert(
  'ADR says the control is NOT inlaid into the paper body',
  /(not\s+(?:inlaid|inset|embedded)\s+into\s+the\s+paper(?:\s+body)?|chrome,\s+NOT\s+inlaid)/i.test(
    adrSrc,
  ),
  'not-in-paper-body rule missing',
)
assert(
  'ADR says the control does NOT change the overall layout',
  /(does\s+not\s+change[\s\S]{0,40}layout|no\s+column\s+(?:add|remove))/i.test(
    adrSrc,
  ),
  'layout-stable rule missing',
)

/* ─── 12. Reading-mode visual policy ─────────────────────────────── */

console.log('\nTest 12: Reading-mode visual policy')

assert(
  'ADR says core-annotated sentences carry a lightweight always-visible mark',
  /(core[\s\S]{0,80}always-?visible\s+mark|lightweight\s+(?:always-?visible\s+)?mark[\s\S]{0,80}core)/i.test(
    adrSrc,
  ),
  'core-sentence light mark rule missing',
)
assert(
  'ADR says word/phrase tags are NOT always visible',
  /(word-?level[\s\S]{0,40}\/\s*phrase-?level\s+tags[\s\S]{0,80}(?:NOT|not)\s+always\s+visible|word\s*\/\s*phrase\s+tags\s+are\s+NOT\s+always\s+visible)/i.test(
    adrSrc,
  ),
  'word/phrase tag visibility rule missing',
)
assert(
  'ADR says only the active annotation is highlighted (non-active ones are not)',
  /(active\s+annotation[\s\S]{0,200}(?:non-?active|other)\s+annotations[\s\S]{0,40}(?:do\s+not|are\s+not))/i.test(
    adrSrc,
  ),
  'active-only highlight rule missing',
)
assert(
  'ADR allows active annotation to be a word / phrase / sentence span (uniform)',
  /(active\s+annotation[\s\S]{0,200}(?:word|phrase|sentence)\s+span)/i.test(
    adrSrc,
  ),
  'uniform span rule missing',
)
assert(
  'ADR allows a faded evidence context layer in reading mode',
  /(faded\s+`?evidence`?|`?evidence`?\s+context[\s\S]{0,80}faded)/i.test(adrSrc),
  'faded-evidence-context rule missing',
)

/* ─── 13. Right panel: single slot, "读这句" entry ───────────────── */

console.log('\nTest 13: Right panel policy')

assert(
  'ADR says the right panel is a single slot',
  /single\s+slot/i.test(adrSrc),
  'single-slot rule missing',
)
assert(
  'ADR explicitly forbids an 8-tab panel',
  /(NOT\s+(?:become\s+)?an?\s+8-?tab|no\s+8\s*tabs|not\s+do\s+8\s+tabs)/i.test(
    adrSrc,
  ),
  '8-tab rejection missing',
)
assert(
  'ADR shows Question Analysis in the lecture-mode right slot',
  /Question\s+Analysis/i.test(adrSrc),
  'Question Analysis missing',
)
assert(
  'ADR scopes question-scoped annotations to evidence / correct-option / key phrase',
  /evidence[\s\S]{0,200}(?:correct\s+option|synonym|paraphrase)[\s\S]{0,200}key\s+phrase/i.test(
    adrSrc,
  ),
  'question-scoped annotation scope missing',
)
assert(
  'ADR organises sentence analysis as a teaching flow, NOT by data type',
  /(teaching\s+flow[\s\S]{0,200}(?:NOT|not)\s+(?:as\s+)?(?:a\s+)?data-?type|teaching\s+flow,\s*NOT\s+as\s+a\s+data-?type)/i.test(
    adrSrc,
  ),
  'teaching-flow vs data-dump rule missing',
)
assert(
  'ADR limits default surfaced highlights to top 3-4',
  /top\s*3-?4|3\s*-\s*4\s+highlights/i.test(adrSrc),
  'top 3-4 default rule missing',
)

/* ─── 14. PaperSurface interface implications ────────────────────── */

console.log('\nTest 14: PaperSurface interface implications')

assert(
  "ADR documents type PaperSurfaceMode = 'lecture' | 'reading'",
  /type\s+PaperSurfaceMode\s*=\s*['"]lecture['"]\s*\|\s*['"]reading['"]/.test(
    adrSrc,
  ),
  'PaperSurfaceMode type alias missing',
)
assert(
  'ADR documents type LectureFocus with questionId + optional activeEvidenceId',
  /type\s+LectureFocus\s*=\s*\{[\s\S]{0,200}kind\s*:\s*['"]question['"][\s\S]{0,200}questionId\s*:\s*string[\s\S]{0,200}activeEvidenceId\??\s*:\s*string/.test(
    adrSrc,
  ),
  'LectureFocus type alias missing',
)
assert(
  'ADR documents type ReadingFocus = overview | sentence (union)',
  /type\s+ReadingFocus\s*=\s*[\s\S]{0,40}\|\s*\{\s*kind\s*:\s*['"]overview['"]\s*\}[\s\S]{0,200}\|\s*\{\s*kind\s*:\s*['"]sentence['"]/.test(
    adrSrc,
  ),
  'ReadingFocus type alias missing',
)
assert(
  'ADR documents type PaperSurfaceFocusState (mode + lectureFocus + readingFocusBySection)',
  /type\s+PaperSurfaceFocusState\s*=\s*\{[\s\S]{0,400}mode\s*:\s*PaperSurfaceMode[\s\S]{0,400}lectureFocus[\s\S]{0,400}readingFocusBySection/.test(
    adrSrc,
  ),
  'PaperSurfaceFocusState type alias missing',
)
assert(
  'ADR says PaperSurface does NOT own this state (controlled component)',
  /(PaperSurface[\s\S]{0,80}(?:does\s+not|not)\s+(?:hold|own)[\s\S]{0,80}state|controlled\s+component)/i.test(
    adrSrc,
  ),
  'controlled-component rule missing',
)
assert(
  'ADR says PaperSurface accepts focus state as props and emits focus intents',
  /(props[\s\S]{0,200}(?:focus\s+intents|emits)|emits\s+focus\s+intent)/i.test(
    adrSrc,
  ),
  'props-in / intents-out rule missing',
)

/* ─── 15. Companion references + scope guards ────────────────────── */

console.log('\nTest 15: Companion references + scope guards')

assert(
  `ADR references the B1 follow-up doc (${FOLLOW_UP_REL})`,
  adrSrc.includes('paper-surface-spike-follow-up.md'),
  'follow-up doc reference missing',
)
assert(
  `ADR references shared/papersurface/tokens.mjs`,
  adrSrc.includes(TOKENS_REL),
  'shared tokens module reference missing',
)
assert(
  'ADR has a Considered alternatives section',
  /##\s*Considered\s+alternatives/i.test(adrSrc),
  'Considered alternatives section missing',
)
assert(
  'ADR has a Consequences section',
  /##\s*Consequences/i.test(adrSrc),
  'Consequences section missing',
)
assert(
  'ADR has a Verify section that names this script',
  /##\s*Verify/i.test(adrSrc) &&
    /verify-paper-surface-interaction-model-doc\.mjs/.test(adrSrc),
  'Verify section / self-reference missing',
)

/* ─── 16. Forbidden scope: no runtime / app / server diff ────────── */

console.log('\nTest 16: forbidden runtime scope untouched')

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
  /^app\//,
  /^server\//,
  /^shared\//,
  /^app\/package\.json$/,
  /^app\/pnpm-lock\.yaml$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
]
for (const re of FORBIDDEN_PATHS) {
  const offenders = changed.filter((p) => re.test(p))
  assert(
    `No edits under ${re.source}`,
    offenders.length === 0,
    `offenders: ${offenders.join(', ')}`,
  )
}

const ALLOWED_PATTERNS = [
  /^docs\/adr\/0003-paper-surface-interaction-model\.md$/,
  /^scripts\/verify-paper-surface-interaction-model-doc\.mjs$/,
]
const unexpected = changed.filter(
  (p) => !ALLOWED_PATTERNS.some((re) => re.test(p)),
)
assert(
  'PR diff contains only the ADR + the verify script (documentation-only cut)',
  unexpected.length === 0,
  `unexpected files in diff: ${unexpected.join(', ')}`,
)

/* ─── Summary ────────────────────────────────────────────────────── */

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
