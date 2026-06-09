import React from 'react';
import AuditCard from '../../AuditCard';

export default function FileNameCard() {
  return (
    <AuditCard
      id="fileName"
      title="File Name Check"
      subtitle="Audits name format of uploaded file"
      score="Passed"
      scoreStatus="excellent"
    >
      <p className="text-xs text-slate-500 leading-relaxed">
        Your file name follows professional conventions. Using structured filenames like{' '}
        <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-bold font-mono">
          FirstName_LastName_Resume
        </code>{' '}
        is ideal for recruitment parsers.
      </p>
    </AuditCard>
  );
}
