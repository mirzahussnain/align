import {
  ContourMotif,
  FlowMotif,
  OrbitMotif,
} from '@/shared/components/ui/ResourceBackdropMotifs';

type ResourcePageBackdropProps = {
  variant: 'jobs' | 'visas' | 'market';
};

const palettes = {
  jobs: {
    wash: 'bg-[linear-gradient(180deg,#f8faff_0%,#f3f7fb_34%,#f8f7ff_68%,#f1f7fb_100%)]',
    primary: 'text-violet-300/20',
    secondary: 'text-cyan-300/20',
  },
  visas: {
    wash: 'bg-[linear-gradient(180deg,#f4f8fc_0%,#f8f7ff_32%,#f1f8fb_67%,#f7f6ff_100%)]',
    primary: 'text-cyan-300/20',
    secondary: 'text-violet-300/20',
  },
  market: {
    wash: 'bg-[linear-gradient(180deg,#f5f7fc_0%,#f2f8fa_31%,#f8f6ff_66%,#f3f7fb_100%)]',
    primary: 'text-violet-300/20',
    secondary: 'text-cyan-300/20',
  },
} as const;

export default function ResourcePageBackdrop({
  variant,
}: ResourcePageBackdropProps) {
  const palette = palettes[variant];

  return (
    <div
      aria-hidden="true"
      data-testid="resource-page-backdrop"
      data-variant={variant}
      className={`pointer-events-none absolute inset-0 h-full min-h-full overflow-hidden ${palette.wash}`}
    >
      <OrbitMotif
        className={`absolute -right-44 top-[3%] h-[42rem] w-[42rem] ${palette.primary} motion-safe:animate-[spin_48s_linear_infinite] motion-reduce:animate-none`}
      />
      <FlowMotif
        className={`absolute -left-32 top-[31%] h-[28rem] w-[35rem] ${palette.secondary} motion-safe:animate-[pulse_10s_cubic-bezier(0.77,0,0.175,1)_infinite] motion-reduce:animate-none`}
      />
      <ContourMotif
        className={`absolute -right-36 top-[59%] h-[30rem] w-[39rem] ${palette.primary} motion-safe:animate-[pulse_12s_cubic-bezier(0.77,0,0.175,1)_infinite] motion-reduce:animate-none`}
      />
      <OrbitMotif
        className={`absolute -left-52 bottom-[-8rem] h-[38rem] w-[38rem] ${palette.secondary} motion-safe:animate-[spin_56s_linear_infinite_reverse] motion-reduce:animate-none`}
      />
    </div>
  );
}
