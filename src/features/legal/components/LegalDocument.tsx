import type { ReactNode } from 'react';
import Navbar from '@/shared/components/layout/Navbar';
import styles from './LegalDocument.module.css';

export interface LegalSection {
  id: string;
  title: string;
  content: ReactNode;
}

interface LegalDocumentProps {
  title: string;
  summary: string;
  lastUpdated: string;
  sections: readonly LegalSection[];
}

export default function LegalDocument({ title, summary, lastUpdated, sections }: LegalDocumentProps) {
  return (
    <main className={`min-h-screen text-slate-900 ${styles.paper}`}>
      <Navbar />
      <header className={styles.hero}>
        <div className="relative z-10 mx-auto flex min-h-[27rem] max-w-7xl items-center justify-center px-4 pb-14 pt-32 text-center sm:px-6 md:pt-36 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">{title}</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">{summary}</p>
            <p className="mt-5 text-xs font-semibold tracking-[0.08em] text-cyan-200/80">Last updated {lastUpdated}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[14rem_minmax(0,46rem)] lg:justify-center lg:gap-20 lg:px-8 lg:py-24">
        <aside className="hidden lg:sticky lg:top-28 lg:block lg:self-start" aria-label={`${title} contents`}>
          <p className="text-sm font-semibold text-slate-950">On this page</p>
          <nav className="mt-4 border-l border-slate-200" aria-label="Legal document sections">
            <ol className="space-y-1">
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="block border-l-2 border-transparent py-1.5 pl-4 text-sm leading-5 text-slate-500 transition-colors hover:border-cyan-500 hover:text-slate-950">
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="min-w-0">
          <details className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 lg:hidden">
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-950 marker:content-none">
              <span className="flex items-center justify-between gap-4">
                On this page
                <span className="text-lg font-normal text-cyan-600 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </span>
            </summary>
            <nav className="mt-4 border-l border-slate-200" aria-label="Mobile legal document sections">
              <ol className="space-y-1">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="block py-1.5 pl-4 text-sm leading-5 text-slate-600">{section.title}</a>
                  </li>
                ))}
              </ol>
            </nav>
          </details>
          <div className="mt-6 rounded-2xl border border-cyan-200/70 bg-cyan-50/70 p-5 text-sm leading-6 text-slate-700 sm:p-6 lg:mt-0">
            This document explains Align in plain language. It should be read together with the other legal page linked in the footer.
          </div>
          <div className="mt-12 space-y-12 sm:space-y-14">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} className={`${styles.section} ${index > 0 ? 'border-t border-slate-200 pt-12 sm:pt-14' : ''}`}>
                <h2 className="text-2xl font-semibold tracking-[-0.025em] text-slate-950 sm:text-[1.75rem]">{section.title}</h2>
                <div className="mt-5 text-[15px] leading-7 text-slate-600 sm:text-base sm:leading-8">{section.content}</div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
