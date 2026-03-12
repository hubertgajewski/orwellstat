export interface SvgAnalysis {
  animateInRectCount: number;
  animateInTextCount: number;
  hasWidthAnimation: boolean;
  hasVisibilityAnimation: boolean;
  rectAnimateTiming: { begin: string | null; dur: string | null } | null;
  textAnimateTiming: { begin: string | null; dur: string | null } | null;
  browsers: string[];
}
