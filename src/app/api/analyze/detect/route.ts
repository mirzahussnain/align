import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { applyRateLimit, analysisLimiter } from '@/shared/lib/rate-limit';
import { auth } from '@/shared/lib/auth';
import { extractTextFromPDF } from '@/shared/utils/pdf-parser';
import { detectCvTarget } from '@/shared/services/analysis-context';
import { getOccupationProfile, isKnownOccupation } from '@/shared/occupations/registry';
import {
  listProfileTargets,
  resolveProfileId,
  type ProfileTarget,
} from '@/features/dashboard/data/load-profile';
import type { DetectResponse, ProfileTargetOption } from '@/shared/types/target-detection';
import { DetectRequestSchema } from '../schema';

/**
 * The options the post-upload "What is this CV intended for?" step presents.
 * Everything here is DETERMINISTIC and free: it runs the same evidence scorer
 * the ATS classifier uses at its dictionary tier, loads the user's saved
 * targets, and computes the CV-vs-active-Profile mismatch — with no AI call and
 * no quota consumed. The final analysis re-resolves the user's choice
 * authoritatively (see resolveAnalysisContext), so nothing here is trusted as a
 * resolved target. The response shape is the shared DetectResponse contract.
 */
function isRegulatedOccupation(occupation: string): boolean {
  return isKnownOccupation(occupation) && getOccupationProfile(occupation).regulated;
}

function toTargetOption(target: ProfileTarget): ProfileTargetOption {
  return {
    profileId: target.profileId,
    label: target.label,
    isDefault: target.isDefault,
    occupation: target.targetOccupation,
    occupationLabel: isKnownOccupation(target.targetOccupation)
      ? getOccupationProfile(target.targetOccupation).label
      : '',
    roleTitle: target.targetRoleTitle,
    regulated: isRegulatedOccupation(target.targetOccupation),
  };
}

export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      throw new APIError('Please sign in to analyze your CV.', 401);
    }

    const rateLimitResponse = await applyRateLimit(analysisLimiter, session.user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const formData = await request.formData();
    const parsed = DetectRequestSchema.safeParse({
      file: formData.get('file'),
      profileId: formData.get('profileId') || undefined,
    });
    if (!parsed.success) {
      throw new APIError(parsed.error.message, 400);
    }
    const { file, profileId } = parsed.data;

    const { text } = await extractTextFromPDF(file);
    if (!text || text.trim().length < 50) {
      throw new APIError(
        'Could not extract text from PDF. The file may be image-based or corrupted.',
        400
      );
    }

    // Which track is "active" for this user/request, plus every saved target so
    // the picker can offer "use another saved Profile target". Ownership is
    // enforced by the queries themselves (scoped to userId).
    const [activeProfileId, targets] = await Promise.all([
      resolveProfileId(session.user.id, profileId),
      listProfileTargets(session.user.id),
    ]);
    const activeTarget = targets.find((target) => target.profileId === activeProfileId) ?? null;

    const detection = detectCvTarget(text, activeTarget?.targetOccupation);

    const body: DetectResponse = {
      detected: {
        occupation: detection.occupation,
        label: detection.label,
        confidence: detection.confidence,
        regulated: isRegulatedOccupation(detection.occupation),
      },
      activeProfile: activeTarget ? toTargetOption(activeTarget) : null,
      savedProfiles: targets.map(toTargetOption),
      mismatch: detection.mismatch
        ? {
            detectedOccupation: detection.mismatch.detectedOccupation,
            detectedLabel: getOccupationProfile(detection.mismatch.detectedOccupation).label,
            profileOccupation: detection.mismatch.profileOccupation,
            profileLabel: getOccupationProfile(detection.mismatch.profileOccupation).label,
          }
        : null,
    };
    return NextResponse.json(body);
  });
}
