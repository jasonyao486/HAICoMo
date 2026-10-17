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
export function AtlasFigure({ family, pose, seconds, reducedMotion, height = 85, flip = false, maxWidth }: { family: Family; pose: Pose; seconds: number; reducedMotion: boolean; height?: number; flip?: boolean; maxWidth?: number }) {
  const manifest = CHARACTERS[family];
  const frame = frameAt(manifest, pose, seconds, reducedMotion);
  const region = manifest.regions?.[frame];
  const [failed, setFailed] = useState(false);
  if (!region || failed) return <StickFigure actor={family} pose={pose} seconds={seconds} reducedMotion={reducedMotion} height={height * 0.82} flip={flip} />;
  // Wide frames (sleeping) shrink to fit a seat instead of overlapping the neighbours.
  const [x, y, w, h] = region, k = Math.min(height / h, maxWidth ? maxWidth / w : Infinity);
  return (
    <div className="figure figure-atlas" aria-hidden="true" style={{ width: w * k, height: h * k, transform: flip ? "scaleX(-1)" : undefined }}>
      <img src={manifest.src} alt="" draggable={false} onError={() => setFailed(true)} style={{ position: "absolute", left: -x * k, top: -y * k, transform: `scale(${k})`, transformOrigin: "0 0" }} />
    </div>
  );
}
export function Figure({ actor, pose, seconds, enhanced, reducedMotion, height, flip, maxWidth }: { actor: string; pose: Pose; seconds: number; enhanced: boolean; reducedMotion: boolean; height?: number; flip?: boolean; maxWidth?: number }) {
  const family = (FAMILIES as readonly string[]).includes(actor) ? (actor as Family) : null;
  return enhanced && family ? <AtlasFigure family={family} pose={pose} seconds={seconds} reducedMotion={reducedMotion} height={height ?? 85} flip={flip} maxWidth={maxWidth} /> : <StickFigure actor={actor} pose={pose} seconds={seconds} reducedMotion={reducedMotion} height={height ?? 70} flip={flip} />;
}
/**
 * Desk and sofa share one visible width so the relay scene reads as one row.
 * Paintings carry transparent margins; their `<img>` widths are scaled by the
 * measured opaque extent (alpha ≥ 200) so the visible furniture matches.
 * Replacing a painting requires re-measuring its ratio here.
 */
export const FURNITURE_WIDTH = 264;
/** Painting width ÷ opaque width: studio-desk.png 1619 / (1568 − 50 + 1); studio-sofa.png 2056 / (2013 − 43 + 1). */
export const DESK_VISIBLE_RATIO = 1619 / 1519;
export const SOFA_VISIBLE_RATIO = 2056 / 1971;
/** Seat and workstation centres as fractions of the visible width (both paintings and both SVGs). */
export const SLOT_FRACTIONS = [0.22, 0.5, 0.78] as const;
export const slotOffset = (slot: number) => (SLOT_FRACTIONS[slot] - 0.5) * FURNITURE_WIDTH;
/** Painted furniture with an interim fallback: dedicated desk/sofa paintings are used when present. */
function Painted({ primary, fallback, className, width }: { primary: string; fallback: string; className: string; width: number }) {
  const [src, setSrc] = useState(primary);
  return <img className={className} src={src} alt="" draggable={false} width={width} onError={() => { if (src !== fallback) setSrc(fallback); }} />;
}
export function Workstation({ enhanced }: { enhanced: boolean }) {
  if (enhanced) return <Painted className="furniture furniture-desk" primary="./local-assets/studio-desk.png" fallback="./local-assets/studio-table.png" width={Math.round(FURNITURE_WIDTH * DESK_VISIBLE_RATIO)} />;
  const W = FURNITURE_WIDTH;
  return (
    <svg className="furniture furniture-desk" viewBox={`0 0 ${W} 96`} width={W} height="96" aria-hidden="true">
      <ellipse cx={W / 2} cy="88" rx={W / 2 - 8} ry="7" fill="#293c31" opacity="0.08" />
      <rect x="2" y="46" width={W - 4} height="12" rx="4" fill="#b1c3b5" />
      <rect x="4" y="42" width={W - 8} height="8" rx="4" fill="#dfe9de" />
      {[16, W / 2 - 4, W - 24].map((x) => <rect key={x} x={x} y="58" width="8" height="26" fill="#adc0b1" />)}
      {SLOT_FRACTIONS.map((f) => {
        const cx = f * W;
        return (
          <g key={f}>
            <rect x={cx - 26} y="12" width="52" height="28" rx="4" fill="#f9fcf7" stroke="#c7d2c9" />
            <rect x={cx - 22} y="16" width="44" height="20" rx="2" fill="#dae8e2" />
            <rect x={cx - 4} y="40" width="8" height="3" fill="#adc0b1" />
          </g>
        );
      })}
    </svg>
  );
}
export function Sofa({ enhanced }: { enhanced: boolean }) {
  if (enhanced) return <Painted className="furniture furniture-sofa" primary="./local-assets/studio-sofa.png" fallback="./local-assets/studio-bench.png" width={Math.round(FURNITURE_WIDTH * SOFA_VISIBLE_RATIO)} />;
  const W = FURNITURE_WIDTH, inner = W - 44, seat = inner / 3;
  return (
    <svg className="furniture furniture-sofa" viewBox={`0 0 ${W} 80`} width={W} height="80" aria-hidden="true">
      <ellipse cx={W / 2} cy="74" rx={W / 2 - 8} ry="6" fill="#293c31" opacity="0.08" />
      <rect x="18" y="12" width={W - 36} height="34" rx="10" fill="#adc0b1" />
      {[1, 2].map((i) => <line key={`b${i}`} x1={22 + seat * i} y1="16" x2={22 + seat * i} y2="34" stroke="#98ad9d" strokeWidth="2" strokeLinecap="round" />)}
      <rect x="2" y="32" width={W - 4} height="26" rx="10" fill="#d4dfd5" />
      {[1, 2].map((i) => <line key={`s${i}`} x1={22 + seat * i} y1="35" x2={22 + seat * i} y2="55" stroke="#b6c7b9" strokeWidth="2" strokeLinecap="round" />)}
      <rect x="2" y="28" width="20" height="32" rx="8" fill="#adc0b1" />
      <rect x={W - 22} y="28" width="20" height="32" rx="8" fill="#adc0b1" />
      <rect x="18" y="58" width="6" height="10" fill="#9fb3a3" />
      <rect x={W - 24} y="58" width="6" height="10" fill="#9fb3a3" />
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
