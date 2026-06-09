export interface HeroCarouselCard {
  type: 'blur' | 'sponsors' | 'ats' | 'main' | 'compliance' | 'salary' | 'blur-right';
  transform: string;
  hoverTransform: string;
  opacity: number;
  filter: string;
  zIndex: number;
}

export interface HeroPathLabel {
  text: string;
  transform: string;
  isCenter?: boolean;
}

export interface HeroVerticalLine {
  transform: string;
}

export const HERO_CAROUSEL_CARDS: readonly HeroCarouselCard[] = [
  { 
    type: 'sponsors', 
    transform: 'translate3d(-358px, -5px, -55px) rotateY(-35deg) translate3d(-50%, -50%, 0) scale(1.0)',
    hoverTransform: 'translate3d(-358px, 8px, -55px) rotateY(-30deg) translate3d(-50%, -50%, 0) scale(1.08)',
    opacity: 0.72,
    filter: 'blur(0.4px)',
    zIndex: 15
  },
  { 
    type: 'ats', 
    transform: 'translate3d(-175px, -5px, 50px) rotateY(-20deg) translate3d(-50%, -50%, 0) scale(1.0)',
    hoverTransform: 'translate3d(-175px, -8px, 50px) rotateY(-15deg) translate3d(-50%, -50%, 0) scale(1.08)',
    opacity: 0.94,
    filter: 'none',
    zIndex: 20
  },
  { 
    type: 'main', 
    transform: 'translate3d(0, -5px, 110px) rotateY(0deg) translate3d(-50%, -50%, 0) scale(1.0)',
    hoverTransform: 'translate3d(0, -18px, 110px) rotateY(0deg) translate3d(-50%, -50%, 0) scale(1.08)',
    opacity: 1,
    filter: 'none',
    zIndex: 30
  },
  { 
    type: 'compliance', 
    transform: 'translate3d(158px, -5px, 50px) rotateY(20deg) translate3d(-50%, -50%, 0) scale(1.0)',
    hoverTransform: 'translate3d(168px, -8px, 50px) rotateY(15deg) translate3d(-50%, -50%, 0) scale(1.08)',
    opacity: 0.94,
    filter: 'none',
    zIndex: 20
  },
  { 
    type: 'salary', 
    transform: 'translate3d(312px, -5px, -55px) rotateY(35deg) translate3d(-50%, -50%, 0) scale(1.0)',
    hoverTransform: 'translate3d(368px, 8px, -55px) rotateY(30deg) translate3d(-50%, -50%, 0) scale(1.08)',
    opacity: 0.72,
    filter: 'blur(0.4px)',
    zIndex: 15
  },
] as const;

export const HERO_PATH_LABELS: readonly HeroPathLabel[] = [
  { text: 'Sponsors', transform: 'translate3d(-358px, -146px, -55px) rotateY(-20deg) translate3d(-50%, calc(-100% - 4px), 0) scale(0.85)' },
  { text: 'ATS Score', transform: 'translate3d(-165px, -146px, 50px) rotateY(-15deg) translate3d(-50%, calc(-100% - 4px), 0) scale(0.92)' },
  { text: 'Alignment Engine', transform: 'translate3d(0px, -154px, 110px) rotateY(0deg) translate3d(-50%, calc(-100% - 4px), 0) scale(1.0)', isCenter: true },
  { text: 'Compliance', transform: 'translate3d(168px, -146px, 50px) rotateY(15deg) translate3d(-50%, calc(-100% - 4px), 0) scale(0.92)' },
  { text: 'Salary Est.', transform: 'translate3d(368px, -144px, -55px) rotateY(20deg) translate3d(-50%, calc(-100% - 4px), 0) scale(0.85)' },
] as const;

export const HERO_VERTICAL_LINES: readonly HeroVerticalLine[] = [
  // Left hand side of Sponsors (Card 2)
  // { transform: 'translate3d(-514px, -85px, -115px) rotateY(-20deg) translate3d(-50%, 0, 0)' },
  // Left hand side of ATS Score (Card 3)
  { transform: 'translate3d(-261px, -134px, -2px) rotateY(-15deg) translate3d(-50%, 0, 0)' },
  // Both sides of Center Card (Card 4)
  { transform: 'translate3d(-82px, -142px, 80px) rotateY(0deg) translate3d(-50%, 0, 0)' },
  { transform: 'translate3d(84px, -142px, 80px) rotateY(0deg) translate3d(-50%, 0, 0)' },
  // Right hand side of Compliance (Card 5)
  { transform: 'translate3d(268px, -133px, -2px) rotateY(15deg) translate3d(-50%, 0, 0)' },
  // Right hand side of Salary Est. (Card 6)
  // { transform: 'translate3d(514px, -85px, -115px) rotateY(20deg) translate3d(-50%, 0, 0)' },
] as const;
