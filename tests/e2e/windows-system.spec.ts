import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../../src/core/store";
import { defaultSettings } from "../../src/shared/settings";
import { fixtureAgent } from "../fixture-agent";
import { closeTestApp, removeTestDirectory } from "./cleanup";
import { launchWindowsTerminal } from "../../src/electron/windows-terminal";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test("Windows manual client discovery, truthful handoff and background tray restoration", async () => {
  test.skip(process.platform !== "win32", "Native Windows shell and tray scenario");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-win-system-"));
  const directory = path.join(root, "项目 with spaces"), profile = path.join(root, "profile");
  fs.mkdirSync(directory); fs.mkdirSync(profile);
  const store = new ProjectStore(directory, "Windows integration");
  store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id: "task", expectedRevision: null, values: { title: "Synthetic handoff", assignees: ["client:cursor"] } } });
  store.close();
  const fake = fixtureAgent(root), appPath = path.join(root, "Programs", "Cursor", "Cursor.exe");
  fs.mkdirSync(path.dirname(appPath), { recursive: true }); fs.writeFileSync(appPath, "fixture: never executed");
  fs.writeFileSync(path.join(profile, "settings.json"), JSON.stringify({ ...defaultSettings, locale: "en-GB", reducedMotion: true, clientPaths: { codex: fake, claude: fake } }));
  const app = await electron.launch({
    ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] } : { args: ["."] }),
    env: { ...process.env, LOCALAPPDATA: root, HAICOMO_TEST: "1", HAICOMO_USER_DATA: profile, HAICOMO_TEST_DIRECTORY: directory },
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ app }, file) => app.emit("open-file", { preventDefault() {} }, file), path.join(directory, "HAICoMo.haicomo"));
    await expect(page.getByRole("heading", { name: "Windows integration", exact: true })).toBeVisible();
    await app.evaluate(({ shell }) => { shell.openPath = async file => { (globalThis as any).__openedClient = file; return ""; }; });
    await page.getByRole("button", { name: "Synthetic handoff", exact: true }).click();
    await page.getByRole("button", { name: "Handoff", exact: true }).click();
    await page.getByLabel("Local client", { exact: true }).selectOption("cursor");
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("p.muted.full")).toContainText("Available");
    await expect(dialog.locator("p.muted.full")).not.toContainText("Not found");
    await expect(dialog.getByRole("button", { name: "Send in background", exact: true })).toBeDisabled();
    await page.getByLabel("Handoff prompt", { exact: true }).fill("Synthetic cursor handoff");
    await page.getByRole("button", { name: "Open client & copy prompt", exact: true }).click();
    await expect(dialog.locator(".notice")).toContainText("Sending is not confirmed");
    expect(await app.evaluate(() => (globalThis as any).__openedClient)).toBe(appPath);
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe("Synthetic cursor handoff");
    await page.screenshot({ path: test.info().outputPath("windows-handoff.png") });

    const binding = await page.evaluate(async () => (await window.haicomo.request("bootstrap")).projects[0].binding);
    const started = await page.evaluate(({ binding }) => window.haicomo.request("providers.start", { binding, provider: "codex", taskId: "task", prompt: "cancel" }), { binding });
    // Keep the real native Tray; only retain a reference so its click handler is testable.
    await app.evaluate(({ Tray }) => {
      const setToolTip = Tray.prototype.setToolTip;
      Tray.prototype.setToolTip = function(text) { (globalThis as any).__verificationTray = this; return setToolTip.call(this, text); };
    });
    await page.evaluate(() => window.haicomo.request("window.confirmClose"));
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => ({ windows: BrowserWindow.getAllWindows().length, tray: Boolean((globalThis as any).__verificationTray && !(globalThis as any).__verificationTray.isDestroyed()) })) ).toEqual({ windows: 0, tray: true });
    const newWindow = app.waitForEvent("window");
    await app.evaluate(() => (globalThis as any).__verificationTray.emit("click"));
    const restored = await newWindow;
    await restored.waitForLoadState("domcontentloaded");
    await expect.poll(() => restored.evaluate(async () => (await window.haicomo.request("providers.background")).runs.length)).toBe(1);
    await app.evaluate(({ app }, file) => app.emit("open-file", { preventDefault() {} }, file), path.join(directory, "HAICoMo.haicomo"));
    await expect(restored.getByRole("heading", { name: "Windows integration", exact: true })).toBeVisible();
    await restored.evaluate(async runId => {
      const binding = (await window.haicomo.request("bootstrap")).projects[0].binding;
      await window.haicomo.request("providers.cancel", { binding, runId });
    }, started.runId);
    await expect.poll(() => restored.evaluate(async () => (await window.haicomo.request("providers.background")).runs.length)).toBe(0);
    await restored.screenshot({ path: test.info().outputPath("windows-tray-restored.png") });
  } finally { await closeTestApp(app); await removeTestDirectory(root); }
});

test("Windows terminal stays alive with its own console for a Unicode project path", async () => {
  test.skip(process.platform !== "win32", "Native PowerShell console scenario");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo terminal 中文 & "));
  const launcher = launchWindowsTerminal(directory);
  let terminalPid: number | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      launcher.once("error", reject);
      launcher.once("exit", code => code === 0 ? resolve() : reject(new Error(`Launch failed: ${code}`)));
    });
    const query = async () => {
      const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Get-CimInstance Win32_Process -Filter "ParentProcessId = ${launcher.pid} AND Name = 'powershell.exe'" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`], { windowsHide: true, timeout: 5000 });
      return stdout.trim() ? JSON.parse(stdout) : null;
    };
    await expect.poll(async () => { terminalPid = (await query())?.ProcessId; return Boolean(terminalPid); }).toBe(true);
    expect((await query())?.CommandLine).toContain("-NoExit");
    await new Promise(resolve => setTimeout(resolve, 1000));
    expect((await query())?.ProcessId).toBe(terminalPid);
  } finally {
    if (terminalPid) { try { process.kill(terminalPid); } catch {} }
    await removeTestDirectory(directory);
  }
});
