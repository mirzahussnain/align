'use client';

import { ChevronDown } from 'lucide-react';
import { Label, TextField } from './Field';
import { cn } from '@/shared/utils/cn';
import { VISA_STATUSES, visaRequiresExpiry } from '@/shared/constants/visa-status';

export interface VisaValue {
  visaStatus: string;
  visaExpiry: string;
}

const baseField =
  'w-full appearance-none rounded-xl border border-neutral-300 bg-white px-4 py-2.5 pr-9 text-sm text-neutral-900 transition-colors focus:border-accent-purple focus:outline-none focus:ring-2 focus:ring-accent-purple/15';

/**
 * Visa status enum select. Temporary statuses (everything except British/Irish
 * citizen and Settled/ILR) reveal a required expiry date; clearing to a
 * permanent status drops the expiry so stale dates aren't persisted.
 */
export default function VisaStatusPicker({
  value,
  onChange,
}: {
  value: VisaValue;
  onChange: (patch: Partial<VisaValue>) => void;
}) {
  const needsExpiry = visaRequiresExpiry(value.visaStatus);

  return (
    <>
      <div>
        <Label htmlFor="visaStatus">
          Visa status <span className="text-rose-500">*</span>
        </Label>
        <div className="relative">
          <select
            id="visaStatus"
            value={value.visaStatus}
            onChange={(e) => {
              const next = e.target.value;
              onChange({ visaStatus: next, ...(visaRequiresExpiry(next) ? {} : { visaExpiry: '' }) });
            }}
            className={cn(baseField, !value.visaStatus && 'text-neutral-400')}
          >
            <option value="">Select your status</option>
            {VISA_STATUSES.map((o) => (
              <option key={o.value} value={o.value} className="text-neutral-900">
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        </div>
      </div>

      {needsExpiry && (
        <div>
          <Label htmlFor="visaExpiry">
            Visa expiry date <span className="text-rose-500">*</span>
          </Label>
          <TextField
            id="visaExpiry"
            type="date"
            value={value.visaExpiry}
            onChange={(e) => onChange({ visaExpiry: e.target.value })}
          />
        </div>
      )}
    </>
  );
}
