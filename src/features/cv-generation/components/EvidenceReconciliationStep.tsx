'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import { EMPLOYMENT_TYPES } from '@/shared/constants/employment-type';
import { buildExistingRecordOptions, type ExistingRecordOption } from '@/shared/cv-generation/evidence-options';
import type {
  EvidenceCaptureInput,
  EvidenceFieldKind,
  EvidencePersistenceScope,
  HitlEvidenceEntityKind,
  RequirementPresentationGroup,
  SemanticGapGroup,
  UnifiedCandidateEvidence,
} from '@/shared/cv-generation/types';
import { cn } from '@/shared/utils/cn';

interface Props {
  generationId: string;
  gaps: SemanticGapGroup[];
  evidence: UnifiedCandidateEvidence;
  remaining: number;
  resolvedRequirementIds: string[];
  onSave: (input: EvidenceCaptureInput) => Promise<void>;
  onConfirm: (group: SemanticGapGroup, decision: 'MEETS' | 'DOES_NOT_MEET') => Promise<void>;
}

type Field = { key: string; label: string; required?: boolean; type?: 'date' | 'url' | 'list'; options?: ReadonlyArray<{ value: string; label: string }> };
type CaptureStage = 'SOURCE' | 'RECORD' | 'EVIDENCE' | 'RELATED' | 'SAVE';
type EvidenceDecision = 'MISSING' | 'ADD' | null;

const ENTITY_LABELS: Record<HitlEvidenceEntityKind, string> = {
  EXPERIENCE: 'Work experience', PROJECT: 'Project', EDUCATION: 'Education', CERTIFICATION: 'Certification',
  TRAINING: 'Training / Course', VOLUNTEERING: 'Volunteer experience', OPEN_SOURCE: 'Open-source contribution', OTHER: 'Other',
};

const NEW_ENTITY_FIELDS: Record<HitlEvidenceEntityKind, Field[]> = {
  EXPERIENCE: [{ key: 'company', label: 'Employer', required: true }, { key: 'title', label: 'Job title', required: true }, { key: 'employmentType', label: 'Employment type', options: EMPLOYMENT_TYPES }, { key: 'startDate', label: 'Start date', required: true, type: 'date' }, { key: 'endDate', label: 'End date', type: 'date' }, { key: 'location', label: 'Location' }],
  PROJECT: [{ key: 'name', label: 'Project name', required: true }, { key: 'startDate', label: 'Start date', type: 'date' }, { key: 'endDate', label: 'End date', type: 'date' }, { key: 'liveUrl', label: 'Live URL', type: 'url' }, { key: 'repositoryUrl', label: 'Repository URL', type: 'url' }],
  EDUCATION: [{ key: 'institution', label: 'Institution', required: true }, { key: 'qualification', label: 'Qualification', required: true }, { key: 'startDate', label: 'Start date', type: 'date' }, { key: 'endDate', label: 'End date', type: 'date' }, { key: 'grade', label: 'Grade / result' }],
  CERTIFICATION: [{ key: 'name', label: 'Certification name', required: true }, { key: 'issuer', label: 'Issuer' }, { key: 'issueDate', label: 'Issue date', type: 'date' }, { key: 'expiryDate', label: 'Expiry date', type: 'date' }, { key: 'credentialId', label: 'Credential ID' }, { key: 'credentialUrl', label: 'Credential URL', type: 'url' }],
  TRAINING: [{ key: 'course', label: 'Course', required: true }, { key: 'provider', label: 'Provider' }, { key: 'field', label: 'Field' }, { key: 'status', label: 'Status' }, { key: 'startDate', label: 'Start date', type: 'date' }, { key: 'endDate', label: 'End date', type: 'date' }, { key: 'result', label: 'Result' }],
  VOLUNTEERING: [{ key: 'organisation', label: 'Organisation', required: true }, { key: 'role', label: 'Role', required: true }, { key: 'startDate', label: 'Start date', type: 'date' }, { key: 'endDate', label: 'End date', type: 'date' }],
  OPEN_SOURCE: [{ key: 'projectName', label: 'Project name', required: true }, { key: 'role', label: 'Role / contribution' }, { key: 'repositoryUrl', label: 'Repository URL', type: 'url' }, { key: 'projectUrl', label: 'Project URL', type: 'url' }, { key: 'startDate', label: 'Start date', type: 'date' }, { key: 'endDate', label: 'End date', type: 'date' }, { key: 'description', label: 'Description' }, { key: 'technologies', label: 'Technologies', type: 'list' }],
  OTHER: [{ key: 'title', label: 'Evidence title', required: true }, { key: 'context', label: 'Context' }, { key: 'period', label: 'Period' }],
};

const SECTION_COPY: Array<{ id: RequirementPresentationGroup; title: string; description: string }> = [
  { id: 'CORE_EVIDENCE', title: 'Core technical and experience evidence', description: 'The role’s central skills, credentials, and experience.' },
  { id: 'SUPPORTING_EVIDENCE', title: 'Supporting capability evidence', description: 'Responsibilities and ways of working that strengthen your fit.' },
  { id: 'CONFIRMATION', title: 'Confirmation and eligibility', description: 'Practical conditions to confirm directly—no evidence record required.' },
  { id: 'DESIRABLE_EXTRAS', title: 'Desirable extras', description: 'Optional strengths that may improve the application.' },
];

const STAGES: Array<{ id: CaptureStage; label: string }> = [
  { id: 'SOURCE', label: 'Source' }, { id: 'RECORD', label: 'Record' }, { id: 'EVIDENCE', label: 'Evidence' },
  { id: 'RELATED', label: 'Related gaps' }, { id: 'SAVE', label: 'Save' },
];

const stageIndex = (stage: CaptureStage) => STAGES.findIndex((item) => item.id === stage);

function evidenceFieldKind(kind: HitlEvidenceEntityKind): EvidenceFieldKind {
  return kind === 'EXPERIENCE' || kind === 'PROJECT' ? 'ACHIEVEMENT'
    : kind === 'EDUCATION' || kind === 'TRAINING' ? 'COURSEWORK'
      : kind === 'CERTIFICATION' ? 'CREDENTIAL_EVIDENCE'
        : kind === 'VOLUNTEERING' || kind === 'OPEN_SOURCE' ? 'CONTRIBUTION'
          : 'DESCRIPTION';
}

function newEntityData(kind: HitlEvidenceEntityKind, fields: Record<string, string>): Record<string, unknown> {
  const data = Object.fromEntries(NEW_ENTITY_FIELDS[kind].flatMap((field) => {
    const value = fields[field.key]?.trim();
    if (!value) return [];
    return [[field.key, field.type === 'list' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value]];
  })) as Record<string, unknown>;
  if (kind === 'EXPERIENCE' || kind === 'EDUCATION') data.current = false;
  if (kind === 'OPEN_SOURCE') data.technologies ??= [];
  return data;
}

function selectedEntity(option: ExistingRecordOption): EvidenceCaptureInput['entity'] {
  return option.origin === 'CAREER_PROFILE'
    ? { mode: 'EXISTING', entityId: option.entityId, label: option.label }
    : { mode: 'SOURCE_CV', entityId: option.key, sourceEntityId: option.entityId, label: option.label, data: option.promotionData };
}

function ChoiceCard({ name, checked, label, onChange }: { name: string; checked: boolean; label: string; onChange: () => void }) {
  return <label className={cn(
    'flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors',
    checked ? 'border-accent-cyan bg-accent-cyan/10 text-text-primary' : 'border-border-subtle bg-bg-secondary text-text-secondary hover:border-border-default hover:bg-bg-tertiary'
  )}>
    <input type="radio" name={name} checked={checked} onChange={onChange} className="h-4 w-4 accent-accent-cyan" />
    {label}
  </label>;
}

function StageProgress({ stage }: { stage: CaptureStage }) {
  const current = stageIndex(stage);
  return <ol aria-label="Evidence capture progress" className="grid grid-cols-5 gap-1">
    {STAGES.map((item, index) => <li key={item.id} aria-current={index === current ? 'step' : undefined} className="min-w-0 text-center">
      <span className={cn(
        'mx-auto flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold transition-colors',
        index < current ? 'border-success bg-success text-brand-primary' : index === current ? 'border-accent-cyan bg-accent-cyan text-brand-primary' : 'border-border-subtle bg-bg-secondary text-text-tertiary'
      )}>{index < current ? <Check className="h-3 w-3" /> : index + 1}</span>
      <span className={cn('mt-1 block truncate text-xs font-semibold', index === current ? 'text-text-primary' : 'text-text-tertiary')}>{item.label}</span>
    </li>)}
  </ol>;
}

export default function EvidenceReconciliationStep(props: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [decision, setDecision] = useState<EvidenceDecision>(null);
  const [stage, setStage] = useState<CaptureStage>('SOURCE');
  const [entityKind, setEntityKind] = useState<HitlEvidenceEntityKind | null>(null);
  const [recordMode, setRecordMode] = useState<'EXISTING' | 'NEW' | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [newFields, setNewFields] = useState<Record<string, string>>({});
  const [evidenceText, setEvidenceText] = useState('');
  const [scope, setScope] = useState<EvidencePersistenceScope>('CAREER_PROFILE_AND_APPLICATION');
  const [showRelated, setShowRelated] = useState(false);
  const [relatedSelected, setRelatedSelected] = useState<string[]>([]);
  const [relatedText, setRelatedText] = useState<Record<string, string>>({});
  const [reuseMain, setReuseMain] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const reconciliationHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const options = useMemo(
    () => entityKind ? buildExistingRecordOptions(props.evidence, props.generationId, entityKind) : [],
    [entityKind, props.evidence, props.generationId]
  );
  const selectedOption = options.find((option) => option.key === selectedKey) ?? null;

  useEffect(() => {
    if (decision === 'ADD') headingRef.current?.focus();
  }, [stage, decision]);

  function resetCapture() {
    setDecision(null); setStage('SOURCE'); setEntityKind(null); setRecordMode(null); setSelectedKey(null);
    setNewFields({}); setEvidenceText(''); setScope('CAREER_PROFILE_AND_APPLICATION'); setShowRelated(false);
    setRelatedSelected([]); setRelatedText({}); setReuseMain([]); setLocalError(null);
  }

  function toggle(group: SemanticGapGroup) {
    setOpenId((current) => {
      const next = current === group.id ? null : group.id;
      resetCapture();
      return next;
    });
  }

  function chooseKind(kind: HitlEvidenceEntityKind) {
    setEntityKind(kind); setRecordMode(null); setSelectedKey(null); setNewFields({}); setLocalError(null);
  }

  function canAdvance(): boolean {
    if (stage === 'SOURCE') return Boolean(entityKind);
    if (stage === 'RECORD') return recordMode === 'NEW' || Boolean(selectedOption);
    if (stage === 'EVIDENCE') {
      if (!evidenceText.trim() || !entityKind || !recordMode) return false;
      return recordMode !== 'NEW' || NEW_ENTITY_FIELDS[entityKind].every((field) => !field.required || Boolean(newFields[field.key]?.trim()));
    }
    if (stage === 'RELATED') return relatedSelected.every((id) => reuseMain.includes(id) || Boolean(relatedText[id]?.trim()));
    return true;
  }

  function nextStage() {
    if (!canAdvance()) return;
    const index = stageIndex(stage);
    if (index < STAGES.length - 1) { setStage(STAGES[index + 1].id); setLocalError(null); }
  }

  function previousStage() {
    const index = stageIndex(stage);
    if (index > 0) { setStage(STAGES[index - 1].id); setLocalError(null); }
  }

  async function confirm(group: SemanticGapGroup, value: 'MEETS' | 'DOES_NOT_MEET') {
    const key = `confirm:${group.id}:${value}`;
    if (pendingAction) return;
    setPendingAction(key); setLocalError(null);
    try { await props.onConfirm(group, value); }
    catch { setLocalError('The confirmation could not be saved. Please try again.'); }
    finally { setPendingAction(null); }
  }

  async function save(group: SemanticGapGroup) {
    if (!entityKind || !recordMode || !canAdvance() || pendingAction) return;
    const entity = recordMode === 'NEW'
      ? { mode: 'NEW' as const, data: newEntityData(entityKind, newFields) }
      : selectedEntity(selectedOption!);
    const reusedRequirementIds = relatedSelected.filter((id) => reuseMain.includes(id)).flatMap((id) => {
      const related = props.gaps.find((gap) => gap.id === id);
      return related?.requirementIds ?? [];
    });
    const separateItems = relatedSelected.filter((id) => !reuseMain.includes(id)).map((id) => {
      const related = props.gaps.find((gap) => gap.id === id)!;
      return { fieldKind: evidenceFieldKind(entityKind), text: relatedText[id].trim(), requirementIds: related.requirementIds };
    });
    setPendingAction(`save:${group.id}`); setLocalError(null);
    try {
      await props.onSave({
        entityKind,
        entity,
        evidenceItems: [
          { fieldKind: evidenceFieldKind(entityKind), text: evidenceText.trim(), requirementIds: [...new Set([...group.requirementIds, ...reusedRequirementIds])] },
          ...separateItems,
        ],
        persistenceScope: scope,
      });
      setOpenId(null); resetCapture();
      requestAnimationFrame(() => reconciliationHeadingRef.current?.focus());
    } catch { setLocalError('The evidence could not be saved. Please review it and try again.'); }
    finally { setPendingAction(null); }
  }

  const resolvedCount = props.resolvedRequirementIds.length;

  return <div className="space-y-7">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h3 ref={reconciliationHeadingRef} tabIndex={-1} className="text-lg font-bold text-text-primary">Evidence reconciliation</h3><p className="mt-1 max-w-2xl text-sm text-text-secondary">Add only evidence you can stand behind. One record can resolve several related requirements.</p></div>
      <span className="rounded-full bg-bg-tertiary px-3 py-1.5 text-xs font-bold tabular-nums text-text-secondary">{props.remaining} material gaps</span>
    </div>
    {resolvedCount > 0 && <div role="status" className="rounded-xl bg-success/10 px-4 py-3 text-sm font-semibold text-success"><Check className="mr-2 inline h-4 w-4" />Evidence saved. {resolvedCount} {resolvedCount === 1 ? 'requirement' : 'requirements'} resolved; {props.remaining} remaining.</div>}
    {props.gaps.length === 0 ? <div className="rounded-2xl bg-success/10 p-5 text-sm text-success"><Check className="mr-2 inline h-4 w-4" />Reconciliation complete. Continue to review the proposed CV.</div> : SECTION_COPY.map((section) => {
      const sectionGaps = props.gaps.filter((gap) => gap.presentationGroup === section.id);
      if (!sectionGaps.length) return null;
      return <section key={section.id} aria-labelledby={`section-${section.id}`} className="space-y-3">
        <div><h4 id={`section-${section.id}`} className="text-sm font-bold text-text-primary">{section.title}</h4><p className="mt-1 text-xs leading-5 text-text-secondary">{section.description}</p></div>
        <div className="space-y-2">{sectionGaps.map((group) => {
          const isOpen = openId === group.id;
          const panelId = `evidence-panel-${group.id}`;
          const isConfirmation = group.presentationGroup === 'CONFIRMATION';
          const isUnavailable = isOpen && decision === 'MISSING';
          const isSkipped = skipped.includes(group.id);
          const relatedGaps = props.gaps.filter((candidate) => candidate.id !== group.id && candidate.presentationGroup !== 'CONFIRMATION');
          return <article key={group.id} data-testid={`gap-${group.id}`} data-requirement-ids={group.requirementIds.join(',')} className={cn(
            'overflow-hidden rounded-2xl border transition-colors',
            isUnavailable ? 'border-border-subtle bg-bg-tertiary' : isOpen ? 'border-accent-cyan bg-bg-secondary' : 'border-border-subtle bg-bg-secondary'
          )}>
            <button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggle(group)} className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-bg-tertiary">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-text-primary">{group.label}</span><span className={cn('rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide', group.importance === 'MANDATORY' ? 'bg-accent-cyan/10 text-accent-cyan' : 'bg-bg-tertiary text-text-tertiary')}>{group.importance === 'MANDATORY' ? 'Required' : 'Desirable'}</span><span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs font-semibold text-text-secondary">{isUnavailable ? 'Marked as unavailable' : isSkipped ? 'Review later' : isConfirmation ? 'Needs confirmation' : 'Needs evidence'}</span></span>
                <span className="mt-1 block text-xs text-text-secondary">{group.category.toLocaleLowerCase('en-GB').replace('_', ' ')} · {group.requirementIds.length === 1 ? '1 linked requirement' : `Covers ${group.requirementIds.length} linked requirements`}</span>
              </span>
              <ChevronDown data-state={isOpen ? 'expanded' : 'collapsed'} className={cn('h-4 w-4 shrink-0 text-text-tertiary transition-transform motion-reduce:transition-none', isOpen && 'rotate-180')} />
            </button>
            {isOpen && <div id={panelId} role="region" aria-label={isConfirmation ? `Confirmation for ${group.label}` : `Evidence decision for ${group.label}`} className="border-t border-border-subtle bg-bg-primary p-4 sm:p-5">
              {isConfirmation ? <div className="space-y-4">
                <p className="text-sm text-text-secondary">Confirm whether you can meet this practical requirement.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="accent" shape="rounded" size="sm" isLoading={pendingAction === `confirm:${group.id}:MEETS`} onClick={() => confirm(group, 'MEETS')}>Yes</Button>
                  <Button variant="outline" shape="rounded" size="sm" isLoading={pendingAction === `confirm:${group.id}:DOES_NOT_MEET`} onClick={() => confirm(group, 'DOES_NOT_MEET')}>No</Button>
                  <Button variant="ghost" shape="rounded" size="sm" onClick={() => setSkipped((items) => items.includes(group.id) ? items.filter((id) => id !== group.id) : [...items, group.id])}>{isSkipped ? 'Return to review' : 'Not sure'}</Button>
                </div>
              </div> : decision !== 'ADD' ? <div className="space-y-4">
                <fieldset><legend className="text-sm font-bold text-text-primary">What would you like to do?</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <ChoiceCard name={`decision-${group.id}`} checked={decision === 'MISSING'} label="I don't have this evidence" onChange={() => setDecision('MISSING')} />
                  <ChoiceCard name={`decision-${group.id}`} checked={false} label="Add evidence" onChange={() => { setDecision('ADD'); setStage('SOURCE'); }} />
                </div></fieldset>
                {decision === 'MISSING' && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-secondary p-3"><p className="text-xs text-text-secondary">This will mark the requirement as unavailable for this CV. You can switch back to Add evidence before confirming.</p><Button variant="outline" shape="rounded" size="sm" isLoading={pendingAction === `confirm:${group.id}:DOES_NOT_MEET`} onClick={() => confirm(group, 'DOES_NOT_MEET')}>Confirm unavailable</Button></div>}
              </div> : <div className="overflow-hidden">
                <StageProgress stage={stage} />
                <div key={stage} className="mt-5 transition-[opacity,transform] duration-200 motion-reduce:transition-none">
                  {stage === 'SOURCE' && <div><h5 ref={headingRef} tabIndex={-1} className="text-sm font-bold text-text-primary">Choose an evidence source</h5><p className="mt-1 text-xs text-text-secondary">Select the type of record that contains this evidence.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(ENTITY_LABELS).map(([value, label]) => <button key={value} type="button" aria-pressed={entityKind === value} onClick={() => chooseKind(value as HitlEvidenceEntityKind)} className={cn('min-h-11 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors', entityKind === value ? 'border-accent-cyan bg-accent-cyan/10 text-text-primary' : 'border-border-subtle bg-bg-secondary text-text-secondary hover:border-border-default hover:bg-bg-tertiary')}>{label}</button>)}</div></div>}
                  {stage === 'RECORD' && entityKind && <div><h5 ref={headingRef} tabIndex={-1} className="text-sm font-bold text-text-primary">Choose a {ENTITY_LABELS[entityKind].toLocaleLowerCase('en-GB')} record</h5><p className="mt-1 text-xs text-text-secondary">Use a verified record or create one for this evidence.</p><fieldset className="mt-3 grid gap-2 sm:grid-cols-2"><legend className="sr-only">Use an existing record or create a new one</legend>{options.map((option) => <ChoiceCard key={option.key} name={`record-${group.id}`} checked={selectedKey === option.key} label={option.label} onChange={() => { setRecordMode('EXISTING'); setSelectedKey(option.key); }} />)}<label className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-dashed px-4 py-3 text-sm font-semibold transition-colors', recordMode === 'NEW' ? 'border-accent-cyan bg-accent-cyan/10 text-text-primary' : 'border-border-default bg-bg-secondary text-text-secondary hover:bg-bg-tertiary')}><input type="radio" name={`record-${group.id}`} checked={recordMode === 'NEW'} onChange={() => { setRecordMode('NEW'); setSelectedKey(null); }} className="h-4 w-4 accent-accent-cyan" /><Plus className="h-4 w-4" />Create a new {ENTITY_LABELS[entityKind].toLocaleLowerCase('en-GB')}</label></fieldset></div>}
                  {stage === 'EVIDENCE' && entityKind && recordMode && <div><h5 ref={headingRef} tabIndex={-1} className="text-sm font-bold text-text-primary">Add relevant evidence</h5>{selectedOption && <p className="mt-2 rounded-xl bg-bg-tertiary px-3 py-2 text-xs text-text-secondary">Selected {ENTITY_LABELS[entityKind].toLocaleLowerCase('en-GB')}: <strong className="text-text-primary">{selectedOption.label}</strong></p>}{recordMode === 'NEW' && <div className="mt-4 grid gap-3 sm:grid-cols-2">{NEW_ENTITY_FIELDS[entityKind].map((field) => <label key={field.key} className="text-xs font-bold text-text-secondary">{field.label}{field.required ? ' *' : ''}{field.options ? <select value={newFields[field.key] ?? ''} onChange={(event) => setNewFields((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-1.5 w-full"><option value="">Not specified</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type={field.type === 'url' ? 'url' : field.type === 'date' ? 'month' : 'text'} value={newFields[field.key] ?? ''} onChange={(event) => setNewFields((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-1.5 w-full" />}</label>)}</div>}<label className="mt-4 block text-xs font-bold text-text-secondary">{selectedOption ? `How did you use ${group.label} in ${selectedOption.label}?` : `How does this ${ENTITY_LABELS[entityKind].toLocaleLowerCase('en-GB')} demonstrate ${group.label}?`}<textarea rows={4} value={evidenceText} onChange={(event) => setEvidenceText(event.target.value)} className="mt-1.5 w-full" placeholder="Describe the work, your contribution, and a verifiable outcome where available." /></label></div>}
                  {stage === 'RELATED' && <div><h5 ref={headingRef} tabIndex={-1} className="text-sm font-bold text-text-primary">Related gaps</h5><p className="mt-1 text-xs text-text-secondary">Optionally map this same record to other unresolved requirements.</p><label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border-subtle bg-bg-secondary px-3 py-2 text-sm font-semibold text-text-primary"><input type="checkbox" checked={showRelated} onChange={(event) => setShowRelated(event.target.checked)} className="h-4 w-4 accent-accent-cyan" />This evidence also supports other requirements</label>{showRelated && <fieldset className="mt-3 space-y-2"><legend className="sr-only">Select related unresolved gaps</legend>{relatedGaps.length ? relatedGaps.map((relatedGap) => { const checked = relatedSelected.includes(relatedGap.id); const reuse = reuseMain.includes(relatedGap.id); return <div key={relatedGap.id} className="rounded-xl border border-border-subtle bg-bg-secondary p-3"><label className="flex cursor-pointer items-start gap-3 text-sm font-semibold text-text-primary"><input type="checkbox" checked={checked} onChange={(event) => setRelatedSelected((ids) => event.target.checked ? [...ids, relatedGap.id] : ids.filter((id) => id !== relatedGap.id))} className="mt-0.5 h-4 w-4 accent-accent-cyan" /><span>{relatedGap.label}<span className="mt-0.5 block text-xs font-normal text-text-secondary">{relatedGap.requirementIds.length === 1 ? '1 requirement' : `${relatedGap.requirementIds.length} requirements`}</span></span></label>{checked && <div className="mt-3 border-t border-border-subtle pt-3"><label className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={reuse} onChange={(event) => setReuseMain((ids) => event.target.checked ? [...ids, relatedGap.id] : ids.filter((id) => id !== relatedGap.id))} className="h-4 w-4 accent-accent-cyan" />Use the main evidence statement</label>{!reuse && <label className="mt-3 block text-xs font-semibold text-text-secondary">How did the same record support {relatedGap.label}?<textarea rows={2} value={relatedText[relatedGap.id] ?? ''} onChange={(event) => setRelatedText((items) => ({ ...items, [relatedGap.id]: event.target.value }))} className="mt-1 w-full" /></label>}</div>}</div>; }) : <p className="rounded-xl bg-bg-tertiary p-3 text-xs text-text-secondary">No other unresolved evidence gaps remain.</p>}</fieldset>}</div>}
                  {stage === 'SAVE' && entityKind && <div><h5 ref={headingRef} tabIndex={-1} className="text-sm font-bold text-text-primary">Review and save</h5><dl className="mt-3 grid gap-3 rounded-2xl border border-border-subtle bg-bg-secondary p-4 sm:grid-cols-2"><div><dt className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Evidence source</dt><dd className="mt-1 text-sm font-semibold text-text-primary">{ENTITY_LABELS[entityKind]}</dd></div><div><dt className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Record</dt><dd className="mt-1 text-sm font-semibold text-text-primary">{selectedOption?.label ?? String(newEntityData(entityKind, newFields).name ?? newEntityData(entityKind, newFields).projectName ?? newEntityData(entityKind, newFields).title ?? newEntityData(entityKind, newFields).company ?? newEntityData(entityKind, newFields).institution ?? newEntityData(entityKind, newFields).course ?? newEntityData(entityKind, newFields).organisation ?? 'New record')}</dd></div><div className="sm:col-span-2"><dt className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Evidence being added</dt><dd className="mt-1 text-sm text-text-primary"><ul className="list-disc space-y-1 pl-5"><li>{group.label}</li>{relatedSelected.map((id) => <li key={id}>{props.gaps.find((gap) => gap.id === id)?.label}</li>)}</ul></dd></div></dl><fieldset className="mt-4"><legend className="text-xs font-bold text-text-primary">Persistence</legend><div className="mt-2 grid gap-2 sm:grid-cols-2"><ChoiceCard name={`scope-${group.id}`} checked={scope === 'CAREER_PROFILE_AND_APPLICATION'} label="Career Profile + this application" onChange={() => setScope('CAREER_PROFILE_AND_APPLICATION')} /><ChoiceCard name={`scope-${group.id}`} checked={scope === 'APPLICATION_ONLY'} label="This application only" onChange={() => setScope('APPLICATION_ONLY')} /></div></fieldset></div>}
                </div>
                {localError && <p role="alert" className="mt-4 text-xs font-semibold text-error">{localError}</p>}
                <div className="mt-5 flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
                  {stage !== 'SOURCE' ? <Button variant="ghost" shape="rounded" size="sm" onClick={previousStage}><ChevronLeft className="mr-1 h-4 w-4" />Back</Button> : <span />}
                  {stage === 'SAVE' ? <Button variant="accent" shape="rounded" isLoading={pendingAction === `save:${group.id}`} onClick={() => save(group)}>Save & reconcile</Button> : <Button variant="accent" shape="rounded" size="sm" disabled={!canAdvance()} onClick={nextStage}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>}
                </div>
              </div>}
              {localError && decision !== 'ADD' && <p role="alert" className="mt-4 text-xs font-semibold text-error">{localError}</p>}
            </div>}
          </article>;
        })}</div>
      </section>;
    })}
  </div>;
}
