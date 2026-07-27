'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UserRound, Briefcase, FolderGit2, GraduationCap, Wrench, BookOpen, BadgeCheck, Languages, HeartHandshake, FileText, FileUp, PencilLine, type LucideIcon } from 'lucide-react';
import DashboardTopBar from '../DashboardTopBar';
import AvatarUploader from '../profile/AvatarUploader';
import PersonalInfoForm from '../profile/PersonalInfoForm';
import ExperienceForm from '../profile/ExperienceForm';
import ProjectsForm from '../profile/ProjectsForm';
import EducationForm from '../profile/EducationForm';
import SkillsForm from '../profile/SkillsForm';
import StructuredEvidenceManager from '../profile/StructuredEvidenceManager';
import ReusableEvidenceUsage from '../profile/ReusableEvidenceUsage';
import { cn } from '@/shared/utils/cn';
import type { ProfileData } from '@/features/dashboard/data/load-profile';

type Section = 'personal' | 'experience' | 'projects' | 'education' | 'skills' | 'certifications' | 'training' | 'licences' | 'registrations' | 'languages' | 'volunteering' | 'other';
const NAV: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'personal', label: 'Personal Info', icon: UserRound }, { id: 'experience', label: 'Experience', icon: Briefcase }, { id: 'projects', label: 'Projects', icon: FolderGit2 }, { id: 'education', label: 'Education', icon: GraduationCap }, { id: 'skills', label: 'Skills', icon: Wrench }, { id: 'certifications', label: 'Certifications', icon: BadgeCheck }, { id: 'training', label: 'Training', icon: BookOpen }, { id: 'licences', label: 'Licences', icon: BadgeCheck }, { id: 'registrations', label: 'Registrations', icon: FileText }, { id: 'languages', label: 'Languages', icon: Languages }, { id: 'volunteering', label: 'Volunteering', icon: HeartHandshake }, { id: 'other', label: 'Reusable evidence', icon: FileText },
];

export default function ProfileView({ initial, name, email, image }: { initial: ProfileData; name: string; email: string; image?: string | null }) {
  const [section, setSection] = useState<Section>('personal');
  return <><DashboardTopBar title="Profile" subtitle={`${initial.label} — the source Align rebuilds your CVs from`} showNewAnalysis={false} />
    <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8"><div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[260px_1fr]"><aside className="min-w-0"><div className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4"><AvatarUploader name={name} image={image} /><p className="mt-2 truncate px-1 text-[11px] text-neutral-400">{email}</p><nav aria-label="Profile sections" className="mt-3 flex max-w-full gap-1 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin] lg:flex-col lg:overflow-visible lg:pb-0">{NAV.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setSection(id)} className={cn('flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:w-full lg:gap-3', section === id ? 'bg-accent-purple/10 text-accent-purple' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900')}><Icon className="h-4 w-4 shrink-0" strokeWidth={2} />{label}</button>)}</nav></div></aside>
      <section className="min-w-0">
      {/*
        The two ways to fill a profile that are not this form. Kept beside the
        editor rather than buried in onboarding, because importing a newer CV and
        finishing a profile by hand are things people do repeatedly — not once,
        on their first day.
      */}
      <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-neutral-500">
          Fill this profile in faster by importing a CV, or work through it step by step.
        </p>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Link
            href="/dashboard/import-cv"
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-accent-purple px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-accent-purple/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/40"
          >
            <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
            Import a CV
          </Link>
          <Link
            href={`/onboarding/manual?profile=${initial.profileId}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/30"
          >
            <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
            Complete manually
          </Link>
        </div>
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6 lg:p-8">
        {section === 'personal' && <PersonalInfoForm initial={initial.personal} profileId={initial.profileId} />}
        {section === 'experience' && <ExperienceForm key={`${initial.profileId}:experience`} initial={initial.experience} profileId={initial.profileId} />}
        {section === 'projects' && <ProjectsForm key={`${initial.profileId}:projects`} initial={initial.projects} skills={initial.skills} profileId={initial.profileId} />}
        {section === 'education' && <EducationForm key={`${initial.profileId}:education`} initial={initial.education} profileId={initial.profileId} />}
        {section === 'skills' && <SkillsForm key={`${initial.profileId}:skills`} initial={initial.skills} profileId={initial.profileId} />}
        {section === 'certifications' && <StructuredEvidenceManager key={`${initial.profileId}:certification`} kind="certification" initial={initial.certifications.map((item) => ({ id: item.id, officialName: item.name, issuingBody: item.issuer, credentialNumber: item.credentialNumber ?? '', issueDate: item.issueDate || item.year, expiryDate: item.expiryDate ?? '', status: item.status ?? '', verificationUrl: item.verificationUrl ?? '', verificationStatus: item.verificationStatus || 'user_confirmed_unverified' }))} profileId={initial.profileId} />}
        {section === 'training' && <StructuredEvidenceManager key={`${initial.profileId}:training`} kind="training" initial={initial.trainings} profileId={initial.profileId} />}
        {section === 'licences' && <StructuredEvidenceManager key={`${initial.profileId}:licence`} kind="licence" initial={initial.licences} profileId={initial.profileId} />}
        {section === 'registrations' && <StructuredEvidenceManager key={`${initial.profileId}:registration`} kind="registration" initial={initial.professionalRegistrations.map((item) => ({ ...item, credentialNumber: item.registrationNumber }))} profileId={initial.profileId} />}
        {section === 'languages' && <StructuredEvidenceManager key={`${initial.profileId}:language`} kind="language" initial={initial.languages} profileId={initial.profileId} />}
        {section === 'volunteering' && <StructuredEvidenceManager key={`${initial.profileId}:volunteering`} kind="volunteering" initial={initial.volunteering} profileId={initial.profileId} />}
        {section === 'other' && <><StructuredEvidenceManager key={`${initial.profileId}:other`} kind="other" initial={initial.otherEvidence} profileId={initial.profileId} /><ReusableEvidenceUsage /></>}
      </div></section></div></div></>;
}
