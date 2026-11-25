/**
 * 写作讲评新版（应用文 V4、读后续写 V3）的网页讲解。
 *
 * 规范：docs/cuts/application-writing-v4/spec.md D5、docs/cuts/continuation-writing-v3/spec.md D5。
 * 范文放在答题框里，答题框上面一个「标准版 / 提高版」切换；讲解放在右栏，按下面的顺序：
 *
 *   读原文（只有续写）→ 审题卡 → 逐段看 → 本题可用表达 → 容易写偏（只有续写）→ 提高版多做了什么（切到提高版时）
 *
 * 两种题共用审题卡、逐段看、本题可用表达、提高版多做了什么和切换；续写只多读原文、容易写偏两块。
 * 段落之间靠间距分开，不画空行。旧格式（应用文 reviewCard、续写 V1/V2）不走这里，照旧渲染（D7）。
 */
import type { ReactNode } from 'react'
import type {
  ApplicationAnalysisV4,
  ApplicationQuoteNote,
  WritingAnalysis,
} from '../../domain/paperAsset.ts'
import type { ContinuationAnalysisV3 } from '../../domain/continuationAnalysis.ts'
import { isApplicationAnalysisV4 } from '../../../../shared/writing/applicationAnalysisV4.mjs'
import { isContinuationAnalysisV3 } from '../../../../shared/writing/continuationAnalysisV3.mjs'
import { SegmentedField } from '../../shared-ui/OptionField.tsx'

export type EssayVariant = 'standard' | 'advanced'

export type WritingLectureV4 =
  | { taskType: 'application'; analysis: ApplicationAnalysisV4; officialModelAnswer?: string }
  | { taskType: 'continuation'; analysis: ContinuationAnalysisV3; officialModelAnswer?: string }

/** 这一组的写作解析是不是新版（应用文 V4 / 续写 V3）；是就返回讲解要用的部分。 */
export function writingLectureV4Of(
  sourceTaskType: string | undefined,
  analysis: WritingAnalysis | undefined,
): WritingLectureV4 | null {
  if (!analysis || analysis.taskType !== sourceTaskType) return null
  const officialModelAnswer = typeof analysis.officialModelAnswer === 'string'
    && analysis.officialModelAnswer.trim().length > 0
    ? analysis.officialModelAnswer
    : undefined
  if (analysis.taskType === 'application') {
    return isApplicationAnalysisV4(analysis.applicationAnalysis)
      ? { taskType: 'application', analysis: analysis.applicationAnalysis as ApplicationAnalysisV4, officialModelAnswer }
      : null
  }
  if ('continuationAnalysis' in analysis && isContinuationAnalysisV3(analysis.continuationAnalysis)) {
    return { taskType: 'continuation', analysis: analysis.continuationAnalysis as ContinuationAnalysisV3, officialModelAnswer }
  }
  return null
}

/** 讲评开着、而且开的就是这一组时，才把新版讲解交给答题框和右栏。 */
export function getWritingLectureV4({
  lectureOpen,
  panelGroupId,
  groupId,
  sourceTaskType,
  analysis,
}: {
  lectureOpen: boolean
  panelGroupId: string | null
  groupId: string
  sourceTaskType: string | undefined
  analysis: WritingAnalysis | undefined
}): WritingLectureV4 | null {
  if (!lectureOpen || panelGroupId !== groupId) return null
  return writingLectureV4Of(sourceTaskType, analysis)
}

/** 范文按空行分段；段内单个换行（落款两行）留给 pre-wrap。 */
export function essayParagraphs(essay: string): string[] {
  return essay
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

export function essayOf(lecture: WritingLectureV4, variant: EssayVariant): string {
  return variant === 'advanced' ? lecture.analysis.advanced.essay : lecture.analysis.standard.essay
}

const ESSAY_OPTIONS: { value: EssayVariant; label: string }[] = [
  { value: 'standard', label: '标准版' },
  { value: 'advanced', label: '提高版' },
]

/** 答题框上面一行：左边「AI 参考范文」，右边标准版 / 提高版切换（单选组，← → 切换）。 */
export function EssayVariantBar({
  value,
  onChange,
}: {
  value: EssayVariant
  onChange: (value: EssayVariant) => void
}): ReactNode {
  return (
    <div className="writing-lecture-essay-bar" data-writing-essay-bar="">
      <span className="writing-lecture-essay-bar-label">AI 参考范文</span>
      <SegmentedField
        className="writing-lecture-essay-switch"
        label="范文版本"
        hideLabel
        size="sm"
        value={value}
        options={ESSAY_OPTIONS}
        onChange={onChange}
      />
    </div>
  )
}

function Block({
  name,
  title,
  lead,
  children,
}: {
  name: string
  title: string
  lead?: string
  children: ReactNode
}): ReactNode {
  return (
    <section className="retained-writing-card-section writing-lecture-block" data-writing-lecture-block={name}>
      <h5>{title}</h5>
      {lead && <p className="writing-lecture-lead">{lead}</p>}
      {children}
    </section>
  )
}

function QuoteNotes({ items }: { items: ApplicationQuoteNote[] }): ReactNode {
  return (
    <ul className="writing-lecture-quotes">
      {items.map((item, index) => (
        <li key={index}>
          <q className="writing-lecture-quote" lang="en">{item.quote}</q>
          <p>{item.explain}</p>
        </li>
      ))}
    </ul>
  )
}

function ReadingBlock({ reading }: { reading: ContinuationAnalysisV3['reading'] }): ReactNode {
  return (
    <Block name="reading" title="读原文">
      <ol className="writing-lecture-qa">
        {reading.questions.map((item, index) => (
          <li key={index}>
            <p className="writing-lecture-question">{item.question}</p>
            <p>{item.answer}</p>
          </li>
        ))}
      </ol>
      <h6 className="writing-lecture-subhead">原文这里可以借</h6>
      <QuoteNotes items={reading.sourceLinks.map((link) => ({ quote: link.sourceQuote, explain: link.use }))} />
    </Block>
  )
}

function TaskCardBlock({ taskCard }: { taskCard: ApplicationAnalysisV4['taskCard'] }): ReactNode {
  return (
    <Block name="taskCard" title="审题卡">
      <h6 className="writing-lecture-subhead">必须做到</h6>
      <ul className="writing-lecture-list">
        {taskCard.taskRequires.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
      <h6 className="writing-lecture-subhead">可以换</h6>
      <p className="writing-lecture-text">{taskCard.thisEssayChooses}</p>
    </Block>
  )
}

function NotesBlock({
  notes,
  variant,
}: {
  notes: ApplicationAnalysisV4['standard']['notes']
  variant: EssayVariant
}): ReactNode {
  return (
    <Block name="notes" title="逐段看" lead={variant === 'advanced' ? '讲的是标准版，切回标准版对着看' : undefined}>
      <ol className="writing-lecture-paragraphs">
        {notes.map((note) => (
          <li key={note.paragraph}>
            <p className="writing-lecture-paragraph-role">
              <span className="writing-lecture-paragraph-number">第 {note.paragraph} 段</span>
              {note.role}
            </p>
            <QuoteNotes items={note.items} />
          </li>
        ))}
      </ol>
    </Block>
  )
}

function ExpressionsBlock({ expressions }: { expressions: ApplicationAnalysisV4['standard']['expressions'] }): ReactNode {
  return (
    <Block name="expressions" title="本题可用表达">
      <dl className="writing-lecture-pairs">
        {expressions.map((item, index) => (
          <div key={index}>
            <dt lang="en">{item.expression}</dt>
            <dd>{item.function}</dd>
          </div>
        ))}
      </dl>
    </Block>
  )
}

function PitfallsBlock({ pitfalls }: { pitfalls: ContinuationAnalysisV3['standard']['pitfalls'] }): ReactNode {
  return (
    <Block name="pitfalls" title="容易写偏">
      <dl className="writing-lecture-pairs writing-lecture-pairs--zh">
        {pitfalls.map((item, index) => (
          <div key={index}>
            <dt>{item.pitfall}</dt>
            <dd>{item.why}</dd>
          </div>
        ))}
      </dl>
    </Block>
  )
}

/** 右栏：新版写作讲解。 */
export function WritingLectureV4Rail({
  lecture,
  variant,
}: {
  lecture: WritingLectureV4
  variant: EssayVariant
}): ReactNode {
  const { analysis } = lecture
  return (
    <div
      className="retained-writing-card writing-lecture-card"
      data-writing-lecture-version={analysis.schemaVersion}
      data-writing-essay-variant={variant}
    >
      {lecture.taskType === 'continuation' && <ReadingBlock reading={lecture.analysis.reading} />}
      <TaskCardBlock taskCard={analysis.taskCard} />
      <NotesBlock notes={analysis.standard.notes} variant={variant} />
      <ExpressionsBlock expressions={analysis.standard.expressions} />
      {lecture.taskType === 'continuation' && <PitfallsBlock pitfalls={lecture.analysis.standard.pitfalls} />}
      {variant === 'advanced' && (
        <Block name="beyondStandard" title="提高版多做了什么">
          <QuoteNotes items={analysis.advanced.beyondStandard} />
        </Block>
      )}
    </div>
  )
}
