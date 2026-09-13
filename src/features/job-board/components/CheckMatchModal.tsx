"use client";

import { useEffect, useState, useRef, type ChangeEvent } from "react";
import { ANALYSIS_LIMITS } from "@/shared/config/analysis-domain";
import {
  X,
  ExternalLink,
  Sparkles,
  Loader2,
  FileText,
  Upload,
  CheckCircle2,
  ChevronRight,
  ClipboardPaste,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { readJson } from "@/features/job-board/lib/job-board";
import type { CVAnalysisResult } from "@/shared/types/cv";
import type { JobMatchReportView } from "@/shared/types/job-match-report";
import {
  ENTITLEMENT_REQUIRED_EVENT,
  ENTITLEMENTS_REFRESH_EVENT,
} from "@/shared/entitlements/registry";
import { interpretOperationalError } from "@/shared/entitlements/operational-errors";

/**
 * Shortest text accepted as a complete advert.
 *
 * Set at the low end deliberately: this is a guard against a stray line or an
 * accidental empty paste, not a judgement about how a real advert should read.
 * The server reassesses whatever is saved, and a genuinely short paste is
 * classified PARTIAL there rather than being rejected here.
 */
const MIN_PASTED_CHARS = 400;

/** Matches the analyse route's own upload limit, so nothing is rejected late. */
const MAX_UPLOAD_BYTES = ANALYSIS_LIMITS.maxDirectMultipartCvBytes;

/** One of the user's stored source CVs, as listed by /api/stored-cvs. */
interface StoredCvOption {
  id: string;
  originalFilename: string;
  sizeBytes: number;
  createdAt: string;
  objectAvailable: boolean;
}

/** What the modal shows once the analysis has actually run. */
interface CompletedAnalysis {
  /** Absent only if the result could not be filed; the CTA is hidden, not dead. */
  analysisId?: string;
  score: number;
  report?: JobMatchReportView;
}

export interface CheckMatchModalProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle: string;
  companyName: string;
  descriptionCompleteness?: "FULL" | "PARTIAL" | "EXTERNAL_ONLY" | string;
  providerDescription?: string;
  availableCareerTracks: Array<{ id: string; label: string }>;
  hostedUrl?: string;
  applicationUrl?: string;
  /** Lets the details panel refetch, so a saved paste updates badges and tabs. */
  onDescriptionSaved?: () => void;
}

export function CheckMatchModal({
  open,
  onClose,
  jobId,
  jobTitle,
  companyName,
  descriptionCompleteness = "FULL",
  providerDescription = "",
  availableCareerTracks,
  hostedUrl,
  applicationUrl,
  onDescriptionSaved,
}: CheckMatchModalProps) {
  const [selectedTrack, setSelectedTrack] = useState<string>(
    availableCareerTracks[0]?.id ?? "",
  );
  const [cvOption, setCvOption] = useState<"PROFILE" | "UPLOAD">("PROFILE");
  /**
   * The CV that will actually be analysed. Both of these are SENT — the previous
   * version collected a filename and a radio choice, sent neither, and left the
   * user to upload the same CV again on the analyse page.
   */
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [storedCvs, setStoredCvs] = useState<StoredCvOption[] | null>(null);
  const [selectedStoredCvId, setSelectedStoredCvId] = useState<string>("");
  // Deliberately EMPTY, not seeded with the provider's partial text. Seeding it
  // meant a user could press Continue on the same teaser and have it counted as
  // a completed paste.
  const [pastedDescription, setPastedDescription] = useState("");
  const [savedDescription, setSavedDescription] = useState(false);
  const [partialAccepted, setPartialAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"TRACK" | "CV" | "DESCRIPTION" | "REVIEW">(
    "TRACK",
  );
  /**
   * The wizard, the run and the outcome are three states of ONE modal. The
   * analysis used to happen on another page, so a user who had just answered
   * four questions here was handed a fresh upload form to answer them again.
   */
  const [phase, setPhase] = useState<"FORM" | "RUNNING" | "DONE">("FORM");
  const [completed, setCompleted] = useState<CompletedAnalysis | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * A stable operation id for the CURRENT logical submission, mirroring the
   * uploader's rule: a network retry of the same analysis reuses it, so the
   * server treats the retry idempotently instead of reserving — and charging —
   * a second unit. Only a materially different request mints a fresh one.
   *
   * Declared with the other hooks, ABOVE the `!open` early return: every hook in
   * this component must run on every render or React sees a changing hook count.
   */
  const submissionKeyRef = useRef<string | null>(null);
  const operationIdRef = useRef<string>("");
  const running = phase === "RUNNING";

  // The user's stored CVs, so a repeat match needs no re-upload. Failure is not
  // fatal: the upload option still works, and the list simply reports empty.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await readJson<{ storedCvs?: StoredCvOption[] }>(
          "/api/stored-cvs",
        );
        if (!active) return;
        const usable = (data.storedCvs ?? []).filter((cv) => cv.objectAvailable);
        setStoredCvs(usable);
        setSelectedStoredCvId((current) => current || (usable[0]?.id ?? ""));
      } catch {
        if (active) setStoredCvs([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const isFullDescription = descriptionCompleteness === "FULL";
  const sourceUrl = applicationUrl || hostedUrl;
  const trimmedPaste = pastedDescription.trim();
  /**
   * Whether the paste is worth saving at all.
   *
   * Two conditions. It must be long enough to be an advert rather than a stray
   * line, and it must not simply be the provider's teaser pasted back — saving
   * that would flip the vacancy to USER_PASTED and silence the partial warning
   * without adding a single word of new information.
   */
  const pasteIsUsable =
    trimmedPaste.length >= MIN_PASTED_CHARS &&
    trimmedPaste !== providerDescription.trim();
  /**
   * Whether a CV has actually been chosen. The analysis reads a real document,
   * so the wizard cannot advance past the CV step on a radio button alone.
   */
  const cvSourceReady =
    cvOption === "UPLOAD" ? uploadFile !== null : selectedStoredCvId !== "";

  // No reset effect. The caller MOUNTS this component only while it is open, so
  // every opening starts from fresh `useState` initialisers. The effect that
  // used to reset ten pieces of state after render was both a cascading-render
  // hazard and a correctness one: for one render after opening, the wizard still
  // held the previous vacancy's step, track and pasted text.
  if (!open) return null;

  /** Mark a private match-time override ready; it is not written to the shared vacancy. */
  const saveAndReassess = async () => {
    if (!pasteIsUsable) return;
    setSaving(true);
    setError(null);
    try {
      setSavedDescription(true);
      setPartialAccepted(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save this description.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("That file is too large. The maximum size is 4MB.");
      return;
    }
    setError(null);
    setUploadFile(file);
  };

  const operationId = (): string => {
    const key = JSON.stringify({
      jobId,
      track: selectedTrack,
      source:
        cvOption === "UPLOAD"
          ? [uploadFile?.name, uploadFile?.size, uploadFile?.lastModified]
          : ["stored", selectedStoredCvId],
    });
    if (submissionKeyRef.current !== key || !operationIdRef.current) {
      submissionKeyRef.current = key;
      operationIdRef.current = crypto.randomUUID();
    }
    return operationIdRef.current;
  };

  /**
   * Prepare the match request and RUN the analysis, here, in this modal.
   *
   * It used to stop after preparation and navigate to /analyze, where the user
   * met an empty upload form: the career track, CV choice and description they
   * had just supplied bought them nothing. The preparation call is unchanged and
   * still owns the description and the reduced-confidence guard; the analysis
   * simply follows it instead of being handed to another screen.
   */
  const handleStartAnalysis = async () => {
    if (!cvSourceReady) return;
    setPhase("RUNNING");
    setError(null);
    try {
      const prepared = await readJson<{ matchRequestId: string }>(
        `/api/jobs/${encodeURIComponent(jobId)}/match-preparation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId: selectedTrack || undefined,
            descriptionOverride: savedDescription ? trimmedPaste : undefined,
            // The user's ACTUAL answer. This used to be `!isFullDescription`,
            // which auto-accepted the reduced-confidence warning on their
            // behalf and defeated the server-side guard entirely. It is now
            // false whenever a full description was saved, and otherwise
            // reflects the acknowledgement they deliberately ticked.
            partialDescriptionAccepted: savedDescription
              ? false
              : partialAccepted,
          }),
        },
      );

      // The match request owns the description and the profile server-side; the
      // form only has to say WHICH CV to read.
      const form = new FormData();
      form.append("mode", "job_match");
      form.append("jobMatchRequestId", prepared.matchRequestId);
      if (selectedTrack) form.append("profileId", selectedTrack);
      if (cvOption === "UPLOAD" && uploadFile) form.append("file", uploadFile);
      else form.append("storedCvId", selectedStoredCvId);

      const response = await fetch("/api/job-matches", {
        method: "POST",
        headers: { "x-operation-id": operationId() },
        body: form,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        // The same interpretation every other metered flow uses, so the "you
        // were not charged" reassurance reads identically here.
        const action = interpretOperationalError(response.status, body);
        if (action.type === "upgrade") {
          window.dispatchEvent(
            new CustomEvent(ENTITLEMENT_REQUIRED_EVENT, {
              // 'analysis' is the upgrade modal's own vocabulary for a metered
              // analysis block; the Job Board is where it happened, not a
              // different kind of block.
              detail: { capability: action.capability, source: "analysis" },
            }),
          );
        }
        throw new Error(
          "message" in action
            ? action.message
            : "Match analysis is not available on your plan.",
        );
      }

      const result = (await response.json()) as CVAnalysisResult;
      window.dispatchEvent(new Event(ENTITLEMENTS_REFRESH_EVENT));
      setCompleted({
        analysisId: result.analysisId,
        // The score the server derived, never one recomputed here from the
        // plan-projected subset.
        score: result.jobMatchReport?.overview.score ?? result.overallScore,
        report: result.jobMatchReport,
      });
      setPhase("DONE");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to run this match analysis. Please try again.",
      );
      setPhase("FORM");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 transition-opacity animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="check-match-modal-title"
    >
      <div className="w-full max-w-lg sm:max-w-xl bg-white dark:bg-bg-secondary rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] border border-neutral-200/80 dark:border-border-subtle animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-border-subtle p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="check-match-modal-title"
                className="text-base font-bold text-neutral-900 dark:text-text-primary leading-tight"
              >
                Check Vacancy Match
              </h2>
              <p className="text-xs text-neutral-500 dark:text-text-secondary truncate max-w-xs sm:max-w-sm">
                {jobTitle} • {companyName}
              </p>
            </div>
          </div>
          {/*
            Closing mid-run would throw away a result the user has already been
            charged for, so the control is disabled while the analysis is in
            flight rather than quietly losing it.
          */}
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            aria-label="Close modal"
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-bg-tertiary dark:hover:text-text-primary transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {error && (
            <div className="rounded-xl border border-error/30 bg-error/10 p-3 text-xs text-error font-medium">
              {error}
            </div>
          )}

          {/*
            The analysis, running HERE. There is no navigation and no second
            form: the user's four answers are already everything the run needs.
          */}
          {phase === "RUNNING" && (
            <div
              className="flex flex-col items-center gap-3 py-10 text-center"
              role="status"
              aria-live="polite"
            >
              <Loader2
                className="h-8 w-8 animate-spin text-accent-cyan"
                aria-hidden
              />
              <p className="text-sm font-bold text-neutral-900 dark:text-text-primary">
                Analysing your CV against this vacancy…
              </p>
              <p className="max-w-xs text-xs leading-5 text-neutral-500 dark:text-text-tertiary">
                Reading the advert&apos;s requirements and checking each one
                against your CV. This usually takes under a minute — keep this
                window open.
              </p>
            </div>
          )}

          {phase === "DONE" && completed && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-5 text-center dark:border-emerald-800/40 dark:bg-emerald-950/30">
                <CheckCircle2
                  className="h-7 w-7 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                  Analysis complete
                </p>
                <p className="text-4xl font-black tabular-nums text-neutral-900 dark:text-text-primary">
                  {completed.score}
                  <span className="text-lg font-bold text-neutral-400">
                    /100
                  </span>
                </p>
                {completed.report && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    {completed.report.overview.verdict}
                  </p>
                )}
              </div>

              {completed.report && (
                <div className="space-y-3">
                  <p className="text-xs leading-5 text-neutral-600 dark:text-text-secondary">
                    {completed.report.overview.summary}
                  </p>

                  <p className="text-xs font-semibold text-neutral-700 dark:text-text-secondary">
                    {completed.report.requirements.totals.mandatoryMet} of{" "}
                    {completed.report.requirements.totals.mandatory} essential
                    requirements met
                    {completed.report.requirements.totals.desirable > 0
                      ? ` · ${completed.report.requirements.totals.desirableMet} of ${completed.report.requirements.totals.desirable} desirable`
                      : ""}
                  </p>

                  {/*
                    Gaps come from the server-derived view model, which already
                    limits them to what this plan may see — nothing withheld is
                    reconstructed or teased here.
                  */}
                  {(completed.report.mandatoryGaps.missing.length > 0 ||
                    completed.report.mandatoryGaps.partial.length > 0) && (
                    <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Biggest gaps
                      </p>
                      <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-900 dark:text-amber-200">
                        {[
                          ...completed.report.mandatoryGaps.missing.map(
                            (text) => ({ text, partial: false }),
                          ),
                          ...completed.report.mandatoryGaps.partial.map(
                            (text) => ({ text, partial: true }),
                          ),
                        ]
                          .slice(0, 3)
                          .map((gap) => (
                            <li key={gap.text} className="flex gap-1.5">
                              <span aria-hidden>•</span>
                              <span>
                                {gap.text}
                                <span className="font-semibold">
                                  {gap.partial
                                    ? " — partly evidenced"
                                    : " — not evidenced"}
                                </span>
                              </span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-between gap-3 border-t border-neutral-100 dark:border-border-subtle">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-border-subtle text-xs font-semibold text-neutral-600 dark:text-text-secondary hover:bg-neutral-50 dark:hover:bg-bg-tertiary transition"
                >
                  Close
                </button>
                {/*
                  Only rendered when there is a report to open. A result that
                  could not be filed gets an honest note instead of a CTA that
                  leads nowhere.
                */}
                {completed.analysisId ? (
                  <a
                    href={`/dashboard?tab=job_matches&analysis=${encodeURIComponent(
                      completed.analysisId,
                    )}`}
                    className="px-6 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-sm hover:bg-slate-800 transition flex items-center justify-center gap-2"
                  >
                    View Full Analysis
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                ) : (
                  <p className="text-xs text-neutral-500 dark:text-text-tertiary">
                    This result could not be saved to your history, so the full
                    report cannot be opened.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 1: Select Career Track */}
          {phase === "FORM" && step === "TRACK" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-text-primary">
                  1. Select Target Career Track
                </h3>
                <p className="text-xs text-neutral-500 dark:text-text-secondary mt-0.5">
                  Choose a Career Track to align your skills and target role.
                </p>
              </div>

              {availableCareerTracks.length > 0 ? (
                <div className="space-y-2">
                  {availableCareerTracks.map((track) => (
                    <label
                      key={track.id}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                        selectedTrack === track.id
                          ? "border-accent-cyan bg-accent-cyan/5 dark:bg-accent-cyan/10 text-accent-cyan font-semibold"
                          : "border-neutral-200 dark:border-border-subtle bg-white dark:bg-bg-tertiary text-neutral-700 dark:text-text-secondary hover:border-neutral-300"
                      }`}
                    >
                      <span className="text-sm">{track.label}</span>
                      <input
                        type="radio"
                        name="careerTrack"
                        value={track.id}
                        checked={selectedTrack === track.id}
                        onChange={() => setSelectedTrack(track.id)}
                        className="h-4 w-4 text-accent-cyan focus:ring-accent-cyan"
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-neutral-50 dark:bg-bg-tertiary border border-neutral-200/80 dark:border-border-subtle text-xs text-neutral-600 dark:text-text-secondary">
                  No predefined Career Tracks found. You can proceed directly to CV options.
                </div>
              )}

              <div className="pt-3 flex items-center justify-between gap-3 border-t border-neutral-100 dark:border-border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTrack("");
                    setStep("CV");
                  }}
                  className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-border-subtle text-xs font-semibold text-neutral-600 dark:text-text-secondary hover:bg-neutral-50 dark:hover:bg-bg-tertiary transition"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => setStep("CV")}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 shadow-sm transition flex items-center gap-1.5"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Select CV Source */}
          {phase === "FORM" && step === "CV" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-text-primary">
                  2. Choose the CV to analyse
                </h3>
                <p className="text-xs text-neutral-500 dark:text-text-secondary mt-0.5">
                  Pick one of your stored CVs, or upload a new one for this match.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className={`flex flex-col p-4 rounded-xl border cursor-pointer transition ${
                    cvOption === "PROFILE"
                      ? "border-accent-cyan bg-accent-cyan/5 dark:bg-accent-cyan/10 text-accent-cyan font-semibold"
                      : "border-neutral-200 dark:border-border-subtle bg-white dark:bg-bg-tertiary text-neutral-700 dark:text-text-secondary hover:border-neutral-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <FileText className="h-5 w-5 text-accent-cyan" />
                    <input
                      type="radio"
                      name="cvOption"
                      value="PROFILE"
                      checked={cvOption === "PROFILE"}
                      onChange={() => setCvOption("PROFILE")}
                      className="h-4 w-4 text-accent-cyan focus:ring-accent-cyan"
                    />
                  </div>
                  <span className="text-sm font-bold">Stored CV</span>
                  <span className="text-xs font-normal text-neutral-500 dark:text-text-tertiary mt-1">
                    Analyse a CV you have already uploaded
                  </span>
                </label>

                <label
                  className={`flex flex-col p-4 rounded-xl border cursor-pointer transition ${
                    cvOption === "UPLOAD"
                      ? "border-accent-cyan bg-accent-cyan/5 dark:bg-accent-cyan/10 text-accent-cyan font-semibold"
                      : "border-neutral-200 dark:border-border-subtle bg-white dark:bg-bg-tertiary text-neutral-700 dark:text-text-secondary hover:border-neutral-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Upload className="h-5 w-5 text-accent-cyan" />
                    <input
                      type="radio"
                      name="cvOption"
                      value="UPLOAD"
                      checked={cvOption === "UPLOAD"}
                      onChange={() => setCvOption("UPLOAD")}
                      className="h-4 w-4 text-accent-cyan focus:ring-accent-cyan"
                    />
                  </div>
                  <span className="text-sm font-bold">Upload New CV</span>
                  <span className="text-xs font-normal text-neutral-500 dark:text-text-tertiary mt-1">
                    Upload a PDF for this match
                  </span>
                </label>
              </div>

              {cvOption === "PROFILE" &&
                (storedCvs === null ? (
                  <p className="flex items-center gap-2 p-4 rounded-xl bg-neutral-50 dark:bg-bg-tertiary border border-neutral-200/80 dark:border-border-subtle text-xs text-neutral-600 dark:text-text-secondary">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading your stored CVs…
                  </p>
                ) : storedCvs.length === 0 ? (
                  <div className="p-4 rounded-xl bg-neutral-50 dark:bg-bg-tertiary border border-neutral-200/80 dark:border-border-subtle text-xs text-neutral-600 dark:text-text-secondary">
                    You have no stored CVs yet. Choose{" "}
                    <span className="font-semibold">Upload New CV</span> to
                    analyse one for this vacancy.
                  </div>
                ) : (
                  <fieldset className="space-y-2">
                    <legend className="sr-only">Choose a stored CV</legend>
                    {storedCvs.map((cv) => (
                      <label
                        key={cv.id}
                        className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer transition ${
                          selectedStoredCvId === cv.id
                            ? "border-accent-cyan bg-accent-cyan/5 dark:bg-accent-cyan/10 text-accent-cyan font-semibold"
                            : "border-neutral-200 dark:border-border-subtle bg-white dark:bg-bg-tertiary text-neutral-700 dark:text-text-secondary hover:border-neutral-300"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm">
                            {cv.originalFilename}
                          </span>
                          <span className="block text-xs font-normal text-neutral-500 dark:text-text-tertiary">
                            Uploaded{" "}
                            {new Date(cv.createdAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </span>
                        <input
                          type="radio"
                          name="storedCv"
                          value={cv.id}
                          checked={selectedStoredCvId === cv.id}
                          onChange={() => setSelectedStoredCvId(cv.id)}
                          className="h-4 w-4 shrink-0 text-accent-cyan focus:ring-accent-cyan"
                        />
                      </label>
                    ))}
                  </fieldset>
                ))}

              {cvOption === "UPLOAD" && (
                <div className="p-4 rounded-xl border border-dashed border-neutral-300 dark:border-border-subtle bg-neutral-50/60 dark:bg-bg-tertiary/40 text-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    // PDF only: the analyse route reads uploads with the PDF
                    // parser, so offering .docx here would fail after the fact.
                    accept="application/pdf,.pdf"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-bg-secondary border border-neutral-200 dark:border-border-subtle text-xs font-semibold text-neutral-700 dark:text-text-primary hover:bg-neutral-50 transition"
                  >
                    <Upload className="h-4 w-4 text-neutral-500" />
                    {uploadFile ? "Change Document" : "Choose File"}
                  </button>
                  {uploadFile && (
                    <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {uploadFile.name}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-neutral-500 dark:text-text-tertiary">
                    PDF, up to 4MB.
                  </p>
                </div>
              )}

              <div className="pt-3 flex items-center justify-between gap-3 border-t border-neutral-100 dark:border-border-subtle">
                <button
                  type="button"
                  onClick={() => setStep("TRACK")}
                  className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-border-subtle text-xs font-semibold text-neutral-600 dark:text-text-secondary hover:bg-neutral-50 dark:hover:bg-bg-tertiary transition"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isFullDescription) {
                      setStep("DESCRIPTION");
                    } else {
                      setStep("REVIEW");
                    }
                  }}
                  disabled={!cvSourceReady}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/*
            STEP 3: Complete the description.

            WHAT WAS WRONG. This step existed but could not do its job. The
            textarea was PRE-FILLED with the provider's partial text, so pressing
            Continue submitted the same teaser and `handleStartAnalysis` then
            skipped the save because the value had not changed. Worse,
            `partialDescriptionAccepted` was hardcoded to `!isFullDescription`,
            so the server-side reduced-confidence guard was auto-answered on the
            user's behalf and they were never actually told they were about to
            analyse half an advert.

            Now: the box starts EMPTY, the provider excerpt is shown separately
            and read-only, pasting is saved and reassessed explicitly, and
            proceeding on partial text requires a deliberate acknowledgement.
          */}
          {phase === "FORM" && step === "DESCRIPTION" && !isFullDescription && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="font-bold">
                  This vacancy does not include a complete job description.
                </p>
                <p className="mt-1">
                  Paste the full description to get a reliable match analysis.
                  {descriptionCompleteness === "EXTERNAL_ONLY"
                    ? " This job source supplied no description text at all."
                    : " Only a partial excerpt was supplied by the job source."}
                </p>
              </div>

              {providerDescription && (
                <details className="rounded-xl border border-neutral-200 dark:border-border-subtle bg-neutral-50/60 dark:bg-bg-tertiary/40 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-neutral-700 dark:text-text-secondary">
                    Show the partial text the job source supplied
                  </summary>
                  <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-neutral-600 dark:text-text-tertiary">
                    {providerDescription}
                  </p>
                </details>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="pasted-description"
                  className="text-sm font-bold text-neutral-900 dark:text-text-primary"
                >
                  Full job description
                </label>
                {sourceUrl && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-sky-200/60 bg-sky-50 px-3 text-xs font-semibold text-accent-cyan transition hover:bg-sky-100"
                  >
                    <span className="whitespace-normal text-left">
                      View description on employer site
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                  </a>
                )}
              </div>

              <textarea
                id="pasted-description"
                value={pastedDescription}
                onChange={(e) => setPastedDescription(e.target.value)}
                aria-describedby="pasted-description-help"
                placeholder="Paste the complete advert from the employer website…"
                className="w-full min-h-40 rounded-xl border border-neutral-200 dark:border-border-subtle bg-white dark:bg-bg-tertiary p-3 text-xs text-neutral-800 dark:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-cyan/30"
              />

              <div className="flex flex-wrap items-center gap-2">
                {/* Clipboard read needs a user gesture and a permission the
                    browser may refuse; failure is silent and the user can still
                    paste with the keyboard. */}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setPastedDescription(
                        await navigator.clipboard.readText(),
                      );
                    } catch {
                      setError(
                        "Your browser did not allow reading the clipboard. Paste into the box with Ctrl+V instead.",
                      );
                    }
                  }}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-neutral-200 px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 dark:border-border-subtle dark:text-text-primary dark:hover:bg-bg-tertiary"
                >
                  <ClipboardPaste className="h-4 w-4 shrink-0" aria-hidden />
                  Paste
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPastedDescription("");
                    setSavedDescription(false);
                  }}
                  disabled={!pastedDescription}
                  className="inline-flex min-h-11 items-center rounded-xl border border-neutral-200 px-3 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-40 dark:border-border-subtle dark:text-text-secondary dark:hover:bg-bg-tertiary"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={saveAndReassess}
                  disabled={!pasteIsUsable || saving}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  Save and reassess
                </button>
                <span
                  id="pasted-description-help"
                  className={`text-xs ${
                    pastedDescription.trim().length &&
                    !pasteIsUsable
                      ? "text-error font-semibold"
                      : "text-neutral-500 dark:text-text-tertiary"
                  }`}
                >
                  {pastedDescription.trim().length.toLocaleString("en-GB")}{" "}
                  characters
                  {pastedDescription.trim().length && !pasteIsUsable
                    ? ` — at least ${MIN_PASTED_CHARS} needed`
                    : ""}
                </span>
              </div>

              {savedDescription && (
                <p className="flex items-center gap-1.5 rounded-xl border border-emerald-200/60 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                  Saved and reassessed. This text is now the active description
                  for this vacancy.
                </p>
              )}

              <p className="text-xs leading-5 text-neutral-500 dark:text-text-tertiary">
                Pasted text is stored against this vacancy for your account only.
                It is kept separate from the job source&apos;s own text, which is
                never overwritten.
              </p>

              {!savedDescription && (
                <label className="flex items-start gap-2 rounded-xl border border-neutral-200 p-3 text-xs leading-5 text-neutral-700 dark:border-border-subtle dark:text-text-secondary">
                  <input
                    type="checkbox"
                    checked={partialAccepted}
                    onChange={(event) =>
                      setPartialAccepted(event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span>
                    Continue without the full description. I understand the
                    analysis will be based on an incomplete advert and will be
                    less reliable.
                  </span>
                </label>
              )}

              <div className="pt-3 flex items-center justify-between gap-3 border-t border-neutral-100 dark:border-border-subtle">
                <button
                  type="button"
                  onClick={() => setStep("CV")}
                  className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-border-subtle text-xs font-semibold text-neutral-600 dark:text-text-secondary hover:bg-neutral-50 dark:hover:bg-bg-tertiary transition"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep("REVIEW")}
                  disabled={!savedDescription && !partialAccepted}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Review & Start Analysis */}
          {phase === "FORM" &&
            (step === "REVIEW" ||
              (step === "DESCRIPTION" && isFullDescription)) && (
            <div className="space-y-4">
              <div className="rounded-xl bg-neutral-50 dark:bg-bg-tertiary p-4 border border-neutral-200/80 dark:border-border-subtle space-y-2">
                <h4 className="text-xs font-bold text-neutral-900 dark:text-text-primary uppercase tracking-wider">
                  Match Confirmation
                </h4>
                <div className="text-xs text-neutral-600 dark:text-text-secondary space-y-1">
                  <p>
                    <span className="font-semibold">Vacancy:</span> {jobTitle} ({companyName})
                  </p>
                  <p>
                    <span className="font-semibold">Target Track:</span>{" "}
                    {availableCareerTracks.find((t) => t.id === selectedTrack)?.label || "Default Profile"}
                  </p>
                  <p>
                    <span className="font-semibold">CV:</span>{" "}
                    {cvOption === "UPLOAD"
                      ? (uploadFile?.name ?? "New upload")
                      : (storedCvs?.find((cv) => cv.id === selectedStoredCvId)
                          ?.originalFilename ?? "Stored CV")}
                  </p>
                  <p>
                    <span className="font-semibold">Description Status:</span>{" "}
                    {isFullDescription
                      ? "Complete advert from the job source"
                      : savedDescription
                        ? "Complete advert you pasted"
                        : "Partial advert — reduced-confidence analysis accepted"}
                  </p>
                </div>
              </div>

              <p className="text-xs text-neutral-500 dark:text-text-tertiary">
                Match analysis uses 1 unit of your plan&apos;s job-match quota and
                runs here — the result appears in this window when it finishes.
              </p>

              <div className="pt-3 flex items-center justify-between gap-3 border-t border-neutral-100 dark:border-border-subtle">
                <button
                  type="button"
                  onClick={() => setStep(isFullDescription ? "CV" : "DESCRIPTION")}
                  disabled={running}
                  className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-border-subtle text-xs font-semibold text-neutral-600 dark:text-text-secondary hover:bg-neutral-50 dark:hover:bg-bg-tertiary transition disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleStartAnalysis}
                  disabled={running || !cvSourceReady}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-sm hover:bg-slate-800 transition flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  Start Analysis
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
