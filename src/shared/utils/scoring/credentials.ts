// Credential and licence analysis — a separate scoring concept from keywords
// because credentials can be hard eligibility filters (NMC PIN, FLT licence,
// Cat CE + CPC), not vocabulary.
//
// Fairness rule: when the occupation has no material credential expectations,
// or no rule applies after appliesWhen gating, the dimension scores FULL marks.
// A software engineer must never lose 15% for having no certificates.

import type { OccupationProfile } from '@/shared/occupations/types';
import type { Classification } from '@/shared/types/classification';
import type { CredentialAnalysis, CredentialFinding } from '@/shared/types/cv';

export function analyzeCredentials(
  text: string,
  profile: OccupationProfile,
  classification: Classification
): CredentialAnalysis {
  const applicable = profile.credentials.filter(
    rule => !rule.appliesWhen || rule.appliesWhen(classification)
  );

  if (profile.credentialRelevance === 'not_material' || applicable.length === 0) {
    return { score: 10, findings: [], notMaterial: true };
  }

  const findings: CredentialFinding[] = applicable.map(rule => {
    const found = rule.patterns.some(p => p.test(text));
    return {
      id: rule.id,
      label: rule.label,
      class: rule.class,
      found,
      ...(found ? {} : { message: rule.missingMessage }),
    };
  });

  const missingMandatory = findings.filter(f => f.class === 'mandatory' && !f.found);
  const missingDesirable = findings.filter(f => f.class === 'desirable' && !f.found);
  // role_dependent absences are informational only — the specific target job
  // decides whether they matter, which is job-match mode's business.

  let score: number;
  if (missingMandatory.length > 0) {
    // A missing mandatory credential is an eligibility failure, not a nuance.
    score = Math.max(1, 3 - (missingMandatory.length - 1) * 2);
  } else {
    score = Math.max(5, 10 - missingDesirable.length * 1.5);
  }

  return { score: Math.round(score * 10) / 10, findings, notMaterial: false };
}
