'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileStack, Plus } from 'lucide-react';
import DashboardTopBar from '../DashboardTopBar';
import CvGenerationWizard from '@/features/cv-generation/components/CvGenerationWizard';
import GeneratedCvCard from '../cvs/GeneratedCvCard';
import CvPreviewViewer from '../cvs/CvPreviewViewer';
import type { CvRow, AnalysisRow } from '../DashboardShell';

interface Props {
  cvs: CvRow[];
  analyses: AnalysisRow[];
  profileComplete: boolean;
  profileReasoning: boolean;
  activeProfileId: string;
  activeProfileLabel: string;
  reasoningRemaining: number | null;
}

export default function CvsView(props: Props) {
  const { cvs, analyses, profileComplete, activeProfileId } = props;
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedCv, setSelectedCv] = useState<CvRow | null>(null);
  const [retryingCvId, setRetryingCvId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewOpener = useRef<HTMLElement>(null);

  async function retryPreview(cvId: string) {
    setRetryingCvId(cvId);
    setPreviewError(null);
    try {
      const response = await fetch(`/api/cv/${encodeURIComponent(cvId)}/preview`, { method: 'POST' });
      if (!response.ok) throw new Error('Thumbnail retry failed');
      router.refresh();
    } catch {
      setPreviewError('The thumbnail could not be regenerated. Your verified document downloads are still available.');
    } finally {
      setRetryingCvId(null);
    }
  }

  const generateButton = (
    <button type="button" onClick={() => setWizardOpen(true)} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800">
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
        {previewError && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{previewError}</p>}
        {cvs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><FileStack className="h-5 w-5" /></span>
            <p className="mt-4 text-sm font-semibold text-slate-900">No CVs generated yet</p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">Build a CV from your profile or tailor one to a saved job. New verified versions will appear here.</p>
            <button type="button" onClick={() => setWizardOpen(true)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800"><Plus className="h-3.5 w-3.5" strokeWidth={2.5} />Generate new CV</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cvs.map((cv) => (
              <GeneratedCvCard
                key={cv.id}
                cv={cv}
                retrying={retryingCvId === cv.id}
                onRetryPreview={retryPreview}
                onPreview={(value, opener) => {
                  previewOpener.current = opener;
                  setSelectedCv(value);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {wizardOpen && (
        <CvGenerationWizard
          isOpen={wizardOpen}
          onClose={() => setWizardOpen(false)}
          analyses={analyses}
          profileComplete={profileComplete}
          activeProfileId={activeProfileId}
          onGenerated={() => router.refresh()}
        />
      )}
      {selectedCv?.preview?.status === 'READY' && selectedCv.preview.pages.length > 0 && (
        <CvPreviewViewer
          title={selectedCv.title ?? selectedCv.jobTitle ?? 'Generated CV'}
          preview={selectedCv.preview}
          docxUrl={`/api/cv/${encodeURIComponent(selectedCv.id)}/download`}
          onClose={() => setSelectedCv(null)}
          returnFocus={previewOpener}
        />
      )}
    </>
  );
}
