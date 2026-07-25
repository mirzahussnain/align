'use client';

import { useEffect, useState } from 'react';
import { searchSkillTaxonomy } from '@/features/dashboard/actions/profile-actions';
import { TextField } from './Field';
import type { SkillTaxonomySearchResult } from '@/shared/services/skill-taxonomy';

/** Free-entry field with optional, local ESCO suggestions. */
export default function SkillTaxonomyPicker({
  id,
  value,
  taxonomyTermId,
  onChange,
  onTaxonomyTermChange,
}: {
  id: string;
  value: string;
  taxonomyTermId?: string;
  onChange: (value: string) => void;
  onTaxonomyTermChange: (id: string) => void;
}) {
  const [results, setResults] = useState<SkillTaxonomySearchResult[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = value.trim();
    const timer = window.setTimeout(() => {
      if (query.length < 2) { setResults([]); return; }
      searchSkillTaxonomy(query, 10).then(setResults).catch(() => setResults([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <div className="relative">
      <TextField
        id={id}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-suggestions`}
        onFocus={() => setOpen(true)}
        onChange={(event) => { onChange(event.target.value); onTaxonomyTermChange(''); setOpen(true); }}
        placeholder="Search for a skill"
      />
      {open && value.trim().length >= 2 && (
        <div id={`${id}-suggestions`} role="listbox" className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
          {results.length > 0 && <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Suggested skills</p>}
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              role="option"
              aria-selected={taxonomyTermId === result.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(result.preferredLabel); onTaxonomyTermChange(result.id); setOpen(false); }}
              className="block w-full px-3 py-2 text-left hover:bg-neutral-50"
            >
              <span className="block text-sm font-medium text-neutral-800">{result.preferredLabel}</span>
              <span className="block text-xs text-neutral-500">{result.matchedLabel ? `Matched term: ${result.matchedLabel} · ` : ''}ESCO</span>
              {result.description && <span className="mt-0.5 block line-clamp-2 text-xs text-neutral-400">{result.description}</span>}
            </button>
          ))}
          <div className="border-t border-neutral-100 p-2">
            <button type="button" onClick={() => { onTaxonomyTermChange(''); setOpen(false); }} className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-50">
              Use “{value.trim()}” as a custom skill
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
