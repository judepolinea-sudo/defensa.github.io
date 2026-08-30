'use client'

import { useRef, useState } from 'react'
import NumberFlow from '@number-flow/react'
import { TimelineContent } from '@/components/ui/timeline-animation'
import { VerticalCutReveal } from '@/components/ui/vertical-cut-reveal'
import { Sparkles } from '@/components/ui/sparkles'
import { cn } from '@/lib/utils'

const PLANS = [
  {
    name: 'Student',
    monthlyPrice: 99,
    yearlyPrice: 990, // 12 months billed as 10 (2 months free)
    description: 'For NU Clark students preparing for a thesis or capstone defense.',
    features: [
      'AI-powered mock defense sessions',
      'Real-time feedback on answers',
      'Chapter-based question generation',
      'Session recording & playback',
      'Performance analytics',
      'Up to 10 sessions/month',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Premium',
    monthlyPrice: 299,
    yearlyPrice: 2990, // 12 months billed as 10 (2 months free)
    description: 'Unlimited practice with the full readiness dashboard and priority support.',
    features: [
      'Everything in Student',
      'Unlimited practice sessions',
      'Full readiness dashboard & score trends',
      'Adversarial hard-mode panelists',
      'Export performance reports (PDF)',
      'Priority support',
    ],
    cta: 'Go Premium',
    highlighted: true,
  },
]

type BillingCycle = 'monthly' | 'yearly'

const timelineVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.15, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
}

export default function PricingSection() {
  const [billing, setBilling] = useState<BillingCycle>('monthly')
  const sectionRef = useRef<HTMLElement>(null)

  return (
    <section
      ref={sectionRef}
      id="pricing"
      className="relative py-32 px-6 bg-slate-900 border-y border-white/5 overflow-hidden scroll-mt-28"
    >
      {/* Sparkle background */}
      <Sparkles
        className="absolute inset-0 w-full h-full pointer-events-none"
        color="var(--sparkles-color, #2563eb)"
        size={1.2}
        density={60}
        speed={0.4}
        opacity={0.5}
      />

      <div className="relative max-w-6xl mx-auto">
        {/* Heading */}
        <TimelineContent
          animationNum={0}
          timelineRef={sectionRef as React.RefObject<HTMLElement | null>}
          customVariants={timelineVariants}
          className="text-center mb-16"
        >
          <p className="text-sm uppercase tracking-widest text-blue-400 mb-3 font-semibold">Pricing</p>
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white mb-4">
            <VerticalCutReveal
              splitBy="words"
              staggerDuration={0.12}
              staggerFrom="first"
              transition={{ type: 'spring', stiffness: 160, damping: 20 }}
              containerClassName="justify-center"
            >
              Simple Pricing
            </VerticalCutReveal>
          </h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Simple monthly or yearly pricing. Cancel anytime.
          </p>
        </TimelineContent>

        {/* Billing toggle */}
        <TimelineContent
          animationNum={1}
          timelineRef={sectionRef as React.RefObject<HTMLElement | null>}
          customVariants={timelineVariants}
          className="flex justify-center mb-12"
        >
          <div className="inline-flex items-center gap-1 bg-white/5 border border-white/10 rounded-full p-1">
            {(['monthly', 'yearly'] as BillingCycle[]).map((cycle) => (
              <button
                key={cycle}
                type="button"
                onClick={() => setBilling(cycle)}
                className={cn(
                  'px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 capitalize',
                  billing === cycle
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                {cycle}
                {cycle === 'yearly' && (
                  <span className="ml-1.5 text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
                    2 months free
                  </span>
                )}
              </button>
            ))}
          </div>
        </TimelineContent>

        {/* Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {PLANS.map((plan, i) => (
            <TimelineContent
              key={plan.name}
              animationNum={i + 2}
              timelineRef={sectionRef as React.RefObject<HTMLElement | null>}
              customVariants={timelineVariants}
            >
              <div
                className={cn(
                  'relative rounded-3xl p-8 border transition-all duration-300 group',
                  plan.highlighted
                    ? 'bg-blue-600/10 border-blue-500/40 shadow-xl shadow-blue-500/10'
                    : 'bg-white/5 border-white/10 hover:border-white/20'
                )}
              >
                {plan.highlighted && (
                  <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
                )}
                {plan.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full tracking-wider uppercase">
                    Most Popular
                  </span>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                  <p className="text-slate-400 text-sm">{plan.description}</p>
                </div>

                <div className="mb-8">
                  <div className="flex items-end gap-1">
                    <span className="text-5xl font-black text-white">
                      <NumberFlow
                        value={billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice}
                        format={{
                          style: 'currency',
                          currency: 'PHP',
                          currencyDisplay: 'narrowSymbol',
                          maximumFractionDigits: 0,
                        }}
                      />
                    </span>
                    <span className="text-slate-400 mb-2 text-sm">
                      /{billing === 'yearly' ? 'yr' : 'mo'}
                    </span>
                  </div>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-3 text-sm text-slate-300">
                      <svg
                        className={cn('w-4 h-4 mt-0.5 shrink-0', plan.highlighted ? 'text-blue-400' : 'text-emerald-400')}
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M3 8l3.5 3.5L13 4.5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {feat}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className={cn(
                    'w-full py-3 rounded-2xl font-semibold text-sm transition-all duration-200 active:scale-95',
                    plan.highlighted
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30'
                      : 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                  )}
                >
                  {plan.cta}
                </button>
              </div>
            </TimelineContent>
          ))}
        </div>

        {/* Footer note */}
        <TimelineContent
          animationNum={4}
          timelineRef={sectionRef as React.RefObject<HTMLElement | null>}
          customVariants={timelineVariants}
          className="text-center mt-12"
        >
          <p className="text-slate-500 text-sm">
            This platform is part of the NU Clark capstone thesis project.{' '}
            <span className="text-slate-400">Yearly plans are billed as 10 months.</span>
          </p>
        </TimelineContent>
      </div>
    </section>
  )
}
