'use client'

import { ElementType, ReactNode, RefObject } from 'react'
import { motion, useInView } from 'motion/react'
import { cn } from '@/lib/utils'

type Variants = {
  visible: (i: number) => object
  hidden: object
}

interface TimelineContentProps {
  as?: ElementType
  animationNum: number
  timelineRef: RefObject<HTMLElement | null>
  customVariants: Variants
  className?: string
  children?: ReactNode
}

const motionElements: Record<string, React.ElementType> = {
  div: motion.div,
  p: motion.p,
  span: motion.span,
  section: motion.section,
  article: motion.article,
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  h4: motion.h4,
  ul: motion.ul,
  li: motion.li,
}

export function TimelineContent({
  as = 'div',
  animationNum,
  timelineRef,
  customVariants,
  className,
  children,
}: TimelineContentProps) {
  const isInView = useInView(timelineRef as RefObject<Element>, { once: true, margin: '-5%' })
  const MotionComp = (motionElements[as as string] ?? motion.div) as React.ElementType

  return (
    <MotionComp
      custom={animationNum}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={customVariants}
      className={cn(className)}
    >
      {children}
    </MotionComp>
  )
}
