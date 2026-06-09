import { Recommendation } from '@/shared/types/cv';

export interface FormattedCVLine {
  type: 'empty' | 'heading' | 'text';
  content: string;
  htmlContent?: string;
  isSummaryLine?: boolean;
  rewriteMatch?: { index: number; rewrite: Recommendation } | null;
  originalLine?: string;
}
