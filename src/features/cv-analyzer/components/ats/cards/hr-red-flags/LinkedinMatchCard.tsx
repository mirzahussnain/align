import React from 'react';
import AuditCard from '../../AuditCard';

interface LinkedinMatchCardProps {
  linkedin?: string;
}

export default function LinkedinMatchCard({ linkedin }: LinkedinMatchCardProps) {
  return (
    <AuditCard
      id="linkedinMatch"
      title="LinkedIn Profile Match"
      subtitle="Checks presence of public network identifiers"
      score={linkedin ? 'Linked' : 'Missing'}
      scoreStatus={linkedin ? 'excellent' : 'good'}
    >
      <p className="text-xs text-slate-500 leading-relaxed">
        {linkedin
          ? `We found your LinkedIn handle (${linkedin}) in the header section. Recruiters prefer candidates who connect their profiles.`
          : "Add your LinkedIn URL to the header card to increase credibility and build professional network connections."}
      </p>
    </AuditCard>
  );
}
