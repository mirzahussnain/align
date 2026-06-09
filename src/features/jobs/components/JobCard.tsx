'use client';

import { Building2, MapPin, PoundSterling, Briefcase, Clock, ExternalLink, CheckCircle2, Minus } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type { Job } from '@/shared/types/job';
import { getTimeAgo } from '@/shared/utils/date';
import Badge from '@/shared/components/ui/Badge';

interface JobCardProps {
  job: Job;
}

export default function JobCard({ job }: JobCardProps) {
  return (
    <a
      href={job.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block glass-card p-5 hover:border-accent-purple/30 transition-all group"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3 mb-2">
            <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent-purple transition-colors line-clamp-1">
              {job.title}
            </h3>
            <ExternalLink size={14} className="text-text-tertiary flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary mb-2">
            <span className="flex items-center gap-1">
              <Building2 size={12} /> {job.company}
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={12} /> {job.location}
            </span>
            {job.salary && (
              <span className="flex items-center gap-1 text-accent-cyan font-medium">
                <PoundSterling size={12} /> {job.salary}
              </span>
            )}
            {job.contractType && (
              <span className="flex items-center gap-1">
                <Briefcase size={12} /> {job.contractType}
              </span>
            )}
            <span className="flex items-center gap-1 text-text-tertiary">
              <Clock size={12} /> {getTimeAgo(job.postedDate)}
            </span>
          </div>

          <p className="text-xs text-text-tertiary line-clamp-2 leading-relaxed">
            {job.description.slice(0, 200)}...
          </p>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap sm:flex-col items-start gap-2 flex-shrink-0">
          {/* Source badge */}
          <Badge variant="default">
            {job.source}
          </Badge>

          {/* Sponsor badge */}
          {job.hasSponsorship ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-success/10 text-success border border-success/30 shadow-[0_0_10px_hsla(150,80%,40%,0.1)]">
              <CheckCircle2 size={12} />
              Verified Sponsor
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-bg-tertiary text-text-tertiary border border-border-subtle">
              <Minus size={12} />
              No Sponsorship
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
