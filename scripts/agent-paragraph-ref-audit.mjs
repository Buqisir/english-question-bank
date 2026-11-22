#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { inlineText, projectAgentPassage, sourceBlocks } from '../server/agent-api/agentPassage.mjs'

const ordinals = 'first second third fourth fifth sixth seventh eighth ninth tenth'.split(' ')
const paragraphRef = new RegExp(`\\b(?:paragraph\\s+|para\\.\\s*)([1-9]\\d*)\\b|\\bthe\\s+(?:([1-9]\\d*)(?:st|nd|rd|th)|(${ordinals.join('|')}))\\s+paragraph\\b`, 'giu')
const quote = /“([^”]+)”|‘([^’]+)’|"([^"]+)"|(?<![\p{L}\p{N}])'([^']+)'(?![\p{L}\p{N}])/gu
const stops = new Set('a an the my her his their its our your this that these those some of and or to in on for at by with from as is are was were does did author writer paragraph passage underlined word phrase expression example'.split(' '))
const words = value => value.toLowerCase().match(/[a-z]+(?:['’][a-z]+)?/g) || []

function findTargets(stem) {
  const quotes = [...stem.matchAll(quote)].map(match => words(match.slice(1).find(Boolean))).filter(tokens => tokens.length)
  if (quotes.length) return quotes
  const object = stem.replace(paragraphRef, '').match(
    /\b(?:mentions?|mentioning|mentioned|refers? to|refer to|meaning of|mean by|describes?|describe|discuss(?:es)?|says? about)\s+(.+?)(?=\s+(?:in|from|according to)\s*(?:[?,.]|$)|[?,.]|$)/iu,
  )?.[1]
  return object ? words(object).filter(word => !stops.has(word)).map(word => [word]) : []
}

function questionTexts(question) {
  return [question.stem, ...question.options.map(option => option.content)].filter(value => typeof value === 'string')
}

export function auditParagraphRefs(paper) {
  const issues = []
  for (const group of paper.groups) {
    const paragraphs = new Map()
    for (const paragraph of group.passage?.paragraphs || []) {
      if (paragraph.naturalParagraph == null) continue
      const text = paragraph.text ?? inlineText(paragraph.nodes)
      paragraphs.set(paragraph.naturalParagraph, `${paragraphs.get(paragraph.naturalParagraph) || ''} ${text}`.trim())
    }
    for (const question of group.questions) {
      for (const value of questionTexts(question)) {
        for (const match of value.matchAll(paragraphRef)) {
          const citedParagraph = Number(match[1] || match[2] || (ordinals.indexOf(match[3]?.toLowerCase()) + 1))
          const targets = findTargets(value)
          if (!targets.length) continue
          const matchesTarget = text => {
            const haystack = ` ${words(text).join(' ')} `
            return targets.every(target => haystack.includes(` ${target.join(' ')} `))
          }
          if (matchesTarget(paragraphs.get(citedParagraph) || '')) continue
          const found = [...paragraphs].filter(([, text]) => matchesTarget(text))
          const text = found.length === 1 ? found[0][1] : value
          const start = found.length === 1 ? Math.max(0, text.toLowerCase().indexOf(targets[0].join(' ')) - 25) : 0
          issues.push({ paperId: paper.paperId, groupId: group.groupId, questionNo: question.number,
            citedParagraph, actualParagraph: found.length === 1 ? found[0][0] : null,
            snippet: text.slice(start, start + 105) })
        }
      }
    }
  }
  return issues
}

function localPapers(roots) {
  const selected = new Map()
  for (const root of roots) {
    const entries = readdirSync(root, { recursive: true, withFileTypes: true })
    for (const file of entries) {
      if (!file.isFile() || !/^nck1-source-materialization-v\d+\.json$/u.test(file.name)) continue
      const absolute = path.join(file.parentPath, file.name)
      const materialization = JSON.parse(readFileSync(absolute))
      if (!materialization.paperId || !Array.isArray(materialization.groups)) continue
      const mtime = statSync(absolute).mtimeMs
      if ((selected.get(materialization.paperId)?.mtime ?? -1) < mtime) selected.set(materialization.paperId, { materialization, mtime })
    }
  }
  return [...selected.values()].map(({ materialization }) => ({
    paperId: materialization.paperId,
    groups: materialization.groups.map(group => {
      const paragraphs = Array.from(sourceBlocks(group.blocks)).filter(block => block.kind === 'paragraph')
        .map(block => ({ paragraphId: block.blockId, text: inlineText(block.content) }))
      return {
        groupId: group.groupId,
        passage: projectAgentPassage(materialization.paperId, { paragraphs }, group, undefined, materialization.paragraphJoins),
        questions: group.questions.map(question => ({ number: question.canonicalNumber, stem: question.stem,
          options: (question.options?.length ? question.options : group.optionBank || []).map(option => ({ content: option.text })) })),
      }
    }),
  }))
}

async function apiPapers() {
  const token = process.env.EQB_AGENT_TOKEN
  if (!token) throw new Error('EQB_AGENT_TOKEN is required for the Agent API.')
  const base = new URL(process.env.EQB_AGENT_BASE_URL || 'https://eqbank.cc')
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))) {
    throw new Error('Use HTTPS or local HTTP for the Agent API.')
  }
  const response = await fetch(new URL('/api/agent/v1/export', base), {
    headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`Agent export failed with HTTP ${response.status}.`)
  return (await response.text()).split('\n').filter(Boolean).map(line => JSON.parse(line))
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const args = process.argv.slice(2)
  const useApi = args[0] === '--api'
  const papers = useApi ? await apiPapers() : localPapers(args.length ? args : [path.join(homedir(), '.cache/eqbank')])
  if (!papers.length) throw new Error('No papers found.')
  const issues = papers.flatMap(auditParagraphRefs)
  for (const issue of issues.sort((a, b) => a.paperId.localeCompare(b.paperId) || a.questionNo - b.questionNo)) {
    console.log(JSON.stringify(issue))
  }
  const questions = papers.flatMap(paper => paper.groups.flatMap(group => group.questions))
  const references = questions.flatMap(questionTexts).filter(text => [...text.matchAll(paragraphRef)].length)
  console.error(JSON.stringify({ source: useApi ? 'agent_api' : 'local_materialization', papers: papers.length,
    references: references.length, withLexicalTarget: references.filter(text => findTargets(text).length).length, issues: issues.length }))
}
