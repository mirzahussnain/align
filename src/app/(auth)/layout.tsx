import Link from 'next/link';
import AuthShowcasePanel from '@/features/auth/components/AuthShowcasePanel';

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative min-h-screen bg-[hsl(222_47%_5%)] p-3 lg:p-4">
      {/* Ambient bloom behind the form column */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-1/4 h-[500px] w-[500px] rounded-full bg-accent-purple/20 blur-[130px]"
      />

      <div className="relative grid min-h-[calc(100vh-1.5rem)] grid-cols-1 gap-4 lg:min-h-[calc(100vh-2rem)] lg:grid-cols-2">
        <div className="flex flex-col px-6 py-8 sm:px-12">
          <Link href="/" className="inline-flex w-fit items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/svgs/logo.svg" alt="" className="h-7 w-7" />
            <span className="text-sm font-black tracking-tight text-white">Align</span>
          </Link>

          <div className="flex flex-1 items-center justify-center py-12">{children}</div>

          <p className="text-center text-[11px] text-white/25">
            Align — UK tech career intelligence
          </p>
        </div>

        <AuthShowcasePanel />
      </div>
    </div>
  );
}
