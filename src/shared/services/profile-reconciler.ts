import type { ProfileData } from '@/features/dashboard/data/load-profile';
import type {
  ProfileCandidate,
  ProfileSwap,
  RawProfileSwap,
  ProfileReconciliation,
} from '@/shared/types/profile-reasoning';
import { generateJSONFromAI } from './ai-orchestrator';
// Dates and employment type are described to the model in human form: "Jan 2022
// – Present" is what it can reason about, where "2022-01" and "FULL_TIME" are
// noise it has to decode first.
import { employmentTypeLabel } from '@/shared/constants/employment-type';
import { formatDateRange } from '@/shared/utils/date';
import { THINKING_BUDGETS } from '@/shared/lib/config';

/**
 * Flatten a profile into addressable items. Ids are structural (`project:2`,
 * `skill:1:4`) so they are stable for a given profile snapshot and can be
 * resolved back without a database round-trip.
 */
export function buildProfileCandidates(profile: ProfileData): ProfileCandidate[] {
  const candidates: ProfileCandidate[] = [];

  profile.projects.forEach((p, i) => {
    candidates.push({
      id: `project:${i}`,
      kind: 'project',
      label: p.name,
      detail: [
        p.stack && `Stack: ${p.stack}`,
        formatDateRange(p.startDate, p.endDate),
        ...p.achievements,
      ]
        .filter(Boolean)
        .join('. '),
    });
  });

  profile.experience.forEach((e, i) => {
    candidates.push({
      id: `experience:${i}`,
      kind: 'experience',
      label: `${e.jobTitle} at ${e.company}`,
      detail: [
        e.location,
        employmentTypeLabel(e.type),
        formatDateRange(e.startDate, e.endDate, e.current),
        ...e.achievements,
      ]
        .filter(Boolean)
        .join('. '),
    });
  });

  profile.education.forEach((ed, i) => {
    candidates.push({
      id: `education:${i}`,
      kind: 'education',
      label: `${ed.degree}, ${ed.university}`,
      detail: [ed.grade, formatDateRange(ed.startDate, ed.endDate, ed.current), ed.description]
        .filter(Boolean)
        .join('. '),
    });
  });

  // Each skill is addressable on its own — a swap usually concerns one skill,
  // not a whole category.
  profile.skills.forEach((group, gi) => {
    group.skills.forEach((skill, si) => {
      candidates.push({
        id: `skill:${gi}:${si}`,
        kind: 'skill',
        label: skill,
        detail: `${group.category} skill listed on the profile`,
      });
    });
  });

  return candidates;
}

/** Everything the reconciler needs to judge relevance. */
export interface ReconcileInput {
  profile: ProfileData;
  /** Raw text of the CV that was analysed. */
  cvText: string;
  jobDescription: string;
  /** `mandatorySkills` from the stored job-match result, when available. */
  mandatoryMissing: string[];
  mandatoryPartial: string[];
}

/**
 * Ask the model which profile items would serve this JD better than what the CV
 * currently shows.
 *
 * The model receives a numbered inventory and may only answer with those ids.
 * Anything it returns is validated against the inventory before it leaves this
 * function, so a hallucinated id or invented credential is dropped rather than
 * shown to the user as something they can put on a CV.
 */
export async function reconcileProfileWithCv(
  input: ReconcileInput
): Promise<ProfileReconciliation> {
  const candidates = buildProfileCandidates(input.profile);

  // Nothing in the profile to offer — skip the AI call entirely, and say so, so
  // the caller doesn't bill a monthly allowance for a call that never happened.
  if (candidates.length === 0) return { swaps: [], checked: true, usedAI: false };

  const inventory = candidates
    .map((c) => `[${c.id}] (${c.kind}) ${c.label}${c.detail ? ` — ${c.detail}` : ''}`)
    .join('\n');

  const prompt = `You are a UK Staff-Level Technical Recruiter preparing a candidate's CV for a specific role.

The candidate has TWO sources of truth:
1. The CV they actually submitted (a snapshot, possibly out of date or aimed at a different role).
2. Their full Align profile (the complete record of everything they have done).

Your job is to find items in the PROFILE that would serve this Job Description
BETTER than what the CV currently presents, so the candidate can swap them in.

Look for:
- A profile project that matches the JD's domain or stack more closely than a project on the CV.
- A profile skill that is named in the JD but absent or buried in the CV.
- A profile role, degree or certification that evidences a JD requirement the CV does not.

Rules you MUST follow:
- ONLY reference profile items by the exact bracketed id from the inventory below.
- NEVER invent an item, a skill, or a qualification. If the profile does not contain
  something the JD wants, say nothing about it — a missing skill is not a swap.
- Only propose a swap when the profile item is GENUINELY a better fit. Returning an
  empty list is the correct answer when the CV already presents the best evidence.
- Set "cvItem" to the exact text from the CV that the profile item should replace or
  demote. If nothing in the CV is being replaced and this is a pure addition, use null.
- "confidence" is "high" only when the JD names the requirement explicitly and the
  profile item clearly evidences it. Otherwise "medium".
- Propose at most 6 swaps, strongest first.

═══ PROFILE INVENTORY (the only items you may reference) ═══
${inventory}

═══ JOB DESCRIPTION ═══
"""
${input.jobDescription}
"""

═══ THE CV AS SUBMITTED ═══
"""
${input.cvText}
"""

═══ REQUIREMENTS THE MATCH FLAGGED AS MISSING ═══
${input.mandatoryMissing.length ? input.mandatoryMissing.join(', ') : 'None recorded'}

═══ REQUIREMENTS THE MATCH FLAGGED AS PARTIAL ═══
${input.mandatoryPartial.length ? input.mandatoryPartial.join(', ') : 'None recorded'}

Return ONLY valid JSON. No markdown, no preamble.

Schema:
{
  "swaps": [
    {
      "id": "string — exact id from the inventory, e.g. project:2",
      "cvItem": "string — exact CV text this replaces, or null for a pure addition",
      "jdRequirement": "string — the JD requirement this satisfies",
      "rationale": "string — one or two sentences on why the profile item is the stronger evidence",
      "confidence": "high | medium"
    }
  ]
}`;

  const raw = await generateJSONFromAI<{ swaps?: RawProfileSwap[] }>({
    prompt,
    temperature: 0.15,
    thinkingBudget: THINKING_BUDGETS.profileReconcile,
  });
  // A provider failure still counts as `usedAI: false` — the user should not pay
  // an allowance for a comparison they never received.
  if (!raw) return { swaps: [], checked: false, usedAI: false };

  return { swaps: validateSwaps(raw.swaps, candidates), checked: true, usedAI: true };
}

/**
 * Keep only swaps that point at a real profile item, and rebuild the item's text
 * from the profile rather than from the model's output.
 *
 * This is the safety boundary of the whole feature: the model chooses WHICH item
 * is relevant, but never gets to say WHAT the item is. A hallucinated id, or a
 * real id with invented wording, cannot reach the CV.
 */
export function validateSwaps(
  raw: unknown,
  candidates: ProfileCandidate[]
): ProfileSwap[] {
  if (!Array.isArray(raw)) return [];

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const swaps: ProfileSwap[] = [];

  for (const entry of raw as RawProfileSwap[]) {
    if (!entry || typeof entry !== 'object') continue;

    // The inventory is rendered as "[project:2] …", and the model sometimes
    // echoes an id back with the brackets still attached. Normalising here means
    // a formatting quirk doesn't silently discard every otherwise-valid swap.
    const id = typeof entry.id === 'string' ? entry.id.trim().replace(/^\[|\]$/g, '').trim() : '';
    const candidate = byId.get(id);
    if (!candidate) {
      if (id) {
        console.warn(`[profile-reconciler] Dropped swap for unknown profile item "${id}".`);
      }
      continue;
    }

    // One suggestion per profile item; a repeat is model noise.
    if (seen.has(id)) continue;
    seen.add(id);

    const cvItem =
      typeof entry.cvItem === 'string' && entry.cvItem.trim().length > 0
        ? entry.cvItem.trim()
        : null;

    swaps.push({
      id: candidate.id,
      kind: candidate.kind,
      // Straight from the profile — the model's own label is discarded.
      profileItem: candidate.label,
      profileDetail: candidate.detail,
      cvItem,
      jdRequirement: typeof entry.jdRequirement === 'string' ? entry.jdRequirement.trim() : '',
      rationale: typeof entry.rationale === 'string' ? entry.rationale.trim() : '',
      confidence: entry.confidence === 'high' ? 'high' : 'medium',
    });

    if (swaps.length >= 6) break;
  }

  return swaps;
}

/**
 * Re-resolve approved swap ids against the profile, for the rewrite prompt.
 *
 * The client sends back only ids. Rebuilding the content here means a tampered
 * request can at worst re-order the user's own profile items — it can never
 * inject text claiming experience the profile does not contain.
 */
export function resolveApprovedSwaps(
  profile: ProfileData,
  approvedIds: string[]
): ProfileCandidate[] {
  const byId = new Map(buildProfileCandidates(profile).map((c) => [c.id, c]));
  return approvedIds
    .map((id) => byId.get(id))
    .filter((c): c is ProfileCandidate => Boolean(c));
}
