import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { X } from '../../icons'
import { DisclosureIcon } from '../../icons/MotionIcons'
import { Button, ButtonLink } from '../../shared-ui/Button'
import { Chip } from '../../shared-ui/Chip'
import { Notice } from '../../shared-ui/Notice'
import { PronunciationButton } from '../../shared-ui/PronunciationButton'
import { Skeleton, SkeletonGate } from '../../shared-ui/Skeleton'
import { fetchOtterEntry, type OtterEntry, type OtterSense } from '../../services/paperDictionary'
import { getDictionaryAudioSnapshot, playDictionaryAudio, subscribeDictionaryAudio } from '../paper-browse/selection/dictionaryAudio'
import { ExampleSentence } from './ExampleSentence'
import './dictionaryEntry.css'

type EntryProps = {
  senseId?: string | null
  onClose?: () => void
  showCounts?: boolean
} & (
  | { density: 'quick'; entry: OtterEntry; actions: ReactNode }
  | { density: 'full'; entry?: OtterEntry; word?: string; returnHref?: string }
)

export function DictionaryEntry(props: EntryProps) {
  const word = props.density === 'full' ? props.word : undefined
  const returnHref = props.density === 'full' ? props.returnHref : undefined
  const [loaded, setLoaded] = useState<OtterEntry | null>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [otherOpen, setOtherOpen] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [audioError, setAudioError] = useState(false)
  const audio = useSyncExternalStore(subscribeDictionaryAudio, getDictionaryAudioSnapshot)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const contextRef = useRef<HTMLLIElement>(null)
  const entry = props.entry ?? loaded
  const context = entry?.senses.find(sense => sense.senseId === props.senseId)
  const full = props.density === 'full'
  const pending = Boolean(word && entry === undefined && !error)
  const Title = word ? 'h1' : 'h2'
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
          return <PronunciationButton key={accent} accent={accent} ipa={item.ipa[accent]} playback={url ? {
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
    <div className={`otter-entry otter-entry--${props.density}${full ? '' : ' paper-selection-card'}`} onKeyDown={returnHref ? event => {
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
        <Title ref={titleRef} tabIndex={full ? -1 : undefined} lang="en">{entry?.headword ?? word}</Title>
        {entry?.lists.includes('3000') && <Chip>高考 3000</Chip>}
        {entry?.lists.includes('3100') && <Chip>高考 3100</Chip>}
        {props.onClose && <Button size="sm" className="otter-close" label={full ? '关闭完整词条' : '关闭'} icon={<X size={16} />} onClick={props.onClose} />}
      </header>
      {pending && <SkeletonGate pending label="正在查词典" skeleton={<><Skeleton height={12} /><Skeleton width="68%" height={12} /></>} />}
      {error && <Notice kind="error" action={{ label: '重试', onClick: () => { setError(''); setAttempt(n => n + 1) } }}>{error}</Notice>}
      {entry === null && <Notice kind="info">该词暂未加入</Notice>}
      {entry && pronunciations(full ? entry.pronunciations : quickPronunciation ? [quickPronunciation] : [], full)}
      {audioError && <Notice kind="error">读音播放失败，请重试</Notice>}
      {props.density === 'quick' && <>
        {quickSense && <p className="otter-gloss">{context && <Chip>本文</Chip>} <i lang="en">{quickSense.pos}</i> {quickSense.glossZh}</p>}
        {props.showCounts && <p className="otter-count">本词在真题中出现 {props.entry.counts.gaokao} 次 · 模拟题 {props.entry.counts.mock} 次</p>}
        <div className="otter-actions">{props.actions}</div>
      </>}
      {sections.filter(section => section.senses.length).map(({ title, senses, folded }) => (
        <section key={title} aria-label={title} className="otter-senses">
          {folded ? <Button size="sm" aria-expanded={otherOpen} onClick={() => setOtherOpen(!otherOpen)}
            icon={<DisclosureIcon size={12} expanded={otherOpen} />}>{title}</Button> : <h3>{title}</h3>}
          {(!folded || otherOpen) && <ol>
            {senses.map(sense => <li key={sense.senseId} ref={sense === context ? contextRef : undefined}>
              <p className="otter-gloss"><i lang="en">{sense.pos}</i> {sense.glossZh} {sense === context && <Chip>本文</Chip>}</p>
              {props.showCounts && !sense.folded && <p className="otter-count">真题 {sense.counts.gaokao} 次 · 模拟 {sense.counts.mock} 次</p>}
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
    </div>
  )
}
