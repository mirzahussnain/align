import type { Prisma } from '@/generated/prisma/client';
import { CvImportEntityType } from '@/generated/prisma/client';
import { LANGUAGE_PROFICIENCY_OPTIONS } from '@/shared/constants/profile-field-options';
import { cleanSkillDisplayName, normaliseSkillName } from '@/shared/utils/skill-normalization';
import { assertStoredEvidenceLimit } from '@/shared/entitlements/server';
import { createCanonicalEvidence } from '../structured-evidence';
import { CvPipelineError } from '../cv-extraction/errors';
import { consumesReusableEvidenceAllowance } from './classification';
import type { ImportPayload } from './payloads';

/**
 * Writing a confirmed candidate into the Career Profile.
 *
 * One function per entity type, each holding exactly the field rules the
 * equivalent Profile Management action holds — a record created by import and
 * one typed by hand must be indistinguishable afterwards, or the profile ends up
 * with two classes of row and every reader has to know which is which.
 *
 * Reusable evidence is the exception and deliberately so: it goes through
 * `createCanonicalEvidence`, the single existing creation path for
 * `OtherEvidence`, with the allowance asserted in the same transaction. There is
 * one way to create the entity that has a commercial limit, and it is not here.
 */

export interface CreatedEntity {
  entityType: string;
  entityId: string;
}

/** Words a CV uses for a proficiency, mapped onto the shared scale. */
const PROFICIENCY_SYNONYMS: Record<string, string> = {
  native: 'native_bilingual',
  bilingual: 'native_bilingual',
  'mother tongue': 'native_bilingual',
  fluent: 'full_professional',
  advanced: 'full_professional',
  professional: 'professional_working',
  'business fluent': 'professional_working',
  working: 'limited_working',
  conversational: 'limited_working',
  intermediate: 'limited_working',
  basic: 'elementary',
  elementary: 'elementary',
  beginner: 'beginner',
};

/**
 * Map a CV's proficiency wording onto the shared scale, or null.
 *
 * Only exact, unambiguous words map. "Good German" is not a level, and guessing
 * that it means professional working proficiency puts an assessment on the
 * user's profile that nobody made — the verbatim wording is kept instead, and
 * the user can set the level themselves.
 */
export function mapLanguageProficiency(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const direct = LANGUAGE_PROFICIENCY_OPTIONS.find((option) => option.value === cleaned.replace(/\s/g, '_'));
  return direct?.value ?? PROFICIENCY_SYNONYMS[cleaned] ?? null;
}

function requireField<T>(value: T | undefined | null, ): T {
  if (value === undefined || value === null || value === '') {
    // Reached only when a candidate is confirmed while still missing something
    // the canonical table requires — the review step should have caught it.
    throw new CvPipelineError('CANDIDATE_CONFLICT', 409);
  }
  return value;
}

async function nextSortOrder(
  tx: Prisma.TransactionClient,
  model: 'experience' | 'projectEntry' | 'education' | 'skill',
  profileId: string
): Promise<number> {
  switch (model) {
    case 'experience':
      return tx.experience.count({ where: { profileId } });
    case 'projectEntry':
      return tx.projectEntry.count({ where: { profileId } });
    case 'education':
      return tx.education.count({ where: { profileId } });
    case 'skill':
      return tx.skill.count({ where: { profileId } });
  }
}

/**
 * Turn a project's technology list into skill ids, reusing what the profile has.
 *
 * A technology named on a project heading is a skill the user is claiming, and
 * `ProjectEntry` records that through `ProjectSkill` rather than as free text.
 * Matching is by normalised name against the profile's own unique index, so
 * importing a project that lists "PostgreSQL" links the PostgreSQL the user
 * already has instead of creating a second one beside it — and a name the
 * profile has never seen becomes a skill in the ordinary way.
 *
 * Skills are uncapped career records and consume no allowance, which is why this
 * can create them as part of the same transaction the project is written in:
 * either the project and its skill links all land, or none of them do.
 */
async function resolveProjectSkills(
  tx: Prisma.TransactionClient,
  profileId: string,
  technologies: string[]
): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const raw of technologies) {
    const name = cleanSkillDisplayName(raw);
    if (!name) continue;
    const normalizedName = normaliseSkillName(name);
    // A heading that lists the same technology twice is one claim, and the
    // project↔skill link is keyed on the pair, so a duplicate would fail the write.
    if (!normalizedName || seen.has(normalizedName)) continue;
    seen.add(normalizedName);

    const existing = await tx.skill.findUnique({
      where: { profileId_normalizedName: { profileId, normalizedName } },
      select: { id: true },
    });
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const created = await tx.skill.create({
      data: {
        profileId,
        name,
        normalizedName,
        sortOrder: await nextSortOrder(tx, 'skill', profileId),
      },
      select: { id: true },
    });
    ids.push(created.id);
  }

  return ids;
}

/**
 * Create the canonical record for a confirmed candidate.
 *
 * Runs inside the caller's transaction so the row and the candidate's
 * provenance stamp land together — a canonical record whose candidate never got
 * marked confirmed would be re-imported on the next pass.
 */
export async function createCanonicalRecord(args: {
  tx: Prisma.TransactionClient;
  userId: string;
  profileId: string;
  entityType: CvImportEntityType;
  payload: unknown;
}): Promise<CreatedEntity> {
  const { tx, profileId } = args;

  switch (args.entityType) {
    case CvImportEntityType.EXPERIENCE: {
      const data = args.payload as ImportPayload<typeof CvImportEntityType.EXPERIENCE>;
      const row = await tx.experience.create({
        data: {
          profileId,
          jobTitle: data.jobTitle,
          company: requireField(data.company),
          location: data.location ?? null,
          startDate: requireField(data.startDate),
          // `current` is authoritative, exactly as in Profile Management: an
          // ongoing role never keeps an end date.
          endDate: data.current ? null : data.endDate,
          current: data.current,
          achievements: data.achievements,
          sortOrder: await nextSortOrder(tx, 'experience', profileId),
        },
        select: { id: true },
      });
      return { entityType: 'experience', entityId: row.id };
    }

    case CvImportEntityType.EDUCATION: {
      const data = args.payload as ImportPayload<typeof CvImportEntityType.EDUCATION>;
      const row = await tx.education.create({
        data: {
          profileId,
          degree: data.degree,
          university: requireField(data.university),
          startDate: data.startDate,
          endDate: data.current ? null : data.endDate,
          current: data.current,
          grade: data.grade ?? null,
          description: data.description ?? null,
          sortOrder: await nextSortOrder(tx, 'education', profileId),
        },
        select: { id: true },
      });
      return { entityType: 'education', entityId: row.id };
    }

    case CvImportEntityType.PROJECT: {
      const data = args.payload as ImportPayload<typeof CvImportEntityType.PROJECT>;
      const skillIds = await resolveProjectSkills(tx, profileId, data.technologies ?? []);
      const row = await tx.projectEntry.create({
        data: {
          profileId,
          name: data.name,
          // The two URL columns `ProjectEntry` already had, and which nothing was
          // writing. A project imported with its repository link is the whole
          // point of reading the link in the first place.
          repositoryUrl: data.repositoryUrl ?? null,
          liveUrl: data.liveUrl ?? null,
          startDate: data.startDate,
          endDate: data.endDate,
          achievements: data.achievements,
          sortOrder: await nextSortOrder(tx, 'projectEntry', profileId),
          projectSkills: { create: skillIds.map((skillId, sortOrder) => ({ skillId, sortOrder })) },
        },
        select: { id: true },
      });
      return { entityType: 'project', entityId: row.id };
    }

    case CvImportEntityType.PROFILE_SUMMARY_UPDATE: {
      const data = args.payload as ImportPayload<typeof CvImportEntityType.PROFILE_SUMMARY_UPDATE>;
      // Scoped to the Career Track being imported into, not to the account: a
      // warehouse track and a software track need different summaries, and
      // writing this one over both would destroy work the user did by hand.
      await tx.profile.update({
        where: { id: profileId },
        data: { professionalSummary: data.professionalSummary },
      });
      return { entityType: 'profile_summary', entityId: profileId };
    }

    case CvImportEntityType.SKILL: {
      const data = args.payload as ImportPayload<typeof CvImportEntityType.SKILL>;
      const name = cleanSkillDisplayName(data.name);
      if (!name) throw new CvPipelineError('CANDIDATE_CONFLICT', 409);
      // Reuse an existing group of the same name rather than creating a second
      // "Technical Skills" heading beside the user's own.
      const category = data.category?.trim();
      const group = category
        ? ((await tx.skillGroup.findFirst({ where: { profileId, category }, select: { id: true } })) ??
          (await tx.skillGroup.create({
            data: { profileId, category, sortOrder: await tx.skillGroup.count({ where: { profileId } }) },
            select: { id: true },
          })))
        : null;
      const row = await tx.skill.create({
        data: {
          profileId,
          skillGroupId: group?.id ?? null,
          name,
          normalizedName: normaliseSkillName(name),
          sortOrder: await nextSortOrder(tx, 'skill', profileId),
        },
        select: { id: true },
      });
      return { entityType: 'skill', entityId: row.id };
    }

    case CvImportEntityType.CERTIFICATION: {
      const data = args.payload as ImportPayload<typeof CvImportEntityType.CERTIFICATION>;
      const row = await tx.certification.create({
        data: {
          profileId,
          name: data.officialName,
          issuer: data.issuingBody ?? null,
          year: data.issueDate,
          issueDate: data.issueDate,
          expiryDate: data.expiryDate,
          // Never inferred from dates: an expiry in the past does not make a
          // credential "expired" on the user's behalf.
          status: null,
          // An imported credential is exactly as unverified as a typed one.
          verificationStatus: 'user_confirmed_unverified',
        },
        select: { id: true },
      });
      return { entityType: 'certification', entityId: row.id };
    }

    case CvImportEntityType.LICENCE: {
      const data = args.payload as ImportPayload<typeof CvImportEntityType.LICENCE>;
      const row = await tx.licence.create({
        data: {
          profileId,
          officialName: data.officialName,
          issuingBody: data.issuingBody ?? null,
          issueDate: data.issueDate,
          expiryDate: data.expiryDate,
          status: null,
          verificationStatus: 'user_confirmed_unverified',
        },
        select: { id: true },
      });
      return { entityType: 'licence', entityId: row.id };
    }

    case CvImportEntityType.PROFESSIONAL_REGISTRATION: {
      const data = args.payload as ImportPayload<typeof CvImportEntityType.PROFESSIONAL_REGISTRATION>;
      const row = await tx.professionalRegistration.create({
        data: {
          profileId,
          officialName: data.officialName,
          issuingBody: requireField(data.issuingBody),
          issueDate: data.issueDate,
          expiryDate: data.expiryDate,
          status: null,
          verificationStatus: 'user_confirmed_unverified',
        },
        select: { id: true },
      });
      return { entityType: 'professional_registration', entityId: row.id };
    }

    case CvImportEntityType.TRAINING: {
      const data = args.payload as ImportPayload<typeof CvImportEntityType.TRAINING>;
      const row = await tx.training.create({
        data: {
          profileId,
          course: data.course,
          provider: data.provider ?? null,
          startDate: data.startDate,
          endDate: data.endDate,
          // Lifecycle status stays unknown rather than being read off an end
          // date, matching the Training model's own documented rule.
          status: null,
        },
        select: { id: true },
      });
      return { entityType: 'training', entityId: row.id };
    }

    case CvImportEntityType.LANGUAGE: {
      const data = args.payload as ImportPayload<typeof CvImportEntityType.LANGUAGE>;
      const level = mapLanguageProficiency(data.proficiency);
      const row = await tx.language.create({
        data: {
          profileId,
          language: data.language,
          // A CV says "Fluent in Igbo" without distinguishing the three
          // abilities, so a mapped level applies to all three; unmappable
          // wording leaves them unset and is kept verbatim as context.
          speaking: level,
          reading: level,
          writing: level,
          professionalUseContext: level ? null : (data.proficiency ?? null),
        },
        select: { id: true },
      });
      return { entityType: 'language', entityId: row.id };
    }

    case CvImportEntityType.VOLUNTEERING: {
      const data = args.payload as ImportPayload<typeof CvImportEntityType.VOLUNTEERING>;
      const row = await tx.volunteering.create({
        data: {
          profileId,
          organisation: requireField(data.organisation),
          role: data.role,
          startDate: data.startDate,
          endDate: data.endDate,
          contribution: data.contribution ?? null,
          skillsTools: [],
        },
        select: { id: true },
      });
      return { entityType: 'volunteering', entityId: row.id };
    }

    case CvImportEntityType.OTHER_EVIDENCE: {
      const data = args.payload as ImportPayload<typeof CvImportEntityType.OTHER_EVIDENCE>;
      // The one entity type with a commercial allowance. Asserted inside this
      // transaction under the same advisory lock Profile Management uses, so two
      // concurrent imports cannot both take the last slot.
      if (consumesReusableEvidenceAllowance(args.entityType)) {
        await assertStoredEvidenceLimit(args.userId, tx);
      }
      const ref = await createCanonicalEvidence(
        profileId,
        'other',
        { title: data.title, description: data.description, context: '', period: '', outcome: '' },
        tx,
        // The section was decided by the parser, which has its own readers for
        // experience, education, credentials and the rest — this candidate came
        // out of the achievements section BECAUSE it was none of those. Re-running
        // the authoring routing hint over the wording would reject an award named
        // "First Place – Project Award" for containing the word "project".
        { enforceSectionRouting: false }
      );
      return { entityType: 'other_evidence', entityId: ref.id };
    }

    case CvImportEntityType.IDENTITY_UPDATE:
      // Identity is not a profile row and is applied by its own path, which
      // upserts the shared record rather than inserting a new one.
      throw new CvPipelineError('IMPORT_FAILED', 500);
  }
}
