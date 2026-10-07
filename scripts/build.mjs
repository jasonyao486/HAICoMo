import fs from "node:fs";
import { build } from "esbuild";
const version = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const define = { __HAICOMO_VERSION__: JSON.stringify(version) };
await build({
  entryPoints: [
    "src/electron/main.ts",
    "src/electron/preload.ts",
    "src/electron/worker.ts",
  ],
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron"],
  sourcemap: true,
  define,
});
await build({
  entryPoints: ["src/cli.ts"],
  outfile: "dist-electron/haicomo-cli.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  define,
});
await build({
  entryPoints: ["src/mcp.ts"],
  outfile: "dist-electron/haicomo-mcp.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  define,
});
