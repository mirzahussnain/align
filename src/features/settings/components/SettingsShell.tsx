import Link from 'next/link';
import SettingsNav from './SettingsNav';

interface SettingsShellProps {
  user: { name: string; email: string; image?: string | null };
  children: React.ReactNode;
}

export default function SettingsShell({ user, children }: SettingsShellProps) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <Link href="/dashboard" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
              Align workspace
            </Link>
            <h1 className="mt-1 text-xl font-bold tracking-tight">Settings</h1>
          </div>
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-neutral-500">{user.email}</p>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 md:grid-cols-[15rem_minmax(0,1fr)] md:py-10">
        <SettingsNav />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
