import { JobMatchDataV2Schema } from '@/shared/schemas/ai-output';
import { RequirementLedgerSnapshotSchema } from '@/shared/cv-generation/schemas';
import { analyzeCV } from '@/shared/utils/scoring-engine';
import type { CVAnalysisResult } from '@/shared/types/cv';

interface StoredJobMatchRow {
  id: string;
  matchScore: number;
  requirementLedgerJson: unknown;
  advisoryJson: unknown;
  cvRevision: { extractedText: string; pageCount: number | null; filename: string };
  jobRevision: { description: string };
}

const lower = <T extends string>(value: T) => value.toLocaleLowerCase('en-GB');

/** Rehydrate the report from the split immutable ledger + non-authoritative advisory snapshot. */
export function storedJobMatchResult(row: StoredJobMatchRow): CVAnalysisResult {
  const ledger = RequirementLedgerSnapshotSchema.parse(row.requirementLedgerJson);
  const advisory = row.advisoryJson as {
    schemaVersion?: number; jobTitle?: string; jobCompany?: string; domainFit?: unknown;
    matchFeedback?: string; experienceGap?: string; tailoredRewrites?: unknown[];
  } | null;
  if (!advisory || advisory.schemaVersion !== 1) throw new Error('Job Match advisory snapshot is invalid.');
  const jobMatchData = JobMatchDataV2Schema.parse({
    schemaVersion: 2,
    jobTitle: advisory.jobTitle,
    jobCompany: advisory.jobCompany,
    requirements: ledger.requirements.map((requirement) => ({
      id: requirement.id,
      text: requirement.text,
      importance: lower(requirement.importance),
      category: lower(requirement.category),
      sourceSection: lower(requirement.sourceSection),
      evidenceRequired: requirement.evidenceRequired,
      status: lower(requirement.analysis?.status ?? 'UNCLEAR'),
      evidence: (requirement.analysis?.evidence ?? []).map((item) => ({ ...item, source: lower(item.source) })),
      confidence: requirement.analysis?.confidence ?? 0,
      deduction: requirement.analysis ? { ...requirement.analysis.deduction, rubric: lower(requirement.analysis.deduction.rubric) } : { points: 0, reason: 'Analysis detail unavailable.', rubric: 'other' },
    })),
    domainFit: advisory.domainFit,
    matchScore: row.matchScore,
    matchFeedback: advisory.matchFeedback ?? '',
    experienceGap: advisory.experienceGap ?? '',
    tailoredRewrites: advisory.tailoredRewrites ?? [],
  });
  const result = analyzeCV(row.cvRevision.extractedText, row.cvRevision.pageCount ?? 1);
  result.analysisId = row.id;
  result.fileName = row.cvRevision.filename;
  result.mode = 'job_match';
  result.jobDescription = row.jobRevision.description;
  result.jobMatchData = jobMatchData;
  result.overallScore = row.matchScore;
  result.aiApplied = true;
  return result;
}
