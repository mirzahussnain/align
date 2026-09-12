"use client";

import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  BoardFrame,
  Card,
  JobSkeletons,
  Notice,
  SponsorEvidenceLine,
} from "@/features/job-board/components/board-chrome";
import { JobResultCard } from "@/features/job-board/components/JobResultCard";
import { JobDetailsPanel } from "@/features/job-board/components/JobDetailsPanel";
import { JobLoader } from "@/shared/components/ui/JobLoader";
import { JobDetailModal } from "@/shared/components/ui/JobDetailModal";
import {
  dateLabel,
  humanise,
  sourceHealthLabels,
} from "@/features/job-board/lib/format";
import {
  DEFAULT_FILTERS,
  JOB_BOARD_ROUTES,
  filtersToApi,
  filtersToUrl,
  hasDegradedProviders,
  parseDiscoverFilters,
  readJson,
  type CareerTrack,
  type CompanyViewModel,
  type CompanySponsorHistoryViewModel,
  type DiscoverFilters,
  type JobCardViewModel,
  type Page,
  type SearchMeta,
  type SearchResponse,
  type SponsorStatus,
} from "@/features/job-board/lib/job-board";

export { JobResultCard } from "@/features/job-board/components/JobResultCard";

const PAGE_SIZE = 15;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

function useSaveMutation(onChange: (id: string, saved: boolean) => void) {
  const pendingRef = useRef(new Set<string>());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (id: string, saved: boolean, profileId?: string) => {
      if (pendingRef.current.has(id)) return;
      pendingRef.current.add(id);
      setPending(new Set(pendingRef.current));
      setError(null);
      onChange(id, !saved);
      try {
        await readJson(
          `/api/jobs/${encodeURIComponent(id)}/save`,
          saved
            ? { method: "DELETE" }
            : {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(profileId ? { profileId } : {}),
              },
        );
      } catch (caught) {
        onChange(id, saved);
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to update saved jobs.",
        );
      } finally {
        pendingRef.current.delete(id);
        setPending(new Set(pendingRef.current));
      }
    },
    [onChange],
  );

  return { mutate, pending, error };
}

function useDialogFocus(onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      returnFocusRef.current?.focus();
    };
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { dialogRef, onKeyDown };
}

function FilterDialog({
  filters,
  onChange,
  onClose,
  onApply,
}: {
  filters: DiscoverFilters;
  onChange: (filters: DiscoverFilters) => void;
  onClose: () => void;
  onApply: () => void;
}) {
  const { dialogRef, onKeyDown } = useDialogFocus(onClose);
  const update = <K extends keyof DiscoverFilters>(
    key: K,
    value: DiscoverFilters[K],
  ) => onChange({ ...filters, [key]: value });
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-title"
      ref={dialogRef}
      onKeyDown={onKeyDown}
    >
      <div className="max-h-[85vh] w-full max-w-lg sm:max-w-xl overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-2xl border border-neutral-200 dark:border-border-subtle dark:bg-bg-secondary">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-border-subtle">
          <h2 id="filter-title" className="text-base sm:text-lg font-bold text-neutral-900 dark:text-text-primary">
            More filters
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="h-8 w-8 rounded-lg flex items-center justify-center text-neutral-400 hover:bg-neutral-100 dark:hover:bg-bg-tertiary dark:text-text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-neutral-700 dark:text-text-secondary">
            Workplace
            <select
              value={filters.workplace}
              onChange={(event) =>
                update(
                  "workplace",
                  event.target.value as DiscoverFilters["workplace"],
                )
              }
              className="mt-1 w-full h-9 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-purple dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
            >
              <option value="all">Any workplace</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
              <option value="ONSITE">Onsite</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-neutral-700 dark:text-text-secondary">
            Employment type
            <select
              value={filters.employmentType}
              onChange={(event) =>
                update(
                  "employmentType",
                  event.target.value as DiscoverFilters["employmentType"],
                )
              }
              className="mt-1 w-full h-9 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-purple dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
            >
              <option value="all">Any type</option>
              <option value="permanent">Permanent</option>
              <option value="contract">Contract</option>
              <option value="temporary">Temporary</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-neutral-700 dark:text-text-secondary">
            Minimum salary
            <input
              inputMode="numeric"
              value={filters.salaryMin}
              onChange={(event) =>
                update(
                  "salaryMin",
                  event.target.value.replace(/\D/g, "").slice(0, 7),
                )
              }
              placeholder="e.g. 40000"
              className="mt-1 w-full h-9 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-purple dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-700 dark:text-text-secondary">
            Freshness
            <select
              value={filters.freshness}
              onChange={(event) =>
                update(
                  "freshness",
                  event.target.value as DiscoverFilters["freshness"],
                )
              }
              className="mt-1 w-full h-9 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-purple dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
            >
              <option value="">Any date</option>
              <option value="1">Past day</option>
              <option value="7">Past week</option>
              <option value="30">Past month</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-neutral-700 dark:text-text-secondary sm:col-span-2">
            Sponsor-register evidence
            <select
              value={filters.sponsorStatus}
              onChange={(event) =>
                update(
                  "sponsorStatus",
                  event.target.value as DiscoverFilters["sponsorStatus"],
                )
              }
              className="mt-1 w-full h-9 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-purple dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
            >
              <option value="all">Any evidence</option>
              <option value="registered">Employer matched</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-end gap-2 border-t border-neutral-100 pt-3 dark:border-border-subtle">
          <button
            type="button"
            onClick={() =>
              onChange({
                ...filters,
                workplace: "all",
                employmentType: "all",
                salaryMin: "",
                freshness: "",
                sponsorStatus: "all",
              })
            }
            className="h-9 rounded-xl border border-neutral-200 px-3 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-border-subtle dark:text-text-secondary dark:hover:bg-bg-tertiary"
          >
            Clear secondary filters
          </button>
          <button
            type="button"
            onClick={onApply}
            className="h-9 rounded-xl bg-accent-purple px-4 text-xs font-semibold text-white hover:bg-accent-purple/90 transition shadow-sm"
          >
            Apply filters
          </button>
        </div>
      </div>
    </div>
  );
}

const freshnessLabel = (value: DiscoverFilters["freshness"]) =>
  value === "1"
    ? "Past day"
    : value === "7"
      ? "Past week"
      : value === "30"
        ? "Past month"
        : "Any time";

/**
 * Every secondary filter is shown, defaults included, so the applied search is
 * legible without opening the dialog. Chips read applied state, never the
 * unsubmitted draft, and clearing one applies immediately.
 */
function FilterChips({
  filters,
  onClear,
  onClearAll,
}: {
  filters: DiscoverFilters;
  onClear: (key: keyof DiscoverFilters) => void;
  onClearAll: () => void;
}) {
  const chips: Array<[keyof DiscoverFilters, string, string, boolean]> = [
    [
      "salaryMin",
      "Salary",
      filters.salaryMin
        ? `£${Number(filters.salaryMin).toLocaleString("en-GB")}+`
        : "Any",
      Boolean(filters.salaryMin),
    ],
    [
      "workplace",
      "Work style",
      filters.workplace === "all" ? "Any" : (humanise(filters.workplace) ?? ""),
      filters.workplace !== "all",
    ],
    [
      "employmentType",
      "Employment",
      filters.employmentType === "all"
        ? "Any"
        : (humanise(filters.employmentType) ?? ""),
      filters.employmentType !== "all",
    ],
    [
      "freshness",
      "Freshness",
      freshnessLabel(filters.freshness),
      Boolean(filters.freshness),
    ],
    [
      "sponsorStatus",
      "Sponsor evidence",
      filters.sponsorStatus === "all" ? "Any" : "Register match",
      filters.sponsorStatus !== "all",
    ],
  ];

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {chips.map(([key, label, value, active]) => (
        <span
          key={key}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
            active
              ? "border-accent-purple/30 bg-purple-50 font-semibold text-accent-purple dark:border-accent-purple/40 dark:bg-accent-purple/10"
              : "border-neutral-200/80 bg-neutral-50 text-neutral-600 dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-secondary"
          }`}
        >
          <span className="font-normal text-neutral-500 dark:text-text-tertiary">
            {label}:
          </span>
          <span className="font-semibold">{value}</span>
          <button
            type="button"
            onClick={() => onClear(key)}
            aria-label={`Clear ${label.toLowerCase()} filter`}
            className="rounded p-0.5 hover:bg-neutral-200/70 dark:hover:bg-bg-secondary"
          >
            <X className="h-3 w-3 text-neutral-400 hover:text-neutral-700 dark:hover:text-text-primary" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-auto text-xs font-semibold text-accent-purple hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}

function Pagination({
  pageCount,
  pageIndex,
  hasMore,
  busy,
  onSelect,
  onNext,
}: {
  pageCount: number;
  pageIndex: number;
  hasMore: boolean;
  busy: boolean;
  onSelect: (index: number) => void;
  onNext: () => void;
}) {
  if (pageCount <= 1 && !hasMore) return null;
  return (
    <nav
      aria-label="Results pages"
      className="mt-5 flex items-center justify-center gap-1.5"
    >
      <button
        type="button"
        onClick={() => onSelect(pageIndex - 1)}
        disabled={pageIndex === 0}
        aria-label="Previous page"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 dark:border-border-subtle dark:bg-bg-secondary dark:text-text-secondary"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      {Array.from({ length: pageCount }, (_, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onSelect(index)}
          aria-current={index === pageIndex ? "page" : undefined}
          aria-label={`Page ${index + 1}`}
          className={`h-8 min-w-8 rounded-lg border px-2 text-xs font-semibold ${
            index === pageIndex
              ? "border-accent-purple bg-accent-purple/10 text-accent-purple"
              : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-border-subtle dark:bg-bg-secondary dark:text-text-secondary"
          }`}
        >
          {index + 1}
        </button>
      ))}
      {hasMore && (
        <span
          aria-hidden
          className="px-1 text-xs text-neutral-400 dark:text-text-tertiary"
        >
          …
        </span>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={busy || (!hasMore && pageIndex === pageCount - 1)}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 dark:border-border-subtle dark:bg-bg-secondary dark:text-text-primary"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Next
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </nav>
  );
}

type GlobalJobPagesCache = {
  filterKey: string;
  pages: JobCardViewModel[][];
  meta: SearchMeta;
  hasMore: boolean;
  sessionId?: string;
};

// Stored on globalThis so it survives Next.js client-side navigations but is
// reset on full-page reloads. Using a named property avoids Turbopack issues
// with HMR re-evaluating module-level mutable `let` bindings.
declare global {
  // eslint-disable-next-line no-var
  var __alignJobPagesCache: GlobalJobPagesCache | null | undefined;
}

const getCache = () => globalThis.__alignJobPagesCache ?? null;
const setCache = (v: GlobalJobPagesCache | null) => {
  globalThis.__alignJobPagesCache = v;
};

export function DiscoverBoard({
  initialJobSnapshotId,
}: { initialJobSnapshotId?: string } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const serialized = searchParams.toString();
  const filters = useMemo(
    () => parseDiscoverFilters(new URLSearchParams(serialized)),
    [serialized],
  );
  const [draft, setDraft] = useState(filters);
  const [tracks, setTracks] = useState<CareerTrack[]>([]);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  // Pages are kept client-side so the numbered control can step back over
  // results the cursor-forward search API cannot re-request.
  const [pages, setPages] = useState<JobCardViewModel[][]>(() => getCache()?.pages ?? []);
  const pagesRef = useRef<JobCardViewModel[][]>(getCache()?.pages ?? []);
  const [pageIndex, setPageIndex] = useState(0);
  const [meta, setMeta] = useState<SearchMeta>(getCache()?.meta ?? {});
  const [loading, setLoading] = useState(() => !(getCache()?.pages.length));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(getCache()?.hasMore ?? false);
  /** Set when a continuation returned no unseen vacancies. */
  const [exhausted, setExhausted] = useState(false);
  const [sessionRestarted, setSessionRestarted] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mobileAdvancedOpen, setMobileAdvancedOpen] = useState(false);
  const urlSelectedId = useMemo(() => {
    const prefix = `${JOB_BOARD_ROUTES.discover}/`;
    if (!pathname.startsWith(prefix)) return undefined;
    const remainder = pathname.slice(prefix.length);
    if (
      !remainder ||
      remainder.includes("/") ||
      remainder === "saved" ||
      remainder === "companies"
    )
      return undefined;
    try {
      return decodeURIComponent(remainder);
    } catch {
      return undefined;
    }
  }, [pathname]);

  const [activeJobSnapshotId, setActiveJobSnapshotId] = useState<string | undefined>(initialJobSnapshotId);

  useEffect(() => {
    if (urlSelectedId !== undefined) {
      setActiveJobSnapshotId(urlSelectedId);
    }
  }, [urlSelectedId]);

  useEffect(() => {
    const handlePopState = () => {
      const currentPath = window.location.pathname;
      const prefix = `${JOB_BOARD_ROUTES.discover}/`;
      if (currentPath.startsWith(prefix)) {
        const remainder = currentPath.slice(prefix.length);
        if (
          remainder &&
          !remainder.includes("/") &&
          remainder !== "saved" &&
          remainder !== "companies"
        ) {
          try {
            setActiveJobSnapshotId(decodeURIComponent(remainder));
            return;
          } catch {}
        }
      }
      setActiveJobSnapshotId(undefined);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const selectedJobSnapshotId = activeJobSnapshotId;
  const initialFiltersRef = useRef(filters);
  const initialDetailsRef = useRef(Boolean(initialJobSnapshotId));
  const defaultSearchQueryRef = useRef<string>("");
  const sessionRef = useRef<string | undefined>(undefined);
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const prefetchRef = useRef<
    { sessionId: string; response: SearchResponse } | undefined
  >(undefined);
  const prefetchControllerRef = useRef<AbortController | undefined>(undefined);

  const cancelPrefetch = useCallback(() => {
    prefetchControllerRef.current?.abort();
    prefetchControllerRef.current = undefined;
    prefetchRef.current = undefined;
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setDraft(filters);
    });
    return () => {
      active = false;
    };
  }, [filters]);

  useEffect(() => {
    let active = true;
    readJson<{
      profiles?: CareerTrack[];
      defaultSearch: { query: string; location: string };
    }>("/api/jobs/bootstrap")
      .then((data) => {
        if (!active) return;
        const available = data.profiles ?? [];
        setTracks(available);
        const fallbackQuery = data.defaultSearch?.query || "IT Support Technician";
        defaultSearchQueryRef.current = fallbackQuery;
        const initialFilters = initialFiltersRef.current;

        if (!initialFilters.query) {
          setDraft((prev) => ({
            ...prev,
            query: fallbackQuery,
            location: prev.location || data.defaultSearch?.location || "",
          }));
        }

        setBootstrapReady(true);

        if (
          initialFilters.careerTrackId &&
          !available.some(
            (track) => track.profileId === initialFilters.careerTrackId,
          )
        ) {
          const repaired = filtersToUrl({
            ...initialFilters,
            careerTrackId: "",
          });
          router.replace(`${JOB_BOARD_ROUTES.discover}?${repaired}`);
        } else if (!initialFilters.query && !initialDetailsRef.current) {
          const defaults = filtersToUrl({
            ...initialFilters,
            query: fallbackQuery,
            location: data.defaultSearch?.location || "",
          });
          router.replace(`${JOB_BOARD_ROUTES.discover}?${defaults}`);
        }
      })
      .catch(() => setBootstrapReady(true));
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (
      bootstrapReady &&
      filters.careerTrackId &&
      !tracks.some((track) => track.profileId === filters.careerTrackId)
    ) {
      const repaired = filtersToUrl({ ...filters, careerTrackId: "" });
      router.replace(`${JOB_BOARD_ROUTES.discover}?${repaired}`);
    }
  }, [bootstrapReady, filters, router, tracks]);

  const lastLoadedFiltersKey = useRef<string>("");

  const load = useCallback(
    async (more = false, force = false) => {
      if (!bootstrapReady) return;
      const activeQuery =
        filters.query.trim() || draft.query.trim() || defaultSearchQueryRef.current || "IT Support Technician";

      const effectiveFilters = filters.query.trim()
        ? filters
        : { ...filters, query: activeQuery, location: filters.location || draft.location };

      const filterKey = `${effectiveFilters.query}_${effectiveFilters.location}_${effectiveFilters.workplace}_${effectiveFilters.employmentType}_${effectiveFilters.sponsorStatus}_${effectiveFilters.sort}_${effectiveFilters.careerTrackId}_${effectiveFilters.salaryMin}_${effectiveFilters.freshness}`;

      // Prevent job list from re-fetching or flickering into loading state when simply selecting a job card
      if (!more && !force && pagesRef.current.length > 0 && lastLoadedFiltersKey.current === filterKey) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      lastLoadedFiltersKey.current = filterKey;

      const requestId = ++requestRef.current;
      controllerRef.current?.abort();
      if (!more) cancelPrefetch();
      const controller = new AbortController();
      controllerRef.current = controller;
      if (more || pagesRef.current.length) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const prefetched =
          more &&
          !force &&
          prefetchRef.current &&
          prefetchRef.current.sessionId === sessionRef.current
            ? prefetchRef.current.response
            : undefined;
        prefetchRef.current = undefined;

        const params = filtersToApi(
          effectiveFilters,
          more ? sessionRef.current : undefined,
        );
        if (force) params.set("refresh", "true");
        const result =
          prefetched ??
          (await readJson<SearchResponse>(`/api/jobs?${params}`, {
            signal: controller.signal,
          }));
        if (requestId !== requestRef.current) return;
        if (result.jobs.some((job) => !job.id))
          throw new Error(
            "A vacancy was returned without a durable snapshot id.",
          );
        const seen = more
          ? new Set(pagesRef.current.flat().map((job) => job.id))
          : new Set<string>();
        const page = result.jobs.filter((job) => !seen.has(job.id));
        setMeta(result.meta);
        sessionRef.current = result.sessionId;
        // A continuation that yields nothing new is the end of the results, not
        // a blank page to navigate onto.
        if (more && !page.length) {
          setHasMore(false);
          setExhausted(true);
          return;
        }
        const next = more ? [...pagesRef.current, page] : [page];
        pagesRef.current = next;
        setPages(next);
        setPageIndex(next.length - 1);
        setExhausted(false);
        // Authoritative only. A full page says nothing about whether the
        // providers behind it have more, and inferring "more" from the page size
        // is how a Next button came to be offered over an empty continuation.
        const moreAvailable = result.meta.hasMore === true;
        setHasMore(moreAvailable);
        setCache({
          filterKey,
          pages: next,
          meta: result.meta,
          hasMore: moreAvailable,
          sessionId: result.sessionId,
        });
      } catch (caught) {
        if (
          (caught as Error).name !== "AbortError" &&
          requestId === requestRef.current
        ) {
          // The search API refuses to answer a continuation whose session it
          // cannot place, precisely so the user is never served page one under
          // a "Next" button. Restarting the search is the documented recovery.
          if ((caught as { code?: string }).code === "SEARCH_SESSION_EXPIRED") {
            sessionRef.current = undefined;
            setCache(null);
            setSessionRestarted(true);
            setReloadToken((token) => token + 1);
            return;
          }
          setError(
            caught instanceof Error ? caught.message : "Unable to load jobs.",
          );
        }
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [bootstrapReady, cancelPrefetch, filters],
  );

  /**
   * Warm page two once page one has rendered.
   *
   * Conditions are all required, and each rules out a way this could waste work
   * or mislead. `meta.hasMore` must be authoritative-true — never inferred from
   * the page size. A session id must exist, or the request would start a fresh
   * search rather than continue this one. The user must still be on page one, so
   * a back-navigation does not re-prefetch a page already held. And it waits for
   * browser idle, so it never competes with the render it follows.
   *
   * Exactly ONE page ahead. Prefetching the remaining pages would spend the
   * providers' rate limit on results most sessions never reach.
   */
  useEffect(() => {
    if (!meta.hasMore) return;
    if (!sessionRef.current) return;
    if (pageIndex !== pages.length - 1) return;
    if (prefetchRef.current || prefetchControllerRef.current) return;
    if (loading || refreshing) return;
    // Respect a user who has asked the browser to conserve data.
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (connection?.saveData) return;

    const sessionId = sessionRef.current;
    const controller = new AbortController();
    prefetchControllerRef.current = controller;

    const run = () => {
      if (controller.signal.aborted) return;
      const params = filtersToApi(filters, sessionId);
      readJson<SearchResponse>(`/api/jobs?${params}`, {
        signal: controller.signal,
      })
        .then((response) => {
          // The session must still be the one we asked about; a filter change
          // between scheduling and landing invalidates the answer.
          if (controller.signal.aborted || sessionRef.current !== sessionId)
            return;
          prefetchRef.current = { sessionId, response };
        })
        .catch(() => {
          // A failed prefetch is silent by design: nothing was promised to the
          // user, and "Next" will simply make the request itself.
        })
        .finally(() => {
          if (prefetchControllerRef.current === controller)
            prefetchControllerRef.current = undefined;
        });
    };

    // `requestIdleCallback` is absent on Safari before 17, so the timeout is a
    // real fallback rather than a formality.
    const useIdle = typeof window.requestIdleCallback === "function";
    const handle = useIdle
      ? window.requestIdleCallback(run, { timeout: 2_000 })
      : window.setTimeout(run, 400);

    return () => {
      controller.abort();
      if (prefetchControllerRef.current === controller)
        prefetchControllerRef.current = undefined;
      if (useIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [filters, loading, meta.hasMore, pageIndex, pages.length, refreshing]);

  // `reloadToken` is what a session-expiry recovery bumps, so the restart runs
  // through the same single entry point as a filter change.
  useEffect(() => {
    let active = true;
    sessionRef.current = undefined;
    pagesRef.current = [];
    cancelPrefetch();
    queueMicrotask(() => {
      if (active) load();
    });
    return () => {
      active = false;
      controllerRef.current?.abort();
    };
  }, [cancelPrefetch, load, reloadToken]);

  const onSaved = useCallback((id: string, saved: boolean) => {
    pagesRef.current = pagesRef.current.map((page) =>
      page.map((job) => (job.id === id ? { ...job, saved } : job)),
    );
    setPages(pagesRef.current);
    const cache = getCache();
    if (cache) {
      setCache({ ...cache, pages: pagesRef.current });
    }
  }, []);
  const save = useSaveMutation(onSaved);

  const visible = pages[pageIndex] ?? [];
  const selected = pages
    .flat()
    .find((job) => job.id === selectedJobSnapshotId);

  // Both entry points a user has for starting a search over. Clearing the
  // continuation notices here, rather than inside `load`, keeps the restart the
  // expiry recovery performs from wiping the message explaining it.
  const resetContinuationNotices = () => {
    setExhausted(false);
    setSessionRestarted(false);
  };
  const applyFilters = (next: DiscoverFilters) => {
    setFilterOpen(false);
    sessionRef.current = undefined;
    setCache(null);
    cancelPrefetch();
    resetContinuationNotices();
    router.push(`${JOB_BOARD_ROUTES.discover}?${filtersToUrl(next)}`);
  };
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    applyFilters(draft);
  };
  const select = (id: string) => {
    const targetUrl = `${JOB_BOARD_ROUTES.details(id)}${serialized ? `?${serialized}` : ""}`;
    window.history.pushState(null, "", targetUrl);
    setActiveJobSnapshotId(id);
  };

  const closeDetails = () => {
    const targetUrl = `${JOB_BOARD_ROUTES.discover}${serialized ? `?${serialized}` : ""}`;
    window.history.pushState(null, "", targetUrl);
    setActiveJobSnapshotId(undefined);
  };

  return (
    <BoardFrame
      action={
        <button
          type="button"
          onClick={() => {
            resetContinuationNotices();
            load(false, true);
          }}
          disabled={loading || refreshing}
          className="my-2 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-60 dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      }
    >
      <div className={selectedJobSnapshotId ? "hidden lg:block" : ""}>
        <form
          onSubmit={submit}
          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-border-subtle dark:bg-bg-secondary"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(12rem,1.2fr)_minmax(10rem,1fr)_minmax(11rem,1fr)_auto]">
            {/* Field 1: Role or Keyword */}
            <label className="text-xs font-semibold text-neutral-600 dark:text-text-secondary">
              Role or keyword
              <span className="relative mt-1 block">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  value={draft.query}
                  onChange={(event) =>
                    setDraft({ ...draft, query: event.target.value })
                  }
                  placeholder="e.g. IT Analyst"
                  style={{ paddingLeft: "2.75rem" }}
                  className="w-full rounded-xl !pl-11 pr-3.5 py-2.5 text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-accent-purple/30 dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
                />
              </span>
            </label>

            {/* Field 2: Location */}
            <label className="text-xs font-semibold text-neutral-600 dark:text-text-secondary">
              Location
              <span className="relative mt-1 block">
                <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  value={draft.location}
                  onChange={(event) =>
                    setDraft({ ...draft, location: event.target.value })
                  }
                  placeholder="City or region"
                  style={{ paddingLeft: "2.75rem" }}
                  className="w-full rounded-xl !pl-11 pr-3.5 py-2.5 text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-accent-purple/30 dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
                />
              </span>
            </label>

            {/* Field 3: Career Track (Hidden on mobile unless expanded) */}
            <label
              className={`text-xs font-semibold text-neutral-600 dark:text-text-secondary ${
                mobileAdvancedOpen ? "block" : "hidden md:block"
              }`}
            >
              Career Track
              <select
                value={draft.careerTrackId}
                onChange={(event) =>
                  setDraft({ ...draft, careerTrackId: event.target.value })
                }
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-purple/30 dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
              >
                <option value="">Select a Career Track</option>
                {tracks.map((track) => (
                  <option key={track.profileId} value={track.profileId}>
                    {track.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Action Buttons */}
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={!draft.query.trim()}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-accent-purple px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-purple/90 disabled:opacity-60"
              >
                <Search className="h-4 w-4" />
                Search
              </button>

              {/* Filters Button */}
              <button
                type="button"
                onClick={() => {
                  setFilterOpen(true);
                  setMobileAdvancedOpen((prev) => !prev);
                }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
              </button>
            </div>
          </div>

          {/* Filter Chips: Hidden on mobile unless expanded */}
          <div className={mobileAdvancedOpen ? "block" : "hidden md:block"}>
            <FilterChips
              filters={filters}
              onClear={(key) =>
                applyFilters({ ...filters, [key]: DEFAULT_FILTERS[key] })
              }
              onClearAll={() =>
                applyFilters({
                  ...DEFAULT_FILTERS,
                  query: filters.query,
                  location: filters.location,
                  careerTrackId: filters.careerTrackId,
                  sort: filters.sort,
                })
              }
            />
          </div>
        </form>
      </div>

      <div className="mt-4 space-y-3">
        {hasDegradedProviders(meta) && (
          <Notice tone="warning">
            Some job sources are temporarily unavailable. The results shown may
            be incomplete.
          </Notice>
        )}
        {meta.cached && (
          <Notice>
            Showing {meta.cacheState === "STALE" ? "stale cached" : "cached"}{" "}
            results{refreshing ? " while refreshing." : "."}
          </Notice>
        )}
        {sessionRestarted && (
          <Notice tone="warning">
            Your search session expired, so these results were reloaded from the
            first page. Paging beyond the first page needs a configured cache
            (REDIS_URL).
          </Notice>
        )}
        {exhausted && (
          <Notice>
            No further vacancies were returned for this search. Broaden the role,
            location or filters to see more.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {save.error && <Notice tone="error">{save.error}</Notice>}
      </div>

      <div
        className={
          selectedJobSnapshotId
            ? "mt-4 grid items-start gap-5 min-w-0 w-full grid-cols-1 md:grid-cols-12"
            : "mt-4 grid items-start gap-5 min-w-0 w-full grid-cols-1"
        }
      >
        <section
          aria-label="Job results"
          className={
            selectedJobSnapshotId
              ? "block min-w-0 w-full md:col-span-5 lg:col-span-4"
              : "block min-w-0 w-full md:col-span-12"
          }
        >
          <div
            className="mb-3 flex items-center justify-between gap-2 min-w-0"
            aria-live="polite"
          >
            <span className="text-xs sm:text-sm font-medium text-neutral-600 dark:text-text-secondary truncate">
              {visible.length} results
              {refreshing && (
                <Loader2 className="ml-1.5 inline h-3.5 w-3.5 animate-spin align-[-2px]" />
              )}
            </span>
            <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-text-tertiary shrink-0">
              Sort by:
              <select
                value={filters.sort}
                onChange={(event) =>
                  applyFilters({
                    ...filters,
                    sort: event.target.value as DiscoverFilters["sort"],
                  })
                }
                aria-label="Sort results"
                className="h-9 px-2.5 py-1 text-xs font-medium text-neutral-800 rounded-lg border border-neutral-200 bg-neutral-50/80 focus:outline-none focus:ring-2 focus:ring-accent-purple/30 dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary shrink-0 min-w-0 max-w-[130px] sm:max-w-none"
              >
                <option value="relevance">Relevance</option>
                <option value="date">Most recent</option>
                <option value="salary_desc">Salary: high to low</option>
                <option value="salary_asc">Salary: low to high</option>
              </select>
            </label>
          </div>
          {loading && !pages.length ? (
            selectedJobSnapshotId ? (
              <div className="flex h-64 items-center justify-center rounded-2xl border border-neutral-200 bg-white/50 dark:border-border-subtle dark:bg-bg-secondary/30">
                <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
              </div>
            ) : (
              <JobLoader message="Your Jobs are on the way" />
            )
          ) : visible.length ? (
            <>
              <div className="space-y-3">
                {visible.map((job) => (
                  <JobResultCard
                    key={job.id}
                    job={job}
                    selected={job.id === selectedJobSnapshotId}
                    careerTrackId={filters.careerTrackId}
                    onSelect={() => select(job.id)}
                    onSave={() =>
                      save.mutate(
                        job.id,
                        job.saved,
                        filters.careerTrackId || undefined,
                      )
                    }
                    saving={save.pending.has(job.id)}
                  />
                ))}
              </div>
              <Pagination
                pageCount={pages.length}
                pageIndex={pageIndex}
                hasMore={hasMore}
                busy={refreshing}
                onSelect={setPageIndex}
                onNext={() =>
                  pageIndex < pages.length - 1
                    ? setPageIndex(pageIndex + 1)
                    : load(true)
                }
              />
            </>
          ) : !error ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-border-subtle">
              {filters.query ? (
                "No jobs matched these filters. Try broadening the role, location or workplace settings."
              ) : (
                <div className="space-y-2">
                  <p className="font-semibold text-neutral-800 dark:text-text-primary">
                    Find Your Next Role
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-text-secondary">
                    Enter a job title or location in the search bar above to discover vacancies.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </section>

        {/* Desktop Side Window Panel */}
        {!isMobile && (
          <section
            aria-label="Selected job details"
            className={
              selectedJobSnapshotId
                ? "block md:sticky md:top-20 md:col-span-7 lg:col-span-8 min-w-0 w-full"
                : "hidden"
            }
          >
            <JobDetailsPanel
              key={selectedJobSnapshotId ?? "no-selection"}
              jobSnapshotId={selectedJobSnapshotId}
              saved={selected?.saved}
              onSaved={onSaved}
              onBack={closeDetails}
              onSave={(id, isSaved) =>
                save.mutate(id, isSaved, filters.careerTrackId || undefined)
              }
              saving={
                selectedJobSnapshotId
                  ? save.pending.has(selectedJobSnapshotId)
                  : false
              }
            />
          </section>
        )}
      </div>

      {/* Mobile Screen Modal Panel */}
      {selectedJobSnapshotId && isMobile && (
        <div className="lg:hidden">
          <JobDetailModal
            open={Boolean(selectedJobSnapshotId)}
            onClose={closeDetails}
            title={selected?.title || "Job Details"}
          >
            <JobDetailsPanel
              key={`mobile-${selectedJobSnapshotId}`}
              jobSnapshotId={selectedJobSnapshotId}
              saved={selected?.saved}
              onSaved={onSaved}
              onBack={closeDetails}
              onSave={(id, isSaved) =>
                save.mutate(id, isSaved, filters.careerTrackId || undefined)
              }
              saving={
                selectedJobSnapshotId
                  ? save.pending.has(selectedJobSnapshotId)
                  : false
              }
            />
          </JobDetailModal>
        </div>
      )}

      {filterOpen && (
        <FilterDialog
          filters={draft}
          onChange={setDraft}
          onClose={() => setFilterOpen(false)}
          onApply={() => applyFilters(draft)}
        />
      )}
    </BoardFrame>
  );
}

export function JobDetailsBoard({ jobSnapshotId }: { jobSnapshotId: string }) {
  return <DiscoverBoard initialJobSnapshotId={jobSnapshotId} />;
}

type SavedJobRow = {
  id: string;
  savedAt: string;
  availability: string;
  job: JobCardViewModel;
};

export function SavedBoard() {
  const router = useRouter();
  const [data, setData] = useState<Page<SavedJobRow> | null>(null);
  const optimisticallyRemoved = useRef(new Map<string, SavedJobRow>());
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const load = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    try {
      const result = await readJson<NonNullable<typeof data>>(
        `/api/jobs/saved?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      setData((current) =>
        cursor && current
          ? { ...result, items: [...current.items, ...result.items] }
          : result,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load saved jobs.",
      );
    } finally {
      setLoadingMore(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);
  const onSaved = useCallback((id: string, saved: boolean) => {
    setData((current) => {
      if (!current) return current;
      if (!saved) {
        const removed = current.items.find((row) => row.job.id === id);
        if (removed) optimisticallyRemoved.current.set(id, removed);
        return {
          ...current,
          items: current.items.filter((row) => row.job.id !== id),
        };
      }
      if (current.items.some((row) => row.job.id === id)) return current;
      const restored = optimisticallyRemoved.current.get(id);
      if (!restored) return current;
      optimisticallyRemoved.current.delete(id);
      return {
        ...current,
        items: [
          { ...restored, job: { ...restored.job, saved: true } },
          ...current.items,
        ],
      };
    });
  }, []);
  const save = useSaveMutation(onSaved);
  return (
    <BoardFrame>
      <div className="mt-4 sm:mt-6 space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        {save.error && <Notice tone="error">{save.error}</Notice>}
        {!data ? (
          <JobSkeletons />
        ) : data.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-neutral-500 dark:border-border-subtle">
            Save roles you are considering so you can review and analyse them
            later.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 min-w-0 w-full">
            {data.items.map((row) => (
              <div key={row.id}>
                <JobResultCard
                  job={row.job}
                  availability={row.availability}
                  onSelect={() => router.push(JOB_BOARD_ROUTES.details(row.job.id))}
                  onSave={() => save.mutate(row.job.id, true)}
                  saving={save.pending.has(row.job.id)}
                />
                <p className="px-1 pt-1 text-xs text-neutral-400 dark:text-text-tertiary">
                  Saved {dateLabel(row.savedAt)}
                </p>
              </div>
            ))}
            {data.page.hasMore && data.page.nextCursor && (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => load(data.page.nextCursor)}
                className="min-h-11 rounded-lg border px-4 text-sm font-semibold dark:border-border-subtle"
              >
                {loadingMore ? "Loading…" : "Load more saved jobs"}
              </button>
            )}
          </div>
        )}
      </div>
    </BoardFrame>
  );
}

export function CompaniesBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serialized = searchParams.toString();
  const [data, setData] = useState<Page<CompanyViewModel> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [provider, setProvider] = useState(searchParams.get("provider") ?? "");
  const [industry, setIndustry] = useState(searchParams.get("industry") ?? "");
  const [sponsor, setSponsor] = useState(
    searchParams.get("sponsorStatus") ?? "",
  );
  const [activeOnly, setActiveOnly] = useState(
    searchParams.get("activeJobsOnly") === "true",
  );
  const [sort, setSort] = useState(searchParams.get("sort") ?? "NAME");
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    readJson<Page<CompanyViewModel>>(`/api/companies?${serialized}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!active) return;
        setError(null);
        setData(result);
      })
      .catch((caught) => {
        if (active && (caught as Error).name !== "AbortError")
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load companies.",
          );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [serialized]);
  const loadMore = useCallback(
    async (cursor: string) => {
      setLoadingMore(true);
      try {
        const params = new URLSearchParams(serialized);
        params.set("cursor", cursor);
        const result = await readJson<Page<CompanyViewModel>>(
          `/api/companies?${params}`,
        );
        setError(null);
        setData((current) =>
          current
            ? { ...result, items: [...current.items, ...result.items] }
            : result,
        );
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load companies.",
        );
      } finally {
        setLoadingMore(false);
      }
    },
    [serialized],
  );
  const apply = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (provider) params.set("provider", provider);
    if (industry.trim()) params.set("industry", industry.trim());
    if (sponsor) params.set("sponsorStatus", sponsor);
    if (activeOnly) params.set("activeJobsOnly", "true");
    if (sort !== "NAME") params.set("sort", sort);
    router.push(`${JOB_BOARD_ROUTES.companies}?${params}`);
  };
  return (
    <BoardFrame>
      <div className="mt-4 sm:mt-6 space-y-4">
        <form
        onSubmit={apply}
        className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-border-subtle dark:bg-bg-secondary"
      >
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="text-xs font-semibold text-neutral-700 dark:text-text-secondary">
            Company
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Company name"
              className="mt-1 h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-purple dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-700 dark:text-text-secondary">
            Provider
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-purple dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
            >
              <option value="">All providers</option>
              <option value="GREENHOUSE">Greenhouse</option>
              <option value="LEVER">Lever</option>
              <option value="ASHBY">Ashby</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-neutral-700 dark:text-text-secondary">
            Industry
            <input
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              placeholder="Industry"
              className="mt-1 h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-purple dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-700 dark:text-text-secondary">
            Sponsor evidence
            <select
              value={sponsor}
              onChange={(event) => setSponsor(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-purple dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
            >
              <option value="">Any</option>
              <option value="MATCHED">Matched</option>
              <option value="AMBIGUOUS">Ambiguous</option>
              <option value="NONE">None</option>
              <option value="NOT_CHECKED">Not checked</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-neutral-700 dark:text-text-secondary">
            Sort
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-purple dark:border-border-subtle dark:bg-bg-tertiary dark:text-text-primary"
            >
              <option value="NAME">Name</option>
              <option value="ACTIVE_JOBS">Active vacancies</option>
              <option value="RECENTLY_REFRESHED">Recently refreshed</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="h-9 w-full rounded-xl bg-accent-purple px-4 text-xs font-semibold text-white hover:bg-accent-purple/90 transition shadow-sm"
            >
              Apply filters
            </button>
          </div>
        </div>
        <label className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(event) => setActiveOnly(event.target.checked)}
          />
          Active vacancies only
        </label>
      </form>
      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {!data ? (
        <div className="mt-4">
          <JobSkeletons />
        </div>
      ) : data.items.length === 0 ? (
        // Companies are curated employer records with verified ATS sources, not
        // a by-product of search results. An empty directory is a real state and
        // has to say so, or it is indistinguishable from a failed fetch.
        <div className="mt-4 rounded-2xl border border-dashed border-neutral-300 p-10 text-center dark:border-border-subtle">
          <p className="text-sm font-semibold text-neutral-700 dark:text-text-primary">
            {serialized
              ? "No companies matched these filters."
              : "No employers have been added to the directory yet."}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500 dark:text-text-secondary">
            {serialized
              ? "Clear the filters to see every verified employer."
              : "Companies appear here once an employer record exists and at least one of its ATS job sources has been verified."}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {data.items.map((company) => (
            <article
              key={company.id}
              className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-border-subtle dark:bg-bg-secondary"
            >
              <h2 className="text-lg font-bold">{company.displayName}</h2>
              <p className="mt-1 text-sm text-neutral-500 dark:text-text-secondary">
                {company.industry ?? "Industry not stated"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-md bg-neutral-100 px-2 py-1 dark:bg-bg-tertiary">
                  {company.activeJobCount} active vacancies
                </span>
                <span className="rounded-md bg-neutral-100 px-2 py-1 dark:bg-bg-tertiary">
                  {company.verifiedSourceCount} verified sources
                </span>
              </div>
              <SponsorEvidenceLine
                status={company.sponsorEvidenceSummary.status}
                className="mt-3"
              />
              <p className="mt-3 text-xs text-neutral-400 dark:text-text-tertiary">
                {company.lastRefreshedAt
                  ? `Refreshed ${dateLabel(company.lastRefreshedAt)}`
                  : "Source freshness unavailable"}
              </p>
              <Link
                href={JOB_BOARD_ROUTES.company(company.id)}
                className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent-purple"
              >
                View company
              </Link>
            </article>
          ))}
        </div>
      )}
      {data && data.page.hasMore && data.page.nextCursor && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => loadMore(data.page.nextCursor!)}
            className="min-h-11 rounded-lg border px-4 text-sm font-semibold dark:border-border-subtle"
          >
            {loadingMore ? "Loading…" : "Load more companies"}
          </button>
        </div>
      )}
      </div>
    </BoardFrame>
  );
}

export function CompanyDetailsBoard({
  companyRecordId,
}: {
  companyRecordId: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<{
    company: CompanyViewModel;
    sponsorEvidence: {
      summary: { status: SponsorStatus };
      disclaimer: string;
      matchedOrganisationName?: string;
      registerVersion?: string;
      checkedAt?: string;
    };
    sponsorHistory?: CompanySponsorHistoryViewModel[];
    sources: Array<{ provider: string; health: string }>;
  } | null>(null);
  const [vacancies, setVacancies] = useState<JobCardViewModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.all([
      readJson<NonNullable<typeof data>>(
        `/api/companies/${encodeURIComponent(companyRecordId)}`,
        { signal: controller.signal },
      ),
      readJson<Page<JobCardViewModel>>(
        `/api/companies/${encodeURIComponent(companyRecordId)}/jobs?limit=20`,
        { signal: controller.signal },
      ),
    ])
      .then(([company, jobs]) => {
        if (!active) return;
        setError(null);
        setData(company);
        setVacancies(jobs.items);
      })
      .catch((caught) => {
        if (active && (caught as Error).name !== "AbortError")
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load company.",
          );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [companyRecordId]);
  const onSaved = useCallback(
    (id: string, saved: boolean) =>
      setVacancies((current) =>
        current.map((job) => (job.id === id ? { ...job, saved } : job)),
      ),
    [],
  );
  const save = useSaveMutation(onSaved);
  if (error)
    return (
      <BoardFrame
        title="Company"
        description="Verified employer sources and vacancies."
      >
        <Notice tone="error">{error}</Notice>
      </BoardFrame>
    );
  if (!data)
    return (
      <BoardFrame
        title="Company"
        description="Verified employer sources and vacancies."
      >
        <JobSkeletons />
      </BoardFrame>
    );
  return (
    <BoardFrame
      title={data.company.displayName}
      description={data.company.industry ?? "Industry not stated"}
    >
      <Link
        href={JOB_BOARD_ROUTES.companies}
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-purple"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to companies
      </Link>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,.7fr)]">
        <div>
          <Card title="Company identity">
            <div className="flex flex-wrap gap-3 text-sm">
              {data.company.websiteUrl && (
                <a
                  href={data.company.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-accent-purple"
                >
                  Website <ExternalLink className="h-4 w-4" />
                </a>
              )}
              {data.company.careersUrl && (
                <a
                  href={data.company.careersUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-accent-purple"
                >
                  Careers <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </Card>
          <section className="mt-5">
            <h2 className="mb-3 text-lg font-bold">
              Current canonical vacancies
            </h2>
            {vacancies.length ? (
              <div className="space-y-3">
                {vacancies.map((job) => (
                  <JobResultCard
                    key={job.id}
                    job={job}
                    onSelect={() => router.push(JOB_BOARD_ROUTES.details(job.id))}
                    onSave={() => save.mutate(job.id, job.saved)}
                    saving={save.pending.has(job.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500 dark:border-border-subtle">
                This company has verified job sources, but no usable current
                vacancies were found.
              </div>
            )}
          </section>
        </div>
        <aside className="space-y-4">
          <Card title="Sponsor-register evidence">
            <SponsorEvidenceLine status={data.sponsorEvidence.summary.status} />
            {data.sponsorEvidence.matchedOrganisationName && (
              <p className="mt-2 text-sm font-medium text-neutral-700 dark:text-text-secondary">
                {data.sponsorEvidence.matchedOrganisationName}
              </p>
            )}
            <p className="mt-3 text-xs text-neutral-500 dark:text-text-tertiary">
              {data.sponsorEvidence.disclaimer}
            </p>
          </Card>
          {(data.sponsorHistory?.length ?? 0) > 0 && (
            <Card title="Sponsorship history">
              <div className="space-y-4">
                {data.sponsorHistory?.map((entry) => (
                  <div
                    key={entry.registerVersion}
                    className="border-b border-neutral-100 pb-4 last:border-0 last:pb-0 dark:border-border-subtle"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <SponsorEvidenceLine status={entry.status} />
                      {entry.current && (
                        <span className="rounded-full bg-accent-purple/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-purple">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs font-medium text-neutral-600 dark:text-text-secondary">
                      {entry.registerVersion.startsWith("v2-2026-07-29-")
                        ? "Version 2 · 29 Jul 2026"
                        : `Register ${entry.registerVersion}`}
                    </p>
                    {entry.organisationName && (
                      <p className="mt-1 text-xs text-neutral-500 dark:text-text-tertiary">
                        Matched as {entry.organisationName}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-neutral-400 dark:text-text-tertiary">
                      Checked {dateLabel(entry.checkedAt)}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card title="Source health">
            <div className="space-y-2 text-sm">
              {data.sources.map((source) => (
                <p key={source.provider}>
                  {humanise(source.provider)}
                  {" — "}
                  {sourceHealthLabels[source.health] ??
                    "Temporarily unavailable"}
                </p>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </BoardFrame>
  );
}
