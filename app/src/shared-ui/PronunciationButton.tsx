import { VolumeFeedbackIcon, type AudioIconState } from '../icons/MotionIcons'
import { iconMotionInput } from '../icons/motionInput'
import { Button } from './Button.tsx'

export function PronunciationButton({ label, ipa, playback }: {
  label: string
  ipa: string | null
  playback?: { play: () => void; state: AudioIconState; label: string }
}) {
  const text = <>{label}{label && ipa ? ' ' : null}{ipa && <span lang="en-fonipa">{ipa}</span>}</>
  if (!playback) return ipa ? <span>{text}</span> : null
  return (
    <Button
      {...iconMotionInput}
      tone="subtle"
      aria-label={playback.label}
      icon={<VolumeFeedbackIcon size={14} state={playback.state} />}
      onClick={playback.play}
    >
      {text}
    </Button>
  )
}
