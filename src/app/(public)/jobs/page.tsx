import Link from "next/link";
import {
  Bookmark,
  Building2,
  Compass,
  FileSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Navbar from "@/shared/components/layout/Navbar";

const features = [
  {
    icon: Compass,
    title: "Discover relevant vacancies",
    body: "Search provider-neutral UK vacancies with compact filters and Career Track relevance.",
  },
  {
    icon: Bookmark,
    title: "Keep a durable shortlist",
    body: "Saved jobs remain available for review even after they leave the live discovery feed.",
  },
  {
    icon: Building2,
    title: "Browse verified companies",
    body: "See verified employer job sources, current canonical vacancies and restrained source health.",
  },
  {
    icon: ShieldCheck,
    title: "Review sponsorship evidence",
    body: "Keep employer register evidence separate from wording found in an individual vacancy.",
  },
  {
    icon: FileSearch,
    title: "Check your match",
    body: "Send a durable vacancy and its description provenance into Align's canonical CV analysis flow.",
  },
  {
    icon: Sparkles,
    title: "Work from one Career Track",
    body: "Connect discovery relevance, confirmed profile facts and tailored CV work without duplicating them.",
  },
];

export default function JobsLandingPage() {
  return (
    <main className="min-h-screen bg-hero-gradient">
      <Navbar />
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-accent-purple">
            Align Job Board
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-text-primary sm:text-5xl">
            Find the role. Understand the evidence. Tailor the application.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-text-secondary">
            Align brings vacancy discovery, saved jobs, verified company
            sources, sponsorship evidence and CV matching into one authenticated
            workspace.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard/jobs"
              className="inline-flex min-h-12 items-center rounded-full bg-accent-purple px-6 text-sm font-bold text-white hover:opacity-90"
            >
              Open Job Board
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-12 items-center rounded-full border border-border-subtle bg-bg-primary px-6 text-sm font-bold text-text-primary hover:bg-bg-secondary"
            >
              Create your Career Track
            </Link>
          </div>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="rounded-2xl border border-border-subtle bg-bg-primary/80 p-5 shadow-sm backdrop-blur"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-purple/10 text-accent-purple">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-lg font-bold text-text-primary">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {body}
              </p>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-center text-xs leading-5 text-text-tertiary">
          Sponsor-register evidence indicates that an organisation name may
          appear on the UK register. It does not confirm sponsorship for a
          particular vacancy or candidate.
        </p>
      </section>
    </main>
  );
}
