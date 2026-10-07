// Injected by esbuild/vite `define`; tests and tsx runs fall back to a dev marker.
declare const __HAICOMO_VERSION__: string | undefined;
export const APP_VERSION =
  typeof __HAICOMO_VERSION__ === "string" ? __HAICOMO_VERSION__ : "0.0.0-dev";
