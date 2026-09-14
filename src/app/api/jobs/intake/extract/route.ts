import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/shared/lib/auth";
import {
  applyRateLimit,
  jobsLimiter,
} from "@/shared/lib/rate-limit";
import {
  extractVacancyFromUrl,
  VacancyExtractionError,
} from "@/shared/services/vacancy-url-extractor";
import { APIError, withErrorHandler } from "@/shared/utils/api-error";

const Input = z.object({
  sourceUrl: z.string().trim().url().max(2_000),
});

export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      throw new APIError(
        "Please sign in to import a vacancy.",
        401,
        undefined,
        "UNAUTHENTICATED",
      );
    }
    const rateLimited = await applyRateLimit(jobsLimiter, session.user.id);
    if (rateLimited) return rateLimited;

    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new APIError(
        "Enter a valid job URL.",
        400,
        { field: "sourceUrl" },
        "INVALID_REQUEST",
      );
    }

    try {
      return NextResponse.json(
        await extractVacancyFromUrl(parsed.data.sourceUrl),
      );
    } catch (error) {
      if (error instanceof VacancyExtractionError) {
        throw new APIError(
          error.message,
          error.status,
          { extractionCode: error.code },
          error.code,
        );
      }
      throw new APIError(
        "The job page could not be imported. Paste the description instead.",
        502,
        undefined,
        "PAGE_UNAVAILABLE",
      );
    }
  });
}
