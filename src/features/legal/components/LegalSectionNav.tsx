'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/shared/utils/cn';

interface LegalSectionLink {
  id: string;
  title: string;
}

interface LegalSectionNavProps {
  sections: readonly LegalSectionLink[];
  ariaLabel: string;
  className?: string;
  linkClassName?: string;
}

export default function LegalSectionNav({
  sections,
  ariaLabel,
  className,
  linkClassName,
}: LegalSectionNavProps) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');

  useEffect(() => {
    const elements = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element !== null);

    if (elements.length === 0 || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        const nextId = visible[0]?.target.id;
        if (nextId) setActiveId(nextId);
      },
      { rootMargin: '-96px 0px -68% 0px', threshold: 0 }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className={cn('border-l border-slate-200', className)} aria-label={ariaLabel}>
      <ol className="space-y-1">
        {sections.map((section) => {
          const isActive = activeId === section.id;

          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={isActive ? 'location' : undefined}
                onClick={() => setActiveId(section.id)}
                className={cn(
                  '-ml-px block border-l-2 py-2 pl-5 text-sm leading-5 transition-[color,border-color,background-color] duration-200',
                  isActive
                    ? 'border-cyan-500 font-semibold text-slate-950'
                    : 'border-transparent text-slate-500 hover:border-cyan-400 hover:bg-cyan-50/70 hover:text-slate-950',
                  linkClassName
                )}
              >
                {section.title}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
