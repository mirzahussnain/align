import { ShieldCheck, Target, FileStack } from 'lucide-react';

const CAPABILITIES = [
  {
    icon: ShieldCheck,
    title: 'Sponsorship, verified',
    body: 'Every job is cross-checked against the GOV.UK register of licensed sponsors — not guessed from the listing.',
  },
  {
    icon: Target,
    title: 'Scored against the actual role',
    body: 'Paste a job description and your CV is matched requirement by requirement, at the tool level, with the gaps named.',
  },
  {
    icon: FileStack,
    title: 'Rewritten, not reformatted',
    body: 'Turn a match report into an ATS-safe CV in one of four templates, built around what that employer asked for.',
  },
];

export default function AuthShowcasePanel() {
  return (
    <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-center rounded-[28px] bg-[linear-gradient(150deg,hsl(262_83%_58%)_0%,hsl(238_80%_52%)_45%,hsl(199_89%_48%)_100%)] p-12">
      {/* Radial bloom */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-white/20 blur-[100px]"
      />
      {/* Starburst, echoing the reference's decorative mark */}
      <svg
        aria-hidden
        viewBox="0 0 200 200"
        className="pointer-events-none absolute -bottom-10 -right-6 h-72 w-72 text-white/[0.12]"
      >
        <path
          fill="currentColor"
          d="M100 0c4 52 44 92 96 100-52 8-92 48-100 100-8-52-48-92-100-100C48 92 88 52 100 0Z"
        />
      </svg>

      <div className="relative">
        <h2 className="max-w-md text-4xl font-black leading-[1.1] tracking-tight text-white text-balance">
          Every application, aligned to the UK market.
        </h2>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
          Align reads the job, reads your CV, and tells you the truth about the gap between them.
        </p>
      </div>

      <ul className="relative mt-10 flex flex-col gap-3">
        {CAPABILITIES.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                <Icon className="h-4 w-4" strokeWidth={2.2} />
              </span>
              <div>
                <p className="text-sm font-bold text-white">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/70">{body}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
