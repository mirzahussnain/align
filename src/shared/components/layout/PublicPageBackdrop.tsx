import styles from './PublicPageBackdrop.module.css';

export type PublicPageBackdropVariant = 'analyze' | 'jobs' | 'immigration' | 'insights';

interface PublicPageBackdropProps {
  variant: PublicPageBackdropVariant;
}

function AnalyzeArtifact() {
  return (
    <>
      <path className={styles.frame} d="M283 84h238l96 96v414H283z" />
      <path className={styles.frame} d="M521 84v96h96" />
      <path className={styles.muted} d="M344 243h206M344 292h154M344 390h206M344 439h174M344 488h121" />
      <path className={styles.signal} d="M344 341h105" />
      <path className={styles.corner} d="M247 222v-42h42M653 222v-42h-42M247 506v42h42M653 506v42h-42" />
      <path className={styles.scan} d="M263 260h374" />
      <circle className={styles.node} cx="550" cy="341" r="10" />
      <circle className={styles.pulse} cx="550" cy="341" r="22" />
    </>
  );
}

function JobsArtifact() {
  return (
    <>
      <path className={styles.route} d="M126 471C238 288 354 520 447 321S635 181 778 274" />
      <path className={styles.muted} d="M126 471C259 556 373 579 492 522S679 412 778 274" />
      <g className={styles.cardOne}>
        <rect className={styles.frame} x="92" y="414" width="156" height="108" rx="18" />
        <path className={styles.muted} d="M122 448h76M122 477h48" />
      </g>
      <g className={styles.cardTwo}>
        <rect className={styles.frame} x="370" y="267" width="156" height="108" rx="18" />
        <path className={styles.muted} d="M400 301h76M400 330h48" />
      </g>
      <g className={styles.cardThree}>
        <rect className={styles.frame} x="678" y="220" width="156" height="108" rx="18" />
        <path className={styles.muted} d="M708 254h76M708 283h48" />
      </g>
      <circle className={styles.node} cx="126" cy="471" r="9" />
      <circle className={styles.node} cx="447" cy="321" r="9" />
      <circle className={styles.node} cx="778" cy="274" r="9" />
      <circle className={styles.traveller} cx="0" cy="0" r="7" />
    </>
  );
}

function ImmigrationArtifact() {
  return (
    <>
      <circle className={styles.orbit} cx="450" cy="354" r="218" />
      <circle className={styles.muted} cx="450" cy="354" r="150" />
      <path className={styles.route} d="M211 459C319 427 338 302 450 354s174-67 256-126" />
      <path className={styles.routeSecondary} d="M231 222c85 11 121 67 219 132s180 81 244 154" />
      <circle className={styles.node} cx="211" cy="459" r="10" />
      <circle className={styles.node} cx="450" cy="354" r="12" />
      <circle className={styles.node} cx="706" cy="228" r="10" />
      <circle className={styles.node} cx="694" cy="508" r="10" />
      <g className={styles.seal}>
        <circle className={styles.frame} cx="450" cy="354" r="61" />
        <path className={styles.signal} d="m420 355 19 19 43-47" />
      </g>
    </>
  );
}

function InsightsArtifact() {
  return (
    <>
      <path className={styles.axis} d="M144 539V173M144 539h626" />
      <path className={styles.guide} d="M144 449h626M144 359h626M144 269h626" />
      <path className={styles.area} d="M144 488 245 426l91 27 109-144 107 48 98-109 120 37v254H144z" />
      <path className={styles.route} d="M144 488 245 426l91 27 109-144 107 48 98-109 120 37" />
      <circle className={styles.node} cx="245" cy="426" r="8" />
      <circle className={styles.node} cx="445" cy="309" r="8" />
      <circle className={styles.node} cx="650" cy="248" r="8" />
      <circle className={styles.dataPulse} cx="650" cy="248" r="20" />
      <path className={styles.bars} d="M205 539v-73M303 539v-112M401 539v-68M499 539v-151M597 539v-103M695 539v-182" />
    </>
  );
}

const artifacts = {
  analyze: AnalyzeArtifact,
  jobs: JobsArtifact,
  immigration: ImmigrationArtifact,
  insights: InsightsArtifact,
} satisfies Record<PublicPageBackdropVariant, () => React.ReactNode>;

export default function PublicPageBackdrop({ variant }: PublicPageBackdropProps) {
  const Artifact = artifacts[variant];

  return (
    <div className={`${styles.backdrop} ${styles[variant]}`} aria-hidden="true">
      <div className={styles.ambient} />
      <svg className={styles.artifact} viewBox="0 0 900 700" fill="none">
        <Artifact />
      </svg>
      <span className={styles.registrationMark} />
      <span className={styles.registrationMarkSecondary} />
    </div>
  );
}
