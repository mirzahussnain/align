"use client";

import Link from "next/link";
import {
  Download,
  ExternalLink,
  Loader2,
  MapPin,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useRef } from "react";
import type { CareerTrack } from "@/features/job-board/lib/job-board";

export type StoredCvOption = {
  id: string;
  originalFilename: string;
  createdAt: string;
  objectAvailable: boolean;
};

interface Step1VacancyFormProps {
  sourceUrl: string;
  setSourceUrl: (val: string) => void;
  importingUrl: boolean;
  importFromUrl: (urlToImport?: string) => void;
  importWarnings: string[];
  title: string;
  setTitle: (val: string) => void;
  employerName: string;
  setEmployerName: (val: string) => void;
  locationText: string;
  setLocationText: (val: string) => void;
  description: string;
  setDescription: (val: string) => void;
  profileId: string;
  setProfileId: (val: string) => void;
  tracks: CareerTrack[];
  loadingOptions: boolean;
  cvSource: "STORED" | "UPLOAD";
  setCvSource: (val: "STORED" | "UPLOAD") => void;
  storedCvs: StoredCvOption[];
  storedCvId: string;
  setStoredCvId: (val: string) => void;
  uploadFile: File | null;
  chooseFile: (event: ChangeEvent<HTMLInputElement>) => void;
  canCheck: boolean;
  checking: boolean;
  onCheckSubmit: (event: FormEvent) => void;
}

const inputClass =
  "mt-1.5 min-h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50/50 px-3.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-accent-purple focus:bg-white focus:ring-2 focus:ring-accent-purple/15 dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary dark:focus:bg-bg-secondary";

export function Step1VacancyForm({
  sourceUrl,
  setSourceUrl,
  importingUrl,
  importFromUrl,
  importWarnings,
  title,
  setTitle,
  employerName,
  setEmployerName,
  locationText,
  setLocationText,
  description,
  setDescription,
  profileId,
  setProfileId,
  tracks,
  loadingOptions,
  cvSource,
  setCvSource,
  storedCvs,
  storedCvId,
  setStoredCvId,
  uploadFile,
  chooseFile,
  canCheck,
  checking,
  onCheckSubmit,
}: Step1VacancyFormProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const descriptionReady = description.trim().length >= 400;

  return (
    <form
      onSubmit={onCheckSubmit}
      className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-border-subtle dark:bg-bg-secondary sm:p-6 space-y-6"
    >

      {/* URL Import Section */}
      <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/50 p-4 dark:border-border-subtle dark:bg-bg-tertiary/30 space-y-2">
        <label
          htmlFor="vacancy-url"
          className="text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-text-secondary"
        >
          Job URL <span className="font-normal text-neutral-400">(optional)</span>
        </label>
        <div className="grid items-end gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative flex items-center mt-1.5">
            <ExternalLink className="pointer-events-none absolute left-3.5 h-4 w-4 text-neutral-400 z-10" />
            <input
              id="vacancy-url"
              type="url"
              inputMode="url"
              placeholder="https://www.linkedin.com/jobs/view/..."
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className={`${inputClass} !mt-0 !pl-11`}
            />
          </div>
          <button
            type="button"
            onClick={() => importFromUrl(sourceUrl)}
            disabled={!sourceUrl.trim() || importingUrl}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-accent-purple/30 bg-accent-purple/10 px-4 text-sm font-bold text-accent-purple transition hover:bg-accent-purple/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {importingUrl ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {importingUrl ? "Importing..." : "Import Vacancy"}
          </button>
        </div>
        <p className="text-[11px] text-neutral-400">
          Align reads public structured vacancy data where available. If a site blocks access or hides the advert, paste the description below.
        </p>
        {importWarnings.length > 0 && (
          <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
            {importWarnings.map((w, idx) => (
              <li key={idx}>• {w}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Basic Vacancy Meta */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-text-primary">
          Job title
          <input
            required
            aria-label="Job title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Data Analyst"
            className={inputClass}
          />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-text-primary">
          Employer
          <input
            required
            aria-label="Employer"
            value={employerName}
            onChange={(e) => setEmployerName(e.target.value)}
            placeholder="Example Ltd"
            className={inputClass}
          />
          <span className="mt-1.5 block text-[11px] font-normal normal-case tracking-normal text-neutral-400">
            Employer name helps Align check sponsorship information.
          </span>
        </label>
      </div>

      {/* Location */}
      <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-text-primary">
        Location <span className="font-normal text-neutral-400 uppercase">(optional)</span>
        <div className="relative flex items-center mt-1.5">
          <MapPin className="pointer-events-none absolute left-3.5 h-4 w-4 text-neutral-400 z-10" />
          <input
            aria-label="Location"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            placeholder="e.g. Leeds, UK · Hybrid"
            className={`${inputClass} !mt-0 !pl-11`}
          />
        </div>
      </label>

      {/* Job Description */}
      <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-text-primary">
        <div className="flex items-center justify-between">
          <span>Full job description</span>
          <span
            className={`text-xs font-semibold ${
              descriptionReady ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-400"
            }`}
          >
            {description.trim().length.toLocaleString()} / 400 minimum characters
          </span>
        </div>
        <textarea
          required
          aria-label="Full job description"
          minLength={400}
          maxLength={50_000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Paste the complete responsibilities, essential criteria, practical requirements and benefits…"
          className={`${inputClass} min-h-48 resize-y py-3 leading-6`}
        />
      </label>

      {/* Career Track & CV Selection */}
      <div className="grid gap-4 sm:grid-cols-2 pt-2">
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-text-primary">
          Career Track
          <select
            aria-label="Career Track"
            value={profileId}
            disabled={loadingOptions}
            onChange={(e) => setProfileId(e.target.value)}
            className={inputClass}
          >
            {tracks.map((t) => (
              <option key={t.profileId} value={t.profileId}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-text-primary">
            CV
          </legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCvSource("STORED")}
              disabled={!storedCvs.length}
              aria-pressed={cvSource === "STORED"}
              className={`min-h-11 rounded-xl border px-3 text-xs font-bold transition ${
                cvSource === "STORED"
                  ? "border-accent-purple bg-accent-purple/10 text-accent-purple"
                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-border-subtle dark:text-text-secondary"
              } disabled:opacity-40`}
            >
              Stored CV
            </button>
            <button
              type="button"
              onClick={() => setCvSource("UPLOAD")}
              aria-pressed={cvSource === "UPLOAD"}
              className={`min-h-11 rounded-xl border px-3 text-xs font-bold transition ${
                cvSource === "UPLOAD"
                  ? "border-accent-purple bg-accent-purple/10 text-accent-purple"
                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-border-subtle dark:text-text-secondary"
              }`}
            >
              Upload PDF
            </button>
          </div>
        </fieldset>
      </div>

      {cvSource === "STORED" ? (
        <select
          aria-label="Choose stored CV"
          value={storedCvId}
          onChange={(e) => setStoredCvId(e.target.value)}
          className={inputClass}
        >
          {storedCvs.map((cv) => (
            <option key={cv.id} value={cv.id}>
              {cv.originalFilename}
            </option>
          ))}
        </select>
      ) : (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-center dark:border-border-subtle dark:bg-bg-tertiary/40">
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            onChange={chooseFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-xs font-bold shadow-sm hover:bg-neutral-50 dark:border-border-subtle dark:bg-bg-secondary"
          >
            <Upload className="h-3.5 w-3.5" />
            {uploadFile ? "Change CV" : "Choose PDF"}
          </button>
          <p className="mt-1.5 truncate text-xs text-neutral-500">
            {uploadFile?.name ?? "PDF, up to 10MB"}
          </p>
        </div>
      )}

      {!tracks.length && !loadingOptions && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Create a Career Track in{" "}
          <Link href="/dashboard?tab=profile" className="font-semibold underline">
            Profile
          </Link>{" "}
          before checking a vacancy.
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!canCheck}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
      >
        {checking ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
        {checking ? "Checking Profile & Requirements..." : "Check Profile & Requirements"}
      </button>
    </form>
  );
}
