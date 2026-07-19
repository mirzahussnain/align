'use client';

import { useMemo } from 'react';
import { Label, TextField } from './Field';
import Combobox, { type ComboOption } from './Combobox';
import { useCountries } from './useGeo';

export interface PhoneValue {
  phoneDialCode: string;
  phoneNumber: string;
  /** ISO2 of the chosen country — persisted so codes shared by several countries
   *  (e.g. +44 for the UK, Jersey, Guernsey) resolve to the right flag on reload. */
  phoneCountry: string;
}

/**
 * Dial-code picker (flag + country + code) plus a number field. The combobox is
 * keyed by ISO2 so countries that share a code stay distinct; we persist both the
 * ISO2 (`phoneCountry`) and the dial code, falling back to the first country with
 * that code only for legacy rows saved before `phoneCountry` existed.
 */
export default function PhonePicker({
  value,
  onChange,
}: {
  value: PhoneValue;
  onChange: (patch: Partial<PhoneValue>) => void;
}) {
  const { countries, loading } = useCountries();

  const options: ComboOption[] = useMemo(
    () =>
      countries.map((c) => ({
        value: c.iso2,
        // Full name (+ code) is searchable in the list…
        label: c.dialCode ? `${c.name} (${c.dialCode})` : c.name,
        iso2: c.iso2,
        hint: c.dialCode,
        // …but the closed field shows just the dial code beside the flag.
        display: c.dialCode,
      })),
    [countries]
  );

  // Prefer the persisted ISO2; fall back to the first country with the saved code.
  const selectedIso2 =
    value.phoneCountry ||
    (value.phoneDialCode ? countries.find((c) => c.dialCode === value.phoneDialCode)?.iso2 ?? '' : '');

  return (
    <div>
      <Label>Phone</Label>
      <div className="grid grid-cols-[7.2rem_1fr] gap-3">
        <Combobox
          value={selectedIso2}
          onChange={(iso2) =>
            onChange({ phoneCountry: iso2, phoneDialCode: countries.find((c) => c.iso2 === iso2)?.dialCode ?? '' })
          }
          options={options}
          loading={loading}
          placeholder="Code"
        />
        <TextField
          type="tel"
          inputMode="tel"
          value={value.phoneNumber}
          onChange={(e) => onChange({ phoneNumber: e.target.value })}
          placeholder="7700 900000"
        />
      </div>
    </div>
  );
}
