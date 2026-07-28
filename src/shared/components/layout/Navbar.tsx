'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileSearch, Menu, X, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/shared/utils/cn';
import { MARKETING_NAV_LINKS } from '@/shared/constants/navigation';
import { authClient } from '@/shared/lib/auth-client';

export default function Navbar() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  // Initialised lazily so no effect needs to set state on mount; off-home
  // pages force the solid style by derivation rather than by setState.
  const [scrolledPastTop, setScrolledPastTop] = useState(false);
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAuthed = Boolean(session);

  // In-page anchors never take the active pill — `pathname` is `/` for all of
  // them, so a prefix match would light up every one of them at once.
  const isLinkActive = (href: string) =>
    !href.includes('#') && (pathname === href || pathname.startsWith(href));

  // The navbar is always solid off the home page; only the home page needs to
  // track scroll position for the transparent-at-top treatment.
  const isScrolled = pathname !== '/' || scrolledPastTop;

  useEffect(() => {
    setScrolledPastTop(window.scrollY > 20);
    if (pathname !== '/') return;

    const handleScroll = () => {
      setScrolledPastTop(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [pathname]);

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        isScrolled
          ? 'bg-white/80 backdrop-blur-lg border-b border-neutral-200/40 py-3 shadow-sm'
          : 'bg-transparent py-4'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-10 h-10 flex items-center justify-center">
              <img 
                src="/assets/svgs/logo.svg" 
                alt="Align" 
                className="w-8 h-8 object-contain select-none transition-all duration-500 ease-out group-hover:scale-110 group-hover:rotate-12 drop-shadow-md group-hover:drop-shadow-[0_0_12px_rgba(var(--accent-cyan),0.6)]" 
              />
            </div>
            <div className="flex flex-col">
              <span className={cn(
                "text-sm font-black tracking-tight leading-tight transition-colors duration-300",
                isScrolled ? "text-neutral-900" : "text-white"
              )}>Align</span>
              <span className={cn(
                "text-[9px] font-semibold leading-tight tracking-wider uppercase transition-colors duration-300",
                isScrolled ? "text-neutral-500" : "text-white/70"
              )}>UK Tech Intelligence</span>
            </div>
          </Link>

          {/* Desktop Capsule Nav (QClay style) */}
          <div className={cn(
            "hidden md:flex items-center backdrop-blur-md rounded-full p-1 select-none transition-all duration-300",
            isScrolled ? "bg-neutral-950/5 border border-neutral-950/10" : "bg-white/10 border border-white/15"
          )}>
            {MARKETING_NAV_LINKS.map((item) => {
              const isActive = isLinkActive(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs transition-all duration-300',
                    isActive
                      ? (isScrolled ? 'bg-neutral-950 text-white font-bold shadow-sm' : 'bg-white text-neutral-950 font-bold shadow-md')
                      : (isScrolled ? 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-950/5' : 'text-white/80 hover:text-white hover:bg-white/5')
                  )}
                >
                  {isActive && (
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full animate-pulse",
                      isScrolled ? "bg-white" : "bg-neutral-950"
                    )} />
                  )}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            {sessionPending ? null : isAuthed ? (
              <Link
                href="/dashboard"
                className={cn(
                  "rounded-full pl-5 pr-1.5 py-1.5 text-xs font-semibold flex items-center gap-2.5 transition-all duration-300 shadow-xl group border",
                  isScrolled
                    ? "bg-neutral-950 hover:bg-neutral-900 text-white border-neutral-950"
                    : "bg-white hover:bg-neutral-100 text-neutral-950 border-white"
                )}
              >
                <span>Dashboard</span>
                <span className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs group-hover:translate-x-0.5 transition-transform",
                  isScrolled ? "bg-white text-neutral-950" : "bg-neutral-950 text-white"
                )}>
                  →
                </span>
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className={cn(
                    "text-xs font-semibold transition-all duration-300 py-2 px-3",
                    isScrolled ? "text-neutral-600 hover:text-neutral-900" : "text-white/90 hover:text-white"
                  )}
                >
                  Log In
                </Link>
                <Link
                  href="/signup"
                  className={cn(
                    "rounded-full pl-5 pr-1.5 py-1.5 text-xs font-semibold flex items-center gap-2.5 transition-all duration-300 shadow-xl group border",
                    isScrolled
                      ? "bg-neutral-950 hover:bg-neutral-900 text-white border-neutral-950"
                      : "bg-white hover:bg-neutral-100 text-neutral-950 border-white"
                  )}
                >
                  <span>Get Started</span>
                  <span className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs group-hover:translate-x-0.5 transition-transform",
                    isScrolled ? "bg-white text-neutral-950" : "bg-neutral-950 text-white"
                  )}>
                    →
                  </span>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className={cn(
              "md:hidden p-2 rounded-full backdrop-blur-md border transition-all duration-300",
              isScrolled
                ? "bg-neutral-950/5 border-neutral-950/10 text-neutral-900 hover:bg-neutral-950/10"
                : "bg-white/10 border-white/15 text-white hover:bg-white/20"
            )}
            aria-label="Toggle menu"
          >
            {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {isMobileOpen && (
        <div className={cn(
          "md:hidden mx-4 mt-2 rounded-2xl backdrop-blur-lg overflow-hidden shadow-2xl border transition-all duration-300",
          isScrolled
            ? "bg-white/95 border-neutral-200/50 text-neutral-900"
            : "bg-neutral-950/95 border-white/10 text-white"
        )}>
          <div className="px-4 py-4 space-y-1">
            {MARKETING_NAV_LINKS.map((item) => {
              const isActive = isLinkActive(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                    isActive
                      ? (isScrolled ? 'text-accent-purple bg-neutral-950/5' : 'text-accent-cyan bg-white/5')
                      : (isScrolled ? 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-950/5' : 'text-white/70 hover:text-white hover:bg-white/5')
                  )}
                >
                  {isActive && (
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      isScrolled ? "bg-accent-purple" : "bg-accent-cyan"
                    )} />
                  )}
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <div className={cn(
              "pt-4 mt-2 border-t flex flex-col gap-2",
              isScrolled ? "border-neutral-950/5" : "border-white/5"
            )}>
              {isAuthed ? (
                <Link
                  href="/dashboard"
                  onClick={() => setIsMobileOpen(false)}
                  className={cn(
                    "rounded-full py-2.5 text-center text-sm font-bold flex items-center justify-center gap-2",
                    isScrolled ? "bg-neutral-950 text-white" : "bg-white text-neutral-950"
                  )}
                >
                  Dashboard <ArrowRight size={16} />
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setIsMobileOpen(false)}
                    className={cn(
                      "text-center py-2 text-sm",
                      isScrolled ? "text-neutral-600 hover:text-neutral-900" : "text-white/70 hover:text-white"
                    )}
                  >
                    Log In
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setIsMobileOpen(false)}
                    className={cn(
                      "rounded-full py-2.5 text-center text-sm font-bold flex items-center justify-center gap-2",
                      isScrolled ? "bg-neutral-950 text-white" : "bg-white text-neutral-950"
                    )}
                  >
                    Get Started <ArrowRight size={16} />
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
