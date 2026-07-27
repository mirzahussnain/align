import { describe, expect, it } from 'vitest';
import {
  docxWithHeaderAndHyperlinks,
  docxWithTextBoxAndFieldLink,
  minimalPdf,
  pdfWithFormFields,
  realWorldPdfCv,
} from './fixtures';
import { extractStoredCv } from '../index';
import { parseCvStructure } from '../structured';
import {
  classifyLinkUrl,
  findUrlsInText,
  findWrittenHandles,
  normaliseUrl,
  splitMarkdownLinks,
} from '../links';
import { matchSectionHeading } from '../sections';

/**
 * The links, the summary, the phone and the projects a CV carries — the four
 * things a real import lost on its way from a document to a review screen.
 *
 * The PDF and DOCX fixtures here are real documents, generated per-run and put
 * through the whole extractor, not hand-written text handed to the parser. A
 * hyperlink whose address exists only in a PDF annotation or a DOCX relationship
 * cannot be tested any other way: parse a string and the defect is invisible.
 */

describe('URL normalisation', () => {
  it('puts one address into one form', () => {
    expect(normaliseUrl('LinkedIn.COM/in/Amara-Okafor')).toBe('https://linkedin.com/in/Amara-Okafor');
    expect(normaliseUrl('http://example.com/')).toBe('https://example.com');
    expect(normaliseUrl('www.example.com/path/')).toBe('https://www.example.com/path');
  });

  it('keeps path case, because a username is displayed as its owner typed it', () => {
    expect(normaliseUrl('github.com/MirzaHussnain')).toBe('https://github.com/MirzaHussnain');
  });

  it('trims the sentence punctuation a URL is written next to', () => {
    expect(normaliseUrl('https://example.com/portfolio.')).toBe('https://example.com/portfolio');
  });

  it('refuses things that are not addresses', () => {
    expect(normaliseUrl('')).toBeNull();
    expect(normaliseUrl('localhost')).toBeNull();
    expect(normaliseUrl('javascript:alert(1)')).toBeNull();
  });

  it('keeps a mailto target as an email rather than promoting it to a site', () => {
    expect(normaliseUrl('mailto:Amara@Example.com')).toBe('mailto:amara@example.com');
    expect(classifyLinkUrl('mailto:amara@example.com')).toBe('email');
  });
});

describe('link classification', () => {
  it('recognises a LinkedIn personal profile in every common spelling', () => {
    for (const written of [
      'linkedin.com/in/amara-okafor',
      'www.linkedin.com/in/amara-okafor',
      'https://linkedin.com/in/amara-okafor',
      'https://www.linkedin.com/in/amara-okafor',
      'https://uk.linkedin.com/in/amara-okafor',
      'LinkedIn.com/IN/amara-okafor',
    ]) {
      expect(classifyLinkUrl(normaliseUrl(written)!), written).toBe('linkedin_profile');
    }
  });

  it('does not treat a company page as the candidate’s own profile', () => {
    expect(classifyLinkUrl('https://linkedin.com/company/fintra')).toBe('linkedin_other');
    expect(classifyLinkUrl('https://linkedin.com/school/university-of-salford')).toBe('linkedin_other');
    expect(classifyLinkUrl('https://linkedin.com/posts/amara-okafor-activity-123')).toBe('linkedin_other');
  });

  it('separates a GitHub account from a repository inside it', () => {
    expect(classifyLinkUrl('https://github.com/hussnain')).toBe('github_profile');
    expect(classifyLinkUrl('https://github.com/hussnain/align')).toBe('github_repository');
    expect(classifyLinkUrl('https://www.github.com/hussnain')).toBe('github_profile');
  });

  it('does not read a GitHub site page as somebody’s username', () => {
    expect(classifyLinkUrl('https://github.com/pricing')).toBe('web');
    expect(classifyLinkUrl('https://hussnain.github.io')).toBe('web');
  });
});

describe('URLs written out in the text', () => {
  it('finds addresses with and without a scheme', () => {
    expect(findUrlsInText('linkedin.com/in/amara-okafor')).toEqual([
      'https://linkedin.com/in/amara-okafor',
    ]);
    expect(findUrlsInText('see https://example.com/cv and www.example.org')).toEqual([
      'https://example.com/cv',
      'https://www.example.org',
    ]);
  });

  it('does not read a technology name as a bare domain', () => {
    // "Node.js" and "socket.io" match any permissive host.tld pattern, and one of
    // them arriving as the candidate's personal website is worse than missing a
    // portfolio link.
    expect(findUrlsInText('Node.js, Vue.js, asp.net')).toEqual([]);
    expect(findUrlsInText('Skills: React, Next.js, Express')).toEqual([]);
  });

  it('does not read an email’s host as a website', () => {
    expect(findUrlsInText('amara.okafor@example.com')).toEqual([]);
  });

  it('reads the same address once when it is written and linked', () => {
    const { text, links } = splitMarkdownLinks('Portfolio: [example.com](https://example.com)');
    expect(text).toBe('Portfolio: example.com');
    expect(links).toEqual([{ url: 'https://example.com', visibleText: 'example.com' }]);
  });
});

describe('handles written as labels, with no address behind them', () => {
  it('reads a handle only when the separator says it is one', () => {
    expect(findWrittenHandles('github/amaraokafor')).toMatchObject([
      { platform: 'github', handle: 'amaraokafor', derivedUrl: 'https://github.com/amaraokafor' },
    ]);
    expect(findWrittenHandles('LinkedIn: amara-okafor')).toMatchObject([
      { platform: 'linkedin', derivedUrl: 'https://linkedin.com/in/amara-okafor' },
    ]);
    expect(findWrittenHandles('linkedIn/in/amara-okafor')[0].derivedUrl).toBe(
      'https://linkedin.com/in/amara-okafor'
    );
  });

  it('does not read a technology list as a handle', () => {
    // The reason the separator has to be "/", ":" or "@": these are the shapes a
    // skills section takes, and a space-tolerant rule turns every one of them
    // into somebody's profile URL.
    expect(findWrittenHandles('GitHub Actions, Docker, Terraform')).toEqual([]);
    expect(findWrittenHandles('Tools: Git, GitHub, Jira')).toEqual([]);
    expect(findWrittenHandles('Experience with GitHub and GitLab')).toEqual([]);
  });

  it('leaves a real URL to the URL reader', () => {
    expect(findWrittenHandles('linkedin.com/in/amara-okafor')).toEqual([]);
    expect(findWrittenHandles('https://github.com/amaraokafor')).toEqual([]);
  });

  it('derives an address and records that it was derived', () => {
    const structured = parseCvStructure(
      ['Amara Okafor', 'amara@example.com | linkedIn/amara-okafor | github/amaraokafor'].join('\n')
    );
    expect(structured.identity.linkedin).toBe('https://linkedin.com/in/amara-okafor');
    expect(structured.identity.github).toBe('https://github.com/amaraokafor');
    expect(structured.derivedIdentity).toEqual([
      { field: 'linkedin', writtenAs: 'linkedIn/amara-okafor' },
      { field: 'github', writtenAs: 'github/amaraokafor' },
    ]);
  });

  it('prefers a resolved hyperlink over a handle, and marks nothing as derived', async () => {
    // The real CV printed "linkedIn/jordanreyes-dev" while its hyperlink pointed
    // at /in/jordan-reyes-dev. The two disagree, and the link is the truth.
    const { structured } = await extractStoredCv(realWorldPdfCv());
    expect(structured.identity.linkedin).toBe('https://linkedin.com/in/jordan-reyes-dev');
    expect(structured.derivedIdentity).toBeUndefined();
  });
});

describe('PDF hyperlink recovery', () => {
  it('recovers LinkedIn, GitHub and a portfolio from annotations alone', async () => {
    // The regression case. The text layer of this document contains the labels
    // "github/jordanreyes", "linkedIn/jordanreyes-dev" and "jordanreyes.me" and
    // not one http address; the URLs exist only as /Link annotations.
    const { text, structured } = await extractStoredCv(realWorldPdfCv());
    expect(text).not.toContain('http');

    expect(structured.identity.linkedin).toBe('https://linkedin.com/in/jordan-reyes-dev');
    expect(structured.identity.github).toBe('https://github.com/jordanreyes');
    expect(structured.identity.website).toBe('https://jordanreyes.me');
  });

  it('splits the phone into a dial code and a national number', async () => {
    const { structured } = await extractStoredCv(realWorldPdfCv());
    expect(structured.identity).toMatchObject({
      phone: '+44 7737-853800',
      phoneDialCode: '+44',
      phoneNumber: '7737853800',
      phoneCountry: 'GB',
    });
  });

  it('reads the PROFILE section as a professional summary, with provenance', async () => {
    const { structured } = await extractStoredCv(realWorldPdfCv());
    expect(structured.summary).toContain('IT Support professional');
    expect(structured.summarySource?.sourceLocation.section).toBe('PROFILE');
    expect(structured.summarySource?.excerpt).toContain('IT Support professional');
  });

  it('reads a project that has no dates, and attaches its repository link', async () => {
    const { structured } = await extractStoredCv(realWorldPdfCv());
    expect(structured.projects).toHaveLength(1);
    expect(structured.projects[0]).toMatchObject({
      name: 'Kinetx - Distributed Video Streaming Platform',
      startDate: null,
      endDate: null,
      repositoryUrl: 'https://github.com/jordanreyes/kinetx',
      // The stack listed on the same line is kept as the project's skills
      // instead of being swallowed into its name or dropped.
      technologies: ['Node.js', 'Docker', 'PostgreSQL'],
    });
    // The repository URL is the project's, and is NOT mistaken for the
    // candidate's GitHub profile.
    expect(structured.identity.github).toBe('https://github.com/jordanreyes');
  });

  it('names both institutions, so neither education entry is raised as incomplete', async () => {
    const { structured } = await extractStoredCv(realWorldPdfCv());
    expect(structured.education).toHaveLength(2);
    expect(structured.education.map((entry) => entry.university)).toEqual([
      'Ulster University, UK',
      'Northgate Institute of Technology, Pakistan',
    ]);
    expect(structured.education[0]).toMatchObject({
      degree: 'MSc Computer Science & Technology (AI)',
      startDate: '2024-09',
      endDate: '2025-10',
    });
  });

  it('does not turn a bare link label into a project or an achievement', async () => {
    const { structured } = await extractStoredCv(realWorldPdfCv());
    expect(structured.projects.map((project) => project.name)).not.toContain('Repository');
    expect(structured.projects[0].achievements).toEqual([
      'Deployed a distributed application on Azure Virtual Machines using Docker and Nginx.',
      'Configured networking, reverse proxy and PostgreSQL.',
    ]);
  });

  it('does not promote a project link into the personal website field', async () => {
    const pdf = minimalPdf([
      'Sam Iyer',
      'sam.iyer@example.com',
      'KEY PROJECTS',
      'Bus Tracker',
      { text: 'Live demo', url: 'https://bus-tracker.example.com' },
    ]);
    const { structured } = await extractStoredCv(pdf);
    expect(structured.identity.website).toBeUndefined();
    expect(structured.projects[0].liveUrl).toBe('https://bus-tracker.example.com');
  });

  it('still reads a PDF that has no annotations at all', async () => {
    const { structured } = await extractStoredCv(
      minimalPdf([
        'Amara Okafor',
        'Registered Nurse',
        'amara.okafor@example.com',
        'WORK EXPERIENCE',
        'Staff Nurse at Salford Royal, Sep 2017 - Feb 2021',
      ])
    );
    expect(structured.identity.fullName).toBe('Amara Okafor');
    expect(structured.links).toBeUndefined();
  });
});

describe('DOCX hyperlink and header recovery', () => {
  it('reads a contact block that lives in the page header', async () => {
    // mammoth walks word/document.xml only, so before header support this
    // document extracted with no name, no phone and no links whatsoever.
    const { text, structured } = await extractStoredCv(await docxWithHeaderAndHyperlinks());
    expect(text.startsWith('Priya Raman')).toBe(true);
    expect(structured.identity.fullName).toBe('Priya Raman');
    expect(structured.identity.email).toBe('priya.raman@example.com');
  });

  it('resolves clickable labels to the addresses behind them', async () => {
    const { structured } = await extractStoredCv(await docxWithHeaderAndHyperlinks());
    expect(structured.identity.linkedin).toBe('https://www.linkedin.com/in/priya-raman');
    expect(structured.identity.github).toBe('https://github.com/priyaraman');
    expect(structured.identity.website).toBe('https://priyaraman.dev');
  });

  it('splits a phone written on the same line as an email', async () => {
    // "email | +44 (0)7700 900456" is the single most common contact layout
    // there is, and the old rule skipped any line carrying an email outright.
    const { structured } = await extractStoredCv(await docxWithHeaderAndHyperlinks());
    expect(structured.identity).toMatchObject({
      phone: '+44 (0)7426 123456',
      phoneDialCode: '+44',
      phoneNumber: '7426123456',
      phoneCountry: 'GB',
    });
  });

  it('attaches a table-cell repository link to the project in that row', async () => {
    const { structured } = await extractStoredCv(await docxWithHeaderAndHyperlinks());
    const ledger = structured.projects.find((project) => project.name === 'Ledger Reconciliation Tool');
    expect(ledger?.repositoryUrl).toBe('https://github.com/priyaraman/ledger-tool');
  });

  it('gives each project its own links rather than piling them on the first', async () => {
    const { structured } = await extractStoredCv(await docxWithHeaderAndHyperlinks());
    const [ledger, invoice] = structured.projects;
    expect(ledger.liveUrl).toBeUndefined();
    expect(invoice).toMatchObject({
      name: 'Invoice Matcher',
      liveUrl: 'https://invoice-matcher.example.com',
    });
    expect(invoice.repositoryUrl).toBeUndefined();
  });

  it('reads "PROJECTS & PORTFOLIO" as a projects heading', async () => {
    const { structured } = await extractStoredCv(await docxWithHeaderAndHyperlinks());
    expect(structured.detectedSections).toContain('PROJECTS & PORTFOLIO');
    expect(structured.projects.length).toBe(2);
  });
});

describe('PDF form field values', () => {
  it('reads what was typed into the fields, in reading order', async () => {
    // The text layer holds "Full name:", "Email:", "Phone:" and no answers.
    const { text, structured } = await extractStoredCv(pdfWithFormFields());
    // Field values only, in reading order — the labels are already on the page.
    expect(text.startsWith('Rosa Mehta\nrosa.mehta@example.com\n+44 7426 123456')).toBe(true);
    expect(structured.identity.fullName).toBe('Rosa Mehta');
    expect(structured.identity.email).toBe('rosa.mehta@example.com');
    expect(structured.identity).toMatchObject({
      phoneDialCode: '+44',
      phoneNumber: '7426123456',
      phoneCountry: 'GB',
    });
  });

  it('still reads the page text around the fields', async () => {
    const { structured } = await extractStoredCv(pdfWithFormFields());
    expect(structured.experience[0]).toMatchObject({
      jobTitle: 'Care Assistant',
      company: 'Ashwood House',
      current: true,
    });
  });

  it('keeps link line numbers correct once field values are added above them', async () => {
    // Prepending renumbers every line. A link left pointing at its old index
    // would drift onto a different entry — the bug this guards is silent.
    const { text, structured } = await extractStoredCv(realWorldPdfCv());
    const repo = structured.links?.find((link) => link.visibleText === 'Repository');
    expect(repo?.line).toBeDefined();
    expect(text.split('\n')[repo!.line!]).toBe('Repository');
  });

  it('does not open a document twice when it has no form', async () => {
    // No AcroForm, so the form pass never runs and nothing is prepended.
    const { text } = await extractStoredCv(realWorldPdfCv());
    expect(text.startsWith('Jordan Reyes')).toBe(true);
  });
});

describe('DOCX surfaces mammoth does not walk', () => {
  it('reads a contact block that lives inside a floating text box', async () => {
    // Two-column CV templates routinely put the whole left column in a text box.
    // A body-paragraph walk sees none of it, so this document previously
    // extracted with no name, no email and no links at all.
    const { text, structured } = await extractStoredCv(await docxWithTextBoxAndFieldLink());
    expect(text.startsWith('Nadia Haddad')).toBe(true);
    expect(structured.identity.fullName).toBe('Nadia Haddad');
    expect(structured.identity.email).toBe('nadia.haddad@example.com');
  });

  it('resolves hyperlinks inside a text box', async () => {
    const { structured } = await extractStoredCv(await docxWithTextBoxAndFieldLink());
    expect(structured.identity.linkedin).toBe('https://www.linkedin.com/in/nadia-haddad');
    expect(structured.identity.github).toBe('https://github.com/nadiahaddad');
  });

  it('recovers a link stored as a HYPERLINK field code, and classifies it', async () => {
    // A field-code link carries no relationship id, so nothing that resolves
    // `r:id` finds it — the label "see my work" survived and the address did not.
    const { structured } = await extractStoredCv(await docxWithTextBoxAndFieldLink());
    expect(structured.identity.website).toBe('https://nadiahaddad.dev');
    expect(structured.links).toContainEqual(
      expect.objectContaining({ url: 'https://nadiahaddad.dev', visibleText: 'see my work' })
    );
  });

  it('does not leak the field instruction into the visible text', async () => {
    // `w:instrText` is shaped exactly like a text run and is markup, not text.
    const { text } = await extractStoredCv(await docxWithTextBoxAndFieldLink());
    expect(text).not.toContain('HYPERLINK');
    expect(text).toContain('Portfolio: see my work');
  });

  it('reads text-box content once, not twice', async () => {
    const { text } = await extractStoredCv(await docxWithTextBoxAndFieldLink());
    expect(text.match(/Nadia Haddad/g)).toHaveLength(1);
  });

  it('still reads the ordinary body around them', async () => {
    const { structured } = await extractStoredCv(await docxWithTextBoxAndFieldLink());
    expect(structured.skills.map((skill) => skill.name)).toEqual(['Python', 'Django', 'PostgreSQL']);
    expect(structured.summary).toBe(
      'Backend engineer with nine years in public-sector data platforms.'
    );
    expect(structured.experience[0]).toMatchObject({
      jobTitle: 'Lead Engineer',
      company: 'Civic Data Ltd',
      current: true,
    });
  });
});

describe('professional summary detection', () => {
  const HEADINGS = [
    'Professional Summary',
    'Profile',
    'Professional Profile',
    'Career Profile',
    'Personal Profile',
    'Executive Summary',
    'Summary',
    'Career Summary',
    'About Me',
    'Professional Overview',
    'Overview',
  ];

  it('recognises every named heading variant, in any casing', () => {
    for (const heading of HEADINGS) {
      expect(matchSectionHeading(heading.toUpperCase()), heading).toBe('summary');
      expect(matchSectionHeading(heading.toLowerCase()), heading).toBe('summary');
      expect(matchSectionHeading(`${heading}:`), heading).toBe('summary');
    }
  });

  it('is tolerant of the characters a word processor substitutes', () => {
    // A non-breaking space and full-width letters both render as the heading a
    // reader sees, and neither matches it as an ASCII string.
    expect(matchSectionHeading('Professional Summary')).toBe('summary');
    expect(matchSectionHeading('ＰＲＯＦＩＬＥ')).toBe('summary');
  });

  it('ends the summary at the next heading', () => {
    const structured = parseCvStructure(
      [
        'Amara Okafor',
        'PROFILE',
        'Registered nurse with eight years of acute medical experience.',
        'WORK EXPERIENCE',
        'Staff Nurse at Salford Royal, Sep 2017 - Feb 2021',
      ].join('\n')
    );
    expect(structured.summary).toBe('Registered nurse with eight years of acute medical experience.');
    expect(structured.summary).not.toContain('Staff Nurse');
  });

  it('invents no summary for a CV that has no summary section', () => {
    const structured = parseCvStructure(
      ['Amara Okafor', 'WORK EXPERIENCE', 'Staff Nurse at Salford Royal, Sep 2017 - Feb 2021'].join('\n')
    );
    expect(structured.summary).toBeUndefined();
    expect(structured.summarySource).toBeUndefined();
  });

  it('keeps the summary and the headline as separate things', () => {
    const structured = parseCvStructure(
      [
        'Amara Okafor',
        'Registered Nurse',
        'PROFILE',
        'Eight years of acute medical experience across NHS trusts in the North West.',
      ].join('\n')
    );
    expect(structured.headline).toBe('Registered Nurse');
    expect(structured.summary).toContain('Eight years');
    expect(structured.summary).not.toContain('Registered Nurse');
  });

  it('does not route an objective statement into work experience', () => {
    const structured = parseCvStructure(
      [
        'Amara Okafor',
        'CAREER OBJECTIVE',
        'Seeking a band 6 role in an acute medical setting from January 2026.',
        'EDUCATION',
        'BSc Adult Nursing at University of Salford, 2014 - 2017',
      ].join('\n')
    );
    expect(structured.experience).toEqual([]);
    expect(structured.summary).toContain('Seeking a band 6 role');
  });
});

describe('an institution on the line below its qualification', () => {
  const education = (lines: string[]) =>
    parseCvStructure(['Hussnain Ali', 'EDUCATION', ...lines].join('\n')).education;

  it('reads the institution off a line that also carries the grade', () => {
    // The real layout that was raising MISSING_REQUIRED_FIELD: the dated line
    // names the degree, and everything else is crammed onto the next line.
    const [entry] = education([
      'MSc Computer Science & Technology (AI) Sept 2024 – Oct 2025',
      'Ulster University, UK · Distinction — machine learning, data engineering, intelligent systems',
    ]);
    expect(entry).toMatchObject({
      degree: 'MSc Computer Science & Technology (AI)',
      university: 'Ulster University, UK',
      startDate: '2024-09',
      endDate: '2025-10',
      // The classification is a field of its own, not a sentence in the notes.
      grade: 'Distinction',
    });
    // Nothing on the line is thrown away with the split.
    expect(entry.description).toBe('machine learning, data engineering, intelligent systems');
  });

  it('reads a classification and a GPA written together as one grade', () => {
    const [entry] = education([
      'BSc Software Engineering Sept 2019 – Jul 2023',
      'Northgate Institute, Pakistan · First Class Honours, 3.82/4.0 GPA',
    ]);
    expect(entry.grade).toBe('First Class Honours, 3.82/4.0 GPA');
    expect(entry.description).toBeUndefined();
  });

  it('reads the grade wordings the profile form itself lists', () => {
    for (const [written, expected] of [
      ['Distinction', 'Distinction'],
      ['Merit', 'Merit'],
      ['Pass', 'Pass'],
      ['2:1', '2:1'],
      ['Upper Second Class Honours', 'Upper Second Class Honours'],
      ['3.8/4.0', '3.8/4.0'],
      ['85%', '85%'],
    ] as const) {
      const [entry] = education(['BSc Computing 2018 - 2021', `Leeds Beckett University · ${written}`]);
      expect(entry.grade, written).toBe(expected);
    }
  });

  it('does not read a sentence that opens with a grade word as a grade', () => {
    // "Passed" here begins a sentence about modules, not an award. A grade is a
    // claim that a classification was conferred, so only a whole fragment counts.
    const [entry] = education([
      'BSc Computing 2018 - 2021',
      'Leeds Beckett University · Passed all modules in the first year',
    ]);
    expect(entry.grade).toBeUndefined();
    expect(entry.description).toBe('Passed all modules in the first year');
  });

  it('keeps consecutive entries apart', () => {
    const entries = education([
      'MSc Computer Science Sept 2024 – Oct 2025',
      'Ulster University, UK · Distinction',
      'BSc Software Engineering Sept 2019 – Jul 2023',
      'Capital University of Science & Technology, Pakistan · First Class Honours, 3.82/4.0 GPA',
    ]);
    expect(entries.map((entry) => entry.university)).toEqual([
      'Ulster University, UK',
      'Capital University of Science & Technology, Pakistan',
    ]);
  });

  it('still takes a short institution line whole', () => {
    const [entry] = education(['BSc Adult Nursing 2014 - 2017', 'University of Salford']);
    expect(entry.university).toBe('University of Salford');
  });

  it('does not turn a prose achievement into an employer', () => {
    const structured = parseCvStructure(
      [
        'Hussnain Ali',
        'EXPERIENCE',
        'Warehouse Operative Jan 2020 - Mar 2021',
        'Picked and packed customer orders to a daily target, and trained two new starters.',
      ].join('\n')
    );
    // Ends like a sentence and has no list separator, so it stays an achievement
    // and the missing employer is still raised for the user to supply.
    expect(structured.experience[0].company).toBeUndefined();
    expect(structured.experience[0].achievements).toHaveLength(1);
  });

  it('does not split a detail line on its commas', () => {
    const [entry] = education([
      'BSc Computing 2018 - 2021',
      'Leeds Beckett University, West Yorkshire, England · Upper Second Class Honours degree awarded',
    ]);
    expect(entry.university).toBe('Leeds Beckett University, West Yorkshire, England');
  });
});

describe('project layouts', () => {
  const project = (lines: string[]) => parseCvStructure(['Sam Iyer', ...lines].join('\n')).projects;

  it('reads a single project with no dates and no links', () => {
    const projects = project(['PROJECTS', 'Bus Tracker', 'Tracked 200 vehicles in real time.']);
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ name: 'Bus Tracker', startDate: null, endDate: null });
  });

  it('reads a project heading that carries its technology stack', () => {
    const projects = project([
      'KEY PROJECTS',
      'Kinetx — Video Platform · Node.js · Docker · PostgreSQL',
      'Deployed to Azure Virtual Machines.',
    ]);
    // The stack is not part of the name, is kept as the project's skills, and
    // the whole heading survives as the excerpt.
    expect(projects[0].name).toBe('Kinetx — Video Platform');
    expect(projects[0].technologies).toEqual(['Node.js', 'Docker', 'PostgreSQL']);
    expect(projects[0].excerpt).toContain('Docker');
  });

  it('does not read a link label or a sentence as a technology', () => {
    const projects = project([
      'KEY PROJECTS',
      'Kinetx · Node.js · It handled two million events a day. · Docker',
    ]);
    expect(projects[0].technologies).toEqual(['Node.js', 'Docker']);
  });

  it('records no technologies for a heading that lists none', () => {
    expect(project(['PROJECTS', 'Bus Tracker', 'Tracked 200 vehicles.'])[0].technologies).toBeUndefined();
  });

  it('does not read a whitespace-aligned column as a technology', () => {
    // Two spaces are layout, not a list separator. Reading the right-hand column
    // as a stack would invent skills out of dates and locations.
    const projects = project(['PROJECTS', 'Bus Tracker          Leeds']);
    expect(projects[0].name).toBe('Bus Tracker');
    expect(projects[0].technologies).toBeUndefined();
  });

  it('reads several projects, keeping their achievements apart', () => {
    const projects = project([
      'PROJECTS',
      'Bus Tracker',
      'Tracked 200 vehicles in real time.',
      'Invoice Matcher',
      'Matched 40,000 invoices a day.',
    ]);
    expect(projects.map((entry) => entry.name)).toEqual(['Bus Tracker', 'Invoice Matcher']);
    expect(projects[0].achievements).toEqual(['Tracked 200 vehicles in real time.']);
    expect(projects[1].achievements).toEqual(['Matched 40,000 invoices a day.']);
  });

  it('reads projects under every heading wording CVs use', () => {
    for (const heading of ['PROJECTS', 'KEY PROJECTS', 'ACADEMIC PROJECTS', 'PROJECTS & PORTFOLIO']) {
      expect(project([heading, 'Bus Tracker']).length, heading).toBe(1);
    }
  });

  it('reads a project section wherever it sits in the document', () => {
    const after = parseCvStructure(
      [
        'Sam Iyer',
        'EDUCATION',
        'BSc Computing at Leeds, 2018 - 2021',
        'PROJECTS',
        'Bus Tracker',
        'SKILLS',
        'Python, Django',
      ].join('\n')
    );
    expect(after.projects.map((entry) => entry.name)).toEqual(['Bus Tracker']);
    expect(after.education).toHaveLength(1);
    expect(after.skills.map((entry) => entry.name)).toEqual(['Python', 'Django']);
  });

  it('still reads a dated project', () => {
    const projects = project(['PROJECTS', 'Bus Tracker, 2022', 'Tracked 200 vehicles.']);
    expect(projects[0]).toMatchObject({ name: 'Bus Tracker', startDate: '2022' });
  });

  it('keeps a project link out of the identity fields', () => {
    const structured = parseCvStructure(
      ['Sam Iyer', 'PROJECTS', 'Bus Tracker', 'Code at github.com/samiyer/bus-tracker'].join('\n')
    );
    expect(structured.identity.github).toBeUndefined();
    expect(structured.projects[0].repositoryUrl).toBe('https://github.com/samiyer/bus-tracker');
  });
});
