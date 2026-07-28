import { createHash } from 'node:crypto';
import { prisma } from '../src/shared/lib/prisma.ts';

const userId = 'dev-phase5-user';
const profileId = 'dev-phase5-profile';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const now = new Date();

async function snapshot(input: { id: string; title: string; employer: string; availability: 'FULL' | 'PARTIAL' | 'EXTERNAL_ONLY'; providerDescription?: string; userDescription?: string; references: Array<{ provider: 'ADZUNA' | 'REED' | 'JOOBLE'; id: string; url: string }> }) {
  const selected = input.userDescription ? { source: 'USER_PASTED' as const, text: input.userDescription } : input.providerDescription ? { source: input.availability === 'FULL' ? 'PROVIDER_FULL' as const : 'PROVIDER_PARTIAL' as const, text: input.providerDescription } : null;
  return prisma.jobSnapshot.upsert({
    where: { canonicalJobId: input.id },
    create: { canonicalJobId: input.id, title: input.title, normalisedTitle: input.title.toLowerCase(), employerName: input.employer, normalisedEmployerName: input.employer.toLowerCase(), locationText: 'Leeds, UK', country: 'UK', workStyle: 'HYBRID', providerDescription: input.providerDescription, userSuppliedDescription: input.userDescription, descriptionAvailability: input.availability, selectedDescriptionSource: selected?.source, selectedDescriptionHash: selected ? hash(selected.text) : null, dedupeFingerprint: input.id, vacancySponsorshipSignal: { fixture: true, note: 'Development fixture; not sponsor-register evidence.' }, fetchedAt: now, firstSeenAt: now, lastSeenAt: now, providerReferences: { create: input.references.map((reference) => ({ provider: reference.provider, providerJobId: reference.id, providerUrl: reference.url, firstSeenAt: now, lastSeenAt: now })) } },
    update: { title: input.title, providerDescription: input.providerDescription, userSuppliedDescription: input.userDescription, descriptionAvailability: input.availability, selectedDescriptionSource: selected?.source, selectedDescriptionHash: selected ? hash(selected.text) : null, lastSeenAt: now, fetchedAt: now },
  });
}

await prisma.user.upsert({ where: { id: userId }, update: { name: 'Phase 5 Development User' }, create: { id: userId, name: 'Phase 5 Development User', email: 'phase5-dev@example.test', emailVerified: true } });
await prisma.profileIdentity.upsert({ where: { userId }, update: { fullName: 'Phase 5 Development User' }, create: { id: 'dev-phase5-identity', userId, fullName: 'Phase 5 Development User', email: 'phase5-dev@example.test', city: 'Leeds', country: 'UK' } });
await prisma.profile.upsert({ where: { userId_label: { userId, label: 'Software Engineering' } }, update: { id: profileId, isDefault: true }, create: { id: profileId, userId, label: 'Software Engineering', isDefault: true, targetRoleTitle: 'Software Engineer', targetIndustry: 'technology' } });

const full = await snapshot({ id: 'fixture-platform-engineer', title: 'Platform Engineer', employer: 'Fixture Systems Ltd', availability: 'FULL', providerDescription: 'Build and operate resilient platform services. This fixture description is deliberately labelled as development evidence.', references: [{ provider: 'ADZUNA', id: 'fixture-platform-adzuna', url: 'https://example.test/jobs/platform-adzuna' }, { provider: 'REED', id: 'fixture-platform-reed', url: 'https://example.test/jobs/platform-reed' }] });
const partial = await snapshot({ id: 'fixture-support-engineer', title: 'Support Engineer', employer: 'Fixture Support Ltd', availability: 'PARTIAL', providerDescription: 'Support customer systems and triage incidents…', references: [{ provider: 'JOOBLE', id: 'fixture-support-jooble', url: 'https://example.test/jobs/support' }] });
await snapshot({ id: 'fixture-product-engineer', title: 'Product Engineer', employer: 'Fixture Product Ltd', availability: 'EXTERNAL_ONLY', userDescription: 'User-pasted development fixture description. Build accessible product features, collaborate with designers, and maintain reliable tests.', references: [{ provider: 'REED', id: 'fixture-product-reed', url: 'https://example.test/jobs/product' }] });

await prisma.savedJob.upsert({ where: { userId_jobSnapshotId: { userId, jobSnapshotId: full.id } }, update: { profileId }, create: { userId, profileId, jobSnapshotId: full.id } });
await prisma.jobMatchRequest.deleteMany({ where: { userId } });
await prisma.jobMatchRequest.create({ data: { userId, profileId, jobSnapshotId: partial.id, selectedDescriptionSource: 'PROVIDER_PARTIAL', selectedDescriptionHash: hash(partial.providerDescription!), partialDescriptionAccepted: true, status: 'PREPARED', expiresAt: new Date(Date.now() + 30 * 60_000) } });
console.log('Phase 5 development seed complete: user, identity, career track, 3 JobSnapshots, deduplicated provider references, one SavedJob, and one prepared match request.');
await prisma.$disconnect();