import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";

// Windows CI only (scripts/test-windows-user-install.ps1, standard-user token):
// the installed build checks a loopback copy of the GitHub release API, downloads
// a next-version installer, restarts through the NSIS installer and must come back
// as the new version with its window restored. Nothing here contacts GitHub.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function sha512(file: string) {
  const hash = createHash("sha512");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("base64");
}
function registryVersion(guid: string) {
  try {
    const out = execFileSync("reg", ["query", `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}`, "/v", "DisplayVersion"], { encoding: "utf8" });
    return /DisplayVersion\s+REG_SZ\s+(\S+)/.exec(out)?.[1] ?? "";
  } catch { return ""; }
}
async function waitFor<T>(probe: () => T | undefined | false, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = probe(); if (value) return value; await sleep(1000); }
  return undefined;
}

test("installed Windows build updates itself in-app to the next version", async () => {
  test.skip(process.platform !== "win32" || !process.env.HAICOMO_INAPP_UPDATE_FIXTURE, "Requires the Windows standard-user installation scenario");
  test.setTimeout(15 * 60 * 1000);
  const fixture = process.env.HAICOMO_INAPP_UPDATE_FIXTURE!, executable = process.env.HAICOMO_PACKAGED_EXECUTABLE!;
  const guid = process.env.HAICOMO_INAPP_UPDATE_GUID!, out = process.env.HAICOMO_INAPP_UPDATE_DIR!;
  fs.mkdirSync(out, { recursive: true });
  const current: string = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
  const name = path.basename(fixture), next = /^HAICoMo-(\d+\.\d+\.\d+)-windows-x64-setup\.exe$/.exec(name)?.[1];
  expect(next).toBeTruthy();
  const digest = await sha512(fixture), size = fs.statSync(fixture).size;
  const metadata = `version: ${next}\nfiles:\n  - url: ${name}\n    sha512: '${digest}'\n    size: ${size}\npath: ${name}\nsha512: '${digest}'\nreleaseDate: '${new Date().toISOString()}'\n`;
  const baseBlockmap = process.env.HAICOMO_INAPP_UPDATE_BASE_BLOCKMAP;
  const files = new Map<string, string>([[`/jasonyao486/HAICoMo/releases/download/v${next}/${name}`, fixture]]);
  if (fs.existsSync(`${fixture}.blockmap`)) files.set(`/jasonyao486/HAICoMo/releases/download/v${next}/${name}.blockmap`, `${fixture}.blockmap`);
  if (baseBlockmap && fs.existsSync(baseBlockmap)) files.set(`/jasonyao486/HAICoMo/releases/download/v${current}/HAICoMo-${current}-windows-x64-setup.exe.blockmap`, baseBlockmap);
  const seen = { api: 0, metadata: 0, full: 0, ranges: 0 };
  const server = http.createServer((req, res) => {
    const url = (req.url ?? "").split("?")[0];
    if (url === "/repos/jasonyao486/HAICoMo/releases") {
      seen.api++;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify([{ tag_name: `v${next}`, draft: false, prerelease: true, body: "Synthetic in-app update fixture.", assets: [{ name: "latest.yml", state: "uploaded" }, { name, state: "uploaded" }] }]));
      return;
    }
    if (url === `/jasonyao486/HAICoMo/releases/download/v${next}/latest.yml`) { seen.metadata++; res.setHeader("Content-Type", "text/yaml"); res.end(metadata); return; }
    const file = files.get(url);
    if (!file) { res.writeHead(404); res.end(); return; }
    const total = fs.statSync(file).size, range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ""));
    if (range) {
      seen.ranges++;
      const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
      res.writeHead(206, { "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${total}`, "Accept-Ranges": "bytes" });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    if (file === fixture) seen.full++;
    res.writeHead(200, { "Content-Length": total, "Accept-Ranges": "bytes" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  // No HAICOMO_USER_DATA: the installer relaunches the app without these variables,
  // so the update journal must live in the default profile.
  const env: Record<string, string> = { ...process.env as Record<string, string>, HAICOMO_TEST: "1", HAICOMO_UPDATE_INSTALL_TEST: "1", HAICOMO_TEST_RELEASE_ORIGIN: origin };
  delete env.HAICOMO_USER_DATA;
  const app = await electron.launch({ executablePath: executable, args: [], env });
  let closed = false;
  app.on("close", () => { closed = true; });
  const result: Record<string, unknown> = { fromVersion: current, toVersion: next };
  try {
    const page = await app.firstWindow();
    // The relaunched app runs without test variables; keep it from contacting GitHub.
    await page.evaluate(async () => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, autoCheckUpdates: false, locale: "zh-CN" } }); });
    await page.getByRole("button", { name: "设置", exact: true }).click();
    const panel = page.locator(".update-panel");
    await panel.getByRole("button", { name: "检查更新", exact: true }).click();
    await expect(panel.getByRole("button", { name: "立即更新", exact: true })).toBeVisible({ timeout: 60000 });
    await page.screenshot({ path: path.join(out, "available.png") });
    await panel.getByRole("button", { name: "立即更新", exact: true }).click();
    await expect(panel.getByRole("button", { name: "重启并安装", exact: true })).toBeVisible({ timeout: 8 * 60 * 1000 });
    await page.screenshot({ path: path.join(out, "downloaded.png") });
    await panel.getByRole("button", { name: "重启并安装", exact: true }).click();
    expect(await waitFor(() => closed, 120000)).toBe(true);
  } finally {
    if (!closed) await app.close().catch(() => {});
    await new Promise<void>((r) => server.close(() => r()));
  }
  result.download = { ...seen };
  result.differential = seen.ranges > 0 && seen.full === 0;
  const installed = await waitFor(() => registryVersion(guid) === next, 5 * 60 * 1000);
  expect(installed, "installed version after in-app update").toBe(true);
  result.installed = true;
  const journal = path.join(process.env.APPDATA!, "haicomo", "last-update.json");
  const restored = () => { try { return JSON.parse(fs.readFileSync(journal, "utf8")).restoredVersion === next; } catch { return false; } };
  let relaunched = await waitFor(restored, 90000);
  result.relaunchedByInstaller = !!relaunched;
  if (!relaunched) {
    // A non-interactive CI session may not allow the installer's shell relaunch.
    spawn(executable, [], { detached: true, stdio: "ignore" }).unref();
    relaunched = await waitFor(restored, 90000);
  }
  expect(relaunched, "update journal restored by the new version").toBe(true);
  result.restored = true;
  try { execFileSync("taskkill", ["/F", "/IM", "HAICoMo.exe"], { stdio: "ignore" }); } catch {}
  await sleep(3000);
  fs.writeFileSync(path.join(out, "result.json"), JSON.stringify(result, null, 2));
});
