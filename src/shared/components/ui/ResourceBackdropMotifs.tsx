import type { SVGProps } from 'react';

type MotifProps = SVGProps<SVGSVGElement>;

export function OrbitMotif({ className, ...props }: MotifProps) {
  return (
    <svg
      data-testid="resource-backdrop-motif"
      className={className}
      viewBox="0 0 640 640"
      fill="none"
      {...props}
    >
      <circle cx="320" cy="320" r="194" stroke="currentColor" />
      <circle
        cx="320"
        cy="320"
        r="252"
        stroke="currentColor"
        strokeDasharray="4 18"
      />
      <path
        d="M96 372C190 202 352 164 532 278"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function FlowMotif({ className, ...props }: MotifProps) {
  return (
    <svg
      data-testid="resource-backdrop-motif"
      className={className}
      viewBox="0 0 520 420"
      fill="none"
      {...props}
    >
      <path
        d="M22 342C104 164 248 74 498 48"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M54 384C158 228 286 150 474 112"
        stroke="currentColor"
        strokeDasharray="3 13"
      />
      <path
        d="M96 396C202 280 324 222 448 196"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </svg>
  );
}

export function ContourMotif({ className, ...props }: MotifProps) {
  return (
    <svg
      data-testid="resource-backdrop-motif"
      className={className}
      viewBox="0 0 600 460"
      fill="none"
      {...props}
    >
      <path
        d="M28 332C126 286 182 154 286 202C390 250 438 106 574 62"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M18 398C138 342 206 264 314 296C424 328 492 232 584 194"
        stroke="currentColor"
      />
      <path
        d="M68 430C180 386 254 342 348 362C444 382 520 320 588 282"
        stroke="currentColor"
        strokeDasharray="4 15"
      />
    </svg>
  );
}
