'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, FileStack, Plus, Download, Target, FileUp, UserRound } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import DashboardTopBar from '../DashboardTopBar';
import GenerateCvWizardModal from '@/features/cv-rewrite/components/GenerateCvWizardModal';
import { cvProvenance } from '@/features/cv-rewrite/utils/provenance';
import type { CvRow, AnalysisRow } from '../DashboardShell';

/** Provenance chip on a CV card. Truncates so a long filename can't break the grid. */
function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold',
        className
      )}
    >
      {children}
    </span>
  );
}

export default function CvsView({
  cvs,
  analyses,
  profileComplete,
  profileReasoning,
  activeProfileId,
  activeProfileLabel,
  reasoningRemaining,
}: {
  cvs: CvRow[];
  analyses: AnalysisRow[];
  profileComplete: boolean;
  /** Whether the plan includes profile-vs-CV reasoning. */
  profileReasoning: boolean;
  /** Career track the reasoning compares against. */
  activeProfileId: string;
  activeProfileLabel: string;
  /** Reasoning runs left this month; null when the plan is unmetered. */
  reasoningRemaining: number | null;
}) {
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(false);

  const generateButton = (
    <button
      type="button"
      onClick={() => setWizardOpen(true)}
      className="inline-flex shrink-0 items-center gap-2 rounded-full bg-accent-purple px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-accent-purple/90 hover:shadow-[0_0_24px_-4px_hsl(262_83%_58%/0.6)]"
    >
      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
      Generate new CV
    </button>
  );

  return (
    <>
      <DashboardTopBar
        title="Generated CVs"
        subtitle={cvs.length === 0 ? 'CVs you build with Align are saved here' : `${cvs.length} ${cvs.length === 1 ? 'CV' : 'CVs'}`}
        rightSlot={generateButton}
      />

      <div className="px-4 py-6 sm:px-6 lg:px-8">
        {cvs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white px-6 py-16 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400">
              <FileStack className="h-5 w-5" />
            </span>
            <p className="mt-4 text-sm font-semibold text-neutral-900">No CVs generated yet</p>
            <p className="mt-1 max-w-sm text-xs text-neutral-500">
              Build a CV straight from your profile, or rebuild one tailored to a job you&apos;ve already analysed.
              Saved versions will appear here.
            </p>
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent-purple px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-accent-purple/90"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Generate new CV
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cvs.map((cv) => (
              <article key={cv.id} className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-cyan/10 text-accent-cyan">
                  <FileText className="h-4 w-4" />
                </span>
                {/* The document's own tagline, not the renderer's name. Falls
                    back to the role it was targeted at, then to the template,
                    so a card always says something true. */}
                <h2 className="mt-3 text-sm font-bold text-neutral-900">
                  {cv.title ?? cv.jobTitle ?? <span className="capitalize">{cv.template} template</span>}
                </h2>
                <p className="mt-1 text-xs text-neutral-400">
                  {new Date(cv.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Pill className="bg-neutral-100 text-neutral-600 capitalize">{cv.template}</Pill>

                  {cvProvenance(cv) === 'analysis' ? (
                    <>
                      {cv.jobTitle && (
                        <Pill className="bg-purple-50 text-accent-purple">
                          <Target className="h-3 w-3" />
                          {cv.jobTitle}
                          {cv.jobCompany ? ` · ${cv.jobCompany}` : ''}
                        </Pill>
                      )}
                      {cv.sourceFileName && (
                        <Pill className="bg-neutral-100 text-neutral-600">
                          <FileUp className="h-3 w-3" />
                          {cv.sourceFileName}
                        </Pill>
                      )}
                      {cv.matchScore !== null && (
                        <Pill className="bg-neutral-100 text-neutral-600">
                          Match {cv.matchScore}
                        </Pill>
                      )}
                    </>
                  ) : (
                    <Pill className="bg-neutral-100 text-neutral-600">
                      <UserRound className="h-3 w-3" />
                      Built from profile
                    </Pill>
                  )}

                  {cv.profileLabel && (
                    <Pill className="bg-neutral-100 text-neutral-600">{cv.profileLabel}</Pill>
                  )}
                </div>

                <a
                  href={`/api/cv/${cv.id}/download`}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-100"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              </article>
            ))}
          </div>
        )}
      </div>

      {wizardOpen && (
        <GenerateCvWizardModal
          isOpen={wizardOpen}
          onClose={() => setWizardOpen(false)}
          analyses={analyses}
          profileComplete={profileComplete}
          profileReasoning={profileReasoning}
          activeProfileId={activeProfileId}
          activeProfileLabel={activeProfileLabel}
          reasoningRemaining={reasoningRemaining}
          onGenerated={() => router.refresh()}
        />
      )}
    </>
  );
}
