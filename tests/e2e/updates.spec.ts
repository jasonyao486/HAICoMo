const currentVersion: string = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
const nextVersion = currentVersion.replace(/(\d+)$/, (patch) => String(Number(patch) + 1));
import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { zipSync } from "fflate";
test("update source failure, checksum rejection and concurrent retry retain truthful UI state", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-update-fail-"));
  const good = randomBytes(262144), sha = createHash("sha512").update(good).digest("base64");
  let offline = true, corrupt = true, downloads = 0, version = currentVersion;
  const server = http.createServer((req, res) => {
    if (offline) { res.writeHead(503); res.end("Temporary test outage"); return; }
    if (req.url?.split("?")[0].endsWith(".zip")) { downloads++; res.end(corrupt ? Buffer.alloc(good.length) : good); }
    else res.end(JSON.stringify({ version, files: [{ url: "retry.zip", sha512: sha, size: good.length }], path: "retry.zip", sha512: sha }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const app = await electron.launch({ ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] } : { args: ["."] }), env: { ...process.env, HAICOMO_TEST: "1", HAICOMO_USER_DATA: path.join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    expect((await page.evaluate(() => window.haicomo.request("updates.check"))).status).toBe("not-configured");
    await page.evaluate(async (feed) => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, updateFeed: feed } }); }, `http://127.0.0.1:${(server.address() as any).port}/`);
    expect((await page.evaluate(() => window.haicomo.request("updates.check"))).errorStage).toBe("check");
    offline = false;
    expect((await page.evaluate(() => window.haicomo.request("updates.check"))).status).toBe("up-to-date");
    version = nextVersion;
    await page.evaluate(() => window.haicomo.request("updates.check"));
    const rejected = await page.evaluate(() => window.haicomo.request("updates.download"));
    expect(rejected.status).toBe("error"); expect(rejected.errorStage).toBe("download");
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await expect(page.locator(".update-panel [role=alert]")).toContainText("完整性校验");
    const beforeRetry = downloads; corrupt = false;
    const results = await page.evaluate(() => Promise.all([window.haicomo.request("updates.download"), window.haicomo.request("updates.download")]));
    expect(results.map((r) => r.status)).toEqual(["downloaded", "downloaded"]);
    expect(downloads - beforeRetry).toBe(1);
    await page.evaluate(() => window.haicomo.request("updates.defer"));
    await expect(page.locator(".update-panel").getByRole("button", { name: "重启并安装", exact: true })).toBeVisible();
    await expect(page.locator(".update-banner")).toHaveCount(0);
  } finally { await app.close().catch(() => {}); await new Promise<void>((r) => server.close(() => r())); fs.rmSync(root, { recursive: true, force: true }); }
});
test("local update feed: explicit check, checksum download, progress and separate install choice", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-update-")),
    bytes = zipSync(
      { "LOCAL-UPDATE-TEST.txt": randomBytes(3 * 1024 * 1024) },
      { level: 0 },
    ),
    sha = createHash("sha512").update(bytes).digest("base64");
  let downloads = 0;
  const server = http.createServer((req, res) => {
    if (req.url?.split("?")[0].endsWith(".yml")) {
      res.setHeader("Content-Type", "application/yaml");
      res.end(
        JSON.stringify({
          version: nextVersion,
          files: [
            { url: "HAICoMo-0.2.3-arm64.zip", sha512: sha, size: bytes.length },
          ],
          path: "HAICoMo-0.2.3-arm64.zip",
          sha512: sha,
          releaseDate: new Date().toISOString(),
        }),
      );
    } else if (req.url?.split("?")[0].endsWith(".zip")) {
      downloads++;
      res.writeHead(200, { "Content-Length": bytes.length });
      let start = 0;
      const timer = setInterval(() => {
        res.write(bytes.slice(start, start + 65536));
        start += 65536;
        if (start >= bytes.length) {
          clearInterval(timer);
          res.end();
        }
      }, 25);
      res.on("close", () => clearInterval(timer));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;
  const app = await electron.launch({
    ...(process.env.HAICOMO_PACKAGED_EXECUTABLE
      ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] }
      : { args: ["."] }),
    env: {
      ...process.env,
      HAICOMO_TEST: "1",
      HAICOMO_USER_DATA: path.join(root, "profile"),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page
      .getByLabel("更新源（HTTPS）", { exact: true })
      .fill(`http://127.0.0.1:${port}/`);
    await page.getByRole("button", { name: "检查更新", exact: true }).click();
    await expect(
      page.locator(".update-panel").getByRole("button", { name: "现在更新", exact: true }),
    ).toBeVisible();
    expect(downloads).toBe(0);
    await page.locator(".update-panel").getByRole("button", { name: "现在更新", exact: true }).click();
    await expect(page.getByRole("progressbar")).toBeVisible();
    await expect(
      page.locator(".update-panel").getByRole("button", { name: "重启并安装", exact: true }),
    ).toBeVisible();
    expect(downloads).toBe(1);
    await page.screenshot({ path: "test-results/update-downloaded.png" });
    const result = await page.evaluate(() =>
      window.haicomo.request("updates.install"),
    );
    expect(result).toEqual({
      verified: true,
      installed: false,
      reason: "TEST_MODE",
    });
    // Test-mode install checks the boundary without feeding an unsigned fixture to Squirrel.
    expect(app.windows().length).toBe(1);
  } finally {
    await app.close();
    await new Promise<void>((r) => server.close(() => r()));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
