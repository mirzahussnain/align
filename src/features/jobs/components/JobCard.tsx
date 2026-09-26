'use client';

import { Building2, MapPin, PoundSterling, Briefcase, Clock, ExternalLink, CheckCircle2, AlertTriangle, Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import type { NormalisedJob } from '@/shared/types/job';
import { getTimeAgo } from '@/shared/utils/date';
import Badge from '@/shared/components/ui/Badge';

interface JobCardProps {
  job: NormalisedJob;
  saved: boolean;
  saving: boolean;
  onToggleSave: (job: NormalisedJob) => void;
}

export default function JobCard({ job, saved, saving, onToggleSave }: JobCardProps) {
  const register = job.sponsorSignal.registerMatchStatus;
  const wording = job.sponsorSignal.jobWording;
  const viewDetails = async () => {
    const response = await fetch('/api/jobs/snapshots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job }) });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.jobSnapshotId) window.location.assign(`/dashboard/jobs/${encodeURIComponent(body.jobSnapshotId)}`);
  };

  return <article className="glass-card p-5 border-border-subtle">
    <div className="flex flex-col gap-4">
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-text-primary line-clamp-1">{job.title}</h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary my-2">
          <span className="flex items-center gap-1"><Building2 size={12} /> {job.company}</span><span className="flex items-center gap-1"><MapPin size={12} /> {job.locationText}</span>
          {job.salaryText && <span className="flex items-center gap-1 text-accent-cyan font-medium"><PoundSterling size={12} /> {job.salaryText}</span>}
          {job.contractType && <span className="flex items-center gap-1"><Briefcase size={12} /> {job.contractType}</span>}
          {job.postedAt && <span className="flex items-center gap-1 text-text-tertiary"><Clock size={12} /> {getTimeAgo(job.postedAt)}</span>}
        </div>
        {job.description && <p className="text-xs text-text-tertiary line-clamp-2 leading-relaxed">{job.description}</p>}
        {/*
          No Career Track relevance badge is rendered. This carried the fixed
          string "Career Track relevance: Strong title alignment" on every card,
          which was never computed from anything — it made the same claim about a
          perfectly matched vacancy and a completely unrelated one. Showing
          nothing is honest; the deterministic HIGH/MEDIUM/LOW calculation that
          replaces it lands with the relevance phase.
        */}
        <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
          {register !== 'NONE' && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-success/10 text-success border border-success/30">
              <CheckCircle2 size={11} />
              {register === 'EXACT' || register === 'LIKELY' ? 'Appears on sponsor register' : 'Possible sponsor-register match'}
              <a
                href={`/immigration?q=${encodeURIComponent(job.company)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 ml-1 text-accent-cyan hover:underline"
                title={`Verify ${job.company} in Sponsorship & Visas`}
              >
                <span>Verify</span>
                <ExternalLink size={9} />
              </a>
            </span>
          )}
          {wording !== 'NOT_MENTIONED' && <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-warning/10 text-warning border border-warning/20"><AlertTriangle size={11} /> {job.sponsorSignal.explanation}</span>}
          {job.eligibilityHints.slice(0, 2).map((hint) => <span key={hint.type} className="rounded-full px-2 py-1 bg-bg-tertiary text-text-secondary">{hint.label}</span>)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle pt-3 text-xs">
        <Badge variant="default">{job.providerReferences.map((reference) => reference.provider).join(' · ')}</Badge>
        <a href={job.canonicalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-accent-cyan"><ExternalLink size={13} /> Open original listing</a>
        <button type="button" onClick={viewDetails} className="text-xs font-semibold text-accent-cyan hover:text-accent-cyan">View details</button>
        <button
          type="button"
          onClick={() => onToggleSave(job)}
          disabled={saving}
          aria-pressed={saved}
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-accent-cyan disabled:opacity-60"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save job'}
        </button>
        <button type="button" onClick={viewDetails} className="text-xs font-semibold text-accent-cyan hover:text-accent-cyan">Check match</button>
      </div>
    </div>
    {job.descriptionAvailability !== 'FULL' && <p className="mt-3 text-xs text-warning">This provider supplied only part of the vacancy description. Paste the full description from the original listing for a more reliable match.</p>}
  </article>;
}
