#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createSentenceAnalysisStore } from '../server/paper-sentence-analysis/analysisStore.mjs'
import { PROMPT_EXAMPLES } from '../server/paper-sentence-analysis/prompt.mjs'
import { compileModelReply, createPaperSentenceAnalysisRuntime } from '../server/paper-sentence-analysis/runtime.mjs'
import { spansToAuthoring } from '../server/paper-sentence-analysis/spans.mjs'
import { unitBubble } from '../shared/sentence-analysis/derive.mjs'
import { analysisSentences } from '../shared/sentence-analysis/resolveTarget.mjs'
import { restoreDisplay } from '../shared/sentence-analysis/restore.mjs'
import { tokenizeSentence } from '../shared/sentence-analysis/tokenize.mjs'

function promptExample(prefix) {
  const example = PROMPT_EXAMPLES.find(item => item.sentence.startsWith(prefix))
  if (!example) throw new Error(`Missing prompt example: ${prefix}`)
  return example
}

function restoreString(sentence, restore) {
  return restoreDisplay(sentence, tokenizeSentence(sentence), restore.segments)
    .map((segment) => `${segment.spaceBefore ? ' ' : ''}${segment.inserted ? `[${segment.text}]` : segment.text}`)
    .join('')
}

let passed = 0
let failed = 0
function check(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

const SENTENCE = 'She enjoys reading novels.'
const TEXT = `${SENTENCE} It helps.`
const source = {
  paperId: 'paper-a',
  sourceRevision: 'r1',
  streams: [{ streamId: 's1', role: 'passage-body', text: TEXT }],
}
const body = { paperId: 'paper-a', sourceRevision: 'r1', streamId: 's1', start: 0, end: SENTENCE.length, sentenceText: SENTENCE }
const good = {
  translationZh: '她喜欢读小说。',
  spans: [
    { text: 'She', role: 'subject', zh: '她' },
    { text: 'enjoys', role: 'predicate', zh: '喜欢' },
    { text: 'reading novels', role: 'object', form: 'gerund', zh: '读小说', extra: 'dropped' },
    { text: 'reading', role: 'nonfinite-verb' },
  ],
}
const broken = { units: [] }
const partlyBad = { ...good, spans: [...good.spans, { text: 'not in the sentence', role: 'object' }] }

function reply(content) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 })
}

function runtimeWith(replies, extra = {}) {
  const calls = []
  let used = 0
  const runtime = createPaperSentenceAnalysisRuntime({
    loadSource: () => source,
    env: { DEEPSEEK_API_KEY: 'test-key', ...extra.env },
    fetchImpl: async (url, init) => {
      calls.push(JSON.parse(init.body))
      const next = replies[Math.min(calls.length - 1, replies.length - 1)]
      return typeof next === 'function' ? next() : reply(next)
    },
    dailyLimitCounter: {
      isExceeded: () => used >= (extra.budget ?? Infinity),
      increment: () => { used += 1 },
    },
  })
  return { runtime, calls, used: () => used }
}

function run(runtime, overrides = {}) {
  return runtime.analyze({ body: { ...body, ...overrides }, context: {}, userId: 'u1', signal: new AbortController().signal })
}

async function rejects(promise) {
  try {
    await promise
    return null
  } catch (error) {
    return error
  }
}

{
  const { runtime, calls } = runtimeWith([good])
  const first = await run(runtime)
  check('a model reply compiles into a validated analysis', first.analysis.status === 'ok' && first.analysis.units.length === 5)
  check('the producer records the model', first.analysis.producer.kind === 'model' && first.analysis.producer.id === 'deepseek-flash', JSON.stringify(first.analysis.producer))
  check('the source is the server-resolved target', first.analysis.source.streamId === 's1' && first.analysis.source.end === SENTENCE.length)
  check('the request uses the flash model with JSON output', calls[0].model === 'deepseek-flash' && calls[0].response_format?.type === 'json_object')
  const second = await run(runtime)
  check('a repeated sentence is served from cache', second.cached === true && calls.length === 1)
  check('the first sentence of a stream is sent without context', calls[0].messages[1].content === `句子：${SENTENCE}`, calls[0].messages[1].content)
}

{
  const dataDir = mkdtempSync(path.join(tmpdir(), 'eqb-sa-store-'))
  const env = { QUESTION_BANK_SENTENCE_ANALYSIS_DATA_DIR: dataDir }
  try {
    const first = runtimeWith([good], { env })
    await run(first.runtime)
    first.runtime.close()
    const restarted = runtimeWith([good], { env })
    const again = await run(restarted.runtime)
    check('a stored analysis survives a restart without another model call', again.cached === true && restarted.calls.length === 0 && again.analysis.units.length === 5)
    check('a restored analysis keeps the server-resolved source', again.analysis.source.end === SENTENCE.length)
    restarted.runtime.close()

    const db = new DatabaseSync(path.join(dataDir, 'sentence-analysis.sqlite'))
    const row = db.prepare('SELECT model, prompt_version, sentence_text, lenient, attempts, reply FROM sentence_analysis_replies').get()
    check('the store keeps the raw reply with its model and prompt version', row?.model === 'deepseek-flash' && row.prompt_version && row.sentence_text === SENTENCE && row.attempts === 1 && JSON.parse(row.reply).spans.length === 4, JSON.stringify(row))
    db.prepare('UPDATE sentence_analysis_replies SET reply = ?').run(JSON.stringify(broken))
    db.close()
    const stale = runtimeWith([good], { env })
    const refreshed = await run(stale.runtime)
    check('a stored reply the converter now rejects is asked again', refreshed.cached === false && stale.calls.length === 1 && refreshed.analysis.status === 'ok')
    stale.runtime.close()
    const fixed = runtimeWith([good], { env })
    const reread = await run(fixed.runtime)
    check('the fresh reply replaces the rejected one', reread.cached === true && fixed.calls.length === 0)
    fixed.runtime.close()
  } finally {
    rmSync(dataDir, { recursive: true, force: true })
  }
}

{
  const dataDir = mkdtempSync(path.join(tmpdir(), 'eqb-sa-store-'))
  const env = { QUESTION_BANK_SENTENCE_ANALYSIS_DATA_DIR: dataDir }
  try {
    const first = runtimeWith([partlyBad, partlyBad], { env })
    await run(first.runtime)
    first.runtime.close()
    const restarted = runtimeWith([good], { env })
    const again = await run(restarted.runtime)
    check('a lenient reply is recompiled leniently after a restart', again.cached === true && restarted.calls.length === 0 && again.analysis.units.length === 5)
    restarted.runtime.close()
  } finally {
    rmSync(dataDir, { recursive: true, force: true })
  }
}

{
  const blocker = path.join(mkdtempSync(path.join(tmpdir(), 'eqb-sa-store-')), 'not-a-dir')
  writeFileSync(blocker, 'x')
  const { runtime, calls } = runtimeWith([good], { env: { QUESTION_BANK_SENTENCE_ANALYSIS_DATA_DIR: path.join(blocker, 'nested') } })
  const result = await run(runtime)
  const second = await run(runtime)
  check('an unavailable store falls back to memory and the model', result.analysis.status === 'ok' && second.cached === true && calls.length === 1)
  rmSync(path.dirname(blocker), { recursive: true, force: true })
}

{
  const dataDir = mkdtempSync(path.join(tmpdir(), 'eqb-sa-store-'))
  let tick = 0
  const store = createSentenceAnalysisStore({ filePath: path.join(dataDir, 'cap.sqlite'), maxEntries: 3, now: () => ++tick * 1000 })
  const entry = { model: 'm', promptVersion: 'v', sentenceText: 's', contextText: '', reply: '{}', lenient: false, attempts: 1 }
  for (const key of ['k0', 'k1', 'k2']) store.set(key, entry)
  store.get('k0')
  store.set('k3', entry)
  check('the store evicts the least recently read reply past its cap', store.stats().entries === 3 && store.get('k1') === null && store.get('k0') !== null)
  store.close()
  rmSync(dataDir, { recursive: true, force: true })
}

{
  const next = { translationZh: '这有帮助。', spans: [{ text: 'It', role: 'subject' }, { text: 'helps', role: 'predicate' }] }
  const { runtime, calls } = runtimeWith([broken, next])
  const start = SENTENCE.length + 1
  const result = await run(runtime, { start, end: TEXT.length, sentenceText: 'It helps.' })
  const expected = `上文（只帮助理解省略和指代，不要分析）：${SENTENCE}\n句子：It helps.`
  check('a later sentence is sent with the previous sentence as context', result.analysis.status === 'ok' && calls[0].messages[1].content === expected, calls[0].messages[1].content)
  check('the repair retry keeps the same context', calls[1].messages[1].content === expected)
}

{
  const { runtime, calls, used } = runtimeWith([broken, good])
  const result = await run(runtime)
  check('an invalid reply gets one repair retry', result.analysis.status === 'ok' && calls.length === 2 && used() === 2)
}

{
  const { runtime, calls } = runtimeWith([partlyBad, partlyBad])
  const result = await run(runtime)
  check('a retry that is still partly wrong keeps the valid spans', result.analysis.status === 'ok' && result.analysis.units.length === 5 && calls.length === 2)
}

{
  const { runtime, calls } = runtimeWith([broken])
  const error = await rejects(run(runtime))
  check('two invalid replies fail as SENTENCE_ANALYSIS_INVALID', error?.code === 'SENTENCE_ANALYSIS_INVALID' && error.status === 502 && calls.length === 2, error?.code)
}

{
  const { runtime, calls } = runtimeWith([good])
  const mismatch = await rejects(run(runtime, { sentenceText: 'She enjoys reading.' }))
  check('a client sentence that does not match the paper is refused', mismatch?.code === 'SELECTION_SOURCE_MISMATCH')
  const revision = await rejects(run(runtime, { sourceRevision: 'r0' }))
  check('a stale source revision is refused', revision?.code === 'SELECTION_SOURCE_MISMATCH')
  const extraField = await rejects(runtime.analyze({ body: { ...body, prompt: 'x' }, context: {}, userId: 'u1', signal: new AbortController().signal }))
  check('unknown request fields are refused', extraField?.code === 'SENTENCE_ANALYSIS_REQUEST_INVALID')
  const crossing = await rejects(run(runtime, { end: TEXT.length, sentenceText: TEXT }))
  check('a selection spanning two sentences is refused', Boolean(crossing) && crossing.status >= 400 && crossing.status < 500, crossing?.code)
  check('refused requests never reach the model', calls.length === 0)
}

{
  const bulleted = 'Intro line. ● Each item stays available. Next item.'
  const item = 'Each item stays available.'
  const bulletedSource = { ...source, streams: [{ streamId: 's1', role: 'passage-body', text: bulleted }] }
  const bulletedBody = { ...body, start: bulleted.indexOf('Each'), end: bulleted.indexOf('Each') + item.length, sentenceText: item }
  const bulletedGood = { translationZh: '每一项都仍然可用。', spans: [{ text: 'Each item', role: 'subject' }, { text: 'stays', role: 'predicate' }, { text: 'available', role: 'predicative' }] }
  {
    const bound = createPaperSentenceAnalysisRuntime({ loadSource: () => bulletedSource, env: { DEEPSEEK_API_KEY: 'k' }, fetchImpl: async () => reply(bulletedGood) })
    const result = await bound.analyze({ body: bulletedBody, context: {}, userId: 'u1', signal: new AbortController().signal })
    check('a bullet marker is excluded from the sentence target', result.analysis.status === 'ok' && result.analysis.source.sentenceText === item && result.analysis.source.start === bulletedBody.start, JSON.stringify(result.analysis.source))
  }
  {
    const bound = createPaperSentenceAnalysisRuntime({ loadSource: () => bulletedSource, env: { DEEPSEEK_API_KEY: 'k' }, fetchImpl: async () => reply(bulletedGood) })
    const error = await rejects(bound.analyze({ body: { ...bulletedBody, start: bulleted.indexOf('●'), end: bulletedBody.end, sentenceText: `● ${item}` }, context: {}, userId: 'u1', signal: new AbortController().signal }))
    check('a sentence that still carries the bullet marker is refused', error?.code === 'SELECTION_SOURCE_MISMATCH', error?.code)
  }
  const numbered = '1. Teams register online. 2. Judges confirm the list.'
  const numberedSource = { ...source, streams: [{ streamId: 's1', role: 'passage-body', text: numbered }] }
  const numberedBody = { ...body, start: numbered.indexOf('Teams'), end: numbered.indexOf('Teams') + 'Teams register online.'.length, sentenceText: 'Teams register online.' }
  const numberedBound = createPaperSentenceAnalysisRuntime({ loadSource: () => numberedSource, env: { DEEPSEEK_API_KEY: 'k' }, fetchImpl: async () => reply({ translationZh: '队伍在线报名。', spans: [{ text: 'Teams', role: 'subject' }, { text: 'register', role: 'predicate' }, { text: 'online', role: 'adverbial' }] }) })
  const numberedResult = await numberedBound.analyze({ body: numberedBody, context: {}, userId: 'u1', signal: new AbortController().signal })
  check('a numbered list marker is excluded from the sentence target', numberedResult.analysis.status === 'ok' && numberedResult.analysis.source.sentenceText === 'Teams register online.', JSON.stringify(numberedResult.analysis.source))
  const split = (text) => analysisSentences(text).map((sentence) => sentence.text.trim())
  check('initials stay inside their sentence', JSON.stringify(split('Intro line.\nA. Lee wrote it. I read J. K. Rowling today. John F. Kennedy spoke.'))
    === JSON.stringify(['Intro line.', 'A. Lee wrote it.', 'I read J. K. Rowling today.', 'John F. Kennedy spoke.']), JSON.stringify(split('Intro line.\nA. Lee wrote it. I read J. K. Rowling today. John F. Kennedy spoke.')))
  check('a capital letter after a lowercase word still ends the sentence', JSON.stringify(split('We chose plan B. The rest failed. Neither did I. Then we left.'))
    === JSON.stringify(['We chose plan B.', 'The rest failed.', 'Neither did I.', 'Then we left.']))
}

{
  const { runtime, calls } = runtimeWith([good], { budget: 0 })
  const error = await rejects(run(runtime))
  check('an exhausted daily budget stops before the model', error?.code === 'SENTENCE_ANALYSIS_BUDGET_EXHAUSTED' && calls.length === 0)
}

{
  const { runtime } = runtimeWith([() => new Response('nope', { status: 401 })])
  const error = await rejects(run(runtime))
  check('an upstream auth failure surfaces as unavailable', error?.code === 'SENTENCE_ANALYSIS_UPSTREAM_ERROR' && error.status === 503)
}

{
  const runtime = createPaperSentenceAnalysisRuntime({ loadSource: () => source, env: {} })
  const error = await rejects(run(runtime))
  check('a missing key reports not configured', error?.code === 'SENTENCE_ANALYSIS_UNAVAILABLE' && error.status === 503)
  const enforced = await rejects(runtime.analyze({ body, context: { authMode: 'enforced' }, userId: null, signal: new AbortController().signal }))
  check('enforced auth requires a session', enforced?.status === 401)
}

function quoteOf(authoring, id) {
  return authoring.units.find((unit) => unit.id === id)?.quote
}

function relationQuotes(authoring, kind) {
  return authoring.relations.filter((item) => item.kind === kind).map((item) => `${quoteOf(authoring, item.from)}>${item.to.map((id) => quoteOf(authoring, id))}`)
}

{
  const failures = []
  for (const example of PROMPT_EXAMPLES) {
    try {
      compileModelReply(JSON.stringify(example.reply), example.sentence, 'm')
    } catch (error) {
      failures.push(`${example.sentence}: ${error.message}`)
    }
  }
  check('every prompt example compiles into a valid analysis', failures.length === 0, failures.join('\n  '))
}

{
  const examples = ['The bridge that', 'Tired after', 'Never had', 'It is widely believed'].map(promptExample)
  const [bridge, players, never, belief] = examples.map(example => spansToAuthoring(example.reply, example.sentence))
  const clause = bridge.units.find((unit) => unit.quote === 'that the villagers built last spring')
  const built = bridge.units.find((unit) => unit.quote === 'built')
  check('a clause member takes the clause as layer and parent', built.layer === clause.id && built.parent === clause.id && clause.layer === 'c0')
  const head = bridge.units.find((unit) => unit.quote === 'bridge')
  check('a head word becomes a head unit inside its phrase', head?.role === 'head' && head.parent === bridge.units.find((unit) => unit.role === 'subject' && unit.layer === 'c0').id)
  check('relative clauses modify the head and their pronoun refers to it', relationQuotes(bridge, 'modifies').includes('that the villagers built last spring>bridge') && relationQuotes(bridge, 'refers-to').includes('that>bridge') && relationQuotes(bridge, 'refers-to').includes('which>bridge'), JSON.stringify(bridge.relations))
  check('a relative pronoun keeps its clause role', bridge.units.find((unit) => unit.quote === 'which').role === 'subject' && relationQuotes(bridge, 'subject-predicate').includes('which>cost'))
  check('subject and predicate pair within each layer', relationQuotes(players, 'subject-predicate').join('|') === 'the players>agreed|the rain>stopped', JSON.stringify(relationQuotes(players, 'subject-predicate')))
  check('a participle adverbial modifies the predicate and names its logical subject', relationQuotes(players, 'modifies').includes('Tired after the long match>agreed') && relationQuotes(players, 'logical-subject').includes('Tired after the long match>the players'))
  check('an adverbial inside a non-finite phrase modifies its verb', relationQuotes(players, 'modifies').includes('until the rain stopped>stay'))
  check('coordinate main clauses become separate roots', never.roots.join(',') === 'c0,c1' && never.units.find((unit) => unit.quote === 'and').parent === null)
  const split = never.units.filter((unit) => unit.role === 'predicate').map((unit) => JSON.stringify(unit.quote))
  check('split predicates merge into one multi-piece unit', split.join('|') === '["had","seen"]|["put","away"]', split.join('|'))
  check('a repeated word resolves by reading order', never.units.filter((unit) => unit.quote === 'she').map((unit) => `${unit.parent}:${unit.occurrence}`).join('|') === 'c0:1|c1:2')
  check('fronting keeps a normal-order restore', never.restores.some((item) => item.kind === 'normal-order' && restoreString(examples[2].sentence, item) === 'she had never seen such a crowd'), JSON.stringify(never.restores))
  check('ellipsis keeps an ellipsis restore', belief.restores.some((item) => item.kind === 'ellipsis' && item.segments.some((segment) => segment.text === 'it is')), JSON.stringify(belief.restores))
}

{
  const sentence = 'Tom said that the plan, which nobody liked, failed.'
  const overlap = { spans: [{ text: 'said that the plan', role: 'predicate' }, { text: 'the plan, which nobody liked', role: 'subject' }] }
  let strict = null
  try {
    spansToAuthoring(overlap, sentence)
  } catch (error) {
    strict = error
  }
  check('partly overlapping spans are rejected in strict mode', strict?.code === 'FIXTURE_COMPILE' && /partly overlaps/.test(strict.message), strict?.message)
  const lenient = spansToAuthoring(overlap, sentence, { lenient: true })
  check('lenient mode drops the overlapping span and reports it', lenient.units.length === 2 && lenient.dropped.some((problem) => /partly overlaps/.test(problem)))
  const curly = spansToAuthoring({ spans: [{ text: "don't", role: 'predicate' }] }, 'I don’t know.', { lenient: true })
  check('straight quotes in a span match curly quotes in the sentence', curly.units[1]?.quote === 'don’t')
  const bracket = spansToAuthoring({ spans: [{ text: 'known as mycelium (菌丝体)', role: 'attributive', form: 'past-participle' }] }, 'It is known as mycelium (菌丝体), a network.', { lenient: true })
  check('a closing bracket stays when its opener is inside the span', bracket.units[1]?.quote === 'known as mycelium (菌丝体)', bracket.units[1]?.quote)
  const shared = spansToAuthoring({
    spans: [
      { text: 'a network known as mycelium', role: 'object' },
      { text: 'known as mycelium', role: 'attributive', form: 'past-participle', head: 'network' },
      { text: 'which sends signals', role: 'attributive', form: 'clause', head: 'network' },
    ],
  }, 'Mushrooms contain a network known as mycelium, which sends signals.', { lenient: true })
  check('two modifiers of one word share one head unit', shared.units.filter((unit) => unit.role === 'head').length === 1 && relationQuotes(shared, 'modifies').length === 2)
}

{
  const inverted = spansToAuthoring({
    spans: [
      { text: 'did', role: 'predicate', obstacle: 'inversion' },
      { text: 'she', role: 'subject' },
      { text: 'realize', role: 'predicate' },
      { text: 'the truth', role: 'object' },
    ],
  }, 'Only then did she realize the truth.')
  const predicates = inverted.units.filter((unit) => unit.role === 'predicate')
  check('an inverted auxiliary merges with its main verb', predicates.length === 1 && JSON.stringify(predicates[0].quote) === '["did","realize"]' && predicates[0].obstacles.includes('partial-inversion'), JSON.stringify(predicates))
  const coordinated = spansToAuthoring({
    spans: [
      { text: 'He', role: 'subject' },
      { text: 'had', role: 'predicate' },
      { text: 'a dog', role: 'object' },
      { text: 'walked', role: 'predicate' },
    ],
  }, 'He had a dog and walked it.')
  check('coordinated predicates stay separate', coordinated.units.filter((unit) => unit.role === 'predicate').length === 2)
  const lone = spansToAuthoring({
    spans: [
      { text: 'Hardly had the train left', role: 'main', form: 'clause' },
      { text: 'when it began to rain', role: 'adverbial', form: 'clause', sense: 'time' },
    ],
  }, 'Hardly had the train left when it began to rain.', { lenient: true })
  check('a single main span does not split the sentence root', lone.roots.join(',') === 'c0' && lone.units.find((unit) => unit.form === 'clause' && unit.role === 'adverbial')?.layer === 'c0')
}

{
  const quoteOfRoot = (authoring, index) => authoring.units.find((unit) => unit.id === authoring.roots[index])?.quote
  const semicolon = spansToAuthoring({
    spans: [
      { text: 'Fans', role: 'subject' },
      { text: 'tend', role: 'predicate' },
      { text: 'gone are the days', role: 'main', form: 'clause' },
      { text: 'are', role: 'predicate' },
      { text: 'the days', role: 'subject' },
    ],
  }, 'Fans tend to sit; gone are the days.')
  check('the unmarked first main clause before a semicolon is filled in', semicolon.roots.length === 2 && quoteOfRoot(semicolon, 0) === 'Fans tend to sit' && quoteOfRoot(semicolon, 1) === 'gone are the days', JSON.stringify(semicolon.roots.map((_, index) => quoteOfRoot(semicolon, index))))
  const joined = spansToAuthoring({
    spans: [
      { text: 'He', role: 'subject' },
      { text: 'told', role: 'predicate' },
      { text: 'me', role: 'object' },
      { text: 'but', role: 'connector', connector: 'coordinator' },
      { text: 'it would be late', role: 'main', form: 'clause' },
      { text: 'it', role: 'subject' },
      { text: 'would be', role: 'predicate' },
      { text: 'late', role: 'predicative' },
    ],
  }, 'He told me, but it would be late.')
  check('the filled-in clause stops before the coordinator', quoteOfRoot(joined, 0) === 'He told me' && joined.units.some((unit) => unit.quote === 'but' && !unit.layer), JSON.stringify(joined.roots.map((_, index) => quoteOfRoot(joined, index))))
  const reporting = strictProblem({
    spans: [
      { text: 'Neither will they stop', role: 'main', form: 'clause' },
      { text: 'will', role: 'predicate' },
      { text: 'they', role: 'subject' },
      { text: 'stop', role: 'predicate' },
      { text: 'said', role: 'predicate' },
      { text: 'Ann', role: 'subject' },
    ],
  }, 'Neither will they stop, said Ann.')
  const commaSplit = spansToAuthoring({
    spans: [
      { text: 'it', role: 'subject' },
      { text: 'is', role: 'predicate' },
      { text: 'says', role: 'predicate', obstacle: 'inversion' },
      { text: 'Ann', role: 'subject' },
    ],
  }, 'And at first it is, says Ann.')
  check('an auxiliary and a verb across a comma stay two predicates', commaSplit.units.filter((unit) => unit.role === 'predicate').map((unit) => unit.quote).join('|') === 'is|says', JSON.stringify(commaSplit.units))
  const reported = spansToAuthoring({
    spans: [
      { text: 'Neither', role: 'adverbial', obstacle: 'fronting' },
      { text: 'will', role: 'predicate', obstacle: ['inversion', 'split'] },
      { text: 'they', role: 'subject' },
      { text: 'stop', role: 'predicate', obstacle: 'split' },
      { text: 'said', role: 'predicate', obstacle: 'inversion' },
      { text: 'Ann', role: 'subject' },
    ],
  }, 'Neither will they stop, said Ann.')
  const inversionOf = (quote) => reported.units.find((unit) => [unit.quote].flat().join(' … ') === quote)?.obstacles.find((item) => item.endsWith('inversion'))
  check('a trailing reporting verb is full inversion even after a partly inverted predicate', inversionOf('said') === 'full-inversion' && inversionOf('will … stop') === 'partial-inversion', JSON.stringify(reported.units.map((unit) => [unit.quote, unit.obstacles])))
  const onlyCleft = spansToAuthoring({
    spans: [
      { text: 'when I left', role: 'adverbial', form: 'clause', sense: 'time', obstacle: 'cleft', restore: 'I knew only when I left' },
      { text: 'when', role: 'connector', connector: 'subordinator' },
      { text: 'I', role: 'subject' },
      { text: 'left', role: 'predicate' },
      { text: 'I', role: 'subject', occurrence: 2 },
      { text: 'knew', role: 'predicate' },
    ],
  }, 'It was only when I left that I knew.')
  check('a cleft frame still forms when the model leaves out the focusing only', onlyCleft.units.some((unit) => unit.role === 'cleft-frame') && onlyCleft.units.find((unit) => unit.role === 'adverbial')?.quote === 'only when I left', JSON.stringify(onlyCleft.units.map((unit) => [unit.role, unit.quote])))
  check('a trailing reporting clause is not filled in as another main clause', /covers only one of multiple main clauses/.test(reporting || ''), reporting)
}

{
  const expanded = spansToAuthoring({
    spans: [
      { text: 'he', role: 'subject' },
      { text: 'is', role: 'predicate' },
      { text: 'while I am a short boy who can barely dribble the ball', role: 'adverbial', form: 'clause', sense: 'contrast' },
      { text: 'while', role: 'connector', connector: 'subordinator' },
      { text: 'I', role: 'subject' },
      { text: 'am', role: 'predicate' },
      { text: 'a short boy who can barely dribble the ball', role: 'predicative' },
      { text: 'who can barely dribble the ball', role: 'attributive', form: 'clause', head: 'boy' },
      { text: 'who', role: 'connector', connector: 'relative-pronoun', serves: 'subject' },
      { text: 'can barely dribble', role: 'predicate' },
      { text: 'the ball', role: 'object' },
    ],
  }, 'he’s a tall icon, while I’m a short boy who can barely dribble（运球）the ball.')
  check('an expanded contraction matches the clitic in the sentence', expanded.units.filter((unit) => unit.role === 'predicate').map((unit) => unit.quote).join('|') === '’s|’m|can barely dribble', JSON.stringify(expanded.units.map((unit) => unit.quote)))
  check('a span may skip a Chinese gloss in brackets', expanded.units.find((unit) => unit.role === 'attributive')?.quote === 'who can barely dribble（运球）the ball')

  const counted = spansToAuthoring({
    spans: [
      { text: 'She', role: 'subject' },
      { text: 'left', role: 'predicate' },
      { text: 'a note which she had written', role: 'object' },
      { text: 'which she had written', role: 'attributive', form: 'clause', head: 'note' },
      { text: 'which', role: 'connector', connector: 'relative-pronoun', serves: 'object' },
      { text: 'she', role: 'subject', occurrence: 3 },
      { text: 'had written', role: 'predicate' },
    ],
  }, 'She left a note which she had written.')
  const pricey = spansToAuthoring({
    spans: [
      { text: 'Rome', role: 'subject' },
      { text: 'can be pricey', role: 'predicative' },
      { text: 'which is why many stay', role: 'attributive', form: 'clause', head: 'Rome' },
      { text: 'which', role: 'connector', connector: 'relative-pronoun', serves: 'subject' },
      { text: 'is', role: 'predicate' },
      { text: 'why many stay', role: 'predicative', form: 'clause' },
      { text: 'why', role: 'connector', connector: 'relative-adverb' },
      { text: 'many', role: 'subject' },
      { text: 'stay', role: 'predicate' },
    ],
  }, 'Rome can be pricey, which is why many stay.')
  check('a predicative that starts with the verb group gives that group to the predicate', pricey.units.filter((unit) => unit.parent === 'c0' && ['predicate', 'predicative'].includes(unit.role)).map((unit) => `${unit.role}:${unit.quote}`).join('|') === 'predicate:can be|predicative:pricey', JSON.stringify(pricey.units))

  const which = counted.units.find((unit) => unit.role === 'attributive')
  check('a miscounted occurrence falls back to reading order', counted.units.find((unit) => unit.quote === 'she')?.parent === which?.id, JSON.stringify(counted.units))

  const contracted = strictProblem({
    spans: [
      { text: 'Never had she seen it', role: 'main', form: 'clause', obstacle: 'fronting', restore: 'she had not ever seen it' },
      { text: 'had', role: 'predicate' },
      { text: 'she', role: 'subject' },
      { text: 'seen', role: 'predicate' },
    ],
  }, 'Never had she seen it, and it’s gone.')
  check('a restore may spell out a contraction from the sentence', !/"is" is not in the sentence/.test(contracted || ''), contracted)
}

function strictProblem(reply, sentence) {
  try {
    spansToAuthoring(reply, sentence)
    return null
  } catch (error) {
    return error.message
  }
}

{
  const twins = spansToAuthoring({
    spans: [
      { text: 'the tradition', role: 'subject' },
      { text: 'that began with Socrates', role: 'attributive', form: 'clause', head: 'tradition' },
      { text: 'that', role: 'subject' },
      { text: 'that', role: 'connector', connector: 'relative-pronoun' },
      { text: 'began', role: 'predicate' },
      { text: 'will not end', role: 'predicate' },
    ],
  }, 'The tradition that began with Socrates will not end.')
  const that = twins.units.filter((unit) => unit.quote === 'that')
  check('a relative pronoun given twice becomes one connector unit', that.length === 1 && that[0].connector === 'relative-pronoun' && that[0].role === 'subject', JSON.stringify(that))

  const core = spansToAuthoring({
    spans: [
      { text: 'It', role: 'subject' },
      { text: 'talks about', role: 'predicate' },
      { text: 'a road trip from Tashkent to Nukus', role: 'object' },
      { text: 'a road trip', role: 'object' },
      { text: 'from Tashkent to Nukus', role: 'attributive', form: 'prepositional', head: 'trip' },
    ],
  }, 'It talks about a road trip from Tashkent to Nukus.')
  check('an object inside an object of the same layer is dropped', core.units.filter((unit) => unit.role === 'object').map((unit) => unit.quote).join('|') === 'a road trip from Tashkent to Nukus')

  const fact = spansToAuthoring({
    spans: [
      { text: 'Most money', role: 'subject' },
      { text: 'goes', role: 'predicate' },
      { text: 'to the fund', role: 'adverbial', form: 'prepositional' },
      { text: 'a fact that ensures the land is protected', role: 'appositive', form: 'clause', head: 'fact' },
      { text: 'that ensures the land is protected', role: 'attributive', form: 'clause', head: 'fact' },
      { text: 'that', role: 'connector', connector: 'relative-pronoun', serves: 'subject' },
      { text: 'ensures', role: 'predicate' },
      { text: 'the land is protected', role: 'object', form: 'clause' },
      { text: 'the land', role: 'subject' },
      { text: 'is protected', role: 'predicate' },
    ],
  }, 'Most money goes to the fund – a fact that ensures the land is protected.')
  const appositive = fact.units.find((unit) => unit.role === 'appositive')
  check('a clause whose only predicate is inside a nested clause becomes a phrase', appositive.form === 'phrase', appositive.form)
  check('a unit never modifies a word inside itself', !fact.relations.some((relation) => relation.from === appositive.id), JSON.stringify(fact.relations))

  const cleft = spansToAuthoring({
    spans: [
      { text: 'It', role: 'subject' },
      { text: 'suggests', role: 'predicate' },
      { text: 'that it was beauty that helped', role: 'object', form: 'clause' },
      { text: 'that', role: 'connector', connector: 'subordinator' },
      { text: 'it was beauty that helped', role: 'object', form: 'clause', obstacle: 'cleft', restore: 'beauty helped' },
      { text: 'beauty', role: 'subject' },
      { text: 'helped', role: 'predicate' },
    ],
  }, 'It suggests that it was beauty that helped.')
  const objects = cleft.units.filter((unit) => unit.role === 'object')
  check('a clause wrapped around the same clause without its connector becomes one clause', objects.length === 1 && objects[0].form === 'clause' && objects[0].obstacles?.includes('cleft') && cleft.restores[0]?.unit === objects[0].id, JSON.stringify(objects))

  const says = spansToAuthoring({
    spans: [
      { text: 'it is', role: 'main', form: 'clause' },
      { text: 'it', role: 'subject' },
      { text: 'is', role: 'predicate' },
      { text: 'says Abby', role: 'main', form: 'clause' },
      { text: 'says', role: 'predicate' },
      { text: 'Abby', role: 'subject' },
      { text: 'who started a garden', role: 'attributive', form: 'clause', head: 'Abby' },
      { text: 'who', role: 'connector', connector: 'relative-pronoun', serves: 'subject' },
      { text: 'started', role: 'predicate' },
      { text: 'a garden', role: 'object' },
    ],
  }, 'And it is, says Abby, who started a garden.')
  const who = says.units.find((unit) => unit.role === 'attributive')
  check('a clause after the last main span joins that main clause', who.layer === 'c1' && who.parent === 'c1' && says.units.find((unit) => unit.id === 'c1').quote === 'says Abby, who started a garden', JSON.stringify(who))
}

{
  const missing = strictProblem({ spans: [{ text: 'She', role: 'subject' }, { text: 'thinks', role: 'predicate' }, { text: 'that it works', role: 'object', form: 'clause' }, { text: 'works', role: 'predicate' }] }, 'She thinks that it works.')
  check('a clause without a subject is sent back', /clause "that it works" has no subject/.test(missing || ''), missing)
  const verbless = strictProblem({ spans: [{ text: 'Hence', role: 'adverbial' }, { text: 'this book', role: 'subject' }] }, 'Hence this book.')
  check('a main clause without a predicate is sent back with the ellipsis hint', /has no predicate/.test(verbless || '') && /obstacle "ellipsis"/.test(verbless || ''), verbless)
  const elided = strictProblem({
    spans: [
      { text: 'Hence this book', role: 'main', form: 'clause', obstacle: 'ellipsis', restore: 'Hence [came] this book' },
      { text: 'Hence', role: 'adverbial' },
      { text: 'this book', role: 'subject' },
    ],
  }, 'Hence this book.')
  check('an ellipsis on the main clause excuses the missing predicate', elided === null, elided)
  const imperative = strictProblem({ spans: [{ text: 'Please', role: 'adverbial' }, { text: 'imagine', role: 'predicate' }, { text: 'a world', role: 'object' }] }, 'Please imagine a world.')
  check('an imperative needs no subject', imperative === null, imperative)
  const negative = strictProblem({ spans: [{ text: 'Please', role: 'adverbial' }, { text: 'touch', role: 'predicate' }, { text: 'the paintings', role: 'object' }] }, 'Please don’t touch the paintings.')
  check('a negative imperative needs no subject', negative === null, negative)
  const stillMissing = strictProblem({ spans: [{ text: 'touch', role: 'predicate' }, { text: 'the paintings', role: 'object' }] }, 'Kids touch the paintings.')
  check('an unlabeled word before the verb is not an imperative', /has no subject/.test(stillMissing || ''), stillMissing)
  const eggs = strictProblem({
    spans: [
      { text: 'Don’t put all your eggs in one basket', role: 'main', form: 'clause' },
      { text: 'put', role: 'predicate' },
      { text: 'all your eggs', role: 'object' },
      { text: 'in one basket', role: 'adverbial', form: 'prepositional', sense: 'place', head: 'put' },
      { text: 'when you plan your future', role: 'adverbial', form: 'clause', sense: 'time' },
      { text: 'when', role: 'connector', connector: 'subordinator' },
      { text: 'you', role: 'subject' },
      { text: 'plan', role: 'predicate' },
      { text: 'your future', role: 'object' },
    ],
  }, 'Don’t put all your eggs in one basket when you plan your future.')
  check('a lone main span beside a subordinate clause is not a split main clause', eggs === null, eggs)
  const weeks = compileModelReply(JSON.stringify({
    spans: [
      { text: 'It', role: 'subject' },
      { text: 'closes', role: 'predicate' },
      { text: 'two weeks before the race begins', role: 'adverbial', form: 'prepositional', sense: 'time' },
      { text: 'before the race begins', role: 'attributive', form: 'clause', head: 'weeks' },
      { text: 'before', role: 'connector', connector: 'subordinator' },
      { text: 'the race', role: 'subject' },
      { text: 'begins', role: 'predicate' },
    ],
  }), 'It closes two weeks before the race begins.', 'test-model')
  const beforeClause = weeks.units.find((unit) => unit.form === 'clause' && unit.spans?.[0]?.start === 4)
  check('a clause opened by before is an adverbial clause, not an attributive one', beforeClause?.role === 'adverbial' && beforeClause.sense === 'time', JSON.stringify(beforeClause))
  const measured = compileModelReply(JSON.stringify({
    spans: [
      { text: 'It', role: 'subject' },
      { text: 'closes', role: 'predicate' },
      { text: 'less than two weeks before the race begins', role: 'adverbial', sense: 'time' },
      { text: 'less than two weeks', role: 'adverbial', form: 'adjective-phrase' },
      { text: 'before the race begins', role: 'adverbial', form: 'clause', sense: 'time' },
      { text: 'before', role: 'connector', connector: 'subordinator' },
      { text: 'the race', role: 'subject' },
      { text: 'begins', role: 'predicate' },
    ],
  }), 'It closes less than two weeks before the race begins.', 'test-model')
  check('two same-role pieces with no coordinator or comma are not a coordination', !measured.units.some((unit) => unit.form === 'coordination') && measured.units.some((unit) => unit.role === 'adverbial' && unit.form === 'clause'), JSON.stringify(measured.units.map((unit) => [unit.role, unit.form])))
  const clauseSpans = (sentence, subjectClause) => compileModelReply(JSON.stringify({
    spans: [
      { text: subjectClause, role: 'subject', form: 'clause' },
      { text: 'What', role: 'connector', connector: 'relative-pronoun', serves: 'object' },
      { text: 'he', role: 'subject' },
      { text: 'said', role: 'predicate' },
      { text: 'angered', role: 'predicate' },
      { text: 'the board', role: 'object' },
    ],
  }), sentence, 'test-model')
  const far = clauseSpans('What he said, to our surprise, angered the board.', 'What he said')
  const farBubble = unitBubble(far, far.units.find((unit) => unit.form === 'clause' && unit.role === 'subject').id)
  check('a clause apart from its verb says first what it does there', /^angered 的主语；What 在从句中作宾语$/.test(farBubble?.body || ''), JSON.stringify(farBubble))
  const near = clauseSpans('What he said angered the board.', 'What he said')
  const nearBubble = unitBubble(near, near.units.find((unit) => unit.form === 'clause' && unit.role === 'subject').id)
  check('a clause beside its verb keeps the connector line alone', nearBubble?.body === 'What 在从句中作宾语', JSON.stringify(nearBubble))
  const dont = compileModelReply(JSON.stringify({
    spans: [
      { text: 'Don’t', role: 'predicate' },
      { text: 'put', role: 'predicate', obstacle: 'split' },
      { text: 'all your eggs', role: 'object' },
    ],
  }), 'Don’t put all your eggs.', 'test-model')
  const dontPredicates = dont.units.filter((unit) => unit.role === 'predicate')
  check('Don’t next to its verb is one predicate, not a split', dontPredicates.length === 1 && dontPredicates[0].spans.length === 1 && dontPredicates[0].spans[0].start === 0 && !dontPredicates[0].obstacles.includes('split'), JSON.stringify(dontPredicates))
  const letUs = compileModelReply(JSON.stringify({
    spans: [
      { text: 'Let', role: 'predicate' },
      { text: '’s', role: 'predicate' },
      { text: 'take a break', role: 'object-complement', form: 'infinitive', logicalSubject: 'us' },
      { text: 'take', role: 'nonfinite-verb' },
      { text: 'a break', role: 'object' },
    ],
  }), 'Let’s take a break.', 'test-model')
  const us = letUs.units.find((unit) => unit.spans?.[0]?.start === 1 && unit.spans[0].end === 2)
  check('the ’s of Let’s is the object us and the logical subject', us?.role === 'object' && JSON.stringify(letUs.relations).includes(us.id), JSON.stringify(letUs.relations))
  const quoted = strictProblem({
    spans: [
      { text: 'She', role: 'subject' },
      { text: 'wrote', role: 'predicate' },
      { text: '“Take good care of Sammie.”', role: 'object', form: 'clause', mark: 'direct-speech' },
      { text: 'Take good care of', role: 'predicate' },
      { text: 'Sammie', role: 'object' },
    ],
  }, 'She wrote, “Take good care of Sammie.”')
  check('a quoted imperative needs no subject', quoted === null, quoted)
  const reportingExample = PROMPT_EXAMPLES.find(example => example.sentence.startsWith('Maya stood'))
  const duplicateQuote = structuredClone(reportingExample.reply)
  const quoteIndex = duplicateQuote.spans.findIndex(span => span.mark === 'direct-speech')
  delete duplicateQuote.spans[quoteIndex].mark
  duplicateQuote.spans.splice(quoteIndex + 2, 0, {
    text: '“rest is essential”', role: 'object', form: 'clause', mark: 'direct-speech',
  })
  const foldedQuote = compileModelReply(JSON.stringify(duplicateQuote), reportingExample.sentence, 'test-model')
  const reported = foldedQuote.units.filter(unit => unit.marks?.includes('direct-speech'))
  check('a quoted content clause has one layer and retains its quotation mark', reported.length === 1
    && reported[0].role === 'object' && reported[0].form === 'clause')
  for (const lenient of [false, true]) {
    const conflict = structuredClone(duplicateQuote)
    conflict.spans.find(span => span.mark === 'direct-speech').role = 'subject'
    let rejected = false
    try { compileModelReply(JSON.stringify(conflict), reportingExample.sentence, 'test-model', { lenient }) }
    catch (error) { rejected = /conflicting roles/.test(error.message) }
    check(`a quoted body cannot silently become a subject clause (lenient=${lenient})`, rejected)
    const wrongContent = structuredClone(reportingExample.reply)
    // Remove the coordination wrapper to exercise a direct reported-content child.
    wrongContent.spans = wrongContent.spans.filter(span => span.text !== 'that “rest is essential” and that practice takes time')
    wrongContent.spans.find(span => span.mark === 'direct-speech').role = 'subject'
    rejected = false
    try { compileModelReply(JSON.stringify(wrongContent), reportingExample.sentence, 'test-model', { lenient }) }
    catch (error) { rejected = /label the that-clause object/.test(error.message) }
    check(`reported content after reminding its recipient is not a subject (lenient=${lenient})`, rejected)
  }
  const possessive = spansToAuthoring({ spans: [{ text: 'He', role: 'subject' }, { text: 'is', role: 'predicate' }, { text: 'a star of Children’s Theatre', role: 'predicative' }, { text: 'and', role: 'connector' }, { text: 'is', role: 'predicate', occurrence: 2 }, { text: 'fresh', role: 'predicative' }] }, 'He is a star of Children’s Theatre and is fresh.')
  check('a spelled-out "is" never lands on a possessive ’s', possessive.units.filter((unit) => unit.role === 'predicate').map((unit) => unit.quote).join('|') === 'is|is', JSON.stringify(possessive.units))
  const stray = strictProblem({
    spans: [
      { text: 'Never had she seen it', role: 'main', form: 'clause', obstacle: 'fronting', restore: 'she had not ever seen it' },
      { text: 'had', role: 'predicate' },
      { text: 'she', role: 'subject' },
      { text: 'seen', role: 'predicate' },
    ],
  }, 'Never had she seen it.')
  check('a restore with an unbracketed new word is sent back', /"not" is not in the sentence/.test(stray || ''), stray)
  const reordered = spansToAuthoring({
    spans: [
      { text: 'Never had she seen it', role: 'main', form: 'clause', obstacle: 'fronting', restore: 'she had never seen it' },
      { text: 'had', role: 'predicate' },
      { text: 'she', role: 'subject' },
      { text: 'seen', role: 'predicate' },
    ],
  }, 'Never had she seen it.')
  check('a restore on a lone main span is kept on the root', reordered.restores.length === 1 && reordered.restores[0].unit === 'c0', JSON.stringify(reordered.restores))
}

function compiles(reply, sentence) {
  try {
    compileModelReply(JSON.stringify(reply), sentence, 'test-model')
    return null
  } catch (error) {
    return error.message
  }
}

{
  const pairedReply = {
    spans: [
      { text: 'He', role: 'subject' },
      { text: 'is', role: 'predicate' },
      { text: 'not only kind but also brave', role: 'predicative' },
      { text: ['not only', 'but also'], role: 'connector' },
    ],
  }
  const paired = spansToAuthoring(pairedReply, 'He is not only kind but also brave.')
  const pair = paired.units.find((unit) => unit.connector)
  check('a connector given in two parts becomes one two-piece coordinator', JSON.stringify(pair?.quote) === '["not only","but also"]' && pair.connector === 'coordinator', JSON.stringify(pair))
  check('a two-part connector compiles', compiles(pairedReply, 'He is not only kind but also brave.') === null)

  const noun = spansToAuthoring({
    spans: [
      { text: 'I', role: 'subject' },
      { text: 'know', role: 'predicate' },
      { text: 'what she wants', role: 'object', form: 'clause' },
      { text: 'what', role: 'connector', connector: 'relative-pronoun', serves: 'object' },
      { text: 'she', role: 'subject' },
      { text: 'wants', role: 'predicate' },
      { text: 'how it works', role: 'object', form: 'clause' },
      { text: 'how', role: 'connector', serves: 'adverbial' },
      { text: 'it', role: 'subject' },
      { text: 'works', role: 'predicate' },
    ],
  }, 'I know what she wants and how it works.')
  check('connectors of noun clauses are conjunctive', noun.units.filter((unit) => unit.connector).map((unit) => `${unit.quote}:${unit.connector}`).join('|') === 'what:conjunctive-pronoun|how:conjunctive-adverb', JSON.stringify(noun.units.filter((unit) => unit.connector)))

  const houseSentence = 'The house in which he lives is old.'
  const houseReply = {
    spans: [
      { text: 'The house', role: 'subject' },
      { text: 'in which he lives', role: 'attributive', form: 'clause', head: 'house' },
      { text: 'in which', role: 'connector', serves: 'adverbial' },
      { text: 'he', role: 'subject' },
      { text: 'lives', role: 'predicate' },
      { text: 'is', role: 'predicate' },
      { text: 'old', role: 'predicative' },
    ],
  }
  const house = spansToAuthoring(houseReply, houseSentence)
  const inWhich = house.units.find((unit) => unit.connector)
  check('a preposition before a relative pronoun is marked', inWhich.connector === 'relative-pronoun' && inWhich.obstacles?.includes('preposition-relative'), JSON.stringify(inWhich))
  const houseRestore = house.restores.find((item) => item.kind === 'antecedent')
  check('a preposition relative gets the antecedent after its verb', houseRestore && restoreString(houseSentence, houseRestore) === 'he lives in [the house]', houseRestore && restoreString(houseSentence, houseRestore))
  check('an antecedent restore compiles', compiles(houseReply, houseSentence) === null, compiles(houseReply, houseSentence))

  const boxSentence = 'The box in which he put the key was empty.'
  const boxReply = {
    spans: [
      { text: 'The box', role: 'subject' },
      { text: 'in which he put the key', role: 'attributive', form: 'clause', head: 'box' },
      { text: 'in which', role: 'connector', serves: 'adverbial' },
      { text: 'he', role: 'subject' },
      { text: 'put', role: 'predicate' },
      { text: 'the key', role: 'object' },
      { text: 'was', role: 'predicate' },
      { text: 'empty', role: 'predicative' },
    ],
  }
  const boxRestore = spansToAuthoring(boxReply, boxSentence).restores.find((item) => item.kind === 'antecedent')
  check('a preposition relative goes back after the object', boxRestore && restoreString(boxSentence, boxRestore) === 'he put the key in [the box]', boxRestore && restoreString(boxSentence, boxRestore))
  check('a moved preposition relative restore compiles', compiles(boxReply, boxSentence) === null, compiles(boxReply, boxSentence))

  const firmSentence = 'She left the firm for which she worked, earning little.'
  const firmReply = {
    spans: [
      { text: 'She', role: 'subject' },
      { text: 'left', role: 'predicate' },
      { text: 'the firm', role: 'object' },
      { text: 'for which she worked, earning little', role: 'attributive', form: 'clause', head: 'firm' },
      { text: 'for which', role: 'connector', serves: 'adverbial' },
      { text: 'she', role: 'subject' },
      { text: 'worked', role: 'predicate' },
      { text: 'earning little', role: 'adverbial', form: 'nonfinite' },
    ],
  }
  const firmRestore = spansToAuthoring(firmReply, firmSentence).restores.find((item) => item.kind === 'antecedent')
  const antecedentRestore = (sentence, object, head, clauseText, inner) => {
    const reply = {
      spans: [
        { text: 'We', role: 'subject' },
        { text: sentence.split(' ')[1], role: 'predicate' },
        { text: object, role: 'object' },
        { text: clauseText, role: 'attributive', form: 'clause', head },
        ...inner,
      ],
    }
    const restore = spansToAuthoring(reply, sentence).restores.find((item) => item.kind === 'antecedent')
    return restore && restoreString(sentence, restore)
  }
  const contextRestore = antecedentRestore('We study the larger context in which words appear.', 'the larger context', 'context', 'in which words appear',
    [{ text: 'in which', role: 'connector', serves: 'adverbial' }, { text: 'words', role: 'subject' }, { text: 'appear', role: 'predicate' }])
  check('an antecedent keeps its determiner across adjectives', contextRestore === 'words appear in [the larger context]', contextRestore)
  const areasRestore = antecedentRestore('We visited areas in which people farm.', 'areas', 'areas', 'in which people farm',
    [{ text: 'in which', role: 'connector', serves: 'adverbial' }, { text: 'people', role: 'subject' }, { text: 'farm', role: 'predicate' }])
  check('an antecedent without a determiner does not take in the verb', areasRestore === 'people farm in [areas]', areasRestore)

  const flowSentence = 'They create plug flow, in which the water forms columns separated by gaps.'
  const flowReply = {
    spans: [
      { text: 'They', role: 'subject' },
      { text: 'create', role: 'predicate' },
      { text: 'plug flow', role: 'object' },
      { text: 'in which the water forms columns separated by gaps', role: 'attributive', form: 'clause', head: 'plug flow' },
      { text: 'in which', role: 'connector', serves: 'adverbial' },
      { text: 'the water', role: 'subject' },
      { text: 'forms', role: 'predicate' },
      { text: 'columns', role: 'object' },
      { text: 'separated by gaps', role: 'attributive', form: 'past-participle', head: 'columns' },
    ],
  }
  const flowRestore = spansToAuthoring(flowReply, flowSentence).restores.find((item) => item.kind === 'antecedent')
  check('a preposition relative does not split an object from its modifier', flowRestore && restoreString(flowSentence, flowRestore) === 'the water forms columns separated by gaps in [plug flow]', flowRestore && restoreString(flowSentence, flowRestore))

  const failSentence = 'He set a task at which I was sure to fail.'
  const failReply = {
    spans: [
      { text: 'He', role: 'subject' },
      { text: 'set', role: 'predicate' },
      { text: 'a task', role: 'object' },
      { text: 'at which I was sure to fail', role: 'attributive', form: 'clause', head: 'task' },
      { text: 'at which', role: 'connector', serves: 'adverbial' },
      { text: 'I', role: 'subject' },
      { text: 'was sure', role: 'predicate' },
      { text: 'to fail', role: 'adverbial', form: 'infinitive', head: 'sure' },
    ],
  }
  const failRestore = spansToAuthoring(failReply, failSentence).restores.find((item) => item.kind === 'antecedent')
  check('a preposition relative does not split an adjective from its infinitive', failRestore && restoreString(failSentence, failRestore) === 'I was sure to fail at [a task]', failRestore && restoreString(failSentence, failRestore))

  check('a preposition relative stays ahead of a trailing participle', firmRestore && restoreString(firmSentence, firmRestore) === 'she worked for [the firm], earning little', firmRestore && restoreString(firmSentence, firmRestore))

  const bookSentence = 'She read the book that he wrote.'
  const book = spansToAuthoring({
    spans: [
      { text: 'She', role: 'subject' },
      { text: 'read', role: 'predicate' },
      { text: 'the book', role: 'object' },
      { text: 'that he wrote', role: 'attributive', form: 'clause', head: 'book' },
      { text: 'that', role: 'connector', connector: 'relative-pronoun', serves: 'object' },
      { text: 'he', role: 'subject' },
      { text: 'wrote', role: 'predicate' },
    ],
  }, bookSentence)
  const bookRestore = book.restores.find((item) => item.kind === 'antecedent')
  check('an object relative pronoun is replaced after the predicate', bookRestore && restoreString(bookSentence, bookRestore) === 'he wrote [the book]', bookRestore && restoreString(bookSentence, bookRestore))

  const bridge = promptExample('The bridge that')
  const bridgeRestores = spansToAuthoring(bridge.reply, bridge.sentence).restores.filter((item) => item.kind === 'antecedent').map((item) => restoreString(bridge.sentence, item))
  check('a subject relative pronoun is replaced in place', bridgeRestores.some((text) => text.startsWith('[the bridge]') || text.startsWith('[bridge]')), JSON.stringify(bridgeRestores))

  const here = spansToAuthoring({ spans: [{ text: 'Here', role: 'adverbial' }, { text: 'comes', role: 'predicate', obstacle: 'inversion' }, { text: 'the bus', role: 'subject' }] }, 'Here comes the bus.')
  check('a whole predicate before the subject is full inversion', here.units.find((unit) => unit.role === 'predicate').obstacles?.join() === 'full-inversion')

  const fruitReply = {
    spans: [
      { text: 'She', role: 'subject' },
      { text: 'bought', role: 'predicate' },
      { text: 'apples and pears', role: 'object' },
      { text: 'apples', role: 'object' },
      { text: 'and', role: 'connector' },
      { text: 'pears', role: 'object' },
    ],
  }
  const fruit = spansToAuthoring(fruitReply, 'She bought apples and pears.')
  const group = fruit.units.find((unit) => unit.quote === 'apples and pears')
  check('two same-role parts inside a same-role span make a coordination', group?.form === 'coordination' && fruit.units.filter((unit) => unit.parent === group.id && unit.role === 'object').length === 2, JSON.stringify(fruit.units))
  check('a coordination compiles', compiles(fruitReply, 'She bought apples and pears.') === null, compiles(fruitReply, 'She bought apples and pears.'))

  const cleftSentence = 'It was Tom that broke the window.'
  const cleftReply = {
    spans: [
      { text: 'It', role: 'subject' },
      { text: 'was', role: 'predicate' },
      { text: 'Tom', role: 'subject', obstacle: 'cleft', restore: 'Tom broke the window' },
      { text: 'broke', role: 'predicate' },
      { text: 'the window', role: 'object' },
    ],
  }
  const cleft = spansToAuthoring(cleftReply, cleftSentence)
  const frame = cleft.units.find((unit) => unit.role === 'cleft-frame')
  check('a cleft gets a two-piece frame and an emphasized unit', JSON.stringify(frame?.quote) === '["It was","that"]' && cleft.units.find((unit) => unit.quote === 'Tom')?.marks?.includes('emphasized') && !cleft.units.some((unit) => unit.quote === 'It' || unit.quote === 'was'), JSON.stringify(cleft.units))
  check('a cleft compiles', compiles(cleftReply, cleftSentence) === null, compiles(cleftReply, cleftSentence))
  const bareCleft = strictProblem({ spans: cleftReply.spans.map(({ restore, ...span }) => span) }, cleftSentence)
  check('a cleft without a restore is sent back', /cleft "Tom"/.test(bareCleft || ''), bareCleft)

  const examSentence = 'He passed the exam, which surprised everyone.'
  const examReply = {
    spans: [
      { text: 'He', role: 'subject' },
      { text: 'passed', role: 'predicate' },
      { text: 'the exam', role: 'object' },
      { text: 'which surprised everyone', role: 'attributive', form: 'clause', head: 'He passed the exam' },
      { text: 'which', role: 'connector', connector: 'relative-pronoun', serves: 'subject' },
      { text: 'surprised', role: 'predicate' },
      { text: 'everyone', role: 'object' },
    ],
  }
  const exam = spansToAuthoring(examReply, examSentence)
  check('a whole-clause antecedent points at the clause', exam.relations.some((relation) => relation.kind === 'refers-to' && relation.to.join() === 'c0') && exam.relations.some((relation) => relation.kind === 'modifies' && relation.to.join() === 'c0') && !exam.units.some((unit) => unit.role === 'head') && !exam.restores.some((item) => item.kind === 'antecedent'), JSON.stringify(exam.relations))
  check('a whole-clause antecedent compiles', compiles(examReply, examSentence) === null, compiles(examReply, examSentence))

  const wishReply = {
    spans: [
      { text: 'He', role: 'subject' },
      { text: 'had', role: 'predicate' },
      { text: 'one wish', role: 'object' },
      { text: 'to see the sea', role: 'appositive', form: 'infinitive', mark: 'explanatory', head: 'wish' },
      { text: 'see', role: 'nonfinite-verb' },
      { text: 'the sea', role: 'object' },
    ],
  }
  const wish = spansToAuthoring(wishReply, 'He had one wish: to see the sea.')
  check('an explanatory unit explains its head', relationQuotes(wish, 'explains').join() === 'to see the sea>wish' && wish.units.find((unit) => unit.role === 'appositive')?.marks?.join() === 'explanatory', JSON.stringify(wish.relations))
  check('an explanatory unit compiles', compiles(wishReply, 'He had one wish: to see the sea.') === null, compiles(wishReply, 'He had one wish: to see the sea.'))

  const teaSentence = 'Tom likes tea, and Mary coffee.'
  const teaReply = {
    spans: [
      { text: 'Tom likes tea', role: 'main', form: 'clause' },
      { text: 'Mary coffee', role: 'main', form: 'clause', obstacle: 'gapping', restore: 'Mary [likes] coffee' },
      { text: 'Tom', role: 'subject' },
      { text: 'likes', role: 'predicate' },
      { text: 'tea', role: 'object' },
      { text: 'and', role: 'connector' },
      { text: 'Mary', role: 'subject' },
      { text: 'coffee', role: 'object' },
    ],
  }
  const tea = spansToAuthoring(teaReply, teaSentence)
  const borrowed = tea.relations.find((relation) => relation.implied)
  check('a gapped clause borrows the earlier predicate with an implied line', borrowed && relationQuotes({ ...tea, relations: [borrowed] }, 'subject-predicate').join() === 'Mary>likes' && tea.restores.some((item) => item.kind === 'ellipsis'), JSON.stringify(tea.relations))
  check('a gapped clause compiles', compiles(teaReply, teaSentence) === null, compiles(teaReply, teaSentence))
  const unbracketed = spansToAuthoring({ spans: teaReply.spans.map((span) => (span.restore ? { ...span, restore: 'Mary likes coffee' } : span)) }, teaSentence)
  const borrowedRestore = unbracketed.restores.find((item) => item.unit === 'c1')
  check('a restore may copy the shared verb from an earlier clause', borrowedRestore && restoreString(teaSentence, borrowedRestore) === 'Mary [likes] coffee', borrowedRestore && restoreString(teaSentence, borrowedRestore))

  const nestedSentence = 'He said that Tom likes tea, and Mary coffee.'
  const nestedReply = {
    spans: [
      { text: 'He', role: 'subject' },
      { text: 'said', role: 'predicate' },
      { text: 'that Tom likes tea, and Mary coffee', role: 'object', form: 'clause' },
      { text: 'that', role: 'connector', connector: 'subordinator' },
      { text: 'Tom likes tea', role: 'main', form: 'clause' },
      { text: 'Tom', role: 'subject' },
      { text: 'likes', role: 'predicate' },
      { text: 'tea', role: 'object' },
      { text: 'and', role: 'connector' },
      { text: 'Mary coffee', role: 'main', form: 'clause', obstacle: 'ellipsis', restore: 'Mary [likes] coffee' },
      { text: 'Mary', role: 'subject' },
      { text: 'coffee', role: 'object' },
    ],
  }
  const nested = spansToAuthoring(nestedReply, nestedSentence, { lenient: true })
  const conjuncts = nested.units.filter((unit) => unit.form === 'clause' && unit.role === 'object' && unit.quote !== 'that Tom likes tea, and Mary coffee')
  check('coordinate clauses inside a clause take the clause role instead of becoming main clauses', nested.roots.join() === 'c0' && conjuncts.length === 2, JSON.stringify(nested.units))
  check('a later coordinate clause without a verb becomes gapping and borrows the verb', conjuncts[1]?.obstacles?.includes('gapping') && nested.relations.some((relation) => relation.implied && relationQuotes({ ...nested, relations: [relation] }, 'subject-predicate').join() === 'Mary>likes'), JSON.stringify(nested.relations))
  check('nested coordinate clauses compile', compiles(nestedReply, nestedSentence) === null, compiles(nestedReply, nestedSentence))

  const peoplesSentence = 'The Caribbean Taino, the Australian Aboriginals, the African people of Benin and the Incas, all of whom appear here, speak to us.'
  const peoplesReply = {
    spans: [
      { text: 'The Caribbean Taino, the Australian Aboriginals, the African people of Benin and the Incas', role: 'subject' },
      { text: 'all of whom appear here', role: 'attributive', form: 'clause', head: 'The Caribbean Taino, the Australian Aboriginals, the African people of Benin and the Incas' },
      { text: 'all of whom', role: 'connector', connector: 'relative-pronoun', serves: 'subject' },
      { text: 'appear', role: 'predicate' },
      { text: 'speak', role: 'predicate' },
    ],
  }
  check('a long antecedent gets no automatic restore', compiles(peoplesReply, peoplesSentence) === null && !spansToAuthoring(peoplesReply, peoplesSentence).restores.some((item) => item.kind === 'antecedent'), compiles(peoplesReply, peoplesSentence))

  const flattenedSentence = 'Two friends joined me, and since we were old, we left early.'
  const flattenedReply = {
    spans: [
      { text: 'Two friends', role: 'subject' },
      { text: 'joined', role: 'predicate' },
      { text: 'me', role: 'object' },
      { text: 'and', role: 'connector', connector: 'coordinator' },
      { text: 'since we were old', role: 'adverbial', form: 'clause', sense: 'cause' },
      { text: 'since', role: 'connector', connector: 'subordinator' },
      { text: 'we', occurrence: 1, role: 'subject' },
      { text: 'were', role: 'predicate' },
      { text: 'old', role: 'predicative' },
      { text: 'we', occurrence: 2, role: 'subject' },
      { text: 'left', role: 'predicate' },
      { text: 'early', role: 'adverbial' },
    ],
  }
  const flattened = spansToAuthoring(flattenedReply, flattenedSentence)
  check('two flattened clauses keep subject, predicate and adverbial links inside each clause',
    relationQuotes(flattened, 'subject-predicate').filter((pair) => !pair.startsWith('we>were')).join('|') === 'Two friends>joined|we>left'
      && relationQuotes(flattened, 'modifies').includes('since we were old>left') && relationQuotes(flattened, 'modifies').includes('early>left'),
    JSON.stringify([relationQuotes(flattened, 'subject-predicate'), relationQuotes(flattened, 'modifies')]))

  const homeSentence = 'The work done, we went home.'
  const homeReply = {
    spans: [
      { text: 'The work done', role: 'adverbial', form: 'absolute' },
      { text: 'The work', role: 'logical-subject' },
      { text: 'done', role: 'nonfinite-verb' },
      { text: 'we', role: 'subject' },
      { text: 'went', role: 'predicate' },
      { text: 'home', role: 'adverbial' },
    ],
  }
  const home = spansToAuthoring(homeReply, homeSentence)
  const absolute = home.units.find((unit) => unit.form === 'absolute')
  check('an absolute construction is a layer with its own logical subject', home.units.find((unit) => unit.role === 'logical-subject')?.layer === absolute?.id && relationQuotes(home, 'logical-subject').join() === 'done>The work' && relationQuotes(home, 'modifies').includes('The work done>went'), JSON.stringify(home.relations))
  check('an absolute construction compiles', compiles(homeReply, homeSentence) === null, compiles(homeReply, homeSentence))

  const cleftExample = promptExample('It was in 1998')
  const gapExample = promptExample('She found it hard')
  const cleftAuthoring = spansToAuthoring(cleftExample.reply, cleftExample.sentence)
  const cleftRestore = cleftAuthoring.restores.find((item) => item.kind === 'normal-order')
  check('the cleft example drops only the frame when restored', cleftRestore && restoreString(cleftExample.sentence, cleftRestore) === 'she moved to London in 1998, where she met her husband.', cleftRestore && restoreString(cleftExample.sentence, cleftRestore))
  const gapAuthoring = spansToAuthoring(gapExample.reply, gapExample.sentence)
  check('a formal object refers to the real object', relationQuotes(gapAuthoring, 'refers-to').join() === 'it>to give up sugar', JSON.stringify(relationQuotes(gapAuthoring, 'refers-to')))
  check('the gapping example borrows the verb with an implied line', gapAuthoring.relations.some((relation) => relation.implied), JSON.stringify(gapAuthoring.relations))

  const seriesSentence = 'They have settled in the sea, stuck inside rocks and fallen in snow.'
  const seriesReply = {
    spans: [
      { text: 'They', role: 'subject' },
      { text: 'have settled', role: 'predicate' },
      { text: 'stuck', role: 'predicate', obstacle: 'ellipsis', restore: 'they have stuck' },
      { text: 'fallen', role: 'predicate' },
    ],
  }
  const series = spansToAuthoring(seriesReply, seriesSentence)
  const seriesRestore = series.restores.find((item) => item.kind === 'ellipsis')
  check('an ellipsis restore of one predicate in a series fills in place and keeps the rest of the sentence', seriesRestore && restoreString(seriesSentence, seriesRestore) === 'They have settled in the sea, [they have] stuck inside rocks and fallen in snow.', seriesRestore && restoreString(seriesSentence, seriesRestore))
  check('the series restore compiles', compiles(seriesReply, seriesSentence) === null, compiles(seriesReply, seriesSentence))

  const longNote = { spans: [{ text: 'She', role: 'subject' }, { text: 'gave up', role: 'predicate', obstacle: 'collocation', note: '放弃，这是一个非常常见的短语动词，意思是停止做某件事情或者不再坚持' }, { text: 'sugar', role: 'object' }] }
  const longProblem = strictProblem(longNote, 'She gave up sugar.')
  check('a note longer than one line is sent back', /longer than one line/.test(longProblem || ''), longProblem)
  const dropped = spansToAuthoring(longNote, 'She gave up sugar.', { lenient: true })
  check('lenient mode drops a note longer than one line but keeps the unit', dropped.units.some((unit) => unit.quote === 'gave up' && !unit.note && unit.obstacles?.includes('collocation')))

  const tiredSentence = 'He was so tired that he fell asleep.'
  const tiredReply = {
    spans: [
      { text: 'He', role: 'subject' },
      { text: 'was', role: 'predicate' },
      { text: 'so tired', role: 'predicative' },
      { text: ['so', 'that'], role: 'connector' },
      { text: 'that he fell asleep', role: 'adverbial', form: 'clause', sense: 'result', head: 'tired' },
      { text: 'he', role: 'subject', occurrence: 2 },
      { text: 'fell', role: 'predicate' },
      { text: 'asleep', role: 'predicative' },
    ],
  }
  const tired = spansToAuthoring(tiredReply, tiredSentence)
  check('so … that is one subordinator and the result clause points at the word so modifies', tired.units.find((unit) => unit.connector)?.connector === 'subordinator' && relationQuotes(tired, 'modifies').join() === 'that he fell asleep>tired', JSON.stringify(tired.relations))
  check('a so … that sentence compiles', compiles(tiredReply, tiredSentence) === null, compiles(tiredReply, tiredSentence))

  const elected = spansToAuthoring({ spans: [{ text: 'They', role: 'subject' }, { text: 'elected', role: 'predicate' }, { text: 'him', role: 'object' }, { text: 'president', role: 'object-complement' }] }, 'They elected him president.')
  check('an object complement without a head complements the object', relationQuotes(elected, 'complements').join() === 'president>him', JSON.stringify(elected.relations))
}

{
  const ask = PROMPT_EXAMPLES.find(example => example.sentence === 'She asked him to leave early.')
  const analysis = spansToAuthoring(ask.reply, ask.sentence)
  check('object control keeps both complement and logical-subject meaning', relationQuotes(analysis, 'logical-subject').includes('to leave early>him') && relationQuotes(analysis, 'complements').includes('to leave early>him'), JSON.stringify(analysis.relations))
  check('a one-word adverbial has a modifier target', relationQuotes(analysis, 'modifies').includes('early>leave'))
  const players = PROMPT_EXAMPLES.find(example => example.sentence.startsWith('Tired after'))
  const agreed = spansToAuthoring(players.reply, players.sentence)
  check('subject control uses the model specified subject', relationQuotes(agreed, 'logical-subject').includes('to stay at the hotel until the rain stopped>the players'))
  check('a short prepositional adverbial points at its own nonfinite verb', relationQuotes(agreed, 'modifies').includes('at the hotel>stay'))
  const passive = { spans: [
    { text: 'He', role: 'subject' }, { text: 'was asked', role: 'predicate' },
    { text: 'to leave', role: 'subject-complement', form: 'infinitive', logicalSubject: 'He' },
    { text: 'leave', role: 'nonfinite-verb' },
  ] }
  const complement = spansToAuthoring(passive, 'He was asked to leave.')
  check('a subject complement complements the subject', relationQuotes(complement, 'complements').includes('to leave>He'))
  const absent = structuredClone(ask.reply)
  absent.spans.find(span => span.logicalSubject).logicalSubject = 'the teacher'
  check('a fabricated logical subject requests repair', /logicalSubject/.test(compiles(absent, ask.sentence) || ''))
  const tolerant = spansToAuthoring(absent, ask.sentence, { lenient: true })
  check('lenient mode drops an ungrounded relation instead of guessing She', relationQuotes(tolerant, 'logical-subject').length === 0 && tolerant.dropped.some(problem => problem.includes('logicalSubject')))
  const generic = { spans: [
    { text: 'To learn', role: 'subject', form: 'infinitive' }, { text: 'learn', role: 'nonfinite-verb' },
    { text: 'is', role: 'predicate' }, { text: 'useful', role: 'predicative' },
  ] }
  check('a generic infinitive gets no invented logical subject', spansToAuthoring(generic, 'To learn is useful.').relations.every(relation => relation.kind !== 'logical-subject'))
}

if (failed > 0) {
  console.error(`FAILED ${failed}  passed ${passed}`)
  process.exit(1)
}
console.log(`OK ${passed}`)
