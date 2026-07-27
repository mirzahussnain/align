// Contract: ordinary Career Profile completion is not a commercial allowance.
//
// Career history — experience, education, projects, skills, certifications,
// training, licences, registrations, languages, volunteering — is governed by
// authentication, ownership, validation and database constraints alone. Only an
// explicit reusable evidence record (`other`, an OtherEvidence row) consumes
// `profile_evidence_storage`. These are source-level assertions, matching the
// existing profile interaction contracts, because the invariant is "this gate is
// absent from these paths" — which no runtime call can demonstrate.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const actions = read('src/features/dashboard/actions/profile-actions.ts');
const captureRoute = read('src/app/api/profile-evidence/route.ts');
const entitlementServer = read('src/shared/entitlements/server.ts');

/** Every canonical Career Profile section the user completes. */
const CAREER_PROFILE_FORMS = [
  'ExperienceForm.tsx',
  'ProjectsForm.tsx',
  'EducationForm.tsx',
  'SkillsForm.tsx',
] as const;

describe('Career Profile records vs stored evidence', () => {
  it('counts stored evidence from the reusable-evidence table only', () => {
    expect(entitlementServer).toContain('client.otherEvidence.count({ where: { profile: { userId } } })');
    // The old definition summed every canonical table into the allowance.
    for (const model of [
      'prisma.experience.count',
      'prisma.projectEntry.count',
      'prisma.education.count',
      'prisma.skill.count',
      'prisma.certification.count',
      'prisma.training.count',
      'prisma.licence.count',
      'prisma.professionalRegistration.count',
      'prisma.language.count',
      'prisma.volunteering.count',
    ]) {
      expect(entitlementServer).not.toContain(model);
    }
  });

  it('keeps exactly one authoritative count function, with no legacy duplicate', () => {
    expect(entitlementServer).toContain('export async function countStoredEvidence');
    expect(entitlementServer).not.toContain('countProfileEvidence');
    // The unused compatibility accessor that shadowed the decision is gone.
    expect(() => read('src/shared/services/evidence-capabilities.ts')).toThrow();
  });

  it('does not gate any ordinary Career Profile record on the evidence allowance', () => {
    // No save action for career history may consult the capability at all.
    expect(actions).not.toContain('evidenceCreationBlocked');
    const gateSites = actions.split('assertStoredEvidenceLimit').length - 1;
    // Exactly one call site (in saveManagedEvidence) plus the import.
    expect(gateSites).toBe(2);
    expect(actions).not.toContain("checkCapability(userId, 'profile_evidence_storage')");
  });

  it('charges the allowance only for a reusable evidence record', () => {
    expect(actions).toContain("parsed.kind === 'other'");
    expect(actions).toContain('await assertStoredEvidenceLimit(userId, tx)');
    // HITL capture: canonical career-history kinds saved to the profile are free.
    expect(captureRoute).toContain("if (parsedEvidence.kind === 'other') {\n        await assertCapability(session.user.id, 'profile_evidence_storage');");
    expect(captureRoute).toContain('await assertStoredEvidenceLimit(session.user.id, tx);');
  });

  it('checks capacity inside the transaction that creates the record', () => {
    // Count-then-create must be serialised, so two concurrent creations cannot
    // both take the last slot. Proven end-to-end in the real-Postgres suite.
    expect(entitlementServer).toContain('pg_advisory_xact_lock');
    expect(actions).toContain('prisma.$transaction(async (tx) => {\n            await assertStoredEvidenceLimit(userId, tx);');
  });

  it('keeps editing and deleting available at the limit', () => {
    // Update paths return before any capacity check; deletes never check at all.
    for (const updater of [
      'prisma.experience.updateMany',
      'prisma.projectEntry.updateMany',
      'prisma.education.updateMany',
      'prisma.otherEvidence.updateMany',
    ]) {
      expect(actions).toContain(updater);
    }
    const deleteSection = actions.slice(actions.indexOf('export async function deleteManagedEvidence'));
    expect(deleteSection).not.toContain('assertStoredEvidenceLimit');
  });

  it('shows no plan messaging on ordinary Career Profile forms', () => {
    for (const file of CAREER_PROFILE_FORMS) {
      const source = read(`src/features/dashboard/components/profile/${file}`);
      expect(source).not.toContain('stored evidence');
      expect(source).not.toContain('Your plan allows');
      expect(source).not.toContain('profile_evidence_storage');
      expect(source).not.toContain('Upgrade');
    }
    expect(actions).not.toContain('stored evidence records');
  });

  it('surfaces reusable-evidence usage only in the reusable evidence library', () => {
    const usage = read('src/features/dashboard/components/profile/ReusableEvidenceUsage.tsx');
    expect(usage).toContain("decisionFor('profile_evidence_storage')");
    expect(usage).toContain('Reusable evidence');
    expect(usage).toContain('records used');
    expect(usage).toContain('You’ve reached your reusable evidence limit.');

    const view = read('src/features/dashboard/components/views/ProfileView.tsx');
    // Rendered for the `other` section and nowhere else.
    expect(view.split('<ReusableEvidenceUsage />').length - 1).toBe(1);
    expect(view).toContain("{section === 'other' && <>");
  });

  it('does not call ordinary career history "evidence" in user-facing labels', () => {
    const view = read('src/features/dashboard/components/views/ProfileView.tsx');
    expect(view).toContain("label: 'Reusable evidence'");
    expect(view).not.toContain("label: 'Other evidence'");
    for (const label of ['Experience', 'Education', 'Projects', 'Skills']) {
      expect(view).toContain(`label: '${label}'`);
    }
  });
});
