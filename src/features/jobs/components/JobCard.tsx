'use client';

import { useState } from 'react';
import { Building2, MapPin, PoundSterling, Briefcase, Clock, ExternalLink, CheckCircle2, AlertTriangle, Bookmark } from 'lucide-react';
import type { NormalisedJob } from '@/shared/types/job';
import { getTimeAgo } from '@/shared/utils/date';
import Badge from '@/shared/components/ui/Badge';

export default function JobCard({ job, profileId }: { job: NormalisedJob; profileId?: string }) {
  const [saved, setSaved] = useState(false);
  const save = async () => {
    const response = await fetch('/api/saved-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job }) });
    if (response.ok) setSaved(true);
  };
  const startMatch = async () => { const response = await fetch('/api/jobs/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job, profileId }) }); if (response.ok) { const { token } = await response.json(); window.location.assign('/analyze?mode=job_match&handoff=' + encodeURIComponent(token)); } };
  const register = job.sponsorSignal.registerMatchStatus;
  const viewDetails = () => { if (job.jobReference) window.location.assign(`/jobs/${encodeURIComponent(job.jobReference)}`); };
  const wording = job.sponsorSignal.jobWording;
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
        <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
          <span className="rounded-full border border-border-subtle bg-bg-tertiary px-2 py-1 text-text-secondary">Career Track relevance: Strong title alignment</span>
          {register !== 'NONE' && <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-success/10 text-success border border-success/30"><CheckCircle2 size={11} /> {register === 'EXACT' ? 'Employer on sponsor register' : 'Similar sponsor-register name'}</span>}
          {wording !== 'NOT_MENTIONED' && <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-warning/10 text-warning border border-warning/20"><AlertTriangle size={11} /> {job.sponsorSignal.explanation}</span>}
          {job.eligibilityHints.slice(0, 2).map((hint) => <span key={hint.type} className="rounded-full px-2 py-1 bg-bg-tertiary text-text-secondary">{hint.label}</span>)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle pt-3 text-xs">
        <Badge variant="default">{job.providerReferences.map((reference) => reference.provider).join(' · ')}</Badge>
        <a href={job.canonicalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-accent-purple"><ExternalLink size={13} /> Open original</a>
        <button type="button" onClick={viewDetails} className="text-xs font-semibold text-accent-purple hover:text-accent-cyan">View details</button>
        <button type="button" onClick={save} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-accent-purple"><Bookmark size={13} /> {saved ? 'Saved' : 'Save job'}</button>
        <button type="button" onClick={viewDetails} className="text-xs font-semibold text-accent-purple hover:text-accent-cyan">Check match</button>
      </div>
    </div>
    {job.descriptionAvailability !== 'FULL' && <p className="mt-3 text-xs text-warning">This source provides only a partial description. Open the original listing and paste the full description for a reliable match.</p>}
  </article>;
}