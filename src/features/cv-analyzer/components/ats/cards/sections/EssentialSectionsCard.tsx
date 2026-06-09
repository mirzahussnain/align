import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import AuditCard from '../../AuditCard';

interface EssentialSectionsCardProps {
  rawText: string;
}

export default function EssentialSectionsCard({ rawText }: EssentialSectionsCardProps) {
  const lowercaseText = rawText.toLowerCase();
  
  const hasSummary = lowercaseText.includes('summary') || lowercaseText.includes('profile');
  const hasExperience = lowercaseText.includes('experience') || lowercaseText.includes('work');
  const hasSkills = lowercaseText.includes('skills') || lowercaseText.includes('expertise');
  const hasEducation = lowercaseText.includes('education') || lowercaseText.includes('degree');
  
  const isPassed = hasSummary && hasExperience && hasSkills && hasEducation;

  const sections = [
    { label: 'Summary', present: hasSummary },
    { label: 'Experience', present: hasExperience },
    { label: 'Skills', present: hasSkills },
    { label: 'Education', present: hasEducation },
  ];

  return (
    <AuditCard
      id="essentialSections"
      title="Essential Sections"
      subtitle="Verifies presence of core recruitment sections"
      score={isPassed ? 'Complete' : 'Incomplete'}
      scoreStatus={isPassed ? 'excellent' : 'critical'}
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          UK standard layouts require explicit section headers (Summary/Profile, Work Experience, Skills, Education) so ATS parsers can group and analyze data correctly.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {sections.map((section, idx) => (
            <div
              key={idx}
              className={cn(
                "p-3 rounded-xl border text-center flex flex-col items-center justify-center gap-1.5",
                section.present
                  ? "bg-emerald-50/10 border-emerald-100 text-emerald-800"
                  : "bg-rose-50/10 border-rose-100 text-rose-800"
              )}
            >
              {section.present ? <CheckCircle size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-rose-500" />}
              <span className="text-xs font-bold">{section.label}</span>
            </div>
          ))}
        </div>
      </div>
    </AuditCard>
  );
}
