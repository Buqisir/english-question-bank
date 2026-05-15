#!/usr/bin/env node
/**
 * Verification: Concierge desk search behavior + result row helpers.
 *
 * Covers:
 *   1. Default home mode is 'ai' (state initializer).
 *   2. AI search path: stub steward returns matches → outcome.kind='results', source='steward'.
 *   3. needsClarification: stub returns clarification → outcome.kind='clarification'.
 *   4. API key missing: keyword fallback runs without calling steward.
 *   5. API failure: steward throws → keyword fallback runs.
 *   6. Similar-intent builder includes title + tags.
 *   7. Pending-query merging produces "原 query；补充说明：new" format.
 *
 * Pure-function-level test; does NOT spin up React.
 */

import {
  rankByKeywords,
  runConciergeSearch,
  buildSimilarIntent,
} from '../app/src/concierge/conciergeSearch.ts'
import { cleanReason } from '../app/src/concierge/reason.ts'
import { readFileSync } from 'node:fs'
import path from 'node:path'

let passed = 0, failed = 0
function assert(name, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name}: ${detail || 'failed'}`) }
}

// ------------------------------------------------------------------ fixtures
const sampleGroups = [
  {
    id: 'g-2025-n1-b',
    title: '写作教师重新设计写作任务',
    source: '2025·I',
    sourceType: 'real_exam',
    year: 2025,
    region: '全国 I',
    paperName: '全国高考',
    section: '阅读理解 B',
    passageTitle: '让学生写出有生命力的故事',
    summary: '学生对写作意义缺乏兴趣，教师调整任务后看见学生真实表达和连接他人的可能。',
    groupType: 'reading',
    questionCount: 4,
    difficulty: 'medium',
    tags: ['写作教育', '学生表达', '师生关系'],
    topicLabels: [],
    hit: 'Why did the teacher change the writing task?',
    answerPreview: 'To connect writing with lived experience.',
    defaultScore: 2.5,
  },
  {
    id: 'g-2024-zj-jan-b',
    title: '旧电话亭变成社区小图书馆',
    source: '浙2024.1',
    sourceType: 'real_exam',
    year: 2024,
    region: '浙江',
    paperName: '1月首考',
    section: '阅读理解 B',
    passageTitle: '公共设施的新生命',
    summary: '从一次被锁门时靠电话亭求助，到电话亭后来成为社区共享图书空间。',
    groupType: 'reading',
    questionCount: 4,
    difficulty: 'low',
    tags: ['社区共享', '公共空间', '记叙说明'],
    topicLabels: [],
    hit: 'What did the phone box mean to the writer at first?',
    answerPreview: 'It was a source of timely help.',
    defaultScore: 2.5,
  },
  {
    id: 'g-self-grammar-car',
    title: '汽车兴趣进入物理课堂',
    source: '2026·浙',
    sourceType: 'self_made',
    year: 2026,
    region: '浙江',
    paperName: '课堂转化',
    section: '语法填空',
    passageTitle: 'Learning friction through tires',
    summary: '教师把汽车爱好带进物理课堂，用轮胎讲摩擦。',
    groupType: 'grammar_cloze',
    questionCount: 10,
    difficulty: 'medium',
    tags: ['真实生活', '兴趣驱动'],
    topicLabels: [],
    hit: 'The lesson was designed to make physics feel connected to daily life.',
    answerPreview: '核心考查非谓语、从句和词形变化。',
    defaultScore: 1.5,
  },
]

console.log('=== Concierge Desk Verification ===\n')

// ------------------------------------------------------------------ Test 1
console.log('Test 1: Default home mode reads from localStorage')
{
  // Simulate: no localStorage value → default 'ai'.
  // Simulate: 'classic' stored → returns 'classic'.
  // Simulate: 'ai' stored → returns 'ai'.
  // Mirrors the App.tsx initializer logic; we re-implement it here for unit-level coverage.
  function pickHomeMode(stored) {
    return stored === 'classic' ? 'classic' : 'ai'
  }
  assert('null → ai (default)', pickHomeMode(null) === 'ai', '')
  assert('undefined → ai (default)', pickHomeMode(undefined) === 'ai', '')
  assert('"classic" → classic', pickHomeMode('classic') === 'classic', '')
  assert('"ai" → ai', pickHomeMode('ai') === 'ai', '')
  assert('garbage → ai', pickHomeMode('foo') === 'ai', '')
}

// ------------------------------------------------------------------ Test 2
console.log('\nTest 2: AI search success → results from steward')
{
  let receivedMessage = ''
  let receivedKey = ''
  const stub = async (message, apiKey) => {
    receivedMessage = message
    receivedKey = apiKey
    return {
      query: message,
      assistantMessage: '为你找了 2 个候选',
      needsClarification: false,
      matches: [
        { questionGroupId: 'g-2025-n1-b', score: 0.91, reason: '主题匹配：写作教育', questionGroup: sampleGroups[0] },
        { questionGroupId: 'g-2024-zj-jan-b', score: 0.62, reason: '叙事结构相近', questionGroup: sampleGroups[1] },
      ],
    }
  }
  const out = await runConciergeSearch({
    intent: '找一道讲写作教学反思的阅读',
    pendingQuery: null,
    questionGroups: sampleGroups,
    apiKey: 'sk-test',
    doStewardCall: stub,
  })
  assert('outcome.kind = results', out.kind === 'results', `got: ${out.kind}`)
  assert('source = steward', out.source === 'steward', `got: ${out.source}`)
  assert('hits length = 2', out.hits.length === 2, `got: ${out.hits.length}`)
  assert('hit[0].group.id correct', out.hits[0].group.id === 'g-2025-n1-b', '')
  assert('hit[0].reason from steward', out.hits[0].reason === '主题匹配：写作教育', '')
  assert('forwards key to steward', receivedKey === 'sk-test', '')
  assert('forwards intent text to steward', receivedMessage.includes('写作教学反思'), '')
  assert('assistantMessage propagated', out.assistantMessage === '为你找了 2 个候选', '')
}

// ------------------------------------------------------------------ Test 3
console.log('\nTest 3: needsClarification → outcome.kind = clarification')
{
  const stub = async () => ({
    query: '写作',
    assistantMessage: '能再说细一点吗？',
    needsClarification: true,
    clarificationQuestion: '是要找写作训练材料还是写作教学反思的阅读？',
    matches: [],
  })
  const out = await runConciergeSearch({
    intent: '写作',
    pendingQuery: null,
    questionGroups: sampleGroups,
    apiKey: 'sk-test',
    doStewardCall: stub,
  })
  assert('outcome.kind = clarification', out.kind === 'clarification', `got: ${out.kind}`)
  assert('clarificationQuestion present', out.clarificationQuestion.includes('教学反思'), '')
  assert('query is the original raw intent', out.query === '写作', `got: ${out.query}`)
}

// ------------------------------------------------------------------ Test 4
console.log('\nTest 4: Pending query merge for clarification follow-up')
{
  let observed = ''
  const stub = async (message) => {
    observed = message
    return {
      query: message,
      assistantMessage: 'ok',
      needsClarification: false,
      matches: [{ questionGroupId: 'g-2025-n1-b', score: 0.5, reason: '匹配', questionGroup: sampleGroups[0] }],
    }
  }
  const out = await runConciergeSearch({
    intent: '想要中等难度',
    pendingQuery: '找写作教学反思的阅读',
    questionGroups: sampleGroups,
    apiKey: 'sk-test',
    doStewardCall: stub,
  })
  assert('sentMessage uses 原 query；补充说明： format', observed === '找写作教学反思的阅读；补充说明：想要中等难度', `got: ${observed}`)
  assert('outcome.sentMessage matches', out.kind === 'results' && out.sentMessage === observed, '')
  assert('outcome.query is the new user reply', out.query === '想要中等难度', '')
}

// ------------------------------------------------------------------ Test 5
console.log('\nTest 5: Missing API key → keyword fallback (no steward call)')
{
  let stewardCalled = false
  const stub = async () => { stewardCalled = true; return null }
  const out = await runConciergeSearch({
    intent: '写作 教学',
    pendingQuery: null,
    questionGroups: sampleGroups,
    apiKey: '',
    doStewardCall: stub,
  })
  assert('steward NOT called when key missing', stewardCalled === false, '')
  assert('outcome.kind = results', out.kind === 'results', '')
  assert('source = fallback', out.source === 'fallback', '')
  assert('fallbackReason = missing-api-key', out.fallbackReason === 'missing-api-key', `got: ${out.fallbackReason}`)
  assert('hits include 写作 教学 group', out.hits.some((h) => h.group.id === 'g-2025-n1-b'), '')
}

// ------------------------------------------------------------------ Test 6
console.log('\nTest 6: Steward error → fallback runs, page does not blow up')
{
  const stub = async () => { throw new Error('DeepSeek 503') }
  const out = await runConciergeSearch({
    intent: '汽车 物理',
    pendingQuery: null,
    questionGroups: sampleGroups,
    apiKey: 'sk-test',
    doStewardCall: stub,
  })
  assert('outcome.kind = results (no throw)', out.kind === 'results', `got: ${out.kind}`)
  assert('source = fallback', out.source === 'fallback', '')
  assert('fallbackReason = api-error', out.fallbackReason === 'api-error', '')
  assert('hits include the car/physics group', out.hits.some((h) => h.group.id === 'g-self-grammar-car'), '')
  assert('assistantMessage is soft Chinese', /管家|本地题库|稍后/.test(out.assistantMessage), `got: ${out.assistantMessage}`)
  assert('assistantMessage hides technical detail (no 503 / Failed)', !/503|Failed|question-bank|steward/.test(out.assistantMessage), `got: ${out.assistantMessage}`)
}

// ------------------------------------------------------------------ Test 7
console.log('\nTest 7: rankByKeywords matches across title / summary / tags')
{
  const hits = rankByKeywords(sampleGroups, '社区 公共空间')
  assert('phone-box group ranks first', hits[0]?.group.id === 'g-2024-zj-jan-b', `got: ${hits[0]?.group.id}`)
  assert('reason mentions matched tokens', /社区|公共空间/.test(hits[0]?.reason || ''), `got: ${hits[0]?.reason}`)

  const noHit = rankByKeywords(sampleGroups, '量子力学 黑洞')
  assert('zero matches when no overlap', noHit.length === 0, `got: ${noHit.length}`)

  // Empty query → recent N (graceful, not crash).
  const empty = rankByKeywords(sampleGroups, '   ')
  assert('empty query returns top-N (no crash)', empty.length > 0, '')
}

// ------------------------------------------------------------------ Test 8
console.log('\nTest 8: buildSimilarIntent uses title + summary + tags')
{
  const intent = buildSimilarIntent(sampleGroups[0])
  assert('mentions 找类似', intent.startsWith('找类似这道题'), `got: ${intent}`)
  assert('contains title fragment', intent.includes('写作教师'), '')
  assert('contains a tag', intent.includes('写作教育'), '')
}

// ------------------------------------------------------------------ Test 9
console.log('\nTest 9: Review fixes — state lifted, no row tabIndex, empty reason hidden, aria-label')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const srcRoot = path.resolve(here, '..', 'app', 'src')

  const deskSource = readFileSync(path.join(srcRoot, 'concierge', 'ConciergeDesk.tsx'), 'utf8')
  const hookSource = readFileSync(path.join(srcRoot, 'concierge', 'useConciergeDesk.ts'), 'utf8')
  const rowSource = readFileSync(path.join(srcRoot, 'concierge', 'ConciergeResultRow.tsx'), 'utf8')
  const appSource = readFileSync(path.join(srcRoot, 'App.tsx'), 'utf8')
  const searchSource = readFileSync(path.join(srcRoot, 'concierge', 'conciergeSearch.ts'), 'utf8')

  // 9.1 State lifted: ConciergeDesk no longer owns desk state internally.
  //     It must accept intent / state / onSubmit / onSimilar from outside.
  assert('ConciergeDesk accepts intent prop', /intent\s*:\s*string/.test(deskSource), '')
  assert('ConciergeDesk accepts onSubmit prop', /onSubmit\s*:\s*\(\)/.test(deskSource), '')
  assert('ConciergeDesk accepts onSimilar prop', /onSimilar\s*:/.test(deskSource), '')
  assert('ConciergeDesk does NOT call useState locally', !/from\s+['"]react['"][^\n]*useState|^import\s+.*useState/m.test(deskSource), '')

  // 9.2 Hook exists and exports useConciergeDesk + ConciergeDeskState.
  assert('useConciergeDesk hook exists', /export function useConciergeDesk/.test(hookSource), '')
  assert('hook exports ConciergeDeskState type', /export type ConciergeDeskState/.test(hookSource), '')

  // 9.3 App.tsx mounts the hook and threads it into ConciergeDesk.
  assert('App imports useConciergeDesk', /useConciergeDesk/.test(appSource), '')
  assert('App constructs hook before render', /const conciergeDesk\s*=\s*useConciergeDesk/.test(appSource), '')
  assert('App passes hook state to ConciergeDesk', /state=\{conciergeDesk\.state\}/.test(appSource), '')
  assert('App passes hook intent to ConciergeDesk', /intent=\{conciergeDesk\.intent\}/.test(appSource), '')

  // 9.4 Row no longer has integer tabIndex on its article wrapper.
  assert('ConciergeResultRow article has no tabIndex={0}', !/tabIndex=\{0\}/.test(rowSource), '')

  // 9.5 Empty reason is not rendered.
  // After the V1.1 refactor we gate on the cleaned reason via cleanReason(reason),
  // not on the raw input — so the gate is `displayReason && (...)` rather than
  // `reason.trim().length > 0`.
  assert('row reason render is gated on truthy displayReason', /\{displayReason && \(/.test(rowSource), '')

  // 9.6 No default "题库管家匹配" string in conciergeSearch.ts.
  assert('default reason string removed from conciergeSearch.ts', !/题库管家匹配/.test(searchSource), '')

  // 9.7 Mode toggle uses aria-label, not aria-pressed.
  assert('home-mode-toggle uses aria-label', /home-mode-toggle[\s\S]{0,400}aria-label=/.test(appSource), '')
  assert('home-mode-toggle does NOT use aria-pressed', !/home-mode-toggle[\s\S]{0,400}aria-pressed/.test(appSource), '')
  assert('aria-label switches based on homeMode', /aria-label=\{homeMode === 'ai' \? '切换到经典模式' : '切换到 AI 模式'\}/.test(appSource), '')

  // 9.8 AI-mode quiet first screen: shell carries home-mode-ai class.
  assert('app-shell tags class with home-mode', /app-shell home-mode-\$\{homeMode\}/.test(appSource), '')

  // 9.9 Heavy topbar widgets gated by classic mode.
  assert('topbar-ai-group rendered only in classic mode', /\{homeMode === 'classic' && \(\s*<span className="topbar-ai-group"/.test(appSource), '')
  assert('闭环面板 button rendered only in classic mode', /\{homeMode === 'classic' && \(\s*<button[\s\S]{0,200}闭环面板/.test(appSource), '')
  assert('data-status hidden in AI mode', /\{homeMode === 'classic' && \(\s*<span className=\{`data-status/.test(appSource), '')

  // 9.10 Basket panel becomes a drawer in AI mode, with chip + backdrop.
  assert('basket-panel class flips to drawer in AI mode', /basket-panel-drawer/.test(appSource), '')
  assert('AI-mode basket-chip exists', /className="basket-chip"/.test(appSource), '')
  assert('basket drawer toggle state', /aiBasketDrawerOpen/.test(appSource), '')

  // 9.11 No-key fallback copy is soft (no English jargon).
  assert('no-key fallback copy is soft', /没填\s*AI\s*密钥|本地题库帮你找/.test(searchSource), '')
  assert('error fallback copy is soft', /管家暂时没连上|本地题库帮你找/.test(searchSource), '')

  // 9.12 The user-facing assistantMessage strings must not leak technical detail.
  // Extract every `assistantMessage: '...'` literal from conciergeSearch.ts.
  const assistantMsgs = Array.from(
    searchSource.matchAll(/assistantMessage:\s*['"`]([^'"`]+)['"`]/g),
  ).map((m) => m[1])
  assert('found at least 2 user-facing assistantMessage literals', assistantMsgs.length >= 2, `got ${assistantMsgs.length}`)
  for (const msg of assistantMsgs) {
    assert(`UI msg "${msg.slice(0, 16)}…" has no Failed/502/steward`, !/Failed|502|503|404|question-bank|steward|DeepSeek/.test(msg), `leak in: ${msg}`)
  }

  // 9.13 Result rows show passage summary, not the small-question hit.
  // buildPrimaryText must no longer read group.hit as the primary text.
  const buildPrimaryFn = rowSource.match(/function buildPrimaryText[\s\S]*?\n\}/)?.[0] || ''
  assert('buildPrimaryText body found', buildPrimaryFn.length > 0, '')
  assert('buildPrimaryText prefers summary', /summary/.test(buildPrimaryFn), '')
  // Strip line and block comments before checking for code-level access.
  const buildPrimaryCode = buildPrimaryFn
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert('buildPrimaryText code does NOT read group.hit', !/group\.hit/.test(buildPrimaryCode), `got: ${buildPrimaryCode}`)

  // The article body should not render `group.hit` directly anywhere
  // (it's only allowed as the article's hover title attribute).
  assert('row JSX does not render group.hit as visible text', !/>\s*\{[^}]*group\.hit[^}]*\}\s*</.test(rowSource), '')

  // 9.14 AI-mode headline is no longer pushed to vertical center; clamp upper bound is now ≤ 110px.
  const headlineRule = appCss().match(/\.app-shell\.home-mode-ai \.concierge-headline\s*\{[^}]*\}/)?.[0] || ''
  assert('AI-mode headline rule exists', headlineRule.length > 0, '')
  const clampUpper = headlineRule.match(/clamp\([^,]+,\s*([0-9.]+)vh/)?.[1]
  assert('headline clamp middle term ≤ 8vh (further upshift)', Number(clampUpper) <= 8, `got: ${clampUpper}vh`)
  assert('headline clamp ceiling ≤ 60px (no longer >100px)', /clamp\([^,]+,\s*[0-9.]+vh,\s*[1-6]?[0-9]px\)/.test(headlineRule), `got: ${headlineRule}`)

  function appCss() {
    return readFileSync(path.join(srcRoot, 'App.css'), 'utf8')
  }
}

// ------------------------------------------------------------------ Test 10
console.log('\nTest 10: Recommendation reason — strip "DeepSeek 检测第 N 位" prefix, render as third line')
{
  // 10.1 cleanReason strips the prefix and trims separators.
  assert('strips prefix with semicolon', cleanReason('DeepSeek 检测第 1 位；摘要明确提及生态设计师 John Todd') === '摘要明确提及生态设计师 John Todd', `got: ${cleanReason('DeepSeek 检测第 1 位；摘要明确提及生态设计师 John Todd')}`)
  assert('strips prefix with full-width semicolon', cleanReason('DeepSeek 检测第 12 位；写作教学反思') === '写作教学反思', '')
  assert('strips prefix with halfwidth semicolon', cleanReason('DeepSeek 检测第 3 位; clean rationale here') === 'clean rationale here', '')
  assert('strips prefix with no separator', cleanReason('DeepSeek 检测第 5 位 just a tail') === 'just a tail', '')
  assert('passes through unrelated text', cleanReason('普通理由：主题接近写作教学') === '普通理由：主题接近写作教学', '')
  assert('empty input returns empty string', cleanReason('') === '', '')
  assert('only-prefix collapses to empty', cleanReason('DeepSeek 检测第 7 位；') === '', '')

  // 10.2 Row JSX renders reason on its own line, not inside .concierge-meta.
  const here = path.dirname(new URL(import.meta.url).pathname)
  const rowSrc = readFileSync(path.resolve(here, '..', 'app', 'src', 'concierge', 'ConciergeResultRow.tsx'), 'utf8')

  // Slice out the meta div block; reason must NOT appear there anymore.
  const metaBlock = rowSrc.match(/<div className="concierge-meta">[\s\S]*?<\/div>/)?.[0] || ''
  assert('row .concierge-meta div found', metaBlock.length > 0, '')
  assert('reason is NOT rendered inside .concierge-meta', !/reason/i.test(metaBlock), `got: ${metaBlock}`)

  // The new third-line reason element exists and uses cleanReason output.
  assert('third-line reason element exists', /className="concierge-reason-line"/.test(rowSrc), '')
  assert('third-line uses 推荐理由 label', /推荐理由：/.test(rowSrc), '')
  assert('third-line is gated on displayReason truthy', /\{displayReason && \(/.test(rowSrc), '')
  assert('row computes displayReason via cleanReason', /const displayReason = cleanReason\(reason\)/.test(rowSrc), '')

  // 10.3 The new reason line CSS exists with light, single-line styles.
  const css = readFileSync(path.resolve(here, '..', 'app', 'src', 'App.css'), 'utf8')
  const reasonRule = css.match(/\.concierge-reason-line\s*\{[^}]*\}/)?.[0] || ''
  assert('.concierge-reason-line rule exists', reasonRule.length > 0, '')
  assert('reason line is single-line truncated', /white-space:\s*nowrap/.test(reasonRule) && /text-overflow:\s*ellipsis/.test(reasonRule), `got: ${reasonRule}`)
  assert('reason line uses light grey ink', /color:\s*#9A9590|color:\s*#6B645C/i.test(reasonRule), `got: ${reasonRule}`)
}

// ------------------------------------------------------------------ Test 11
console.log('\nTest 11: Intent bar chrome — pill input + arrow button')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const css = readFileSync(path.resolve(here, '..', 'app', 'src', 'App.css'), 'utf8')
  const desk = readFileSync(path.resolve(here, '..', 'app', 'src', 'concierge', 'ConciergeDesk.tsx'), 'utf8')

  // 11.1 .concierge-intent-bar visual contract
  const barRule = css.match(/\.concierge-intent-bar\s*\{[^}]*\}/)?.[0] || ''
  assert('.concierge-intent-bar rule found', barRule.length > 0, '')
  assert('bar border is 1px solid #DED9CF', /border:\s*1px solid #DED9CF/i.test(barRule), `got: ${barRule}`)
  assert('bar border-radius 12px', /border-radius:\s*12px/.test(barRule), `got: ${barRule}`)
  assert('bar background #FFFDF8', /background:\s*#FFFDF8/i.test(barRule), `got: ${barRule}`)
  assert('bar min-height 56px', /min-height:\s*56px/.test(barRule), `got: ${barRule}`)
  assert('bar padding 8px 8px 8px 18px', /padding:\s*8px\s+8px\s+8px\s+18px/.test(barRule), `got: ${barRule}`)
  assert('bar transitions border-color and box-shadow', /transition:[^;]*border-color[^;]*box-shadow/.test(barRule), `got: ${barRule}`)

  const focusRule = css.match(/\.concierge-intent-bar:focus-within\s*\{[^}]*\}/)?.[0] || ''
  assert('focus-within rule exists', focusRule.length > 0, '')
  assert('focus border #1A1A1A', /border-color:\s*#1A1A1A/i.test(focusRule), '')
  assert('focus shadow uses ink-tinted shadow', /box-shadow:\s*0\s+2px\s+8px\s+rgba\(26,\s*26,\s*26,\s*0\.08\)/.test(focusRule), `got: ${focusRule}`)
  // Allow `outline: none` but reject any colored outline (color names, hex, rgb, currentColor).
  const outlineDecl = focusRule.match(/outline:\s*([^;]+);/)?.[1].trim() || ''
  assert('focus has no colored outline (only `outline: none` allowed)', outlineDecl === '' || /^none$/i.test(outlineDecl), `got outline: "${outlineDecl}"`)

  // 11.2 .concierge-intent-input contract
  const inputRule = css.match(/\.concierge-intent-input\s*\{[^}]*\}/)?.[0] || ''
  assert('.concierge-intent-input rule found', inputRule.length > 0, '')
  assert('input border none', /border:\s*none/.test(inputRule), '')
  assert('input outline none', /outline:\s*none/.test(inputRule), '')
  assert('input background transparent', /background:\s*transparent/.test(inputRule), '')
  assert('input font-size 15px', /font-size:\s*15px/.test(inputRule), '')
  assert('input line-height 24px', /line-height:\s*24px/.test(inputRule), '')

  const placeholderRule = css.match(/\.concierge-intent-input::placeholder\s*\{[^}]*\}/)?.[0] || ''
  assert('placeholder color #9A9180', /color:\s*#9A9180/i.test(placeholderRule), `got: ${placeholderRule}`)

  // 11.3 .concierge-intent-submit contract
  const submitRule = css.match(/\.concierge-intent-submit\s*\{[^}]*\}/)?.[0] || ''
  assert('.concierge-intent-submit rule found', submitRule.length > 0, '')
  assert('submit min-width 48px', /min-width:\s*48px/.test(submitRule), '')
  assert('submit height 40px', /height:\s*40px/.test(submitRule), '')
  assert('submit border-radius 8px', /border-radius:\s*8px/.test(submitRule), '')
  assert('submit border none', /border:\s*none/.test(submitRule), '')
  assert('submit bg ink #1A1A1A', /background:\s*#1A1A1A/i.test(submitRule), `got: ${submitRule}`)
  assert('submit color paper #FFFDF8', /color:\s*#FFFDF8/i.test(submitRule), `got: ${submitRule}`)
  assert('submit no shadow', /box-shadow:\s*none/.test(submitRule), `got: ${submitRule}`)

  const disabledRule = css.match(/\.concierge-intent-submit:disabled\s*\{[^}]*\}/)?.[0] || ''
  assert('disabled bg #F0EBE0', /background:\s*#F0EBE0/i.test(disabledRule), `got: ${disabledRule}`)
  assert('disabled color #B8B0A0', /color:\s*#B8B0A0/i.test(disabledRule), `got: ${disabledRule}`)
  assert('disabled cursor not-allowed', /cursor:\s*not-allowed/.test(disabledRule), `got: ${disabledRule}`)

  // 11.4 Button content is `→` arrow with aria-label/title.
  assert('submit JSX aria-label is 开始取题', /aria-label="开始取题"/.test(desk), '')
  assert('submit JSX title is 开始取题', /title="开始取题"/.test(desk), '')
  assert('submit JSX renders → glyph (or ellipsis when loading)', /'→'/.test(desk), '')
  assert('submit no longer renders the word 搜', !/['"]搜['"]/.test(desk), '')

  // 11.5 Form still gates Enter on non-empty intent: the submit is disabled when intent is empty.
  // (Native HTML forms ignore Enter when the only submit button is disabled, which is exactly
  // what we want for "空内容按 Enter 不触发请求".)
  assert('submitDisabled gates on intent.trim() empty', /submitDisabled\s*=\s*[^=].*intent\.trim\(\)\.length\s*===\s*0/.test(desk), '')
  assert('button uses disabled={submitDisabled}', /disabled=\{submitDisabled\}/.test(desk), '')
}

// ------------------------------------------------------------------ Test 12
console.log('\nTest 12: Quiet first-screen — subhead, hint line, starter chips')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const desk = readFileSync(path.resolve(here, '..', 'app', 'src', 'concierge', 'ConciergeDesk.tsx'), 'utf8')
  const css = readFileSync(path.resolve(here, '..', 'app', 'src', 'App.css'), 'utf8')

  // 12.1 Subhead copy is short and de-engineered.
  const subheadMatch = desk.match(/<p className="concierge-subhead">([^<]+)<\/p>/)
  assert('subhead literal exists', !!subheadMatch, '')
  const subhead = subheadMatch?.[1] || ''
  assert('subhead does NOT mention 管家 / key / 兜底', !/(管家|兜底|key|API|DeepSeek)/i.test(subhead), `got: ${subhead}`)
  assert('subhead is one short line (<= 20 chars)', subhead.length > 0 && subhead.length <= 20, `got: "${subhead}" (${subhead.length})`)

  // 12.2 Hint line under intent bar exists and matches expected wording.
  const hintMatch = desk.match(/<p className="concierge-subhead-hint">([^<]+)<\/p>/)
  assert('subhead-hint line exists', !!hintMatch, '')
  const hint = hintMatch?.[1] || ''
  assert('hint mentions 主题 / 题型 / 难度 / 来源', /主题/.test(hint) && /题型/.test(hint) && /难度/.test(hint) && /来源/.test(hint), `got: ${hint}`)

  // 12.3 Starter chips constant exists with the three required examples.
  assert('STARTER_CHIPS contains 生态主题 C 篇', /生态主题\s*C\s*篇/.test(desk), '')
  assert('STARTER_CHIPS contains 2025 浙江卷', /2025\s*浙江卷/.test(desk), '')
  assert('STARTER_CHIPS contains 中等难度主旨题', /中等难度主旨题/.test(desk), '')

  // 12.4 Chip click only fills input — calls onIntentChange, NOT onSubmit.
  const chipBtnMatch = desk.match(/className="concierge-starter-chip"[\s\S]{0,200}onClick=\{[^}]+\}/)?.[0] || ''
  assert('chip onClick wired', chipBtnMatch.length > 0, '')
  assert('chip click calls onIntentChange', /onIntentChange\(chip\)/.test(chipBtnMatch), `got: ${chipBtnMatch}`)
  assert('chip click does NOT call onSubmit', !/onSubmit\(/.test(chipBtnMatch), `got: ${chipBtnMatch}`)

  // 12.5 Chips only show on quiet states (empty / error), not when results / loading / clarification.
  assert('chips gated on empty or error state', /\(state\.kind === 'empty' \|\| state\.kind === 'error'\)\s*&&\s*\(\s*<ul className="concierge-starter-chips"/.test(desk), '')

  // 12.6 The verbose "用一句自然语言告诉管家" copy is gone.
  assert('legacy subhead copy removed', !/用一句自然语言告诉管家/.test(desk), '')
  assert('legacy fallback explanation removed', !/没填\s*key\s*也能用关键词兜底|没有\s*DeepSeek\s*API\s*key/.test(desk), '')

  // 12.7 CSS for chips: light, no blue, hover #F4F2EC.
  const chipRule = css.match(/\.concierge-starter-chip\s*\{[^}]*\}/)?.[0] || ''
  assert('chip rule found', chipRule.length > 0, '')
  assert('chip background transparent (no blue fill)', /background:\s*transparent/.test(chipRule), `got: ${chipRule}`)
  assert('chip border light #E5E3DC', /border:\s*1px solid #E5E3DC/i.test(chipRule), `got: ${chipRule}`)
  assert('chip text uses #6B645C secondary ink', /color:\s*#6B645C/i.test(chipRule), `got: ${chipRule}`)
  const chipHover = css.match(/\.concierge-starter-chip:hover\s*\{[^}]*\}/)?.[0] || ''
  assert('chip hover uses #F4F2EC', /background:\s*#F4F2EC/i.test(chipHover), `got: ${chipHover}`)

  // 12.8 Intent bar rest state: light border, focus-within turns ink.
  const barRule = css.match(/\.concierge-intent-bar\s*\{[^}]*\}/)?.[0] || ''
  assert('intent-bar rest border #DED9CF', /border:\s*1px solid #DED9CF/i.test(barRule), `got: ${barRule}`)
  assert('intent-bar rest background #FFFDF8', /background:\s*#FFFDF8/i.test(barRule), `got: ${barRule}`)
  const focusRule = css.match(/\.concierge-intent-bar:focus-within\s*\{[^}]*\}/)?.[0] || ''
  assert('focus-within border-color #1A1A1A', /border-color:\s*#1A1A1A/i.test(focusRule), '')
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
