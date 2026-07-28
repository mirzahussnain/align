'use client';
import { useState } from 'react';
import Button from '@/shared/components/ui/Button';
import type { NormalisedJob } from '@/shared/types/job';

type Track = { profileId: string; label: string };
type Usage = { used?: number; limit?: number; remaining?: number; period?: string } | null;
export default function JobMatchPreparation({ job, profileId, profiles, usage, onClose }: { job: NormalisedJob; profileId?: string; profiles: Track[]; usage: Usage; onClose: () => void }) {
  const [trackId, setTrackId] = useState(profileId ?? profiles[0]?.profileId ?? ''); const [description, setDescription] = useState(job.description ?? '');
  const [acknowledged, setAcknowledged] = useState(job.descriptionAvailability === 'FULL'); const [error, setError] = useState<string | null>(null); const [running, setRunning] = useState(false);
  const run = async () => {
    if (!description.trim()) return setError('Add the job description before continuing.');
    if (job.descriptionAvailability !== 'FULL' && !acknowledged) return setError('Confirm that you understand this is a partial description.');
    setRunning(true); setError(null);
    try { const response = await fetch('/api/jobs/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job: { ...job, description, descriptionAvailability: job.descriptionAvailability === 'FULL' ? 'FULL' : 'PARTIAL' }, profileId: trackId || undefined }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Unable to prepare this job match.'); window.location.assign(`/analyze?mode=job_match&handoff=${encodeURIComponent(data.token)}`); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to prepare this job match.'); setRunning(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="job-match-title"><div className="max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-bg-primary p-5 shadow-2xl sm:max-w-2xl sm:rounded-2xl">
    <div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="job-match-title" className="text-lg font-bold text-text-primary">Prepare job match</h2><p className="text-sm text-text-secondary">Review the vacancy before uploading your CV.</p></div><button type="button" onClick={onClose}>Close</button></div>
    <div className="space-y-3 text-sm"><label className="block font-medium">Career Track<select value={trackId} onChange={(event) => setTrackId(event.target.value)} className="mt-1 w-full rounded-lg border border-border-subtle bg-transparent p-2">{profiles.map((track) => <option key={track.profileId} value={track.profileId}>{track.label}</option>)}</select></label><div className="rounded-lg bg-bg-tertiary p-3"><p className="font-medium">{job.title}</p><p className="text-text-secondary">{job.company} · {job.locationText}</p></div><label className="block font-medium">Job description<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 min-h-40 w-full rounded-lg border border-border-subtle bg-transparent p-3 text-sm font-normal" /></label>
    {job.descriptionAvailability !== 'FULL' && <label className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-warning"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />This is a partial description. I understand the match will be marked as partial.</label>}
    <p className="text-text-secondary">{usage?.limit != null ? `${usage.used ?? 0} of ${usage.limit} job matches used this ${usage.period ?? 'month'} · ${usage.remaining ?? 0} remaining` : 'Usage is confirmed when you run the match.'}</p>{error && <p className="rounded-lg bg-error/10 p-3 text-error" role="alert">{error}</p>}</div>
    <div className="mt-5 flex justify-end gap-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" onClick={run} disabled={running || !trackId}>{running ? 'Preparing…' : 'Run job match'}</Button></div>
  </div></div>;
}
