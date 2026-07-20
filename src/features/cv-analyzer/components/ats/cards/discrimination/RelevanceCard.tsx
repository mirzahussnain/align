import React from 'react';
import AuditCard from '../../AuditCard';

interface KeywordItem {
  keyword: string;
}

interface RelevanceCardProps {
  /** Coverage of the classified occupation's evidence, from the engine. */
  roleAligned: boolean;
  /** Which occupation this CV was evaluated as, e.g. "Warehouse Operative". */
  occupationLabel: string;
  presentKeywords: KeywordItem[];
}

/**
 * Occupation-aware relevance: whether the CV shows the evidence UK employers
 * screen for in the CANDIDATE'S field — never a fixed tech checklist.
 */
export default function RelevanceCard({ roleAligned, occupationLabel, presentKeywords }: RelevanceCardProps) {
  return (
    <AuditCard
      id="relevance"
      title="Role Relevance"
      subtitle={`Validates alignment with UK ${occupationLabel} expectations`}
      score={roleAligned ? 'Aligned' : 'Review evidence'}
      scoreStatus={roleAligned ? 'excellent' : 'good'}
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          {roleAligned
            ? `Your CV covers the terminology and evidence UK recruiters commonly screen for in ${occupationLabel} roles.`
            : `Your CV names few of the terms UK recruiters screen for in ${occupationLabel} roles. Work concrete, role-specific evidence into your experience bullets — screening tools filter on the vocabulary of the job.`}
        </p>
        {presentKeywords.length > 0 && (
          <div className="p-4 bg-emerald-50/20 border border-emerald-100 rounded-xl">
            <h4 className="text-xs font-bold text-emerald-800 mb-1.5">Matched role-relevant terms:</h4>
            <div className="flex flex-wrap gap-1.5">
              {presentKeywords.slice(0, 8).map((kw, i) => (
                <span key={i} className="px-2 py-0.5 bg-white border border-emerald-200 text-emerald-700 font-bold rounded text-[11px]">
                  {kw.keyword}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </AuditCard>
  );
}
