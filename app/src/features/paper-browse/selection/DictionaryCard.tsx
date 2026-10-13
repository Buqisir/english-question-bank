import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, SentenceAnalysis, Volume, X } from '../../../icons'
import { CopyFeedbackIcon } from '../../../icons/MotionIcons'
import { iconMotionInput } from '../../../icons/motionInput'
import type {
  PaperDictionaryEntry,
  PaperDictionaryPosGroup,
  PaperDictionaryPronunciation,
  PaperDictionaryResponse,
  PaperDictionarySense,
} from '../../../services/paperDictionary'
import { playDictionaryAudio } from './dictionaryAudio'

export type DictionarySenseState =
  | { status: 'loading' }
  // matchKey 是服务端选中的义项（entryId\nposGroupIndex\nsenseId）；短语搭配没有对应义项，为 null。
  | { status: 'ok'; text: string; matchKey?: string | null }
  | { status: 'unavailable' | 'error'; message: string }

function sameWord(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
}

function playLabel(surface: string, pronunciation: PaperDictionaryPronunciation) {
  const spoken = pronunciation.spokenForm
  const kind = pronunciation.audio?.synthetic ? '合成发音' : ''
  if (!sameWord(surface, spoken)) return `播放基本词形 ${spoken}${kind ? `（${kind}）` : ''}`
  return `播放${pronunciation.dialectLabel}${kind} ${spoken}`
}

function glossOf(sense: PaperDictionarySense) {
  return sense.shortGloss?.trim() || ''
}

function explanationOf(sense: PaperDictionarySense) {
  return sense.learnerExplanation?.trim() || ''
}

function hasDistinctExplanation(sense: PaperDictionarySense) {
  const gloss = glossOf(sense)
  const explanation = explanationOf(sense)
  return Boolean(gloss && explanation && explanation !== gloss)
}

// 各词性组常重复同一方言同一音标；合并成一条，有录音的那条胜出。
function dedupePronunciations(groups: PaperDictionaryPosGroup[]) {
  const byKey = new Map<string, PaperDictionaryPronunciation>()
  for (const group of groups) {
    for (const pronunciation of group.pronunciations) {
      if (!pronunciation.ipa && !pronunciation.audio) continue
      const key = `${pronunciation.dialect}|${pronunciation.ipa || ''}`
      const existing = byKey.get(key)
      if (!existing || (!existing.audio && pronunciation.audio)) byKey.set(key, pronunciation)
    }
  }
  return [...byKey.values()]
}

const GAOKAO_STAGE_LABELS = { high: '高考高频', mid: '高考中频', low: '高考低频' } as const

function GaokaoBadge({ entry }: { entry: PaperDictionaryEntry }) {
  const stage = entry.gaokao?.frequencyStage
  if (!stage || !(stage in GAOKAO_STAGE_LABELS)) return null
  return (
    <span className="paper-dictionary-badge" title={`高考 3000 词频表第 ${entry.gaokao!.frequencyRank} 位`}>
      {GAOKAO_STAGE_LABELS[stage]}
    </span>
  )
}

function contextKey(entry: PaperDictionaryEntry, group: PaperDictionaryPosGroup, sense: PaperDictionarySense) {
  return `${entry.entryId}\n${group.posGroupIndex}\n${sense.senseId}`
}

function groupByIpa(pronunciations: PaperDictionaryPronunciation[]) {
  const groups: Array<{ ipa: string | null; items: PaperDictionaryPronunciation[] }> = []
  for (const pronunciation of pronunciations) {
    const existing = groups.find((group) => group.ipa === pronunciation.ipa)
    if (existing) existing.items.push(pronunciation)
    else groups.push({ ipa: pronunciation.ipa, items: [pronunciation] })
  }
  return groups
}

function dialectChipLabel(pronunciation: PaperDictionaryPronunciation) {
  return pronunciation.dialect === 'unspecified' ? '' : pronunciation.dialectLabel
}

// 同一音标只写一次，方言跟在音标后面作标注；有录音的方言标注本身就是播放按钮，
// 这样播放入口总在固定位置，不会夹在两段音标之间。
function PronunciationRow({
  surface,
  pronunciations,
  onPlayError,
}: {
  surface: string
  pronunciations: PaperDictionaryPronunciation[]
  onPlayError: (pronunciationId: string) => void
}) {
  if (pronunciations.length === 0) return null
  return (
    <span className="paper-dictionary-pronunciations">
      {groupByIpa(pronunciations).map((group) => (
        <span key={group.items[0].pronunciationId} className="paper-dictionary-pronunciation">
          {group.ipa ? <span className="paper-dictionary-ipa">{group.ipa}</span> : null}
          {group.items.map((pronunciation) => {
            const label = dialectChipLabel(pronunciation)
            if (!pronunciation.audio) {
              return label ? (
                <span key={pronunciation.pronunciationId} className="paper-dictionary-dialect">{label}</span>
              ) : null
            }
            return (
              <button
                key={pronunciation.pronunciationId}
                type="button"
                className="paper-dictionary-play"
                aria-label={playLabel(surface, pronunciation)}
                onClick={() => {
                  void playDictionaryAudio(pronunciation.audio!.url, pronunciation.audio!.fallbackUrl).catch(() => {
                    onPlayError(pronunciation.pronunciationId)
                  })
                }}
              >
                {label ? <span className="paper-dictionary-dialect">{label}</span> : null}
                <Volume size={14} />
              </button>
            )
          })}
        </span>
      ))}
    </span>
  )
}

const FORM_OF_GLOSS = /^(.+?)\s*的.*(分词|动名词|过去式|复数|比较级|最高级|第三人称)/

// 多词条时（hanging 同时命中 hang 与 hanging），「hang 的现在分词」这类义项
// 只是在复述上一个词条已经标出的词形，去掉以免同一信息出现两次。
function withoutFormOfSenses(entries: PaperDictionaryEntry[]) {
  if (entries.length < 2) return entries
  const headwords = new Set(entries.map((entry) => entry.headword.toLowerCase()))
  return entries
    .map((entry) => ({
      ...entry,
      posGroups: entry.posGroups
        .map((group) => ({
          ...group,
          senses: group.senses.filter((sense) => {
            const match = (glossOf(sense) || explanationOf(sense)).match(FORM_OF_GLOSS)
            const base = match?.[1].trim().toLowerCase()
            return !(base && base !== entry.headword.toLowerCase() && headwords.has(base))
          }),
        }))
        .filter((group) => group.senses.length > 0),
    }))
    .filter((entry) => entry.posGroups.length > 0)
}

function GlossText({ text }: { text: string }) {
  const parts = text.split(/\s*[；;]\s*/).filter(Boolean)
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 ? <span className="paper-dictionary-gloss-sep">；</span> : null}
          {part}
        </span>
      ))}
    </>
  )
}

function SenseLine({
  sense,
  index,
  explain,
  context = false,
}: {
  sense: PaperDictionarySense
  index: number | null
  explain: boolean
  context?: boolean
}) {
  const gloss = glossOf(sense)
  const explanation = explanationOf(sense)
  return (
    <li className="paper-dictionary-sense" data-context={context ? '' : undefined}>
      <span className="paper-dictionary-gloss-num" aria-hidden={index === null ? true : undefined}>
        {index}
      </span>
      <p className="paper-dictionary-gloss">
        <GlossText text={gloss || explanation} />
        {context ? (
          <span className="paper-dictionary-context-dot" title="与本文义最接近">
            <span className="paper-selection-live">（与本文义最接近）</span>
          </span>
        ) : null}
      </p>
      {explain && hasDistinctExplanation(sense) ? (
        <p className="paper-dictionary-explanation">{explanation}</p>
      ) : null}
    </li>
  )
}

const FALLBACK_SENSE_COUNT = 3

// 词典只给三档义频标签（core / common / rare），没有数字频次。默认只摆核心义；
// 一组没有核心义时，退到常见义、再退到少见义各取前几条，卡片不会空着。
// 与本文义最接近的义项即使不是核心义，也提到默认可见的位置。
function splitSenses(senses: PaperDictionarySense[], contextSenseId: string | null) {
  const core = senses.filter((sense) => sense.priority === 'core')
  const common = senses.filter((sense) => sense.priority === 'common')
  const base = core.length > 0
    ? core
    : (common.length > 0 ? common : senses).slice(0, FALLBACK_SENSE_COUNT)
  const baseIds = new Set(base.map((sense) => sense.senseId))
  if (contextSenseId) baseIds.add(contextSenseId)
  const shown = senses.filter((sense) => baseIds.has(sense.senseId))
  const shownIds = new Set(shown.map((sense) => sense.senseId))
  const rest = senses.filter((sense) => !shownIds.has(sense.senseId))
  const folded = [
    ...rest.filter((sense) => sense.priority !== 'rare'),
    ...rest.filter((sense) => sense.priority === 'rare'),
  ]
  return { shown, folded }
}

function PosBlock({
  group,
  showMorphology,
  explain,
  contextSenseId,
}: {
  group: PaperDictionaryPosGroup
  showMorphology: boolean
  explain: boolean
  contextSenseId: string | null
}) {
  const { shown, folded } = splitSenses(group.senses, contextSenseId)
  const numbered = shown.length + folded.length > 1
  const [rareOpen, setRareOpen] = useState(false)
  return (
    <section className="paper-dictionary-pos">
      <p className="paper-dictionary-pos-label">
        <span className="paper-dictionary-pos-abbr">{group.posLabel}</span>
        {showMorphology && group.morphologyLabels.length > 0 ? (
          <span className="paper-dictionary-pos-form">
            {group.matchedForm} · {group.morphologyLabels.join(' / ')}
          </span>
        ) : null}
      </p>
      <ol className="paper-dictionary-senses">
        {shown.map((sense, i) => (
          <SenseLine
            key={sense.senseId}
            sense={sense}
            index={numbered ? i + 1 : null}
            explain={explain}
            context={sense.senseId === contextSenseId}
          />
        ))}
        {rareOpen ? folded.map((sense, i) => (
          <SenseLine
            key={sense.senseId}
            sense={sense}
            index={numbered ? shown.length + i + 1 : null}
            explain={explain}
          />
        )) : null}
      </ol>
      {folded.length > 0 ? (
        <button
          type="button"
          className="paper-dictionary-more paper-dictionary-rare-toggle"
          aria-expanded={rareOpen}
          onClick={() => setRareOpen((value) => !value)}
        >
          <span>{rareOpen ? '收起' : `更多义项 ${folded.length}`}</span>
          <ChevronDown size={12} />
        </button>
      ) : null}
    </section>
  )
}

function entryCopy(surface: string, entry: PaperDictionaryEntry) {
  const lines = [entry.headword === surface ? entry.headword : `${surface} → ${entry.headword}`]
  for (const group of entry.posGroups) {
    const labels = group.morphologyLabels.join(' / ')
    if (labels) lines.push(labels)
    for (const pronunciation of group.pronunciations) {
      if (pronunciation.ipa) lines.push(`${pronunciation.dialectLabel} ${pronunciation.ipa}`)
    }
    const glosses = group.senses
      .map((sense) => sense.shortGloss || sense.learnerExplanation)
      .filter((item): item is string => Boolean(item))
    if (glosses.length > 0) lines.push(`${group.posLabel} ${glosses.join('；')}`)
  }
  return lines.join('\n')
}

export function dictionaryCopyText(surface: string, result: PaperDictionaryResponse | null, sense: DictionarySenseState) {
  const parts = [surface]
  if (result?.entries.length) {
    parts.push(result.entries.map((entry) => entryCopy(surface, entry)).join('\n\n'))
  }
  if (sense.status === 'ok') parts.push(`本文义：${sense.text}`)
  if (result?.attribution) parts.push(result.attribution)
  return parts.filter(Boolean).join('\n')
}

export function DictionaryCard({
  surface,
  lookup,
  result,
  lookupError,
  playErrorId,
  sense,
  onRetrySense,
  onPlayError,
  onCopy,
  copied,
  copyState,
  copyError,
  onClose,
  notebook,
  onAnalyzeSentence,
}: {
  surface: string
  lookup: 'loading' | 'ready'
  result: PaperDictionaryResponse | null
  lookupError: string
  playErrorId: string
  sense: DictionarySenseState
  onRetrySense: () => void
  onPlayError: (pronunciationId: string) => void
  onCopy: () => void
  copied: boolean
  copyState?: 'idle' | 'pending' | 'done'
  copyError?: string
  onClose?: () => void
  notebook?: ReactNode
  onAnalyzeSentence?: () => void
}) {
  const [explainAll, setExplainAll] = useState(false)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const creditsId = useId()
  const entries = result ? withoutFormOfSenses(result.entries) : []
  const single = entries.length === 1 ? entries[0] : null
  const title = single?.headword || surface
  const singlePronunciations = single ? dedupePronunciations(single.posGroups) : []
  const morphology = single
    ? [...new Set(single.posGroups.flatMap((group) => group.morphologyLabels))]
    : []
  const showSurface = Boolean(single && (!sameWord(single.headword, surface) || morphology.length > 0))
  const audioCredits = [...new Map(entries.flatMap((entry) => entry.posGroups.flatMap((group) => (
    group.pronunciations.filter((pronunciation) => pronunciation.audio)
  ))).map((pronunciation) => [pronunciation.audio!.url, pronunciation])).values()]
  const hasWikimediaAudio = audioCredits.some((pronunciation) => !pronunciation.audio?.synthetic)
  const hasExplanations = Boolean(entries.some((entry) => (
    entry.posGroups.some((group) => group.senses.some(hasDistinctExplanation))
  )))
  // 本文义由服务端在候选义项里选定，matchKey 直接命中；固定搭配没有对应义项，不标点。
  const contextMatch = sense.status === 'ok' ? (sense.matchKey || null) : null

  return (
    <div className="paper-selection-card paper-dictionary-card" data-loading={lookup === 'loading' ? '' : undefined}>
      <div className="paper-selection-card-header">
        <div className="paper-dictionary-title-row">
          <p className="paper-dictionary-title">{title}</p>
          {single ? <GaokaoBadge entry={single} /> : null}
        </div>
        <div className="paper-selection-card-actions">
          {onAnalyzeSentence ? (
            <button
              type="button"
              className="paper-dictionary-analyze"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onAnalyzeSentence}
            >
              <SentenceAnalysis size={16} />
              <span>分析所在句</span>
            </button>
          ) : null}
          <button
            type="button"
            className="paper-selection-action-btn"
            {...iconMotionInput}
            onClick={onCopy}
            disabled={copyState === 'pending'}
            aria-busy={copyState === 'pending'}
            aria-label={copied ? '已复制' : '复制词条'}
          >
            <CopyFeedbackIcon size={16} state={copyState ?? (copied ? 'done' : 'idle')} />
          </button>
          {onClose ? (
            <button type="button" className="paper-selection-action-btn" onClick={onClose} aria-label="关闭">
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      {copyError && <p className="paper-selection-card-error" role="alert">{copyError}</p>}

      {showSurface || singlePronunciations.length > 0 ? (
        <div className="paper-dictionary-meta">
          {showSurface ? (
            <span className="paper-dictionary-surface">
              原文 {surface}
              {morphology.length > 0 ? ` · ${morphology.join(' / ')}` : ''}
            </span>
          ) : null}
          <PronunciationRow
            surface={surface}
            pronunciations={singlePronunciations}
            onPlayError={onPlayError}
          />
        </div>
      ) : null}

      <div className="paper-dictionary-sense-block">
        <span className="paper-dictionary-sense-label">本文义</span>
        {sense.status === 'loading' ? (
          <span className="paper-dictionary-sense-skeleton-row" aria-hidden="true">
            <span className="paper-dictionary-sense-skeleton" />
          </span>
        ) : null}
        {sense.status === 'ok' ? (
          <>
            <span className="paper-dictionary-sense-text">{sense.text}</span>
            {sense.matchKey ? <span className="paper-dictionary-machine">机器参考</span> : null}
          </>
        ) : null}
        {sense.status === 'unavailable' ? (
          <span className="paper-dictionary-sense-note">{sense.message}</span>
        ) : null}
        {sense.status === 'error' ? (
          <span className="paper-dictionary-sense-note paper-dictionary-sense-error">
            {sense.message}
            <button type="button" className="paper-dictionary-sense-retry" onClick={onRetrySense}>
              重试
            </button>
          </span>
        ) : null}
      </div>

      {lookup === 'loading' ? (
        <div className="paper-dictionary-skeletons" aria-hidden="true">
          <span className="paper-dictionary-skeleton-line" />
          <span className="paper-dictionary-skeleton-line" />
          <span className="paper-dictionary-skeleton-line" />
        </div>
      ) : null}
      {lookupError ? <p className="paper-dictionary-note">{lookupError}</p> : null}
      {result?.status === 'not-found' ? <p className="paper-dictionary-missing">暂未收录该词</p> : null}
      {result?.truncated ? <p className="paper-dictionary-note">词条较长，这里只显示一部分。</p> : null}

      {entries.map((entry) => (
        <section key={entry.entryId} className="paper-dictionary-entry">
          {!single ? (
            <div className="paper-dictionary-entry-head">
              <p className="paper-dictionary-headword">{entry.headword}</p>
              <GaokaoBadge entry={entry} />
              <PronunciationRow
                surface={surface}
                pronunciations={dedupePronunciations(entry.posGroups)}
                onPlayError={onPlayError}
              />
            </div>
          ) : null}
          {entry.posGroups.map((group) => (
            <PosBlock
              key={`${entry.entryId}:${group.posGroupIndex}`}
              group={group}
              showMorphology={!single}
              explain={explainAll}
              contextSenseId={
                group.senses.find((item) => contextKey(entry, group, item) === contextMatch)?.senseId ?? null
              }
            />
          ))}
        </section>
      ))}
      {playErrorId ? <p className="paper-dictionary-note">暂时无法播放</p> : null}

      {hasExplanations ? (
        <button
          type="button"
          className="paper-dictionary-more paper-dictionary-detail-toggle"
          aria-expanded={explainAll}
          onClick={() => setExplainAll((value) => !value)}
        >
          <ChevronDown size={12} />
          <span>{explainAll ? '收起解释' : '详细解释'}</span>
        </button>
      ) : null}

      {notebook}
      <div className="paper-dictionary-footer">
        <span className="paper-dictionary-source">来源 Wiktionary</span>
        <button
          type="button"
          className="paper-dictionary-more paper-dictionary-credits-toggle"
          aria-expanded={creditsOpen}
          aria-controls={creditsId}
          onClick={() => setCreditsOpen((value) => !value)}
        >
          <span>署名与隐私</span>
          <ChevronDown size={12} />
        </button>
        <div id={creditsId} className="paper-dictionary-credits-body" hidden={!creditsOpen}>
          <p className="paper-dictionary-attribution">
            {result?.attribution || 'Open Dictionary / Wiktionary 衍生数据，含模型生成释义'}
          </p>
          {audioCredits.map((pronunciation) => (
            <p key={pronunciation.audio!.url} className="paper-dictionary-note">
              {pronunciation.dialectLabel} {pronunciation.spokenForm}
              {' · '}
              {pronunciation.audio?.synthetic ? '本站高考词表合成发音' : (pronunciation.audio?.author || '作者未标明')}
              {pronunciation.audio?.license ? ` · ${pronunciation.audio.license}` : ''}
              {pronunciation.audio?.sourceUrl ? (
                <>
                  {' · '}
                  <a href={pronunciation.audio.sourceUrl} target="_blank" rel="noreferrer">原文件</a>
                </>
              ) : null}
              {pronunciation.audio?.licenseUrl ? (
                <>
                  {' · '}
                  <a href={pronunciation.audio.licenseUrl} target="_blank" rel="noreferrer">许可</a>
                </>
              ) : null}
            </p>
          ))}
          {hasWikimediaAudio ? (
            <p className="paper-dictionary-note">真人录音来自 Wikimedia Commons，已转码为单声道 mp3，由本站提供。</p>
          ) : null}
          {sense.status === 'ok' && sense.matchKey ? (
            <p className="paper-dictionary-note">为选定这条义项，已把这个词和义项清单发给翻译模型。</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
