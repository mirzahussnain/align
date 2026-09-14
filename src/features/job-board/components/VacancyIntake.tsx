"use client";

import { ANALYSIS_LIMITS } from "@/shared/config/analysis-domain";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type { CVAnalysisResult } from "@/shared/types/cv";
import type {
  CareerTrack,
  JobDetailsViewModel,
} from "@/features/job-board/lib/job-board";
import { readJson } from "@/features/job-board/lib/job-board";
import { useEntitlements } from "@/shared/components/entitlements/EntitlementProvider";
import { VacancyStepIndicator } from "./stepper/VacancyStepIndicator";
import { Step1VacancyForm, type StoredCvOption } from "./stepper/Step1VacancyForm";
import { Step2CheckResults } from "./stepper/Step2CheckResults";
import { Step3AnalysisOrUpgrade } from "./stepper/Step3AnalysisOrUpgrade";

const MAX_CV_BYTES = ANALYSIS_LIMITS.maxDirectMultipartCvBytes;

type CheckedVacancy = {
  jobSnapshotId: string;
  profileId: string;
  details: JobDetailsViewModel;
};

type ExtractedVacancy = {
  finalUrl: string;
  title: string;
  employerName: string;
  locationText: string;
  description: string;
  source: "JOB_POSTING_JSON_LD" | "PAGE_METADATA";
  warnings: string[];
};

export function VacancyIntake() {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  const [tracks, setTracks] = useState<CareerTrack[]>([]);
  const [storedCvs, setStoredCvs] = useState<StoredCvOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [sourceUrl, setSourceUrl] = useState("");
  const [title, setTitle] = useState("");
  const [employerName, setEmployerName] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [locationText, setLocationText] = useState("");
  const [description, setDescription] = useState("");
  const [profileId, setProfileId] = useState("");
  const [cvSource, setCvSource] = useState<"STORED" | "UPLOAD">("STORED");
  const [storedCvId, setStoredCvId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [checked, setChecked] = useState<CheckedVacancy | null>(null);
  const [checking, setChecking] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [partialAccepted, setPartialAccepted] = useState(false);
  const [result, setResult] = useState<CVAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operationId = useRef<string>("");

  const { decisionFor, openUpgrade } = useEntitlements();
  const jobMatchDecision = decisionFor("job_match_analysis");
  const isRestricted = !jobMatchDecision.allowed;
  const handleOpenUpgrade = () =>
    openUpgrade({
      capability: "job_match_analysis",
      decision: jobMatchDecision,
      source: "analysis",
    });

  useEffect(() => {
    let active = true;
    Promise.all([
      readJson<{ profiles?: CareerTrack[] }>("/api/jobs/bootstrap"),
      readJson<{ storedCvs?: StoredCvOption[] }>("/api/stored-cvs"),
    ])
      .then(([bootstrap, cvs]) => {
        if (!active) return;
        const availableTracks = bootstrap.profiles ?? [];
        const availableCvs = (cvs.storedCvs ?? []).filter(
          (cv) => cv.objectAvailable,
        );
        setTracks(availableTracks);
        setProfileId(
          availableTracks.find((track) => track.isDefault)?.profileId ??
            availableTracks[0]?.profileId ??
            "",
        );
        setStoredCvs(availableCvs);
        setStoredCvId(availableCvs[0]?.id ?? "");
        if (!availableCvs.length) setCvSource("UPLOAD");
      })
      .catch((caught) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load your Career Tracks and CVs.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const invalidateCheck = () => {
    setChecked(null);
    setResult(null);
    setSaved(false);
    setPartialAccepted(false);
    setCompletedSteps([]);
    operationId.current = "";
  };

  const cvReady =
    cvSource === "STORED" ? Boolean(storedCvId) : Boolean(uploadFile);
  const descriptionReady = description.trim().length >= 400;

  const importFromUrl = async (urlToImport?: string) => {
    const url = (urlToImport ?? sourceUrl).trim();
    if (!url || importingUrl) return;
    setImportingUrl(true);
    setError(null);
    setImportWarnings([]);
    invalidateCheck();
    try {
      const extracted = await readJson<ExtractedVacancy>(
        "/api/jobs/intake/extract",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceUrl: url }),
        },
      );
      setSourceUrl(extracted.finalUrl);
      setTitle(extracted.title);
      setEmployerName(extracted.employerName);
      setLocationText(extracted.locationText);
      setDescription(extracted.description);
      setImportWarnings(extracted.warnings);
      if (!extracted.description) {
        setError(
          "The page did not expose a description. Paste the full advert below.",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The job page could not be imported. Paste the full description instead.",
      );
    } finally {
      setImportingUrl(false);
    }
  };

  const identityReady =
    title.trim().length >= 2 && employerName.trim().length >= 2;
  const canCheck =
    Boolean(profileId) && identityReady && descriptionReady && !checking;

  const checkVacancy = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCheck) return;
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const response = await readJson<CheckedVacancy>("/api/jobs/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: sourceUrl.trim() || undefined,
          title,
          employerName,
          locationText: locationText.trim() || undefined,
          description,
          profileId,
        }),
      });
      setChecked(response);
      setPartialAccepted(
        response.details.description.completeness === "FULL",
      );
      setCompletedSteps([1]);
      setCurrentStep(2);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to check this vacancy.",
      );
    } finally {
      setChecking(false);
    }
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      setError("Upload a PDF CV.");
      return;
    }
    if (file.size > MAX_CV_BYTES) {
      setError("That CV is larger than 4MB.");
      return;
    }
    setError(null);
    setUploadFile(file);
    setResult(null);
    operationId.current = "";
  };

  const analyse = async () => {
    if (!checked || !cvReady || !partialAccepted) return;

    setCurrentStep(3);
    setCompletedSteps((prev) => Array.from(new Set([...prev, 1, 2])));

    if (isRestricted) {
      return;
    }

    setAnalysing(true);
    setError(null);
    try {
      const prepared = await readJson<{ matchRequestId: string }>(
        `/api/jobs/${encodeURIComponent(checked.jobSnapshotId)}/match-preparation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId,
            partialDescriptionAccepted:
              checked.details.description.completeness !== "FULL",
          }),
        },
      );
      const form = new FormData();
      form.append("mode", "job_match");
      form.append("jobMatchRequestId", prepared.matchRequestId);
      form.append("profileId", profileId);
      if (cvSource === "STORED") {
        form.append("storedCvId", storedCvId);
      } else if (uploadFile) {
        form.append("file", uploadFile);
      }
      if (!operationId.current) operationId.current = crypto.randomUUID();
      const response = await fetch("/api/job-matches", {
        method: "POST",
        headers: { "x-operation-id": operationId.current },
        body: form,
      });
      const body = (await response.json().catch(() => null)) as
        | (CVAnalysisResult & { error?: string; message?: string })
        | null;
      if (!response.ok) {
        throw new Error(
          body?.error || body?.message || "Unable to analyse this CV.",
        );
      }
      if (!body) throw new Error("The analysis returned no result.");
      setResult(body);
      setCompletedSteps([1, 2, 3]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to analyse this CV.",
      );
    } finally {
      setAnalysing(false);
    }
  };

  const saveJob = async () => {
    if (!checked || saving) return;
    setSaving(true);
    setError(null);
    try {
      await readJson(
        `/api/jobs/${encodeURIComponent(checked.jobSnapshotId)}/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId }),
        },
      );
      setSaved(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save this job.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Stepper Progress Indicator */}
      <VacancyStepIndicator
        currentStep={currentStep}
        completedSteps={completedSteps}
        onSelectStep={(step) => setCurrentStep(step)}
      />

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {/* Step Content */}
      {currentStep === 1 && (
        <Step1VacancyForm
          sourceUrl={sourceUrl}
          setSourceUrl={(val) => {
            setSourceUrl(val);
            setImportWarnings([]);
            invalidateCheck();
          }}
          importingUrl={importingUrl}
          importFromUrl={importFromUrl}
          importWarnings={importWarnings}
          title={title}
          setTitle={(val) => {
            setTitle(val);
            invalidateCheck();
          }}
          employerName={employerName}
          setEmployerName={(val) => {
            setEmployerName(val);
            invalidateCheck();
          }}
          locationText={locationText}
          setLocationText={(val) => {
            setLocationText(val);
            invalidateCheck();
          }}
          description={description}
          setDescription={(val) => {
            setDescription(val);
            invalidateCheck();
          }}
          profileId={profileId}
          setProfileId={(val) => {
            setProfileId(val);
            invalidateCheck();
          }}
          tracks={tracks}
          loadingOptions={loadingOptions}
          cvSource={cvSource}
          setCvSource={setCvSource}
          storedCvs={storedCvs}
          storedCvId={storedCvId}
          setStoredCvId={(val) => {
            setStoredCvId(val);
            setResult(null);
            operationId.current = "";
          }}
          uploadFile={uploadFile}
          chooseFile={chooseFile}
          canCheck={canCheck}
          checking={checking}
          onCheckSubmit={checkVacancy}
        />
      )}

      {currentStep === 2 && checked?.details && (
        <Step2CheckResults
          details={checked.details}
          partialAccepted={partialAccepted}
          setPartialAccepted={setPartialAccepted}
          cvReady={cvReady}
          analysing={analysing}
          onAnalyse={analyse}
          saving={saving}
          saved={saved}
          onSaveJob={saveJob}
          onEditStep1={() => setCurrentStep(1)}
        />
      )}

      {currentStep === 3 && (
        <Step3AnalysisOrUpgrade
          isRestricted={isRestricted}
          result={result}
          analysing={analysing}
          onAnalyse={analyse}
          saved={saved}
          saving={saving}
          onSaveJob={saveJob}
          onOpenUpgrade={handleOpenUpgrade}
        />
      )}
    </div>
  );
}
