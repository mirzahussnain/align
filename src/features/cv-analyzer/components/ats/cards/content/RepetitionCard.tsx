import React from 'react';
import { CheckCircle } from 'lucide-react';
import AuditCard from '../../AuditCard';

interface RepeatedWordItem {
  word: string;
  count: number;
}

interface RepetitionCardProps {
  repeatedWords: RepeatedWordItem[];
}

export default function RepetitionCard({ repeatedWords }: RepetitionCardProps) {
  const isPassed = repeatedWords.length <= 3;
  return (
    <AuditCard
      id="repetition"
      source="rule"
      title="Vocabulary Repetition"
      subtitle="Buzzword audit and phrase repetition checks"
      score={isPassed ? "Passed" : "Review"}
      scoreStatus={isPassed ? "excellent" : "good"}
      details="We scanned your resume for repeated action verbs, repeated bullet starters, and overused buzzwords."
    >
      {repeatedWords.length > 0 ? (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50/20 border border-amber-100 rounded-xl">
            <h4 className="text-xs font-bold text-amber-800 mb-2">Repeated Words (Frequency &ge; 4)</h4>
            <div className="flex flex-wrap gap-2">
              {repeatedWords.map((item, idx) => (
                <span key={idx} className="px-2.5 py-1 bg-white border border-amber-200/60 rounded-lg text-xs font-bold text-amber-700 shadow-sm">
                  {item.word} ({item.count}x)
                </span>
              ))}
            </div>
            <p className="text-[10px] text-amber-600 mt-2">
              Tip: Replace some of these repeated words with synonyms to sound more varied and engaging.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-emerald-50/20 border border-emerald-100 rounded-xl flex items-start gap-2.5">
          <CheckCircle size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-emerald-800">Vocabulary Variety Match</h4>
            <p className="text-[11px] text-emerald-700 leading-relaxed mt-0.5">
              No high-frequency verb or buzzword repetitions found. Your vocabulary is highly varied and engaging.
            </p>
          </div>
        </div>
      )}
    </AuditCard>
  );
}
