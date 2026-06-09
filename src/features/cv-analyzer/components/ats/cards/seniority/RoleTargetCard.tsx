import React from 'react';
import AuditCard from '../../AuditCard';

interface RoleTargetCardProps {
  targetRoleTitle?: string;
}

export default function RoleTargetCard({ targetRoleTitle }: RoleTargetCardProps) {
  return (
    <AuditCard
      id="roleTarget"
      title="Role Target"
      subtitle="Validates presence of desired job title in header/summary"
      score={targetRoleTitle ? "Target set" : "Add role title"}
      scoreStatus={targetRoleTitle ? "excellent" : "critical"}
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500 leading-relaxed">
          {targetRoleTitle
            ? `Extracted desired target role: "${targetRoleTitle}". Clearly defining a target role ensures ATS keyword calibration maps you to the correct queue.`
            : "No specific target title was found in the header or summary. Clearly state your targeted title (e.g. 'Senior Frontend Engineer') at the very top of your CV."}
        </p>
        {targetRoleTitle && (
          <div className="p-3 bg-emerald-50/20 border border-emerald-100 rounded-xl text-xs font-bold text-emerald-800">
            Extracted Title: {targetRoleTitle}
          </div>
        )}
      </div>
    </AuditCard>
  );
}
