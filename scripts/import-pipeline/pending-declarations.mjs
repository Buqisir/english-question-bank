import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { validateWritingRoleDeclarations } from '../../server/paper-import/sourceReferenceRoleDeclarations.mjs'
import { sourceReferenceFigureIdentity } from '../../server/paper-import/sourceReferenceScoringScope.mjs'
import { applyEssayTextCorrections, sourceReferenceBlocks } from '../../server/paper-import/sourceReferences.mjs'
import { sourceReferenceCellContinuations } from '../../server/paper-import/sourceReferenceCellContinuation.mjs'

const names = {
  roles: 'source-reference-roles.json',
  exclusion: 'source-references-draft.json',
  corrections: 'source-reference-text-corrections.json',
  materialization: 'materialization/nck1-source-materialization-v1.json',
}
const optional = file => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
const list = dir => existsSync(dir) ? readdirSync(dir).sort() : []
const regionContains = (outer, inner) => inner && outer
  && inner.x >= outer.x - .001 && inner.y >= outer.y - .001
  && inner.x + inner.width <= outer.x + outer.width + .001
  && inner.y + inner.height <= outer.y + outer.height + .001

export async function writePendingDeclarations(ctx, materialization, flags) {
  const file = name => path.join(ctx.work, name)
  const artifact = name => path.join(ctx.paperDir, name)
  const evidence = optional(artifact('materialization/nck1-ocr-source-evidence-v1.json'))
  const confirmationPath = artifact('materialization/nck1-ocr-source-confirmation-v1.json')
  const confirmation = optional(confirmationPath)
  const pages = (confirmation?.documents ?? []).flatMap(({ documentId, pages }) =>
    pages.map(page => ({ ...page, documentId })))
  const items = new Map(pages.flatMap(({ page, documentId, orderedItems }) =>
    (orderedItems ?? []).map(item => [item.itemId, { ...item, page, documentId }])))
  const sourceText = source => {
    if (!source?.region || source.region.height >= 1) return null
    const page = pages.find(page => page.documentId === source.documentId && page.page === source.page)
    const observations = evidence?.documents.find(doc => doc.documentId === source.documentId)
      ?.pages.find(page => page.page === source.page)?.observations ?? []
    const ids = new Set(observations.filter(obs => regionContains(source.region, obs.region)).map(obs => obs.observationId))
    return page?.orderedItems?.filter(item => item.observationIds?.some(id => ids.has(id))).map(item => item.text).join(' ')
  }
  const lines = ['# 待声明清单', '', '依据现有诊断及留存声明生成。请对照原页确认后走对应入口。', '']
  function add(category, source, quote, destination, example, reason) {
    const page = source?.page
    lines.push(`## ${category}`, '',
      `- 页码　${page == null ? '现有诊断未定位' : [source.documentId, page].filter(Boolean).join(' · ')}`,
      `- 原文　${JSON.stringify((quote || sourceText(source) || '现有诊断未摘录').slice(0, 240))}`,
      `- 声明入口　${destination}`, `- 示例　${example}`, `- 原因　${String(reason).replace(/\s+/gu, ' ')}`, '')
  }
  const questions = [...(materialization.listening?.questions ?? []), ...(materialization.groups ?? []).flatMap(group => group.questions ?? [])]
  for (const { code, path: issuePath, source: locator, message } of materialization.issues ?? []) {
    const number = Number(/^questions\.(\d+)(?:\.|$)/u.exec(issuePath)?.[1])
    const question = questions.find(item => item.canonicalNumber === number)
    const source = locator?.region?.height >= 1 ? question?.source ?? locator : locator
    if (/(?:QUESTION_NUMBER_AMBIGUOUS|SOURCE_NUMBER_MISMATCH)$/u.test(code)) {
      add('题号映射', source, sourceText(source) || question?.stem, `drafts/<页键>.json → ${names.materialization}`,
        '`drafts` 保留印刷题号，例如 `{"lines":"L05","text":"1. What does the author suggest?"}`；旧制重排后对应 `sourceNumber: 1, canonicalNumber: 21`。',
        `${issuePath} · ${message}`)
    } else if (/STEM_OPTIONS_BOUNDARY_AMBIGUOUS$/u.test(code)) {
      add('图内选项', source, sourceText(source) || question?.stem, '现有 selection JSON（`in-image-option-labels.mjs plan --selection`）',
        '`in-image-option-labels.mjs plan <paperId> --paper-dir <卷目录> --selection <selection.json> --output <plan.json>`',
        `${issuePath} · ${message}。先核实字母确实印在图内。`)
    }
  }
  if (confirmation && evidence) {
    const confirmationSha = sha256(readFileSync(confirmationPath))
    const archived = path.join(ctx.work, 'superseded')
    const previous = list(archived).filter(name => name.endsWith(`-${path.basename(names.materialization)}`)).at(-1)
    const prior = previous ? optional(path.join(archived, previous)) : null
    const joinPlans = list(ctx.work).filter(name => /^paragraph-join-[a-f0-9]+\.json$/u.test(name))
      .map(name => optional(file(name)))
    for (const join of prior?.paragraphJoins ?? []) {
      if (join.confirmationSha256 === confirmationSha
        || materialization.paragraphJoins?.some(current => current.joinId === join.joinId)) continue
      const plan = joinPlans.find(plan => plan?.relation?.joinId === join.joinId)
      add('跨页拼接', { ...join.fragments[0].source, page: join.fragments.map(fragment => fragment.source.page).join('、') },
        plan?.before?.join(' / '), 'paragraph-join-<计划摘要>.json（`paragraph-join.mjs plan/apply`）',
        '`paragraph-join.mjs plan <paperId> --group <groupId> --items <新itemId1,新itemId2> --reason "<原页依据>" --output <新计划.json>`',
        '原拼接绑定的 OCR 确认已换代，当前材料未携带该拼接。')
    }
    for (const decision of prior?.inImageOptionLabels ?? []) {
      if (decision.confirmationDigest === digestJson(confirmation)
        || materialization.inImageOptionLabels?.some(current => current.questionId === decision.questionId)) continue
      add('图内选项', decision.parentSource, decision.labels?.map(label => label.label).join(' / '),
        '现有 selection JSON（`in-image-option-labels.mjs plan --selection`）',
        '`in-image-option-labels.mjs plan <paperId> --paper-dir <卷目录> --selection <重新核对的selection.json> --output <新计划.json>`',
        `原声明的 OCR 确认已换代 · ${decision.questionId}`)
    }
    if (materialization.groups?.some(group => group.writingTask)) {
      await collectWriting({ ctx, materialization, evidence, confirmation, items, flags, add, file, artifact })
    }
  }
  if (lines.length === 4) lines.push('当前诊断未发现待声明项。', '')
  const output = file('pending-declarations.md')
  writeFileSync(output, lines.join('\n'))
  return output
}
async function collectWriting({ ctx, materialization, evidence, confirmation, items, flags, add, file, artifact }) {
  const roleFile = optional(file(names.roles))
  const roles = []
  const role = (item, reason, entry = {}) => add('写作角色', item, entry.quote ?? item?.text, names.roles,
    `\`${JSON.stringify({ entries: [{ itemId: item?.itemId ?? '<当前itemId>', page: item?.page ?? 1,
      quote: item?.text ?? '<原文>', role: entry.role ?? 'sample-heading',
      taskType: entry.taskType ?? 'application', reason: '<原页依据>' }] })}\``, reason)
  for (const entry of (Array.isArray(roleFile) ? roleFile : roleFile?.entries ?? [])) {
    try {
      roles.push(validateWritingRoleDeclarations([...roles, entry], { materialization, confirmation }).at(-1))
    } catch (error) {
      role(items.get(entry.itemId) ?? entry, error.message, entry)
    }
  }
  const retained = optional(file(names.exclusion)) ?? optional(artifact('source-references-v1.json'))
  const exclusions = []
  const exclude = (entry, reason, source = items.get(entry.anchorItemId)) =>
    add('写作排除', source, items.get(entry.anchorItemId)?.text, `${names.exclusion}（由 \`source-reference-exclusion.mjs\` 写入）`,
      `\`source-reference-exclusion.mjs ${ctx.paperId} --figure ${entry.figureId} --figure-sha256 ${entry.currentIdentity ?? '<当前图身份摘要>'} --anchor ${entry.currentAnchor ?? '<当前itemId>'} --reason "<原页依据>" --agent-confirmed\``, reason)
  for (const entry of retained?.figureExclusions ?? []) {
    if (entry.evidenceDigest !== digestJson(evidence) || entry.confirmationDigest !== digestJson(confirmation)) {
      exclude(entry, '原排除声明绑定的 OCR 已换代。')
    } else exclusions.push(entry)
  }
  const correctionFile = optional(file(names.corrections))
  const correction = (entry, source, reason) => add('范文文字更正', source, entry.before, names.corrections,
    `\`${JSON.stringify({ entries: [entry] })}\``, reason)
  const manifest = optional(artifact('universal-source-manifest.json'))
  if (!manifest || retained?.wholeDocumentWritingAbsence || sourceReferenceCellContinuations(retained).length) return
  const { buildSourceReferences } = await import('./ocr-proofread.mjs')
  let result
  try {
    result = buildSourceReferences(materialization, evidence, confirmation, {
      sourceDocuments: manifest.documents.map(doc => ({ ...doc, bytes: readFileSync(artifact(doc.path)) })),
      referenceSourceManifest: manifest, paperName: manifest.provenance?.paperName,
      figureExclusions: exclusions, writingRoleDeclarations: roles,
    })
  } catch (error) {
    for (const figure of error.unresolvedReferenceFigures ?? []) {
      exclude({ figureId: figure.sourceRegionId, anchorItemId: figure.afterItem.itemId,
        currentIdentity: sourceReferenceFigureIdentity(figure), currentAnchor: figure.afterItem.itemId }, error.message, figure.source)
    }
    if (!error.unresolvedReferenceFigures) add('写作源参考待核对', null, null, names.roles,
      '`{"entries":[{"itemId":"<当前itemId>","page":1,"quote":"<原文>","role":"not-writing","reason":"<原页依据>"}]}`', error.message)
    return
  }
  for (const finding of result.review) {
    if (finding.itemId && finding.issue?.startsWith('writing references degraded to not_supplied:')) {
      role(items.get(finding.itemId), finding.issue, { taskType: finding.taskType })
    }
  }
  const paragraphs = result.groups.flatMap(group => group.essays.entries.flatMap(entry =>
    sourceReferenceBlocks(entry).filter(block => block.kind === 'paragraph').map(block => block.paragraph)))
  const entries = correctionFile?.entries ?? []
  const sourceFor = entry => paragraphs.find(p => p.paragraphId === entry.paragraphId)?.source?.locator
  for (const entry of entries) {
    try {
      applyEssayTextCorrections(structuredClone(result.groups), [entry])
    } catch (error) {
      correction(entry, sourceFor(entry), error.message)
    }
  }
  for (const flag of flags.flatMap(flag => flag.flags ?? [])) {
    if (!flag.after || !flag.quote || flag.decision === 'uncertain') continue
    for (const paragraph of paragraphs) {
      const source = paragraph.source?.locator
      if (flag.page !== `${source?.documentId}-p${String(source?.page).padStart(2, '0')}`
        || !paragraph.text.includes(flag.context ?? flag.quote)
        || entries.some(entry => entry.paragraphId === paragraph.paragraphId && entry.before === flag.quote)) continue
      correction({ paragraphId: paragraph.paragraphId, before: flag.quote, after: flag.after, reason: flag.reason },
        source, '原页文字更正已记录，范文源参考缺对应声明。')
    }
  }
}
