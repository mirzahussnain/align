'use client';

import Link from 'next/link';
import { CreditCard, Database, LockKeyhole, UserRound } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/utils/cn';

const SETTINGS_LINKS = [
  { href: '/dashboard/settings/account', label: 'Account', icon: UserRound },
  {
    href: '/dashboard/settings/billing',
    label: 'Billing & Subscription',
    icon: CreditCard,
  },
  { href: '/dashboard/settings/security', label: 'Security', icon: LockKeyhole },
  { href: '/dashboard/settings/privacy', label: 'Data & Privacy', icon: Database },
] as const;

export default function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings"
      className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0"
    >
      {SETTINGS_LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <Icon aria-hidden className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
