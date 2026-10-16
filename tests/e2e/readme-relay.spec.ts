import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDemo } from "../../scripts/create-demo";
import { defaultSettings } from "../../src/shared/settings";
import { fixtureAgent } from "../fixture-agent";
import { dictionaries } from "../../src/ui/i18n";
import { ProjectStore } from "../../src/core/store";

test("README synthetic relay: Claude working, ChatGPT seated and waiting", async () => {
  test.setTimeout(90000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-readme-relay-"));
  const directory = path.join(root, "Demo"), profile = path.join(root, "profile");
  const entry = createDemo(directory), fake = fixtureAgent(root);
  fs.mkdirSync(profile);
  fs.writeFileSync(path.join(profile, "settings.json"), JSON.stringify({ ...defaultSettings,
    locale: "en-GB", userName: "Demo user", theme: "light", enhanced: true, reducedMotion: true,
    clientPaths: { codex: fake, claude: fake },
  }));
  const app = await electron.launch({ ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] } : { args: ["."] }), env: { ...process.env, HAICOMO_TEST: "1", HAICOMO_USER_DATA: profile, HAICOMO_TEST_DIRECTORY: directory } });
  try {
    const page = await app.firstWindow(), frame = page.locator(".workspace-frame:not([hidden])"), errors: string[] = [];
    page.on("pageerror", e => errors.push(String(e)));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
    await app.evaluate(({ app }, entry) => app.emit("open-file", { preventDefault() {} }, entry), entry);
    await expect(frame.getByRole("heading", { name: "HAICoMo Demo", exact: true })).toBeVisible();
    const runId = await page.evaluate(async () => {
      const binding = (await window.haicomo.request("bootstrap")).projects[0].binding;
      const w = await window.haicomo.request("project.view", { binding });
      for (const r of w.state.relays) await window.haicomo.request("project.command", { binding, id: crypto.randomUUID(), type: "relay.delete", payload: { relayId: r.id, expectedRevision: r.revision } });
      const run = await window.haicomo.request("providers.start", { binding, provider: "claude", taskId: "demo-task-3-1", model: "claude-sonnet-4-6", prompt: "readme-relay-hold" });
      await window.haicomo.request("project.command", { binding, id: crypto.randomUUID(), type: "relay.create", payload: { enabled: false, values: {
        title: "Synthetic demo: Claude working, ChatGPT waiting", afterSessionId: run.runId, trigger: { kind: "delay", ms: 60000 },
        stages: [{ steps: [{ provider: "codex", model: "gpt-6-astra", taskId: "demo-task-3-1", referenceTaskId: "demo-task-2", prompt: "Synthetic demonstration only. This paused relay never starts a model account." }] }],
      } } });
      return run.runId;
    });
    await frame.locator(".sidebar nav").getByTitle(dictionaries["en-GB"].relay, { exact: true }).click();
    // The table exposes the observed runner state before switching to the scene.
    await expect(frame.locator(".relay-card .relay-flow-start")).toContainText(dictionaries["en-GB"].running);
    await frame.getByRole("button", { name: dictionaries["en-GB"].relayVisualView, exact: true }).click();
    await expect(frame.locator(".relay-row.visual")).toHaveAttribute("data-status", "paused");
    await expect(frame.locator(".relay-row.visual")).toHaveAttribute("data-pose", "sit");
    const worker = frame.locator(".workstation.enhanced .relay-actor"), waiting = frame.locator(".sofa.enhanced .relay-actor.seated");
    await expect(worker).toHaveAttribute("title", "Claude");
    await expect(waiting).toHaveAttribute("title", /^A1 · ChatGPT · /);
    await expect(worker.locator(".figure-atlas img")).toHaveAttribute("src", /claude-atlas.png$/);
    await expect(waiting.locator(".figure-atlas img")).toHaveAttribute("src", /chatgpt-atlas.png$/);
    await expect.poll(() => page.evaluate(() => [...document.images].filter(i => !i.complete || !i.naturalWidth).length)).toBe(0);
    for (const [actor, scene] of [[worker, frame.locator(".workstation")], [waiting, frame.locator(".sofa")]] as const) {
      const a = (await actor.boundingBox())!, s = (await scene.boundingBox())!;
      expect(a.x).toBeGreaterThanOrEqual(s.x); expect(a.x + a.width).toBeLessThanOrEqual(s.x + s.width);
    }
    const screenshots = path.resolve(process.env.HAICOMO_SCREENSHOT_DIR ?? "validation/0.3.3/screens");
    fs.mkdirSync(screenshots, { recursive: true });
    await page.screenshot({ path: path.join(screenshots, "relay-claude-chatgpt.png") });
    await page.evaluate(async runId => {
      const binding = (await window.haicomo.request("bootstrap")).projects[0].binding;
      await window.haicomo.request("providers.cancel", { binding, runId });
    }, runId);
    expect(errors).toEqual([]);
  } finally { await app.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test("README 0.5.0 relay: three stages of mixed agents, stage A at the desk, B and C on sofas", async () => {
  test.setTimeout(120000);
  const en = dictionaries["en-GB"];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-readme-050-"));
  const directory = path.join(root, "Demo"), profile = path.join(root, "profile");
  const entry = createDemo(directory), agent = fixtureAgent(root), gemini = fixtureAgent(root, "gemini");
  const dsh = fixtureAgent(root, "dsh"), kimi = fixtureAgent(root, "kimi"), qwen = fixtureAgent(root, "qwen");
  // Eight synthetic tasks without prerequisites, one per relay step.
  const titles = ["Draft the API notes", "Sketch the settings screen", "Write test cases", "Review the API notes", "Check accessibility", "Integrate the screens", "Prepare release notes", "Final review"];
  const store = new ProjectStore(directory);
  const relayTasks = titles.map(title => {
    const id = `relay-demo-${title.toLowerCase().replace(/\W+/g, "-")}`;
    store.command({ id: crypto.randomUUID(), type: "change", payload: { entity: "task", operation: "create", id, expectedRevision: null, values: { title, description: "Synthetic demonstration only." } } }, "Demo user");
    return id;
  });
  store.close();
  fs.mkdirSync(profile);
  fs.writeFileSync(path.join(profile, "settings.json"), JSON.stringify({ ...defaultSettings,
    locale: "en-GB", userName: "Demo user", theme: "light", enhanced: true, reducedMotion: true,
    // Every client in the relay is a fixture, so nothing depends on what this computer has installed.
    clientPaths: { codex: agent, claude: agent, "gemini-cli": gemini, "deepseek-harness": dsh, "kimi-code": kimi, "qwen-code": qwen },
  }));
  const app = await electron.launch({ ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] } : { args: ["."] }), env: { ...process.env, HAICOMO_TEST: "1", HAICOMO_USER_DATA: profile, HAICOMO_TEST_DIRECTORY: directory } });
  const page = await app.firstWindow(), frame = page.locator(".workspace-frame:not([hidden])"), errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  const screenshots = path.resolve(process.env.HAICOMO_SCREENSHOT_DIR ?? "validation/0.5.0/readme");
  fs.mkdirSync(screenshots, { recursive: true });
  // Synthetic only: every model id below names a character family; only the stage-A fixtures run, and they never call a model.
  const hold = "Synthetic demonstration only.\nreadme-relay-hold";
  const stages = [
    [["claude", "claude-sonnet-4-6"], ["codex", "gpt-5.5"], ["gemini-cli", "gemini-2.5-pro"]],
    [["deepseek-harness", "deepseek-flash"], ["kimi-code", "kimi-k2"], ["qwen-code", "qwen3-coder"]],
    [["claude", "claude-opus-4-1"], ["codex", "gpt-5.5"]],
  ].map((steps, s) => ({ steps: steps.map(([provider, model], i) => ({ provider, model, taskId: relayTasks[s * 3 + i], prompt: hold })) }));
  const create = (enabled: boolean, title: string) => page.evaluate(async ({ stages, enabled, title }) => {
    const binding = (await window.haicomo.request("bootstrap")).projects[0].binding;
    await window.haicomo.request("project.command", { binding, id: crypto.randomUUID(), type: "relay.create", payload: { enabled, values: {
      title, trigger: { kind: "delay", ms: 1000 }, autonomy: { enabled: true, consentedAt: new Date().toISOString() }, stages,
    } } });
  }, { stages, enabled, title });
  const clearRelays = () => page.evaluate(async () => {
    const binding = (await window.haicomo.request("bootstrap")).projects[0].binding;
    const w = await window.haicomo.request("project.view", { binding });
    for (const r of w.state.relays) await window.haicomo.request("project.command", { binding, id: crypto.randomUUID(), type: "relay.delete", payload: { relayId: r.id, expectedRevision: r.revision } });
  });
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
    await app.evaluate(({ app }, entry) => app.emit("open-file", { preventDefault() {} }, entry), entry);
    await expect(frame.getByRole("heading", { name: "HAICoMo Demo", exact: true })).toBeVisible();
    await clearRelays();
    await frame.locator(".sidebar nav").getByTitle(en.relay, { exact: true }).click();
    await frame.getByRole("button", { name: en.relayTextView, exact: true }).click();

    // The editor shows all three stages side by side (a paused copy, deleted afterwards).
    await create(false, "Synthetic demo: three-stage relay");
    await frame.locator(".relay-card").first().getByRole("button", { name: en.relayEdit }).click();
    const dialog = frame.locator("dialog.modal");
    await expect(dialog.locator(".relay-flow-edit .relay-flow-node")).toHaveCount(8);
    const stageTops = await dialog.locator(".relay-flow-edit > .relay-flow-stage:not(.relay-flow-add)").evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(stageTops).size).toBe(1);
    // The editor re-checks the clients when it opens; wait until the unattended options are known.
    await expect(dialog.locator(`select[aria-label="${en.relayMode}"]`)).not.toContainText(en.relayAutonomyNoFlag, { timeout: 30000 });
    await dialog.locator(".relay-flow-edit").evaluate(e => e.scrollIntoView({ block: "start" }));
    await expect.poll(() => page.evaluate(() => [...document.images].filter(i => !i.complete || !i.naturalWidth).length)).toBe(0);
    await page.screenshot({ path: path.join(screenshots, "relay-editor.png") });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await clearRelays();

    // Running: stage A's three agents work at the desk; B and C wait on one sofa each.
    await create(true, "Synthetic demo: three-stage relay");
    const card = frame.locator(".relay-card[data-relay-id]").first();
    await expect(card).toHaveAttribute("data-status", "running", { timeout: 30000 });
    await expect(card.locator(".relay-flow-stage[data-stage-state=current] .relay-flow-node[data-step-state=running]")).toHaveCount(3, { timeout: 20000 });
    await expect(card.locator(".relay-step-warning")).toHaveCount(0);
    await page.screenshot({ path: path.join(screenshots, "relay-flow.png") });
    await frame.getByRole("button", { name: en.relayVisualView, exact: true }).click();
    const row = frame.locator(".relay-row.visual").first();
    await expect(row.locator(".relay-scene.workstation .relay-actor")).toHaveCount(3);
    await expect(row.locator(".relay-scene.sofa[data-stage=B] .relay-actor.seated")).toHaveCount(3);
    await expect(row.locator(".relay-scene.sofa[data-stage=C] .relay-actor.seated")).toHaveCount(2);
    for (const [label, atlas] of [["A1", "claude"], ["A2", "chatgpt"], ["A3", "gemini"], ["B1", "deepseek"], ["B2", "kimi"], ["B3", "qwen"]] as const)
      await expect(row.locator(`.relay-actor[data-step-label=${label}] .figure-atlas img`)).toHaveAttribute("src", new RegExp(`${atlas}-atlas.png$`));
    // Reduced motion: the three workers stand at their own seats without overlapping.
    const desk = await row.locator(".relay-scene.workstation .relay-actor").evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; }));
    for (let i = 1; i < desk.length; i++) expect(desk[i][0]).toBeGreaterThanOrEqual(desk[i - 1][1] - 2);
    await expect.poll(() => page.evaluate(() => [...document.images].filter(i => !i.complete || !i.naturalWidth).length)).toBe(0);
    await page.screenshot({ path: path.join(screenshots, "relay-three-stages-enhanced.png") });
    await page.evaluate(async () => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, enhanced: false } }); });
    await expect(row.locator(".relay-scene.workstation.enhanced")).toHaveCount(0);
    await page.screenshot({ path: path.join(screenshots, "relay-three-stages-default.png") });
    await page.evaluate(async () => {
      const binding = (await window.haicomo.request("bootstrap")).projects[0].binding;
      for (const run of await window.haicomo.request("providers.active", { binding })) await window.haicomo.request("providers.cancel", { binding, runId: run.runId });
    });
    await expect.poll(() => page.evaluate(async () => (await window.haicomo.request("providers.background")).runs.length), { timeout: 15000 }).toBe(0);
    await expect(row).toHaveAttribute("data-status", "blocked", { timeout: 20000 });
    await clearRelays();
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(async () => {
      const binding = (await window.haicomo.request("bootstrap")).projects[0]?.binding;
      if (binding) for (const run of await window.haicomo.request("providers.active", { binding })) await window.haicomo.request("providers.cancel", { binding, runId: run.runId });
    }).catch(() => {});
    // A relay that is still in progress turns quitting into a confirmation.
    await clearRelays().catch(() => {});
    const child = app.process();
    await Promise.race([app.close(), new Promise(resolve => setTimeout(resolve, 15000))]);
    if (child.exitCode === null && child.signalCode === null) child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
