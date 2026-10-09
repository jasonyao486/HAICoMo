// Injected by esbuild/vite `define`; tests and tsx runs fall back to a dev marker.
declare const __HAICOMO_VERSION__: string | undefined;
export const APP_VERSION =
  typeof __HAICOMO_VERSION__ === "string" ? __HAICOMO_VERSION__ : "0.0.0-dev";
// Release versions are plain major.minor.patch; pre-release suffixes are never offered as updates.
export function parseVersion(value: string): readonly [number, number, number] | null {
  const match = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}
export function compareVersions(a: string, b: string) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) throw new Error("INVALID_VERSION");
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
