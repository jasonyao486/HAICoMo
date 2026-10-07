import { FAMILIES, type Family } from "./domain";
import { SPRITE_REGIONS } from "./sprite-regions";
export type Pose = "walk" | "run" | "idle" | "sit" | "sleep" | "talk" | "hobby";
export type SpriteManifest = {
  src: string;
  columns: number;
  rows: number;
  regions?: [number, number, number, number][];
  height: number;
  anchor: [number, number];
  motions: Record<Pose, { frames: number[]; fps: number }>;
};
const motions: SpriteManifest["motions"] = {
  walk: { frames: [0, 1, 2, 3], fps: 5 },
  run: { frames: [4, 5, 6, 7], fps: 8 },
  idle: { frames: [8], fps: 1 },
  sit: { frames: [9], fps: 1 },
  sleep: { frames: [10], fps: 1 },
  talk: { frames: [9, 11, 11, 9], fps: 3 },
  hobby: { frames: [12, 13, 14, 15, 14, 13], fps: 2 },
};
/** Frame ranges belong to each asset; the renderer has no fixed frame count. */
export const CHARACTERS = Object.fromEntries(
  FAMILIES.map((id) => [
    id,
    {
      src: `./local-assets/${id}-atlas.png`,
      columns: 4,
      rows: 4,
      regions: SPRITE_REGIONS[id],
      height: id === "ernie" ? 89 : 85,
      anchor: [0.5, 1],
      motions,
    },
  ]),
) as Record<Family, SpriteManifest>;
export const PORTRAITS = Object.fromEntries(
  FAMILIES.map((id) => [
    id,
    {
      animated: `./local-assets/${id}-original${["deepseek", "kimi"].includes(id) ? "-2" : ""}.gif`,
      static: `./local-assets/${id}-original${["deepseek", "kimi"].includes(id) ? "-2" : ""}.png`,
    },
  ]),
) as Record<Family, { animated: string; static: string }>;
export const FURNITURE = {
  table: {
    src: "./local-assets/studio-table.png",
    width: 230,
    height: 173,
    anchor: [0.5, 0.28],
    footprint: [98, 47],
    seatOffsets: [],
    layer: "ground",
  },
  bench: {
    src: "./local-assets/studio-bench.png",
    width: 76,
    height: 58,
    anchor: [0.5, 0.72],
    footprint: [25, 14],
    seatOffsets: [[0, -14]],
    layer: "ground",
  },
  tea: {
    src: "./local-assets/studio-tea.png",
    width: 84,
    height: 70,
    anchor: [0.5, 0.8],
    footprint: [30, 22],
    seatOffsets: [
      [-58, 8],
      [58, 8],
    ],
    layer: "ground",
  },
  plant: {
    src: "./local-assets/studio-plant.png",
    width: 82,
    height: 110,
    anchor: [0.5, 0.92],
    footprint: [20, 14],
    seatOffsets: [],
    layer: "ground",
  },
} as const;
export function frameAt(
  manifest: SpriteManifest,
  pose: Pose,
  seconds: number,
  reducedMotion: boolean,
) {
  const motion = manifest.motions[reducedMotion ? "idle" : pose];
  return motion.frames[Math.floor(seconds * motion.fps) % motion.frames.length];
}
