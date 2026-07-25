import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardSubtitle } from '../StructuredEvidenceManager';

const root = resolve(process.cwd(), 'src/features/dashboard');
const component = (name: string) => readFileSync(resolve(root, `components/profile/${name}`), 'utf8');
const actions = readFileSync(resolve(root, 'actions/profile-actions.ts'), 'utf8');

const projects = component('ProjectsForm.tsx');
const education = component('EducationForm.tsx');
const skills = component('SkillsForm.tsx');
const evidence = component('StructuredEvidenceManager.tsx');

describe('required-field presentation matches backend validation', () => {
  it('marks exactly the server-required primary-form fields', () => {
    // Projects: name is required; achievements enforced as "meaningful evidence".
    expect(projects).toContain("<Label htmlFor={id('name')} required>Project name</Label>");
    expect(projects).toContain("<Label htmlFor={id('achievements')} required>Project evidence or achievements</Label>");
    // Education: qualification + institution required, nothing else.
    expect(education).toContain("<Label htmlFor={id('degree')} required>Qualification</Label>");
    expect(education).toContain("<Label htmlFor={id('university')} required>Institution</Label>");
    // Skills: only the skill name is required.
    expect(skills).toContain("<Label htmlFor={id('name')} required>Skill</Label>");
  });

  it('enforces the project meaningful-evidence requirement on the server too', () => {
    expect(actions).toContain('at least one project evidence or achievement line are required');
    expect(projects).toContain('Add a project name and at least one project evidence or achievement line.');
  });

  it('does not mark any backend-optional field as required', () => {
    // Grade/description/dates are optional in the server action.
    expect(education).toContain("optional>Grade");
    expect(education).toContain("optional>Description");
    expect(education).toContain("optional>Start date");
    expect(skills).toContain("optional>Category");
    expect(skills).toContain("optional>Level");
    expect(projects).toContain("optional>Linked canonical Skills");
  });
});

describe('optional labelling is consistent and centralised', () => {
  it('drives required/optional entirely through the shared Label helper', () => {
    const field = component('Field.tsx');
    expect(field).toContain('required?: boolean;');
    expect(field).toContain('optional?: boolean;');
    expect(field).toContain('(optional)');
  });
});

describe('grade stays optional free text', () => {
  it('keeps grade as a plain text field with example helper text', () => {
    expect(education).toContain('Examples: Distinction, First Class, 2:1, 3.8/4.0, 85%, Pass');
    expect(education).toContain("<TextField id={id('grade')}");
    // No enum/select smuggled in for grade.
    expect(education).not.toContain('gradeLevel');
  });
});

describe('shared month/year control on every year/year-month field', () => {
  it('renders evidence date fields with MonthField, not free text hints', () => {
    expect(evidence).toContain("import { Label, MonthField");
    expect(evidence).toContain('field.date ? <MonthField');
    // The old ambiguous free-text hint must be gone everywhere.
    expect(evidence).not.toContain('YYYY or YYYY-MM');
    const field = component('Field.tsx');
    expect(field).toContain('aria-label={id ? undefined : "Year"}');
    expect(field).toContain('text-neutral-400');
    expect(field).toContain("{year ? 'Month' : 'Select year first'}");
    expect(field).toContain('disabled:bg-neutral-50');
    expect(field).toContain('min-[360px]:grid-cols-2');
    expect(field).not.toContain('placeholder=\"YYYY or YYYY-MM\"');
  });

  it('flags every stored date column as a date control', () => {
    for (const key of ['issueDate', 'expiryDate', 'startDate', 'endDate', 'period']) {
      expect(evidence).toContain(`key: '${key}', label:`);
    }
    // Primary forms already use MonthField.
    expect(projects).toContain('MonthField');
    expect(education).toContain('MonthField');
  });
});

describe('skills form exposes only basic fields by default', () => {
  it('collapses supporting evidence behind an expandable control', () => {
    expect(skills).toContain('Add supporting evidence');
    expect(skills).toContain('aria-expanded={showAdvanced}');
    expect(skills).toContain('setShowAdvanced');
    // Advanced fields render only when expanded.
    expect(skills).toContain('{showAdvanced && <div');
    expect(skills).toContain("optional>Context type");
    expect(skills).toContain("optional>Activity / evidence");
  });

  it('does not use a misleading default category value', () => {
    expect(skills).not.toContain('placeholder="Languages"');
    expect(skills).toContain('placeholder="Select or enter a category"');
  });
  it('merges paired taxonomy picker updates instead of restoring a stale draft', () => {
    expect(skills).toContain('setEditor((current) =>');
    expect(skills).toContain('draft: { ...current.draft, ...patch }');
    expect(skills).toContain("list={id('category-options')}");
  });
});

describe('lifecycle status and evidence status are distinct', () => {
  it('names each lifecycle status by its record type', () => {
    for (const label of ['Certification status', 'Licence status', 'Registration status', 'Training status']) {
      expect(evidence).toContain(`label: '${label}'`);
    }
  });

  it('labels verification as Evidence status, never generic Status/Verification status', () => {
    expect(evidence).toContain("label: 'Evidence status'");
    expect(evidence).not.toContain("label: 'Verification status'");
    expect(evidence).not.toContain("label: 'Status'");
  });
});

describe('training section wording', () => {
  it('renders a singular heading and updated field labels', () => {
    expect(evidence).toContain("kind === 'other' || kind === 'training'");
    expect(evidence).toContain("label: 'Training name'");
    expect(evidence).toContain("label: 'Training topic'");
    expect(evidence).toContain("label: 'Result or outcome'");
    expect(evidence).not.toContain("label: 'Topic / field'");
    expect(evidence).not.toContain("label: 'Completion status'");
  });
});

describe('summary cards never expose raw codes, empty separators, or sensitive numbers', () => {
  it('maps controlled codes to human labels', () => {
    expect(cardSubtitle('language', { language: 'English', speaking: 'professional_working', reading: '', writing: '' }))
      .toBe('Professional working proficiency');
    expect(cardSubtitle('certification', { officialName: 'AWS SA', issuingBody: 'Amazon', status: 'in_progress' }))
      .toBe('Amazon · In progress');
    expect(cardSubtitle('training', { course: 'First Aid', provider: 'Red Cross', status: 'completed' }))
      .toBe('Red Cross · Completed');
  });

  it('omits licence and registration numbers from the card', () => {
    const licence = cardSubtitle('licence', { officialName: 'Forklift', issuingBody: 'HSE', credentialNumber: 'SECRET-123', status: 'active' });
    expect(licence).toBe('HSE · Active');
    expect(licence).not.toContain('SECRET-123');
    const registration = cardSubtitle('registration', { officialName: 'RN', issuingBody: 'NMC', credentialNumber: 'PIN-999', status: 'active' });
    expect(registration).not.toContain('PIN-999');
  });

  it('produces no dangling separator when fields are empty', () => {
    expect(cardSubtitle('certification', { officialName: 'Solo' })).toBe('');
    // Primary-form cards build date ranges without leaving " – " or " · ".
    expect(projects).toContain('formatDateRange(record.startDate, record.endDate)');
    expect(education).toContain('formatDateRange(record.startDate, record.endDate, record.current)');
  });
});

describe('accessibility wiring', () => {
  it('associates every primary-form input with a unique id and its label', () => {
    for (const source of [projects, education, skills]) {
      expect(source).toContain('const id = (name: string) =>');
      expect(source).toContain('htmlFor={id(');
    }
  });

  it('links hint text to its control via aria-describedby', () => {
    expect(evidence).toContain('aria-describedby={hintId}');
    expect(education).toContain("aria-describedby={id('grade-hint')}");
  });
});
describe('mobile profile form layout', () => {
  it('stacks record cards and action buttons on narrow screens', () => {
    for (const source of [projects, component('ExperienceForm.tsx'), education, skills, evidence]) {
      expect(source).toContain('sm:flex-row');
      expect(source).toContain('flex-col-reverse');
      expect(source).toContain('sm:w-auto');
    }
  });

  it('keeps the personal and phone controls usable on narrow screens', () => {
    const personal = component('PersonalInfoForm.tsx');
    const phone = component('PhonePicker.tsx');
    expect(personal).toContain('w-full items-center justify-center');
    expect(phone).toContain('grid-cols-1');
    expect(phone).toContain('min-[380px]:grid-cols');
  });
});
