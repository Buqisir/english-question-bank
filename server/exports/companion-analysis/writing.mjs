import { sourceReferenceBlocks } from '../../paper-import/sourceReferences.mjs'
import { projectApplicationReviewCardDisplay } from '../../../shared/writing/applicationReviewCard.mjs'
import { projectContinuationAnalysisDisplay } from '../../../shared/writing/continuationAnalysis.mjs'
import { renderHeadingLead } from './blocks.mjs'
import { array, escapeHtml, innerQuote, nonEmptyString, paragraphBlocks, paragraphLines, withoutClosingPunctuation } from './text.mjs'

export function renderReviewCard(reviewCard, groupHeading) {
  const display = projectApplicationReviewCardDisplay(reviewCard)
  if (!display) return ''
  const row = (label, values) => `<div><dt>${escapeHtml(label)}</dt><dd>${values
    .map((value) => `<span>${escapeHtml(value)}</span>`)
    .join('')}</dd></div>`
  const primaryRows = [
    ['形式', [display.form]],
    ['主题与目的', display.topicPurpose],
    ['人称', [display.person]],
    ['时态', [display.tense]],
  ]
  const readerRows = [
    ['读者与关系', display.readerRelationship],
    ['读者需要', display.readerNeeds],
    ['写作价值', [display.value]],
  ]
  return `<section class="writing-block review-card" data-review-card-version="${display.sourceVersion}">
    ${renderHeadingLead(groupHeading + '<h4>审题卡</h4>', `<section class="review-group"><h5>基本审题</h5><dl class="review-facts">${primaryRows.map(([label, values]) => row(label, values)).join('')}</dl></section>`)}
    <section class="review-group heading-lead"><h5>内容要点</h5><ol class="review-points">${display.points.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ol></section>
    <section class="review-group heading-lead"><h5>读者意识</h5><dl class="reader-facts">${readerRows.map(([label, values]) => row(label, values)).join('')}</dl></section>
  </section>`
}

export function statementAt(value) {
  return nonEmptyString(value?.statement) || nonEmptyString(value)
}

export const evidenceSourceLabel = Object.freeze({
  instruction: '题干', material: '原文', paragraph1Starter: '段首句 1', paragraph2Starter: '段首句 2',
})

export function renderContinuationEvidence(evidence, { withinList = false } = {}) {
  const items = array(evidence)
  if (items.length === 0) return ''
  const itemTag = withinList ? 'p' : 'li'
  const lines = items.map((item) => `<${itemTag}><b>${escapeHtml(evidenceSourceLabel[item?.source] || item?.source)}</b>：“${escapeHtml(innerQuote(item?.excerpt))}”</${itemTag}>`).join('')
  return withinList ? lines : `<ul class="continuation-evidence">${lines}</ul>`
}

export function renderGrounded(value, options) {
  if (!value) return ''
  return `<div class="continuation-grounded"><p>${escapeHtml(statementAt(value))}</p>${renderContinuationEvidence(value.evidence, options)}</div>`
}

export function renderGroundedList(values) {
  return array(values).map((value) => renderGrounded(value)).join('')
}

export function renderContinuationStory(story) {
  const characters = array(story.characters).map((character) => `<div class="route-paragraph"><h5>${escapeHtml(character.name)}：${escapeHtml(character.role)}</h5>${renderGroundedList(character.establishedTraits)}${renderGroundedList(character.motivations)}${renderGrounded(character.currentState)}</div>`).join('')
  const relationships = array(story.relationships).map((item) => renderHeadingLead(
    `<b>${escapeHtml(array(item.participants).join('、'))}</b>`, renderGrounded(item.currentRelation))).join('')
  const causal = array(story.causalChain).map((item) => `<div class="route-paragraph"><h5>因果</h5>${renderGrounded(item.cause)}${renderGrounded(item.effect)}</div>`).join('')
  return `<section class="writing-block continuation-section" data-continuation-section="storyUnderstanding"><h4>原文理解</h4>
    <dl class="story-map">
      <div><dt>中心情境</dt><dd>${renderGrounded(story.centralSituation)}</dd></div>
      <div><dt>原文终点</dt><dd>${renderGrounded(story.sourceEndState)}</dd></div>
      <div><dt>叙事视角</dt><dd>${renderGrounded(story.narrativePerspective)}</dd></div>
      <div><dt>时空框架</dt><dd>${renderGrounded(story.timeAndPlaceFrame)}</dd></div>
      <div><dt>人物</dt><dd>${characters}</dd></div>
      ${relationships ? `<div><dt>关系</dt><dd>${relationships}</dd></div>` : ''}
      <div><dt>因果链</dt><dd>${causal}</dd></div>
      <div><dt>未决问题</dt><dd>${renderGrounded(story.unresolvedProblem)}</dd></div>
      <div><dt>可用线索</dt><dd>${renderGroundedList(story.usableClues)}</dd></div>
      <div><dt>意义方向</dt><dd><p>${escapeHtml({ explicit: '原文已说明', stronglyInferred: '强推断', open: '开放' }[story.meaningDirection?.confidence] || '')}</p>${renderGrounded(story.meaningDirection)}</dd></div>
      <div><dt>原文风格</dt><dd>${renderGrounded(story.sourceStyle)}</dd></div>
    </dl></section>`
}

export function renderConstraints(values) {
  return array(values).map((item) => `<li>${renderGrounded(item, { withinList: true })}</li>`).join('')
}

export function renderContinuationContract(contract) {
  const paragraphs = array(contract.paragraphs).map((paragraph) => `<div class="route-paragraph"><h5>第 ${paragraph.paragraphIndex} 段约束</h5>
    ${renderGrounded(paragraph.entryState)}${renderGrounded(paragraph.starterFunction)}
    <b>必须完成</b><ul>${renderConstraints(paragraph.requiredMoves)}</ul>
    <b>退出状态</b><ul>${renderConstraints(paragraph.requiredExitState)}</ul>
    ${array(paragraph.supportedOptions).length ? `<b>可选路径</b>${renderGroundedList(paragraph.supportedOptions)}` : ''}</div>`).join('')
  return `<section class="writing-block continuation-section" data-continuation-section="continuationContract"><h4>续写约束</h4>
    <b>必须遵守</b><ul>${renderConstraints(contract.hardConstraints)}</ul>
    ${array(contract.softAffordances).length ? `<b>适宜采用</b>${renderGroundedList(contract.softAffordances)}` : ''}
    ${array(contract.openChoices).length ? `<b>创作自由</b><ul>${array(contract.openChoices).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
    <b>禁止矛盾</b><ul>${renderConstraints(contract.forbiddenContradictions)}</ul>
    ${paragraphs}<b>收束要求</b><ul>${renderConstraints(contract.closureRequirements)}</ul></section>`
}

export function renderDevelopmentParagraph(paragraph) {
  const field = value => escapeHtml(withoutClosingPunctuation(value))
  const emotions = array(paragraph.emotionChanges).map((item) =>
    `<li><p>触发：${field(item.trigger)}</p><p>变化：${field(item.from)} → ${field(item.to)}</p><p>表现：${field(item.visibleAction)}</p></li>`).join('')
  const relationships = array(paragraph.relationshipChanges).map((item) => `<li>${escapeHtml(array(item.participants).join('、'))}：${escapeHtml(item.from)} → ${escapeHtml(item.to)}；${escapeHtml(item.cause)}</li>`).join('')
  const clues = array(paragraph.cluePayoffs)
  const payoffs = clues.map((item) => `<li>${renderContinuationEvidence([item.clue], { withinList: true })}<p>${escapeHtml(item.payoff)}</p></li>`).join('')
  const evidence = array(paragraph.sourceEvidence).filter(item =>
    !clues.some(({ clue }) => clue?.source === item.source && clue?.excerpt === item.excerpt))
  return `<div class="route-paragraph"><h5>第 ${paragraph.paragraphIndex} 段</h5>
    <p><b>${paragraph.paragraphPurpose !== undefined ? '段落作用' : '起因'}</b>：${escapeHtml(paragraph.paragraphPurpose ?? paragraph.cause)}</p><p><b>行动</b>：${escapeHtml(paragraph.action)}</p><p><b>结果</b>：${escapeHtml(paragraph.result)}</p>
    ${renderContinuationEvidence(evidence)}${payoffs ? `<b>线索回收</b><ul>${payoffs}</ul>` : ''}
    ${emotions ? `<b>情绪变化</b><ul>${emotions}</ul>` : ''}${relationships ? `<b>关系变化</b><ul>${relationships}</ul>` : ''}
    ${paragraph.languageReminder ? `<p><b>语言提醒</b>：${escapeHtml(paragraph.languageReminder)}</p>` : ''}
    <p><b>${paragraph.paragraphIndex === 1 ? '段间衔接' : '结尾落点'}</b>：${escapeHtml(paragraph.bridge || paragraph.ending)}</p></div>`
}

export function renderLegacyContinuationDetails(legacy) {
  if (!legacy) return ''
  return `<div class="legacy-analysis-preserved"><h5>历史分析保留</h5>
    ${renderGrounded(legacy.coreTension)}${renderGroundedList(legacy.drivingMotivations)}${renderGroundedList(legacy.requiredTurningPoints)}
    ${array(legacy.eventChain).map((item) => `<p>${escapeHtml(item.cause)} → ${escapeHtml(item.event)} → ${escapeHtml(item.immediateEffect)}</p>${renderContinuationEvidence(item.evidence)}`).join('')}
    ${array(legacy.emotionLogic).map((item) => `<p>${escapeHtml(item.trigger)}：${escapeHtml(item.internalResponse)}；${escapeHtml(item.visibleAction)}</p>`).join('')}
    ${array(legacy.relationshipMovement).map((item) => `<p>${escapeHtml(array(item.participants).join('、'))}：${escapeHtml(item.from)} → ${escapeHtml(item.to)}；${escapeHtml(item.cause)}</p>`).join('')}
    ${array(legacy.interactionMoves).map((item) => `<p>${escapeHtml(item.speaker)} → ${escapeHtml(item.listener)}：${escapeHtml(item.purpose)}；${escapeHtml(item.relationshipNeed)}；${escapeHtml(item.expectedEffect)}</p>${renderContinuationEvidence(item.evidence)}`).join('')}
    ${array(legacy.cluePayoffs).map((item) => `${renderContinuationEvidence([item.clue])}<p>${escapeHtml(item.payoff)}</p>`).join('')}
    ${array(legacy.characterActionsByParagraph).map((item) => `<p><b>第 ${item.paragraphIndex} 段人物行动</b>：${array(item.items).map(escapeHtml).join('；')}</p>`).join('')}
    <p>${escapeHtml(legacy.endingState)}</p><p>${escapeHtml(legacy.finalEffect)}</p>
    <p>${escapeHtml([legacy.languageAlignment.personAndPerspective, legacy.languageAlignment.baseTense, legacy.languageAlignment.narrativeDistanceAndRegister, legacy.languageAlignment.sourceStyleContinuity, legacy.languageAlignment.dialoguePolicy].filter(Boolean).join('；'))}</p>
    <p>${escapeHtml([
      ...array(legacy.languageAlignment.licensedTenseShifts),
      ...array(legacy.languageAlignment.cohesionPlan).map((item) => `${item.relation}：${item.use}`),
      ...array(legacy.languageAlignment.descriptionPriorities),
      ...array(legacy.languageAlignment.functionLedLanguage),
    ].join('；'))}</p></div>`
}

export function renderContinuationAnalysis(analysis) {
  const display = projectContinuationAnalysisDisplay(analysis)
  if (!display) return ''
  const plan = display.developmentPlan
  return `${renderContinuationStory(display.storyUnderstanding)}${renderContinuationContract(display.continuationContract)}
    <section class="writing-block continuation-section" data-continuation-section="developmentPlan">
      ${renderHeadingLead('<h4>两段发展方案</h4>', `<p><b>选定路线</b>：${escapeHtml(plan.selectedRoute)}</p>`)}${renderGroundedList(plan.routeRationale)}
      ${array(plan.paragraphs).map(renderDevelopmentParagraph).join('')}
      ${array(plan.alternatives).length ? `<b>其他可行路线</b><ul>${array(plan.alternatives).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
      ${renderLegacyContinuationDetails(display.legacyDetails)}
    </section>`
}

export function renderWritingModels(source, legacySourceEssay, model, isContinuation) {
  const sourceEssays = array(source?.essays?.entries)
    .map(entry => sourceReferenceBlocks(entry)
      .filter(block => block.kind === 'paragraph')
      .map(block => block.paragraph.text).join('\n'))
    .filter(text => text.trim())
  if (sourceEssays.length === 0 && legacySourceEssay) sourceEssays.push(legacySourceEssay)
  const essays = sourceEssays.map(text => ({ text, label: '参考范文' }))
  if (model) essays.push({ text: model, label: '参考范文（AI 撰写）' })
  if (essays.length === 0) return ''
  const content = essays.map(({ text, label }) => {
    const paragraphs = paragraphBlocks(text, 'model-paragraph')
    const signoff = isContinuation ? -1 : paragraphLines(text)
      .findLastIndex(line => /^(?:Yours(?:[ ,]+(?:sincerely|faithfully|truly))?|Sincerely|Best (?:regards|wishes)|Kind regards|Regards)[,.]?$/iu.test(line))
    if (signoff > 0) {
      const tail = paragraphs.splice(signoff - 1)
      paragraphs.push(`<div class="heading-lead model-signoff">${tail.join('')}</div>`)
    }
    return `<div class="model-essay">${renderHeadingLead(`<h4>${label}</h4>`, ...paragraphs)}</div>`
  }).join('')
  return `<section class="writing-block model-answer"${isContinuation ? ' data-continuation-section="modelAnswer"' : ''}>${content}</section>`
}

export function renderWritingGroup({ group, title, analysis, sourceReferencesByGroup, openingHeadings }) {
  const writing = analysis?.groups?.[group.groupId]?.writing
  const source = sourceReferencesByGroup?.get(group.groupId)
  const isContinuation = (source?.taskType ?? writing?.taskType) === 'continuation'
  const legacySourceEssay = nonEmptyString(writing?.officialModelAnswer)
  const model = nonEmptyString(writing?.modelAnswer)
  const models = renderWritingModels(source, legacySourceEssay, model, isContinuation)
  if (!writing && !models) return ''
  const groupTitle = title || group.title || (isContinuation ? '读后续写' : '应用文写作')
  const groupHeading = `${openingHeadings}<h3 class="group-title" data-running="${escapeHtml(groupTitle)}">${escapeHtml(groupTitle)}</h3>`
  const reviewCard = isContinuation ? '' : renderReviewCard(writing?.reviewCard, groupHeading)
  return `<section class="analysis-group analysis-group--writing">
    ${reviewCard || renderHeadingLead(groupHeading)}
    ${isContinuation ? renderContinuationAnalysis(writing?.continuationAnalysis) : ''}
    ${models}
  </section>`
}
