import { CVAnalysisResult } from '@/shared/types/cv';
import { useDashboardNavigation } from './useDashboardNavigation';
import { useDashboardData } from './useDashboardData';
import { useDashboardScoring } from './useDashboardScoring';

export function useAnalysisDashboard(result: CVAnalysisResult) {
  const navigation = useDashboardNavigation();
  const data = useDashboardData(result);
  const scoring = useDashboardScoring(result, data);

  return {
    ...navigation,
    ...data,
    ...scoring
  };
}

export type UseAnalysisDashboardReturn = ReturnType<typeof useAnalysisDashboard>;
