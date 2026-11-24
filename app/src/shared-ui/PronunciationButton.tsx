import { VolumeFeedbackIcon, type AudioIconState } from '../icons/MotionIcons'
import { iconMotionInput } from '../icons/motionInput'
import { Button } from './Button.tsx'

export function PronunciationButton({ accent, ipa, playback }: {
  accent: 'uk' | 'us'
  ipa: string | null
  playback?: { play: () => void; state: AudioIconState }
}) {
  const label = accent === 'uk' ? '英' : '美'
  const text = <>{label}{ipa && <> <span lang="en-fonipa">{ipa}</span></>}</>
  if (!playback) return ipa ? <span>{text}</span> : null
  return (
    <Button
      {...iconMotionInput}
      aria-label={`播放${label}式读音${ipa ? ` ${ipa}` : ''}`}
      icon={<VolumeFeedbackIcon size={14} state={playback.state} />}
      onClick={playback.play}
    >
      {text}
    </Button>
  )
}
