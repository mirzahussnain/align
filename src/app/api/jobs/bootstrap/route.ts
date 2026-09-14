import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";
import { listProfileTargets } from "@/features/dashboard/data/load-profile";
import { withErrorHandler } from "@/shared/utils/api-error";
export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      return NextResponse.json({
        profiles: [],
        selectedProfile: null,
        defaultSearch: { query: "jobs", location: "" },
      });
    const [profiles, identity] = await Promise.all([
      listProfileTargets(session.user.id),
      prisma.profileIdentity.findUnique({
        where: { userId: session.user.id },
        select: { city: true, state: true },
      }),
    ]);
    const selectedProfile =
      profiles.find((profile) => profile.isDefault) ?? profiles[0] ?? null;
    return NextResponse.json({
      profiles,
      selectedProfile,
      defaultSearch: {
        query:
          selectedProfile?.targetRoleTitle ||
          selectedProfile?.targetOccupation ||
          selectedProfile?.targetIndustry ||
          "jobs",
        location: identity?.city || identity?.state || "",
      },
    });
  });
}
