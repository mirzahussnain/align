import { describe, expect, it } from 'vitest';

import { extractVacancyRequirements } from '@/shared/services/job-intelligence';
import {
  assessLocationCompatibility,
  comparePracticalCompatibility,
} from '@/shared/services/practical-compatibility';
import type { ConfirmedCandidateFacts } from '@/shared/types/practical-compatibility';
import type { VacancyRequirementEvidence } from '@/shared/types/job-intelligence';

const facts = (over: Partial<ConfirmedCandidateFacts> = {}): ConfirmedCandidateFacts => ({
  professionalRegistrations: [],
  ...over,
});

const requirement = (
  category: VacancyRequirementEvidence['category'],
  over: Partial<VacancyRequirementEvidence> = {},
): VacancyRequirementEvidence => ({
  category,
  requirement: 'REQUIRED',
  evidenceText: `The vacancy states a ${category} requirement.`,
  confidence: 'HIGH',
  ...over,
});

const itemFor = (
  result: ReturnType<typeof comparePracticalCompatibility>,
  category: string,
) => result.items.find((item) => item.category === category);

describe('right to work and sponsorship', () => {
  it('confirms right to work from a recorded status', () => {
    const result = comparePracticalCompatibility(
      [requirement('RIGHT_TO_WORK')],
      facts({ hasCurrentRightToWork: true, visaStatusLabel: 'British citizen' }),
    );
    expect(itemFor(result, 'RIGHT_TO_WORK')).toMatchObject({
      state: 'CONFIRMED',
      confirmedProfileFact: 'British citizen',
    });
  });

  it('keeps right to work UNKNOWN when the profile does not confirm it', () => {
    const result = comparePracticalCompatibility([requirement('RIGHT_TO_WORK')], facts());
    // Crucially not CONFLICT. Nothing in the profile says the candidate lacks it.
    expect(itemFor(result, 'RIGHT_TO_WORK')?.state).toBe('UNKNOWN');
  });

  it('reports an explicit sponsorship conflict when both sides are recorded', () => {
    const result = comparePracticalCompatibility(
      [requirement('SPONSORSHIP')],
      facts({ requiresSponsorshipNow: true }),
      { sponsorshipSignal: 'NOT_AVAILABLE' },
    );
    expect(itemFor(result, 'SPONSORSHIP')).toMatchObject({ state: 'CONFLICT', source: 'BOTH' });
  });

  it('keeps sponsorship UNKNOWN when the profile does not record the answer', () => {
    const result = comparePracticalCompatibility(
      [requirement('SPONSORSHIP')],
      facts(),
      { sponsorshipSignal: 'NOT_AVAILABLE' },
    );
    expect(itemFor(result, 'SPONSORSHIP')?.state).toBe('UNKNOWN');
  });

  it('does not read an unstated vacancy sponsorship position as a refusal', () => {
    const result = comparePracticalCompatibility([], facts({ requiresSponsorshipNow: true }), {
      sponsorshipSignal: 'NOT_MENTIONED',
    });
    expect(itemFor(result, 'SPONSORSHIP')).toBeUndefined();
  });

  it('states a factual visa timeline without concluding anything about entitlement', () => {
    const result = comparePracticalCompatibility(
      [requirement('SPONSORSHIP')],
      facts({ visaExpiry: '2027-12-01T00:00:00.000Z', mayRequireSponsorshipLater: true }),
      { sponsorshipSignal: 'NOT_AVAILABLE' },
    );
    const item = itemFor(result, 'VISA_DURATION');
    expect(item?.confirmedProfileFact).toMatch(/December 2027/);
    expect(item?.explanation).toMatch(/may be relevant for employment continuing beyond that date/i);
    expect(item?.state).toBe('UNKNOWN');
  });
});

describe('location', () => {
  it('is COMPATIBLE for a matching city', () => {
    expect(
      assessLocationCompatibility(facts({ homeCity: 'Birmingham' }), { city: 'birmingham', locationText: 'Birmingham' }).state,
    ).toBe('COMPATIBLE');
  });

  it('is COMPATIBLE for a remote vacancy without needing a home location', () => {
    expect(assessLocationCompatibility(facts(), { workStyle: 'REMOTE' }).state).toBe('COMPATIBLE');
  });

  it('CONFLICTS only when the profile explicitly refuses relocation', () => {
    expect(
      assessLocationCompatibility(facts({ homeCity: 'Birmingham', openToRelocation: false }), { city: 'Glasgow' }).state,
    ).toBe('CONFLICT');
  });

  it('is UNKNOWN when relocation willingness is simply not recorded', () => {
    expect(
      assessLocationCompatibility(facts({ homeCity: 'Birmingham' }), { city: 'Glasgow' }).state,
    ).toBe('UNKNOWN');
  });

  it('is UNKNOWN, with a plain explanation, when no home location is recorded', () => {
    const assessment = assessLocationCompatibility(facts(), { city: 'Glasgow' });
    expect(assessment.state).toBe('UNKNOWN');
    expect(assessment.explanation).toMatch(/cannot be confirmed from your profile/i);
  });

  it('treats a named relocation list as a boundary in both directions', () => {
    expect(
      assessLocationCompatibility(
        facts({ homeCity: 'Birmingham', openToRelocation: true, relocationLocations: ['Manchester'] }),
        { city: 'Manchester' },
      ).state,
    ).toBe('POSSIBLY_COMPATIBLE');
    expect(
      assessLocationCompatibility(
        facts({ homeCity: 'Birmingham', openToRelocation: true, relocationLocations: ['Manchester'] }),
        { city: 'Aberdeen' },
      ).state,
    ).toBe('CONFLICT');
  });

  it('never guesses a commute from a recorded limit alone', () => {
    const result = comparePracticalCompatibility(
      [],
      facts({ homeCity: 'Birmingham', maxCommuteMinutes: 45 }),
      { city: 'Glasgow', locationText: 'Glasgow' },
    );
    const commute = itemFor(result, 'COMMUTE');
    expect(commute?.state).toBe('UNKNOWN');
    expect(commute?.explanation).toMatch(/no journey-time information is available/i);
  });
});

describe('mobility, checks and regulation', () => {
  it('confirms a recorded driving licence', () => {
    const result = comparePracticalCompatibility([requirement('DRIVING_LICENCE')], facts({ drivingLicenceHeld: true }));
    expect(itemFor(result, 'DRIVING_LICENCE')?.state).toBe('CONFIRMED');
  });

  it('conflicts on an explicitly absent driving licence', () => {
    const result = comparePracticalCompatibility([requirement('DRIVING_LICENCE')], facts({ drivingLicenceHeld: false }));
    expect(itemFor(result, 'DRIVING_LICENCE')?.state).toBe('CONFLICT');
  });

  it('keeps an unrecorded driving licence UNKNOWN', () => {
    const result = comparePracticalCompatibility([requirement('DRIVING_LICENCE')], facts());
    expect(itemFor(result, 'DRIVING_LICENCE')).toMatchObject({ state: 'UNKNOWN', source: 'VACANCY' });
  });

  it('does not turn a PREFERRED requirement into a conflict', () => {
    const result = comparePracticalCompatibility(
      [requirement('DRIVING_LICENCE', { requirement: 'PREFERRED' })],
      facts({ drivingLicenceHeld: false }),
    );
    expect(itemFor(result, 'DRIVING_LICENCE')?.state).toBe('UNKNOWN');
  });

  it('handles vehicle availability in all three states', () => {
    expect(itemFor(comparePracticalCompatibility([requirement('OWN_VEHICLE')], facts({ ownVehicleAvailable: true })), 'VEHICLE')?.state).toBe('CONFIRMED');
    expect(itemFor(comparePracticalCompatibility([requirement('OWN_VEHICLE')], facts({ ownVehicleAvailable: false })), 'VEHICLE')?.state).toBe('CONFLICT');
    expect(itemFor(comparePracticalCompatibility([requirement('OWN_VEHICLE')], facts()), 'VEHICLE')?.state).toBe('UNKNOWN');
  });

  it('reports a required DBS as UNKNOWN when the profile records nothing', () => {
    const result = comparePracticalCompatibility([requirement('DBS', { value: 'ENHANCED' })], facts());
    expect(itemFor(result, 'DBS')).toMatchObject({ state: 'UNKNOWN', source: 'VACANCY' });
    expect(itemFor(result, 'DBS')?.explanation).toMatch(/not recorded in your profile/i);
  });

  it('confirms a DBS at or above the level the vacancy states', () => {
    expect(itemFor(comparePracticalCompatibility([requirement('DBS', { value: 'STANDARD' })], facts({ dbsCheckLevel: 'ENHANCED' })), 'DBS')?.state).toBe('CONFIRMED');
    expect(itemFor(comparePracticalCompatibility([requirement('DBS', { value: 'ENHANCED' })], facts({ dbsCheckLevel: 'BASIC' })), 'DBS')?.state).toBe('CONFLICT');
  });

  it('reports required clearance as UNKNOWN when the profile records nothing', () => {
    const result = comparePracticalCompatibility([requirement('SECURITY_CLEARANCE', { value: 'SC' })], facts());
    expect(itemFor(result, 'SECURITY_CLEARANCE')?.state).toBe('UNKNOWN');
  });

  it('does not conflict on clearance the vacancy only says you must be able to obtain', () => {
    const result = comparePracticalCompatibility(
      [requirement('SECURITY_CLEARANCE', { value: 'SC', requirement: 'MENTIONED' })],
      facts({ securityClearance: 'NONE' }),
    );
    expect(itemFor(result, 'SECURITY_CLEARANCE')?.state).toBe('UNKNOWN');
  });

  it('confirms sufficient UK residency and conflicts on explicitly insufficient residency', () => {
    const now = new Date('2026-07-29T00:00:00.000Z');
    const enough = comparePracticalCompatibility(
      [requirement('UK_RESIDENCY', { value: 'five years UK residency' })],
      facts({ ukResidencyStartDate: '2015-01-01T00:00:00.000Z' }),
      {},
      now,
    );
    expect(itemFor(enough, 'UK_RESIDENCY')?.state).toBe('CONFIRMED');

    const short = comparePracticalCompatibility(
      [requirement('UK_RESIDENCY', { value: 'five years UK residency' })],
      facts({ ukResidencyStartDate: '2025-01-01T00:00:00.000Z' }),
      {},
      now,
    );
    expect(itemFor(short, 'UK_RESIDENCY')?.state).toBe('CONFLICT');
  });

  it('keeps UK residency UNKNOWN when no start date is recorded', () => {
    const result = comparePracticalCompatibility([requirement('UK_RESIDENCY', { value: 'five years' })], facts());
    expect(itemFor(result, 'UK_RESIDENCY')?.state).toBe('UNKNOWN');
  });

  it('confirms an active professional registration with the named body', () => {
    const result = comparePracticalCompatibility(
      [requirement('PROFESSIONAL_REGISTRATION', { value: 'NMC' })],
      facts({ professionalRegistrations: [{ body: 'NMC', status: 'ACTIVE' }] }),
    );
    expect(itemFor(result, 'PROFESSIONAL_REGISTRATION')?.state).toBe('CONFIRMED');
  });

  it('does not treat a registration with a different body as a match', () => {
    const result = comparePracticalCompatibility(
      [requirement('PROFESSIONAL_REGISTRATION', { value: 'NMC' })],
      facts({ professionalRegistrations: [{ body: 'HCPC', status: 'ACTIVE' }] }),
    );
    expect(itemFor(result, 'PROFESSIONAL_REGISTRATION')?.state).toBe('UNKNOWN');
  });
});

describe('work pattern, shifts and travel', () => {
  it('conflicts only when a remote-only preference meets an on-site vacancy', () => {
    expect(itemFor(comparePracticalCompatibility([requirement('ONSITE')], facts({ workPatternPreference: 'REMOTE_ONLY' })), 'REMOTE_ONSITE')?.state).toBe('CONFLICT');
    expect(itemFor(comparePracticalCompatibility([requirement('ONSITE')], facts({ workPatternPreference: 'HYBRID' })), 'REMOTE_ONSITE')?.state).toBe('CONFIRMED');
    expect(itemFor(comparePracticalCompatibility([requirement('ONSITE')], facts()), 'REMOTE_ONSITE')?.state).toBe('UNKNOWN');
  });

  it('compares the specific shift the vacancy names', () => {
    const night = requirement('SHIFT_PATTERN', { value: 'NIGHT', requirement: 'MENTIONED' });
    expect(itemFor(comparePracticalCompatibility([night], facts({ availableForNightShifts: false })), 'SHIFT_AVAILABILITY')?.state).toBe('CONFLICT');
    expect(itemFor(comparePracticalCompatibility([night], facts({ availableForNightShifts: true })), 'SHIFT_AVAILABILITY')?.state).toBe('CONFIRMED');
    // Weekend availability says nothing about night shifts.
    expect(itemFor(comparePracticalCompatibility([night], facts({ availableForWeekendShifts: true })), 'SHIFT_AVAILABILITY')?.state).toBe('UNKNOWN');
  });

  it('handles travel in all three states', () => {
    const travel = requirement('TRAVEL', { requirement: 'REQUIRED' });
    expect(itemFor(comparePracticalCompatibility([travel], facts({ willingToTravel: true })), 'TRAVEL')?.state).toBe('CONFIRMED');
    expect(itemFor(comparePracticalCompatibility([travel], facts({ willingToTravel: false })), 'TRAVEL')?.state).toBe('CONFLICT');
    expect(itemFor(comparePracticalCompatibility([travel], facts()), 'TRAVEL')?.state).toBe('UNKNOWN');
  });
});

describe('product boundaries', () => {
  it('emits no percentage, score or overall verdict anywhere in the payload', () => {
    const result = comparePracticalCompatibility(
      extractVacancyRequirements('No visa sponsorship. Full UK driving licence required. Enhanced DBS check required.'),
      facts({ drivingLicenceHeld: false, homeCity: 'Leeds' }),
      { city: 'Leeds', sponsorshipSignal: 'NOT_AVAILABLE' },
    );
    const serialised = JSON.stringify(result);
    expect(serialised).not.toMatch(/%|"score"|"percentage"|"overall"/i);
    expect(result).not.toHaveProperty('score');
    expect(result).not.toHaveProperty('overall');
  });

  it('never states a legal conclusion', () => {
    const result = comparePracticalCompatibility(
      extractVacancyRequirements('We cannot offer sponsorship. You must already have the right to work in the UK.'),
      facts({ requiresSponsorshipNow: true, visaExpiry: '2027-12-01T00:00:00.000Z' }),
      { sponsorshipSignal: 'NOT_AVAILABLE' },
    );
    const serialised = JSON.stringify(result);
    expect(serialised).not.toMatch(/legally eligible|you will qualify|must sponsor you|cannot apply|ineligible|guaranteed/i);
    expect(result.disclaimer).toMatch(/not legal or immigration advice/i);
  });

  it('counts each state and offers only genuinely updatable categories', () => {
    const result = comparePracticalCompatibility(
      [requirement('DRIVING_LICENCE'), requirement('DBS', { value: 'ENHANCED' })],
      facts({ drivingLicenceHeld: true, homeCity: 'Leeds' }),
      { city: 'Leeds' },
    );
    expect(result.summary.confirmed).toBeGreaterThanOrEqual(2); // Licence + location.
    expect(result.summary.conflicts).toBe(0);
    expect(result.summary.unknown).toBe(1); // DBS.
    expect(result.updatableCategories).toEqual(['DBS']);
  });

  it('reads only the structured facts it was given, never free-form prose', () => {
    // The comparison's entire input surface is the two arguments below. There is
    // no description, CV, extraction or summary field on either, so there is
    // nothing for it to infer a fact from even if it wanted to.
    const result = comparePracticalCompatibility([requirement('DRIVING_LICENCE')], facts());
    expect(itemFor(result, 'DRIVING_LICENCE')?.confirmedProfileFact).toBeUndefined();
    expect(comparePracticalCompatibility.length).toBeLessThanOrEqual(4);
  });

  it('produces no duplicate rows when the extractor fires the same rule twice', () => {
    const result = comparePracticalCompatibility(
      [requirement('DRIVING_LICENCE'), requirement('DRIVING_LICENCE')],
      facts({ drivingLicenceHeld: true }),
    );
    expect(result.items.filter((item) => item.category === 'DRIVING_LICENCE')).toHaveLength(1);
  });

  it('ignores requirements the extractor marked as not detected', () => {
    const result = comparePracticalCompatibility(
      [requirement('DRIVING_LICENCE', { requirement: 'NOT_DETECTED' })],
      facts({ drivingLicenceHeld: false }),
    );
    expect(itemFor(result, 'DRIVING_LICENCE')).toBeUndefined();
  });
});
