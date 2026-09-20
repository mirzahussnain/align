import DashboardTopBar from '@/features/dashboard/components/DashboardTopBar';
import SettingsNav from './SettingsNav';

interface SettingsShellProps {
  children: React.ReactNode;
}

export default function SettingsShell({ children }: SettingsShellProps) {
  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-neutral-50 text-neutral-900">
      <DashboardTopBar title="Settings" showNewAnalysis={false} />
      <div className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden px-4 py-4 sm:gap-6 sm:px-6 sm:py-6 md:grid-cols-[15rem_minmax(0,1fr)] md:grid-rows-1 lg:px-8">
        <aside className="min-w-0 shrink-0">
          <SettingsNav />
        </aside>
        <main className="min-h-0 min-w-0 overflow-y-auto overscroll-y-contain pb-4 [scrollbar-width:thin] sm:pb-6">
          {children}
        </main>
      </div>
    </div>
  );
}
