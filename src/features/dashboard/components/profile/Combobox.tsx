'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export interface ComboOption {
  value: string;
  label: string;
  /** ISO2 country code — renders a flag image (emoji flags don't show on Windows). */
  iso2?: string;
  /** Optional trailing hint, e.g. a dial code. */
  hint?: string;
  /** What to show in the closed field when selected (falls back to `label`). */
  display?: string;
}

/** Cross-platform flag: an SVG from flagcdn, since Windows won't render flag emoji. */
function Flag({ iso2, className }: { iso2?: string; className?: string }) {
  if (!iso2) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/${iso2.toLowerCase()}.svg`}
      alt=""
      aria-hidden
      className={cn('h-3.5 w-5 shrink-0 rounded-[2px] object-cover', className)}
      loading="lazy"
    />
  );
}

// The border/background/focus ring live on a flex CONTAINER matching sibling
// inputs (grey bg-tertiary + subtle border, from the global input rule); the flag
// is a real leading flex child and the input is a `.combo-input` reset that drops
// its own border/bg so the whole control reads as one cohesive field.
const fieldWrap =
  'flex items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-tertiary px-3.5 py-2.5 text-sm text-neutral-900 transition-colors focus-within:border-accent-purple focus-within:ring-2 focus-within:ring-accent-purple/15';
const bareInput = 'combo-input min-w-0 flex-1 placeholder:text-neutral-400 focus:outline-none';

/**
 * Lightweight searchable single-select. Renders a text input that filters a
 * (potentially long) option list on type and commits a value on click. Used for
 * country / state / city / dial-code pickers where a native <select> of a few
 * hundred entries would be unwieldy.
 */
export default function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  loading = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const shown = filtered.slice(0, 100);

  function commit(v: string) {
    onChange(v);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={rootRef} className="relative">
      <div className={cn(fieldWrap, (disabled || loading) && 'cursor-not-allowed bg-neutral-50')}>
        {selected?.iso2 && !open && <Flag iso2={selected.iso2} />}
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          className={cn(bareInput, (disabled || loading) && 'text-neutral-400')}
          value={open ? query : selected?.display ?? selected?.label ?? ''}
          placeholder={loading ? 'Loading…' : placeholder}
          disabled={disabled || loading}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
        />
        <span className="pointer-events-none shrink-0 text-neutral-400">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </div>

      {open && !disabled && !loading && (
        <ul id={listboxId} role="listbox" className="absolute z-30 mt-1 max-h-60 w-full min-w-60 overflow-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
          {shown.length === 0 ? (
            <li className="px-4 py-2 text-xs text-neutral-400">No matches</li>
          ) : (
            shown.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => commit(o.value)}
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-neutral-100',
                    o.value === value ? 'font-semibold text-accent-purple' : 'text-neutral-700'
                  )}
                >
                  <Flag iso2={o.iso2} />
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-xs text-neutral-400">{o.hint}</span>}
                  {o.value === value && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              </li>
            ))
          )}
          {filtered.length > shown.length && (
            <li className="px-4 py-1.5 text-[11px] text-neutral-400">Keep typing to narrow {filtered.length} results…</li>
          )}
        </ul>
      )}
    </div>
  );
}
