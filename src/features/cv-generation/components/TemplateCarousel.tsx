'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import {
  CV_TEMPLATE_DEFINITIONS,
  TEMPLATE_IDS,
  type TemplateId,
} from '@/shared/constants/templates';
import TemplatePreviewDialog from './TemplatePreviewDialog';

interface Props {
  template: TemplateId;
  onTemplateChange: (template: TemplateId) => void;
}

const SWIPE_THRESHOLD_PX = 56;

export default function TemplateCarousel({ template, onTemplateChange }: Props) {
  const activeIndex = TEMPLATE_IDS.indexOf(template);
  const definition = CV_TEMPLATE_DEFINITIONS[template];
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  const selectAt = (index: number) => {
    const normalized = (index + TEMPLATE_IDS.length) % TEMPLATE_IDS.length;
    onTemplateChange(TEMPLATE_IDS[normalized]);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const index = event.key === 'Home' ? 0
      : event.key === 'End' ? TEMPLATE_IDS.length - 1
        : event.key === 'ArrowLeft' ? activeIndex - 1
          : event.key === 'ArrowRight' ? activeIndex + 1
            : null;
    if (index === null) return;
    event.preventDefault();
    selectAt(index);
  };

  const finishPointer = (event: React.PointerEvent<HTMLElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const horizontal = event.clientX - start.x;
    const vertical = event.clientY - start.y;
    if (Math.abs(horizontal) < SWIPE_THRESHOLD_PX || Math.abs(horizontal) <= Math.abs(vertical) * 1.25) return;
    selectAt(activeIndex + (horizontal < 0 ? 1 : -1));
  };

  return (
    <section
      role="region"
      aria-label="CV template selection"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-violet focus-visible:ring-offset-4 focus-visible:ring-offset-bg-secondary"
    >
      <div className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 sm:gap-4">
        <button
          type="button"
          aria-label="Previous template"
          onClick={() => selectAt(activeIndex - 1)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border-default text-text-secondary hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-violet"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>

        <div
          data-testid="template-preview-swipe-area"
          onPointerDown={(event) => { pointerStart.current = { x: event.clientX, y: event.clientY }; }}
          onPointerUp={finishPointer}
          onPointerCancel={() => { pointerStart.current = null; }}
          className="min-w-0 touch-pan-y select-none"
        >
          <button
            ref={previewButtonRef}
            type="button"
            aria-label={`View larger preview of ${definition.name}`}
            onClick={() => setDialogOpen(true)}
            className="group relative mx-auto block aspect-[210/297] w-full max-w-[22rem] overflow-hidden rounded-xl bg-white text-left shadow-[0_14px_34px_rgba(15,23,42,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-violet focus-visible:ring-offset-4 focus-visible:ring-offset-bg-secondary"
          >
            <Image
              key={template}
              data-testid="template-preview-image"
              data-motion={reducedMotion ? 'reduced' : 'standard'}
              src={`/template-previews/v1/${template}-page-1.png`}
              alt={`${definition.name} CV template preview`}
              width={1200}
              height={1697}
              loading="lazy"
              draggable={false}
              className={cn(
                'h-full w-full object-cover object-top',
                reducedMotion ? 'transition-none' : 'transition-opacity duration-300 ease-out',
              )}
            />
            <span className="absolute bottom-3 right-3 flex h-11 items-center gap-2 rounded-full bg-brand-primary px-4 text-xs font-bold text-bg-secondary opacity-95">
              <Expand className="h-4 w-4" aria-hidden="true" /> View larger
            </span>
          </button>
        </div>

        <button
          type="button"
          aria-label="Next template"
          onClick={() => selectAt(activeIndex + 1)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border-default text-text-secondary hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-violet"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="mx-auto mt-5 max-w-xl text-center" aria-live="polite">
        <p className="text-xs font-semibold tabular-nums text-text-tertiary">{activeIndex + 1} of {TEMPLATE_IDS.length}</p>
        <h4 className="mt-1 text-lg font-bold text-text-primary">{definition.name}</h4>
        <p className="mx-auto mt-1 max-w-[65ch] text-sm leading-6 text-text-secondary">{definition.description}</p>
        <p className="mt-1 text-xs text-text-tertiary">{definition.purpose} · {definition.font}</p>
      </div>

      <div className="mt-5 flex max-w-full gap-3 overflow-x-auto px-1 pb-2" aria-label="Choose a template">
        {TEMPLATE_IDS.map((id) => {
          const item = CV_TEMPLATE_DEFINITIONS[id];
          const selected = id === template;
          return (
            <button
              key={id}
              type="button"
              aria-label={`Select ${item.name} template`}
              aria-pressed={selected}
              onClick={() => onTemplateChange(id)}
              className={cn(
                'w-24 shrink-0 rounded-xl p-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-violet',
                selected ? 'bg-accent-violet/15 text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary',
              )}
            >
              <span className={cn('block aspect-[210/297] overflow-hidden rounded-lg bg-white', selected && 'ring-2 ring-accent-violet')}>
                <Image
                  src={`/template-previews/v1/${id}-page-1.png`}
                  alt=""
                  width={1200}
                  height={1697}
                  loading="lazy"
                  className="h-full w-full object-cover object-top"
                />
              </span>
              <span className="mt-2 block truncate px-0.5 text-xs font-semibold">{item.name}</span>
            </button>
          );
        })}
      </div>

      <TemplatePreviewDialog
        template={template}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        returnFocus={previewButtonRef}
      />
    </section>
  );
}
