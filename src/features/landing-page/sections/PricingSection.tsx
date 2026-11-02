'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Check, ChevronDown, Minus } from 'lucide-react';
import {
  PUBLIC_PRICING_GROUPS,
  PUBLIC_PRICING_PLANS,
} from '@/features/landing-page/pricing-presentation';
import { cn } from '@/shared/utils/cn';

export default function PricingSection() {
  return (
    <section
      id="pricing"
      className="relative z-10 scroll-mt-24 border-t border-border-subtle/40 bg-bg-primary px-4 py-24 sm:px-6 md:py-32 lg:px-8"
    >
      <div className="relative z-20 mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="mx-auto mb-14 max-w-2xl text-center md:mb-16"
        >
          <h2 className="text-[2.5rem] font-medium leading-[1.08] tracking-[-0.035em] text-[#1e293b] sm:text-5xl md:text-[3.5rem]">
            Simple pricing for your job search
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[15px] font-medium leading-relaxed text-slate-500 md:text-base">
            Start free. Upgrade when you&apos;re ready to apply with confidence.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
          {PUBLIC_PRICING_PLANS.map((plan, index) => (
            <motion.article
              key={plan.id}
              aria-label={`${plan.name} plan`}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.45, delay: index * 0.08 }}
              className={cn(
                'glass-card relative flex h-full flex-col p-7 transition-all duration-300 ease-out sm:p-9',
                plan.highlight
                  ? 'border-accent-cyan/50 shadow-[0_20px_45px_rgba(15,23,42,0.08),_0_0_30px_hsla(var(--accent-cyan),0.16)]'
                  : 'hover:-translate-y-1 hover:border-accent-cyan/35'
              )}
            >
              {plan.highlight && (
                <span className="absolute right-6 top-6 rounded-full bg-accent-cyan px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm sm:right-8 sm:top-8">
                  Most popular
                </span>
              )}

              <p className="text-sm font-bold text-text-primary">{plan.name}</p>
              <p className="mt-5 flex items-end gap-1.5 text-5xl font-black tracking-[-0.04em] text-text-primary">
                {plan.price}
                <span className="pb-1 text-sm font-medium tracking-normal text-text-tertiary">{plan.period}</span>
              </p>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">{plan.tagline}</p>

              <ul className="my-8 flex flex-col gap-3.5" aria-label={`${plan.name} highlights`}>
                {plan.benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3 text-sm leading-6 text-slate-600">
                    <Check
                      className={cn('mt-1 h-4 w-4 shrink-0', plan.highlight ? 'text-accent-cyan' : 'text-slate-400')}
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className={cn(
                  'group mt-auto flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-3 text-[13px] font-bold transition-all',
                  plan.highlight
                    ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/10 hover:bg-slate-800'
                    : 'border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                {plan.cta}
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </motion.article>
          ))}
        </div>

        <details className="group mt-10 overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white/70 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-cyan sm:px-7">
            <span>Compare all plan features</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
          </summary>

          <div className="border-t border-slate-200/80 px-4 pb-5 pt-2 sm:px-7 sm:pb-7">
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1.5fr)_minmax(4.75rem,.65fr)_minmax(4.75rem,.65fr)] gap-x-3 border-b border-slate-200 bg-white/95 px-2 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 backdrop-blur sm:px-3">
              <span>Allowance</span>
              <span>Free</span>
              <span className="text-slate-600">Pro</span>
            </div>

            {PUBLIC_PRICING_GROUPS.map((group) => {
              const headingId = `pricing-${group.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`;
              return (
                <section key={group.title} aria-labelledby={headingId}>
                  <h3 id={headingId} className="px-2 pb-2 pt-6 text-xs font-bold text-slate-800 sm:px-3">
                    {group.title}
                  </h3>
                  <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-white">
                    {group.rows.map((item) => {
                      const unavailable = item.free === 'Not included';
                      return (
                        <div
                          key={item.capability}
                          className="grid grid-cols-[minmax(0,1.5fr)_minmax(4.75rem,.65fr)_minmax(4.75rem,.65fr)] gap-x-3 border-b border-slate-100 px-3 py-3 text-xs leading-5 last:border-b-0 sm:text-[13px]"
                        >
                          <span className="pr-1 font-medium text-slate-600">{item.label}</span>
                          <span className={cn('flex items-start gap-1.5 text-slate-500', unavailable && 'text-slate-400')}>
                            {unavailable && <Minus className="mt-1 h-3 w-3 shrink-0" aria-hidden="true" />}
                            {item.free}
                          </span>
                          <span className="font-semibold text-slate-700">{item.pro}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </details>

        <p className="mt-5 text-center text-xs leading-5 text-text-tertiary">
          Limits reset as shown. You can review plan details before creating an account.
        </p>
      </div>
    </section>
  );
}
