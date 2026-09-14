import { describe, it, expect } from 'vitest';
import { OCCUPATION_OPTIONS, occupationOptionsFor } from '../occupation-options';

describe('evaluation-type options', () => {
  it('does not offer a regulated occupation for self-selection', () => {
    // A user must never be able to pick the nurse rule pack for themselves —
    // it carries a mandatory NMC credential rule that penalises anyone who is
    // not actually a registered nurse. It is reachable only via CV evidence or
    // a job description.
    expect(OCCUPATION_OPTIONS.some(o => o.value === 'registered_nurse')).toBe(false);
  });

  it('offers the broad evaluation types with discipline-style labels', () => {
    const byValue = Object.fromEntries(OCCUPATION_OPTIONS.map(o => [o.value, o.label]));
    expect(byValue.software_engineer).toBe('Software Engineering');
    expect(byValue.warehouse_operative).toBe('Frontline Operations');
    expect(byValue.administrator).toBe('Administration & Office Support');
    expect(byValue.generic).toBe('General / Other');
  });

  it('preserves a stored regulated value so an existing profile is not silently reset', () => {
    // A profile saved while the nurse type was selectable must still render it,
    // or the next save writes null and changes how that track scores.
    const opts = occupationOptionsFor('registered_nurse');
    expect(opts.some(o => o.value === 'registered_nurse')).toBe(true);
  });

  it('does not duplicate a stored value that is already selectable', () => {
    const opts = occupationOptionsFor('software_engineer');
    expect(opts.filter(o => o.value === 'software_engineer')).toHaveLength(1);
  });

  it('returns the plain option list for an unset or unknown stored value', () => {
    expect(occupationOptionsFor('')).toEqual(OCCUPATION_OPTIONS);
    expect(occupationOptionsFor(null)).toEqual(OCCUPATION_OPTIONS);
    expect(occupationOptionsFor('astronaut')).toEqual(OCCUPATION_OPTIONS);
  });
});
