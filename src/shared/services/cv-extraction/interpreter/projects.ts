import { findDateRange } from '../dates';
import type { NormalizedDocumentBlock } from '../document/types';
import {
  classifyLinkUrl,
  findUrlsInText,
  labelSuggestsLiveSite,
  labelSuggestsRepository,
  normaliseUrl,
} from '../links';
import type { ExtractedProject, ExtractedSkill } from '../types';
import { groupSectionBlocks } from './grouping';
import type { CvInterpretationIssue, InterpretedSection, LocalBlockGroup } from './types';

const DELIMITER = /\s*(?:\||·|•)\s*/u;

interface ProjectLink {
  url: string;
  visibleText?: string;
}

interface OpenProject {
  project: ExtractedProject;
  blocks: NormalizedDocumentBlock[];
  links: ProjectLink[];
}

function tidy(value: string): string {
  return value.trim().replace(/^[\s,;|·•–—-]+|[\s,;|·•–—-]+$/gu, '').replace(/\s+/gu, ' ');
}

function facts(value: string): string[] {
  return value.split(DELIMITER).map(tidy).filter(Boolean);
}

function linksOf(block: NormalizedDocumentBlock): ProjectLink[] {
  const supplied: ProjectLink[] = block.linkDetails ?? (block.links ?? []).map((url) => ({ url }));
  const visible: ProjectLink[] = findUrlsInText(block.text).map((url) => ({ url }));
  const byUrl = new Map<string, ProjectLink>();
  for (const link of [...supplied, ...visible]) {
    const url = normaliseUrl(link.url);
    if (!url) continue;
    const current = byUrl.get(url);
    byUrl.set(url, { url, visibleText: current?.visibleText ?? link.visibleText });
  }
  return [...byUrl.values()];
}

function isProjectLink(link: ProjectLink): boolean {
  const kind = classifyLinkUrl(link.url);
  return kind === 'github_repository' || (
    kind === 'web' && (labelSuggestsRepository(link.visibleText) || labelSuggestsLiveSite(link.visibleText))
  );
}

function stripLinkText(text: string, links: ProjectLink[]): string {
  let result = text;
  for (const link of links) {
    if (link.visibleText) result = result.split(link.visibleText).join(' ');
    result = result.split(link.url).join(' ');
    result = result.split(link.url.replace(/^https:\/\//, '')).join(' ');
  }
  return tidy(result);
}

function isStyledPeer(block: NormalizedDocumentBlock): boolean {
  return block.kind === 'heading' || Boolean(block.style?.headingLevel || block.style?.bold);
}

function isDetail(block: NormalizedDocumentBlock): boolean {
  const text = tidy(block.text);
  return block.kind === 'bullet' || Boolean(block.list) || /[.!?]$/u.test(text);
}

function isLinkOnlyBlock(block: NormalizedDocumentBlock, links: ProjectLink[]): boolean {
  if (!links.length) return false;
  const text = tidy(block.text);
  return /^(?:repository|repo|source(?: code)?|code|live(?: demo)?|demo|view project)$/i.test(text)
    || tidy(stripLinkText(text, links)) === '';
}

function hasDelimiter(text: string): boolean {
  return DELIMITER.test(text);
}

function issue(block: NormalizedDocumentBlock): CvInterpretationIssue {
  return {
    code: 'AMBIGUOUS_ENTITY_OWNERSHIP',
    blockIds: [block.id],
    messageKey: 'cvImport.review.ambiguousEntityOwnership',
  };
}

function projectCandidateId(project: ExtractedProject): string {
  const identity = project.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `PROJECT:${identity}`;
}

function projectUrls(links: ProjectLink[]): Pick<ExtractedProject, 'repositoryUrl' | 'liveUrl' | 'sourceLinks'> {
  let repositoryUrl: string | undefined;
  let liveUrl: string | undefined;
  const sourceLinks: { url: string; label?: string }[] = [];

  for (const link of links) {
    const kind = classifyLinkUrl(link.url);
    sourceLinks.push({ url: link.url, ...(link.visibleText ? { label: link.visibleText } : {}) });
    if (kind === 'github_repository' || labelSuggestsRepository(link.visibleText)) {
      repositoryUrl ??= link.url;
    } else if (kind === 'web' && (labelSuggestsLiveSite(link.visibleText) || !liveUrl)) {
      liveUrl ??= link.url;
    }
  }

  return {
    ...(repositoryUrl ? { repositoryUrl } : {}),
    ...(liveUrl ? { liveUrl } : {}),
    ...(sourceLinks.length ? { sourceLinks } : {}),
  };
}

function startProject(block: NormalizedDocumentBlock, section: InterpretedSection): OpenProject | null {
  const blockLinks = linksOf(block);
  const date = findDateRange(block.text);
  const withoutDate = date
    ? `${block.text.slice(0, date.startIndex)} ${block.text.slice(date.endIndex)}`
    : block.text;
  const segments = facts(stripLinkText(withoutDate, blockLinks));
  const name = segments[0];
  if (!name || !/\p{L}/u.test(name)) return null;
  const technologies = segments.slice(1).filter((part) => !/[.!?]$/u.test(part));
  const excerpt = tidy(block.text).slice(0, 400);
  return {
    project: {
      name: name.slice(0, 160),
      startDate: date?.start ?? null,
      endDate: date?.end ?? null,
      achievements: [],
      ...(technologies.length ? { technologies: technologies.map((part) => part.slice(0, 40)) } : {}),
      excerpt,
      sourceLocation: {
        line: block.order,
        ...(section.heading ? { section: section.heading } : {}),
      },
    },
    blocks: [block],
    links: blockLinks,
  };
}

function canStartPlainProject(
  block: NormalizedDocumentBlock,
  previous: NormalizedDocumentBlock | undefined,
  next: NormalizedDocumentBlock | undefined,
  isFirst: boolean
): boolean {
  if (isDetail(block)) return false;
  if (isFirst) return true;
  if (findDateRange(block.text)) return true;
  if (linksOf(block).some(isProjectLink)) return true;
  return Boolean(previous && isDetail(previous) && (!next || isDetail(next)));
}

function isMetadataRow(
  block: NormalizedDocumentBlock,
  next: NormalizedDocumentBlock | undefined
): boolean {
  return !isStyledPeer(block)
    && hasDelimiter(block.text)
    && !findDateRange(block.text)
    && !linksOf(block).some(isProjectLink)
    && Boolean(next && isDetail(next));
}

function readGroup(
  group: LocalBlockGroup,
  section: InterpretedSection,
  allowUnlinkedIdentity: boolean
): { projects: OpenProject[]; skills: ExtractedSkill[]; orphans: NormalizedDocumentBlock[] } {
  const projects: OpenProject[] = [];
  const skills: ExtractedSkill[] = [];
  const orphans: NormalizedDocumentBlock[] = [];
  let open: OpenProject | undefined;

  for (let index = 0; index < group.blocks.length; index += 1) {
    const block = group.blocks[index];
    const previous = group.blocks[index - 1];
    const next = group.blocks[index + 1];
    const blockLinks = linksOf(block);
    if (open && isLinkOnlyBlock(block, blockLinks)) {
      open.blocks.push(block);
      open.links.push(...blockLinks);
      continue;
    }
    const embeddedIdentity = !allowUnlinkedIdentity && isStyledPeer(block) && blockLinks.some(isProjectLink);
    const independentIdentity = allowUnlinkedIdentity && (
      isStyledPeer(block) || canStartPlainProject(block, previous, next, projects.length === 0)
    );

    if (embeddedIdentity || independentIdentity) {
      const started = startProject(block, section);
      if (started) {
        open = started;
        projects.push(started);
        for (const technology of started.project.technologies ?? []) {
          skills.push({
            name: technology,
            excerpt: started.project.excerpt,
            sourceLocation: started.project.sourceLocation,
          });
        }
        continue;
      }
    }

    if (!open) {
      if (isDetail(block)) orphans.push(block);
      continue;
    }

    if (isMetadataRow(block, next)) {
      const metadata = facts(block.text).map((part) => part.slice(0, 40));
      open.project.technologies = [...(open.project.technologies ?? []), ...metadata];
      open.blocks.push(block);
      for (const name of metadata) {
        skills.push({
          name,
          excerpt: tidy(block.text).slice(0, 400),
          sourceLocation: {
            line: block.order,
            ...(section.heading ? { section: section.heading } : {}),
          },
        });
      }
      continue;
    }

    open.blocks.push(block);
    open.links.push(...blockLinks);
    if (!blockLinks.length || tidy(stripLinkText(block.text, blockLinks))) {
      const detail = tidy(stripLinkText(block.text, blockLinks));
      if (detail && isDetail(block)) open.project.achievements.push(detail.slice(0, 2000));
    }
  }

  for (const project of projects) {
    Object.assign(project.project, projectUrls(project.links));
  }
  return { projects, skills, orphans };
}

/** Resolve project identity and ownership inside section- and stream-local boundaries. */
export function readProjectSections(
  sections: InterpretedSection[]
): { projects: ExtractedProject[]; skillRepresentations: ExtractedSkill[]; issues: CvInterpretationIssue[] } {
  const projects: ExtractedProject[] = [];
  const skillRepresentations: ExtractedSkill[] = [];
  const orphanDetails: NormalizedDocumentBlock[] = [];

  for (const section of sections.filter(({ id }) => id === 'projects' || id === 'experience')) {
    for (const group of groupSectionBlocks(section)) {
      const result = readGroup(group, section, section.id === 'projects');
      projects.push(...result.projects.map(({ project }) => project));
      skillRepresentations.push(...result.skills);
      orphanDetails.push(...result.orphans);
    }
  }

  const candidateIds = projects.map(projectCandidateId);
  const issues = projects.length
    ? orphanDetails.map((block) => ({ ...issue(block), candidateIds }))
    : [];
  return { projects, skillRepresentations, issues };
}
