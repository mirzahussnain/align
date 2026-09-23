import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import AdminNavigation from './AdminNavigation';

interface AdminShellProps {
  children: ReactNode;
  user: { name: string; email: string };
}

export default function AdminShell({ children, user }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <aside className="border-b border-slate-800 bg-slate-950 px-4 py-4 text-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-64 lg:flex-col lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="flex items-center justify-between gap-4 lg:block">
          <Link href="/admin" className="flex items-center gap-3 rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/svgs/logo.svg" alt="" className="h-8 w-8" />
            <div>
              <p className="text-sm font-black tracking-tight">Align</p>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Internal admin
              </p>
            </div>
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-semibold text-slate-300 lg:mt-5">
            <ShieldCheck className="h-3.5 w-3.5 text-accent-cyan" />
            Restricted
          </span>
        </div>

        <div className="mt-4 lg:mt-8 lg:flex-1">
          <AdminNavigation />
        </div>

        <div className="mt-4 hidden border-t border-white/10 pt-5 lg:block">
          <p className="truncate text-xs font-semibold text-white">{user.name}</p>
          <p className="mt-1 truncate text-[11px] text-slate-400">{user.email}</p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to workspace
          </Link>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="flex min-h-16 items-center justify-between border-b border-border-subtle bg-bg-secondary px-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-semibold text-text-primary">Admin workspace</p>
            <p className="text-xs text-text-tertiary">Read-only operational view</p>
          </div>
          <Link
            href="/dashboard"
            aria-label="Open user workspace"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-bg-secondary px-3 text-xs font-semibold text-text-secondary transition-colors hover:border-border-default hover:text-text-primary lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            Workspace
          </Link>
        </header>
        <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
