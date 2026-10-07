import fs from "node:fs";
import { defineConfig } from "vite";
const version = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
export default defineConfig({
  base: "./",
  publicDir: "assets/runtime",
  define: { __HAICOMO_VERSION__: JSON.stringify(version) },
  server: { host: "127.0.0.1", port: 5179, strictPort: true },
  build: { sourcemap: true },
});
