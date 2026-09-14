import { z } from 'zod';
import { TemplateIdSchema } from '@/shared/constants/templates';
import { REGENERATION_CONTEXT_LIMITS as limits } from '@/shared/policies';

const utf8Bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const IdentifierSchema = z.string().trim().min(1).max(limits.maxIdentifierCharacters);

const evidenceRef = <T extends string>(type: T) => z.object({
  type: z.literal(type),
  id: IdentifierSchema,
}).strict();

const ProfileEvidenceRefSchema = z.discriminatedUnion('type', [
  evidenceRef('experience'),
  evidenceRef('project'),
  evidenceRef('education'),
  evidenceRef('skill'),
  evidenceRef('certification'),
  evidenceRef('training'),
  evidenceRef('licence'),
  evidenceRef('professional_registration'),
  evidenceRef('language'),
  evidenceRef('volunteering'),
  evidenceRef('other'),
]);

const HitlContextSchema = z
  .record(
    z.string().min(1).max(limits.maxHitlKeyCharacters),
    z.string().max(limits.maxHitlValueCharacters)
  )
  .superRefine((value, context) => {
    if (Object.keys(value).length > limits.maxHitlEntries) {
      context.addIssue({ code: 'custom', message: 'Too many HITL context entries.' });
    }
    if (utf8Bytes(value) > limits.maxHitlBytes) {
      context.addIssue({ code: 'custom', message: 'HITL context is too large.' });
    }
  });

const ApprovedProfileEvidenceSchema = z.object({
  requirementId: IdentifierSchema,
  evidenceRef: ProfileEvidenceRefSchema,
  rationale: z.string().max(limits.maxHitlValueCharacters).optional(),
  approvalId: IdentifierSchema.optional(),
}).strict();

const uniqueValues = (values: readonly string[]) => new Set(values).size === values.length;

const InputSchema = z.object({
  analysisId: IdentifierSchema,
  templateId: TemplateIdSchema,
  hitlContext: HitlContextSchema.optional(),
  includeAtsOptimization: z.boolean().optional(),
  approvedProfileEvidence: z.array(ApprovedProfileEvidenceSchema).max(limits.maxApprovedItems).optional(),
  profileId: IdentifierSchema.optional(),
  applicationEvidenceContextIds: z.array(IdentifierSchema).max(limits.maxApplicationIds).optional(),
}).strict().superRefine((value, context) => {
  const approvals = value.approvedProfileEvidence ?? [];
  if (!uniqueValues(approvals.map((approval) => approval.requirementId))) {
    context.addIssue({ code: 'custom', message: 'Approved requirement IDs must be unique.' });
  }
  if (!uniqueValues(approvals.map((approval) => `${approval.evidenceRef.type}:${approval.evidenceRef.id}`))) {
    context.addIssue({ code: 'custom', message: 'Approved evidence references must be unique.' });
  }
  const applicationIds = value.applicationEvidenceContextIds ?? [];
  if (!uniqueValues(applicationIds)) {
    context.addIssue({ code: 'custom', message: 'Application evidence context IDs must be unique.' });
  }
  if (utf8Bytes(value) > limits.maxTotalBytes) {
    context.addIssue({ code: 'custom', message: 'Regeneration context is too large.' });
  }
});

export const RegenerateSchema = InputSchema.transform((value) => ({
  ...value,
  hitlContext: value.hitlContext ?? {},
  includeAtsOptimization: value.includeAtsOptimization ?? true,
  approvedProfileEvidence: value.approvedProfileEvidence ?? [],
  applicationEvidenceContextIds: value.applicationEvidenceContextIds ?? [],
}));

export type RegenerateInput = z.infer<typeof RegenerateSchema>;
