// Permanent, sanitised reference fixtures for the canonical job-match report
// contract (Fullstack AI Engineer @ medical-grade AI HealthTech vs an adjacent
// early-career candidate with independent AI-product delivery).
//
// These model the CANONICAL `JobMatchDataV2` ledger — the authoritative,
// schema-reconciling backend result. The view-model tests assert that
// projection + presentation never distort them.

import type { JobMatchDataV2, JobRequirementLedgerEntry } from '@/shared/types/ai';

function req(
  index: number,
  partial: Omit<JobRequirementLedgerEntry, 'id'>
): JobRequirementLedgerEntry {
  return { id: `requirement-${String(index).padStart(3, '0')}`, ...partial };
}

/**
 * The reference case: meaningful technical overlap, material production/reliability
 * gaps, missing cloud infra, ambiguous (not blocking) eligibility.
 * Deductions: 70 (requirements) + 14 (domain) → matchScore 16.
 */
export const REFERENCE_JOB_MATCH: JobMatchDataV2 = {
  schemaVersion: 2,
  jobTitle: 'Fullstack Engineer – AI',
  jobCompany: 'HealthTech',
  requirements: [
    req(1, {
      text: 'Strong full-stack engineering with React and TypeScript',
      importance: 'mandatory',
      category: 'skill',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'met',
      evidence: [{ source: 'cv', text: 'React + TypeScript across Vystra and CereSafe', location: 'Experience' }],
      confidence: 0.95,
      deduction: { points: 0, reason: 'Directly evidenced', rubric: 'met' },
    }),
    req(2, {
      text: 'Production experience building systems around LLMs beyond simple API integration',
      importance: 'mandatory',
      category: 'experience',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'partial',
      evidence: [{ source: 'cv', text: 'RAG, embeddings, pgvector and async processing on Vystra', location: 'Projects' }],
      confidence: 0.8,
      deduction: { points: 10, reason: 'RAG/embeddings shown, but not at production reliability scale', rubric: 'partial_match' },
    }),
    req(3, {
      text: 'Deep understanding of failure modes in probabilistic systems',
      importance: 'mandatory',
      category: 'knowledge',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'not_met',
      evidence: [],
      confidence: 0.7,
      deduction: { points: 12, reason: 'No evidence of hallucination/output-instability controls', rubric: 'mandatory_core_missing' },
    }),
    req(4, {
      text: 'Output validation, fallback strategies, confidence thresholds and HITL workflows',
      importance: 'mandatory',
      category: 'skill',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'not_met',
      evidence: [],
      confidence: 0.7,
      deduction: { points: 12, reason: 'No confidence-threshold or HITL implementation evidenced', rubric: 'mandatory_core_missing' },
    }),
    req(5, {
      text: 'Prompt engineering, RAG, fine-tuning or LLM-evaluation experience',
      importance: 'mandatory',
      category: 'skill',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'partial',
      evidence: [{ source: 'cv', text: 'RAG pipeline with vector search', location: 'Projects' }],
      confidence: 0.75,
      deduction: { points: 6, reason: 'RAG present; systematic LLM evaluation not shown', rubric: 'partial_match' },
    }),
    req(6, {
      text: 'Product ownership and shipping',
      importance: 'mandatory',
      category: 'duty',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'partial',
      evidence: [{ source: 'cv', text: 'Independently shipped AI products', location: 'Projects' }],
      confidence: 0.7,
      deduction: { points: 4, reason: 'Independent delivery shown; commercial scale not evidenced', rubric: 'partial_match' },
    }),
    req(7, {
      text: 'System-design ability',
      importance: 'mandatory',
      category: 'skill',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'partial',
      evidence: [{ source: 'cv', text: 'Distributed, asynchronous architecture', location: 'Projects' }],
      confidence: 0.7,
      deduction: { points: 4, reason: 'Async architecture shown; large-scale system design not evidenced', rubric: 'partial_match' },
    }),
    req(8, {
      text: 'Infrastructure: GCP, Kubernetes and Terraform',
      importance: 'mandatory',
      category: 'tool',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'not_met',
      evidence: [],
      confidence: 0.8,
      deduction: { points: 10, reason: 'No GCP/Kubernetes/Terraform evidence in the CV', rubric: 'mandatory_supporting_missing' },
    }),
    req(9, {
      text: 'Full right to work',
      importance: 'mandatory',
      category: 'eligibility',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'unclear',
      evidence: [{ source: 'cv', text: 'UK Graduate Route visa valid until December 2027; no sponsorship required', location: 'Header' }],
      confidence: 0.6,
      deduction: { points: 6, reason: 'Current authorisation shown; "full right to work" wording is ambiguous', rubric: 'eligibility' },
    }),
    req(10, {
      text: 'Clinical AI or other high-stakes AI experience',
      importance: 'desirable',
      category: 'experience',
      sourceSection: 'job_description',
      evidenceRequired: false,
      status: 'partial',
      evidence: [{ source: 'cv', text: 'CereSafe healthcare-adjacent product', location: 'Projects' }],
      confidence: 0.6,
      deduction: { points: 3, reason: 'Healthcare adjacency shown; regulated clinical delivery not shown', rubric: 'desirable_missing' },
    }),
    req(11, {
      text: 'FHIR/HL7 interoperability',
      importance: 'desirable',
      category: 'knowledge',
      sourceSection: 'job_description',
      evidenceRequired: false,
      status: 'not_met',
      evidence: [],
      confidence: 0.8,
      deduction: { points: 3, reason: 'No FHIR/HL7 evidence', rubric: 'desirable_missing' },
    }),
    req(12, {
      text: 'Event-driven architecture',
      importance: 'desirable',
      category: 'skill',
      sourceSection: 'job_description',
      evidenceRequired: false,
      status: 'met',
      evidence: [{ source: 'cv', text: 'Message-broker / async event processing', location: 'Projects' }],
      confidence: 0.75,
      deduction: { points: 0, reason: 'Message-broker evidence supports event-driven architecture', rubric: 'met' },
    }),
  ],
  domainFit: {
    roleDomain: 'Regulated clinical AI',
    candidateDomain: 'Independent AI product engineering',
    status: 'partial',
    overlapAreas: ['LLM integration', 'RAG', 'Full-stack delivery', 'Healthcare adjacency (CereSafe)'],
    detail: 'Strong general AI-engineering overlap; regulated clinical-AI delivery at scale is not evidenced.',
    confidence: 0.7,
    deduction: { points: 14, reason: 'Adjacent domain — regulated clinical context not evidenced' },
  },
  matchScore: 16,
  matchFeedback:
    'Meaningful technical overlap (React, TypeScript, Node, FastAPI, RAG, vector search) against a role that also demands production LLM reliability ownership and regulated clinical delivery the CV does not yet evidence.',
  experienceGap:
    'Production LLM reliability controls, systematic evaluation, and regulated clinical-AI delivery are the main gaps.',
  tailoredRewrites: [
    {
      original: 'Built an AI product with RAG.',
      suggested: 'Engineered a RAG pipeline with embeddings and pgvector, with asynchronous processing for responsiveness.',
      rationale: 'Surfaces the vector-search and async architecture the JD values, using only evidenced work.',
    },
  ],
  cv_build_spec: {
    recommended_template: 'sharp_minimal',
    template_rationale: 'A clean engineering layout that foregrounds AI project depth.',
    section_order: ['Summary', 'Projects', 'Experience', 'Skills', 'Education'],
    lead_project: 'Vystra',
    summary_angle: 'Full-stack AI engineer with RAG and vector-search delivery experience.',
    skills_to_surface: ['React', 'TypeScript', 'RAG', 'Vector search', 'FastAPI'],
    skills_to_deprioritise: ['Unrelated tooling'],
    bullets_to_rewrite: [],
    visa_note_required: true,
    cover_letter_angle: 'Lead with independent AI product delivery and healthcare adjacency.',
  },
};

/** Wrong-occupation calibration case: near-total mismatch scores very low. */
export const WRONG_OCCUPATION_JOB_MATCH: JobMatchDataV2 = {
  schemaVersion: 2,
  jobTitle: 'Fullstack Engineer – AI',
  requirements: [
    req(1, {
      text: 'Strong full-stack engineering with React and TypeScript',
      importance: 'mandatory',
      category: 'skill',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'not_met',
      evidence: [],
      confidence: 0.9,
      deduction: { points: 40, reason: 'No software engineering evidence (candidate is a chef)', rubric: 'mandatory_core_missing' },
    }),
    req(2, {
      text: 'Production experience building systems around LLMs',
      importance: 'mandatory',
      category: 'experience',
      sourceSection: 'job_description',
      evidenceRequired: true,
      status: 'not_met',
      evidence: [],
      confidence: 0.9,
      deduction: { points: 40, reason: 'No LLM or engineering evidence', rubric: 'mandatory_core_missing' },
    }),
  ],
  domainFit: {
    roleDomain: 'AI engineering',
    candidateDomain: 'Hospitality',
    status: 'mismatch',
    overlapAreas: [],
    detail: 'No meaningful overlap.',
    confidence: 0.95,
    deduction: { points: 20, reason: 'Occupation mismatch' },
  },
  matchScore: 0,
  matchFeedback: 'No meaningful overlap with this AI engineering role.',
  experienceGap: 'The CV does not evidence software or AI engineering.',
  tailoredRewrites: [],
  cv_build_spec: {
    recommended_template: 'sharp_minimal',
    template_rationale: '',
    section_order: [],
    lead_project: '',
    summary_angle: '',
    skills_to_surface: [],
    skills_to_deprioritise: [],
    bullets_to_rewrite: [],
    visa_note_required: false,
    cover_letter_angle: '',
  },
};
