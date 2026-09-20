'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UPLOAD_POLICY } from '@/shared/policies';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, X, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import AnalysisProgress from './AnalysisProgress';
import TargetSelectionStep from './TargetSelectionStep';
import { formatFileSize } from '@/shared/utils/file';
import type { DetectResponse, TargetSelectionPayload } from '@/shared/types/target-detection';
import {
  ENTITLEMENT_REQUIRED_EVENT,
  ENTITLEMENTS_REFRESH_EVENT,
} from '@/shared/entitlements/registry';
import {
  interpretOperationalError,
  type OperationalClientAction,
} from '@/shared/entitlements/operational-errors';

/** Message for any non-upgrade operational action; upgrade is handled by the modal. */
function operationalMessage(action: OperationalClientAction, fallback: string): string {
  return 'message' in action ? action.message : fallback;
}

interface CVUploaderProps {
  mode?: 'ats' | 'job_match';
  onAnalysisComplete: (result: unknown) => void;
  /**
   * Career track to file the result under. Omitted on the public analyser,
   * where there is no profile switcher — the server then falls back to the
   * user's default profile.
   */
  profileId?: string;
  jobMatchRequestId?: string;
  matchRequest?: { description: string; descriptionAvailability: string } | null;
}

export default function CVUploader({ mode = 'ats', onAnalysisComplete, profileId, jobMatchRequestId, matchRequest }: CVUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The ATS post-upload target step. `view` is 'form' until detection runs.
  const [view, setView] = useState<'form' | 'target'>('form');
  const [detection, setDetection] = useState<DetectResponse | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  // Errors raised by the analyze call while on the target step, shown in-place.
  const [targetError, setTargetError] = useState<string | null>(null);

  // Only a provider-supplied FULL description can prefill canonical job matching.
  useEffect(() => {
    if (mode !== 'job_match' || jobDescription) return;
    let active = true;
    let prefill = '';
    try {
      if (matchRequest?.description) {
        prefill = matchRequest.description;
      } else {
        const raw = window.sessionStorage.getItem('align:job-match-prefill');
        if (raw) {
          const job = JSON.parse(raw) as { description?: string; descriptionAvailability?: string };
          if (job.descriptionAvailability === 'FULL' && job.description) prefill = job.description;
        }
      }
    } catch { /* stale browser data is non-authoritative */ }
    const timer = window.setTimeout(() => {
      if (active && prefill) setJobDescription(prefill);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [mode, jobDescription, matchRequest?.description]);

  // A stable operation id for the CURRENT logical submission, so a network retry
  // of the same analysis reuses it (the server treats the retry idempotently) and
  // only a materially different request — a new file, JD, mode or target — mints a
  // fresh one. Generating a new UUID inside every fetch, as the old code did, made
  // retries look like brand-new operations and defeated idempotent reservation.
  const operationIdRef = useRef<string>(crypto.randomUUID());
  const submissionKeyRef = useRef<string | null>(null);
  const operationIdFor = (target?: TargetSelectionPayload): string => {
    const key = JSON.stringify({
      name: file?.name ?? null,
      size: file?.size ?? null,
      lastModified: file?.lastModified ?? null,
      jd: mode === 'job_match' ? jobDescription : '',
      mode,
      target: target ?? null,
    });
    if (submissionKeyRef.current !== key) {
      submissionKeyRef.current = key;
      operationIdRef.current = crypto.randomUUID();
    }
    return operationIdRef.current;
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    if (acceptedFiles.length > 0) {
      const f = acceptedFiles[0];
      if (f.size > UPLOAD_POLICY.cv.maxDirectMultipartBytes) {
        setError('File too large. Maximum size is 4MB.');
        return;
      }
      setFile(f);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    multiple: false,
  });

  /**
   * POST the CV to /api/analyze. `targetSelection` carries the ATS post-upload
   * choice; job match omits it (its target is the JD). The server re-resolves
   * the selection authoritatively — the payload never dictates the occupation.
   */
  const runAnalyze = async (target?: TargetSelectionPayload) => {
    if (!file) return;

    setIsAnalyzing(true);
    setError(null);
    setTargetError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', mode);
      if (profileId) formData.append('profileId', profileId);
      if (jobMatchRequestId) formData.append('jobMatchRequestId', jobMatchRequestId);
      if (mode === 'job_match') {
        if (!jobDescription.trim()) {
          throw new Error('Please provide a Job Description to match against.');
        }
        formData.append('jobDescription', jobDescription);
      }
      if (target) {
        formData.append('targetSelection', target.targetSelection);
        if (target.savedProfileId) formData.append('savedProfileId', target.savedProfileId);
        if (target.targetRole) formData.append('targetRole', target.targetRole);
      }

      const response = await fetch(mode === 'job_match' ? '/api/job-matches' : '/api/ats-analyses', {
        method: 'POST',
        headers: { 'x-operation-id': operationIdFor(target) },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        // Single shared interpretation for every operational failure, so the
        // "you were not charged" reassurance and in-progress/retry wording stay
        // consistent with the other metered flows.
        const action = interpretOperationalError(response.status, data);
        if (action.type === 'upgrade') {
          window.dispatchEvent(new CustomEvent(ENTITLEMENT_REQUIRED_EVENT, {
            detail: { capability: action.capability, source: 'analysis' },
          }));
        }
        throw new Error(operationalMessage(action, 'Analysis failed. Please try again.'));
      }

      const result = await response.json();
      window.dispatchEvent(new Event(ENTITLEMENTS_REFRESH_EVENT));
      onAnalysisComplete(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      // Surface the error where the user currently is: the target step or form.
      if (view === 'target') setTargetError(message);
      else setError(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  /**
   * ATS: run the deterministic, cost-free detection and move to the target step.
   * No AI is involved and no quota is consumed here (see /api/analyze/detect).
   */
  const runDetect = async () => {
    if (!file) return;

    setIsDetecting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (profileId) formData.append('profileId', profileId);
      if (jobMatchRequestId) formData.append('jobMatchRequestId', jobMatchRequestId);

      const response = await fetch('/api/analyze/detect', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Could not read this CV. Please try another file.');
      }

      const data: DetectResponse = await response.json();
      setDetection(data);
      setTargetError(null);
      setView('target');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsDetecting(false);
    }
  };

  const handlePrimary = () => (mode === 'ats' ? runDetect() : runAnalyze());

  const removeFile = () => {
    setFile(null);
    setError(null);
    setTargetError(null);
    setDetection(null);
    setView('form');
  };


  return (
    <div className="w-full mx-auto max-w-2xl">
      <AnimatePresence mode="wait">
        {isAnalyzing ? (
          <motion.div
            key="analyzing-progress"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            <AnalysisProgress isAnalyzing={isAnalyzing} />
          </motion.div>
        ) : view === 'target' && detection ? (
          <motion.div
            key="target-view"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <TargetSelectionStep
              detection={detection}
              isSubmitting={isAnalyzing}
              error={targetError}
              onBack={() => {
                setTargetError(null);
                setView('form');
              }}
              onSubmit={(payload) => runAnalyze(payload)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="input-view"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-6 transition-all w-full"
          >
            {/* Left Column: Job Description (Only visible in job_match mode) */}
            {mode === 'job_match' && (
              <div className="flex flex-col">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col min-h-[160px]">
                  <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                    <FileText size={16} className="text-accent-cyan" />
                    Target Job Description
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">Paste the full job description here to tailor your analysis.</p>
                  <textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste the full job advert — e.g. 'We are looking for a Warehouse Operative with an FLT licence…' or 'Senior Frontend Engineer with React experience…'"
                    className="flex-1 w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-accent-cyan/50 focus:ring-2 focus:ring-accent-cyan/20 resize-none"
                  />
                </div>
              </div>
            )}

            {/* Right Column: File Dropzone or Preview */}
            <div className="flex flex-col justify-center">
              {!file ? (
                <div
                  {...getRootProps()}
                  className={cn(
                    'w-full min-h-[200px] flex flex-col items-center justify-center relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 group bg-white',
                    isDragActive
                      ? 'border-accent-cyan bg-sky-50/50 scale-[1.02]'
                      : 'border-slate-300 hover:border-accent-cyan/50 hover:bg-slate-50'
                  )}
                >
                  <input {...getInputProps()} />

                  <div className="flex flex-col items-center gap-4">
                    <div className={cn(
                      'w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300',
                      isDragActive
                        ? 'bg-accent-cyan/20 scale-110'
                        : 'bg-slate-100 group-hover:bg-accent-cyan/10'
                    )}>
                      <Upload
                        size={28}
                        className={cn(
                          'transition-colors duration-300',
                          isDragActive ? 'text-accent-cyan' : 'text-slate-400 group-hover:text-accent-cyan'
                        )}
                      />
                    </div>

                    <div>
                      <p className="text-lg font-semibold text-slate-800 mb-1">
                        {isDragActive ? 'Drop your CV here' : 'Upload your CV'}
                      </p>
                      <p className="text-sm text-slate-500">
                        Drag & drop or click to browse • PDF format • Max 4MB
                      </p>
                    </div>
                  </div>

                  {isDragActive && (
                    <div className="absolute inset-0 rounded-2xl border-2 border-accent-cyan animate-pulse pointer-events-none" />
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-center min-h-[200px]">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-14 h-14 rounded-xl bg-accent-cyan/10 flex items-center justify-center flex-shrink-0">
                      <FileText size={26} className="text-accent-cyan" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-slate-800 truncate">{file.name}</p>
                      <p className="text-sm text-slate-500">{formatFileSize(file.size)} • PDF</p>
                    </div>
                    <button
                      onClick={removeFile}
                      className="p-2.5 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors"
                      disabled={isAnalyzing}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {error && (
                    <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-medium">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handlePrimary}
                    disabled={
                      isAnalyzing ||
                      isDetecting ||
                      (mode === 'job_match' && !jobDescription.trim())
                    }
                    className={cn(
                      'w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-300',
                      (isAnalyzing || isDetecting || (mode === 'job_match' && !jobDescription.trim()))
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm hover:scale-[1.02] active:scale-[0.98]'
                    )}
                  >
                    {isDetecting ? (
                      <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Sparkles size={20} aria-hidden="true" />
                    )}
                    {mode === 'job_match'
                      ? 'Run Job Match Analysis'
                      : isDetecting
                        ? 'Reading your CV…'
                        : 'Continue'}
                  </button>

                  <p className="text-xs text-slate-500 text-center mt-4">
                    {mode === 'job_match' 
                      ? 'Your CV will be explicitly scored against the requirements in the provided Job Description.'
                      : "Your CV is scored against Align's UK CV readiness framework for your occupation: formatting, structure, evidence coverage, credentials, and compliance."}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
