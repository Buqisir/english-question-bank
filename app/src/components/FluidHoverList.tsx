/**
 * A list container whose hover highlight glides between items instead of
 * blinking at gaps. Wraps `useFluidHover`; the highlight is the container's
 * `::before` (see `.fluid-hover-list` in App.css), so the children stay
 * whatever they already are — `<li>`s, buttons, chips.
 *
 * Items must be `position: relative` (or otherwise stacked above the
 * container's `::before`) and must not paint their own opaque background.
 */

import { useCallback, type ComponentPropsWithoutRef, type ElementType, type ReactNode, type Ref } from 'react'
import { useFluidHover, type FluidHoverAxis } from './useFluidHover.ts'

type FluidHoverListOwnProps = {
  as?: 'ul' | 'div' | 'nav'
  axis?: FluidHoverAxis
  itemSelector: string
  hitArea?: (item: HTMLElement) => HTMLElement
  gapClick?: boolean | number
  className?: string
  children?: ReactNode
  /** Optional outside ref to the container (menus that watch outside clicks, etc.). */
  ref?: Ref<HTMLElement>
}

export type FluidHoverListProps = FluidHoverListOwnProps &
  Omit<ComponentPropsWithoutRef<'div'>, keyof FluidHoverListOwnProps | 'ref'>

export function FluidHoverList({
  as = 'ul',
  axis = 'y',
  itemSelector,
  hitArea,
  gapClick,
  className,
  children,
  ref: outerRef,
  ...rest
}: FluidHoverListProps) {
  const { containerRef, handlers } = useFluidHover<HTMLElement>({ axis, itemSelector, hitArea, gapClick })
  const setRef = useCallback((node: HTMLElement | null) => {
    containerRef.current = node
    if (typeof outerRef === 'function') outerRef(node)
    else if (outerRef) outerRef.current = node
  }, [containerRef, outerRef])
  const Tag = as as ElementType
  return (
    <Tag
      ref={setRef}
      className={className ? `fluid-hover-list ${className}` : 'fluid-hover-list'}
      data-fluid-hover-axis={axis}
      {...handlers}
      {...rest}
    >
      {children}
    </Tag>
  )
}
