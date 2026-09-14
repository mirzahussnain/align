'use client';

import { useRef, useState } from 'react';
import Button from '@/shared/components/ui/Button';
import type { CVAnalysisResult } from '@/shared/types/cv';

type Track = { profileId: string; label: string };
type Usage = { used?: number; limit?: number; remaining?: number; period?: string } | null;

export default function JobMatchPreparation({
  jobSnapshotId,
  title,
  employerName,
  providerDescription,
  descriptionAvailability,
  profileId,
  profiles,
  usage,
  onClose,
}: {
  jobSnapshotId: string;
  title: string;
  employerName: string;
  providerDescription?: string | null;
  descriptionAvailability: 'FULL' | 'PARTIAL' | 'EXTERNAL_ONLY';
  profileId?: string;
  profiles: Track[];
  usage: Usage;
  onClose: () => void;
}) {
  const [trackId, setTrackId] = useState(profileId ?? profiles[0]?.profileId ?? '');
  const [description, setDescription] = useState(providerDescription ?? '');
  const [acknowledged, setAcknowledged] = useState(descriptionAvailability === 'FULL');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const operationId = useRef(crypto.randomUUID());

  const usesPrivateOverride = description.trim() !== (providerDescription ?? '').trim();

  async function run() {
    if (!description.trim()) return setError('Add the job description before continuing.');
    if (!file) return setError('Choose the CV revision you want to match.');
    if (!usesPrivateOverride && descriptionAvailability !== 'FULL' && !acknowledged) {
      return setError('Confirm that you understand the provider description is partial.');
    }
    setRunning(true);
    setError(null);
    try {
      const preparedResponse = await fetch('/api/job-matches/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobSnapshotId,
          profileId: trackId,
          descriptionOverride: usesPrivateOverride ? description : undefined,
          partialDescriptionAccepted: !usesPrivateOverride && descriptionAvailability !== 'FULL' && acknowledged,
        }),
      });
      const prepared = await preparedResponse.json().catch(() => null);
      if (!preparedResponse.ok) throw new Error(prepared?.error ?? 'Unable to prepare this Job Match.');

      const form = new FormData();
      form.set('requestId', prepared.matchRequestId);
      form.set('file', file);
      const response = await fetch('/api/job-matches', {
        method: 'POST',
        headers: { 'x-operation-id': operationId.current },
        body: form,
      });
      const result = await response.json().catch(() => null) as (CVAnalysisResult & { error?: string }) | null;
      if (!response.ok || !result?.analysisId) throw new Error(result?.error ?? 'Unable to run this Job Match.');
      window.location.assign(`/dashboard?tab=job_matches&analysis=${encodeURIComponent(result.analysisId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to run this Job Match.');
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="job-match-title">
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-bg-primary p-5 shadow-2xl sm:max-w-2xl sm:rounded-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="job-match-title" className="text-lg font-semibold text-text-primary">Check fit for this vacancy</h2>
            <p className="mt-1 text-sm text-text-secondary">Choose the exact CV, Career Profile, and vacancy text to assess.</p>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-text-secondary hover:bg-bg-tertiary">Close</button>
        </div>
        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-bg-tertiary p-4"><p className="font-semibold">{title}</p><p className="mt-1 text-text-secondary">{employerName}</p></div>
          <label className="block font-medium">Career Profile
            <select value={trackId} onChange={(event) => setTrackId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-transparent px-3">
              {profiles.map((track) => <option key={track.profileId} value={track.profileId}>{track.label}</option>)}
            </select>
          </label>
          <label className="block font-medium">CV revision
            <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { setFile(event.target.files?.[0] ?? null); operationId.current = crypto.randomUUID(); }} className="mt-1 block min-h-11 w-full rounded-xl border border-border-subtle p-2 text-sm" />
          </label>
          <label className="block font-medium">Job description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={50_000} className="mt-1 min-h-44 w-full rounded-xl border border-border-subtle bg-transparent p-3 text-sm font-normal" />
          </label>
          {usesPrivateOverride && <p className="rounded-xl bg-violet-50 p-3 text-xs leading-5 text-violet-800">This edited description is private to your Job Match. It will not change the shared vacancy.</p>}
          {!usesPrivateOverride && descriptionAvailability !== 'FULL' && (
            <label className="flex gap-3 rounded-xl bg-amber-50 p-3 text-amber-900"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />I understand the provider supplied only a partial description.</label>
          )}
          <p className="text-text-secondary">{usage?.limit != null ? `${usage.used ?? 0} of ${usage.limit} Job Matches used this ${usage.period ?? 'month'} · ${usage.remaining ?? 0} remaining` : 'Usage is reserved only when the match starts.'}</p>
          {error && <p className="rounded-xl bg-error/10 p-3 text-error" role="alert">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" onClick={run} disabled={running || !trackId}>{running ? 'Running match…' : 'Run Job Match'}</Button></div>
      </div>
    </div>
  );
}
