import { sourceReferenceBlocks } from '../../paper-import/sourceReferences.mjs'
import { projectApplicationReviewCardDisplay } from '../../../shared/writing/applicationReviewCard.mjs'
import { projectContinuationAnalysisDisplay } from '../../../shared/writing/continuationAnalysis.mjs'
import { isApplicationAnalysisV4 } from '../../../shared/writing/applicationAnalysisV4.mjs'
import { isContinuationAnalysisV3 } from '../../../shared/writing/continuationAnalysisV3.mjs'
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
    ${renderHeadingLead(groupHeading, `<section class="review-group"><h5>基本审题</h5><dl class="review-facts">${primaryRows.map(([label, values]) => row(label, values)).join('')}</dl></section>`)}
    <section class="review-group heading-lead"><h5>内容要点</h5><ol class="review-points">${display.points.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ol></section>
    <section class="review-group heading-lead"><h5>读者意识</h5><dl class="reader-facts">${readerRows.map(([label, values]) => row(label, values)).join('')}</dl></section>
  </section>`
}

export function statementAt(value) {
  return nonEmptyString(value?.statement) || nonEmptyString(value)
}

// One evidence line everywhere in the print: a run-in Label, then the quote
// (docs/product/companion-analysis-components.md). The passage source says
// 原文依据 as reading and listening do; the prompt and the starters keep
// their own names so the teacher can tell where the quote comes from.
export const evidenceSourceLabel = Object.freeze({
  instruction: '题干依据', material: '原文依据', paragraph1Starter: '段首句 1', paragraph2Starter: '段首句 2',
})

export function renderContinuationEvidence(evidence) {
  const items = array(evidence)
  if (items.length === 0) return ''
  return items.map((item) => `<p class="continuation-evidence"><span class="inline-label">${escapeHtml(evidenceSourceLabel[item?.source] || item?.source)}</span><span lang="en">“${escapeHtml(innerQuote(item?.excerpt))}”</span></p>`).join('')
}

export function renderGrounded(value) {
  if (!value) return ''
  return `<div class="continuation-grounded"><p>${escapeHtml(statementAt(value))}</p>${renderContinuationEvidence(value.evidence)}</div>`
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
  return array(values).map((item) => `<li>${renderGrounded(item)}</li>`).join('')
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
  const payoffs = clues.map((item) => `<li>${renderContinuationEvidence([item.clue])}<p>${escapeHtml(item.payoff)}</p></li>`).join('')
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

function signoffIndex(text, isContinuation) {
  return isContinuation ? -1 : paragraphLines(text)
    .findLastIndex(line => /^(?:Yours(?:[ ,]+(?:sincerely|faithfully|truly))?|Sincerely|Best (?:regards|wishes)|Kind regards|Regards)[,.]?$/iu.test(line))
}

// One essay: a run-in heading, then its paragraphs; a letter's sign-off lines
// stay together with the paragraph before them.
function renderModelEssay(text, label, isContinuation) {
  const paragraphs = paragraphBlocks(text, 'model-paragraph')
  const signoff = signoffIndex(text, isContinuation)
  if (signoff > 0) {
    const tail = paragraphs.splice(signoff - 1)
    paragraphs.push(`<div class="heading-lead model-signoff">${tail.join('')}</div>`)
  }
  return `<div class="model-essay">${renderHeadingLead(`<h4>${label}</h4>`, ...paragraphs)}</div>`
}

function sourceEssayTexts(source, legacySourceEssay) {
  const sourceEssays = array(source?.essays?.entries)
    .map(entry => sourceReferenceBlocks(entry)
      .filter(block => block.kind === 'paragraph')
      .map(block => block.paragraph.text).join('\n'))
    .filter(text => text.trim())
  if (sourceEssays.length === 0 && legacySourceEssay) sourceEssays.push(legacySourceEssay)
  return sourceEssays
}

export function renderWritingModels(source, legacySourceEssay, model, isContinuation) {
  const essays = sourceEssayTexts(source, legacySourceEssay).map(text => ({ text, label: '参考范文' }))
  if (model) essays.push({ text: model, label: '参考范文（AI 撰写）' })
  if (essays.length === 0) return ''
  const content = essays.map(({ text, label }) => renderModelEssay(text, label, isContinuation)).join('')
  return `<section class="writing-block model-answer"${isContinuation ? ' data-continuation-section="modelAnswer"' : ''}>${content}</section>`
}

// 应用文 V4 and 读后续写 V3 (docs/cuts/application-writing-v4/spec.md D6,
// docs/cuts/continuation-writing-v3/spec.md D6). One lecture in the order the
// spec gives; continuation adds only 读原文 before and 容易写偏 after the
// shared blocks. The group heading opens the first block so it never sits
// alone at a column foot.
function lectureBlock(name, title, body, groupHeading = '') {
  const [first = '', ...rest] = body
  return `<section class="writing-block lecture-block" data-writing-lecture-block="${name}">${renderHeadingLead(`${groupHeading}<h4>${escapeHtml(title)}</h4>`, first, ...rest)}</section>`
}

function lectureNotes(items) {
  return array(items).map(item => `<div class="lecture-note"><p class="lecture-quote" lang="en">“${escapeHtml(innerQuote(item.quote))}”</p><p class="lecture-explain">${escapeHtml(item.explain)}</p></div>`)
}

// A run-in label never ends a column: it and the first item below it stay together.
function labelled(label, items) {
  const [first = '', ...rest] = items
  return [`<div class="heading-lead"><p class="lecture-subhead"><span class="inline-label">${escapeHtml(label)}</span></p>${first}</div>`, ...rest]
}

function lectureEssay(name, text, label, isContinuation) {
  return `<section class="writing-block model-answer lecture-block" data-writing-lecture-block="${name}">${renderModelEssay(text, label, isContinuation)}</section>`
}

export function writingLectureOf(writing, isContinuation) {
  if (isContinuation) {
    return isContinuationAnalysisV3(writing?.continuationAnalysis) ? writing.continuationAnalysis : null
  }
  return isApplicationAnalysisV4(writing?.applicationAnalysis) ? writing.applicationAnalysis : null
}

export function renderWritingLecture(lecture, { groupHeading, isContinuation, source, legacySourceEssay }) {
  const blocks = []
  if (isContinuation) {
    blocks.push(['reading', '读原文', [
      ...array(lecture.reading.questions).map(item => `<div class="lecture-qa"><p class="lecture-question">${escapeHtml(item.question)}</p><p>${escapeHtml(item.answer)}</p></div>`),
      ...labelled('原文这里可以借', lectureNotes(array(lecture.reading.sourceLinks).map(link => ({ quote: link.sourceQuote, explain: link.use })))),
    ]])
  }
  blocks.push(['taskCard', '审题卡', [
    `<p class="lecture-subhead"><span class="inline-label">必须做到</span></p><ol class="lecture-list">${array(lecture.taskCard.taskRequires).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`,
    `<p><span class="inline-label">可以换</span>${escapeHtml(lecture.taskCard.thisEssayChooses)}</p>`,
  ]])
  const html = blocks.map(([name, title, body], index) => lectureBlock(name, title, body, index === 0 ? groupHeading : ''))
  html.push(lectureEssay('standardEssay', lecture.standard.essay, '标准版范文（AI 撰写）', isContinuation))
  // Each paragraph's heading travels with its first note only, so a long
  // paragraph can still run on into the next column.
  html.push(lectureBlock('notes', '逐段看', array(lecture.standard.notes).flatMap(note => {
    const [first = '', ...rest] = lectureNotes(note.items)
    return [`<div class="heading-lead lecture-paragraph"><h5>第 ${escapeHtml(note.paragraph)} 段：${escapeHtml(note.role)}</h5>${first}</div>`, ...rest]
  })))
  html.push(lectureBlock('expressions', '本题可用表达', array(lecture.standard.expressions).map(item =>
    `<p class="lecture-pair"><span class="lecture-term" lang="en">${escapeHtml(item.expression)}</span>${escapeHtml(item.function)}</p>`)))
  if (isContinuation) {
    html.push(lectureBlock('pitfalls', '容易写偏', array(lecture.standard.pitfalls).map(item =>
      `<p class="lecture-pair"><span class="lecture-term">${escapeHtml(withoutClosingPunctuation(item.pitfall))}</span>${escapeHtml(item.why)}</p>`)))
  }
  html.push(lectureEssay('advancedEssay', lecture.advanced.essay, '提高版范文（AI 撰写）', isContinuation))
  html.push(lectureBlock('beyondStandard', '提高版多做了什么', lectureNotes(lecture.advanced.beyondStandard)))
  const official = sourceEssayTexts(source, legacySourceEssay)
    .map(text => renderModelEssay(text, '参考范文', isContinuation)).join('')
  if (official) html.push(`<section class="writing-block model-answer"${isContinuation ? ' data-continuation-section="modelAnswer"' : ''}>${official}</section>`)
  return html.join('')
}

export function renderWritingGroup({ group, title, analysis, sourceReferencesByGroup, openingHeadings }) {
  const writing = analysis?.groups?.[group.groupId]?.writing
  const source = sourceReferencesByGroup?.get(group.groupId)
  const isContinuation = (source?.taskType ?? writing?.taskType) === 'continuation'
  const legacySourceEssay = nonEmptyString(writing?.officialModelAnswer)
  const model = nonEmptyString(writing?.modelAnswer)
  const groupTitle = title || group.title || (isContinuation ? '读后续写' : '应用文写作')
  const groupHeading = `${openingHeadings}<h3 class="group-title" data-running="${escapeHtml(groupTitle)}">${escapeHtml(groupTitle)}</h3>`
  const lecture = writingLectureOf(writing, isContinuation)
  if (lecture) {
    return `<section class="analysis-group analysis-group--writing">
    ${renderWritingLecture(lecture, { groupHeading, isContinuation, source, legacySourceEssay })}
  </section>`
  }
  const models = renderWritingModels(source, legacySourceEssay, model, isContinuation)
  if (!writing && !models) return ''
  const reviewCard = isContinuation ? '' : renderReviewCard(writing?.reviewCard, groupHeading)
  return `<section class="analysis-group analysis-group--writing">
    ${reviewCard || renderHeadingLead(groupHeading)}
    ${isContinuation ? renderContinuationAnalysis(writing?.continuationAnalysis) : ''}
    ${models}
  </section>`
}
