import React from 'react';
import AuditCard from '../../AuditCard';

interface KeywordItem {
  keyword: string;
}

interface RelevanceCardProps {
  hasTestingKeywords: boolean;
  presentKeywords: KeywordItem[];
}

export default function RelevanceCard({ hasTestingKeywords, presentKeywords }: RelevanceCardProps) {
  return (
    <AuditCard
      id="relevance"
      title="UK Tech Market Relevance"
      subtitle="Validates alignment with UK technology sector expectations"
      score={hasTestingKeywords ? "UK Aligned" : "Fix standard"}
      scoreStatus={hasTestingKeywords ? "excellent" : "good"}
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          {hasTestingKeywords
            ? "Your tech stack is highly aligned with core requirements commonly requested by UK-based technical recruiters, including testing tools (Jest, Playwright, Cypress) and modern developer workflows."
            : "Your tech stack has modern languages but is missing key testing practices commonly expected by UK hiring managers. Jest, Cypress, Playwright, or Test-Driven Development (TDD) keywords are heavily filtered by screening tools."}
        </p>
        {!hasTestingKeywords && (
          <div className="p-3 bg-amber-50/20 border border-amber-100 rounded-xl text-xs font-semibold text-amber-800">
            ⚠️ Recommendation: Add testing experience (Jest, Vitest, Cypress, Playwright) to your projects to avoid automatic screening rejection.
          </div>
        )}
        <div className="p-4 bg-emerald-50/20 border border-emerald-100 rounded-xl">
          <h4 className="text-xs font-bold text-emerald-800 mb-1.5">Matched Core UK Tech Skills:</h4>
          <div className="flex flex-wrap gap-1.5">
            {presentKeywords.slice(0, 8).map((kw, i) => (
              <span key={i} className="px-2 py-0.5 bg-white border border-emerald-200 text-emerald-700 font-bold rounded text-[11px]">
                {kw.keyword}
              </span>
            ))}
          </div>
        </div>
      </div>
    </AuditCard>
  );
}
