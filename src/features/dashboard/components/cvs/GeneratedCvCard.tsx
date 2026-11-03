'use client';

import { Download, Eye, FileText, FileUp, RefreshCw, Target, UserRound } from 'lucide-react';
import { CV_TEMPLATE_DEFINITIONS, isTemplateId } from '@/shared/constants/templates';
import { cn } from '@/shared/utils/cn';
import { cvProvenance } from '@/features/cv-generation/utils/provenance';
import type { CvRow } from '../DashboardShell';

interface Props {
  cv: CvRow;
  onPreview: (cv: CvRow, opener: HTMLElement) => void;
  onRetryPreview: (cvId: string) => void;
  retrying?: boolean;
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-semibold', className)}>{children}</span>;
}

export default function GeneratedCvCard({ cv, onPreview, onRetryPreview, retrying = false }: Props) {
  const title = cv.title ?? cv.jobTitle ?? 'Generated CV';
  const template = isTemplateId(cv.template) ? CV_TEMPLATE_DEFINITIONS[cv.template].name : cv.template;
  const ready = cv.preview?.status === 'READY' &&
    cv.preview.pageCount !== null &&
    cv.preview.pages.length === cv.preview.pageCount;
  const status = ready
    ? `Ready · ${cv.preview!.pageCount} ${cv.preview!.pageCount === 1 ? 'page' : 'pages'}`
    : cv.preview?.status === 'FAILED' ? 'Preview unavailable'
      : cv.preview?.status === 'RENDERING' || cv.preview?.status === 'PENDING' ? 'Preview processing'
        : 'Preview unavailable';

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="bg-slate-100 p-4">
        {ready ? (
          // Authenticated same-origin image routes must be requested by the browser,
          // rather than by the Next image optimiser without the user's session.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cv.preview!.pages[0]}
            alt={`Preview of ${title}`}
            loading="lazy"
            width={1200}
            height={1697}
            className="mx-auto aspect-[210/297] w-full max-w-56 bg-white object-cover object-top shadow-[0_10px_24px_rgba(15,23,42,0.14)]"
          />
        ) : (
          <div data-testid="cv-preview-placeholder" className="mx-auto flex aspect-[210/297] w-full max-w-56 flex-col items-center justify-center bg-white text-center text-slate-400">
            <FileText className="h-8 w-8" aria-hidden="true" />
            <span className="mt-3 px-4 text-xs font-semibold">{status}</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-slate-900">{title}</h2>
            <p className="mt-1 text-xs text-slate-500">{new Date(cv.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
          {ready
            ? <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">{status}</span>
            : <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{status}</span>}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Pill className="bg-violet-50 text-violet-700">{template}</Pill>
          {cvProvenance(cv) === 'job_match' ? <>
            {cv.jobTitle && <Pill className="bg-sky-50 text-sky-700"><Target className="h-3 w-3" />{cv.jobTitle}{cv.jobCompany ? ` · ${cv.jobCompany}` : ''}</Pill>}
            {cv.sourceFileName && <Pill className="bg-slate-100 text-slate-700"><FileUp className="h-3 w-3" />{cv.sourceFileName}</Pill>}
            {cv.matchScore !== null && <Pill className="bg-slate-100 text-slate-700">Match {cv.matchScore}</Pill>}
          </> : <Pill className="bg-slate-100 text-slate-700"><UserRound className="h-3 w-3" />Built from profile</Pill>}
          {cv.profileLabel && <Pill className="bg-slate-100 text-slate-600">{cv.profileLabel}</Pill>}
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
          {ready && <button type="button" onClick={(event) => onPreview(cv, event.currentTarget)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-800"><Eye className="h-4 w-4" />Preview CV</button>}
          <a href={`/api/cv/${encodeURIComponent(cv.id)}/download`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"><Download className="h-4 w-4" />Download DOCX</a>
          {cv.preview?.pdfUrl && <a href={cv.preview.pdfUrl} className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"><Download className="h-4 w-4" />Download verified PDF</a>}
          {cv.preview?.retryable && cv.preview.pdfUrl && <button type="button" disabled={retrying} onClick={() => onRetryPreview(cv.id)} className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-50 px-3 text-xs font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50"><RefreshCw className={cn('h-4 w-4', retrying && 'animate-spin')} />Retry thumbnail</button>}
        </div>
      </div>
    </article>
  );
}
