/**
 * Pure text helpers for passage rows (browse cards, home rows). Kept out of
 * the component files so React Fast Refresh sees component-only modules.
 */
import { groupTypeLabel, type QuestionGroupCard } from '../domain/questionBank.ts'

function isDisplayTag(tag: string | undefined): tag is string {
  const value = (tag || '').trim()
  if (!value) return false
  if (/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(value)) return false
  if (/^[\x21-\x7E]+$/.test(value) && value.length > 16) return false
  return !/(deepseek|steward|parse|eval|import|reading-parse|source-gap|gap-fill|导入草稿|管家规则|待审阅)/i.test(value)
}

export function compactPassageTitle(group: QuestionGroupCard): string {
  if (group.groupType === 'reading') {
    // Use the stored passage position, never the row's search-result order.
    for (const label of [group.section, group.passageTitle, group.title]) {
      const match = (label || '').match(/(?:Reading\s*|阅读(?:理解)?\s*)([A-G])(?:篇)?(?:$|[\s/：:])/i)
        || (label || '').trim().match(/^([A-G])篇$/i)
      if (match) return `${match[1].toUpperCase()}篇`
    }
  } else if (group.groupType !== 'other') {
    // Asset cards may use the common writing type for both writing sections.
    const writingSection = group.groupType === 'writing'
      ? group.section.match(/(应用文写作|读后续写)$/)?.[1]
      : null
    return writingSection || groupTypeLabel[group.groupType]
  }
  const passageTitle = (group.passageTitle || '').trim()
  if (passageTitle && isDisplayTag(passageTitle)) return passageTitle
  const title = (group.title || '').trim()
  if (title && isDisplayTag(title)) return title
  return '篇章题组'
}

export function compactSummary(group: QuestionGroupCard): string {
  const summary = (group.summary || '').trim()
  // 无真摘要的题组（完形/语法常见）summary 就是题组名本身——同词复读
  // 不渲，目录行只留名称。
  if (summary === compactPassageTitle(group) || summary === (group.passageTitle || '').trim()) return ''
  return summary
}

/**
 * Topic labels are stored as a full `theme-themeGroup-subtopic` path (e.g.
 * "人与自然-自然生态-生态环境"). The row shows only the leaf subtopic — the
 * specific, teacher-recognizable phrase — not the whole path.
 */
function topicLeafLabel(group: QuestionGroupCard): string | null {
  const first = group.topicLabels?.[0]
  if (!first) return null
  const leaf = (first.subtopic || first.label.split('-').pop() || '').trim()
  return leaf || null
}

/** Falls back to the first display-worthy free tag when no topic leaf is usable. */
export function buildTopicText(group: QuestionGroupCard): string | null {
  const topic = topicLeafLabel(group)
  if (topic && isDisplayTag(topic)) return topic
  const tag = group.tags?.find(isDisplayTag)
  return tag || null
}

