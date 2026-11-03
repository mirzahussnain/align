'use client';

import React from 'react';
import { WORKFLOW_NODES } from '@/shared/constants/workflow';
import { cn } from '@/shared/utils/cn';

const MOBILE_SIGNAL_PATHS = [
  { id: 'mobile-signal-1', d: 'M60 82 C60 96 105 100 125 120', duration: '3.8s', begin: '0s' },
  { id: 'mobile-signal-2', d: 'M180 82 L180 116', duration: '3.4s', begin: '0.8s' },
  { id: 'mobile-signal-3', d: 'M300 82 C300 96 255 100 235 120', duration: '4.1s', begin: '0.4s' },
  { id: 'mobile-signal-4', d: 'M125 480 C105 500 60 506 60 530', duration: '4s', begin: '0.2s' },
  { id: 'mobile-signal-5', d: 'M180 484 L180 530', duration: '3.6s', begin: '1s' },
  { id: 'mobile-signal-6', d: 'M235 480 C255 500 300 506 300 530', duration: '4.2s', begin: '0.6s' },
] as const;

function SignalNode({
  node,
  belowLaptop = false,
}: {
  node: (typeof WORKFLOW_NODES)[number];
  belowLaptop?: boolean;
}) {
  const Icon = node.icon;
  return (
    <div className={cn('flex min-w-0 items-center gap-2', belowLaptop ? 'flex-col-reverse' : 'flex-col')}>
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-600 shadow-[0_7px_22px_-8px_rgba(15,23,42,0.35)]">
        <span className="absolute inset-1 rounded-full bg-sky-50/70" />
        <span className="relative flex" aria-hidden="true">
          <Icon size={17} strokeWidth={1.6} />
        </span>
      </div>
      <span className="max-w-[6.5rem] text-center text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.08em] text-slate-500">
        {node.label}
      </span>
    </div>
  );
}

export function MobileWorkflowSignals() {
  const upperSignals = WORKFLOW_NODES.slice(0, 3);
  const lowerSignals = WORKFLOW_NODES.slice(3);

  return (
    <div
      data-testid="mobile-workflow-signals"
      className="pointer-events-none absolute inset-0 z-10 lg:hidden"
      aria-hidden="true"
    >
      <div className="absolute left-1/2 top-10 h-24 w-64 -translate-x-1/2 rounded-full bg-sky-100/45 blur-3xl" />
      <div className="absolute bottom-8 left-1/2 h-24 w-64 -translate-x-1/2 rounded-full bg-cyan-100/40 blur-3xl" />

      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 360 600"
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {MOBILE_SIGNAL_PATHS.map((path) => (
          <React.Fragment key={path.id}>
            <path
              id={path.id}
              data-signal-path
              d={path.d}
              stroke="url(#mobile-signal-gradient)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle
              data-signal-pulse
              r="3"
              fill="#38bdf8"
              className="motion-reduce:hidden"
              filter="drop-shadow(0 0 5px #38bdf8)"
            >
              <animateMotion dur={path.duration} begin={path.begin} repeatCount="indefinite">
                <mpath href={`#${path.id}`} />
              </animateMotion>
            </circle>
          </React.Fragment>
        ))}
        <defs>
          <linearGradient id="mobile-signal-gradient" x1="180" y1="70" x2="180" y2="540" gradientUnits="userSpaceOnUse">
            <stop stopColor="#cbd5e1" stopOpacity="0.45" />
            <stop offset="0.5" stopColor="#7dd3fc" stopOpacity="0.75" />
            <stop offset="1" stopColor="#cbd5e1" stopOpacity="0.45" />
          </linearGradient>
        </defs>
      </svg>

      <div className="absolute inset-x-0 top-0 z-30 grid grid-cols-3 gap-1 px-1">
        {upperSignals.map((node) => <SignalNode key={node.id} node={node} />)}
      </div>
      <div className="absolute inset-x-0 bottom-0 z-30 grid grid-cols-3 gap-1 px-1">
        {lowerSignals.map((node) => <SignalNode key={node.id} node={node} belowLaptop />)}
      </div>
    </div>
  );
}
