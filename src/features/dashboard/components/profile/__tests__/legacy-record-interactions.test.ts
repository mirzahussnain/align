import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), 'src/features/dashboard');
const component = (name: string) => readFileSync(resolve(root, `components/profile/${name}`), 'utf8');
const actions = readFileSync(resolve(root, 'actions/profile-actions.ts'), 'utf8');

describe('legacy profile record interaction contracts', () => {
  const cases = [
    ['ExperienceForm.tsx', 'experience', 'Add experience', 'Save experience'],
    ['ProjectsForm.tsx', 'project', 'Add project', 'Save project'],
    ['EducationForm.tsx', 'education', 'Add education', 'Save education'],
    ['SkillsForm.tsx', 'skill', 'Add skill', 'Save skill'],
  ] as const;

  it.each(cases)('%s is closed until Add and has isolated draft, stable keys, and Cancel', (file, type, add, save) => {
    const source = component(file);
    expect(source).toContain(add);
    expect(source).toContain(save);
    expect(source).toContain('Cancel');
    expect(source).toContain(`key={\`${type}:`);
    expect(source).not.toContain("initial.length ? initial : [{ ...EMPTY }]");
  });

  it('uses individual stable-ID update paths instead of collection replacement for legacy records', () => {
    for (const action of ['saveExperienceRecord', 'saveProjectRecord', 'saveEducationRecord', 'saveSkillRecord']) {
      expect(actions).toContain(`export async function ${action}`);
    }
    expect(actions).toContain('prisma.experience.updateMany');
    expect(actions).toContain('prisma.projectEntry.updateMany');
    expect(actions).toContain('prisma.education.updateMany');
    expect(actions).toContain("await prisma.skill.update({ where: { id: input.id }, data })");
    expect(component('SkillsForm.tsx')).not.toContain('saveSkills');
  });

  it('keys each legacy section by active profile and evidence type', () => {
    const view = readFileSync(resolve(root, 'components/views/ProfileView.tsx'), 'utf8');
    for (const type of ['experience', 'projects', 'education', 'skills']) expect(view).toContain(`key={\`${'${initial.profileId}'}:${type}\`}`);
  });

  it('uses a horizontal, scrollable Profile tab rail below the desktop breakpoint', () => {
    const view = readFileSync(resolve(root, 'components/views/ProfileView.tsx'), 'utf8');
    expect(view).toContain('aria-label="Profile sections"');
    expect(view).toContain('overflow-x-auto');
    expect(view).toContain('lg:flex-col');
    expect(view).toContain('shrink-0 items-center');
    expect(view).toContain('whitespace-nowrap');
  });
});
