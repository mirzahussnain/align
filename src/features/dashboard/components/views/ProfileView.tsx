'use client';

import { useState } from 'react';
import { UserRound, Briefcase, FolderGit2, GraduationCap, Wrench, type LucideIcon } from 'lucide-react';
import DashboardTopBar from '../DashboardTopBar';
import AvatarUploader from '../profile/AvatarUploader';
import PersonalInfoForm from '../profile/PersonalInfoForm';
import ExperienceForm from '../profile/ExperienceForm';
import ProjectsForm from '../profile/ProjectsForm';
import EducationForm from '../profile/EducationForm';
import SkillsForm from '../profile/SkillsForm';
import { cn } from '@/shared/utils/cn';
import type { ProfileData } from '@/features/dashboard/data/load-profile';

type Section = 'personal' | 'experience' | 'projects' | 'education' | 'skills';

const NAV: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'personal', label: 'Personal Info', icon: UserRound },
  { id: 'experience', label: 'Experience', icon: Briefcase },
  { id: 'projects', label: 'Projects', icon: FolderGit2 },
  { id: 'education', label: 'Education', icon: GraduationCap },
  { id: 'skills', label: 'Skills', icon: Wrench },
];

export default function ProfileView({
  initial,
  name,
  email,
  image,
}: {
  initial: ProfileData;
  name: string;
  email: string;
  image?: string | null;
}) {
  const [section, setSection] = useState<Section>('personal');

  return (
    <>
      <DashboardTopBar
        title="Profile"
        subtitle={`${initial.label} — the source Align rebuilds your CVs from`}
        showNewAnalysis={false}
      />

      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
          {/* Left sub-nav */}
          <aside>
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <AvatarUploader name={name} image={image} />
              <p className="mt-2 truncate px-1 text-[11px] text-neutral-400">{email}</p>

              <nav className="mt-3 flex flex-col gap-1">
                {NAV.map(({ id, label, icon: Icon }) => {
                  const isActive = section === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSection(id)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-accent-purple/10 text-accent-purple'
                          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                      {label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Form area */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8">
            {section === 'personal' && (
              <PersonalInfoForm initial={initial.personal} profileId={initial.profileId} />
            )}
            {section === 'experience' && (
              <ExperienceForm initial={initial.experience} profileId={initial.profileId} />
            )}
            {section === 'projects' && (
              <ProjectsForm initial={initial.projects} profileId={initial.profileId} />
            )}
            {section === 'education' && (
              <EducationForm initial={initial.education} profileId={initial.profileId} />
            )}
            {section === 'skills' && (
              <SkillsForm initial={initial.skills} profileId={initial.profileId} />
            )}
          </section>
        </div>
      </div>
    </>
  );
}
