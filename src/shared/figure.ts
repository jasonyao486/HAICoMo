/** Default-mode articulated stick figure: one shared geometry for every renderer. */
export type FigurePose = "walk" | "run" | "idle" | "sit" | "sleep" | "talk" | "hobby";
export const FIGURE_HEAD = { size: 25, y: -40 };
export function figureSwing(pose: FigurePose, seconds: number, reducedMotion: boolean) {
  if (reducedMotion) return 0;
  return Math.sin(seconds * (pose === "run" ? 14 : 6)) * (pose === "run" ? 9 : pose === "walk" ? 6 : 0);
}
/** Polylines (x,y pairs) for torso, two arms and two legs; feet rest on y = 0. */
export function figureSegments(pose: FigurePose, seconds: number, reducedMotion: boolean): [number, number][][] {
  const swing = figureSwing(pose, seconds, reducedMotion), kneeY = pose === "sit" ? -12 : -5;
  return [
    [[0, -25], [0, -12]],
    [[0, -23], [-8, -17 + swing / 2], [-13, -12 + swing]],
    [[0, -23], [8, -17 - swing / 2], [12, -12 - swing]],
    [[0, -12], [-6 - swing / 2, kneeY], [-9 - swing, 0]],
    [[0, -12], [6 + swing / 2, kneeY], [9 + swing, 0]],
  ];
}
export const figureHeadRotation = (pose: FigurePose) => (pose === "sleep" ? -0.25 : 0);
