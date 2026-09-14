import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/shared/lib/auth";
import {
  loadProfileTarget,
  resolveProfileId,
} from "@/features/dashboard/data/load-profile";
import { createImportedJobSnapshot } from "@/shared/services/job-snapshot";
import { assessAndPersistJobIntelligence } from "@/shared/services/job-intelligence-store";
import { buildConfirmedCandidateFacts } from "@/shared/services/practical-compatibility-store";
import { getJobDetailsView } from "@/shared/services/job-board-api";
import { APIError, withErrorHandler } from "@/shared/utils/api-error";

const optionalHttpsUrl = z
  .string()
  .trim()
  .max(2_000)
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) => {
      if (!value) return true;
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Enter a valid HTTPS job URL." },
  );

const Input = z.object({
  sourceUrl: optionalHttpsUrl,
  title: z.string().trim().min(2).max(500),
  employerName: z.string().trim().min(2).max(500),
  locationText: z.string().trim().max(500).optional(),
  description: z.string().trim().min(400).max(50_000),
  profileId: z.string().min(1),
});

/**
 * Turns a vacancy from outside Align into the same private, durable snapshot
 * used by the existing job-details and match-analysis pipeline.
 */
export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      throw new APIError(
        "Please sign in to analyse a vacancy.",
        401,
        undefined,
        "UNAUTHENTICATED",
      );
    }

    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new APIError(
        parsed.error.issues[0]?.message ?? "Check the vacancy details.",
        400,
        { field: parsed.error.issues[0]?.path.join(".") },
        "INVALID_REQUEST",
      );
    }

    const profileId = await resolveProfileId(
      session.user.id,
      parsed.data.profileId,
    );
    if (!profileId) {
      throw new APIError(
        "Choose a Career Track before checking this vacancy.",
        400,
        { field: "profileId" },
        "INVALID_REQUEST",
      );
    }

    const snapshot = await createImportedJobSnapshot({
      userId: session.user.id,
      title: parsed.data.title,
      employerName: parsed.data.employerName,
      locationText: parsed.data.locationText,
      sourceUrl: parsed.data.sourceUrl,
      description: parsed.data.description,
    });

    const [track, candidateFacts] = await Promise.all([
      loadProfileTarget(session.user.id, profileId),
      buildConfirmedCandidateFacts(session.user.id, profileId),
    ]);
    await assessAndPersistJobIntelligence({
      jobSnapshotId: snapshot.id,
      userId: session.user.id,
      careerTrack: track
        ? {
            targetRoleTitle: track.targetRoleTitle,
            occupationFamily: track.targetOccupation,
            industry: track.targetIndustry,
            seniority: track.targetSeniority,
          }
        : null,
      candidateFacts,
    });

    const details = await getJobDetailsView(snapshot.id, session.user.id, {
      profileId,
    });
    if (!details) {
      throw new APIError(
        "Unable to prepare this vacancy.",
        500,
        undefined,
        "INTERNAL_ERROR",
      );
    }

    return NextResponse.json(
      {
        jobSnapshotId: snapshot.id,
        profileId,
        details,
      },
      { status: 201 },
    );
  });
}
