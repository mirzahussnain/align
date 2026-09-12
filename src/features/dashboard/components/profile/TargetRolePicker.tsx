'use client';

import { Label, TextField } from './Field';
import { occupationOptionsFor, SENIORITY_OPTIONS } from '@/shared/constants/occupation-options';
import { INDUSTRY_IDS } from '@/shared/constants/sector-keywords';
import { SECTOR_LABELS } from '@/shared/constants/sector-labels';

export interface TargetRoleValue {
  targetOccupation: string;
  targetRoleTitle: string;
  targetSeniority: string;
  targetIndustry: string;
}

/**
 * Structured target capture. The evaluation type is a BROAD lens that selects
 * which deterministic rule pack scores this track — it is not meant to name the
 * user's exact job. The exact job lives in the free-text target role, which
 * feeds classification, prompt context, and AI job matching; users are never
 * limited to the ontology.
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
          Career area {required && <span className="text-rose-500">*</span>}
        </Label>
        <select
          id="targetOccupation"
          value={value.targetOccupation}
          onChange={(e) => onChange({ targetOccupation: e.target.value })}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-cyan"
        >
          <option value="">No preference — analyse automatically</option>
          {occupationOptionsFor(value.targetOccupation).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-neutral-400">
          Optional. Adjusts broad CV checks. Your exact target role and job
          description are analysed separately.
        </p>
      </div>
      <div>
        <Label htmlFor="targetRoleTitle">Target role</Label>
        <TextField
          id="targetRoleTitle"
          value={value.targetRoleTitle}
          onChange={(e) => onChange({ targetRoleTitle: e.target.value })}
          placeholder="e.g. Picker/Packer, AI Engineer, Pharmacy Assistant"
        />
        <p className="mt-1 text-[10px] text-neutral-400">
          The exact role you&apos;re going for, in your own words.
        </p>
      </div>
      <div>
        <Label htmlFor="targetSeniority">Seniority (optional)</Label>
        <select
          id="targetSeniority"
          value={value.targetSeniority}
          onChange={(e) => onChange({ targetSeniority: e.target.value })}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-cyan"
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
        <Label htmlFor="targetIndustry">Target sector (optional)</Label>
        <select
          id="targetIndustry"
          value={value.targetIndustry}
          onChange={(e) => onChange({ targetIndustry: e.target.value })}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-cyan"
        >
          <option value="">Not sure</option>
          {INDUSTRY_IDS.map((id) => (
            <option key={id} value={id}>
              {SECTOR_LABELS[id]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-neutral-400">
          Which sector you&apos;re targeting — sharpens keyword scoring beyond your
          evaluation type&apos;s default.
        </p>
      </div>
    </>
  );
}
