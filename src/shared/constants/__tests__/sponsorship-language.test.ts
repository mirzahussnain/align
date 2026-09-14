import { describe, expect, it } from 'vitest';
import {
  BANNED_SPONSORSHIP_PHRASES,
  SPONSOR_REGISTER_DISCLAIMER,
  SPONSOR_REGISTER_EXPLANATIONS,
  SPONSOR_REGISTER_LABELS,
  VACANCY_SPONSORSHIP_EXPLANATIONS,
  VACANCY_SPONSORSHIP_LABELS,
} from '@/shared/constants/sponsorship-language';

const everyString = [
  ...Object.values(SPONSOR_REGISTER_LABELS),
  ...Object.values(SPONSOR_REGISTER_EXPLANATIONS),
  ...Object.values(VACANCY_SPONSORSHIP_LABELS),
  ...Object.values(VACANCY_SPONSORSHIP_EXPLANATIONS),
  SPONSOR_REGISTER_DISCLAIMER,
];

describe('sponsorship language', () => {
  it('never uses a phrase that asserts sponsorship the evidence cannot support', () => {
    for (const phrase of BANNED_SPONSORSHIP_PHRASES) {
      for (const text of everyString) {
        expect(text.toLowerCase(), `"${text}" contains banned phrase "${phrase}"`).not.toContain(phrase);
      }
    }
  });

  it('covers every register status and every vacancy wording', () => {
    expect(Object.keys(SPONSOR_REGISTER_LABELS).sort()).toEqual(['AMBIGUOUS', 'EXACT', 'LIKELY', 'NONE']);
    expect(Object.keys(VACANCY_SPONSORSHIP_LABELS).sort()).toEqual([
      'EXPLICITLY_AVAILABLE',
      'EXPLICITLY_UNAVAILABLE',
      'NOT_MENTIONED',
      'POSSIBLY_AVAILABLE',
      'RIGHT_TO_WORK_REQUIRED',
    ]);
    expect(Object.keys(SPONSOR_REGISTER_EXPLANATIONS).sort()).toEqual(Object.keys(SPONSOR_REGISTER_LABELS).sort());
    expect(Object.keys(VACANCY_SPONSORSHIP_EXPLANATIONS).sort()).toEqual(Object.keys(VACANCY_SPONSORSHIP_LABELS).sort());
  });

  it('keeps company-level wording about the employer, not about the vacancy', () => {
    // A register match is evidence about a licence. If these strings said
    // "vacancy" or "role", the badge would read as a promise about the job.
    for (const text of Object.values(SPONSOR_REGISTER_LABELS)) {
      expect(text.toLowerCase()).not.toContain('vacancy');
      expect(text.toLowerCase()).not.toContain('this role');
    }
    expect(SPONSOR_REGISTER_LABELS.EXACT).toBe('Appears on sponsor register');
    // An uncertain match must read as uncertain, never as a confirmed one.
    expect(SPONSOR_REGISTER_LABELS.LIKELY).toContain('Possible');
  });

  it('keeps vacancy-level wording about the advert, not about the register', () => {
    for (const text of [
      ...Object.values(VACANCY_SPONSORSHIP_LABELS),
      ...Object.values(VACANCY_SPONSORSHIP_EXPLANATIONS),
    ]) {
      expect(text.toLowerCase()).not.toContain('register');
    }
  });

  it('distinguishes "no sponsorship stated" from "no wording detected"', () => {
    // Silence is not a refusal: an advert that says nothing must never be
    // presented as one that rules sponsorship out.
    expect(VACANCY_SPONSORSHIP_LABELS.EXPLICITLY_UNAVAILABLE).not.toBe(
      VACANCY_SPONSORSHIP_LABELS.NOT_MENTIONED
    );
    expect(VACANCY_SPONSORSHIP_LABELS.NOT_MENTIONED.toLowerCase()).toContain('detected');
  });

  it('states plainly that a register match is not a sponsorship offer', () => {
    expect(SPONSOR_REGISTER_DISCLAIMER.toLowerCase()).toContain('does not mean this vacancy offers sponsorship');
  });
});
