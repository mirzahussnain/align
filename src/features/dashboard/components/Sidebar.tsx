'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileSearch,
  FileStack,
  UserRound,
  Briefcase,
  Stamp,
  CreditCard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { authClient } from '@/shared/lib/auth-client';
import { useDashboardStore, type DashboardTab } from '@/shared/stores/dashboard-store';
import ProfileSwitcher from './profile/ProfileSwitcher';
import type { ProfileSummary } from '@/features/dashboard/data/load-profile';

interface TabItem {
  tab: DashboardTab;
  label: string;
  icon: LucideIcon;
}

interface LinkItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const TAB_GROUPS: { label: string; items: TabItem[] }[] = [
  {
    label: 'Workspace',
    items: [
      { tab: 'overview', label: 'Overview', icon: LayoutDashboard },
      { tab: 'analyze', label: 'Analyze CV', icon: FileSearch },
      { tab: 'profile', label: 'Profile', icon: UserRound },
    ],
  },
  {
    label: 'Library',
    items: [
      { tab: 'analyses', label: 'Analyses', icon: FileSearch },
      { tab: 'cvs', label: 'Generated CVs', icon: FileStack },
      { tab: 'billing', label: 'Plan & billing', icon: CreditCard },
    ],
  },
];

// These leave the dashboard on purpose (public tools), so they stay real links.
const EXTERNAL_LINKS: LinkItem[] = [
  { href: '/jobs', label: 'Job search', icon: Briefcase },
  { href: '/immigration', label: 'Sponsorship', icon: Stamp },
];

interface SidebarProps {
  user: { name: string; email: string; image?: string | null };
  tier: string;
  profiles: ProfileSummary[];
  activeProfileId: string;
  maxProfiles: number;
}

export default function Sidebar({
  user,
  tier,
  profiles,
  activeProfileId,
  maxProfiles,
}: SidebarProps) {
  const collapsed = useDashboardStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useDashboardStore((s) => s.toggleSidebar);
  const mobileNavOpen = useDashboardStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useDashboardStore((s) => s.setMobileNavOpen);

  return (
    <>
      {/* Desktop rail. Collapsing swaps labels for icons only; the underlying
          markup is shared with the mobile slide-over via SidebarContent. */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/60 p-3 transition-[width] duration-200 md:flex',
          collapsed ? 'w-[4.5rem]' : 'w-64'
        )}
      >
        <SidebarContent
          user={user}
          tier={tier}
          collapsed={collapsed}
          onToggle={toggleSidebar}
          profiles={profiles}
          activeProfileId={activeProfileId}
          maxProfiles={maxProfiles}
        />
      </aside>

      {/* Mobile slide-over, opened from the top bar's hamburger. */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-neutral-200 bg-white p-3 shadow-xl">
            <SidebarContent
              user={user}
              tier={tier}
              collapsed={false}
              onToggle={() => setMobileNavOpen(false)}
              toggleIcon={X}
              toggleLabel="Close navigation"
              profiles={profiles}
              activeProfileId={activeProfileId}
              maxProfiles={maxProfiles}
            />
          </aside>
        </div>
      )}
    </>
  );
}

interface SidebarContentProps {
  user: { name: string; email: string; image?: string | null };
  tier: string;
  collapsed: boolean;
  onToggle: () => void;
  toggleIcon?: LucideIcon;
  toggleLabel?: string;
  profiles: ProfileSummary[];
  activeProfileId: string;
  maxProfiles: number;
}

function SidebarContent({
  user,
  tier,
  collapsed,
  onToggle,
  toggleIcon,
  toggleLabel,
  profiles,
  activeProfileId,
  maxProfiles,
}: SidebarContentProps) {
  const router = useRouter();
  const activeTab = useDashboardStore((s) => s.tab);
  const setTab = useDashboardStore((s) => s.setTab);

  const ToggleIcon = toggleIcon ?? (collapsed ? PanelLeftOpen : PanelLeftClose);

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  // Collapsed items get their label as a native tooltip, since the text is gone.
  const itemClasses = (isActive: boolean) =>
    cn(
      'relative flex items-center rounded-lg py-2 text-sm font-medium transition-colors',
      collapsed ? 'justify-center px-0' : 'gap-3 px-3',
      isActive
        ? 'bg-accent-purple/10 font-semibold text-accent-purple before:absolute before:-left-3 before:top-1/2 before:h-4 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-accent-purple'
        : 'text-neutral-600 hover:bg-white hover:text-neutral-900'
    );

  return (
    <>
      <div className={cn('flex items-center gap-2', collapsed ? 'flex-col' : 'justify-between')}>
        <Link
          href="/"
          className={cn('flex items-center gap-2.5 py-3', collapsed ? 'px-0' : 'px-2')}
          title={collapsed ? 'Align' : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/svgs/logo.svg" alt="" className="h-7 w-7 shrink-0" />
          {!collapsed && (
            <span className="text-sm font-black tracking-tight text-neutral-900">Align</span>
          )}
        </Link>

        <button
          type="button"
          onClick={onToggle}
          aria-label={toggleLabel ?? (collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
          title={toggleLabel ?? (collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
          className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <ToggleIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Collapsed rail has no room for a labelled switcher; expand to change track. */}
      {!collapsed && profiles.length > 0 && (
        <div className="mt-1">
          <ProfileSwitcher
            profiles={profiles}
            activeProfileId={activeProfileId}
            maxProfiles={maxProfiles}
          />
        </div>
      )}

      <nav className="mt-4 flex flex-1 flex-col gap-6 overflow-y-auto">
        {TAB_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            {collapsed ? (
              <div className="mx-auto mb-1 h-px w-6 bg-neutral-200" aria-hidden />
            ) : (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400">
                {group.label}
              </p>
            )}
            {group.items.map(({ tab, label, icon: Icon }) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTab(tab)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={collapsed ? label : undefined}
                  title={collapsed ? label : undefined}
                  className={itemClasses(isActive)}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                  {!collapsed && label}
                </button>
              );
            })}
          </div>
        ))}

        <div className="flex flex-col gap-1">
          {collapsed ? (
            <div className="mx-auto mb-1 h-px w-6 bg-neutral-200" aria-hidden />
          ) : (
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400">
              Tools
            </p>
          )}
          {EXTERNAL_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              className={itemClasses(false)}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              {!collapsed && label}
            </Link>
          ))}
        </div>
      </nav>

      <div
        className={cn(
          'mt-4 flex items-center border-t border-neutral-200 pt-4',
          collapsed ? 'flex-col gap-2' : 'gap-3'
        )}
      >
        {/*
          Same avatar the profile tab uploads (User.image, served from the
          public avatars bucket). The gradient initial is the fallback for users
          who have not uploaded one — previously it was the only thing rendered,
          so an uploaded picture never appeared here.
        */}
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
            title={collapsed ? `${user.name} — ${tier} plan` : undefined}
          />
        ) : (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-purple to-accent-cyan text-xs font-bold text-white"
            title={collapsed ? `${user.name} — ${tier} plan` : undefined}
          >
            {user.name.charAt(0).toUpperCase()}
          </span>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-neutral-900">{user.name}</p>
            <p className="truncate text-[10px] capitalize text-neutral-400">{tier} plan</p>
          </div>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Sign out"
          title="Sign out"
          className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
