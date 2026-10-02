import 'server-only';
import type { EmploymentType, Prisma } from '@/generated/prisma/client';
import { EvidenceCaptureInputSchema } from './schemas';
import { stableEvidenceId } from './evidence-id';
import type { EvidenceCaptureInput } from './types';

const asJson = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const strings = (value: Prisma.JsonValue[] | null | undefined): string[] => Array.isArray(value) ? value.map(String) : [];
const metadataList = (value: Prisma.JsonValue | null | undefined): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return [];
  return value.reduce<Record<string, unknown>[]>((items, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) items.push(item as Record<string, unknown>);
    return items;
  }, []);
};

function metadata(generationId: string, entityId: string, input: EvidenceCaptureInput) {
  return input.evidenceItems.map((item, index) => ({
    evidenceId: stableEvidenceId('hitl', generationId, input.entityKind, entityId, item.fieldKind, item.text, index),
    generationId,
    fieldKind: item.fieldKind,
    text: item.text.trim(),
    requirementIds: [...new Set(item.requirementIds)],
    provenance: 'HITL',
  }));
}

const combinedText = (input: EvidenceCaptureInput) => input.evidenceItems.map((item) => item.text.trim()).join('\n');

export async function persistReusableProfileEvidence(
  tx: Prisma.TransactionClient,
  profileId: string,
  generationId: string,
  rawInput: EvidenceCaptureInput
): Promise<string> {
  const input = EvidenceCaptureInputSchema.parse(rawInput) as EvidenceCaptureInput;
  if (input.persistenceScope !== 'CAREER_PROFILE_AND_APPLICATION') throw new Error('Application-only evidence must not mutate the Career Profile.');
  const text = combinedText(input);

  if (input.entity.mode === 'NEW') {
    const data = input.entity.data;
    switch (input.entityKind) {
      case 'EXPERIENCE': {
        const row = await tx.experience.create({ data: { profileId, company: String(data.company), jobTitle: String(data.title), location: data.location ? String(data.location) : null, type: data.employmentType ? String(data.employmentType) as EmploymentType : null, startDate: String(data.startDate), endDate: data.endDate ? String(data.endDate) : null, current: Boolean(data.current), achievements: input.evidenceItems.map((item) => item.text.trim()), evidenceMetadata: asJson([]), sortOrder: await tx.experience.count({ where: { profileId } }) }, select: { id: true } });
        await tx.experience.update({ where: { id: row.id }, data: { evidenceMetadata: asJson(metadata(generationId, row.id, input)) } });
        return row.id;
      }
      case 'PROJECT': {
        const row = await tx.projectEntry.create({ data: { profileId, name: String(data.name), liveUrl: data.liveUrl ? String(data.liveUrl) : null, repositoryUrl: data.repositoryUrl ? String(data.repositoryUrl) : null, startDate: data.startDate ? String(data.startDate) : null, endDate: data.endDate ? String(data.endDate) : null, achievements: input.evidenceItems.map((item) => item.text.trim()), evidenceMetadata: asJson([]), sortOrder: await tx.projectEntry.count({ where: { profileId } }) }, select: { id: true } });
        await tx.projectEntry.update({ where: { id: row.id }, data: { evidenceMetadata: asJson(metadata(generationId, row.id, input)) } });
        return row.id;
      }
      case 'EDUCATION': {
        const row = await tx.education.create({ data: { profileId, university: String(data.institution), degree: String(data.qualification), startDate: data.startDate ? String(data.startDate) : null, endDate: data.endDate ? String(data.endDate) : null, current: Boolean(data.current), grade: data.grade ? String(data.grade) : null, description: text, evidenceMetadata: asJson([]), sortOrder: await tx.education.count({ where: { profileId } }) }, select: { id: true } });
        await tx.education.update({ where: { id: row.id }, data: { evidenceMetadata: asJson(metadata(generationId, row.id, input)) } });
        return row.id;
      }
      case 'CERTIFICATION': {
        const row = await tx.certification.create({ data: { profileId, name: String(data.name), issuer: data.issuer ? String(data.issuer) : null, issueDate: data.issueDate ? String(data.issueDate) : null, expiryDate: data.expiryDate ? String(data.expiryDate) : null, credentialNumber: data.credentialId ? String(data.credentialId) : null, verificationUrl: data.credentialUrl ? String(data.credentialUrl) : null, evidenceMetadata: asJson([]) }, select: { id: true } });
        await tx.certification.update({ where: { id: row.id }, data: { evidenceMetadata: asJson(metadata(generationId, row.id, input)) } });
        return row.id;
      }
      case 'TRAINING': {
        const row = await tx.training.create({ data: { profileId, course: String(data.course), provider: data.provider ? String(data.provider) : null, field: data.field ? String(data.field) : null, status: data.status ? String(data.status) : null, startDate: data.startDate ? String(data.startDate) : null, endDate: data.endDate ? String(data.endDate) : null, result: data.result ? String(data.result) : null, evidenceMetadata: asJson([]) }, select: { id: true } });
        await tx.training.update({ where: { id: row.id }, data: { evidenceMetadata: asJson(metadata(generationId, row.id, input)) } });
        return row.id;
      }
      case 'VOLUNTEERING': {
        const row = await tx.volunteering.create({ data: { profileId, organisation: String(data.organisation), role: String(data.role), startDate: data.startDate ? String(data.startDate) : null, endDate: data.endDate ? String(data.endDate) : null, contribution: text, skillsTools: [], evidenceMetadata: asJson([]) }, select: { id: true } });
        await tx.volunteering.update({ where: { id: row.id }, data: { evidenceMetadata: asJson(metadata(generationId, row.id, input)) } });
        return row.id;
      }
      case 'OPEN_SOURCE': {
        const row = await tx.openSourceContribution.create({ data: { profileId, projectName: String(data.projectName), role: data.role ? String(data.role) : null, repositoryUrl: data.repositoryUrl ? String(data.repositoryUrl) : null, projectUrl: data.projectUrl ? String(data.projectUrl) : null, startDate: data.startDate ? String(data.startDate) : null, endDate: data.endDate ? String(data.endDate) : null, description: data.description ? String(data.description) : null, contributions: input.evidenceItems.map((item) => item.text.trim()), technologies: Array.isArray(data.technologies) ? data.technologies.map(String) : [], evidenceMetadata: asJson([]), sortOrder: await tx.openSourceContribution.count({ where: { profileId } }) }, select: { id: true } });
        await tx.openSourceContribution.update({ where: { id: row.id }, data: { evidenceMetadata: asJson(metadata(generationId, row.id, input)) } });
        return row.id;
      }
      case 'OTHER': {
        const row = await tx.otherEvidence.create({ data: { profileId, title: String(data.title), context: data.context ? String(data.context) : null, description: text, period: data.period ? String(data.period) : null, evidenceMetadata: asJson([]) }, select: { id: true } });
        await tx.otherEvidence.update({ where: { id: row.id }, data: { evidenceMetadata: asJson(metadata(generationId, row.id, input)) } });
        return row.id;
      }
    }
  }

  const id = input.entity.entityId;
  switch (input.entityKind) {
    case 'EXPERIENCE': {
      const row = await tx.experience.findFirst({ where: { id, profileId } });
      if (!row) throw new Error('Experience not found in this Career Profile.');
      await tx.experience.update({ where: { id }, data: { achievements: [...strings(row.achievements), ...input.evidenceItems.map((item) => item.text.trim())], evidenceMetadata: asJson([...metadataList(row.evidenceMetadata), ...metadata(generationId, id, input)]) } });
      break;
    }
    case 'PROJECT': {
      const row = await tx.projectEntry.findFirst({ where: { id, profileId } });
      if (!row) throw new Error('Project not found in this Career Profile.');
      await tx.projectEntry.update({ where: { id }, data: { achievements: [...strings(row.achievements), ...input.evidenceItems.map((item) => item.text.trim())], evidenceMetadata: asJson([...metadataList(row.evidenceMetadata), ...metadata(generationId, id, input)]) } });
      break;
    }
    case 'EDUCATION': {
      const row = await tx.education.findFirst({ where: { id, profileId } });
      if (!row) throw new Error('Education not found in this Career Profile.');
      await tx.education.update({ where: { id }, data: { description: [row.description, text].filter(Boolean).join('\n'), evidenceMetadata: asJson([...metadataList(row.evidenceMetadata), ...metadata(generationId, id, input)]) } });
      break;
    }
    case 'CERTIFICATION': {
      const row = await tx.certification.findFirst({ where: { id, profileId } });
      if (!row) throw new Error('Certification not found in this Career Profile.');
      await tx.certification.update({ where: { id }, data: { evidenceMetadata: asJson([...metadataList(row.evidenceMetadata), ...metadata(generationId, id, input)]) } });
      break;
    }
    case 'TRAINING': {
      const row = await tx.training.findFirst({ where: { id, profileId } });
      if (!row) throw new Error('Training not found in this Career Profile.');
      await tx.training.update({ where: { id }, data: { evidenceMetadata: asJson([...metadataList(row.evidenceMetadata), ...metadata(generationId, id, input)]) } });
      break;
    }
    case 'VOLUNTEERING': {
      const row = await tx.volunteering.findFirst({ where: { id, profileId } });
      if (!row) throw new Error('Volunteer experience not found in this Career Profile.');
      await tx.volunteering.update({ where: { id }, data: { contribution: [row.contribution, text].filter(Boolean).join('\n'), evidenceMetadata: asJson([...metadataList(row.evidenceMetadata), ...metadata(generationId, id, input)]) } });
      break;
    }
    case 'OPEN_SOURCE': {
      const row = await tx.openSourceContribution.findFirst({ where: { id, profileId } });
      if (!row) throw new Error('Open-source contribution not found in this Career Profile.');
      await tx.openSourceContribution.update({ where: { id }, data: { contributions: [...strings(row.contributions), ...input.evidenceItems.map((item) => item.text.trim())], evidenceMetadata: asJson([...metadataList(row.evidenceMetadata), ...metadata(generationId, id, input)]) } });
      break;
    }
    case 'OTHER': {
      const row = await tx.otherEvidence.findFirst({ where: { id, profileId } });
      if (!row) throw new Error('Other evidence not found in this Career Profile.');
      await tx.otherEvidence.update({ where: { id }, data: { description: [row.description, text].filter(Boolean).join('\n'), evidenceMetadata: asJson([...metadataList(row.evidenceMetadata), ...metadata(generationId, id, input)]) } });
      break;
    }
  }
  return id;
}

export async function assertOwnedEvidenceEntity(
  tx: Prisma.TransactionClient,
  profileId: string,
  entityKind: EvidenceCaptureInput['entityKind'],
  entityId: string
) {
  const where = { id: entityId, profileId };
  const found = entityKind === 'EXPERIENCE' ? await tx.experience.findFirst({ where, select: { id: true } })
    : entityKind === 'PROJECT' ? await tx.projectEntry.findFirst({ where, select: { id: true } })
      : entityKind === 'EDUCATION' ? await tx.education.findFirst({ where, select: { id: true } })
        : entityKind === 'CERTIFICATION' ? await tx.certification.findFirst({ where, select: { id: true } })
          : entityKind === 'TRAINING' ? await tx.training.findFirst({ where, select: { id: true } })
            : entityKind === 'VOLUNTEERING' ? await tx.volunteering.findFirst({ where, select: { id: true } })
              : entityKind === 'OPEN_SOURCE' ? await tx.openSourceContribution.findFirst({ where, select: { id: true } })
                : await tx.otherEvidence.findFirst({ where, select: { id: true } });
  if (!found) throw new Error('Evidence entity not found in this Career Profile.');
}
