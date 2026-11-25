import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { X } from '../../icons'
import { DisclosureIcon } from '../../icons/MotionIcons'
import { Button, ButtonLink } from '../../shared-ui/Button'
import { Chip } from '../../shared-ui/Chip'
import { Notice } from '../../shared-ui/Notice'
import { PronunciationButton } from '../../shared-ui/PronunciationButton'
import { Skeleton, SkeletonGate } from '../../shared-ui/Skeleton'
import { fetchOtterEntry, type OtterEntry, type OtterEntryLink, type OtterSense } from '../../services/paperDictionary'
import { getDictionaryAudioSnapshot, playDictionaryAudio, subscribeDictionaryAudio } from '../paper-browse/selection/dictionaryAudio'
import { ExampleSentence } from './ExampleSentence'
import './dictionaryEntry.css'

const RELATED_PHRASE_LIMIT = 12

type EntryProps = {
  senseId?: string | null
  onClose?: () => void
} & (
  | {
    density: 'quick'
    entry?: OtterEntry | null
    surface: string
    pending: boolean
    fallback?: ReactNode
    notice?: ReactNode
    phrases?: ReactNode
    menu: ReactNode
    actions: ReactNode
  }
  | { density: 'full'; entry?: OtterEntry; word?: string; returnHref?: string; alternatives?: OtterEntryLink[] }
)

export function DictionaryEntry(props: EntryProps) {
  const quick = props.density === 'quick' ? props : null
  const word = props.density === 'full' ? props.word : undefined
  const returnHref = props.density === 'full' ? props.returnHref : undefined
  const [loaded, setLoaded] = useState<OtterEntry | null>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [otherOpen, setOtherOpen] = useState(false)
  const [openRelatedEntryId, setOpenRelatedEntryId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [audioError, setAudioError] = useState(false)
  const audio = useSyncExternalStore(subscribeDictionaryAudio, getDictionaryAudioSnapshot)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const contextRef = useRef<HTMLLIElement>(null)
  const entry = props.entry ?? loaded
  const isPhrase = entry?.kind === 'phrase'
  const context = entry?.senses.find(sense => sense.senseId === props.senseId)
  const full = props.density === 'full'
  const relatedPhrases = entry?.relatedPhraseLinks ?? []
  const relatedOpen = openRelatedEntryId === entry?.entryId
  const morePhrases = relatedPhrases.length - RELATED_PHRASE_LIMIT
  const pending = quick?.pending ?? Boolean(word && entry === undefined && !error)
  const Title = word ? 'h1' : 'h2'
  const title = entry?.headword ?? (word?.startsWith('w:') ? null : word) ?? quick?.surface
  const returnInHistory = Boolean(returnHref && window.history.state?.otterFromSelection)

  useEffect(() => {
    if (!word) return
    const controller = new AbortController()
    fetchOtterEntry(word, controller.signal).then(setLoaded).catch((error: Error) => {
      if (!controller.signal.aborted) setError(error.message)
    })
    return () => controller.abort()
  }, [word, attempt])

  useLayoutEffect(() => {
    if (!full) return
    titleRef.current?.focus({ preventScroll: true })
    contextRef.current?.scrollIntoView({ block: 'nearest' })
  }, [full, entry, context])

  function pronunciations(items: OtterEntry['pronunciations'], showLabels: boolean) {
    return items.map(item => (
      <div key={item.pronunciationId} className="otter-pronunciations">
        {showLabels && item.label && <span>{item.label}</span>}
        {(['uk', 'us'] as const).map(accent => {
          const url = item.audio[accent]
          const ipa = item.ipa[accent]
          const label = accent === 'uk' ? '英' : '美'
          return <PronunciationButton key={accent} label={label} ipa={ipa} playback={url ? {
            label: `播放${label}式读音${ipa ? ` ${ipa}` : ''}`,
            state: audio.key === url ? audio.state : 'idle',
            play: () => {
              setAudioError(false)
              void playDictionaryAudio(url).catch(() => setAudioError(true))
            },
          } : undefined} />
        })}
      </div>
    ))
  }

  const quickSense = context ?? entry?.senses[0]
  const quickPronunciation = entry?.pronunciations.find(item => item.pronunciationId === quickSense?.pronunciationId)
    ?? entry?.pronunciations[0]
  const forms = entry ? [entry.headword, ...entry.variants, ...entry.forms.map(item => item.form)] : []
  const sections: { title: string; senses: OtterSense[]; folded?: boolean }[] = entry && full ? [
    { title: '真题里的意思', senses: entry.senses.filter(s => s.origin === 'gaokao').sort((a, b) => b.counts.gaokao - a.counts.gaokao) },
    { title: '模拟题里还出现', senses: entry.senses.filter(s => s.origin === 'mock').sort((a, b) => b.counts.mock - a.counts.mock) },
    { title: '其他意思', senses: entry.senses.filter(s => s.folded), folded: true },
  ] : []

  return (
    <div className={`otter-entry otter-entry--${props.density}${full ? '' : ' paper-selection-card paper-dictionary-card'}`}
      data-loading={quick && pending ? '' : undefined} onKeyDown={returnHref ? event => {
      if (event.key === 'Escape') {
        if (returnInHistory) window.history.back()
        else window.location.replace(returnHref)
      }
    } : undefined}>
      {returnHref && <ButtonLink size="sm" href={returnHref} onClick={event => {
        if (!returnInHistory || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        window.history.back()
      }}>回到原句</ButtonLink>}
      <header className="otter-entry-heading">
        {title && <Title ref={titleRef} tabIndex={full ? -1 : undefined} lang="en">{title}</Title>}
        {entry && !isPhrase && <Chip>{entry.lists.some(list => list === '3000' || list === '3100') ? '高考词汇' : '超纲'}</Chip>}
        {quick?.fallback && <Chip>通用词典</Chip>}
        {quick?.menu}
        {props.onClose && <Button size="sm" className="otter-close" label={full ? '关闭完整词条' : '关闭'} icon={<X size={16} />} onClick={props.onClose} />}
      </header>
      {props.density === 'full' && Boolean(props.alternatives?.length) && (
        <p className="otter-alternatives">也可能是：{props.alternatives?.map(({ entryId, headword }, index) => (
          <span key={entryId}>{index > 0 && '、'}<a lang="en"
            href={`?${new URLSearchParams({ view: 'word', w: entryId })}`}>{headword}</a></span>
        ))}</p>
      )}
      {pending && <SkeletonGate pending label="正在查词典" skeleton={<><Skeleton height={12} /><Skeleton width="68%" height={12} /></>} />}
      {error && <Notice kind="error" action={{ label: '重试', onClick: () => { setError(''); setAttempt(n => n + 1) } }}>{error}</Notice>}
      {!quick && entry === null && <Notice kind="info">该词暂未加入</Notice>}
      {quick?.notice}
      {entry && pronunciations(full ? entry.pronunciations : quickPronunciation ? [quickPronunciation] : [], full)}
      {audioError && <Notice kind="error">读音播放失败，请重试</Notice>}
      {quick && <>
        {quickSense && <p className="otter-gloss">{context && <Chip>本文</Chip>} <i lang={isPhrase ? undefined : 'en'}>{quickSense.pos}</i> {quickSense.glossZh}</p>}
        {quick.fallback}
        {quick.phrases}
        {quick.actions && <div className="otter-actions">{quick.actions}</div>}
      </>}
      {sections.filter(section => section.senses.length).map(({ title, senses, folded }) => (
        <section key={title} aria-label={title} className="otter-senses">
          {folded ? <Button size="sm" aria-expanded={otherOpen} onClick={() => setOtherOpen(!otherOpen)}
            icon={<DisclosureIcon size={12} expanded={otherOpen} />}>{title}</Button> : <h3>{title}</h3>}
          {(!folded || otherOpen) && <ol>
            {senses.map(sense => <li key={sense.senseId} ref={sense === context ? contextRef : undefined}>
              <p className="otter-gloss"><i lang={isPhrase ? undefined : 'en'}>{sense.pos}</i> {sense.glossZh} {sense === context && <Chip>本文</Chip>}</p>
              {sense.examples.slice(0, expanded[sense.senseId] ? undefined : 1).map(example =>
                <ExampleSentence key={example.exampleId} example={example} forms={forms} />)}
              {sense.examples.length > 1 && <Button size="sm" aria-expanded={Boolean(expanded[sense.senseId])}
                icon={<DisclosureIcon size={12} expanded={Boolean(expanded[sense.senseId])} />}
                onClick={() => setExpanded({ ...expanded, [sense.senseId]: !expanded[sense.senseId] })}>
                {expanded[sense.senseId] ? '收起例句' : `更多例句 ${sense.examples.length - 1}`}
              </Button>}
            </li>)}
          </ol>}
        </section>
      ))}
      {full && relatedPhrases.length > 0 && (
        <section aria-label="相关短语" className="otter-senses">
          <h3>相关短语</h3>
          <div className="otter-actions">
            {relatedPhrases.slice(0, relatedOpen ? undefined : RELATED_PHRASE_LIMIT).map(({ entryId, headword }) => (
              <ButtonLink key={entryId} size="sm" lang="en"
                href={`?${new URLSearchParams({ view: 'word', w: entryId })}`}>{headword}</ButtonLink>
            ))}
          </div>
          {morePhrases > 0 && <Button size="sm" aria-expanded={relatedOpen}
            icon={<DisclosureIcon size={12} expanded={relatedOpen} />}
            onClick={() => setOpenRelatedEntryId(relatedOpen ? null : entry?.entryId ?? null)}>
            {relatedOpen ? '收起短语' : `更多短语 ${morePhrases}`}
          </Button>}
        </section>
      )}
    </div>
  )
}
