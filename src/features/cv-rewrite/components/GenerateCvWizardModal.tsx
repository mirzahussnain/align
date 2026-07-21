'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserRound, FileSearch, Lock, ChevronRight, Loader2 } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import { cn } from '@/shared/utils/cn';
import type { AnalysisRow } from '@/features/dashboard/components/DashboardShell';
import type {
  ApprovedProfileEvidence,
  ProfileEvidenceRequirement,
  ProfileEvidenceSuggestion,
} from '@/shared/types/profile-reasoning';
import { requirementEvidencePairKey } from '@/shared/types/profile-reasoning';
import { describeAnalysis } from '@/shared/utils/job-title';

// Reuse the existing rewrite wizard steps so both entry points share one UI.
import TemplateSelectionStep from './steps/TemplateSelectionStep';
import AtsOptimizationStep from './steps/AtsOptimizationStep';
import SkillsBridgeStep from './steps/SkillsBridgeStep';
import ProfileReasoningOptInStep from './steps/ProfileReasoningOptInStep';
import ProfileBridgeStep from './steps/ProfileBridgeStep';
import FormatSelectionStep from './steps/FormatSelectionStep';
import RewriteLoadingStep from './steps/RewriteLoadingStep';
import SuccessStep from './steps/SuccessStep';
import { triggerBrowserDownload } from '../utils/download';
import { DEFAULT_TEMPLATE_ID, type TemplateId } from '@/shared/constants/templates';
import type { ExportFormat } from './RewriteWizardModal';

type Source = 'profile' | 'analysis';
type Step =
  | 'route'
  | 'pick_analysis'
  | 'template'
  | 'ats_opt_in'
  | 'reasoning_opt_in'
  | 'profile_bridge'
  | 'skills_bridge'
  | 'format'
  | 'loading'
  | 'success';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Job-match analyses eligible to rebuild a CV from. */
  analyses: AnalysisRow[];
  /** Whether the profile is 100% complete — gates the "from profile" route. */
  profileComplete: boolean;
  /** Called after a successful generation so the caller can refresh the list. */
  onGenerated?: () => void;
  /** Whether the user's plan includes profile-vs-CV reasoning. */
  profileReasoning?: boolean;
  /** Career track the reasoning compares against. */
  activeProfileId?: string;
  /** Label of that track, shown so the user knows what they're comparing to. */
  activeProfileLabel?: string;
  /** Reasoning runs left this month; null when unmetered. */
  reasoningRemaining?: number | null;
}

const STEP_TITLES: Record<Step, string> = {
  route: 'Generate a new CV',
  pick_analysis: 'Pick an analysis to rebuild from',
  template: 'Choose a template',
  ats_opt_in: 'Optimization mode',
  reasoning_opt_in: 'Compare against your profile?',
  profile_bridge: 'Stronger evidence in your profile',
  skills_bridge: 'Fill in the gaps',
  format: 'Export options',
  loading: 'Generating your CV…',
  success: 'Your CV is ready',
};

export default function GenerateCvWizardModal({
  isOpen,
  onClose,
  analyses,
  profileComplete,
  onGenerated,
  profileReasoning = false,
  activeProfileId,
  activeProfileLabel = 'your',
  reasoningRemaining = null,
}: Props) {
  const [step, setStep] = useState<Step>('route');
  const [source, setSource] = useState<Source | null>(null);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [missingSkills, setMissingSkills] = useState<string[]>([]);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>(DEFAULT_TEMPLATE_ID);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('docx');
  const [hitlContext, setHitlContext] = useState<Record<string, string>>({});
  const [includeAts, setIncludeAts] = useState(true);
  // Opt-in rather than automatic: the comparison costs an AI call and several
  // seconds, and previously ran invisibly with no way to decline it.
  const [includeReasoning, setIncludeReasoning] = useState(true);

  const [evidenceSuggestions, setEvidenceSuggestions] = useState<ProfileEvidenceSuggestion[]>([]);
  const [evidenceRequirements, setEvidenceRequirements] = useState<ProfileEvidenceRequirement[]>([]);
  const [approvedProfileEvidence, setApprovedProfileEvidence] = useState<ApprovedProfileEvidence[]>([]);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [bridgeProfileLabel, setBridgeProfileLabel] = useState('your');

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const jobMatchAnalyses = analyses.filter((a) => a.mode === 'job_match');

  function reset() {
    setStep('route');
    setSource(null);
    setSelectedAnalysisId(null);
    setMissingSkills([]);
    setSelectedTemplate('architect');
    setSelectedFormat('docx');
    setHitlContext({});
    setEvidenceSuggestions([]);
    setEvidenceRequirements([]);
    setApprovedProfileEvidence([]);
    setBridgeError(null);
    setBridgeProfileLabel('your');
    setIncludeAts(true);
    setIncludeReasoning(true);
    setDownloadUrl(null);
    setError(null);
    onClose();
  }

  function chooseProfile() {
    if (!profileComplete) return;
    setError(null);
    setSource('profile');
    setStep('template');
  }

  function chooseAnalysis() {
    if (jobMatchAnalyses.length === 0) return;
    setError(null);
    setSource('analysis');
    setStep('pick_analysis');
  }

  async function selectAnalysis(id: string) {
    setSelectedAnalysisId(id);
    setEvidenceSuggestions([]);
    setEvidenceRequirements([]);
    setApprovedProfileEvidence([]);
    setLoadingAnalysis(true);
    try {
      // Pull the stored job-match spec so the skills-bridge step can offer the
      // exact mandatory skills the analysis flagged as missing.
      const res = await fetch(`/api/analyses/${id}`);
      const json = await res.json();
      const requirements = json?.result?.jobMatchData?.requirements;
      const missing = Array.isArray(requirements)
        ? requirements
            .filter(
              (requirement: { importance?: unknown; status?: unknown }) =>
                requirement.importance === 'mandatory' &&
                ['not_met', 'contradicted', 'unclear'].includes(String(requirement.status))
            )
            .map((requirement: { text?: unknown }) => requirement.text)
            .filter((text: unknown): text is string => typeof text === 'string')
        : [];
      setMissingSkills(missing);
    } catch {
      setMissingSkills([]);
    } finally {
      setLoadingAnalysis(false);
      setStep('template');
    }
  }

  function nextFromTemplate() {
    setStep(source === 'profile' ? 'format' : 'ats_opt_in');
  }

  function afterBridge() {
    setStep(missingSkills.length > 0 ? 'skills_bridge' : 'format');
  }

  /**
   * Whether the profile comparison can be offered at all.
   *
   * Deliberately NOT offered on the from-profile route: reconciling a profile
   * against a CV that was just built from that same profile is circular. This is
   * why a "built from profile" CV never showed a reasoning step — the behaviour
   * is correct, but it was previously invisible rather than explained.
   */
  const canReason =
    profileReasoning &&
    source === 'analysis' &&
    Boolean(selectedAnalysisId) &&
    reasoningRemaining !== 0;

  function nextFromAts() {
    // Out of quota, wrong route, or not on this plan — skip the question rather
    // than asking something the answer can't be acted on.
    setStep(canReason ? 'reasoning_opt_in' : missingSkills.length > 0 ? 'skills_bridge' : 'format');
  }

  async function nextFromReasoningOptIn() {
    if (!includeReasoning) {
      setEvidenceSuggestions([]);
      setEvidenceRequirements([]);
      setApprovedProfileEvidence([]);
      afterBridge();
      return;
    }

    setStep('profile_bridge');
    setEvidenceSuggestions([]);
    setEvidenceRequirements([]);
    setApprovedProfileEvidence([]);
    setBridgeLoading(true);
    setBridgeError(null);
    try {
      const res = await fetch('/api/cv/profile-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: selectedAnalysisId, profileId: activeProfileId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to compare your profile.');

      const found: ProfileEvidenceSuggestion[] = Array.isArray(json.suggestions)
        ? json.suggestions
        : [];
      setEvidenceSuggestions(found);
      setEvidenceRequirements(Array.isArray(json.requirements) ? json.requirements : []);
      setBridgeProfileLabel(json.profileLabel || 'your');
      // Approval is always an explicit click; confidence is display-only.
      setApprovedProfileEvidence([]);
    } catch (err) {
      // A reasoning failure must never block the CV the user came here for.
      setBridgeError(err instanceof Error ? err.message : 'Something went wrong.');
      setEvidenceSuggestions([]);
      setEvidenceRequirements([]);
      setApprovedProfileEvidence([]);
    } finally {
      setBridgeLoading(false);
    }
  }

  function toggleEvidence(suggestion: ProfileEvidenceSuggestion) {
    const key = requirementEvidencePairKey(suggestion.requirementId, suggestion.evidenceRef);
    setApprovedProfileEvidence((previous) => {
      const exists = previous.some(
        (approval) =>
          requirementEvidencePairKey(approval.requirementId, approval.evidenceRef) === key
      );
      return exists
        ? previous.filter(
            (approval) =>
              requirementEvidencePairKey(approval.requirementId, approval.evidenceRef) !== key
          )
        : [
            ...previous,
            {
              requirementId: suggestion.requirementId,
              evidenceRef: suggestion.evidenceRef,
            },
          ];
    });
  }

  async function handleSubmit() {
    setStep('loading');
    setError(null);
    try {
      const response =
        source === 'profile'
          ? await fetch('/api/cv/from-profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                templateId: selectedTemplate,
                profileId: activeProfileId,
              }),
            })
          : await fetch('/api/cv/regenerate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                analysisId: selectedAnalysisId,
                templateId: selectedTemplate,
                hitlContext,
                includeAtsOptimization: includeAts,
                approvedProfileEvidence: approvedProfileEvidence.map((approval) => {
                  const key = requirementEvidencePairKey(
                    approval.requirementId,
                    approval.evidenceRef
                  );
                  const suggestion = evidenceSuggestions.find(
                    (item) =>
                      requirementEvidencePairKey(item.requirementId, item.evidenceRef) === key
                  );
                  return { ...approval, rationale: suggestion?.rationale };
                }),
                profileId: activeProfileId,
              }),
            });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate CV');
      }

      const blob = await response.blob();
      const fileName = source === 'profile' ? 'Profile_CV.docx' : 'Tailored_CV.docx';
      const url = triggerBrowserDownload(blob, fileName);
      setDownloadUrl(url);

      setStep('success');
      onGenerated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setStep(source === 'analysis' ? 'template' : 'route');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-primary/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-3xl bg-bg-secondary rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-xl font-bold text-text-primary">{STEP_TITLES[step]}</h2>
          <button
            onClick={reset}
            disabled={step === 'loading'}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-full transition-colors disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 relative">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          <AnimatePresence mode="wait">
            {step === 'route' && (
              <motion.div key="route" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <p className="text-sm text-slate-500 mb-5">
                  Start from your saved profile, or rebuild a CV around a job you&apos;ve already analysed.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <RouteCard
                    icon={UserRound}
                    title="From your profile"
                    description="Build a clean CV straight from the structured profile you filled in — no job description needed."
                    disabled={!profileComplete}
                    disabledNote="Complete your profile to 100% to unlock this."
                    onClick={chooseProfile}
                  />
                  <RouteCard
                    icon={FileSearch}
                    title="From an analysis"
                    description="Rebuild your CV tailored to a role you already ran a job-match analysis against."
                    disabled={jobMatchAnalyses.length === 0}
                    disabledNote="Run a job-match analysis first."
                    onClick={chooseAnalysis}
                  />
                </div>
              </motion.div>
            )}

            {step === 'pick_analysis' && (
              <motion.div key="pick_analysis" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                {loadingAnalysis ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                    <Loader2 className="h-6 w-6 animate-spin mb-3" />
                    <p className="text-sm">Loading analysis details…</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {jobMatchAnalyses.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => selectAnalysis(a.id)}
                        className={cn(
                          'w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-all',
                          selectedAnalysisId === a.id
                            ? 'border-accent-purple bg-purple-50/40'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        )}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-purple/10 text-accent-purple">
                          <FileSearch size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {describeAnalysis(a)}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {a.jobTitle && a.sourceFileName ? `${a.sourceFileName} · ` : ''}
                            Scored {a.overallScore}/100 ·{' '}
                            {new Date(a.createdAt).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {step === 'template' && (
              <motion.div key="template" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <TemplateSelectionStep selected={selectedTemplate} onSelect={setSelectedTemplate} />
              </motion.div>
            )}

            {step === 'ats_opt_in' && (
              <motion.div key="ats_opt_in" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <AtsOptimizationStep includeAtsOptimization={includeAts} onSelect={setIncludeAts} />
              </motion.div>
            )}

            {step === 'reasoning_opt_in' && (
              <motion.div key="reasoning_opt_in" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <ProfileReasoningOptInStep
                  enabled={includeReasoning}
                  onSelect={setIncludeReasoning}
                  profileLabel={activeProfileLabel}
                  remaining={reasoningRemaining}
                />
              </motion.div>
            )}

            {step === 'profile_bridge' && (
              <motion.div key="profile_bridge" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <ProfileBridgeStep
                  loading={bridgeLoading}
                  suggestions={evidenceSuggestions}
                  requirements={evidenceRequirements}
                  approved={approvedProfileEvidence}
                  onToggle={toggleEvidence}
                  profileLabel={bridgeProfileLabel}
                  error={bridgeError}
                />
              </motion.div>
            )}

            {step === 'skills_bridge' && (
              <motion.div key="skills_bridge" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <SkillsBridgeStep missingSkills={missingSkills} contextData={hitlContext} onChange={setHitlContext} />
              </motion.div>
            )}

            {step === 'format' && (
              <motion.div key="format" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <FormatSelectionStep selected={selectedFormat} onSelect={setSelectedFormat} />
              </motion.div>
            )}

            {step === 'loading' && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <RewriteLoadingStep />
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <SuccessStep downloadUrl={downloadUrl} format={selectedFormat} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        {step !== 'loading' && step !== 'success' && step !== 'route' && (
          <div className="px-6 py-4 border-t border-border-subtle bg-bg-tertiary flex justify-between items-center">
            <Button
              variant="outline"
              onClick={() => backFrom(step, source, canReason, missingSkills.length > 0, setStep)}
            >
              Back
            </Button>

            {step === 'pick_analysis' && <div />}
            {step === 'template' && <Button onClick={nextFromTemplate}>Next Step</Button>}
            {step === 'ats_opt_in' && <Button onClick={nextFromAts}>Next Step</Button>}
            {step === 'reasoning_opt_in' && (
              <Button onClick={nextFromReasoningOptIn}>
                {includeReasoning ? 'Compare my profile' : 'Skip comparison'}
              </Button>
            )}
            {step === 'profile_bridge' && (
              <div className="flex gap-3">
                {evidenceSuggestions.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setApprovedProfileEvidence([]);
                      afterBridge();
                    }}
                  >
                    Skip all
                  </Button>
                )}
                <Button onClick={afterBridge} disabled={bridgeLoading}>
                  {evidenceSuggestions.length > 0 && approvedProfileEvidence.length > 0
                    ? `Use ${approvedProfileEvidence.length} item${approvedProfileEvidence.length === 1 ? '' : 's'}`
                    : 'Next Step'}
                </Button>
              </div>
            )}

            {step === 'skills_bridge' && (
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('format')}>Skip</Button>
                <Button onClick={() => setStep('format')}>Next Step</Button>
              </div>
            )}
            {step === 'format' && (
              <Button onClick={handleSubmit} className="bg-gradient-to-r from-accent-purple to-blue-600">
                Generate CV
              </Button>
            )}
          </div>
        )}

        {step === 'success' && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
            <Button variant="outline" onClick={reset}>Close</Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/**
 * Step-aware "Back" target, kept out of the render body for readability.
 *
 * `canReason` matters because the reasoning steps are conditional: going back
 * from the skills bridge must land on the reasoning question when it was asked,
 * and on the ATS step when it was skipped, or Back would walk the user into a
 * step the forward path never showed them.
 */
function backFrom(
  step: Step,
  source: Source | null,
  canReason: boolean,
  hasSkillsBridge: boolean,
  setStep: (s: Step) => void
) {
  const beforeSkillsBridge: Step = canReason ? 'reasoning_opt_in' : 'ats_opt_in';
  const beforeFormat: Step = hasSkillsBridge ? 'skills_bridge' : beforeSkillsBridge;

  if (step === 'pick_analysis') return setStep('route');
  if (step === 'template') return setStep(source === 'analysis' ? 'pick_analysis' : 'route');
  if (step === 'ats_opt_in') return setStep('template');
  if (step === 'reasoning_opt_in') return setStep('ats_opt_in');
  if (step === 'profile_bridge') return setStep('reasoning_opt_in');
  if (step === 'skills_bridge') return setStep(beforeSkillsBridge);
  if (step === 'format') return setStep(source === 'profile' ? 'template' : beforeFormat);
  return setStep('route');
}

interface RouteCardProps {
  icon: typeof UserRound;
  title: string;
  description: string;
  disabled?: boolean;
  disabledNote?: string;
  onClick: () => void;
}

function RouteCard({ icon: Icon, title, description, disabled, disabledNote, onClick }: RouteCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative flex flex-col items-start rounded-2xl border-2 p-5 text-left transition-all',
        disabled
          ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-70'
          : 'border-slate-200 hover:border-accent-purple hover:bg-purple-50/40'
      )}
    >
      <span
        className={cn(
          'mb-4 flex h-12 w-12 items-center justify-center rounded-xl',
          disabled ? 'bg-slate-200 text-slate-400' : 'bg-accent-purple/10 text-accent-purple'
        )}
      >
        <Icon size={22} />
      </span>
      <h4 className="font-bold text-slate-800 mb-1">{title}</h4>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
      {disabled && disabledNote && (
        <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-600">
          <Lock size={12} /> {disabledNote}
        </span>
      )}
    </button>
  );
}
