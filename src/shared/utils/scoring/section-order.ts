import { SECTION_HEADINGS_MAP, OPTIMAL_SECTION_ORDER } from '@/shared/constants/scoring-config';
import type { SectionOrderAnalysis } from '@/shared/types/cv';

export function analyzeSectionOrder(text: string): SectionOrderAnalysis {
  const lines = text.split('\n').map(l => l.trim().toLowerCase());
  const detectedSections: { id: string; position: number }[] = [];

  for (const [sectionId, headings] of Object.entries(SECTION_HEADINGS_MAP)) {
    if (sectionId === 'contact') {
      detectedSections.push({ id: sectionId, position: 0 });
      continue;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (headings.some(h => line.includes(h) && line.length < 60)) {
        detectedSections.push({ id: sectionId, position: i });
        break;
      }
    }
  }

  detectedSections.sort((a, b) => a.position - b.position);
  const currentOrder = detectedSections.map(s => s.id);

  const suggestions: string[] = [];
  const optimalOrder = [...OPTIMAL_SECTION_ORDER];

  // Check if experience comes before projects
  const expIndex = currentOrder.indexOf('professional-experience');
  const projIndex = currentOrder.indexOf('key-projects');
  if (expIndex > -1 && projIndex > -1 && expIndex > projIndex) {
    suggestions.push('Move "Professional Experience" above "Key Projects" — UK recruiters prioritize company experience');
  }

  // Check if education is too high
  const eduIndex = currentOrder.indexOf('education');
  if (eduIndex > -1 && eduIndex < 3 && expIndex > -1) {
    suggestions.push('Move "Education" below "Experience" and "Projects" — less important once you have professional experience');
  }

  // Check if skills appear early enough
  const skillsIndex = currentOrder.indexOf('core-skills');
  if (skillsIndex > 3) {
    suggestions.push('Move "Core Skills" higher — it should appear within the first 3 sections for quick ATS scanning');
  }

  const isOptimal = suggestions.length === 0;

  return {
    currentOrder,
    recommendedOrder: [...optimalOrder].filter(s => currentOrder.includes(s)),
    isOptimal,
    suggestions,
  };
}
