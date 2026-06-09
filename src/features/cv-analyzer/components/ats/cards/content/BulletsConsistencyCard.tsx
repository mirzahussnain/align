import React from 'react';
import AuditCard from '../../AuditCard';

interface BulletConsistency {
  total: number;
  endingWithPeriod: number;
  endingWithoutPeriod: number;
}

interface BulletsConsistencyCardProps {
  bulletConsistency: BulletConsistency;
}

export default function BulletsConsistencyCard({ bulletConsistency }: BulletsConsistencyCardProps) {
  const isPassed = bulletConsistency.endingWithoutPeriod === 0;
  return (
    <AuditCard
      id="bulletsConsistency"
      title="Bullets Consistency"
      subtitle="Checks formatting coherence of bullet lists"
      score={isPassed ? "Consistent" : "Mixed style"}
      scoreStatus={isPassed ? "excellent" : "good"}
      details="Checks if bullet points have uniform ending punctuation and professional structure."
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          Recruiters scan CV bullet points quickly. Mixed styles (some ending with periods, some without) look untidy.
        </p>
        {bulletConsistency.total > 0 ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
              <p className="text-xs font-bold text-slate-500">Total Bullets</p>
              <p className="text-lg font-black text-slate-700 mt-1">{bulletConsistency.total}</p>
            </div>
            <div className="p-3 bg-emerald-50/20 border border-emerald-100 rounded-xl text-center">
              <p className="text-xs font-bold text-emerald-800">Ending with Period</p>
              <p className="text-lg font-black text-emerald-700 mt-1">{bulletConsistency.endingWithPeriod}</p>
            </div>
            <div className="p-3 bg-amber-50/20 border border-amber-100 rounded-xl text-center">
              <p className="text-xs font-bold text-amber-800">No Period</p>
              <p className="text-lg font-black text-amber-700 mt-1">{bulletConsistency.endingWithoutPeriod}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs font-medium text-slate-400 italic">No bullet point symbols parsed in text.</p>
        )}
      </div>
    </AuditCard>
  );
}
