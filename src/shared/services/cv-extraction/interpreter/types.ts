import type { CvSectionId } from '../sections';
import type { NormalizedDocumentBlock } from '../document/types';

export type InterpretedSectionId = CvSectionId | 'head' | 'unknown';

export interface InterpretedSection {
  instanceId: string;
  id: InterpretedSectionId;
  heading?: string;
  headingBlockId?: string;
  blocks: NormalizedDocumentBlock[];
}

export interface LocalBlockGroup {
  id: string;
  sectionInstanceId: string;
  stream: string;
  blocks: NormalizedDocumentBlock[];
}

export type CvInterpretationIssueCode =
  | 'AMBIGUOUS_SECTION'
  | 'AMBIGUOUS_ENTITY_TYPE'
  | 'AMBIGUOUS_ENTITY_OWNERSHIP'
  | 'AMBIGUOUS_EXPERIENCE_HEADER'
  | 'AMBIGUOUS_DATE_OWNERSHIP';

export interface CvInterpretationIssue {
  code: CvInterpretationIssueCode;
  blockIds: string[];
  candidateIds?: string[];
  messageKey: string;
}
