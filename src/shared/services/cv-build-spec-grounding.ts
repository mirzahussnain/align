/**
 * Build-spec grounding (demote-to-intent).
 *
 * The cv_build_spec is AUTHORED BY AN EARLIER AI CALL. It may direct structure
 * and emphasis, but it must never establish a fact. A suggested bullet body such
 * as "Improved API performance by 40%" is not evidence — if that metric is not
 * in verified evidence, the body is replaced with a neutral rewrite directive
 * that keeps the intent and drops the unverifiable claim.
 *
 * This is deterministic: no second AI call, no surgical fragment removal. When a
 * body over-claims, the whole body is demoted to intent; structural fields
 * (labels, target role) are kept because they assert no facts.
 */
import type { AiCvBuildGuidance } from '@/shared/types/ai';
import { extractImpactMetrics, metricSupported, type EvidenceCorpus } from './cv-evidence';

type BuildSpecBullet = AiCvBuildGuidance['bullets_to_rewrite'][number];

export interface BuildSpecGroundingResult {
  spec: AiCvBuildGuidance;
  /** Number of bullets whose body was demoted to a neutral directive. */
  demotedBullets: number;
  /** Internal diagnostics — never shown to the user. */
  changes: string[];
}

/**
 * The deterministic neutral directive used when a body is demoted. Built from
 * the bullet's own label/emphasis so the rewrite intent survives.
 */
export function neutralRewriteDirective(bullet: BuildSpecBullet): string {
  const emphasis = bullet.new_label?.trim() || bullet.original_label?.trim();
  return emphasis
    ? `Rewrite this bullet to emphasise ${emphasis} using only verified evidence from this role.`
    : 'Rewrite this bullet using only verified evidence from this role.';
}

/**
 * Ground a build spec against verified evidence. Any bullet body containing an
 * impact metric that is absent from the corpus is demoted to intent. All other
 * fields (labels, target role, section order, skills to surface, summary angle)
 * are returned unchanged — they carry no facts through to the validator because
 * build-spec text is never part of the evidence corpus.
 */
export function groundBuildSpec(
  spec: AiCvBuildGuidance,
  corpus: EvidenceCorpus
): BuildSpecGroundingResult {
  const changes: string[] = [];
  let demotedBullets = 0;

  const bullets_to_rewrite = (spec.bullets_to_rewrite ?? []).map((bullet) => {
    const body = bullet.new_body ?? '';
    const unsupported = extractImpactMetrics(body).filter(
      (metric) => !metricSupported(corpus, metric)
    );
    if (unsupported.length === 0) return bullet;

    demotedBullets += 1;
    changes.push(
      `Demoted bullet "${bullet.new_label || bullet.original_label || bullet.project_or_role}" — unsupported metric(s): ${unsupported.join(', ')}`
    );
    return { ...bullet, new_body: neutralRewriteDirective(bullet) };
  });

  return {
    spec: { ...spec, bullets_to_rewrite },
    demotedBullets,
    changes,
  };
}
