import { z } from 'zod';
import type { AiStructuredOutputContract } from '@/shared/services/ai-orchestrator';
import type { TemplateId } from '@/shared/constants/templates';
import { assembleCvBuildSpec, validateBuildSpec, type CvBuildSpecV2, type CvBuildValidationResult } from './build-spec';
import { CV_REWRITE_PATCH_CONTRACT, CvRewritePatchSetSchema } from './rewrite-contract';
import { validateRewritePatches, type RejectedRewritePatch } from './rewrite-validator';
import type { ApprovedCvPlan, UnifiedCandidateEvidence } from './types';

export interface ValidatedRewriteCandidate {
  spec: CvBuildSpecV2;
  rejected: RejectedRewritePatch[];
  patchCount: { returned: number; accepted: number; rejected: number };
  summaryValidation: 'not_present' | 'accepted' | 'fallback_original';
  finalValidation: CvBuildValidationResult;
}

export function createCvRewriteCandidateContract(args: {
  generationId: string;
  evidence: UnifiedCandidateEvidence;
  plan: ApprovedCvPlan;
  templateId: TemplateId;
}): AiStructuredOutputContract<ValidatedRewriteCandidate> {
  const runtimeSchema = CvRewritePatchSetSchema.transform((raw, context): ValidatedRewriteCandidate => {
    const validated = validateRewritePatches(raw, args.evidence, args.plan);
    const spec = assembleCvBuildSpec({
      generationId: args.generationId,
      evidence: args.evidence,
      plan: args.plan,
      templateId: args.templateId,
      patches: validated.patches,
    });
    const finalValidation = validateBuildSpec(spec, args.evidence, args.plan);
    if (!finalValidation.ok) {
      for (const issue of [...finalValidation.truth, ...finalValidation.provenance, ...finalValidation.preservation]) {
        context.addIssue({ code: 'custom', message: `${issue.code}:${issue.evidenceId}` });
      }
      return z.NEVER;
    }
    const summaryPatch = raw.patches.find((patch) => args.evidence.evidenceById[patch.evidenceId]?.field === 'summary');
    const summaryRejected = validated.rejected.some((item) => args.evidence.evidenceById[item.evidenceId]?.field === 'summary');
    return {
      spec,
      rejected: validated.rejected,
      patchCount: { returned: raw.patches.length, accepted: validated.patches.size, rejected: validated.rejected.length },
      summaryValidation: !summaryPatch ? 'not_present' : summaryRejected ? 'fallback_original' : 'accepted',
      finalValidation,
    };
  });
  return {
    name: CV_REWRITE_PATCH_CONTRACT.name,
    jsonSchema: CV_REWRITE_PATCH_CONTRACT.jsonSchema,
    runtimeSchema,
  };
}
