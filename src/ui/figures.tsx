import { useEffect, useRef, useState } from "react";
import { COLORS, FAMILIES, familyName, type Family } from "../shared/domain";
import { CHARACTERS, frameAt, type Pose } from "../shared/art";
import { clientIcon, isClientActor } from "../shared/clients";
import { FIGURE_HEAD, figureHeadRotation, figureSegments } from "../shared/figure";

/** Head/logo image used by default mode and as a fallback for unknown actors. */
export function actorIcon(actor: string) {
  return isClientActor(actor) ? `.${clientIcon(actor.slice(7))}` : `./local-assets/${actor}-logo.svg`;
}
/** Default-mode stick figure as inline SVG (same geometry as the office canvas). */
export function StickFigure({ actor, pose, seconds, reducedMotion, height = 70, flip = false }: { actor: string; pose: Pose; seconds: number; reducedMotion: boolean; height?: number; flip?: boolean }) {
  const index = FAMILIES.indexOf(actor as Family);
  const color = COLORS[(index < 0 ? actor.length : index) % COLORS.length];
  const segments = figureSegments(pose, seconds, reducedMotion);
  const rotation = (figureHeadRotation(pose) * 180) / Math.PI;
  return (
    <svg className="figure figure-stick" viewBox="-22 -58 44 62" width={(height * 44) / 62} height={height} aria-hidden="true" style={{ transform: flip ? "scaleX(-1)" : undefined }}>
      <ellipse cx="0" cy="2" rx="16" ry="4" fill="#445449" opacity="0.09" />
      <path d={segments.map((line) => line.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ")).join(" ")} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <image href={actorIcon(actor)} x={-FIGURE_HEAD.size / 2} y={FIGURE_HEAD.y - FIGURE_HEAD.size / 2} width={FIGURE_HEAD.size} height={FIGURE_HEAD.size} transform={`rotate(${rotation} 0 ${FIGURE_HEAD.y})`} />
    </svg>
  );
}
/** Enhanced-mode character drawn from the family atlas without a GPU canvas. */
export function AtlasFigure({ family, pose, seconds, reducedMotion, height = 85, flip = false }: { family: Family; pose: Pose; seconds: number; reducedMotion: boolean; height?: number; flip?: boolean }) {
  const manifest = CHARACTERS[family];
  const frame = frameAt(manifest, pose, seconds, reducedMotion);
  const region = manifest.regions?.[frame];
  const [failed, setFailed] = useState(false);
  if (!region || failed) return <StickFigure actor={family} pose={pose} seconds={seconds} reducedMotion={reducedMotion} height={height * 0.82} flip={flip} />;
  const [x, y, w, h] = region, k = height / h;
  return (
    <div className="figure figure-atlas" aria-hidden="true" style={{ width: w * k, height, transform: flip ? "scaleX(-1)" : undefined }}>
      <img src={manifest.src} alt="" draggable={false} onError={() => setFailed(true)} style={{ position: "absolute", left: -x * k, top: -y * k, transform: `scale(${k})`, transformOrigin: "0 0" }} />
    </div>
  );
}
export function Figure({ actor, pose, seconds, enhanced, reducedMotion, height, flip }: { actor: string; pose: Pose; seconds: number; enhanced: boolean; reducedMotion: boolean; height?: number; flip?: boolean }) {
  const family = (FAMILIES as readonly string[]).includes(actor) ? (actor as Family) : null;
  return enhanced && family ? <AtlasFigure family={family} pose={pose} seconds={seconds} reducedMotion={reducedMotion} height={height ?? 85} flip={flip} /> : <StickFigure actor={actor} pose={pose} seconds={seconds} reducedMotion={reducedMotion} height={height ?? 70} flip={flip} />;
}
/** Painted furniture with an interim fallback: dedicated desk/sofa paintings are used when present. */
function Painted({ primary, fallback, className, width }: { primary: string; fallback: string; className: string; width: number }) {
  const [src, setSrc] = useState(primary);
  return <img className={className} src={src} alt="" draggable={false} width={width} onError={() => { if (src !== fallback) setSrc(fallback); }} />;
}
export function Workstation({ enhanced }: { enhanced: boolean }) {
  if (enhanced) return <Painted className="furniture furniture-desk" primary="./local-assets/studio-desk.png" fallback="./local-assets/studio-table.png" width={245} />;
  return (
    <svg className="furniture furniture-desk" viewBox="0 0 220 90" width="220" height="90" aria-hidden="true">
      <ellipse cx="110" cy="80" rx="100" ry="8" fill="#293c31" opacity="0.08" />
      <rect x="20" y="40" width="180" height="12" rx="4" fill="#b1c3b5" />
      <rect x="22" y="36" width="176" height="8" rx="4" fill="#dfe9de" />
      <rect x="36" y="52" width="8" height="26" fill="#adc0b1" />
      <rect x="176" y="52" width="8" height="26" fill="#adc0b1" />
      <rect x="82" y="6" width="56" height="30" rx="4" fill="#f9fcf7" stroke="#c7d2c9" />
      <rect x="86" y="10" width="48" height="22" rx="2" fill="#dae8e2" />
      <rect x="106" y="36" width="8" height="5" fill="#adc0b1" />
      <rect x="150" y="26" width="26" height="10" rx="3" fill="#d4dfd5" />
    </svg>
  );
}
export function Sofa({ enhanced }: { enhanced: boolean }) {
  if (enhanced) return <Painted className="furniture furniture-sofa" primary="./local-assets/studio-sofa.png" fallback="./local-assets/studio-bench.png" width={180} />;
  return (
    <svg className="furniture furniture-sofa" viewBox="0 0 120 70" width="120" height="70" aria-hidden="true">
      <ellipse cx="60" cy="64" rx="52" ry="6" fill="#293c31" opacity="0.08" />
      <rect x="14" y="14" width="92" height="30" rx="10" fill="#adc0b1" />
      <rect x="6" y="30" width="108" height="24" rx="10" fill="#d4dfd5" />
      <rect x="6" y="26" width="16" height="30" rx="7" fill="#adc0b1" />
      <rect x="98" y="26" width="16" height="30" rx="7" fill="#adc0b1" />
      <rect x="18" y="54" width="6" height="8" fill="#9fb3a3" />
      <rect x="96" y="54" width="6" height="8" fill="#9fb3a3" />
    </svg>
  );
}
/** One shared low-frequency clock for every animated row on a page. */
export function useAnimationClock(active: boolean, fps = 8) {
  const [seconds, setSeconds] = useState(0);
  const start = useRef(performance.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setSeconds((performance.now() - start.current) / 1000), 1000 / fps);
    return () => clearInterval(timer);
  }, [active, fps]);
  return seconds;
}
export const actorLabel = (actor: string) => familyName(actor);
