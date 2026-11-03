import type { CvAtsStrategy } from './types';

export interface AtsRewriteGuidance {
  strategy: CvAtsStrategy;
  allowed: string[];
  forbidden: string[];
}

export function atsRewriteGuidance(strategy: CvAtsStrategy): AtsRewriteGuidance {
  const allowed = ['Prioritise supported role-relevant evidence', 'Tailor emphasis and ordering', 'Improve clarity while preserving meaning'];
  if (strategy === 'COMPOSITE') allowed.push('Strengthen action verbs', 'Improve bullet construction', 'Reduce clichés and redundancy', 'Highlight supported measurable impact', 'Improve section consistency');
  return {
    strategy,
    allowed,
    forbidden: ['Invent skills', 'Invent metrics', 'Invent experience', 'Fabricate outcomes', 'Manufacture missing requirements'],
  };
}
