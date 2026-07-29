"use client";

import { useState, useRef, type ChangeEvent } from "react";
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
} from "lucide-react";
import { readJson } from "@/features/job-board/lib/job-board";

/**
 * Shortest text accepted as a complete advert.
 *
 * Set at the low end deliberately: this is a guard against a stray line or an
 * accidental empty paste, not a judgement about how a real advert should read.
 * The server reassesses whatever is saved, and a genuinely short paste is
 * classified PARTIAL there rather than being rejected here.
 */
const MIN_PASTED_CHARS = 400;

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
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  // Deliberately EMPTY, not seeded with the provider's partial text. Seeding it
  // meant a user could press Continue on the same teaser and have it counted as
  // a completed paste.
  const [pastedDescription, setPastedDescription] = useState("");
  const [savedDescription, setSavedDescription] = useState(false);
  const [partialAccepted, setPartialAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"TRACK" | "CV" | "DESCRIPTION" | "REVIEW">(
    "TRACK",
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // No reset effect. The caller MOUNTS this component only while it is open, so
  // every opening starts from fresh `useState` initialisers. The effect that
  // used to reset ten pieces of state after render was both a cascading-render
  // hazard and a correctness one: for one render after opening, the wizard still
  // held the previous vacancy's step, track and pasted text.
  if (!open) return null;

  /**
   * Persist the pasted description and let the server reassess it.
   *
   * The route replaces the selected description, recomputes its hash and clears
   * the intelligence derived from the old text, so the reassessment is the
   * server's, not a client-side guess. Nothing here overwrites the provider's
   * own description.
   */
  const saveAndReassess = async () => {
    if (!pasteIsUsable) return;
    setSaving(true);
    setError(null);
    try {
      await readJson(`/api/jobs/${encodeURIComponent(jobId)}/description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: trimmedPaste }),
      });
      setSavedDescription(true);
      setPartialAccepted(false);
      onDescriptionSaved?.();
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
    if (file) {
      setUploadedFileName(file.name);
    }
  };

  const handleStartAnalysis = async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await readJson<{ matchRequestId: string }>(
        `/api/jobs/${encodeURIComponent(jobId)}/match-preparation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId: selectedTrack || undefined,
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

      window.location.assign(
        `/analyze?mode=job_match&matchRequest=${encodeURIComponent(
          result.matchRequestId,
        )}`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to start match analysis. Please try again.",
      );
      setRunning(false);
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
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-bg-tertiary dark:hover:text-text-primary transition-colors"
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

          {/* STEP 1: Select Career Track */}
          {step === "TRACK" && (
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
                          ? "border-accent-purple bg-accent-purple/5 dark:bg-accent-purple/10 text-accent-purple font-semibold"
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
                        className="h-4 w-4 text-accent-purple focus:ring-accent-purple"
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
                  className="px-5 py-2.5 rounded-xl bg-accent-purple text-white text-xs font-semibold hover:bg-accent-purple/90 shadow-sm transition flex items-center gap-1.5"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Select CV Source */}
          {step === "CV" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-text-primary">
                  2. Choose Job Analysis Options
                </h3>
                <p className="text-xs text-neutral-500 dark:text-text-secondary mt-0.5">
                  Select whether to use your stored profile CV or upload a new document.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className={`flex flex-col p-4 rounded-xl border cursor-pointer transition ${
                    cvOption === "PROFILE"
                      ? "border-accent-purple bg-accent-purple/5 dark:bg-accent-purple/10 text-accent-purple font-semibold"
                      : "border-neutral-200 dark:border-border-subtle bg-white dark:bg-bg-tertiary text-neutral-700 dark:text-text-secondary hover:border-neutral-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <FileText className="h-5 w-5 text-accent-purple" />
                    <input
                      type="radio"
                      name="cvOption"
                      value="PROFILE"
                      checked={cvOption === "PROFILE"}
                      onChange={() => setCvOption("PROFILE")}
                      className="h-4 w-4 text-accent-purple focus:ring-accent-purple"
                    />
                  </div>
                  <span className="text-sm font-bold">Existing Profile CV</span>
                  <span className="text-xs font-normal text-neutral-500 dark:text-text-tertiary mt-1">
                    Use your active profile facts and documents
                  </span>
                </label>

                <label
                  className={`flex flex-col p-4 rounded-xl border cursor-pointer transition ${
                    cvOption === "UPLOAD"
                      ? "border-accent-purple bg-accent-purple/5 dark:bg-accent-purple/10 text-accent-purple font-semibold"
                      : "border-neutral-200 dark:border-border-subtle bg-white dark:bg-bg-tertiary text-neutral-700 dark:text-text-secondary hover:border-neutral-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Upload className="h-5 w-5 text-accent-purple" />
                    <input
                      type="radio"
                      name="cvOption"
                      value="UPLOAD"
                      checked={cvOption === "UPLOAD"}
                      onChange={() => setCvOption("UPLOAD")}
                      className="h-4 w-4 text-accent-purple focus:ring-accent-purple"
                    />
                  </div>
                  <span className="text-sm font-bold">Upload New CV</span>
                  <span className="text-xs font-normal text-neutral-500 dark:text-text-tertiary mt-1">
                    Upload a PDF or Word document for this match
                  </span>
                </label>
              </div>

              {cvOption === "UPLOAD" && (
                <div className="p-4 rounded-xl border border-dashed border-neutral-300 dark:border-border-subtle bg-neutral-50/60 dark:bg-bg-tertiary/40 text-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".pdf,.doc,.docx,.txt"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-bg-secondary border border-neutral-200 dark:border-border-subtle text-xs font-semibold text-neutral-700 dark:text-text-primary hover:bg-neutral-50 transition"
                  >
                    <Upload className="h-4 w-4 text-neutral-500" />
                    {uploadedFileName ? "Change Document" : "Choose File"}
                  </button>
                  {uploadedFileName && (
                    <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {uploadedFileName}
                    </p>
                  )}
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
                  className="px-5 py-2.5 rounded-xl bg-accent-purple text-white text-xs font-semibold hover:bg-accent-purple/90 shadow-sm transition flex items-center gap-1.5"
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
          {step === "DESCRIPTION" && !isFullDescription && (
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
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-purple-200/60 bg-purple-50 px-3 text-xs font-semibold text-accent-purple transition hover:bg-purple-100"
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
                className="w-full min-h-40 rounded-xl border border-neutral-200 dark:border-border-subtle bg-white dark:bg-bg-tertiary p-3 text-xs text-neutral-800 dark:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple/30"
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
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent-purple px-4 text-xs font-semibold text-white transition hover:bg-accent-purple/90 disabled:opacity-50"
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
                  className="px-5 py-2.5 rounded-xl bg-accent-purple text-white text-xs font-semibold hover:bg-accent-purple/90 shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Review & Start Analysis */}
          {(step === "REVIEW" || (step === "DESCRIPTION" && isFullDescription)) && (
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
                    <span className="font-semibold">CV Source:</span>{" "}
                    {cvOption === "UPLOAD"
                      ? uploadedFileName || "New Upload"
                      : "Existing Profile CV"}
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
                Match analysis will consume 1 quota unit from your active plan. Results will render instantly upon completion.
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
                  disabled={running}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-accent-purple text-white text-xs font-bold shadow-md hover:opacity-95 transition flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {running ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Starting Analysis...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Start Analysis
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
