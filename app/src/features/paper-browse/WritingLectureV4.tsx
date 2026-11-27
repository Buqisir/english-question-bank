/**
 * 写作讲评新版（应用文 V4、读后续写 V3）的网页讲解。
 *
 * 规范：docs/cuts/application-writing-v4/spec.md D5、docs/cuts/continuation-writing-v3/spec.md D5。
 * 范文和「标准版 / 提高版」切换在答题框。右栏的续写新稿先讲读原文、可用伏笔、
 * 两段怎么写，续写旧稿和应用文继续用审题卡。之后接逐段看、本题可用表达、
 * 续写的容易写偏，以及切到提高版时的提高版讲解。
 */
import type { ReactNode } from 'react'
import type {
  ApplicationAnalysisV4,
  ApplicationQuoteNote,
  WritingAnalysis,
} from '../../domain/paperAsset.ts'
import type { ContinuationAnalysisV3, ContinuationRoute } from '../../domain/continuationAnalysis.ts'
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
  front,
  children,
}: {
  name: string
  title: string
  lead?: string
  front?: boolean
  children: ReactNode
}): ReactNode {
  return (
    <section className={`retained-writing-card-section writing-lecture-block${front ? ' writing-lecture-front' : ''}`} data-writing-lecture-block={name}>
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

function SourceQuote({ quote, evidence }: { quote: string; evidence?: boolean }): ReactNode {
  return (
    <p className="writing-lecture-source-quote">
      {evidence && <span>依据 </span>}
      <q lang="en">{quote}</q>
    </p>
  )
}

function FrontField({ label, text }: { label: string; text: string }): ReactNode {
  return (
    <p className="writing-lecture-text">
      <strong className="writing-lecture-field-label">{label}</strong>{text}
    </p>
  )
}

function ReadingBlock({
  reading,
  showLegacyLinks,
}: {
  reading: ContinuationAnalysisV3['reading']
  showLegacyLinks: boolean
}): ReactNode {
  return (
    <Block name="reading" title="读原文" front>
      <ol className="writing-lecture-qa">
        {reading.questions.map(({ question, answer, evidence }, index) => (
          <li key={index}>
            <h6 className="writing-lecture-subhead">{question}</h6>
            {question === '人物' && reading.characters ? (
              reading.characters.map(({ name, role, lines }) => (
                <div className="writing-lecture-character" key={name}>
                  <p className="writing-lecture-text"><strong>{name}</strong> {role}</p>
                  {lines.map((line, i) => (
                    <div key={i}>
                      <FrontField label={line.label} text={line.text} />
                      {line.evidence && <SourceQuote quote={line.evidence} evidence />}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <>
                <p className="writing-lecture-text writing-lecture-reading-answer">{answer}</p>
                {evidence?.map((quote, i) => <SourceQuote key={i} quote={quote} evidence />)}
              </>
            )}
          </li>
        ))}
      </ol>
      {showLegacyLinks && (
        <>
          <h6 className="writing-lecture-subhead">原文这里可以借</h6>
          <SourceLinks links={reading.sourceLinks} />
        </>
      )}
    </Block>
  )
}

function SourceLinks({ links }: { links: ContinuationAnalysisV3['reading']['sourceLinks'] }): ReactNode {
  return (
    <ul className="writing-lecture-quotes">
      {links.map(({ sourceQuote, use }, index) => (
        <li key={index}>
          <SourceQuote quote={sourceQuote} />
          <p>{use}</p>
        </li>
      ))}
    </ul>
  )
}

function RouteBlock({ taskCard }: { taskCard: ContinuationRoute }): ReactNode {
  const [first, second] = taskCard.paragraphs
  return (
    <Block name="route" title="两段怎么写" front>
      <p className="writing-lecture-text">{taskCard.route}</p>
      {[first, second].map(({ paragraph, must, draft }) => (
        <div className="writing-lecture-route-paragraph" key={paragraph}>
          <h6 className="writing-lecture-subhead">第 {paragraph} 段</h6>
          <FrontField label="题目要求" text={must} />
          <FrontField label="范文这样写" text={draft} />
          {paragraph === 1 && first.bridgeQuote && (
            <>
              <h6 className="writing-lecture-subhead">两段之间</h6>
              <SourceQuote quote={first.bridgeQuote} />
              <p className="writing-lecture-text">{first.bridge}</p>
            </>
          )}
        </div>
      ))}
    </Block>
  )
}

function TaskCardBlock({ taskCard: { basics, taskRequires, thisEssayChooses } }: { taskCard: ApplicationAnalysisV4['taskCard'] }): ReactNode {
  return (
    <Block name="taskCard" title="审题卡" front>
      {basics && (
        <dl className="writing-lecture-basics">
          <div><dt>文体格式</dt><dd>{basics.form}</dd></div>
          <div><dt>人称时态</dt><dd>{basics.personTense}</dd></div>
          <div><dt>读者语气</dt><dd>{basics.readerTone}</dd></div>
          <div><dt>交际目的</dt><dd>{basics.goal}</dd></div>
        </dl>
      )}
      <h6 className="writing-lecture-subhead">{basics ? '内容要点' : '必须做到'}</h6>
      <ul className="writing-lecture-list">
        {taskRequires.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
      <h6 className="writing-lecture-subhead">{basics ? '范文的选择（可以换）' : '可以换'}</h6>
      <p className="writing-lecture-text">{thisEssayChooses}</p>
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
      {lecture.taskType === 'continuation' && (
        <ReadingBlock reading={lecture.analysis.reading} showLegacyLinks={!('route' in analysis.taskCard)} />
      )}
      {'route' in analysis.taskCard && lecture.taskType === 'continuation' ? (
        <>
          <Block name="sourceLinks" title="可用伏笔" front>
            <SourceLinks links={lecture.analysis.reading.sourceLinks} />
          </Block>
          <RouteBlock taskCard={analysis.taskCard} />
        </>
      ) : !('route' in analysis.taskCard) && <TaskCardBlock taskCard={analysis.taskCard} />}
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
