import React from 'react';
import AuditCard from '../../AuditCard';
import type { CredentialAnalysis } from '@/shared/types/cv';

interface CredentialsCardProps {
  credentials: CredentialAnalysis | undefined;
  occupationLabel: string;
}

/**
 * Credential & licence readiness. Credentials are hard eligibility filters
 * (NMC PIN, FLT licence, Cat CE + CPC), not keywords — a missing mandatory one
 * is flagged as a blocker, while occupations with no material credential
 * expectations get an explicit all-clear rather than an empty card.
 */
export default function CredentialsCard({ credentials, occupationLabel }: CredentialsCardProps) {
  if (!credentials) return null;

  const missingMandatory = credentials.findings.filter(f => f.class === 'mandatory' && !f.found);
  const missingOther = credentials.findings.filter(f => f.class !== 'mandatory' && !f.found);
  const found = credentials.findings.filter(f => f.found);

  const status =
    missingMandatory.length > 0 ? 'critical' : missingOther.length > 0 ? 'good' : 'excellent';

  return (
    <AuditCard
      id="credentials"
      title="Credentials & Licences"
      subtitle={`Registrations, licences, and training expected for ${occupationLabel} roles`}
      score={
        missingMandatory.length > 0
          ? 'Missing required'
          : credentials.notMaterial
            ? 'Not required'
            : `${found.length}/${credentials.findings.length} found`
      }
      scoreStatus={status}
    >
      <div className="space-y-3">
        {credentials.notMaterial ? (
          <p className="text-xs text-slate-500 leading-relaxed">
            No role-critical credentials are expected for this occupation — this dimension scores
            full marks automatically.
          </p>
        ) : (
          <>
            {missingMandatory.map(f => (
              <div
                key={f.id}
                className="p-3 bg-rose-50/40 border border-rose-200 rounded-xl text-xs text-rose-800"
              >
                <span className="font-bold">{f.label} — required and not found. </span>
                {f.message}
              </div>
            ))}
            {missingOther.map(f => (
              <div
                key={f.id}
                className="p-3 bg-amber-50/20 border border-amber-100 rounded-xl text-xs text-amber-800"
              >
                <span className="font-bold">{f.label}: </span>
                {f.message}
              </div>
            ))}
            {found.length > 0 && (
              <div className="p-4 bg-emerald-50/20 border border-emerald-100 rounded-xl">
                <h4 className="text-xs font-bold text-emerald-800 mb-1.5">Found on your CV:</h4>
                <div className="flex flex-wrap gap-1.5">
                  {found.map(f => (
                    <span
                      key={f.id}
                      className="px-2 py-0.5 bg-white border border-emerald-200 text-emerald-700 font-bold rounded text-[11px]"
                    >
                      {f.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AuditCard>
  );
}
