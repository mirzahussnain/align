import { NextRequest, NextResponse } from 'next/server';
import { API_CONFIG } from '@/shared/lib/config';
import { FALLBACK_TRENDS } from '@/shared/constants/trends-fallback';

export async function GET(request: NextRequest) {
  try {
    const { appId, appKey, histogramUrl } = API_CONFIG.adzuna;

    if (!appId || !appKey) {
      console.warn('Adzuna API keys are not configured. Using cached fallback trends data.');
      return NextResponse.json({
        ...FALLBACK_TRENDS,
        isFallback: true,
        message: 'Adzuna API keys are not configured. Using cached market fallback trends.'
      });
    }

    // 1. Fetch Salary Data
    const salaryUrl = `${histogramUrl}?app_id=${appId}&app_key=${appKey}&what=software%20developer`;
    
    console.log('Fetching live salary stats from Adzuna...');
    // Cache for 24 hours to prevent rate limit issues
    const response = await fetch(salaryUrl, { next: { revalidate: 86400 } });
    
    if (!response.ok) {
      throw new Error(`Adzuna stats API returned status ${response.status}`);
    }

    const data = await response.json();
    
    // Scale standard salaries if we got a real mean salary
    const liveMean = data.mean;
    if (liveMean && typeof liveMean === 'number') {
      const scaleFactor = liveMean / 68000; // Base baseline average software developer salary
      
      const dynamicSalaryTrends = FALLBACK_TRENDS.salaryTrends.map(item => ({
        ...item,
        london: Math.round(item.london * scaleFactor),
        regional: Math.round(item.regional * scaleFactor),
      }));

      return NextResponse.json({
        stackDominance: FALLBACK_TRENDS.stackDominance,
        salaryTrends: dynamicSalaryTrends,
        regionalDemand: FALLBACK_TRENDS.regionalDemand,
        keywordTrends: FALLBACK_TRENDS.keywordTrends,
        isFallback: false,
      });
    }

    return NextResponse.json({
      ...FALLBACK_TRENDS,
      isFallback: false,
    });
  } catch (error) {
    console.warn('Failed to fetch dynamic trends, falling back to cached constants:', error);
    return NextResponse.json({
      ...FALLBACK_TRENDS,
      isFallback: true,
      message: 'Failed to connect to API. Showing cached market intelligence fallback data.'
    });
  }
}
