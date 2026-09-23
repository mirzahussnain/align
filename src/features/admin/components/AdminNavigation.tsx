'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, LayoutDashboard, Users } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

const items = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/ai-usage', label: 'AI usage', icon: Activity },
] as const;

export default function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin navigation" className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === '/admin' ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors',
              active
                ? 'bg-white/10 text-white'
                : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
            )}
          >
            <Icon className={cn('h-4 w-4', active ? 'text-accent-cyan' : 'text-slate-400')} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
