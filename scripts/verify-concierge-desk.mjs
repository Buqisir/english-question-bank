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
import { pickClarificationLine } from '../app/src/concierge/clarificationCopy.ts'
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

// Restart cut ⑤ CR-5 MF-1 fix: the local keyword fallback's noise floor now
// uses document frequency (see conciergeSearch.ts DF_NOISE_THRESHOLD) to
// separate a real, if generic, content word from an isolated bigram
// coincidence — DF is only meaningful against a realistically-sized pool.
// These filler groups exist ONLY to give '写作' (Test 5) and '汽车' (Test 6)
// enough corpus frequency to read as real content words, matching how the
// live ~270-group bank behaves; they carry no topic labels / tags of their
// own interest and no other test in this file asserts against their ids.
const dfFillerGroups = [
  { id: 'g-filler-writing-1', title: '写作技巧专题', source: '模拟卷', sourceType: 'self_made', year: 2023, region: '浙江', paperName: '写作专题', section: '写作', passageTitle: '写作训练', summary: '一篇关于写作方法的说明文。', groupType: 'writing', questionCount: 1, difficulty: 'medium', tags: [], topicLabels: [], hit: '', answerPreview: '', defaultScore: 1 },
  { id: 'g-filler-writing-2', title: '写作评价标准', source: '模拟卷', sourceType: 'self_made', year: 2023, region: '浙江', paperName: '写作专题', section: '写作', passageTitle: '写作评价', summary: '讨论写作评分标准的应用文。', groupType: 'writing', questionCount: 1, difficulty: 'medium', tags: [], topicLabels: [], hit: '', answerPreview: '', defaultScore: 1 },
  { id: 'g-filler-car-1', title: '汽车工业发展史', source: '模拟卷', sourceType: 'self_made', year: 2023, region: '浙江', paperName: '科技专题', section: '阅读理解', passageTitle: '汽车工业', summary: '介绍汽车工业发展历程的说明文。', groupType: 'reading', questionCount: 1, difficulty: 'medium', tags: [], topicLabels: [], hit: '', answerPreview: '', defaultScore: 1 },
  { id: 'g-filler-car-2', title: '电动汽车趋势', source: '模拟卷', sourceType: 'self_made', year: 2023, region: '浙江', paperName: '科技专题', section: '阅读理解', passageTitle: '电动汽车', summary: '一篇关于电动汽车未来趋势的报道。', groupType: 'reading', questionCount: 1, difficulty: 'medium', tags: [], topicLabels: [], hit: '', answerPreview: '', defaultScore: 1 },
]

console.log('=== Concierge Desk Verification ===\n')

// ------------------------------------------------------------------ Test 1
// Retired in classic-retire-3-cleanup: homeMode ('ai' | 'classic') and its
// localStorage-backed initializer were deleted from App.tsx — ConciergeDesk
// is now the only home view, unconditionally. This test mirrored the old
// pickHomeMode initializer purely at the unit level; with the source it
// mirrored gone, it verified nothing real and became a zombie assertion.
// See scripts/verify-classic-retire-3.mjs for the replacement coverage
// (asserts App.tsx contains no `homeMode` at all).

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
    questionGroups: [...sampleGroups, ...dfFillerGroups],
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
    intent: '汽车',
    pendingQuery: null,
    questionGroups: [...sampleGroups, ...dfFillerGroups],
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
console.log('\nTest 9: V1.1 IA — desk maps paperResults; old expandedHitId/onPreview gone')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const srcRoot = path.resolve(here, '..', 'app', 'src')

  const deskSource = readFileSync(path.join(srcRoot, 'concierge', 'ConciergeDesk.tsx'), 'utf8')
  const hookSource = readFileSync(path.join(srcRoot, 'concierge', 'useConciergeDesk.ts'), 'utf8')
  const paperRowSource = readFileSync(path.join(srcRoot, 'concierge', 'ConciergePaperRow.tsx'), 'utf8')
  const groupCardSource = readFileSync(path.join(srcRoot, 'concierge', 'ConciergeGroupCard.tsx'), 'utf8')
  const appSource = readFileSync(path.join(srcRoot, 'App.tsx'), 'utf8')
  const aggSource = readFileSync(path.join(srcRoot, 'concierge', 'aggregatePaperResults.ts'), 'utf8')

  // 9.1 Desk receives the deeper Retrieval Module surface (retrieval + actions),
  //     not the V1 flat props.
  assert('Desk props include retrieval: ConciergeRetrievalView',
    /retrieval\s*:\s*ConciergeRetrievalView/.test(deskSource), '')
  assert('Desk props include actions: ConciergeRetrievalActions',
    /actions\s*:\s*ConciergeRetrievalActions/.test(deskSource), '')
  assert('Desk props include basketIds + onAdd (Assembly Basket layer)',
    /basketIds\s*:\s*Set<string>/.test(deskSource) && /onAdd\s*:\s*\(group\s*:\s*QuestionGroupCard\)\s*=>\s*void/.test(deskSource), '')
  assert('Desk destructures intent/state/paperResults/expandedPaperKey from retrieval',
    /const\s*\{\s*intent,\s*state,\s*paperResults,\s*expandedPaperKey\s*\}\s*=\s*retrieval/.test(deskSource), '')
  assert('Desk destructures setIntent/submit/triggerSimilar/togglePaper from actions',
    /const\s*\{\s*setIntent,\s*submit,\s*triggerSimilar,\s*togglePaper\s*\}\s*=\s*actions/.test(deskSource), '')

  // 9.2 Old V1 + Step-1 flat props are gone from the Desk surface.
  for (const removed of [
    'intent\\s*:\\s*string',
    'onIntentChange\\s*:',
    'onSubmit\\s*:',
    'onSimilar\\s*:',
    'paperResults\\s*:\\s*PaperResult\\[\\]',
    'expandedPaperKey\\s*:\\s*string',
    'onTogglePaper\\s*:',
    'expandedHitId\\s*:',
    'onToggleExpand\\s*:',
    'onRetryExpand\\s*:',
    'onPreview\\s*:',
    'detailCache\\s*:',
  ]) {
    assert(`Desk no longer accepts ${removed}`,
      !new RegExp(removed).test(deskSource), '')
  }

  // 9.3 Cut ⑥: Desk now owns one piece of local UI state — whether the
  // default browse feed is expanded past its 8-paper preview. That's
  // presentation-only pagination state, not retrieval state, so it stays
  // local to the component instead of moving into useConciergeDesk.
  assert('Desk uses useState for feed-expand UI state only', /\buseState\b/.test(deskSource), '')

  // 9.4 Desk renders paper rows, not the old group rows.
  // Cut ai-mode-filter-chips: the search-results list now maps
  // `filteredPaperResults` (paperResults narrowed by the chip filter layer,
  // see filters.ts) instead of `paperResults` directly — same underlying
  // PaperResult[] shape, filtered client-side before render.
  assert('Desk maps (filtered)paperResults', /[Pp]aperResults\.map\(\(paper\)/.test(deskSource), '')
  assert('Desk does NOT map state.hits directly', !/state\.hits\.map\(/.test(deskSource), '')
  assert('Desk uses ConciergePaperRow', /<ConciergePaperRow\b/.test(deskSource), '')
  assert('Desk passes basketIds to row', /basketIds=\{basketIds\}/.test(deskSource), '')
  // Inner action wiring goes through the actions object, not stale prop names.
  assert('Desk wires onTogglePaper to actions.togglePaper',
    /onTogglePaper=\{togglePaper\}/.test(deskSource), '')
  assert('Desk wires onSimilar to actions.triggerSimilar',
    /onSimilar=\{\(group\)\s*=>\s*\{\s*void triggerSimilar\(group\)\s*\}\}/.test(deskSource), '')
  assert('Desk submit handler uses actions.submit',
    /void submit\(\)/.test(deskSource), '')
  assert('Desk input onChange wires to actions.setIntent',
    /onChange=\{\(event\)\s*=>\s*setIntent\(event\.target\.value\)\}/.test(deskSource), '')
  // Cut ai-mode-filter-chips (C7): STARTER_CHIPS' "fill input + submit
  // immediately" click handler is retired along with the constant — the
  // filter row toggles local filter state instead of touching intent/submit
  // at all (see Test 12 below for the full new contract).
  assert('Desk filter chip click toggles local filter state via toggleFilter',
    /className=\{`concierge-starter-chip[\s\S]{0,300}onClick=\{\(\)\s*=>\s*[\s\S]{0,100}toggleFilter\(/.test(deskSource), '')

  // 9.5 Hook exposes the new deeper surface only, no flat fields leaked.
  assert('hook exports ConciergeRetrievalView',
    /export type ConciergeRetrievalView\s*=/.test(hookSource), '')
  assert('hook exports ConciergeRetrievalActions',
    /export type ConciergeRetrievalActions\s*=/.test(hookSource), '')
  assert('hook exports UseConciergeDeskResult shape { retrieval, actions }',
    /export type UseConciergeDeskResult\s*=\s*\{\s*retrieval\s*:\s*ConciergeRetrievalView\s*actions\s*:\s*ConciergeRetrievalActions\s*\}/.test(hookSource), '')

  // ConciergeRetrievalView fields.
  const retrievalDecl = hookSource.match(/export type ConciergeRetrievalView\s*=\s*\{([\s\S]*?)\n\}/)?.[1] || ''
  assert('retrieval contains intent', /\bintent\s*:\s*string/.test(retrievalDecl), '')
  assert('retrieval contains state', /\bstate\s*:\s*ConciergeDeskState/.test(retrievalDecl), '')
  assert('retrieval contains paperResults', /\bpaperResults\s*:\s*PaperResult\[\]/.test(retrievalDecl), '')
  assert('retrieval contains expandedPaperKey', /\bexpandedPaperKey\s*:\s*string\s*\|\s*null/.test(retrievalDecl), '')
  assert('retrieval contains groupDetail.cache (reserved)',
    /groupDetail\s*:\s*\{\s*cache\s*:\s*ConciergeDetailCache\s*\}/.test(retrievalDecl), '')

  // ConciergeRetrievalActions fields.
  const actionsDecl = hookSource.match(/export type ConciergeRetrievalActions\s*=\s*\{([\s\S]*?)\n\}/)?.[1] || ''
  for (const member of ['setIntent', 'submit', 'triggerSimilar', 'togglePaper', 'retryGroupDetail', 'reset']) {
    assert(`actions contains ${member}`, new RegExp(`\\b${member}\\s*:`).test(actionsDecl), `actions decl:\n${actionsDecl}`)
  }

  // Both retrieval + actions are stabilized via useMemo.
  assert('retrieval is built with useMemo<ConciergeRetrievalView>',
    /const retrieval = useMemo<ConciergeRetrievalView>/.test(hookSource), '')
  assert('actions is built with useMemo<ConciergeRetrievalActions>',
    /const actions = useMemo<ConciergeRetrievalActions>/.test(hookSource), '')

  // The hook's return statement is just { retrieval, actions } — no flat fields leaked.
  const returnBlock = hookSource.match(/return\s*\{[\s\S]*?\}\s*\n\}\s*\n/)?.[0] || ''
  assert('hook return block extracted', returnBlock.length > 0, '')
  assert('hook return is { retrieval, actions } only',
    /return\s*\{\s*retrieval,\s*actions,?\s*\}/.test(returnBlock), `return block:\n${returnBlock}`)
  for (const flat of [
    'intent',
    'setIntent',
    'state',
    'submit',
    'triggerSimilar',
    'paperResults',
    'expandedPaperKey',
    'togglePaper',
    'detailCache',
    'retryGroupDetail',
    'reset',
  ]) {
    assert(`hook return block does NOT include flat ${flat}`,
      !new RegExp(`^\\s*${flat}\\s*,?\\s*$`, 'm').test(returnBlock),
      `flat field ${flat} leaked in return:\n${returnBlock}`)
  }

  // 9.6 App passes the deeper surface and only the deeper surface.
  assert('App passes retrieval=conciergeDesk.retrieval',
    /retrieval=\{conciergeDesk\.retrieval\}/.test(appSource), '')
  assert('App passes actions=conciergeDesk.actions',
    /actions=\{conciergeDesk\.actions\}/.test(appSource), '')
  for (const stale of [
    'intent=\\{conciergeDesk\\.',
    'onIntentChange=\\{conciergeDesk\\.',
    'state=\\{conciergeDesk\\.',
    'paperResults=\\{conciergeDesk\\.',
    'expandedPaperKey=\\{conciergeDesk\\.',
    'onTogglePaper=\\{',
    'onSimilar=\\{',
    'onSubmit=\\{\\(\\)',
    'expandedHitId=',
    '<ConciergeDesk[\\s\\S]*?detailCache=',
    '<ConciergeDesk[\\s\\S]*?onToggleExpand=',
    '<ConciergeDesk[\\s\\S]*?onPreview=',
  ]) {
    assert(`App no longer wires ${stale.split('\\')[0]} on ConciergeDesk`,
      !new RegExp(stale).test(appSource), `still present`)
  }
  // App.tsx must not reach into the hook's internal fields outside of
  // .retrieval / .actions — that would defeat the encapsulation.
  for (const internal of [
    'conciergeDesk\\.intent',
    'conciergeDesk\\.setIntent',
    'conciergeDesk\\.state',
    'conciergeDesk\\.submit',
    'conciergeDesk\\.triggerSimilar',
    'conciergeDesk\\.paperResults',
    'conciergeDesk\\.expandedPaperKey',
    'conciergeDesk\\.togglePaper',
    'conciergeDesk\\.detailCache',
    'conciergeDesk\\.retryGroupDetail',
    'conciergeDesk\\.reset',
  ]) {
    assert(`App does NOT read ${internal.replace(/\\\\\./g, '.')}`,
      !new RegExp(internal).test(appSource), 'internal read leaked')
  }

  // 9.7 ConciergePaperRow contract.
  assert('Paper row article uses concierge-paper-row class', /<article[\s\S]{0,200}className=\{`concierge-paper-row\$\{expanded \? ' is-expanded' : ''\}`\}/.test(paperRowSource), '')
  assert('Paper row click guards interactive children', /target\.closest\('button, a, input, textarea, select, \[role="button"\], \.concierge-paper-detail'\)/.test(paperRowSource), '')
  assert('Paper row chevron toggles via onTogglePaper(paper.key)', /onClick=\{\(\)\s*=>\s*onTogglePaper\(paper\.key\)\}/.test(paperRowSource), '')
  assert('Paper row uses 命中 N 个篇章 wording (Cut 6)', /['"]命中\s*['"]/.test(paperRowSource) && /['"]\s*个篇章['"]/.test(paperRowSource) && /paper\.hitCount/.test(paperRowSource), '')
  assert('Paper row does NOT say 共 N 组', !/共\s*\{paper\.hitCount\}\s*组/.test(paperRowSource), '')
  assert('Paper row does NOT use the old "命中 N 组" template (Cut 6 dropped it)', !/命中\s*\{paper\.hitCount\}\s*组(?!\w)/.test(paperRowSource), '')
  assert('Paper row reads paper.hitContext.scope for badge wording', /paper\.hitContext\.scope/.test(paperRowSource), '')
  assert('Paper row scrolls primary hit into view on expand', /scrollIntoView\(\{\s*behavior:\s*['"]smooth['"]\s*,\s*block:\s*['"]nearest['"]\s*\}\)/.test(paperRowSource), '')
  assert('Paper row tags hit <li> with data-hit', /data-hit=\{isHit\s*\?\s*['"]true['"]\s*:\s*undefined\}/.test(paperRowSource), '')
  assert('Paper row does NOT call fetchQuestionGroupDetail', !/fetchQuestionGroupDetail/.test(paperRowSource), '')

  // 9.8 ConciergeGroupCard contract — group-level actions live here.
  assert('Group card has C8 draft labels', /已在草稿卷中/.test(groupCardSource) && /加入草稿卷/.test(groupCardSource) && /暂不可组卷/.test(groupCardSource), '')
  assert('Group card aria-pressed follows joined draft state', /aria-pressed=\{draftState === ['"]in_current_draft['"]\}/.test(groupCardSource), '')
  assert('Group card disables only unavailable draft state', /disabled=\{draftState === ['"]disabled['"]\}/.test(groupCardSource), '')
  assert('Group card 找类似 button (no bare 类似)', />\s*找类似\s*<\/button>/.test(groupCardSource), '')
  assert('Group card has no 预览 button', !/['"]预览['"]/.test(groupCardSource), '')
  assert('Group card has no per-question add UI', !/加入小题|加入单题|onAddQuestion/.test(groupCardSource), '')

  // 9.9 Aggregator contract.
  assert('aggregatePaperResults exported', /export function aggregatePaperResults/.test(aggSource), '')
  assert('PaperResult type exported', /export type PaperResult/.test(aggSource), '')
  assert('Aggregator key uses paperName + year + region (three segments)', /paper:\$\{paperName\}__\$\{group\.year\}__\$\{region\}/.test(aggSource), '')
  assert('Aggregator includes source signature in key', /__\$\{sigSource\}__\$\{sigType\}/.test(aggSource), '')
  assert('Aggregator falls back to "其他来源" when fields missing', /key:\s*FALLBACK_KEY/.test(aggSource), '')
  assert('FALLBACK_KEY is a stable constant', /const FALLBACK_KEY = ['"]paper:_其他来源_['"]/.test(aggSource), '')
  assert('Aggregator sanitizes reasons via cleanReason', /cleanReason\(reason\)/.test(aggSource), '')
  assert('Aggregator surfaces representativeReason from first hit', /representativeReason:\s*cleanReason\(reason\)/.test(aggSource), '')
  // Cut 6 — paper hit context surface.
  assert('PaperHitContext type exported (Cut 6)', /export type PaperHitContext\s*=/.test(aggSource), '')
  assert('PaperHitScope type exported (Cut 6)', /export type PaperHitScope\s*=\s*['"]passage['"]\s*\|\s*['"]paper['"]\s*\|\s*['"]mixed['"]/.test(aggSource), '')
  assert('PaperResult carries hitContext (Cut 6)', /hitContext:\s*PaperHitContext/.test(aggSource), '')
  assert('Aggregator initialises hitContext.scope = passage (V1)', /scope:\s*['"]passage['"]/.test(aggSource), '')
  assert('Aggregator does NOT inspect reason text to decide scope', !/reason\.includes|reason\.match|reason\.indexOf|reason\.test/.test(aggSource), '')

  // 9.10 Hook togglePaper does NOT fetch group detail.
  // Strip comments before the check (comments mention previewDetails legitimately).
  const hookCode = hookSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert('togglePaper body does not call loadDetail/fetchDetail', /const togglePaper = useCallback\(\(paperKey: string\)\s*=>\s*\{\s*setExpandedPaperKey/.test(hookCode), '')
  assert('togglePaper body does NOT touch detailCache', !/togglePaper[\s\S]{0,400}setDetailCache/.test(hookCode), '')

  // 9.11 Hook does NOT touch App.tsx preview pipeline.
  assert('hook code does NOT touch previewDetails / loadPreviewForBasketItems', !/previewDetails|loadPreviewForBasketItems/.test(hookCode), '')

  // 9.12 New search clears expansion + cache.
  assert('runSearch clears expansion before await', /clearExpansion\(\)/.test(hookCode), '')
}

// ------------------------------------------------------------------ Test 10
console.log('\nTest 10: cleanReason still strips internal markers (V1 invariant carried forward)')
{
  // 10.1 Existing strips still hold.
  assert('strips DeepSeek 检测第 N 位 prefix', cleanReason('DeepSeek 检测第 1 位；摘要明确提及生态设计师 John Todd') === '摘要明确提及生态设计师 John Todd', '')
  assert('strips 管家规则过滤 prefix', cleanReason('管家规则过滤；DeepSeek 检测第 1 位；标题含 阅读理解 C') === '标题含 阅读理解 C', '')
  assert('strips bare DeepSeek token', cleanReason('DeepSeek；主题相符') === '主题相符', '')
  assert('strips steward / fallback tokens (case-insensitive)', cleanReason('Steward fallback；fallback；real reason') === 'real reason', '')
  assert('only-internal collapses to empty', cleanReason('管家规则过滤；DeepSeek 检测第 4 位；') === '', '')
  // 10.2 V1.1 extras.
  assert('strips reading-parse-eval slug', cleanReason('reading-parse-eval；主题清晰') === '主题清晰', `got: ${cleanReason('reading-parse-eval；主题清晰')}`)
  assert('strips source-gap-fill slug', cleanReason('source-gap-fill；细节理解') === '细节理解', `got: ${cleanReason('source-gap-fill；细节理解')}`)
}

// ------------------------------------------------------------------ Test 11
console.log('\nTest 11: aggregatePaperResults — bucket key + 命中 + fallback')
{
  const sample = [
    {
      group: {
        id: 'g1', title: '文章一', source: '2025·浙江', sourceType: 'real_exam',
        year: 2025, region: '浙江', paperName: '2025 浙江一模', section: '阅读 C',
        passageTitle: '城市交通', summary: '论述城市规划', groupType: 'reading',
        questionCount: 4, difficulty: 'medium', tags: [], topicLabels: [], hit: '', answerPreview: '', defaultScore: 2.5,
      },
      reason: 'DeepSeek 检测第 1 位；主题接近',
    },
    {
      group: {
        id: 'g2', title: '文章二', source: '2025·浙江', sourceType: 'real_exam',
        year: 2025, region: '浙江', paperName: '2025 浙江一模', section: '阅读 D',
        passageTitle: '环境', summary: '环境保护', groupType: 'reading',
        questionCount: 4, difficulty: 'high', tags: [], topicLabels: [], hit: '', answerPreview: '', defaultScore: 2.5,
      },
      reason: 'DeepSeek 检测第 2 位；细节',
    },
    {
      group: {
        id: 'g3', title: '完形', source: '2025·北京', sourceType: 'real_exam',
        year: 2025, region: '北京', paperName: '2025 北京一模', section: '完形',
        passageTitle: '科技', summary: '科技与生活', groupType: 'cloze',
        questionCount: 15, difficulty: 'medium', tags: [], topicLabels: [], hit: '', answerPreview: '', defaultScore: 1,
      },
      reason: 'DeepSeek 检测第 3 位；科技',
    },
    {
      group: {
        id: 'g4', title: '无来源', source: '', sourceType: 'self_made',
        year: 0, region: '未标地区', paperName: '', section: '其他',
        passageTitle: '', summary: '', groupType: 'reading',
        questionCount: 1, difficulty: 'low', tags: [], topicLabels: [], hit: '', answerPreview: '', defaultScore: 1,
      },
      reason: 'fallback',
    },
  ]

  const { aggregatePaperResults } = await import('../app/src/concierge/aggregatePaperResults.ts')
  const out = aggregatePaperResults(sample)
  assert('three buckets total (zhejiang, beijing, fallback)', out.length === 3, `got ${out.length}`)
  const zhejiang = out.find((p) => p.paperName === '2025 浙江一模')
  const beijing = out.find((p) => p.paperName === '2025 北京一模')
  const fallback = out.find((p) => p.isFallback)
  assert('zhejiang bucket exists', !!zhejiang, '')
  assert('beijing bucket exists', !!beijing, '')
  assert('fallback bucket exists and is "其他来源"', !!fallback && fallback.paperName === '其他来源', '')
  assert('zhejiang bucket merges g1 + g2', zhejiang.hitCount === 2 && zhejiang.groups.length === 2, `got ${zhejiang?.hitCount}`)
  assert('beijing bucket has only g3', beijing.hitCount === 1, `got ${beijing?.hitCount}`)
  assert('fallback comes last (sinks)', out[out.length - 1].isFallback === true, '')
  assert('representativeReason is sanitized (no DeepSeek prefix)', !/DeepSeek/.test(zhejiang.representativeReason), `got: ${zhejiang.representativeReason}`)
  assert('representativeReason picks the first hit reason', zhejiang.representativeReason.includes('主题接近'), `got: ${zhejiang.representativeReason}`)
  assert('per-group reason sanitized too', zhejiang.groups[0].reason && !/DeepSeek/.test(zhejiang.groups[0].reason), '')
  assert('groupTypes list collected (reading)', zhejiang.groupTypes.includes('reading'), '')

  // Cut 6 — hitContext surface.
  assert('zhejiang.hitContext is present', !!zhejiang.hitContext, '')
  assert('zhejiang.hitContext.scope === "passage" (V1 only emits passage hits)', zhejiang.hitContext.scope === 'passage', `got: ${zhejiang.hitContext?.scope}`)
  assert('zhejiang.hitContext.hitGroupIds matches groups order', JSON.stringify(zhejiang.hitContext.hitGroupIds) === JSON.stringify(zhejiang.groups.map((g) => g.group.id)), `got: ${JSON.stringify(zhejiang.hitContext.hitGroupIds)}`)
  assert('zhejiang.hitContext.primaryGroupId is the first hit', zhejiang.hitContext.primaryGroupId === zhejiang.groups[0].group.id, `got: ${zhejiang.hitContext.primaryGroupId}`)
  assert('zhejiang.hitContext.passageHits length matches hits', zhejiang.hitContext.passageHits.length === zhejiang.hitCount, `got: ${zhejiang.hitContext.passageHits.length}`)
  assert('zhejiang.hitContext.passageHits sanitized reasons', zhejiang.hitContext.passageHits.every((p) => !/DeepSeek/.test(p.reason)), '')
  assert('zhejiang.hitContext.displayReason aligns with representativeReason', zhejiang.hitContext.displayReason === zhejiang.representativeReason, `disp=${zhejiang.hitContext.displayReason} rep=${zhejiang.representativeReason}`)
  assert('beijing single-hit primaryGroupId equals its only group', beijing.hitContext.primaryGroupId === beijing.groups[0].group.id, `got: ${beijing.hitContext.primaryGroupId}`)
  assert('fallback bucket also has a hitContext', !!fallback.hitContext && fallback.hitContext.scope === 'passage', '')

  // Different source signature splits otherwise-identical bucket.
  const split = [
    sample[0],
    {
      ...sample[0],
      group: { ...sample[0].group, id: 'g5', source: '2025·浙江(模拟)', sourceType: 'mock_exam' },
      reason: 'mock 模拟',
    },
  ]
  const splitOut = aggregatePaperResults(split)
  assert('different source/sourceType creates a separate bucket', splitOut.length === 2, `got ${splitOut.length}`)

  // Cosmetic source noise must NOT fragment the bucket: extra spaces,
  // "扫描版" / "高清版" / punctuation differences all collapse to one.
  const cosmeticDup = [
    {
      group: { ...sample[0].group, id: 'gc1', source: ' 2025 · 浙江 ' },
      reason: 'r1',
    },
    {
      group: { ...sample[0].group, id: 'gc2', source: '2025·浙江(扫描版)' },
      reason: 'r2',
    },
    {
      group: { ...sample[0].group, id: 'gc3', source: '2025  ·  浙江' },
      reason: 'r3',
    },
  ]
  const cosmeticOut = aggregatePaperResults(cosmeticDup)
  assert('cosmetic source noise collapses to one bucket', cosmeticOut.length === 1, `got ${cosmeticOut.length} (keys: ${cosmeticOut.map((p) => p.key).join(', ')})`)
}

// ------------------------------------------------------------------ Test 17
console.log('\nTest 17: Auto-expand once + collapsible by user')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const hook = readFileSync(path.resolve(here, '..', 'app', 'src', 'concierge', 'useConciergeDesk.ts'), 'utf8')

  // useEffect is used for the one-time auto-expand (no render-time fallback).
  assert('hook imports useEffect + useRef', /import\s*\{[^}]*useEffect[^}]*\}\s*from\s*['"]react['"]/.test(hook) && /import\s*\{[^}]*useRef[^}]*\}\s*from\s*['"]react['"]/.test(hook), '')
  assert('hook keeps a lastAutoExpandKeyRef sentinel', /lastAutoExpandKeyRef\s*=\s*useRef<string \| null>\(null\)/.test(hook), '')
  assert('hook auto-expands lone bucket inside useEffect', /useEffect\(\(\)\s*=>\s*\{[\s\S]{0,400}paperResults\.length === 1[\s\S]{0,400}setExpandedPaperKey\(onlyKey\)/.test(hook), '')
  assert('hook clears the sentinel for multi/empty result sets', /lastAutoExpandKeyRef\.current = null/.test(hook), '')
  // The sentinel-clear path is the mechanism that lets a NEW search of a
  // different lone paper auto-expand again. Spell that contract out so it
  // doesn't quietly regress.
  assert('hook clearExpansion ALSO resets the sentinel (so new search re-auto-expands)', /clearExpansion = useCallback\(\(\)\s*=>\s*\{\s*setExpandedPaperKey\(null\)[\s\S]{0,200}lastAutoExpandKeyRef\.current = null/.test(hook), '')
  assert('hook does NOT compute a render-time effective-key', !/effectiveExpandedKey/.test(hook), '')
  // togglePaper still toggles by paperKey alone.
  const hookCode = hook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert('togglePaper just toggles expandedPaperKey', /const togglePaper = useCallback\(\(paperKey: string\)\s*=>\s*\{\s*setExpandedPaperKey/.test(hookCode), '')
}

// ------------------------------------------------------------------ Test 12
console.log('\nTest 12: Quiet first-screen — landing hero gone; STARTER_CHIPS retired for structured filter chips (cut ai-mode-filter-chips, C7)')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const desk = readFileSync(path.resolve(here, '..', 'app', 'src', 'concierge', 'ConciergeDesk.tsx'), 'utf8')
  const css = readFileSync(path.resolve(here, '..', 'app', 'src', 'App.css'), 'utf8')

  // Landing hero is gone.
  assert('legacy headline 你找什么题 removed', !/你找什么题\s*\/\s*卷子？/.test(desk), '')
  assert('legacy subhead "自然语言或关键词皆可" removed', !/自然语言或关键词皆可/.test(desk), '')
  assert('no concierge-headline / concierge-subhead element rendered', !/<header className="concierge-headline">/.test(desk) && !/<p className="concierge-subhead">/.test(desk), '')

  // Cut ai-mode-filter-chips (C7): the three hardcoded example STARTER_CHIPS
  // are retired in favor of the structured filter row (filters.ts +
  // buildFilterOptions). `submit(chip)`'s direct-search capability itself is
  // preserved in the code path (plan C7) — just no longer invoked by a
  // literal example chip.
  assert('STARTER_CHIPS constant declaration removed', !/const STARTER_CHIPS/.test(desk), '')
  assert('hardcoded example chip text 生态主题 C 篇 is gone', !/生态主题\s*C\s*篇/.test(desk), '')
  assert('hardcoded example chip text 2025 浙江卷 is gone', !/2025\s*浙江卷/.test(desk), '')
  assert('hardcoded example chip text 中等难度主旨题 is gone', !/中等难度主旨题/.test(desk), '')

  // The structured filter row replaces it: built from buildFilterOptions,
  // toggled via applyConciergeFilters-backed local state, shown for
  // 'empty' and 'results' (which covers the true vacuum — 'results' with
  // zero hits — per plan C5).
  assert('imports buildFilterOptions/applyConciergeFilters from filters.ts', /from '\.\/filters\.ts'/.test(desk), '')
  assert('concierge-filter-row rendered', /concierge-filter-row/.test(desk), '')
  assert(
    'filter row gated on !dataLoading + (empty || results)',
    /\{!dataLoading && \(state\.kind === ['"]empty['"] \|\| state\.kind === ['"]results['"]\)/.test(desk),
    '',
  )
  assert(
    'isVacuumResultsState is defined as results-with-zero-hits (not merely referenced)',
    /function isVacuumResultsState[\s\S]{0,200}state\.kind === ['"]results['"][\s\S]{0,80}state\.hits\.length === 0/.test(
      desk,
    ),
    '',
  )

  // Chip styling — the filter row reuses .concierge-starter-chip's exact
  // rule (C6: zero new/changed color tokens), so these hex literals must
  // still be exactly as before.
  const chipRule = css.match(/\.concierge-starter-chip\s*\{[^}]*\}/)?.[0] || ''
  assert('chip background transparent', /background:\s*transparent/.test(chipRule), '')
  assert('chip border light #E5E3DC', /border:\s*1px solid #E5E3DC/i.test(chipRule), '')
  assert('chip text uses #6B645C', /color:\s*#6B645C/i.test(chipRule), '')

  // Intent bar resting + focus.
  const barRule = css.match(/\.concierge-intent-bar\s*\{[^}]*\}/)?.[0] || ''
  assert('intent-bar rest border #DED9CF', /border:\s*1px solid #DED9CF/i.test(barRule), '')
  const focusRule = css.match(/\.concierge-intent-bar:focus-within\s*\{[^}]*\}/)?.[0] || ''
  assert('focus border #1A1A1A', /border-color:\s*#1A1A1A/i.test(focusRule), '')
}

// ------------------------------------------------------------------ Test 13
console.log('\nTest 13: Clarification picker still in place')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const desk = readFileSync(path.resolve(here, '..', 'app', 'src', 'concierge', 'ConciergeDesk.tsx'), 'utf8')
  assert('desk renders pickClarificationLine(pendingQuery, state.question)', /pickClarificationLine\(state\.pendingQuery,\s*state\.question\)/.test(desk), '')

  // Picker behavior.
  for (const mechanical of [
    '你更想找学生做题思路像的，还是文章讲的内容像的？',
    '刚才的搜索：「C 篇」。补一句就会重新搜。',
    '再确认一下：你要哪类？',
    '',
    '   ',
  ]) {
    const out = pickClarificationLine('C 篇', mechanical)
    assert(`mechanical/empty replaced by template ("${mechanical.slice(0, 12)}…")`, /我理解你想找「C 篇」/.test(out), `got: ${out}`)
  }
  for (const natural of [
    '你想要中等难度的科技说明文，还是高难度的抽象推断？',
    '想找按主旨概括出题的，还是按细节理解出题的？',
    '指的是高考真题，还是模拟卷？',
  ]) {
    const out = pickClarificationLine('C 篇', natural)
    assert(`natural input passes through ("${natural.slice(0, 12)}…")`, out === natural, `got: ${out}`)
  }
}

// ------------------------------------------------------------------ Test 14
console.log('\nTest 14: Paper row hover + clickable + 草稿卷 wording in App')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const css = readFileSync(path.resolve(here, '..', 'app', 'src', 'App.css'), 'utf8')
  const app = readFileSync(path.resolve(here, '..', 'app', 'src', 'App.tsx'), 'utf8')

  // Paper row CSS exists with cursor: pointer + soft hover.
  const paperRowRule = css.match(/^\.concierge-paper-row\s*\{[\s\S]*?\}/m)?.[0] || ''
  assert('paper-row uses cursor: pointer', /cursor:\s*pointer/.test(paperRowRule), `got: ${paperRowRule}`)
  assert('paper-row has soft transition (no transform)', /transition:\s*background\s*120ms\s*ease,\s*box-shadow\s*120ms\s*ease/.test(paperRowRule), `got: ${paperRowRule}`)
  const hoverRule = css.match(/\.concierge-paper-row:hover[\s\S]*?\.concierge-paper-row:focus-visible\s*\{[^}]*\}/)?.[0] || ''
  assert('paper-row hover uses warm #F4F2EC', /background:\s*#F4F2EC/i.test(hoverRule), '')

  // 草稿卷 visible copy in App is intact.
  const mentions = app.match(/组题篮/g) || []
  assert('App.tsx still has no user-visible 组题篮', mentions.length === 0, `still found ${mentions.length} occurrence(s)`)
  assert('App.tsx 加入草稿卷 present', /加入草稿卷/.test(app), '')
  // classic-retire-3: the literal aria-label="草稿卷" lived on the classic
  // <aside className="basket-panel"> that was deleted along with the rest
  // of the classic sidebar. The floating basket-chip button (AI mode's
  // surviving draft-paper entry point) carries the same "草稿卷" wording in
  // a template-literal aria-label instead of a static one.
  assert('App.tsx basket-chip aria-label still carries 草稿卷 wording', /aria-label=\{`打开草稿卷/.test(app), '')
}

// ------------------------------------------------------------------ Test 15
console.log('\nTest 15: Avoid sample-data race — ConciergeDesk waits for live bank')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const desk = readFileSync(path.resolve(here, '..', 'app', 'src', 'concierge', 'ConciergeDesk.tsx'), 'utf8')
  const app = readFileSync(path.resolve(here, '..', 'app', 'src', 'App.tsx'), 'utf8')
  const css = readFileSync(path.resolve(here, '..', 'app', 'src', 'App.css'), 'utf8')

  assert('ConciergeDeskProps adds dataStatus prop', /dataStatus\?\s*:\s*['"]loading['"]\s*\|\s*['"]sqlite['"]\s*\|\s*['"]sample['"]/.test(desk), '')
  assert('Desk computes dataLoading from dataStatus', /const dataLoading = dataStatus === ['"]loading['"]/.test(desk), '')
  assert('handleSubmit early-returns while dataLoading', /if \(dataLoading\) return/.test(desk), '')
  assert('submit button disabled when dataLoading', /submitDisabled\s*=\s*dataLoading\s*\|\|/.test(desk), '')
  assert('intent input disabled while dataLoading', /<input[\s\S]{0,400}className="concierge-intent-input"[\s\S]{0,400}disabled=\{dataLoading\}/.test(desk), '')
  assert('placeholder switches to 正在连接本地题库 while loading', /正在连接本地题库/.test(desk), '')
  assert('connecting notice rendered as concierge-data-loading', /<p className="concierge-data-loading"[\s\S]{0,200}role="status"/.test(desk), '')
  assert('App passes dataStatus to ConciergeDesk', /<ConciergeDesk[\s\S]*?dataStatus=\{dataStatus\}/.test(app), '')

  const noticeRule = css.match(/\.concierge-data-loading\s*\{[^}]*\}/)?.[0] || ''
  assert('.concierge-data-loading rule exists', noticeRule.length > 0, '')
  assert('notice uses muted ink #9A9180', /color:\s*#9A9180/i.test(noticeRule), '')
}

// ------------------------------------------------------------------ Test 16
console.log('\nTest 16: 找类似 round-trips through paper aggregation')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const hook = readFileSync(path.resolve(here, '..', 'app', 'src', 'concierge', 'useConciergeDesk.ts'), 'utf8')
  // triggerSimilar must call runSearch (not skip aggregation).
  assert('triggerSimilar uses runSearch', /const triggerSimilar = useCallback[\s\S]{0,600}await runSearch\(similarIntent, null\)/.test(hook), '')
  // paperResults memo derives from state.hits and then swaps in live group
  // card data so C8 draft-button state can update without a new search.
  assert(
    'paperResults memo aggregates live-mapped state.hits',
    /state\.hits\.map/.test(hook) && /latestGroupById\.get\(hit\.group\.id\)/.test(hook) && /aggregatePaperResults\(/.test(hook),
    '',
  )
}

// ------------------------------------------------------------------ Test 18
console.log('\nTest 18: cut ai-key-server-fallback — runSearch dep array + serverKeyAvailable plumbing (MF-2/MF-4)')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const hook = readFileSync(path.resolve(here, '..', 'app', 'src', 'concierge', 'useConciergeDesk.ts'), 'utf8')

  // MF-4: input.thinkingMode was missing from the runSearch useCallback dependency array,
  // producing a stale closure — a thinkingMode toggle between renders would not reach the
  // next runSearch call. Assert it is now present in that exact array.
  const depArrayMatch = hook.match(/\[\s*clearExpansion,[\s\S]*?\]\s*,?\s*\)/)
  assert('runSearch dependency array found', Boolean(depArrayMatch), 'could not locate the runSearch useCallback deps array')
  if (depArrayMatch) {
    assert('runSearch deps include input.thinkingMode (MF-4 stale-closure fix)', /input\.thinkingMode/.test(depArrayMatch[0]), depArrayMatch[0])
    assert('runSearch deps include serverKeyAvailable (MF-2 seam c)', /\bserverKeyAvailable\b/.test(depArrayMatch[0]), depArrayMatch[0])
  }

  // MF-2 seam a: mount-time fetch of AI status lives in the desk (not App-owned).
  assert('hook imports fetchAiStatus', /import\s*\{\s*fetchAiStatus\s*\}\s*from\s*['"]\.\.\/services\/aiStatus\.ts['"]/.test(hook), '')
  assert('hook holds serverKeyAvailable state', /const \[serverKeyAvailable, setServerKeyAvailable\] = useState\(false\)/.test(hook), '')
  assert('hook fetches AI status inside a useEffect on mount', /useEffect\(\(\)\s*=>\s*\{[\s\S]{0,300}fetchStatus\(\)/.test(hook), '')

  // MF-2 seam b: serverKeyAvailable is forwarded into the runConciergeSearch call.
  const searchCallMatch = hook.match(/const outcome: ConciergeSearchOutcome = await search\(\{[\s\S]*?\}\)/)
  assert('runConciergeSearch call site found', Boolean(searchCallMatch), '')
  if (searchCallMatch) {
    assert('runConciergeSearch call forwards serverKeyAvailable', /serverKeyAvailable,/.test(searchCallMatch[0]), searchCallMatch[0])
  }
}

// ------------------------------------------------------------------ Test 19
console.log('\nTest 19: cut a11y-concierge-three-gaps — focus-ring visibility + global reduced-motion reset')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const css = readFileSync(path.resolve(here, '..', 'app', 'src', 'App.css'), 'utf8')
  const paperRow = readFileSync(path.resolve(here, '..', 'app', 'src', 'concierge', 'ConciergePaperRow.tsx'), 'utf8')

  // Anti-regression: no :focus-visible rule in App.css may still carry the
  // near-invisible 0.08 ring alpha (scan every :focus-visible rule body).
  const focusVisibleRules = css.match(/[^\n{}]*:focus-visible[^{]*\{[^}]*\}/g) || []
  assert('found :focus-visible rules to scan', focusVisibleRules.length > 0, '')
  const stillInvisible = focusVisibleRules.filter((rule) => /rgba\(26,\s*26,\s*26,\s*0\.08\)/.test(rule))
  assert('no :focus-visible rule still uses rgba(26, 26, 26, 0.08)', stillInvisible.length === 0, `offending rules: ${JSON.stringify(stillInvisible)}`)

  // Global prefers-reduced-motion reset replaces the old 5-selector block.
  const reducedMotionBlock = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/)?.[0] || ''
  assert('prefers-reduced-motion block exists', reducedMotionBlock.length > 0, '')
  assert('reduced-motion block is the global *, *::before, *::after reset', /\*,\s*\*::before,\s*\*::after/.test(reducedMotionBlock), reducedMotionBlock)
  assert('reduced-motion block sets animation-duration: 0.01ms', /animation-duration:\s*0\.01ms\s*!important/.test(reducedMotionBlock), reducedMotionBlock)
  assert('old 5-selector reduced-motion block is gone', !/\.concierge-skeleton-line\s*\{\s*animation:\s*none/.test(css), '')

  // Keyboard-equivalent path contract: the expand button must keep aria-expanded.
  const expandButtonMatch = paperRow.match(/className=\{`concierge-row-expand[\s\S]*?<\/button>/)
  assert('concierge-row-expand button found in ConciergePaperRow.tsx', Boolean(expandButtonMatch), '')
  if (expandButtonMatch) {
    assert('concierge-row-expand button retains aria-expanded', /aria-expanded=\{expanded\}/.test(expandButtonMatch[0]), expandButtonMatch[0])
  }
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
