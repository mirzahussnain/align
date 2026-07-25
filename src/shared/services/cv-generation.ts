import { generateArchitectTemplate } from '@/shared/templates/template1_architect';
import { generateEditorialTemplate } from '@/shared/templates/template2_editorial';
import { generateTechnicalTemplate } from '@/shared/templates/template3_technical';
import { generateAcademicTemplate } from '@/shared/templates/template4_academic';
import { prisma } from '@/shared/lib/prisma';
import { storage, keyFor } from '@/shared/lib/storage';
import { APIError } from '@/shared/utils/api-error';
import type { RewrittenCVData } from '@/shared/templates/types';
import type { CvBuildSpec } from '@/shared/services/cv-build-spec/types';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import { visaStatusLabel } from '@/shared/constants/visa-status';
import { employmentTypeLabel } from '@/shared/constants/employment-type';
import { pruneGeneratedCvs } from './storage-quota';
import type { Entitlements } from '@/shared/lib/entitlements';
export { CV_TEMPLATE_CAPABILITIES, type CvTemplateCapabilities } from '@/shared/constants/cv-template-capabilities';

export const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Re-exported so existing importers of `TemplateId` from this module keep
// working; the canonical definition now lives in shared/constants/templates.
export type { TemplateId } from '@/shared/constants/templates';

/**
 * Single source of truth for turning a canonical {@link CvBuildSpec} into a
 * rendered DOCX. Shared by every generate path (from-profile, regenerate) so a
 * new template is wired in here once. Renderers are isolated: they consume ONLY
 * the spec — never a raw Profile, raw LLM output, or ad-hoc route data — and the
 * spec already carries the planned section order, headings and content. The
 * chosen template lives in `spec.presentation.templateId`.
 */
export async function renderCvDocx(spec: CvBuildSpec): Promise<Buffer> {
  switch (spec.presentation.templateId) {
    case 'editorial_refined':
      return generateEditorialTemplate(spec);
    case 'technical_precision':
      return generateTechnicalTemplate(spec);
    case 'academic_latex':
      return generateAcademicTemplate(spec);
    case 'architect':
      return generateArchitectTemplate(spec);
    default:
      throw new APIError('Unknown template ID', 400);
  }
}

/**
 * Persist a generated CV row and archive the rendered DOCX bytes to the private
 * `rewrites` bucket. The DB write is required; the upload is best-effort so a
 * storage hiccup never loses the structured record. Returns the new row id.
 */
/**
 * A human-meaningful headline for a generated CV.
 *
 * The tagline is what the document actually leads with ("Senior Data Engineer ·
 * Streaming · 6 yrs"), so it describes the CV far better than the template name
 * ever did. Falls back to the holder's name, then to null so the UI can decide —
 * returning a placeholder string here would push a fake title into the database.
 */
export function cvTitleFrom(data: RewrittenCVData): string | null {
  const tagline = data.tagline?.trim();
  if (tagline) return tagline.slice(0, 160);

  const name = data.fullName?.trim();
  return name ? name.slice(0, 160) : null;
}

export async function persistAndArchiveCv(args: {
  userId: string;
  data: RewrittenCVData;
  templateId: string;
  fileName: string;
  docxBuffer: Buffer;
  analysisId?: string | null;
  /** Career track this CV was built from, when it came from a profile path. */
  profileId?: string | null;
  /** Optional generation-time source/approval snapshot, separate from CV data. */
  provenance?: Record<string, unknown>;
  /**
   * Tier limits. When given, generated CVs beyond the cap are pruned
   * oldest-first after this one is saved.
   */
  entitlements?: Entitlements;
}): Promise<string> {
  const {
    userId,
    data,
    templateId,
    fileName,
    docxBuffer,
    analysisId,
    profileId,
    provenance,
    entitlements,
  } = args;

  const generatedCV = await prisma.generatedCV.create({
    data: {
      userId,
      template: templateId,
      title: cvTitleFrom(data),
      data: JSON.parse(JSON.stringify(data)),
      provenance: provenance ? JSON.parse(JSON.stringify(provenance)) : undefined,
      analysisId: analysisId ?? null,
      profileId: profileId ?? null,
    },
  });

  try {
    const key = keyFor.rewrite(userId, generatedCV.id, fileName);
    await storage.upload({ bucket: 'rewrites', key, body: docxBuffer, contentType: DOCX_CONTENT_TYPE });
    await prisma.generatedCV.update({
      where: { id: generatedCV.id },
      // Size is stored so the quota meter sums from the DB, never from storage.
      data: { fileKey: key, fileSize: docxBuffer.byteLength },
    });
  } catch (storageError) {
    console.warn(
      '[cv-generation] Failed to archive generated CV:',
      storageError instanceof Error ? storageError.message : storageError
    );
  }

  // Runs after the new row exists so the cap counts it — the user always keeps
  // the CV they just made, and the oldest beyond the cap falls off instead.
  if (entitlements) {
    await pruneGeneratedCvs(userId, entitlements);
  }

  return generatedCV.id;
}

/**
 * Map a fully-filled structured profile straight into the template data shape.
 * No AI involved — the profile is already canonical, so a "from profile" build
 * is a deterministic reshaping. Plain achievement strings become label-less
 * bullets (templates render an empty label as no label).
 */
export function profileToRewrittenData(profile: ProfileData): RewrittenCVData {
  const p = profile.personal;
  const location = [p.city, p.state, p.country].filter(Boolean).join(', ');
  const phone = [p.phoneDialCode, p.phoneNumber].filter(Boolean).join(' ');
  const visaStatus = p.visaStatus
    ? `${visaStatusLabel(p.visaStatus)}${p.visaExpiry ? ` (until ${p.visaExpiry})` : ''}`
    : undefined;
  return {
    fullName: p.fullName,
    tagline: p.tagline,
    contact: {
      email: p.email,
      phone,
      location,
      website: p.website || undefined,
      linkedin: p.linkedin || undefined,
      github: p.github || undefined,
      visaStatus,
    },
    professionalSummary: p.professionalSummary,
    // Dates are carried through in their CANONICAL `YYYY` / `YYYY-MM` form so the
    // renderer can spell them in the chosen template's date style (§7). The
    // `current` flag collapses to the "Present" sentinel here, which the styled
    // formatter passes through unchanged. Employment type is still converted to a
    // display label — it is not a date fact and every template shows it verbatim.
    education: profile.education.map((e) => ({
      degree: e.degree,
      university: e.university,
      startDate: e.startDate,
      endDate: e.current ? 'Present' : e.endDate,
      grade: e.grade,
      description: e.description,
    })),
    projects: profile.projects.map((pr) => ({
      name: pr.name,
      skills: (pr.skills ?? []).map((skill) => skill.name).join(', '),
      startDate: pr.startDate,
      endDate: pr.endDate,
      achievements: pr.achievements.map((body) => ({ label: '', body })),
    })),
    experience: profile.experience.map((ex) => ({
      jobTitle: ex.jobTitle,
      company: ex.company,
      location: ex.location,
      type: employmentTypeLabel(ex.type),
      startDate: ex.startDate,
      endDate: ex.current ? 'Present' : ex.endDate,
      achievements: ex.achievements.map((body) => ({ label: '', body })),
    })),
    coreSkills: profile.skills.map((s) => ({
      category: s.category,
      skills: s.skills.join(', '),
    })),
    certifications: [],
  };
}
