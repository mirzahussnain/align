import React from 'react';
import AuditCard from '../../AuditCard';

interface HeaderLinksCardProps {
  linkedin?: string;
}

export default function HeaderLinksCard({ linkedin }: HeaderLinksCardProps) {
  return (
    <AuditCard
      id="headerLinks"
      title="Header Links"
      subtitle="Detects LinkedIn, GitHub, or portfolio URLs in the CV text"
      score={linkedin ? 'Found' : 'Missing'}
      scoreStatus={linkedin ? 'excellent' : 'good'}
      source="rule"
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500 leading-relaxed">
          A LinkedIn or portfolio link in your header gives recruiters an easy way to verify your
          background. We detect the link in your CV — we don’t check that it’s live, so give it a
          quick test before you send.
        </p>
        {linkedin ? (
          <div className="p-4 bg-emerald-50/20 border border-emerald-100 rounded-xl flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-emerald-800">LinkedIn Profile Link:</h4>
              <a
                href={linkedin.startsWith('http') ? linkedin : `https://${linkedin}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-emerald-950 underline hover:text-emerald-800 mt-0.5 block"
              >
                {linkedin}
              </a>
            </div>
            <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded uppercase">
              Detected
            </span>
          </div>
        ) : (
          <div className="p-4 bg-rose-50/20 border border-rose-100 rounded-xl">
            <p className="text-xs font-bold text-rose-800">No Professional Links Found</p>
            <p className="text-[11px] text-rose-600 mt-0.5">
              We highly recommend adding your LinkedIn or GitHub links at the top of your CV.
            </p>
          </div>
        )}
      </div>
    </AuditCard>
  );
}
