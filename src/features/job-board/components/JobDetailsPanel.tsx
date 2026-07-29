"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Circle,
  CircleCheck,
  ExternalLink,
  Info,
  Shield,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  Card,
  DataRow,
  Notice,
  Pill,
} from "@/features/job-board/components/board-chrome";
import {
  confidenceLabels,
  factStateLabels,
  humanise,
  practicalCategoryLabels,
  relativeDay,
  salaryLabel,
  sponsorCheckStateLabels,
  sponsorCheckStateStatements,
  sponsorLabels,
  sponsorStatements,
  sponsorshipSignalLabels,
} from "@/features/job-board/lib/format";
import {
  readJson,
  type JobDetailsViewModel,
  type SponsorStatus,
} from "@/features/job-board/lib/job-board";
import { CheckMatchModal } from "@/features/job-board/components/CheckMatchModal";

const DETAIL_TABS = [
  "Overview",
  "Description",
  "Requirements",
  "Sponsorship",
  "Source",
] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

const requirementCategoryLabels: Record<string, string> = {
  RIGHT_TO_WORK: "Right to work in the UK",
  SPONSORSHIP: "Sponsorship",
  UK_RESIDENCY: "UK residency",
  SECURITY_CLEARANCE: "Security clearance",
  DBS: "DBS check",
  PROFESSIONAL_REGISTRATION: "Professional registration",
  DRIVING_LICENCE: "Driving licence",
  OWN_VEHICLE: "Own vehicle",
  ONSITE: "On-site working",
  TRAVEL: "Travel",
};

const requirementPhrases: Record<string, string> = {
  REQUIRED: "required",
  PREFERRED: "preferred",
  MENTIONED: "mentioned",
  NOT_DETECTED: "not detected",
};

const sponsorIcons: Record<SponsorStatus, typeof Shield> = {
  MATCHED: ShieldCheck,
  AMBIGUOUS: ShieldCheck,
  NONE: ShieldOff,
  NOT_CHECKED: Shield,
};

type Requirement = NonNullable<
  JobDetailsViewModel["practicalRequirements"]
>[number];

/** One-line statement built only from stored category, strength and value. */
function requirementLine(item: Requirement) {
  const label =
    requirementCategoryLabels[item.category ?? ""] ??
    humanise(item.category) ??
    "Practical requirement";
  const phrase = requirementPhrases[item.requirement ?? ""];
  const value = item.value?.trim();
  if (value) return `${label}: ${value}`;
  return phrase ? `${label} ${phrase}` : label;
}

/**
 * Splits stored description text into an intro and the first bullet list, so
 * Overview can preview real content. Nothing is summarised or reworded.
 */
function outlineDescription(text?: string) {
  const blocks = text?.split(/\n\s*\n/).filter((block) => block.trim()) ?? [];
  const isBulleted = (block: string) =>
    block
      .split("\n")
      .filter(Boolean)
      .every((line) => /^\s*[-*•]\s+/.test(line));
  const intro = blocks.find((block) => !isBulleted(block));
  const bullets = blocks
    .find(isBulleted)
    ?.split("\n")
    .filter(Boolean)
    .map((line) => line.replace(/^\s*[-*•]\s+/, ""));
  return { intro, bullets };
}

/**
 * The link to the complete advert on the source site.
 *
 * WHAT WAS WRONG. The only affordance was a bare text button reading
 * "View full description v" — the trailing `v` and `^` were literal ASCII
 * characters standing in for chevrons, which is why the label looked truncated.
 * It also appeared ONLY for FULL descriptions, so the partial and external-only
 * cases — the ones that actually need to send the user elsewhere — had no
 * control at all, and the brief's "View job description" wording did not say
 * that following it leaves the site.
 *
 * WHAT THIS IS. A real anchor with `whitespace-normal`, no fixed width, no
 * truncation and no `overflow-hidden` ancestor constraint: the label wraps
 * rather than clipping at any viewport. The icon is `shrink-0` so it can never
 * overlap the text, and the touch target clears 44px.
 */
function ExternalDescriptionLink({
  url,
  completeness,
}: {
  url?: string;
  completeness: string;
}) {
  // Backend-validated URL only — `safeUrl` has already rejected anything that is
  // not http(s). No URL is ever constructed here from job fields.
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View the complete job description on the employer site (opens in a new tab)"
      className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-accent-purple transition hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-accent-purple dark:border-border-subtle dark:hover:bg-bg-tertiary"
    >
      <span className="whitespace-normal break-words text-left">
        {completeness === "FULL"
          ? "View this vacancy on the employer site"
          : "View description on employer site"}
      </span>
      <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
    </a>
  );
}

export function DescriptionBody({
  description,
}: {
  description: JobDetailsViewModel["description"];
}) {
  const blocks = description.text?.split(/\n\s*\n/).filter(Boolean) ?? [];
  if (!blocks.length)
    return (
      <p className="text-sm text-neutral-500 dark:text-text-tertiary">
        No durable description is stored for this vacancy. Open the source
        advert for the complete text.
      </p>
    );
  return (
    <div className="space-y-4 text-sm leading-7 text-neutral-700 dark:text-text-secondary">
      {blocks.map((block, index) => {
        const lines = block.split("\n").filter(Boolean);
        return lines.every((line) => /^\s*[-*•]\s+/.test(line)) ? (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {lines.map((line, lineIndex) => (
              <li key={lineIndex}>{line.replace(/^\s*[-*•]\s+/, "")}</li>
            ))}
          </ul>
        ) : (
          <p key={index} className="whitespace-pre-wrap">
            {block}
          </p>
        );
      })}
    </div>
  );
}

function MatchPreparationPanel({
  id,
  tracks,
  eligible,
}: {
  id: string;
  tracks: Array<{ id: string; label: string }>;
  eligible: boolean;
}) {
  const [track, setTrack] = useState(tracks[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prepare = async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await readJson<{ matchRequestId: string }>(
        `/api/jobs/${encodeURIComponent(id)}/match-preparation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId: track }),
        },
      );
      window.location.assign(
        `/analyze?mode=job_match&matchRequest=${encodeURIComponent(result.matchRequestId)}`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to prepare this match.",
      );
      setRunning(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-neutral-600 dark:text-text-secondary">
        Choose a Career Track to carry into Align&apos;s canonical analysis
        flow, where you will select a CV. Only confirmed profile facts and the
        stored description provenance are sent.
      </p>
      {!eligible && (
        <Notice tone="warning">
          This vacancy has no complete stored description, so a match cannot be
          prepared from it yet.
        </Notice>
      )}
      {tracks.length === 0 ? (
        <Notice>
          Create a Career Track in your profile before preparing a match.
        </Notice>
      ) : (
        <label className="block text-sm font-medium">
          Career Track
          <select
            value={track}
            onChange={(event) => setTrack(event.target.value)}
            className="mt-1 w-full"
          >
            <option value="">Select a Career Track</option>
            {tracks.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <button
        type="button"
        onClick={prepare}
        disabled={!track || running || !eligible}
        className="min-h-11 rounded-lg bg-accent-purple px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {running ? "Preparing…" : "Continue to analysis"}
      </button>
    </div>
  );
}

/**
 * BLOCK 1 — employer sponsor-register evidence.
 *
 * This card makes a claim about an ORGANISATION NAME and the current UK
 * register. It deliberately shows nothing about this vacancy: the advert's own
 * sponsorship wording is a separate card, because an employer holding a licence
 * and this job offering sponsorship are different facts and readers conflate
 * them the moment they share a box.
 */
function SponsorEvidenceCard({ data }: { data: JobDetailsViewModel }) {
  const evidence = data.sponsorEvidence;
  const status = evidence.status ?? evidence.summary.status;
  const Icon = sponsorIcons[status];
  const checkState = status === "NOT_CHECKED" ? evidence.checkState : undefined;
  return (
    <Card title="Employer sponsor-register evidence">
      <p
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${
          status === "MATCHED"
            ? "bg-success/10 text-success"
            : status === "AMBIGUOUS"
              ? "bg-neutral-100 text-neutral-600 dark:bg-bg-tertiary dark:text-text-secondary"
              : "bg-neutral-100 text-neutral-500 dark:bg-bg-tertiary dark:text-text-tertiary"
        }`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {checkState
          ? sponsorCheckStateLabels[checkState]
          : sponsorLabels[status]}
      </p>
      <p className="mt-2.5 text-xs leading-5 text-neutral-600 dark:text-text-secondary">
        {checkState
          ? sponsorCheckStateStatements[checkState]
          : sponsorStatements[status]}
      </p>
      {evidence.stale && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs leading-5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          A newer version of the sponsor register has been published. This result
          is from an earlier version and is being re-checked.
        </p>
      )}
      <dl className="mt-3 divide-y divide-neutral-100 border-t border-neutral-100 dark:divide-border-subtle dark:border-border-subtle">
        {evidence.matchedOrganisationName && (
          <DataRow label="Matched organisation">
            {evidence.matchedOrganisationName}
          </DataRow>
        )}
        {evidence.registerVersion && (
          <DataRow label="Register version">{evidence.registerVersion}</DataRow>
        )}
        <DataRow label="Last checked">
          {relativeDay(evidence.checkedAt) ?? "Not recorded"}
        </DataRow>
      </dl>
    </Card>
  );
}

const factStateStyles: Record<string, string> = {
  CONFIRMED: "bg-success/10 text-success",
  CONFLICT: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  UNKNOWN: "bg-neutral-100 text-neutral-600 dark:bg-bg-tertiary dark:text-text-secondary",
  NOT_APPLICABLE: "bg-neutral-100 text-neutral-500 dark:bg-bg-tertiary dark:text-text-tertiary",
};

const factStateIcons: Record<string, typeof Shield> = {
  CONFIRMED: CircleCheck,
  CONFLICT: TriangleAlert,
  UNKNOWN: Circle,
  NOT_APPLICABLE: Circle,
};

/**
 * BLOCK 3 — candidate practical compatibility.
 *
 * Deliberately has no headline number. Every row states what the vacancy said,
 * what the profile records, and which of the two is missing. Colour is never the
 * only signal: each row carries its state as a word and an icon, so the
 * distinction survives greyscale, colour-blindness and a screen reader.
 */
function PracticalCompatibilityCard({
  data,
  profileHref = "/dashboard/profile",
}: {
  data: JobDetailsViewModel;
  profileHref?: string;
}) {
  const compatibility = data.practicalCompatibility;
  if (!compatibility) {
    return (
      <Card title="Your practical compatibility">
        <p className="text-xs leading-5 text-neutral-600 dark:text-text-secondary">
          Choose a Career Track to compare this vacancy against the practical
          facts recorded in your profile.
        </p>
      </Card>
    );
  }
  if (!compatibility.items.length) {
    return (
      <Card title="Your practical compatibility">
        <p className="text-xs leading-5 text-neutral-600 dark:text-text-secondary">
          This vacancy does not state practical requirements that can be compared
          with your recorded profile facts.
        </p>
        <p className="mt-3 text-xs leading-5 text-neutral-500 dark:text-text-tertiary">
          {compatibility.disclaimer}
        </p>
      </Card>
    );
  }
  return (
    <Card title="Your practical compatibility">
      <p className="text-xs leading-5 text-neutral-600 dark:text-text-secondary">
        {compatibility.summary.confirmed} confirmed •{" "}
        {compatibility.summary.conflicts} potential conflict
        {compatibility.summary.conflicts === 1 ? "" : "s"} •{" "}
        {compatibility.summary.unknown} not confirmed
      </p>
      <ul className="mt-3 space-y-2">
        {compatibility.items.map((item, index) => {
          const StateIcon = factStateIcons[item.state] ?? Circle;
          return (
            <li
              key={`${item.category}-${index}`}
              className="rounded-xl border border-neutral-200 p-3 dark:border-border-subtle"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-neutral-900 dark:text-text-primary">
                  {practicalCategoryLabels[item.category] ??
                    humanise(item.category)}
                </p>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${factStateStyles[item.state] ?? factStateStyles.UNKNOWN}`}
                >
                  <StateIcon className="h-3.5 w-3.5" aria-hidden />
                  {factStateLabels[item.state]}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-5 text-neutral-600 dark:text-text-secondary">
                {item.explanation}
              </p>
              {item.confirmedProfileFact && (
                <p className="mt-1.5 text-xs text-neutral-500 dark:text-text-tertiary">
                  From your profile: {item.confirmedProfileFact}
                </p>
              )}
              {item.vacancyRequirement && (
                <p className="mt-1 text-xs text-neutral-500 dark:text-text-tertiary">
                  From the vacancy: {item.vacancyRequirement}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {compatibility.summary.unknown > 0 && (
        <a
          href={profileHref}
          className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-neutral-200 px-3 text-sm font-semibold text-accent-purple transition hover:bg-neutral-50 dark:border-border-subtle dark:hover:bg-bg-tertiary"
        >
          Update profile
        </a>
      )}
      <p className="mt-3 text-xs leading-5 text-neutral-500 dark:text-text-tertiary">
        {compatibility.disclaimer}
      </p>
    </Card>
  );
}

function SourceCard({ data }: { data: JobDetailsViewModel }) {
  const primary = data.sourceProvenance[0];
  return (
    <Card title="Source & freshness">
      <dl className="divide-y divide-neutral-100 dark:divide-border-subtle">
        <DataRow label="Source">
          {data.hostedUrl ? (
            <a
              href={data.hostedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent-purple"
            >
              {humanise(primary?.provider) ?? "Source advert"}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            (humanise(primary?.provider) ?? "Not recorded")
          )}
        </DataRow>
        {primary?.providerJobId && (
          <DataRow label="Job ID">{primary.providerJobId}</DataRow>
        )}
        <DataRow label="First seen">
          {relativeDay(data.firstSeenAt) ?? "Not recorded"}
        </DataRow>
        <DataRow label="Last refreshed">
          {relativeDay(data.lastRefreshedAt) ?? "Not recorded"}
        </DataRow>
      </dl>
    </Card>
  );
}

function OverviewTab({
  data,
  onOpenTab,
}: {
  data: JobDetailsViewModel;
  onOpenTab: (tab: DetailTab) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { intro, bullets } = useMemo(
    () => outlineDescription(data.description.text),
    [data.description.text],
  );
  const requirements = data.practicalRequirements ?? [];
  const assessment = data.descriptionAssessment;
  const isFull = data.description.completeness === "FULL";
  const posted = relativeDay(data.job.postedAt);

  return (
    <div className="space-y-4">
      {/* Job Details Cards Row - 2-Column Grid on Mobile, Flex Wrap on Desktop */}
      <dl className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3 min-w-0 w-full">
        <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-2.5 sm:px-4 sm:py-2.5 shadow-xs dark:border-border-subtle dark:bg-bg-tertiary/40 min-w-0">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-text-tertiary">
            SALARY
          </dt>
          <dd className="mt-0.5 truncate text-xs sm:text-sm font-bold text-neutral-900 dark:text-text-primary">
            {salaryLabel(data.job) ?? "Not stated"}
          </dd>
        </div>
        <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-2.5 sm:px-4 sm:py-2.5 shadow-xs dark:border-border-subtle dark:bg-bg-tertiary/40 min-w-0">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-text-tertiary">
            WORK STYLE
          </dt>
          <dd className="mt-0.5 truncate text-xs sm:text-sm font-bold text-neutral-900 dark:text-text-primary">
            {humanise(data.job.workplaceType) ?? "Unknown"}
          </dd>
        </div>
        <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-2.5 sm:px-4 sm:py-2.5 shadow-xs dark:border-border-subtle dark:bg-bg-tertiary/40 min-w-0">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-text-tertiary">
            EMPLOYMENT
          </dt>
          <dd className="mt-0.5 truncate text-xs sm:text-sm font-bold text-neutral-900 dark:text-text-primary">
            {humanise(data.job.employmentType) ?? "Full-time"}
          </dd>
        </div>
        <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-2.5 sm:px-4 sm:py-2.5 shadow-xs dark:border-border-subtle dark:bg-bg-tertiary/40 min-w-0">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-text-tertiary">
            POSTED
          </dt>
          <dd className="mt-0.5 truncate text-xs sm:text-sm font-bold text-neutral-900 dark:text-text-primary">
            {posted
              ? `${posted[0].toUpperCase()}${posted.slice(1)}`
              : "Posting date not stated"}
          </dd>
        </div>
      </dl>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,.95fr)]">
        <Card title="About the role">
          <div className="rounded-xl border border-neutral-100 bg-neutral-50/80 p-4 dark:border-border-subtle dark:bg-bg-tertiary/40">
            {expanded ? (
              <DescriptionBody description={data.description} />
            ) : intro ? (
              <p className="line-clamp-6 text-sm leading-6 text-neutral-700 dark:text-text-secondary">
                {intro}
              </p>
            ) : (
              <p className="text-sm text-neutral-500 dark:text-text-tertiary">
                No durable description is stored for this vacancy.
              </p>
            )}
            {!expanded && bullets?.length ? (
              <>
                <h4 className="mt-4 text-sm font-bold text-neutral-900 dark:text-text-primary">
                  Key responsibilities
                </h4>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-neutral-700 dark:text-text-secondary">
                  {bullets.slice(0, 6).map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {/*
              The expand toggle and the external link are different actions and
              are no longer conflated. The toggle expands text we HOLD; the link
              goes to text we do not. Chevrons are icons, not the literal `v` and
              `^` characters that made the old label read as clipped.
            */}
            {data.description.text ? (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
                className="mt-3 inline-flex min-h-11 max-w-full items-center gap-1.5 text-sm font-semibold text-accent-purple hover:underline focus-visible:ring-2 focus-visible:ring-accent-purple"
              >
                <span className="whitespace-normal text-left">
                  {expanded
                    ? "Show less"
                    : isFull
                      ? "View full description"
                      : "View the partial description we hold"}
                </span>
                {expanded ? (
                  <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                )}
              </button>
            ) : null}
            {!isFull && (
              <div className="mt-3 space-y-3">
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-200/80 bg-amber-50/90 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    {data.description.completeness === "EXTERNAL_ONLY"
                      ? "This job source did not supply a description. The complete advert is only available on the employer site."
                      : "This is a partial description from the job source, not the complete advert. Paste the full text in Check match before relying on an analysis."}
                  </span>
                </div>
                <ExternalDescriptionLink
                  url={data.hostedUrl}
                  completeness={data.description.completeness}
                />
              </div>
            )}
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card
            title="Description quality"
            action={
              assessment?.confidence ? (
                <Pill tone="accent">
                  {confidenceLabels[assessment.confidence]}
                </Pill>
              ) : undefined
            }
          >
            {assessment ? (
              <>
                <ul className="space-y-1.5 text-xs leading-5 text-neutral-600 dark:text-text-secondary">
                  {(assessment.reasons ?? []).slice(0, 3).map((reason) => (
                    <li key={reason} className="flex items-start gap-1.5">
                      <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      {reason}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-neutral-400 dark:text-text-tertiary">
                  Rule-based check
                  {relativeDay(data.assessedAt)
                    ? ` • assessed ${relativeDay(data.assessedAt)}`
                    : ""}
                </p>
              </>
            ) : (
              <p className="text-xs leading-5 text-neutral-500 dark:text-text-tertiary">
                This description has not been assessed, so no quality signal is
                available.
              </p>
            )}
          </Card>

          <Card title="Practical requirements">
            {requirements.length ? (
              <>
                <ul className="space-y-1.5 text-xs leading-5 text-neutral-600 dark:text-text-secondary">
                  {requirements.slice(0, 4).map((item, index) => (
                    <li
                      key={`${item.category ?? "requirement"}-${index}`}
                      className="flex items-start gap-1.5"
                    >
                      {item.requirement === "NOT_DETECTED" ? (
                        <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-300" />
                      ) : (
                        <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-purple" />
                      )}
                      {requirementLine(item)}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => onOpenTab("Requirements")}
                  className="mt-3 text-xs font-semibold text-accent-purple"
                >
                  View all requirements
                </button>
              </>
            ) : (
              <p className="text-xs leading-5 text-neutral-500 dark:text-text-tertiary">
                No practical requirements were extracted from the stored
                description.
              </p>
            )}
          </Card>
        </div>
      </div>

      <aside className="space-y-4">
        <SponsorEvidenceCard data={data} />
        <PracticalCompatibilityCard data={data} />
        <SourceCard data={data} />
        <div className="flex items-start gap-2.5 rounded-xl border border-sky-200/80 bg-sky-50/90 p-3.5 text-xs leading-5 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <span>{data.sponsorEvidence.disclaimer}</span>
        </div>
      </aside>
    </div>
  );
}

function RequirementsTab({ data }: { data: JobDetailsViewModel }) {
  const requirements = data.practicalRequirements ?? [];
  if (!requirements.length)
    return (
      <p className="text-sm text-neutral-500 dark:text-text-tertiary">
        No practical requirements were extracted from the stored description.
      </p>
    );
  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500 dark:text-text-tertiary">
        Rule-based extraction from the stored description. Confirm every
        requirement against the employer&apos;s advert.
      </p>
      {requirements.map((item, index) => (
        <div
          key={`${item.category ?? "requirement"}-${index}`}
          className="rounded-xl border border-neutral-200 p-3 dark:border-border-subtle"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-neutral-900 dark:text-text-primary">
              {requirementLine(item)}
            </p>
            {item.confidence && (
              <Pill>{confidenceLabels[item.confidence]} confidence</Pill>
            )}
          </div>
          {item.evidenceText && (
            <p className="mt-2 border-l-2 border-neutral-200 pl-3 text-xs italic leading-5 text-neutral-600 dark:border-border-subtle dark:text-text-secondary">
              “{item.evidenceText}”
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Two blocks, always separate, never merged.
 *
 * Left: what the REGISTER says about the employer's name. Right: what THIS
 * ADVERT says about sponsorship. Nothing infers one from the other — a licensed
 * sponsor may advertise a role it will not sponsor, and an advert offering
 * sponsorship is not evidence of a register entry.
 */
function SponsorshipTab({ data }: { data: JobDetailsViewModel }) {
  const signal = data.vacancySponsorship?.signal;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SponsorEvidenceCard data={data} />
      <Card title="Vacancy sponsorship wording">
        <p className="text-sm font-semibold text-neutral-900 dark:text-text-primary">
          {(signal && sponsorshipSignalLabels[signal]) ??
            "No sponsorship wording was assessed."}
        </p>
        <p className="mt-1.5 text-xs leading-5 text-neutral-500 dark:text-text-tertiary">
          Detected from this advert&apos;s own text. It is not derived from the
          employer&apos;s sponsor-register evidence.
        </p>
        {data.vacancySponsorship?.reasons?.[0] && (
          <p className="mt-2 text-xs leading-5 text-neutral-600 dark:text-text-secondary">
            {data.vacancySponsorship.reasons[0]}
          </p>
        )}
        {data.vacancySponsorship?.evidence?.length ? (
          <ul className="mt-3 space-y-2">
            {data.vacancySponsorship.evidence.slice(0, 3).map((item, index) => (
              <li
                key={index}
                className="border-l-2 border-neutral-200 pl-3 text-xs italic leading-5 text-neutral-600 dark:border-border-subtle dark:text-text-secondary"
              >
                “{item.text}”
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
      <div className="lg:col-span-2">
        <Notice>{data.sponsorEvidence.disclaimer}</Notice>
      </div>
      <div className="lg:col-span-2">
        <PracticalCompatibilityCard data={data} />
      </div>
    </div>
  );
}

function SourceTab({ data }: { data: JobDetailsViewModel }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SourceCard data={data} />
      <Card title="Provider references">
        <p className="mb-3 text-xs text-neutral-500 dark:text-text-tertiary">
          {data.job.sourceSummary.employerDirect
            ? "Employer-direct vacancy"
            : "Aggregator vacancy"}
          {" • "}
          {data.availability === "DISCOVERABLE"
            ? "currently discoverable"
            : "historical snapshot"}
        </p>
        <ul className="space-y-2">
          {data.sourceProvenance.map((source, index) => (
            <li
              key={`${source.provider}-${index}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs dark:bg-bg-tertiary"
            >
              <span className="font-semibold text-neutral-800 dark:text-text-primary">
                {humanise(source.provider)}
                {source.providerJobId ? ` • ${source.providerJobId}` : ""}
              </span>
              {source.hostedUrl && (
                <a
                  href={source.hostedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-accent-purple"
                >
                  Open advert <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function JobDetailsPanel({
  jobSnapshotId,
  saved,
  onSaved,
  onBack,
  onSave,
  saving,
}: {
  jobSnapshotId?: string;
  saved?: boolean;
  onSaved: (id: string, saved: boolean) => void;
  onBack?: () => void;
  onSave: (id: string, saved: boolean) => void;
  saving: boolean;
}) {
  const [data, setData] = useState<JobDetailsViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  // What the user last ASKED for. The tab actually in force is derived from it
  // below, because the set of available tabs changes with the description.
  const [requestedTab, setTab] = useState<DetailTab>("Overview");
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!jobSnapshotId) return;
    let active = true;
    const controller = new AbortController();
    readJson<JobDetailsViewModel>(
      `/api/jobs/${encodeURIComponent(jobSnapshotId)}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!active) return;
        setError(null);
        setData(result);
        onSaved(result.job.id, result.job.saved);
      })
      .catch((caught) => {
        if (active && (caught as Error).name !== "AbortError")
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load this vacancy.",
          );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [jobSnapshotId, onSaved, retry]);

  /**
   * Description tab rules, from the brief:
   *
   *   FULL + text                     → show
   *   PARTIAL + meaningful excerpt     → show, labelled Partial, with a warning
   *   PARTIAL + empty/meaningless      → hide
   *   EXTERNAL_ONLY                    → hide unless a useful excerpt exists
   *   USER_PASTED                      → show
   *
   * The gate is the server's `hasReadableText`, not the completeness verdict.
   * Gating on `completeness === "FULL"` alone hid the tab for every partial
   * vacancy that DID have readable text — and, once the classifier stopped
   * over-claiming FULL, that became almost all of them.
   */
  const visibleTabs = useMemo(() => {
    if (!data) return ["Overview"] as DetailTab[];
    const tabs: DetailTab[] = ["Overview"];
    if (data.description.hasReadableText ?? Boolean(data.description.text)) {
      tabs.push("Description");
    }
    if (data.practicalRequirements && data.practicalRequirements.length > 0) {
      tabs.push("Requirements");
    }
    tabs.push("Sponsorship", "Source");
    return tabs;
  }, [data]);

  /**
   * The tab actually in force.
   *
   * DERIVED, not synchronised. This used to be an effect that called
   * `setTab("Overview")` after render whenever the selected tab disappeared,
   * which meant one render where `tab` named a tab that no longer existed —
   * `aria-selected` on nothing, and an empty tabpanel — before the correction
   * landed. Deriving it means the tab list and the panel can never disagree,
   * which matters most in exactly the case this change introduces: saving a
   * pasted description can add or remove the Description tab underneath the user.
   */
  const tab = visibleTabs.includes(requestedTab) ? requestedTab : "Overview";

  const backButton = onBack && (
    <button
      type="button"
      onClick={onBack}
      className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-purple hover:underline"
    >
      <ChevronLeft className="h-4 w-4" />
      Back to results
    </button>
  );

  if (!jobSnapshotId)
    return (
      <div className="hidden min-h-[30rem] items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500 lg:flex dark:border-border-subtle dark:bg-bg-secondary">
        Select a vacancy to review its details without leaving the results.
      </div>
    );
  if (error)
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-border-subtle dark:bg-bg-secondary">
        {backButton}
        <Notice tone="error">{error}</Notice>
        <button
          type="button"
          onClick={() => setRetry((value) => value + 1)}
          className="mt-4 min-h-11 rounded-lg border px-4 text-sm font-semibold"
        >
          Retry details
        </button>
      </div>
    );
  if (!data)
    return (
      <div
        className="h-[36rem] animate-pulse rounded-2xl bg-neutral-200/70 dark:bg-bg-tertiary"
        aria-label="Loading job details"
      />
    );

  const isSaved = saved ?? data.job.saved;
  const posted = relativeDay(data.job.postedAt);
  const applyUrl = data.applicationUrl ?? data.hostedUrl;

  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const offset =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!offset) return;
    event.preventDefault();
    const next =
      visibleTabs[
        (visibleTabs.indexOf(tab) + offset + visibleTabs.length) %
          visibleTabs.length
      ];
    setTab(next);
    tabsRef.current
      ?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)
      ?.focus();
  };

  const panels: Record<DetailTab, ReactNode> = {
    Overview: <OverviewTab data={data} onOpenTab={setTab} />,
    Description: (
      <div className="space-y-3">
        {data.description.source === "USER_PASTED" ? (
          <Notice>
            User-pasted description — kept distinct from the provider text, which
            is still stored separately and is not overwritten.
          </Notice>
        ) : data.description.completeness !== "FULL" ? (
          <Notice tone="warning">
            This is a partial description from the job source, not the complete
            advert. Read the full text on the employer&apos;s site, or paste it
            into Check match for a reliable analysis.
          </Notice>
        ) : null}
        <DescriptionBody description={data.description} />
        <ExternalDescriptionLink
          url={data.hostedUrl}
          completeness={data.description.completeness}
        />
      </div>
    ),
    Requirements: <RequirementsTab data={data} />,
    Sponsorship: <SponsorshipTab data={data} />,
    Source: <SourceTab data={data} />,
  };

  return (
    <>
      <div className="space-y-4">
        {backButton}

        {/* MAIN CARD */}
        <article className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6 shadow-sm dark:border-border-subtle dark:bg-bg-secondary">
          {/* Top Full-Width Heading Section */}
          <div className="w-full">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold tracking-wider text-emerald-800 uppercase dark:bg-emerald-950/60 dark:text-emerald-300">
                {data.job.freshness}
              </span>
              <span className="text-xs text-neutral-500 dark:text-text-tertiary font-medium">
                {posted ? `Posted ${posted}` : "Posting date not stated"}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-neutral-900 dark:text-text-primary uppercase break-words">
              {data.job.title}
            </h2>
            <p className="mt-1 text-xs sm:text-sm font-semibold text-neutral-500 dark:text-text-secondary">
              {data.job.company.displayName}
              {data.job.location ? ` | ${data.job.location}` : ""}
            </p>
          </div>

          {/* Action Buttons: Below Heading, Above Tabs (Single Line on Desktop, Stacked on Mobile) */}
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:w-auto">
            {applyUrl && (
              <a
                href={applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${data.applicationUrl ? "Apply for" : "View the original advert for"} ${data.job.title}`}
                className="h-10 px-5 bg-accent-purple text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-sm transition hover:bg-accent-purple/90 whitespace-nowrap"
              >
                <span>
                  {data.applicationUrl
                    ? "Apply on employer site"
                    : "View the original advert"}
                </span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            )}
            <button
              type="button"
              onClick={() => onSave(data.job.id, isSaved)}
              disabled={saving}
              aria-pressed={isSaved}
              className="h-10 px-5 bg-white border border-neutral-200 text-neutral-800 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-neutral-50 disabled:opacity-60 dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary whitespace-nowrap"
            >
              <Bookmark
                className="h-3.5 w-3.5 shrink-0"
                fill={isSaved ? "currentColor" : "none"}
              />
              {isSaved ? "Saved" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setMatchModalOpen(true)}
              className="h-10 px-5 bg-sky-50 border border-sky-200/80 text-sky-700 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-sky-100 transition dark:border-sky-800/40 dark:bg-sky-950/40 dark:text-sky-300 whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-500 shrink-0" />
              Check match
            </button>
          </div>

          {/* Sub-tabs bar */}
          <div
            ref={tabsRef}
            role="tablist"
            aria-label="Vacancy detail sections"
            onKeyDown={onTabKeyDown}
            className="mt-6 flex overflow-x-auto border-b border-neutral-200 dark:border-border-subtle"
          >
            {visibleTabs.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                data-tab={item}
                id={`job-tab-${item.replace(/\s/g, "-")}`}
                aria-selected={tab === item}
                aria-controls="job-tab-panel"
                tabIndex={tab === item ? 0 : -1}
                onClick={() => setTab(item)}
                className={`min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold transition-colors ${
                  tab === item
                    ? "border-accent-purple text-accent-purple"
                    : "border-transparent text-neutral-500 hover:text-neutral-900 dark:text-text-secondary dark:hover:text-text-primary"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          {/* Tab panel content */}
          <div
            role="tabpanel"
            id="job-tab-panel"
            aria-labelledby={`job-tab-${tab.replace(/\s/g, "-")}`}
            className="pt-5"
          >
            {panels[tab]}
          </div>
        </article>
      </div>

      <CheckMatchModal
        open={matchModalOpen}
        onClose={() => setMatchModalOpen(false)}
        jobId={data.job.id}
        jobTitle={data.job.title}
        companyName={data.job.company.displayName}
        descriptionCompleteness={data.description.completeness}
        // The PROVIDER's text, so the modal can show it as the partial excerpt
        // and refuse a paste that is merely the same teaser returned.
        providerDescription={data.providerDescription}
        // A saved paste changes the active description, its hash and the
        // intelligence derived from it, so the panel refetches rather than
        // continuing to render a stale completeness verdict.
        onDescriptionSaved={() => setRetry((value) => value + 1)}
        availableCareerTracks={data.availableCareerTracks}
        hostedUrl={data.hostedUrl}
        applicationUrl={data.applicationUrl}
      />
    </>
  );
}
