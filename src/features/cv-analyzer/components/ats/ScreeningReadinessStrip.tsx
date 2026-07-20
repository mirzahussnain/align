'use client';

import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { CVAnalysisResult } from '@/shared/types/cv';

interface Check {
  label: string;
  passed: boolean;
  hint: string;
}

/**
 * Screening readiness for application-form-led roles (warehouse, retail,
 * care): the handful of things high-volume screening actually filters on,
 * surfaced above the score dial because they matter before CV polish does.
 * Derived deterministically from the analysis result — no extra calls.
 */
export default function ScreeningReadinessStrip({ result }: { result: CVAnalysisResult }) {
  const text = result.rawText;

  const licenceFindings = result.credentials?.findings.filter(f => f.found) ?? [];

  const checks: Check[] = [
    {
      label: 'Right to work',
      passed: /right to work|eligible to work|work permit|british citizen|settled status|pre-settled/i.test(text),
      hint: 'State your right to work in the UK explicitly — it is a knockout question on application forms.',
    },
    {
      label: 'Availability / shifts',
      passed: /availab|shift|weekend|nights?\b|immediate start|start immediately|notice period/i.test(text),
      hint: 'Say which shifts you can work and when you can start — screeners filter on it.',
    },
    {
      label: 'Licences & training',
      passed: licenceFindings.length > 0,
      hint: 'List relevant licences and training (with dates) where a screener will see them first.',
    },
    {
      label: 'Location / transport',
      passed: /own transport|driving licence|driver'?s licence|commut/i.test(text) || /,\s*(?:greater )?\w+shire|\b(?:manchester|london|birmingham|leeds|glasgow|liverpool|sheffield|bristol|nottingham|wigan)\b/i.test(text),
      hint: 'Include your town and, if relevant, that you have your own transport.',
    },
  ];

  const passedCount = checks.filter(c => c.passed).length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-800">Screening readiness</h3>
        <span className="text-xs font-semibold text-slate-500">
          {passedCount}/{checks.length} covered
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {checks.map(check => (
          <div
            key={check.label}
            className={`flex items-start gap-2 rounded-xl border p-2.5 ${
              check.passed ? 'border-emerald-100 bg-emerald-50/30' : 'border-amber-100 bg-amber-50/30'
            }`}
          >
            {check.passed ? (
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-600" />
            )}
            <div>
              <p className="text-xs font-bold text-slate-700">{check.label}</p>
              {!check.passed && <p className="text-[11px] text-slate-500 leading-snug">{check.hint}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
