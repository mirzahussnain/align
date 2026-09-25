'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, ArrowRight } from 'lucide-react';
import { PLANS } from '@/shared/constants/plans';
import { cn } from '@/shared/utils/cn';

const PLAN_SECTION_LABELS = {
  core: 'Included',
  monthly: 'Monthly allowances',
  lifetime: 'Lifetime allowances',
  account: 'Account limits',
} as const;

export default function PricingSection() {
  const proPlan = PLANS.find((plan) => plan.id === 'pro');
  return (
    <section
      id="pricing"
      className="relative py-24 md:py-32 px-4 sm:px-6 lg:px-8 bg-bg-primary z-10 border-t border-border-subtle/40 scroll-mt-24"
    >
      <div className="max-w-6xl mx-auto relative z-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-[2.5rem] sm:text-5xl md:text-[3.5rem] font-medium text-[#1e293b] tracking-[-0.03em] leading-[1.1] mt-4">
            Start Free, Upgrade When You&apos;re <span className="text-slate-500">Applying Seriously</span>
          </h2>
          <p className="text-[15px] md:text-[16px] text-slate-500 leading-relaxed mt-6 max-w-2xl mx-auto font-medium">
            Rule-based ATS analysis is unlimited on both plans. AI-enhanced ATS,
            Job Match and CV regeneration have separate allowances.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {PLANS.map((plan, idx) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className={cn(
                'glass-card p-8 h-full flex flex-col relative transition-all duration-300 ease-out',
                plan.highlight
                  ? 'border-accent-cyan/50 shadow-[0_20px_45px_rgba(15,23,42,0.08),_0_0_30px_hsla(var(--accent-cyan),0.18)] md:-translate-y-4'
                  : 'hover:translate-y-[-6px] hover:border-accent-cyan/40'
              )}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-cyan px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
                  Most popular
                </span>
              )}

              <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">{plan.name}</p>

              <p className="mt-4 text-4xl font-black tracking-tight text-text-primary">
                {plan.price}
                <span className="text-sm font-medium text-text-tertiary">{plan.period}</span>
              </p>

              <p className="mt-3 text-xs text-text-tertiary leading-relaxed">{plan.tagline}</p>

              <div className="mt-7 mb-8 space-y-5">
                {(Object.keys(PLAN_SECTION_LABELS) as Array<keyof typeof PLAN_SECTION_LABELS>).map((section) => {
                  const features = plan.sections[section];
                  if (features.length === 0) return null;
                  return (
                    <div key={section}>
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        {PLAN_SECTION_LABELS[section]}
                      </h3>
                      <ul className="mt-2.5 flex flex-col gap-2.5">
                        {features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2.5 text-[13px] text-slate-600 leading-relaxed">
                            <Check
                              className={cn(
                                'mt-0.5 h-4 w-4 shrink-0',
                                plan.highlight ? 'text-accent-cyan' : 'text-slate-400'
                              )}
                              strokeWidth={2.5}
                              aria-hidden="true"
                            />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              <Link
                href="/signup"
                className={cn(
                  'mt-auto group flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[13px] font-bold transition-all',
                  plan.highlight
                    ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-xl shadow-slate-900/10'
                    : 'border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                {plan.id === 'free' ? 'Get started free' : `Choose ${plan.name}`}
                <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </motion.div>
          ))}
        </div>

        {proPlan && (
          <p className="mt-10 text-center text-xs text-text-tertiary">
            Pro is {proPlan.price}{proPlan.period}. There is no annual plan or day pass.
          </p>
        )}
      </div>
    </section>
  );
}
