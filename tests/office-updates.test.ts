import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  officeLayout,
  reserveSeat,
  route,
  clearSegment,
  blocked,
} from "../src/shared/office";
import { CHARACTERS, frameAt } from "../src/shared/art";
import { UpdateController } from "../src/core/updates";

test("office provides spare exclusive seats, expandable layout and collision-free routes", () => {
  const layout = officeLayout(
    Array.from({ length: 1000 }, (_, i) => String(i)),
    24,
  );
  assert.ok(layout.height > 70000);
  assert.ok(layout.seats.length >= 26);
  assert.equal(layout.seats.length % 2, 0);
  const owners = new Map<number, string>();
  for (let i = 0; i < 24; i++)
    assert.ok(
      reserveSeat(String(i), { x: 100, y: 200 }, layout.seats, owners) >= 0,
    );
  assert.equal(new Set(owners.values()).size, 24);
  assert.equal(owners.size, 24);
  assert.equal(reserveSeat("0", { x: 1000, y: 1000 }, layout.seats, owners), 0);
  const obstacles = [{ id: "desk", x: 200, y: 300, rx: 98, ry: 47 }];
  const start = { x: 50, y: 300 },
    end = { x: 355, y: 300 },
    points = route(start, end, obstacles);
  assert.ok(points.length > 1);
  let previous = start;
  for (const point of points) {
    assert.equal(blocked(point, obstacles), false);
    assert.equal(clearSegment(previous, point, obstacles), true);
    previous = point;
  }
  assert.deepEqual(points.at(-1), end);
  assert.deepEqual(route(start, { x: 200, y: 300 }, obstacles, "desk"), [
    { x: 200, y: 300 },
  ]);
  const far = route({ x: 373, y: 210 }, { x: 373, y: 40000 }, layout.tables);
  assert.ok(far.length);
});
test("animation frame selection uses the manifest rather than a 16-frame constant", () => {
  const manifest = structuredClone(CHARACTERS.chatgpt);
  manifest.rows = 8;
  manifest.motions.hobby.frames = [19, 20, 23, 29];
  assert.equal(frameAt(manifest, "hobby", 1, false), 23);
  assert.equal(frameAt(manifest, "run", 99, true), 8);
});
class Backend extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowDowngrade = true;
  checks = 0;
  downloads = 0;
  installs = 0;
  feed = "";
  setFeedURL(v: { url: string }) {
    this.feed = v.url;
  }
  async checkForUpdates() {
    this.checks++;
    await new Promise((r) => setTimeout(r, 5));
    this.emit("update-available", { version: "0.2.1" });
  }
  async downloadUpdate() {
    this.downloads++;
    this.emit("download-progress", {
      percent: 35,
      transferred: 35,
      total: 100,
    });
    this.emit("update-downloaded", { version: "0.2.1" });
  }
  quitAndInstall() {
    this.installs++;
  }
}
test("updates require configured HTTPS, explicit download and separate explicit install", async () => {
  const backend = new Backend(),
    seen: string[] = [];
  const controller = new UpdateController(
    "0.2.0",
    () => backend,
    (s) => seen.push(s.status),
  );
  assert.equal((await controller.check()).status, "not-configured");
  assert.throws(() => controller.configure("http://example.org"), /HTTPS/);
  controller.configure("https://example.org/releases/");
  assert.equal(backend.autoDownload, false);
  assert.equal(backend.autoInstallOnAppQuit, false);
  assert.equal(backend.allowDowngrade, false);
  await Promise.all([controller.check(), controller.check()]);
  assert.equal(backend.checks, 1);
  assert.equal(backend.downloads, 0);
  assert.throws(() => controller.install(), /NOT_DOWNLOADED/);
  await controller.download();
  assert.ok(seen.includes("downloading"));
  assert.equal(controller.state.percent, 100);
  assert.equal(backend.installs, 0);
  controller.install();
  assert.equal(backend.installs, 1);
  assert.throws(() => controller.configure(""), /UPDATE_BUSY/);
  backend.emit("error", new Error("install failed"));
  controller.configure("");
  backend.emit("error", new Error("old source"));
  assert.equal(controller.state.status, "not-configured");
});
test("update failure is visible and loopback HTTP is limited to explicit test mode", async () => {
  const b = new Backend();
  b.checkForUpdates = async () => {
    throw new Error("offline");
  };
  const c = new UpdateController(
    "0.2.0",
    () => b,
    () => {},
    true,
  );
  c.configure("http://127.0.0.1:9000/");
  assert.equal((await c.check()).status, "error");
  assert.match(c.state.error!, /offline/);
  assert.throws(() => c.configure("http://192.0.2.1/"), /HTTPS/);
  assert.throws(() => c.configure("https://user:pass@example.org/"), /HTTPS/);
});
