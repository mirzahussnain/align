import { z } from 'zod';

const PdfFile = z
  .custom<File>((val) => val instanceof File, 'Must be a File')
  .refine((file) => file.name.endsWith('.pdf'), 'Only PDF files are supported')
  .refine((file) => file.size <= 10 * 1024 * 1024, 'File too large. Max 10MB');

/**
 * A free-text target role the user typed for THIS upload. Deliberately strict:
 * a role is a short human label, so we bound its length, require an actual
 * letter (not just digits/punctuation), and forbid line breaks. Rejected input
 * never reaches the classifier.
 */
const TargetRole = z
  .string()
  .trim()
  .min(2, 'Target role is too short')
  .max(100, 'Target role is too long')
  .refine((value) => /\p{L}/u.test(value), 'Target role must contain letters')
  .refine((value) => !/[\r\n\t]/.test(value), 'Target role must be a single line');

/**
 * The user's explicit answer to "What is this CV intended for?" (ATS). The
 * server maps this to a resolver decision and re-resolves the target
 * authoritatively — a tampered selection cannot force an occupation.
 *
 *  - detected        → the CV's own detected occupation decides (no Profile leak)
 *  - active_profile  → analyse against the active Profile's declared target
 *  - saved_profile   → analyse against another saved Profile's target (needs savedProfileId)
 *  - custom_role     → analyse against a typed role/occupation (needs targetRole)
 *  - generic         → deliberately general, occupation-neutral review
 */
export const TargetSelectionSchema = z.enum([
  'detected',
  'active_profile',
  'saved_profile',
  'custom_role',
  'generic',
]);

/**
 * Evidence sources the contract knows about. The scoring pipeline only honours
 * `cv_only` today; the others are accepted by the type but feature-gated to a
 * clear rejection at the route boundary until their scoring path exists. Kept
 * here so Profile-backed evidence can be added without reworking the contract.
 */
export const EvidenceSourceSchema = z
  .enum(['cv_only', 'active_profile', 'saved_profile', 'cv_and_profile'])
  .default('cv_only');

export const AnalyzeRequestSchema = z
  .object({
    file: PdfFile,
    mode: z.enum(['ats', 'job_match']).default('ats'),
    jobDescription: z.string().optional().default(''),
    /**
     * Career track to file the result under. Optional — omitting it falls back to
     * the user's default profile. Ownership is verified server-side, so a foreign
     * id is ignored rather than trusted.
     *
     * Filing is separate from targeting: the profile named here decides which
     * history the result lands in, NOT the occupation the CV is analysed against.
     */
    profileId: z.string().optional(),
    /** Server-owned Job Board handoff token; never carries a description in the URL. */
    jobHandoffToken: z.string().uuid().optional(),
    /**
     * The post-upload target choice (ATS only). Absent behaves as `detected`,
     * which keeps the leak closed — the active Profile never sets the target
     * unless the user explicitly chose it here.
     */
    targetSelection: TargetSelectionSchema.optional(),
    /** Required when targetSelection === 'saved_profile': the chosen target track. */
    savedProfileId: z.string().optional(),
    /**
     * An explicit, per-analysis target role the user typed. Required (and
     * validated) when targetSelection === 'custom_role'; also accepted on its
     * own for backwards compatibility.
     */
    targetRole: TargetRole.optional(),
    /** Optional structured occupation accompanying a custom role. */
    targetOccupation: z.string().trim().min(1).optional(),
    /**
     * Evidence source for scoring. Feature-gated to `cv_only` at the route until
     * the Profile-backed scoring path exists.
     */
    evidenceSource: EvidenceSourceSchema,
    /**
     * Legacy boolean form of `targetSelection: 'active_profile'`. Retained so an
     * older client keeps working; the new selection field takes precedence.
     */
    confirmProfileTarget: z
      .union([z.boolean(), z.literal('true'), z.literal('false')])
      .optional()
      .transform((v) => v === true || v === 'true'),
  })
  .superRefine((data, ctx) => {
    if (data.targetSelection === 'saved_profile' && !data.savedProfileId) {
      ctx.addIssue({
        code: 'custom',
        path: ['savedProfileId'],
        message: 'Choose which saved profile target to use.',
      });
    }
    if (data.targetSelection === 'custom_role' && !data.targetRole) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetRole'],
        message: 'Enter the target role for this CV.',
      });
    }
  });

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

/**
 * The deterministic pre-analysis detection request (see /api/analyze/detect).
 * Only the file and the filing profile are needed to run detection and load the
 * user's saved targets — no mode, JD, or target selection yet.
 */
export const DetectRequestSchema = z.object({
  file: PdfFile,
  profileId: z.string().optional(),
});
