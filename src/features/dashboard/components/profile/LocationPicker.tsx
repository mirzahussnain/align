'use client';

import { useMemo } from 'react';
import { Label } from './Field';
import Combobox, { type ComboOption } from './Combobox';
import { useCountries, useStates, useCities } from './useGeo';

export interface LocationValue {
  city: string;
  state: string;
  country: string;
}

/**
 * Country → State → City cascade backed by /api/geo. Country and city are
 * mandatory; state is optional (and simply empty for countries the API has no
 * states for). Changing a level upstream clears the levels below it.
 */
export default function LocationPicker({
  value,
  onChange,
}: {
  value: LocationValue;
  onChange: (patch: Partial<LocationValue>) => void;
}) {
  const { countries, loading: countriesLoading } = useCountries();
  const { states, loading: statesLoading } = useStates(value.country);
  const { cities, loading: citiesLoading } = useCities(value.country, value.state);

  const countryOptions: ComboOption[] = useMemo(
    () => countries.map((c) => ({ value: c.name, label: c.name, iso2: c.iso2 })),
    [countries]
  );
  const stateOptions: ComboOption[] = useMemo(() => states.map((s) => ({ value: s, label: s })), [states]);
  const cityOptions: ComboOption[] = useMemo(() => cities.map((c) => ({ value: c, label: c })), [cities]);

  const hasCountry = Boolean(value.country);

  return (
    <>
      <div>
        <Label htmlFor="country">
          Country <span className="text-rose-500">*</span>
        </Label>
        <Combobox
          id="country"
          value={value.country}
          onChange={(country) => onChange({ country, state: '', city: '' })}
          options={countryOptions}
          loading={countriesLoading}
          placeholder="Select a country"
        />
      </div>

      <div>
        <Label htmlFor="state">State / region</Label>
        <Combobox
          id="state"
          value={value.state}
          onChange={(state) => onChange({ state, city: '' })}
          options={stateOptions}
          disabled={!hasCountry}
          loading={statesLoading}
          placeholder={!hasCountry ? 'Select a country first' : states.length ? 'Select a state (optional)' : 'No states — skip'}
        />
      </div>

      <div>
        <Label htmlFor="city">
          City <span className="text-rose-500">*</span>
        </Label>
        <Combobox
          id="city"
          value={value.city}
          onChange={(city) => onChange({ city })}
          options={cityOptions}
          disabled={!hasCountry}
          loading={citiesLoading}
          placeholder={!hasCountry ? 'Select a country first' : 'Select a city'}
        />
      </div>
    </>
  );
}
