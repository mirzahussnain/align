'use client';

import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserRound, FileSearch, Lock, ChevronRight, Loader2 } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import { cn } from '@/shared/utils/cn';
import { approveProfileEvidenceSnapshot } from '@/features/cv-rewrite/actions/profile-evidence-approval-actions';
import type { AnalysisRow } from '@/features/dashboard/components/DashboardShell';
import type {
  ApprovedProfileEvidence,
  ProfileEvidenceRequirement,
  ProfileEvidenceSuggestion,
} from '@/shared/types/profile-reasoning';
import { requirementEvidencePairKey } from '@/shared/types/profile-reasoning';
import { describeAnalysis } from '@/shared/utils/job-title';
import { useEntitlements } from '@/shared/components/entitlements/EntitlementProvider';

// Reuse the existing rewrite wizard steps so both entry points share one UI.
import TemplateSelectionStep from './steps/TemplateSelectionStep';
import AtsOptimizationStep from './steps/AtsOptimizationStep';
import SkillsBridgeStep from './steps/SkillsBridgeStep';
import ProfileReasoningOptInStep from './steps/ProfileReasoningOptInStep';
import ProfileBridgeStep from './steps/ProfileBridgeStep';
import RequirementEvidenceCapture from './RequirementEvidenceCapture';
import FormatSelectionStep from './steps/FormatSelectionStep';
import RewriteLoadingStep from './steps/RewriteLoadingStep';
import SuccessStep from './steps/SuccessStep';
import { triggerBrowserDownload } from '../utils/download';
import { DEFAULT_TEMPLATE_ID, type TemplateId } from '@/shared/constants/templates';
import type { ExportFormat } from './RewriteWizardModal';
import {
  interpretOperationalError,
  type OperationalClientAction,
} from '@/shared/entitlements/operational-errors';

/** Message for any non-upgrade operational action; upgrade opens the modal instead. */
function operationalMessage(action: OperationalClientAction, fallback: string): string {
  return 'message' in action ? action.message : fallback;
}

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
  const { decisionFor, openUpgrade, refresh: refreshEntitlements } = useEntitlements();
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
  const [captureRequirement, setCaptureRequirement] = useState<ProfileEvidenceRequirement | null>(null);
  const [applicationEvidenceContextIds, setApplicationEvidenceContextIds] = useState<string[]>([]);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // When a committed generation's document went missing, the server offers a
  // linked, non-double-charged repair. We hold the original operation id so the
  // user can trigger the repair explicitly from the error state.
  const [repairOf, setRepairOf] = useState<string | null>(null);
  // Keep the operation id stable across network retries of the SAME logical
  // generation, but mint a fresh one whenever the material request identity
  // changes — a different source, analysis, template, approved evidence set or
  // ATS toggle — so a changed request never collides with an earlier committed
  // one on the server's fingerprint. Resolved at fetch time (not in an effect) so
  // the CV generation wizard's submission always carries a correctly stable id.
  const operationIdRef = useRef<string>(crypto.randomUUID());
  const submissionKeyRef = useRef<string | null>(null);
  const currentOperationId = () => {
    const key = JSON.stringify({
      source,
      selectedAnalysisId,
      activeProfileId,
      selectedTemplate,
      includeAts,
      approvals: [...approvedProfileEvidence]
        .map((approval) => approval.approvalId ?? requirementEvidencePairKey(approval.requirementId, approval.evidenceRef))
        .sort(),
      appContext: [...applicationEvidenceContextIds].sort(),
    });
    if (submissionKeyRef.current !== key) {
      submissionKeyRef.current = key;
      operationIdRef.current = crypto.randomUUID();
    }
    return operationIdRef.current;
  };

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
    setCaptureRequirement(null);
    setApplicationEvidenceContextIds([]);
    setIncludeAts(true);
    setIncludeReasoning(true);
    setDownloadUrl(null);
    setError(null);
    submissionKeyRef.current = null;
    operationIdRef.current = crypto.randomUUID();
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
    const decision = decisionFor('cv_regeneration');
    if (!decision.allowed) {
      openUpgrade({ capability: 'cv_regeneration', decision, source: 'generation' });
      return;
    }
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
      if (!res.ok) {
        const action = interpretOperationalError(res.status, json);
        if (action.type === 'upgrade') {
          openUpgrade({ capability: 'profile_reconciliation', decision: decisionFor('profile_reconciliation'), source: 'generation' });
        }
        throw new Error(operationalMessage(action, 'Failed to compare your profile.'));
      }

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

  async function toggleEvidence(suggestion: ProfileEvidenceSuggestion) {
    const key = requirementEvidencePairKey(suggestion.requirementId, suggestion.evidenceRef);
    const existing = approvedProfileEvidence.some((approval) => requirementEvidencePairKey(approval.requirementId, approval.evidenceRef) === key);
    if (existing) { setApprovedProfileEvidence((items) => items.filter((approval) => requirementEvidencePairKey(approval.requirementId, approval.evidenceRef) !== key)); return; }
    try {
      if (!selectedAnalysisId || !activeProfileId) throw new Error('Choose an analysis and profile before approving evidence.');
      const saved = await approveProfileEvidenceSnapshot({ analysisId: selectedAnalysisId, profileId: activeProfileId, requirementId: suggestion.requirementId, evidenceRef: suggestion.evidenceRef, rationale: suggestion.rationale });
      if (!saved.ok) {
        // Per-application approval cap reached — open the central upgrade surface;
        // approval state is left untouched.
        openUpgrade({ capability: 'approve_evidence_for_application', decision: saved.decision, source: 'evidence' });
        return;
      }
      setApprovedProfileEvidence((items) => [...items, { requirementId: suggestion.requirementId, evidenceRef: suggestion.evidenceRef, approvalId: saved.id }]);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not approve profile evidence.'); }
  }

  function handleSubmit() {
    return submitGeneration();
  }

  /**
   * Submit a CV generation. Pass `repairOf` to run a linked, non-double-charged
   * repair of a committed generation whose document went missing — it carries a
   * fresh operation id plus the original operation id in `x-repair-of`.
   */
  async function submitGeneration(repairOf?: string) {
    setStep('loading');
    setError(null);
    if (!repairOf) setRepairOf(null);
    try {
      const operationId = repairOf ? crypto.randomUUID() : currentOperationId();
      const regenerateHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-operation-id': operationId,
        ...(repairOf ? { 'x-repair-of': repairOf } : {}),
      };
      const response =
        source === 'profile'
          ? await fetch('/api/cv/from-profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-operation-id': operationId },
              body: JSON.stringify({
                templateId: selectedTemplate,
                profileId: activeProfileId,
                applicationEvidenceContextIds,
              }),
            })
          : await fetch('/api/cv/regenerate', {
              method: 'POST',
              headers: regenerateHeaders,
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
                applicationEvidenceContextIds,
              }),
            });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        // One shared interpretation for every generation failure mode.
        const action = interpretOperationalError(response.status, err);
        if (action.type === 'upgrade') {
          const capability = (action.capability as 'cv_regeneration') ?? 'cv_regeneration';
          openUpgrade({ capability, decision: decisionFor(capability), source: 'generation' });
        } else if (action.type === 'repair' && source === 'analysis') {
          // Offer an explicit, non-double-charged repair from the error state.
          setRepairOf(action.operationId);
        }
        throw new Error(operationalMessage(action, 'Failed to generate CV'));
      }

      const blob = await response.blob();
      const fileName = source === 'profile' ? 'Profile_CV.docx' : 'Tailored_CV.docx';
      const url = triggerBrowserDownload(blob, fileName);
      setDownloadUrl(url);
      setRepairOf(null);

      setStep('success');
      await refreshEntitlements();
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
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center justify-between gap-3">
              <span>{error}</span>
              {repairOf && (
                <button
                  type="button"
                  onClick={() => submitGeneration(repairOf)}
                  className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Recover my CV
                </button>
              )}
            </div>
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
                            ? 'border-accent-cyan bg-sky-50/40'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        )}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-cyan/10 text-accent-cyan">
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
                  onCapture={(requirement) => setCaptureRequirement(requirement)}
                />
                {captureRequirement && selectedAnalysisId && activeProfileId && (
                  <RequirementEvidenceCapture
                    analysisId={selectedAnalysisId}
                    profileId={activeProfileId}
                    requirement={captureRequirement}
                    onClose={() => setCaptureRequirement(null)}
                    onApproveRef={(evidenceRef) => setApprovedProfileEvidence((current) => current.some((item) => requirementEvidencePairKey(item.requirementId, item.evidenceRef) === requirementEvidencePairKey(captureRequirement.id, evidenceRef)) ? current : [...current, { requirementId: captureRequirement.id, evidenceRef }])}
                    onApplicationContext={(id) => setApplicationEvidenceContextIds((current) => current.includes(id) ? current : [...current, id])}
                  />
                )}
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
              <Button onClick={handleSubmit} className="bg-slate-900 hover:bg-slate-800">
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
          : 'border-slate-200 hover:border-accent-cyan hover:bg-sky-50/40'
      )}
    >
      <span
        className={cn(
          'mb-4 flex h-12 w-12 items-center justify-center rounded-xl',
          disabled ? 'bg-slate-200 text-slate-400' : 'bg-accent-cyan/10 text-accent-cyan'
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
