import { describe, it, expect } from 'vitest';
import type { RewrittenCVData } from '@/shared/templates/types';
import { planCvBuildSpec } from '../planner';
import type { CvSectionType } from '../types';

/** A payload with every Stage-1 section populated. */
const FULL: RewrittenCVData = {
  fullName: 'Alex Candidate',
  tagline: 'Software Engineer · Cloud',
  contact: { email: 'a@example.com', phone: '+44 7000 000000', location: 'London, UK' },
  professionalSummary: 'Engineer who builds things.',
  education: [{ degree: 'BSc CS', university: 'Manchester', startDate: '2014', endDate: '2017', grade: 'First', description: 'Systems.' }],
  projects: [{ name: 'Ingest', skills: 'Kafka', startDate: '2022', endDate: '2023', achievements: [{ label: 'Scale', body: '1M/s' }] }],
  experience: [{ jobTitle: 'Engineer', company: 'FinCore', location: 'London', type: 'Full-time', startDate: '2019', endDate: 'Present', achievements: [{ label: 'Impact', body: 'Cut latency.' }] }],
  coreSkills: [{ category: 'Languages', skills: 'Python, SQL' }],
  certifications: [{ name: 'AWS SA', issuer: 'AWS', year: '2021' }],
};

const orderOf = (data: RewrittenCVData, occupationId: string | null, seniority: string | null = 'mid'): CvSectionType[] =>
  planCvBuildSpec({ data, templateId: 'architect', occupationId, seniority }).sections.map((s) => s.type);

describe('planCvBuildSpec — section ordering', () => {
  it('orders a generic full profile deterministically', () => {
    expect(orderOf(FULL, 'generic')).toEqual([
      'summary', 'skills', 'experience', 'education', 'certifications', 'projects',
    ]);
  });

  it('places projects ahead of education/certifications for a software engineer', () => {
    expect(orderOf(FULL, 'software_engineer')).toEqual([
      'summary', 'skills', 'experience', 'projects', 'education', 'certifications',
    ]);
  });

  it('promotes licences/training (certifications) above experience for a warehouse operative', () => {
    expect(orderOf(FULL, 'warehouse_operative')).toEqual([
      'summary', 'skills', 'certifications', 'experience', 'education', 'projects',
    ]);
  });

  it('surfaces skills and clinical experience before education for a registered nurse', () => {
    expect(orderOf(FULL, 'registered_nurse')).toEqual([
      'summary', 'skills', 'experience', 'education', 'certifications', 'projects',
    ]);
  });

  it('appends occupation-irrelevant but populated sections in a deterministic fallback order, independent of source key order', () => {
    // registered_nurse marks key-projects `irrelevant`. A nurse who HAS projects
    // must keep them — appended deterministically (universe order) AFTER the
    // occupation's rule-covered sections, never dropped and never dependent on
    // how the source payload object happens to enumerate its keys.
    const scrambled: RewrittenCVData = {
      certifications: FULL.certifications,
      projects: FULL.projects, // deliberately declared early in the literal
      coreSkills: FULL.coreSkills,
      experience: FULL.experience,
      contact: FULL.contact,
      education: FULL.education,
      fullName: FULL.fullName,
      professionalSummary: FULL.professionalSummary,
      tagline: FULL.tagline,
    };

    const canonical = orderOf(FULL, 'registered_nurse');
    const reordered = orderOf(scrambled, 'registered_nurse');

    // Key order in the source object does not change the result.
    expect(reordered).toEqual(canonical);
    // The irrelevant-but-populated section is preserved, appended last.
    expect(canonical).toContain('projects');
    expect(canonical[canonical.length - 1]).toBe('projects');
    expect(canonical).toEqual([
      'summary', 'skills', 'experience', 'education', 'certifications', 'projects',
    ]);
  });

  it('falls back to generic for an unknown occupation', () => {
    expect(orderOf(FULL, 'not_a_real_occupation')).toEqual(orderOf(FULL, 'generic'));
    expect(orderOf(FULL, null)).toEqual(orderOf(FULL, 'generic'));
  });
});

describe('planCvBuildSpec — evidence-led omission', () => {
  const sparse: RewrittenCVData = {
    ...FULL,
    education: [],
    projects: [],
    certifications: [],
  };

  it('omits empty sections and records them in provenance', () => {
    const spec = planCvBuildSpec({ data: sparse, templateId: 'architect', occupationId: 'generic' });
    expect(spec.sections.map((s) => s.type)).toEqual(['summary', 'skills', 'experience']);
    expect(spec.provenance.omittedEmptySections).toEqual(['projects', 'education', 'certifications']);
  });

  it('treats a summary that is only whitespace as absent', () => {
    const spec = planCvBuildSpec({ data: { ...sparse, professionalSummary: '   ' }, templateId: 'architect', occupationId: 'generic' });
    expect(spec.sections.map((s) => s.type)).not.toContain('summary');
    expect(spec.provenance.omittedEmptySections).toContain('summary');
  });
});

describe('planCvBuildSpec — template presentation', () => {
  const headingFor = (templateId: 'architect' | 'technical_precision' | 'academic_latex', type: CvSectionType) => {
    const spec = planCvBuildSpec({ data: FULL, templateId, occupationId: 'software_engineer' });
    return spec.sections.find((s) => s.type === type)?.heading;
  };

  it('applies the technical template heading overrides', () => {
    expect(headingFor('technical_precision', 'summary')).toBe('Profile');
    expect(headingFor('technical_precision', 'skills')).toBe('Technical Skills');
    expect(headingFor('technical_precision', 'experience')).toBe('Experience');
    // Non-overridden sections keep the default heading.
    expect(headingFor('technical_precision', 'education')).toBe('Education');
  });

  it('applies the academic template heading overrides', () => {
    expect(headingFor('academic_latex', 'skills')).toBe('Skills');
    expect(headingFor('academic_latex', 'projects')).toBe('Projects');
    expect(headingFor('academic_latex', 'summary')).toBe('Professional Summary');
  });

  it('carries the template skill layout onto the spec and the skills section', () => {
    const academic = planCvBuildSpec({ data: FULL, templateId: 'academic_latex', occupationId: 'generic' });
    const architect = planCvBuildSpec({ data: FULL, templateId: 'architect', occupationId: 'generic' });
    expect(academic.presentation.skillLayout).toBe('flat');
    expect(architect.presentation.skillLayout).toBe('grouped');
    const skills = academic.sections.find((s) => s.type === 'skills');
    expect(skills?.type === 'skills' && skills.layout).toBe('flat');
  });

  it('renders the same occupation in the same order across templates (order is not template-fixed)', () => {
    const arch = planCvBuildSpec({ data: FULL, templateId: 'architect', occupationId: 'software_engineer' }).sections.map((s) => s.type);
    const acad = planCvBuildSpec({ data: FULL, templateId: 'academic_latex', occupationId: 'software_engineer' }).sections.map((s) => s.type);
    expect(acad).toEqual(arch);
  });
});

describe('planCvBuildSpec — provenance and identity', () => {
  it('records planner/capability versions, occupation and archetype', () => {
    const spec = planCvBuildSpec({ data: FULL, templateId: 'architect', occupationId: 'software_engineer', role: 'Backend Engineer', targetSource: 'profile_target' });
    expect(spec.provenance.plannerVersion).toBeGreaterThan(0);
    expect(spec.provenance.capabilityVersion).toBeGreaterThan(0);
    expect(spec.provenance.occupationId).toBe('software_engineer');
    expect(spec.provenance.roleArchetype).toBe('technical_specialist');
    expect(spec.provenance.sectionOrder).toEqual(spec.sections.map((s) => s.type));
    expect(spec.target).toEqual({ occupationId: 'software_engineer', role: 'Backend Engineer', targetSource: 'profile_target' });
  });

  it('maps identity and contact from the payload', () => {
    const spec = planCvBuildSpec({ data: FULL, templateId: 'architect', occupationId: 'generic' });
    expect(spec.identity.fullName).toBe('Alex Candidate');
    expect(spec.identity.headline).toBe('Software Engineer · Cloud');
    expect(spec.identity.contact.email).toBe('a@example.com');
  });
});

describe('planCvBuildSpec — presentation carried from capability (§7, §8, §11)', () => {
  it('carries each template date style onto the spec presentation', () => {
    const styleOf = (templateId: 'architect' | 'editorial_refined' | 'technical_precision' | 'academic_latex') =>
      planCvBuildSpec({ data: FULL, templateId, occupationId: 'generic' }).presentation.dateStyle;
    expect(styleOf('architect')).toBe('short_month_year');
    expect(styleOf('editorial_refined')).toBe('long_month_year');
    expect(styleOf('technical_precision')).toBe('numeric_month_year');
    // Distinct styles prove the same evidence renders differently per template.
    expect(new Set([styleOf('architect'), styleOf('editorial_refined'), styleOf('technical_precision')]).size).toBe(3);
  });

  it('carries the page-length expectation and skills layout', () => {
    const spec = planCvBuildSpec({ data: FULL, templateId: 'academic_latex', occupationId: 'generic' });
    expect(spec.presentation.pageLengthExpectation).toBe('one_to_two_pages');
    const skills = spec.sections.find((s) => s.type === 'skills');
    expect(skills?.type === 'skills' && skills.layout).toBe('flat');
  });

  it('flags an over-budget summary without altering it (non-destructive §11)', () => {
    const longSummary = 'x'.repeat(900);
    const spec = planCvBuildSpec({ data: { ...FULL, professionalSummary: longSummary }, templateId: 'technical_precision', occupationId: 'generic' });
    expect(spec.provenance.summaryExceedsBudget).toBe(true);
    const summary = spec.sections.find((s) => s.type === 'summary');
    // Text is preserved verbatim — the planner never truncates user content.
    expect(summary?.type === 'summary' && summary.text).toBe(longSummary);

    const ok = planCvBuildSpec({ data: FULL, templateId: 'technical_precision', occupationId: 'generic' });
    expect(ok.provenance.summaryExceedsBudget).toBe(false);
  });
});

describe('planCvBuildSpec — sparse profiles (§14)', () => {
  it('plans a projects-only profile deterministically without inventing sections', () => {
    const projectsOnly: RewrittenCVData = {
      ...FULL,
      professionalSummary: '',
      experience: [],
      education: [],
      certifications: [],
      coreSkills: [],
    };
    const spec = planCvBuildSpec({ data: projectsOnly, templateId: 'architect', occupationId: 'software_engineer' });
    expect(spec.sections.map((s) => s.type)).toEqual(['projects']);
    expect(spec.provenance.omittedEmptySections).toEqual(['summary', 'skills', 'experience', 'education', 'certifications']);
    // Identity still resolves so the document has a header to render.
    expect(spec.identity.fullName).toBe('Alex Candidate');
  });

  it('plans an education-only profile without an empty experience section', () => {
    const educationOnly: RewrittenCVData = {
      ...FULL,
      professionalSummary: '',
      experience: [],
      projects: [],
      certifications: [],
      coreSkills: [],
    };
    const spec = planCvBuildSpec({ data: educationOnly, templateId: 'architect', occupationId: 'generic' });
    expect(spec.sections.map((s) => s.type)).toEqual(['education']);
    expect(spec.sections.map((s) => s.type)).not.toContain('experience');
  });
});
