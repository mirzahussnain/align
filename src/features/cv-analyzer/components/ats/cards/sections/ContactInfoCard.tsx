import React from 'react';
import { cn } from '@/shared/utils/cn';
import AuditCard from '../../AuditCard';

interface ContactInfo {
  email?: string;
  phone?: string;
  linkedin?: string;
}

interface ContactInfoCardProps {
  contactInfo: ContactInfo;
}

export default function ContactInfoCard({ contactInfo }: ContactInfoCardProps) {
  const isPassed = !!contactInfo.email && !!contactInfo.phone;
  const items = [
    { name: 'Email Address', value: contactInfo.email || 'Not found', present: !!contactInfo.email },
    { name: 'LinkedIn Link', value: contactInfo.linkedin || 'Not found', present: !!contactInfo.linkedin },
    { name: 'Phone Number', value: contactInfo.phone || 'Not found', present: !!contactInfo.phone },
  ];

  return (
    <AuditCard
      id="contactInfo"
      source="rule"
      title="Contact Information"
      subtitle="Checks availability of vital contact channels"
      score={isPassed ? "Complete" : "Incomplete"}
      scoreStatus={isPassed ? "excellent" : "critical"}
    >
      <div className="space-y-3">
        {items.map((info, idx) => (
          <div
            key={idx}
            className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 gap-1 sm:gap-4"
          >
            <span className="text-xs font-bold text-slate-500">{info.name}</span>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-bold truncate max-w-[280px]", info.present ? "text-slate-700" : "text-amber-600")}>
                {info.value}
              </span>
              <span
                className={cn(
                  "text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase",
                  info.present
                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                    : "bg-amber-50 text-amber-700 border-amber-100"
                )}
              >
                {info.present ? "OK" : "Missing"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </AuditCard>
  );
}
