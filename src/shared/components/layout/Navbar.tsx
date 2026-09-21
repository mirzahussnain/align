'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu, X, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/shared/utils/cn';
import { MARKETING_NAV_LINKS, MARKETING_NAV_RESOURCES } from '@/shared/constants/navigation';
import { authClient } from '@/shared/lib/auth-client';

export default function Navbar() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isResourcesOpen, setIsResourcesOpen] = useState(false);
  // Initialised lazily so no effect needs to set state on mount; off-home
  // pages force the solid style by derivation rather than by setState.
  const [scrolledPastTop, setScrolledPastTop] = useState(false);
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAuthed = Boolean(session);

  // In-page anchors never take the active pill — `pathname` is `/` for all of
  // them, so a prefix match would light up every one of them at once.
  const isLinkActive = (href: string) =>
    !href.includes('#') && (pathname === href || pathname.startsWith(href));

  // Public pages with a dark hero share the transparent-at-top treatment;
  // inner utility pages stay solid immediately so controls remain legible.
  const hasDarkHero = pathname === '/' || pathname === '/privacy' || pathname === '/terms';
  const isScrolled = !hasDarkHero || scrolledPastTop;
  const isResourcesActive = MARKETING_NAV_RESOURCES.some(({ href }) => isLinkActive(href));

  useEffect(() => {
    if (!hasDarkHero) return;

    const handleScroll = () => {
      setScrolledPastTop(window.scrollY > 20);
    };

    const frame = window.requestAnimationFrame(handleScroll);
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [hasDarkHero]);

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
            isScrolled ? "bg-slate-900/5 border border-slate-900/10" : "bg-white/10 border border-white/15"
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
                      ? (isScrolled ? 'bg-accent-cyan/15 text-slate-900 font-bold border border-accent-cyan/35 shadow-xs' : 'bg-accent-cyan/20 text-white font-bold border border-accent-cyan/40 shadow-[0_0_15px_hsla(var(--accent-cyan),0.25)]')
                      : (isScrolled ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-900/5' : 'text-white/80 hover:text-white hover:bg-white/5')
                  )}
                >
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-accent-cyan shrink-0" />
                  )}
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <div className="relative" onMouseEnter={() => setIsResourcesOpen(true)} onMouseLeave={() => setIsResourcesOpen(false)}>
              <button
                type="button"
                aria-expanded={isResourcesOpen}
                aria-haspopup="menu"
                onClick={() => setIsResourcesOpen((open) => !open)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs transition-all duration-300',
                  isResourcesActive
                    ? (isScrolled ? 'bg-accent-cyan/15 text-slate-900 font-bold border border-accent-cyan/35 shadow-xs' : 'bg-accent-cyan/20 text-white font-bold border border-accent-cyan/40 shadow-[0_0_15px_hsla(var(--accent-cyan),0.25)]')
                    : (isScrolled ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-900/5' : 'text-white/80 hover:text-white hover:bg-white/5')
                )}
              >
                {isResourcesActive && <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-accent-cyan shrink-0" />}
                <span>Resources</span>
                <ChevronDown size={14} className={cn('transition-transform duration-200', isResourcesOpen && 'rotate-180')} aria-hidden="true" />
              </button>
              {isResourcesOpen && (
                <div className="absolute right-0 top-full w-60 pt-2">
                  <div role="menu" className="rounded-2xl border border-slate-200/70 bg-white p-1.5 shadow-xl shadow-slate-900/10">
                    {MARKETING_NAV_RESOURCES.map((item) => {
                      const isActive = isLinkActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          onClick={() => setIsResourcesOpen(false)}
                          className={cn(
                            'block rounded-xl px-3 py-2.5 transition-colors',
                            isActive
                              ? 'bg-accent-cyan/15 border border-accent-cyan/30 text-slate-900 shadow-xs'
                              : 'text-slate-700 hover:bg-accent-cyan/5 hover:text-slate-900'
                          )}
                        >
                          <span className={cn('block text-xs font-bold', isActive ? 'text-slate-950' : 'text-slate-800')}>{item.label}</span>
                          <span className={cn('mt-0.5 block text-[11px] leading-4', isActive ? 'text-slate-600' : 'text-slate-500')}>
                            {item.description}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            {sessionPending ? null : isAuthed ? (
              <Link
                href="/dashboard"
                className={cn(
                  "rounded-full pl-5 pr-1.5 py-1.5 text-xs font-semibold flex items-center gap-2.5 transition-all duration-300 shadow-xl group border",
                  isScrolled
                    ? "bg-slate-900 hover:bg-slate-800 text-white border-slate-900"
                    : "bg-white hover:bg-slate-100 text-slate-900 border-white"
                )}
              >
                <span>Dashboard</span>
                <span className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs group-hover:translate-x-0.5 transition-transform",
                  isScrolled ? "bg-white text-slate-900" : "bg-slate-900 text-white"
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
                    isScrolled ? "text-slate-600 hover:text-slate-900" : "text-white/90 hover:text-white"
                  )}
                >
                  Log In
                </Link>
                <Link
                  href="/signup"
                  className={cn(
                    "rounded-full pl-5 pr-1.5 py-1.5 text-xs font-semibold flex items-center gap-2.5 transition-all duration-300 shadow-xl group border",
                    isScrolled
                      ? "bg-slate-900 hover:bg-slate-800 text-white border-slate-900"
                      : "bg-white hover:bg-slate-100 text-slate-900 border-white"
                  )}
                >
                  <span>Get Started</span>
                  <span className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs group-hover:translate-x-0.5 transition-transform",
                    isScrolled ? "bg-white text-slate-900" : "bg-slate-900 text-white"
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
                ? "bg-slate-900/5 border-slate-900/10 text-slate-900 hover:bg-slate-900/10"
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
            ? "bg-white/95 border-slate-200/50 text-slate-900"
            : "bg-slate-900/95 border-white/10 text-white"
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
                      ? (isScrolled ? 'text-slate-950 bg-accent-cyan/15 border border-accent-cyan/30 font-semibold' : 'text-white bg-accent-cyan/20 border border-accent-cyan/35 font-semibold')
                      : (isScrolled ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-900/5' : 'text-white/70 hover:text-white hover:bg-white/5')
                  )}
                >
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan" />
                  )}
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <div className={cn('mt-2 border-t pt-3', isScrolled ? 'border-slate-900/5' : 'border-white/10')}>
              <p className={cn('px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider', isScrolled ? 'text-slate-500' : 'text-white/60')}>Resources</p>
              {MARKETING_NAV_RESOURCES.map((item) => {
                const isActive = isLinkActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                      isActive
                        ? (isScrolled ? 'text-slate-950 bg-accent-cyan/15 border border-accent-cyan/30 font-semibold' : 'text-white bg-accent-cyan/20 border border-accent-cyan/35 font-semibold')
                        : (isScrolled ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-900/5' : 'text-white/70 hover:text-white hover:bg-white/5')
                    )}
                  >
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan" />}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className={cn(
              "pt-4 mt-2 border-t flex flex-col gap-2",
              isScrolled ? "border-slate-900/5" : "border-white/5"
            )}>
              {isAuthed ? (
                <Link
                  href="/dashboard"
                  onClick={() => setIsMobileOpen(false)}
                  className={cn(
                    "rounded-full py-2.5 text-center text-sm font-bold flex items-center justify-center gap-2",
                    isScrolled ? "bg-slate-900 text-white" : "bg-white text-slate-900"
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
                      isScrolled ? "text-slate-600 hover:text-slate-900" : "text-white/70 hover:text-white"
                    )}
                  >
                    Log In
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setIsMobileOpen(false)}
                    className={cn(
                      "rounded-full py-2.5 text-center text-sm font-bold flex items-center justify-center gap-2",
                      isScrolled ? "bg-slate-900 text-white" : "bg-white text-slate-900"
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
