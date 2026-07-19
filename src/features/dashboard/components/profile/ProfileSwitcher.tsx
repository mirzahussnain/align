'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus, Check, Star, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import {
  createProfile,
  deleteProfile,
  setDefaultProfile,
} from '@/features/dashboard/actions/profile-actions';
import { INDUSTRY_IDS } from '@/shared/constants/sector-keywords';
import { SECTOR_LABELS } from '@/shared/constants/sector-labels';
import type { ProfileSummary } from '@/features/dashboard/data/load-profile';

const INDUSTRY_LABELS: Record<string, string> = SECTOR_LABELS;

interface ProfileSwitcherProps {
  profiles: ProfileSummary[];
  activeProfileId: string;
  maxProfiles: number;
}

export default function ProfileSwitcher({
  profiles,
  activeProfileId,
  maxProfiles,
}: ProfileSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [industry, setIndustry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const active = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  const atLimit = profiles.length >= maxProfiles;

  // Switching is a soft navigation so the server reloads that track's content
  // while the dashboard's client-side tab state stays put.
  function switchTo(id: string) {
    setOpen(false);
    router.push(`/dashboard?profile=${id}`);
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createProfile(label, industry || undefined);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreating(false);
      setLabel('');
      setIndustry('');
      router.push(`/dashboard?profile=${result.profileId}`);
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteProfile(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The deleted track may have been the one being viewed, so drop the
      // ?profile= pin and let the server fall back to the default.
      router.push('/dashboard');
      router.refresh();
    });
  }

  function handleSetDefault(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await setDefaultProfile(id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left transition-colors hover:border-neutral-300"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-neutral-900">
            {active?.label ?? 'Default'}
          </span>
          <span className="block text-[10px] text-neutral-400">
            {active ? `${active.completeness}% complete` : 'No profile yet'}
            {profiles.length > 1 && ` · ${profiles.length} profiles`}
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-neutral-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close profile menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div
            role="menu"
            className="absolute left-0 right-0 z-30 mt-1 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl"
          >
            {profiles.map((p) => (
              <div
                key={p.id}
                className={cn(
                  'group flex items-center gap-1 rounded-lg px-1',
                  p.id === active?.id && 'bg-accent-purple/5'
                )}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => switchTo(p.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-neutral-900">{p.label}</span>
                      {p.isDefault && (
                        <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                      )}
                    </span>
                    <span className="block text-[10px] text-neutral-400">
                      {p.completeness}% complete
                      {p.targetIndustry && ` · ${INDUSTRY_LABELS[p.targetIndustry] ?? p.targetIndustry}`}
                    </span>
                  </span>
                  {p.id === active?.id && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-accent-purple" strokeWidth={3} />
                  )}
                </button>

                {!p.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(p.id)}
                    disabled={pending}
                    aria-label={`Make ${p.label} the default profile`}
                    title="Make default"
                    className="rounded p-1 text-neutral-300 opacity-0 transition hover:text-amber-500 group-hover:opacity-100 disabled:opacity-40"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                {profiles.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    disabled={pending}
                    aria-label={`Delete ${p.label}`}
                    title="Delete profile"
                    className="rounded p-1 text-neutral-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}

            <div className="mt-1 border-t border-neutral-100 pt-1.5">
              {creating ? (
                <div className="flex flex-col gap-2 p-1.5">
                  <input
                    autoFocus
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    placeholder="e.g. Warehouse Operative"
                    className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-accent-purple"
                  />
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-600 outline-none focus:border-accent-purple"
                  >
                    <option value="">Target industry (optional)</option>
                    {INDUSTRY_IDS.map((id) => (
                      <option key={id} value={id}>
                        {INDUSTRY_LABELS[id] ?? id}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={pending || !label.trim()}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-purple px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {pending && <Loader2 className="h-3 w-3 animate-spin" />}
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false);
                        setError(null);
                      }}
                      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  disabled={atLimit}
                  title={atLimit ? `Your plan allows ${maxProfiles} profiles` : undefined}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent"
                >
                  <Plus className="h-4 w-4" />
                  New profile
                  <span className="ml-auto text-[10px] text-neutral-400">
                    {profiles.length}/{maxProfiles}
                  </span>
                </button>
              )}

              {error && <p className="px-3 pb-1.5 text-[11px] text-red-600">{error}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
