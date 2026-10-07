import type { NormalizedDocumentBlock } from '../document/types';
import type { ExtractedSkill } from '../types';
import type { InterpretedSection } from './types';

const SKILL_SEPARATOR = /\s*(?:,|;|\||·|•)\s*/u;

function tidy(value: string): string {
  return value.normalize('NFKC').trim().replace(/^[-–—•·\s]+|[-–—•·\s]+$/gu, '').replace(/\s+/gu, ' ');
}

function categoryName(value: string | undefined): string | undefined {
  const category = value ? tidy(value) : '';
  if (!category) return undefined;
  return /^(?:additional|additional skills)$/i.test(category) ? 'Additional' : category;
}

function items(value: string): string[] {
  return value
    .split(SKILL_SEPARATOR)
    .map(tidy)
    .filter((name) => Boolean(name) && name.length <= 160 && /\p{L}/u.test(name));
}

function explicitCategory(text: string): { category?: string; body: string } {
  const separator = text.indexOf(':');
  if (separator <= 0 || separator > 60) return { body: text };
  return {
    category: categoryName(text.slice(0, separator)),
    body: text.slice(separator + 1),
  };
}

function skill(
  name: string,
  category: string | undefined,
  block: NormalizedDocumentBlock,
  section: InterpretedSection
): ExtractedSkill {
  return {
    name,
    ...(category ? { category } : {}),
    excerpt: tidy(block.text).slice(0, 400),
    sourceLocation: {
      line: block.order,
      ...(section.heading ? { section: section.heading } : {}),
    },
  };
}

function tableSkills(section: InterpretedSection): { skills: ExtractedSkill[]; used: Set<string> } {
  const skills: ExtractedSkill[] = [];
  const used = new Set<string>();
  const rows = new Map<string, NormalizedDocumentBlock[]>();
  for (const block of section.blocks) {
    if (!block.table) continue;
    const key = `${block.table.table}:${block.table.row}`;
    rows.set(key, [...(rows.get(key) ?? []), block]);
  }

  for (const row of rows.values()) {
    const cells = [...row].sort((left, right) => left.table!.column - right.table!.column);
    if (cells.every((block) => explicitCategory(block.text).category)) {
      for (const block of cells) {
        used.add(block.id);
        const parsed = explicitCategory(block.text);
        skills.push(...items(parsed.body).map((name) => skill(name, parsed.category, block, section)));
      }
      continue;
    }
    const category = cells.length > 1 ? categoryName(cells[0].text) : undefined;
    const valueCells = cells.length > 1 ? cells.slice(1) : cells;
    for (const block of cells) used.add(block.id);
    for (const block of valueCells) {
      skills.push(...items(block.text).map((name) => skill(name, category, block, section)));
    }
  }
  return { skills, used };
}

/** Read every source representation; identity/category reconciliation happens at import review. */
export function readSkillSections(
  sections: InterpretedSection[],
  projectRepresentations: ExtractedSkill[]
): ExtractedSkill[] {
  const skills: ExtractedSkill[] = [];

  for (const section of sections.filter(({ id }) => id === 'skills')) {
    const table = tableSkills(section);
    skills.push(...table.skills);
    let activeCategory: string | undefined;

    for (let index = 0; index < section.blocks.length; index += 1) {
      const block = section.blocks[index];
      if (table.used.has(block.id)) continue;
      const next = section.blocks[index + 1];
      const styledCategory = Boolean(block.style?.bold || block.style?.headingLevel)
        && !SKILL_SEPARATOR.test(block.text)
        && !block.text.includes(':')
        && Boolean(next);
      if (styledCategory) {
        activeCategory = categoryName(block.text);
        continue;
      }

      const parsed = explicitCategory(block.text);
      const category = parsed.category ?? activeCategory;
      skills.push(...items(parsed.body).map((name) => skill(name, category, block, section)));
    }
  }

  return [...skills, ...projectRepresentations];
}
