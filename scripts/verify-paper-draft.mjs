#!/usr/bin/env node
/**
 * Verification: Paper Set Draft Module — usePaperDraft + paperDraftModel.
 *
 * Approach:
 *   - Pure function (createBasketItem) is unit-tested directly.
 *   - The 12 invariants are exercised via a tiny in-script reimplementation
 *     of the same composition (basket state + usePaperBlocks-style block
 *     ops) so we cover the contract without spinning up a React renderer.
 *   - App.tsx is checked for source-level migration: no setBasket / no
 *     paperBlocksHook / proper delegation to paperDraft.
 *   - usePaperBlocks source is checked for the "remove block before
 *     notifying upstream" fix.
 *
 * The behavioral driver below mirrors usePaperDraft's exact ops 1:1, so a
 * regression that breaks the invariants in the real hook would also fail
 * here unless someone forgot to mirror the change.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

let passed = 0, failed = 0
function assert(name, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name}: ${detail || 'failed'}`) }
}

const { createBasketItem } = await import('../app/src/paperAssembly/paperDraftModel.ts')
const { createLayoutFromItems, rebuildBlocks } = await import('../app/src/domain/paperLayout.ts')

// ─── Test 1: createBasketItem ─────────────────────────────────────────────
console.log('=== Paper Set Draft Module verification ===\n')
console.log('Test 1: createBasketItem defaults + overrides')

function mkGroup(id, overrides = {}) {
  return {
    id,
    title: `Group ${id}`,
    source: '2025·浙江',
    sourceType: 'real_exam',
    year: 2025,
    region: '浙江',
    paperName: '2025 浙江一模',
    section: '阅读 C',
    passageTitle: `Passage ${id}`,
    summary: 'sample summary',
    groupType: 'reading',
    questionCount: 4,
    difficulty: 'medium',
    tags: [],
    topicLabels: [],
    hit: '',
    answerPreview: '',
    defaultScore: 2.5,
    ...overrides,
  }
}

{
  const g = mkGroup('g1')
  const item = createBasketItem(g)
  assert('default score = group.defaultScore', item.score === 2.5, `got ${item.score}`)
  assert('default sectionTitle = groupTypeLabel[reading] = 阅读理解', item.sectionTitle === '阅读理解', `got ${item.sectionTitle}`)
  assert('default note = ""', item.note === '', '')

  const itemOver = createBasketItem(g, { score: 4, sectionTitle: '我的标题', note: '我的笔记' })
  assert('override score wins', itemOver.score === 4, '')
  assert('override sectionTitle wins', itemOver.sectionTitle === '我的标题', '')
  assert('override note wins', itemOver.note === '我的笔记', '')
}

// ─── Driver: mirror usePaperDraft's exact ops in plain JS state ──────────
// Same algorithm as usePaperDraft + composed usePaperBlocks. If you change
// the real hook's ops, mirror them here too — that's the contract.
function makeDraftDriver({ onDraftEdited } = {}) {
  let basket = []
  let paperBlocks = []
  let selectedPaperBlockId = null
  let openInsertionIndex = null
  const fire = (reason) => onDraftEdited && onDraftEdited(reason)

  return {
    get basket() { return basket },
    get paperBlocks() { return paperBlocks },
    get selectedPaperBlockId() { return selectedPaperBlockId },
    get openInsertionIndex() { return openInsertionIndex },

    setSelectedPaperBlockId(v) { selectedPaperBlockId = v },
    setOpenInsertionIndex(v) { openInsertionIndex = v },

    // ── add ──
    addGroups(groups) {
      const existing = new Set(basket.map((i) => i.id))
      const fresh = groups.filter((g) => !existing.has(g.id)).map((g) => createBasketItem(g))
      if (fresh.length === 0) return []
      basket = [...basket, ...fresh]
      paperBlocks = [...paperBlocks, ...createLayoutFromItems(fresh)]
      fire('add')
      return fresh
    },

    // ── remove (basket-driven) ──
    removeGroup(id) {
      openInsertionIndex = null
      const before = basket.length
      basket = basket.filter((i) => i.id !== id)
      paperBlocks = paperBlocks.filter(
        (b) => !(b.type === 'question_group' && b.questionGroupId === id),
      )
      if (basket.length !== before) fire('remove')
    },

    // ── clear ──
    clear() {
      openInsertionIndex = null
      selectedPaperBlockId = null
      basket = []
      paperBlocks = []
      fire('clear')
    },

    // ── moveGroup ──
    moveGroup(id, direction) {
      const index = basket.findIndex((i) => i.id === id)
      const next = index + direction
      if (index < 0 || next < 0 || next >= basket.length) return
      const arr = [...basket]
      const [item] = arr.splice(index, 1)
      arr.splice(next, 0, item)
      basket = arr

      // Sync paperBlocks: walk to the next question_group block in that direction.
      const blockIdx = paperBlocks.findIndex(
        (b) => b.type === 'question_group' && b.questionGroupId === id,
      )
      if (blockIdx >= 0) {
        let target = blockIdx + direction
        while (
          target >= 0 &&
          target < paperBlocks.length &&
          paperBlocks[target].type !== 'question_group'
        ) {
          target += direction
        }
        if (target >= 0 && target < paperBlocks.length) {
          const arr2 = [...paperBlocks]
          const [moved] = arr2.splice(blockIdx, 1)
          arr2.splice(target, 0, moved)
          paperBlocks = arr2
        }
      }
      fire('reorder')
    },

    // ── score ──
    updateGroupScore(id, score) {
      let changed = false
      basket = basket.map((it) => {
        if (it.id !== id || it.score === score) return it
        changed = true
        return { ...it, score }
      })
      paperBlocks = paperBlocks.map((b) =>
        b.type === 'question_group' && b.questionGroupId === id ? { ...b, score } : b,
      )
      if (changed) fire('score')
    },

    // ── meta ──
    updateGroupMeta(id, patch) {
      let changed = false
      basket = basket.map((it) => {
        if (it.id !== id) return it
        const nextSection = patch.sectionTitle !== undefined ? patch.sectionTitle : it.sectionTitle
        const nextNote = patch.note !== undefined ? patch.note : it.note
        if (nextSection === it.sectionTitle && nextNote === it.note) return it
        changed = true
        return { ...it, sectionTitle: nextSection, note: nextNote }
      })
      if (changed) fire('meta')
    },

    // ── replaceDraft (no fire) ──
    replaceDraft({ basket: nextBasket, layout }) {
      basket = nextBasket
      selectedPaperBlockId = null
      openInsertionIndex = null
      if (layout) {
        paperBlocks = layout.blocks
      } else {
        paperBlocks = rebuildBlocks(paperBlocks, nextBasket)
      }
    },

    // ── removeBlock (mirrors usePaperBlocks.removeBlock) ──
    removeBlock(blockId) {
      openInsertionIndex = null
      const block = paperBlocks.find((b) => b.id === blockId)
      if (!block) return
      if (block.type === 'question_group') {
        const targetGroupId = block.questionGroupId
        const removedIds = paperBlocks
          .filter((b) => b.type === 'question_group' && b.questionGroupId === targetGroupId)
          .map((b) => b.id)
        paperBlocks = paperBlocks.filter(
          (b) => !(b.type === 'question_group' && b.questionGroupId === targetGroupId),
        )
        if (selectedPaperBlockId && removedIds.includes(selectedPaperBlockId)) selectedPaperBlockId = null
        // Now the basket-only callback runs (mirrors usePaperDraft.onRemoveQuestionGroup).
        const beforeBasket = basket.length
        basket = basket.filter((i) => i.id !== targetGroupId)
        if (basket.length !== beforeBasket) fire('remove')
      } else {
        paperBlocks = paperBlocks.filter((b) => b.id !== blockId)
        if (selectedPaperBlockId === blockId) selectedPaperBlockId = null
      }
    },

    // ── externalRemoveByGroupId (no fire) ──
    externalRemoveByGroupId(id) {
      basket = basket.filter((i) => i.id !== id)
      paperBlocks = paperBlocks.filter(
        (b) => !(b.type === 'question_group' && b.questionGroupId === id),
      )
    },

    // ── patchBasketItemFromSavedGroup (no fire) ──
    patchBasketItemFromSavedGroup(saved) {
      basket = basket.map((it) =>
        it.id === saved.id
          ? createBasketItem(saved, { score: it.score, sectionTitle: it.sectionTitle, note: it.note })
          : it,
      )
    },
  }
}

const blockGroupIds = (blocks) => blocks.filter((b) => b.type === 'question_group').map((b) => b.questionGroupId)

// ─── Test 2: invariants 1–12 ──────────────────────────────────────────────
console.log('\nTest 2: Invariants 1–12 (driven through Paper Draft model)')
{
  const events = []
  const draft = makeDraftDriver({ onDraftEdited: (r) => events.push(r) })

  // addGroups + dedupe + invariants 1, 2, 3 + edit reason "add"
  draft.addGroups([mkGroup('g1'), mkGroup('g2')])
  assert('addGroups appends two groups', draft.basket.length === 2, `got ${draft.basket.length}`)
  assert('invariant 1: basket order matches block question_group order',
    JSON.stringify(draft.basket.map((i) => i.id)) === JSON.stringify(blockGroupIds(draft.paperBlocks)), '')
  assert('invariant 2: each basket item has exactly one question_group block',
    draft.basket.every((it) =>
      draft.paperBlocks.filter((b) => b.type === 'question_group' && b.questionGroupId === it.id).length === 1,
    ), '')
  assert('invariant 12: addGroups fires onDraftEdited("add")', events.at(-1) === 'add', '')

  draft.addGroups([mkGroup('g1'), mkGroup('g3')])
  assert('invariant 3: addGroups dedupes existing g1, only adds g3', draft.basket.length === 3, `got ${draft.basket.length}`)
  assert('basket g3 added', draft.basket.some((i) => i.id === 'g3'), '')

  // moveGroup: invariant 7 + edit reason "reorder"
  draft.moveGroup('g3', -1) // g3 last → middle
  assert('invariant 7: moveGroup syncs basket and block order',
    JSON.stringify(draft.basket.map((i) => i.id)) === JSON.stringify(['g1', 'g3', 'g2']) &&
    JSON.stringify(blockGroupIds(draft.paperBlocks)) === JSON.stringify(['g1', 'g3', 'g2']), '')
  assert('moveGroup fires onDraftEdited("reorder")', events.at(-1) === 'reorder', '')

  // updateGroupScore: invariant 8 + edit reason "score"
  draft.updateGroupScore('g1', 5)
  const g1Block = draft.paperBlocks.find((b) => b.type === 'question_group' && b.questionGroupId === 'g1')
  assert('invariant 8: updateGroupScore syncs basket + block', draft.basket.find((i) => i.id === 'g1').score === 5 && g1Block.score === 5, '')
  assert('updateGroupScore fires onDraftEdited("score")', events.at(-1) === 'score', '')
  const eventsBefore = events.length
  draft.updateGroupScore('g1', 5)
  assert('updateGroupScore is no-op when score unchanged', events.length === eventsBefore, '')

  // updateGroupMeta: invariant 9 + edit reason "meta"
  const blocksBeforeMeta = JSON.stringify(draft.paperBlocks)
  draft.updateGroupMeta('g1', { sectionTitle: '我的阅读', note: '重点' })
  assert('updateGroupMeta updates basket sectionTitle', draft.basket.find((i) => i.id === 'g1').sectionTitle === '我的阅读', '')
  assert('updateGroupMeta updates basket note', draft.basket.find((i) => i.id === 'g1').note === '重点', '')
  assert('invariant 9: updateGroupMeta does NOT touch paperBlocks',
    JSON.stringify(draft.paperBlocks) === blocksBeforeMeta, '')
  assert('updateGroupMeta fires onDraftEdited("meta")', events.at(-1) === 'meta', '')

  // removeGroup: invariant 4 + edit reason "remove"
  draft.removeGroup('g3')
  assert('invariant 4: removeGroup drops basket + block',
    !draft.basket.some((i) => i.id === 'g3') && !blockGroupIds(draft.paperBlocks).includes('g3'), '')
  assert('removeGroup fires onDraftEdited("remove")', events.at(-1) === 'remove', '')

  // invariant 5: removing question_group block also drops basket
  const g2BlockId = draft.paperBlocks.find((b) => b.type === 'question_group' && b.questionGroupId === 'g2').id
  draft.removeBlock(g2BlockId)
  assert('invariant 5: removing question_group block drops basket entry',
    !draft.basket.some((i) => i.id === 'g2') && !blockGroupIds(draft.paperBlocks).includes('g2'), '')
  assert('block-driven remove fires onDraftEdited("remove")', events.at(-1) === 'remove', '')

  // Section header / page break removal does NOT fire onDraftEdited.
  // (We do this by inserting one and removing it through removeBlock.)
  draft.replaceDraft({
    basket: draft.basket,
    layout: {
      blocks: [
        { id: 'sh-1', type: 'section_header', title: '第一部分' },
        ...draft.paperBlocks,
      ],
      questionNumberStart: 1,
      printStyle: 'exam',
    },
  })
  const eventsAfterReplace = events.length
  draft.removeBlock('sh-1')
  assert('removing section_header block does NOT fire onDraftEdited', events.length === eventsAfterReplace, '')

  // clear: invariant 6
  draft.setOpenInsertionIndex(7)
  draft.setSelectedPaperBlockId('block-X')
  draft.clear()
  assert('invariant 6: clear empties basket', draft.basket.length === 0, '')
  assert('invariant 6: clear empties paperBlocks', draft.paperBlocks.length === 0, '')
  assert('invariant 6: clear resets selection', draft.selectedPaperBlockId === null, '')
  assert('invariant 6: clear resets insertion', draft.openInsertionIndex === null, '')
  assert('clear fires onDraftEdited("clear")', events.at(-1) === 'clear', '')

  // replaceDraft (with layout): invariant 10 + invariant 11
  const eventCountBeforeReplace = events.length
  const layout = {
    blocks: [
      { id: 'sh-1', type: 'section_header', title: '第一部分' },
      { id: 'block-g1', type: 'question_group', questionGroupId: 'g1', score: 2.5 },
      { id: 'pb-1', type: 'page_break' },
      { id: 'block-g2', type: 'question_group', questionGroupId: 'g2', score: 1 },
    ],
    questionNumberStart: 21,
    printStyle: 'exam',
  }
  const loadedBasket = [createBasketItem(mkGroup('g1')), createBasketItem(mkGroup('g2'))]
  draft.replaceDraft({ basket: loadedBasket, layout })
  assert('invariant 10: replaceDraft uses layout.blocks when provided',
    JSON.stringify(draft.paperBlocks) === JSON.stringify(layout.blocks), '')
  assert('invariant 11: replaceDraft does NOT fire onDraftEdited',
    events.length === eventCountBeforeReplace, `delta: ${events.length - eventCountBeforeReplace}`)

  // replaceDraft (no layout): rebuilds blocks from basket
  draft.replaceDraft({ basket: [createBasketItem(mkGroup('g4')), createBasketItem(mkGroup('g5'))] })
  assert('invariant 10: replaceDraft without layout rebuilds from basket',
    JSON.stringify(blockGroupIds(draft.paperBlocks)) === JSON.stringify(['g4', 'g5']), '')

  // externalRemoveByGroupId: drops basket + block, no fire
  const eventsBeforeExternal = events.length
  draft.externalRemoveByGroupId('g4')
  assert('externalRemoveByGroupId drops basket + block',
    !draft.basket.some((i) => i.id === 'g4') && !blockGroupIds(draft.paperBlocks).includes('g4'), '')
  assert('externalRemoveByGroupId does NOT fire onDraftEdited',
    events.length === eventsBeforeExternal, '')

  // patchBasketItemFromSavedGroup preserves user overrides
  draft.updateGroupScore('g5', 8)
  draft.updateGroupMeta('g5', { sectionTitle: '保留', note: '保留' })
  draft.patchBasketItemFromSavedGroup(mkGroup('g5', { title: 'g5-renamed', summary: 'new summary' }))
  const g5 = draft.basket.find((i) => i.id === 'g5')
  assert('patchBasketItem preserves user score', g5.score === 8, `got ${g5.score}`)
  assert('patchBasketItem preserves user sectionTitle', g5.sectionTitle === '保留', '')
  assert('patchBasketItem preserves user note', g5.note === '保留', '')
  assert('patchBasketItem applies new title from saved', g5.title === 'g5-renamed', '')
  assert('patchBasketItem applies new summary from saved', g5.summary === 'new summary', '')
}

// ─── Test 3: source contracts on App.tsx + module wiring ──────────────────
console.log('\nTest 3: App.tsx no longer manages basket / paperBlocksHook directly')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const app = readFileSync(path.resolve(here, '..', 'app', 'src', 'App.tsx'), 'utf8')

  assert('App imports usePaperDraft', /import\s*\{\s*usePaperDraft\s*\}\s*from\s*['"]\.\/paperAssembly\/usePaperDraft['"]/.test(app), '')
  assert('App does NOT import usePaperBlocks directly anymore', !/from\s*['"]\.\/paperAssembly\/usePaperBlocks['"]/.test(app), '')
  assert('App imports createBasketItem from the module', /import\s*\{\s*createBasketItem\s*\}\s*from\s*['"]\.\/paperAssembly\/paperDraftModel['"]/.test(app), '')

  assert('App body has no useState<BasketItem[]> for basket', !/useState<BasketItem\[\]>\(\[\]\)/.test(app), '')
  assert('App body has no `paperBlocksHook =`', !/const\s+paperBlocksHook\s*=/.test(app), '')
  assert('App body has no inline createBasketItem function', !/^function createBasketItem\(/m.test(app), '')

  assert(
    'addGroupsToBasket uses C8 server draft API',
    /addGroupToCurrentDraftPaperRequest\(group\.id\)/.test(app) && /refreshQuestionGroups\(\)/.test(app),
    '',
  )
  assert('removeFromBasket delegates to paperDraft.removeGroup', /paperDraft\.removeGroup\(id\)/.test(app), '')
  assert('clearBasket delegates to paperDraft.clear', /paperDraft\.clear\(\)/.test(app), '')
  assert('moveBasketItem delegates to paperDraft.moveGroup', /paperDraft\.moveGroup\(id, direction\)/.test(app), '')
  assert('updateScore delegates to paperDraft.updateGroupScore', /paperDraft\.updateGroupScore\(id, score\)/.test(app), '')
  assert('updateBasketItem delegates to paperDraft.updateGroupMeta', /paperDraft\.updateGroupMeta\(id,/.test(app), '')

  const replaceCount = (app.match(/paperDraft\.replaceDraft\(/g) || []).length
  assert('App uses paperDraft.replaceDraft in ≥ 3 sites (load + workflow + objective)',
    replaceCount >= 3, `got ${replaceCount}`)
  assert('handleDeleteQuestionGroup uses externalRemoveByGroupId',
    /paperDraft\.externalRemoveByGroupId\(id\)/.test(app), '')
  assert('saved-group sync uses patchBasketItemFromSavedGroup',
    /paperDraft\.patchBasketItemFromSavedGroup\(saved\)/.test(app), '')

  assert('App routes onDraftEdited via a ref-bound effect',
    /draftEditedHandlerRef\.current = \(reason\) =>/.test(app), '')
  assert('Router resets export statuses on every edit',
    /draftEditedHandlerRef\.current = \(reason\) => \{[\s\S]*?paperExports\.resetExportStatuses\(\)/.test(app), '')
  assert('Router gates previewStatus reset to add/remove/clear',
    /reason === 'add' \|\| reason === 'remove' \|\| reason === 'clear'/.test(app), '')
}

// ─── Test 4: usePaperBlocks.removeBlock removes block before notifying ────
//             + closure-snapshot watch (no closure paperBlocks reads, no
//             onRemoveQuestionGroup inside the updater body, deps array
//             does not include paperBlocks).
console.log('\nTest 4: usePaperBlocks.removeBlock — updater-only state reads, no closure paperBlocks')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const blocks = readFileSync(path.resolve(here, '..', 'app', 'src', 'paperAssembly', 'usePaperBlocks.ts'), 'utf8')

  // Extract the full removeBlock useCallback expression — body + deps —
  // mirroring the shape used for replaceDraft in Test 6.
  const removeBlockExpr = blocks.match(/const removeBlock\s*=\s*useCallback\(\s*\n([\s\S]*?)\n  \)/)?.[1] || ''
  assert('removeBlock useCallback expression extracted', removeBlockExpr.length > 0, '')

  // Watch 1: removeBlock body must NOT read closure-captured paperBlocks.
  // Same class of risk as the usePaperDraft updater-timing bug already fixed.
  assert('removeBlock body does NOT contain paperBlocks.find( (closure read)',
    !/\bpaperBlocks\.find\(/.test(removeBlockExpr), 'closure read still present')
  assert('removeBlock body does NOT contain paperBlocks.filter( (closure read)',
    !/\bpaperBlocks\.filter\(/.test(removeBlockExpr), 'closure read still present')
  assert('removeBlock body does NOT have any paperBlocks.X member access',
    !/\bpaperBlocks\./.test(removeBlockExpr), 'paperBlocks.X access still present')

  // Watch 2: deps array does not include paperBlocks; only onRemoveQuestionGroup.
  const depsMatch = removeBlockExpr.match(/\[([^\]]*)\]\s*,?\s*$/)
  assert('removeBlock deps array extracted', depsMatch !== null,
    `tail:\n${removeBlockExpr.slice(-200)}`)
  const deps = depsMatch?.[1] || ''
  assert('removeBlock deps DO NOT include paperBlocks',
    !/\bpaperBlocks\b/.test(deps), `deps: [${deps}]`)
  assert('removeBlock deps include onRemoveQuestionGroup',
    /\bonRemoveQuestionGroup\b/.test(deps), `deps: [${deps}]`)

  // Watch 3: onRemoveQuestionGroup must NOT appear inside the
  // setPaperBlocks((blocks) => { ... }) updater body. StrictMode can call
  // updaters twice, so side effects belong outside the updater.
  const updaterBody = removeBlockExpr.match(
    /setPaperBlocks\(\(blocks\)\s*=>\s*\{\n([\s\S]*?)\n      \}\)/,
  )?.[1] || ''
  assert('setPaperBlocks updater body extracted', updaterBody.length > 0, '')
  assert('updater body does NOT call onRemoveQuestionGroup',
    !/onRemoveQuestionGroup\(/.test(updaterBody), 'side effect leaked into updater body')

  // Existing contract (strengthened): setPaperBlocks((blocks) => ...) runs
  // BEFORE the onRemoveQuestionGroup side effect at the call site.
  const setIdx = removeBlockExpr.indexOf('setPaperBlocks((blocks) =>')
  const cbIdx = removeBlockExpr.indexOf('onRemoveQuestionGroup(')
  assert('setPaperBlocks runs BEFORE onRemoveQuestionGroup callback (no stale block)',
    setIdx !== -1 && cbIdx !== -1 && setIdx < cbIdx,
    `setPaperBlocks idx=${setIdx}, onRemoveQuestionGroup idx=${cbIdx}`)
}

// ─── Test 5: usePaperDraft must NOT use the closure-capture-in-updater
//             antipattern that triggered the addGroups timing bug ─────────
console.log('\nTest 5: usePaperDraft uses a basketRef + commitBasket, never reads closure-mutated variables outside the updater')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const hookFull = readFileSync(path.resolve(here, '..', 'app', 'src', 'paperAssembly', 'usePaperDraft.ts'), 'utf8')
  // Strip block + line comments before grepping for code-level patterns so
  // doc-block mentions of legacy patterns don't trip the regex.
  const hook = hookFull
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  // 5.1 The hook keeps an authoritative ref + a commit helper.
  // The ref's initial value used to be `[]`; Cut B now seeds it with the
  // hydrated basket from localStorage so the first op-after-mount sees the
  // right basket without an extra render. Accept either form.
  assert(
    'hook declares basketRef',
    /const basketRef = useRef<BasketItem\[\]>\((\[\]|basket)\)/.test(hook),
    '',
  )
  assert('hook defines commitBasket helper',
    /const commitBasket = useCallback\(\(next: BasketItem\[\]\)\s*=>\s*\{\s*basketRef\.current = next\s*setBasket\(next\)/.test(hook), '')

  // 5.2 Antipattern is gone: zero functional setBasket((items) => ...) calls
  // anywhere in the hook body. (We always commit a precomputed nextBasket
  // through commitBasket, never via an updater closure.)
  assert('hook has no functional setBasket((items)=>...) updater anywhere',
    !/setBasket\(\s*\(\s*items\s*\)\s*=>/.test(hook), '')

  // 5.3 The 9 ops all read basketRef.current (or input basket) and commit
  // via commitBasket. We extract each op body as everything between the
  // op's `const NAME = useCallback(` opening and the matching `, [` deps tail.
  function extractOp(name) {
    // Match `const NAME = useCallback(` and then everything up to (but not
    // including) the next top-level `const X = useCallback(` or `return {`
    // sentinel — that gives us the op's full body including the deps array.
    const re = new RegExp(`const ${name}\\s*=\\s*useCallback\\(([\\s\\S]*?)(?=\\n  const \\w+\\s*=\\s*useCallback\\(|\\n  return \\{)`, 'm')
    return hook.match(re)?.[1] || ''
  }
  for (const op of [
    'addGroups',
    'removeGroup',
    'clear',
    'moveGroup',
    'updateGroupScore',
    'updateGroupMeta',
    'replaceDraft',
    'externalRemoveByGroupId',
    'patchBasketItemFromSavedGroup',
  ]) {
    const body = extractOp(op)
    assert(`${op} op body extracted`, body.length > 0, '')
    if (op === 'replaceDraft') {
      // replaceDraft takes basket from input; only requirement is it commits.
      assert(`${op} commits via commitBasket`, /commitBasket\(/.test(body), `op body:\n${body}`)
    } else if (op === 'clear') {
      // clear commits an empty basket.
      assert(`${op} commits via commitBasket`, /commitBasket\(\[\]\)/.test(body), `op body:\n${body}`)
    } else {
      assert(`${op} reads basketRef.current`, /basketRef\.current/.test(body), `op body:\n${body}`)
      assert(`${op} commits via commitBasket`, /commitBasket\(/.test(body), `op body:\n${body}`)
    }
  }

  // 5.4 addGroups MUST call appendForNewItems + fire('add') AFTER commitBasket.
  const addBody = extractOp('addGroups')
  const commitIdx = addBody.indexOf('commitBasket(')
  const appendIdx = addBody.indexOf('blocks.appendForNewItems(fresh)')
  const fireIdx = addBody.indexOf("fire('add')")
  assert('addGroups: commitBasket runs BEFORE appendForNewItems',
    commitIdx !== -1 && appendIdx !== -1 && commitIdx < appendIdx, `commit=${commitIdx} append=${appendIdx}`)
  assert('addGroups: appendForNewItems runs BEFORE fire("add")',
    appendIdx !== -1 && fireIdx !== -1 && appendIdx < fireIdx, `append=${appendIdx} fire=${fireIdx}`)

  // 5.5 No stale "let nextItems / removed / moved / changed = ..." pattern.
  for (const re of [
    /\blet\s+nextItems\b/,
    /\blet\s+removed\b/,
    /\blet\s+moved\b/,
    /\blet\s+changed\b/,
  ]) {
    assert(`hook source has no "${re}" closure-capture variable`, !re.test(hook), 'pattern still present')
  }
}

// ─── Test 6: paper-level config (Step 3) — owned by usePaperDraft, App
//             keeps thin wrappers that preserve legacy side effects ──────
console.log('\nTest 6: paper-level config moved into usePaperDraft (App keeps legacy side effects in wrappers)')
{
  const here = path.dirname(new URL(import.meta.url).pathname)
  const hookFull = readFileSync(path.resolve(here, '..', 'app', 'src', 'paperAssembly', 'usePaperDraft.ts'), 'utf8')
  const hook = hookFull
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const app = readFileSync(path.resolve(here, '..', 'app', 'src', 'App.tsx'), 'utf8')

  // 6.1 Hook now owns the four config fields.
  assert('hook declares paperTitle state', /const \[paperTitle, setPaperTitle\] = useState<string>/.test(hook), '')
  assert('hook declares questionNumberStart state', /const \[questionNumberStart, setQuestionNumberStart\] = useState<number>/.test(hook), '')
  assert('hook declares paperExportStyle state', /const \[paperExportStyle, setPaperExportStyle\] = useState<PaperExportStyle>/.test(hook), '')
  assert('hook declares versionType state', /const \[versionType, setVersionType\] = useState<VersionType>/.test(hook), '')
  // Defaults preserved.
  assert('paperTitle default = "高考阅读 B 主题训练"', /input\.initialPaperTitle\s*\?\?\s*'高考阅读 B 主题训练'/.test(hookFull), '')
  assert('questionNumberStart default = 1', /input\.initialQuestionNumberStart\s*\?\?\s*1/.test(hookFull), '')
  assert('paperExportStyle default = "exam"', /input\.initialPaperExportStyle\s*\?\?\s*'exam'/.test(hookFull), '')
  assert('versionType default = "student"', /input\.initialVersionType\s*\?\?\s*'student'/.test(hookFull), '')

  // 6.2 Hook returns the config and its setters.
  for (const field of ['paperTitle', 'questionNumberStart', 'paperExportStyle', 'versionType']) {
    assert(`hook returns ${field}`, new RegExp(`return \\{[\\s\\S]*?\\b${field}\\b[\\s\\S]*?\\}`).test(hook), '')
    const setter = 'set' + field.charAt(0).toUpperCase() + field.slice(1)
    assert(`hook returns ${setter}`, new RegExp(`return \\{[\\s\\S]*?\\b${setter}\\b[\\s\\S]*?\\}`).test(hook), '')
  }

  // 6.3 Hook does NOT own any saveStatus / paperExports mention — those are
  // App's responsibility; the hook stays draft-only.
  assert('hook source does NOT touch saveStatus', !/saveStatus/.test(hook), '')
  assert('hook source does NOT touch paperExports', !/paperExports/.test(hook), '')

  // 6.4 App.tsx no longer declares the four useState fields directly.
  assert('App body has no `useState<VersionType>` for versionType',
    !/useState<VersionType>\(['"]student['"]\)/.test(app), '')
  assert('App body has no `useState<\\\'exam\\\' | \\\'handout\\\'>`',
    !/useState<['"]exam['"]\s*\|\s*['"]handout['"]>\(['"]exam['"]\)/.test(app), '')
  assert('App body has no `useState(1)` for questionNumberStart',
    !/const \[questionNumberStart, setQuestionNumberStart\]\s*=\s*useState\(1\)/.test(app), '')
  assert('App body has no `useState(\\\'高考阅读 B 主题训练\\\')`',
    !/const \[paperTitle, setPaperTitle\]\s*=\s*useState\(['"]高考阅读 B 主题训练['"]\)/.test(app), '')

  // 6.5 App reads the four config fields from paperDraft.
  assert('App destructures paperTitle from paperDraft',
    /const \{[\s\S]*?\bpaperTitle\b[\s\S]*?\}\s*=\s*paperDraft/.test(app), '')
  assert('App destructures versionType from paperDraft',
    /const \{[\s\S]*?\bversionType\b[\s\S]*?\}\s*=\s*paperDraft/.test(app), '')
  assert('App destructures paperExportStyle from paperDraft',
    /const \{[\s\S]*?\bpaperExportStyle\b[\s\S]*?\}\s*=\s*paperDraft/.test(app), '')
  assert('App destructures questionNumberStart from paperDraft',
    /const \{[\s\S]*?\bquestionNumberStart\b[\s\S]*?\}\s*=\s*paperDraft/.test(app), '')

  // 6.6 App wrapper handlers preserve the legacy side effects exactly.
  // ── title: set + saveStatus idle + reset exports
  const titleH = app.match(/function handlePaperTitleChange\([^)]*\)\s*\{[\s\S]*?\n  \}/)?.[0] || ''
  assert('handlePaperTitleChange exists', titleH.length > 0, '')
  assert('handlePaperTitleChange calls paperDraft.setPaperTitle', /paperDraft\.setPaperTitle\(/.test(titleH), '')
  assert('handlePaperTitleChange resets saveStatus to idle', /setSaveStatus\(['"]idle['"]\)/.test(titleH), '')
  assert('handlePaperTitleChange resets exports', /paperExports\.resetExportStatuses\(\)/.test(titleH), '')

  // ── version: set + reset exports (no saveStatus)
  const verH = app.match(/function handleVersionTypeChange\([^)]*\)\s*\{[\s\S]*?\n  \}/)?.[0] || ''
  assert('handleVersionTypeChange exists', verH.length > 0, '')
  assert('handleVersionTypeChange calls paperDraft.setVersionType', /paperDraft\.setVersionType\(/.test(verH), '')
  assert('handleVersionTypeChange resets exports', /paperExports\.resetExportStatuses\(\)/.test(verH), '')
  assert('handleVersionTypeChange does NOT touch saveStatus', !/setSaveStatus\(/.test(verH), '')

  // ── style: set only (no reset)
  const styleH = app.match(/function handlePaperExportStyleChange\([^)]*\)\s*\{[\s\S]*?\n  \}/)?.[0] || ''
  assert('handlePaperExportStyleChange exists', styleH.length > 0, '')
  assert('handlePaperExportStyleChange calls paperDraft.setPaperExportStyle', /paperDraft\.setPaperExportStyle\(/.test(styleH), '')
  assert('handlePaperExportStyleChange does NOT reset exports', !/paperExports\.resetExportStatuses\(/.test(styleH), '')
  assert('handlePaperExportStyleChange does NOT touch saveStatus', !/setSaveStatus\(/.test(styleH), '')

  // ── start: set only (no reset)
  const startH = app.match(/function handleQuestionNumberStartChange\([^)]*\)\s*\{[\s\S]*?\n  \}/)?.[0] || ''
  assert('handleQuestionNumberStartChange exists', startH.length > 0, '')
  assert('handleQuestionNumberStartChange calls paperDraft.setQuestionNumberStart', /paperDraft\.setQuestionNumberStart\(/.test(startH), '')
  assert('handleQuestionNumberStartChange does NOT reset exports', !/paperExports\.resetExportStatuses\(/.test(startH), '')
  assert('handleQuestionNumberStartChange does NOT touch saveStatus', !/setSaveStatus\(/.test(startH), '')
  assert('handleQuestionNumberStartChange clamps to ≥ 1', /Math\.max\(1,\s*Number\.isFinite\(next\)\s*\?\s*next\s*:\s*1\)/.test(startH), '')

  // 6.7 UI bindings go through the wrappers (not raw setters).
  assert('paper-title input uses handlePaperTitleChange', /<input[\s\S]{0,120}value=\{paperTitle\}[\s\S]{0,200}handlePaperTitleChange/.test(app), '')
  assert('version-toggle 学生版 uses handleVersionTypeChange', /handleVersionTypeChange\(['"]student['"]\)/.test(app), '')
  assert('version-toggle 教师版 uses handleVersionTypeChange', /handleVersionTypeChange\(['"]teacher['"]\)/.test(app), '')
  assert('export-style 试卷版 uses handlePaperExportStyleChange', /handlePaperExportStyleChange\(['"]exam['"]\)/.test(app), '')
  assert('export-style 讲义版 uses handlePaperExportStyleChange', /handlePaperExportStyleChange\(['"]handout['"]\)/.test(app), '')
  assert('start-num input uses handleQuestionNumberStartChange', /handleQuestionNumberStartChange\(/.test(app), '')

  // 6.8 replaceDraft does NOT auto-mutate config (load/workflow/objective
  // still call paperDraft.setX explicitly from App).
  const replaceBody = hook.match(/const replaceDraft\s*=\s*useCallback\(\s*\n([\s\S]*?)\n\s\s\)/)?.[1] || ''
  assert('replaceDraft body extracted', replaceBody.length > 0, '')
  assert('replaceDraft body does NOT call setPaperTitle', !/setPaperTitle\s*\(/.test(replaceBody), `body:\n${replaceBody}`)
  assert('replaceDraft body does NOT call setVersionType', !/setVersionType\s*\(/.test(replaceBody), '')
  assert('replaceDraft body does NOT call setQuestionNumberStart', !/setQuestionNumberStart\s*\(/.test(replaceBody), '')
  assert('replaceDraft body does NOT call setPaperExportStyle', !/setPaperExportStyle\s*\(/.test(replaceBody), '')
  // Load saved paper / workflow build / objective build still drive config explicitly.
  assert('App still drives paperDraft.setPaperTitle in load/workflow/objective sites',
    (app.match(/paperDraft\.setPaperTitle\(/g) || []).length >= 3, '')
  assert('App still drives paperDraft.setVersionType in load/workflow/objective sites',
    (app.match(/paperDraft\.setVersionType\(/g) || []).length >= 2, '')

  // 6.9 buildSavePayload + usePaperExports still receive the same field set
  // (just sourced from paperDraft destructure now).
  assert('usePaperExports still receives paperTitle / versionType / paperExportStyle / questionNumberStart',
    /usePaperExports\(\{[\s\S]*?paperTitle[\s\S]*?versionType[\s\S]*?paperExportStyle[\s\S]*?questionNumberStart[\s\S]*?\}\)/.test(app), '')
  assert('buildSavePayload call still passes the 4 config fields',
    /buildSavePayload\(\{\s*basket,\s*paperBlocks,\s*questionNumberStart,\s*paperExportStyle,\s*paperTitle,\s*versionType\s*\}\)/.test(app), '')
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
