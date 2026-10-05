import { Copy } from './generated/copy'
import { Check } from './generated/check'
import { Play } from './generated/play'
import { Pause } from './generated/pause'
import { Pin } from './generated/pin'
import { ChevronDown } from './generated/chevron-down'
import type { EqbIconProps } from './EqbIcon'
import './motionIcons.css'

type MotionProps = Pick<EqbIconProps, 'size' | 'variant'>

export function CopyFeedbackIcon({ state, size = 16 }: MotionProps & { state: 'idle' | 'pending' | 'done' }) {
  return <span className="eqb-motion eqb-motion-copy" data-state={state} style={{ width: size, height: size }} aria-hidden="true">
    <span className="eqb-copy-paper"><Copy size={size} /></span>
    <span className="eqb-copy-check"><Check size={size} /></span>
  </span>
}

export function PlaybackIcon({ playing, size = 16, variant = 'line' }: MotionProps & { playing: boolean }) {
  return <span className="eqb-motion eqb-motion-playback" data-playing={playing} style={{ width: size, height: size }} aria-hidden="true">
    <span className="eqb-play-half eqb-play-left"><Play size={size} variant={variant} /></span>
    <span className="eqb-play-half eqb-play-right"><Play size={size} variant={variant} /></span>
    <span className="eqb-pause-bars"><Pause size={size} variant={variant} /></span>
  </span>
}

export function DisclosureIcon({ expanded, size = 16 }: MotionProps & { expanded: boolean }) {
  return <span className="eqb-motion eqb-motion-disclosure" data-expanded={expanded} style={{ width: size, height: size }} aria-hidden="true">
    <ChevronDown size={size} />
  </span>
}

export function PinFeedbackIcon({ pinned, size = 16 }: MotionProps & { pinned: boolean }) {
  return <span className="eqb-motion eqb-motion-pin" data-pinned={pinned} style={{ width: size, height: size }} aria-hidden="true">
    <Pin size={size} variant="fill" />
  </span>
}
