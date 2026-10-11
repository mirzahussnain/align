import { AlertTriangle, CheckCircle2, HelpCircle, MinusCircle, MapPinned } from 'lucide-react';

import type {
  PracticalCompatibilityItem,
  PracticalCompatibilityViewModel,
} from '@/shared/types/practical-compatibility';
import { cn } from '@/shared/utils/cn';

const CATEGORY_LABELS: Record<PracticalCompatibilityItem['category'], string> = {
  RIGHT_TO_WORK: 'Right to work', SPONSORSHIP: 'Sponsorship', VISA_DURATION: 'Visa duration',
  LOCATION: 'Location', RELOCATION: 'Relocation', COMMUTE: 'Commute',
  REMOTE_ONSITE: 'Work style', DRIVING_LICENCE: 'Driving licence', VEHICLE: 'Vehicle access',
  DBS: 'DBS check', SECURITY_CLEARANCE: 'Security clearance', UK_RESIDENCY: 'UK residency',
  PROFESSIONAL_REGISTRATION: 'Professional registration', SHIFT_AVAILABILITY: 'Shift availability',
  TRAVEL: 'Travel',
};

function presentation(item: PracticalCompatibilityItem) {
  if (item.state === 'CONFIRMED') return { label: 'Compatible', icon: CheckCircle2, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
  if (item.state === 'NOT_APPLICABLE') return { label: 'No preference', icon: MinusCircle, tone: 'border-slate-200 bg-slate-50 text-slate-600' };
  if (item.state === 'UNKNOWN') return { label: item.category === 'COMMUTE' ? 'Not verified' : 'Review needed', icon: HelpCircle, tone: 'border-amber-200 bg-amber-50 text-amber-800' };
  const preference = item.category === 'REMOTE_ONSITE' || item.category === 'RELOCATION';
  return { label: preference ? 'Preference mismatch' : 'Potential conflict', icon: AlertTriangle, tone: 'border-rose-200 bg-rose-50 text-rose-800' };
}

export default function PracticalCompatibilityPanel({
  compatibility,
}: {
  compatibility: PracticalCompatibilityViewModel;
}) {
  return (
    <section className="rounded-[32px] border border-slate-200/60 bg-bg-panel p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
          <MapPinned size={24} aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-800">Practical compatibility</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Location, work-style and eligibility facts, shown separately from your CV match score.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {compatibility.items.map((item, index) => {
          const status = presentation(item);
          const Icon = status.icon;
          return (
            <article key={`${item.category}-${item.vacancyRequirement ?? index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">{CATEGORY_LABELS[item.category]}</h3>
                <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide', status.tone)}>
                  <Icon size={12} aria-hidden="true" /> {status.label}
                </span>
              </div>
              {item.vacancyRequirement && <p className="mt-3 text-xs font-semibold text-slate-700">Vacancy: {item.vacancyRequirement}</p>}
              {item.confirmedProfileFact && <p className="mt-1 text-xs text-slate-600">Profile snapshot: {item.confirmedProfileFact}</p>}
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.explanation}</p>
            </article>
          );
        })}
      </div>

      <p className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
        {compatibility.disclaimer}
      </p>
    </section>
  );
}
