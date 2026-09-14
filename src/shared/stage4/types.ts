import type { TemplateId } from '@/shared/constants/templates';
import type { OccupationId } from '@/shared/types/classification';
import type {
  LedgerNativeRewriteInput,
  RewriteSourceRef,
  StructuredCvRewriteOutput,
} from '@/shared/types/cv-rewrite';
import type { CvSectionType, CvBuildSpec } from '@/shared/services/cv-build-spec/types';

export type GoldenDensity = 'sparse' | 'normal' | 'dense' | 'likely-multi-page';
export type GoldenEvidenceSource =
  | 'source-cv'
  | 'approved-profile'
  | 'application-context';

/**
 * Stage 4 metadata deliberately composes production contracts rather than
 * restating them. The structured output, generation input and canonical build
 * spec remain the source of truth for generated content and provenance.
 */
export interface GoldenCvFixture {
  fixtureId: string;
  fixtureVersion: 'v1';
  purpose: string;
  occupation: OccupationId;
  occupationLabel: string;
  targetRole: string;
  density: GoldenDensity;
  template: TemplateId;
  evidenceSources: GoldenEvidenceSource[];
  generationInput: LedgerNativeRewriteInput;
  structuredRewrite: StructuredCvRewriteOutput;
  expected: {
    sectionOrder: CvSectionType[];
    headings: string[];
    contactFields: string[];
    claims: string[];
    forbiddenClaims: string[];
    links: string[];
    absentLinks: string[];
    dateStrings: string[];
    densityMode: CvBuildSpec['presentation']['densityMode'];
    pageTendency: 'one-page-likely' | 'one-to-two-pages' | 'multi-page-likely';
    provenanceSources: RewriteSourceRef['source'][];
    unsupportedRequirements: string[];
    omissions: CvSectionType[];
    knownVisualRisks: string[];
  };
}

export interface GoldenAutomatedCheck {
  passed: boolean;
  errors: string[];
  warnings: string[];
  fileSize: number;
  visibleTextLength: number;
  hyperlinkTargets: string[];
  pageCount: number | null;
}

export interface GoldenManifestEntry {
  fixtureId: string;
  fixtureVersion: string;
  purpose: string;
  occupation: string;
  density: GoldenDensity;
  template: TemplateId;
  evidenceSources: GoldenEvidenceSource[];
  expectedSectionOrder: CvSectionType[];
  expectedHeadings: string[];
  expectedDensityMode: CvBuildSpec['presentation']['densityMode'];
  expectedClaims: string[];
  forbiddenClaims: string[];
  expectedLinks: string[];
  expectedDateStrings: string[];
  expectedPageTendency: GoldenCvFixture['expected']['pageTendency'];
  expectedProvenanceSources: RewriteSourceRef['source'][];
  outputPath: string;
  renderedPdfPath: string | null;
  renderedImagePaths: string[];
  automatedCheck: GoldenAutomatedCheck;
  humanResult: null;
  humanNotes: null;
}

export interface GoldenManifest {
  schemaVersion: 1;
  fixtureVersion: 'v1';
  generatedBy: 'npm run generate:golden-cvs';
  entries: GoldenManifestEntry[];
  coverageRationale: string;
  contractLimitations: string[];
}
