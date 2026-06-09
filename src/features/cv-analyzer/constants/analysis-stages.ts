export const ANALYSIS_STAGES = [
  { id: 'extract', label: 'Extracting text structure from PDF layout' },
  { id: 'keywords', label: 'Scanning tech keyword density checklist' },
  { id: 'compliance', label: 'Verifying UK Equality Act compliance rules' },
  { id: 'ai', label: 'Running semantic STAR review' },
  { id: 'compile', label: 'Compiling final scoring metrics & rewrites' },
] as const;
