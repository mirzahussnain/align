import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { stableEvidenceId } from './evidence-id';
import type { EvidenceCaptureInput } from './types';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function persistApplicationOnlyEvidence(
  tx: Prisma.TransactionClient,
  generationId: string,
  input: EvidenceCaptureInput
) {
  if (input.persistenceScope !== 'APPLICATION_ONLY') throw new Error('Reusable profile evidence is persisted on its canonical entity, not duplicated as application-only evidence.');
  const entityId = input.entity.mode === 'EXISTING'
    ? input.entity.entityId
    : stableEvidenceId('application-entity', generationId, input.entityKind, JSON.stringify(input.entity.data));
  return Promise.all(input.evidenceItems.map((item, index) => {
    const evidenceId = stableEvidenceId('hitl', generationId, input.entityKind, entityId, item.fieldKind, item.text, index);
    return tx.cvApplicationEvidence.create({
      data: {
        generationId,
        evidenceId,
        entityKind: input.entityKind,
        entityId,
        persistenceScope: 'APPLICATION_ONLY',
        evidenceJson: json({ fieldKind: item.fieldKind, text: item.text.trim(), entity: input.entity }),
        requirementIds: [...new Set(item.requirementIds)],
        sourceRefsJson: json([{ sourceType: 'APPLICATION_EVIDENCE', entityType: input.entityKind, entityId, fieldPath: `${item.fieldKind.toLocaleLowerCase('en-GB')}[${index}]`, snapshotId: generationId }]),
        schemaVersion: 1,
      },
    });
  }));
}
