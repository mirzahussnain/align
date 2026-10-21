'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';
import { CV_TEMPLATE_DEFINITIONS, type TemplateId } from '@/shared/constants/templates';

interface Props {
  template: TemplateId;
  open: boolean;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}

export default function TemplatePreviewDialog({ template, open, onClose, returnFocus }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const definition = CV_TEMPLATE_DEFINITIONS[template];

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        queueMicrotask(() => returnFocus.current?.focus());
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open, returnFocus]);

  if (!open) return null;

  const close = () => {
    onClose();
    queueMicrotask(() => returnFocus.current?.focus());
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-bg-primary/95 p-4"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-preview-title"
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-bg-secondary shadow-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-4">
          <div>
            <h2 id="template-preview-title" className="text-lg font-bold text-text-primary">{definition.name} preview</h2>
            <p className="mt-1 text-sm text-text-secondary">First page of the verified LibreOffice rendering</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close template preview"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-violet"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div className="overflow-y-auto bg-bg-primary p-3 sm:p-6">
          <Image
            src={`/template-previews/v1/${template}-page-1.png`}
            alt={`${definition.name} CV template preview`}
            width={1200}
            height={1697}
            className="mx-auto h-auto w-full max-w-[42rem] bg-white"
          />
        </div>
      </section>
    </div>
  );
}
