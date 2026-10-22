'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Minus, Plus, X } from 'lucide-react';
import type { CvPreviewView } from '@/shared/document-preview/preview-view';

interface Props {
  title: string;
  preview: CvPreviewView;
  docxUrl: string;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLElement | null>;
}

const focusableSelector = 'button:not([disabled]), a[href]';

export default function CvPreviewViewer({ title, preview, docxUrl, onClose, returnFocus }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState(false);

  const close = () => {
    onClose();
    queueMicrotask(() => returnFocus.current?.focus());
  };

  useEffect(() => {
    closeRef.current?.focus();
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
  });

  const showPage = (next: number) => {
    const bounded = Math.max(0, Math.min(preview.pages.length - 1, next));
    setPage(bounded);
    pageRefs.current[bounded]?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const trapFocus = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex min-w-0 items-center justify-center bg-slate-950/90 p-2 sm:p-5" role="presentation">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="cv-preview-viewer-title" onKeyDown={trapFocus} className="flex max-h-[96vh] min-w-0 w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <h2 id="cv-preview-viewer-title" className="truncate text-base font-bold text-slate-900">{title} preview</h2>
            <p className="mt-0.5 text-xs text-slate-500">Verified LibreOffice PDF · Page {page + 1} of {preview.pages.length}</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Zoom out" disabled={zoom <= 75} onClick={() => setZoom((value) => Math.max(75, value - 25))} className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35"><Minus className="h-4 w-4" /></button>
            <span className="w-12 text-center text-xs font-semibold tabular-nums text-slate-600">{zoom}%</span>
            <button type="button" aria-label="Zoom in" disabled={zoom >= 150} onClick={() => setZoom((value) => Math.min(150, value + 25))} className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35"><Plus className="h-4 w-4" /></button>
            <button ref={closeRef} type="button" aria-label="Close CV preview" onClick={close} className="ml-1 flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"><X className="h-5 w-5" /></button>
          </div>
        </header>

        <div data-testid="cv-viewer-scroll" className="max-w-full flex-1 overflow-auto overscroll-contain bg-slate-200 p-3 sm:p-6">
          {loaded < preview.pages.length && !failed && <p className="sticky left-0 top-0 z-10 mx-auto w-fit rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Loading document preview…</p>}
          {failed && <p role="alert" className="sticky left-0 top-0 z-10 mx-auto w-fit rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">The document preview could not be loaded. Downloads remain available.</p>}
          <div className="mx-auto flex min-w-0 flex-col items-center gap-5" style={{ width: `${zoom}%`, maxWidth: `${zoom * 8}px` }}>
            {preview.pages.map((source, index) => (
              <div key={source} ref={(node) => { pageRefs.current[index] = node; }} className="w-full max-w-[50rem] shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={source} alt={`${title}, page ${index + 1}`} width={1200} height={1697} onLoad={() => setLoaded((value) => value + 1)} onError={() => setFailed(true)} className="aspect-[210/297] h-auto w-full bg-white object-contain shadow-[0_12px_32px_rgba(15,23,42,0.18)]" />
              </div>
            ))}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => showPage(page - 1)} className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-35"><ChevronLeft className="h-4 w-4" />Previous</button>
            <button type="button" aria-label="Next page" disabled={page === preview.pages.length - 1} onClick={() => showPage(page + 1)} className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-35">Next<ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={docxUrl} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700"><Download className="h-4 w-4" />Download DOCX</a>
            {preview.pdfUrl && <a href={preview.pdfUrl} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white"><Download className="h-4 w-4" />Download verified PDF</a>}
          </div>
        </footer>
      </section>
    </div>
  );
}
