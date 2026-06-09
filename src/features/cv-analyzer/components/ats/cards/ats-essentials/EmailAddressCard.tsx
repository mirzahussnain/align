import React from 'react';
import AuditCard from '../../AuditCard';

interface EmailAddressCardProps {
  email?: string;
}

export default function EmailAddressCard({ email }: EmailAddressCardProps) {
  return (
    <AuditCard
      id="emailAddress"
      title="Email Address"
      subtitle="Verifies presence and correctness of email address"
      score={email ? 'Passed' : 'Missing'}
      scoreStatus={email ? 'excellent' : 'critical'}
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500 leading-relaxed">
          Recruiters require a direct professional email in the header.
        </p>
        {email ? (
          <div className="p-4 bg-emerald-50/20 border border-emerald-100 rounded-xl flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-emerald-800">Parsed Email:</h4>
              <p className="text-xs font-semibold text-emerald-900 mt-0.5">{email}</p>
            </div>
            <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded uppercase">
              Verified
            </span>
          </div>
        ) : (
          <div className="p-4 bg-rose-50/20 border border-rose-100 rounded-xl">
            <p className="text-xs font-bold text-rose-800">No email found</p>
            <p className="text-[11px] text-rose-600 mt-0.5">Add an email address at the very top of your CV header.</p>
          </div>
        )}
      </div>
    </AuditCard>
  );
}
