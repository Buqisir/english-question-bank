import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { frozenPath, readJson } from './corpus.mjs'

const [modulePath, directory, paperId, channel, output, ref, version, callId] = process.argv.slice(2)
const started = performance.now()
try {
  const paper = readJson(path.join(directory, 'manifest.json')).papers.find((entry) => entry.paperId === paperId)
  const input = (type) => readJson(frozenPath(directory, paper.inputs[type]))
  const module = await import(pathToFileURL(modulePath).href)
  let value
  if (channel === 'R') {
    value = module.buildSourceReferences(input('materialization'), input('evidence'), input('confirmation'))
  } else if (channel === 'T') {
    const manifest = input('manifest')
    const trace = input('trace')
    if (typeof module.buildTranscriptJoinDocuments !== 'function') {
      throw new Error(`${version} 不支持该通道 T：缺少生产入口 buildTranscriptJoinDocuments`)
    }
    const drafts = Object.fromEntries(Object.keys(paper.inputs).filter((type) => type.startsWith('draft:'))
      .map((type) => [type.slice('draft:'.length), input(type)]))
    const documents = []
    let totalJoins = 0
    for (const { document, pages: preparedPages } of module.buildTranscriptJoinDocuments({ documents: manifest.documents, trace, drafts })) {
      const pages = []
      let itemNumber = 0
      for (const { tracePage, draft, lines, items: joinedItems, joins, stateBefore, stateAfter, transitions } of preparedPages) {
        const sourceItems = draft.items || []
        const numbers = (item) => [...new Set([
          ...(item.lines ? module.replayExpand(item.lines, lines, tracePage.key) : []),
          ...(item.words ? module.replayExpand(item.words, lines, tracePage.key) : []),
        ])].sort((a, b) => a - b)
        const sourceNumbers = sourceItems.map(numbers)
        const furniture = new Set(module.replayExpand((draft.furniture || []).join(','), lines, tracePage.key))
        const items = joinedItems.map((item) => {
          const assigned = numbers(item)
          const set = new Set(assigned)
          // Include all original line/word owners, even if a future bad rule loses ownership.
          const sourceItemIndexes = sourceNumbers.flatMap((words, index) =>
            (words.some((number) => set.has(number)) || sourceItems[index] === item) ? [index] : [])
          const ordinary = item.imageOnly !== true
          if (ordinary) itemNumber += 1
          const wordNumbers = [...new Set([
            ...(item.lines ? module.replayExpand(item.lines, lines, tracePage.key).filter((number) => !furniture.has(number)) : []),
            ...(item.words ? module.replayExpand(item.words, lines, tracePage.key) : []),
          ])].sort((a, b) => a - b)
          return { itemId: ordinary ? `${document.documentId}:item-${itemNumber}` : null,
            sourceItemIndexes, wordNumbers, observationIds: wordNumbers.map((number) =>
              `${document.documentId}:page-${tracePage.page}:word-${number}`), ...item }
        })
        totalJoins += joins
        pages.push({ page: tracePage.page, key: tracePage.key, stateBefore, stateAfter, transitions, joins, items })
      }
      documents.push({ documentId: document.documentId, role: document.role, pages })
    }
    value = { documents, totalJoins }
  } else throw new Error(`Unknown channel: ${channel}`)
  writeFileSync(output, JSON.stringify({ paperId, channel, ref, version, callId, value,
    elapsedMs: performance.now() - started, peakRssBytes: process.resourceUsage().maxRSS * 1024 }), { flag: 'wx' })
} catch (error) {
  console.error(error.stack || String(error))
  process.exitCode = 1
}
