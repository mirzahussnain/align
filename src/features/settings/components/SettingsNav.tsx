'use client';

import Link from 'next/link';
import { CreditCard, LockKeyhole, UserRound } from 'lucide-react';
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
] as const;

export default function SettingsNav() {
  const pathname = usePathname();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <nav
        aria-label="Settings"
        className="flex max-w-full gap-1 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin] md:flex-col md:overflow-visible md:pb-0"
      >
        {SETTINGS_LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:w-full md:gap-3',
                active
                  ? 'bg-slate-900/5 font-semibold text-slate-900 md:bg-slate-900 md:text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              <Icon aria-hidden className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
