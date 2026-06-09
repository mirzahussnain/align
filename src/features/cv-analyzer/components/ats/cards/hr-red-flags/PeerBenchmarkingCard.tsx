import React from 'react';
import AuditCard from '../../AuditCard';

interface PeerBenchmarkingCardProps {
  overallScore: number;
}

export default function PeerBenchmarkingCard({ overallScore }: PeerBenchmarkingCardProps) {
  const isExcellent = overallScore >= 70;
  const scoreLabel = overallScore >= 80 ? 'Top 10%' : overallScore >= 70 ? 'Top 25%' : 'Average';

  return (
    <AuditCard
      id="peerBenchmarking"
      title="Peer Benchmarking"
      subtitle="Compares resume scores with market averages"
      score={scoreLabel}
      scoreStatus={isExcellent ? 'excellent' : 'good'}
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          Your overall score of {overallScore}/100 places you in the <span className="font-bold text-accent-purple">{scoreLabel.toLowerCase()}</span> of applicants in our tech database.
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Average Candidate</span>
            <span>You</span>
            <span>Top Tier</span>
          </div>
          <div className="h-3.5 rounded-full bg-slate-100 relative border border-slate-200/60 overflow-hidden">
            {/* Average line */}
            <div className="absolute left-[62%] top-0 bottom-0 w-0.5 bg-slate-400 z-10" title="Average: 62%" />
            {/* Candidate position */}
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-purple to-accent-cyan"
              style={{ width: `${overallScore}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
            <span>62%</span>
            <span className="font-bold text-accent-purple">{overallScore}%</span>
            <span>85%+</span>
          </div>
        </div>
      </div>
    </AuditCard>
  );
}
