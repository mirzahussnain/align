'use client';

import { Label, TextField } from './Field';
import { OCCUPATION_OPTIONS, SENIORITY_OPTIONS } from '@/shared/constants/occupation-options';
import { INDUSTRY_IDS } from '@/shared/constants/sector-keywords';
import { SECTOR_LABELS } from '@/shared/constants/sector-labels';

export interface TargetRoleValue {
  targetOccupation: string;
  targetRoleTitle: string;
  targetSeniority: string;
  targetIndustry: string;
}

/**
 * Structured target-role capture: the occupation drives which evaluation
 * profile scores this track's analyses, the free-text title keeps the user's
 * own words (never limited to the ontology), seniority is optional.
 */
export default function TargetRolePicker({
  value,
  onChange,
  required = false,
}: {
  value: TargetRoleValue;
  onChange: (patch: Partial<TargetRoleValue>) => void;
  required?: boolean;
}) {
  return (
    <>
      <div>
        <Label htmlFor="targetOccupation">
          Target occupation {required && <span className="text-rose-500">*</span>}
        </Label>
        <select
          id="targetOccupation"
          value={value.targetOccupation}
          onChange={(e) => onChange({ targetOccupation: e.target.value })}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-purple"
        >
          <option value="">Select an occupation…</option>
          {OCCUPATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-neutral-400">
          Sets how your CV is evaluated — pick the closest match.
        </p>
      </div>
      <div>
        <Label htmlFor="targetRoleTitle">Target role title</Label>
        <TextField
          id="targetRoleTitle"
          value={value.targetRoleTitle}
          onChange={(e) => onChange({ targetRoleTitle: e.target.value })}
          placeholder="e.g. Warehouse Administrator"
        />
      </div>
      <div>
        <Label htmlFor="targetSeniority">Seniority (optional)</Label>
        <select
          id="targetSeniority"
          value={value.targetSeniority}
          onChange={(e) => onChange({ targetSeniority: e.target.value })}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-purple"
        >
          <option value="">Not sure</option>
          {SENIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="targetIndustry">Target industry (optional)</Label>
        <select
          id="targetIndustry"
          value={value.targetIndustry}
          onChange={(e) => onChange({ targetIndustry: e.target.value })}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-purple"
        >
          <option value="">Not sure</option>
          {INDUSTRY_IDS.map((id) => (
            <option key={id} value={id}>
              {SECTOR_LABELS[id]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-neutral-400">
          Which sector you&apos;re targeting — sharpens keyword scoring beyond your occupation&apos;s default.
        </p>
      </div>
    </>
  );
}
