import { test, expect, _electron as electron, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readSnapshot, exampleProposal, publishProposal } from "../../src/core/files";
import { ProjectStore } from "../../src/core/store";
import { connectionText } from "../../src/shared/agent-prompt";
import { dictionaries } from "../../src/ui/i18n";
import { fixtureAgent } from "../fixture-agent";
import { defaultSettings } from "../../src/shared/settings";
import { closeTestApp, removeTestDirectory } from "./cleanup";
const current = (page: Page) => page.locator(".workspace-frame:not([hidden])");
const version = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
const launch = (root: string, directory: string, cancel = false) => electron.launch({
  ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] } : { args: ["."] }),
  env: { ...process.env, HAICOMO_TEST: "1", HAICOMO_USER_DATA: path.join(root, "profile"), HAICOMO_TEST_DIRECTORY: directory, HAICOMO_TEST_CANCEL_SAVE: cancel ? "1" : "0" },
});

test("0.3.5 named creation, four-language connection, task proposals, custom handoff and isolated contexts", async () => {
  test.setTimeout(150000);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-onboarding-"))), directory = path.join(root, "Synthetic project");
  fs.mkdirSync(directory); fs.mkdirSync(path.join(root, "profile"));
  const fake = fixtureAgent(root);
  fs.writeFileSync(path.join(root, "profile/settings.json"), JSON.stringify({ ...defaultSettings, codexPath: fake, clientPaths: { codex: fake } }));
  const app = await launch(root, directory), page = await app.firstWindow(), frame = current(page);
  const errors: string[] = []; page.on("pageerror", e => errors.push(String(e)));
  try {
    await frame.getByRole("button", { name: "新建项目", exact: true }).click();
    await frame.getByLabel("项目名称", { exact: true }).fill("rpi5");
    await frame.getByRole("button", { name: "创建", exact: true }).click();
    await expect(frame.getByRole("heading", { name: "rpi5", exact: true })).toBeVisible();
    expect(fs.existsSync(path.join(directory, "rpi5.haicomo"))).toBe(true);
    expect(fs.existsSync(path.join(directory, "HAICoMo.haicomo"))).toBe(false);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 720));
    const screens = path.resolve(process.env.HAICOMO_SCREENSHOT_DIR ?? `validation/${version}/screens`); fs.mkdirSync(screens, { recursive: true });
    for (const locale of ["en-US", "en-GB", "zh-CN", "zh-TW"] as const) for (const theme of ["light", "dark"]) {
      await page.evaluate(async ({ locale, theme }) => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, locale, theme } }); }, { locale, theme });
      const text = connectionText(locale);
      await frame.getByRole("button", { name: text.connect, exact: true }).click();
      const dialog = frame.locator("dialog.modal");
      await expect(dialog.getByLabel(text.preview)).toContainText(text.waiting);
      await dialog.getByRole("button", { name: text.copy, exact: true }).click();
      await expect(dialog.getByRole("status")).toHaveText(dictionaries[locale].copied);
      expect(await app.evaluate(async ({ clipboard }) => await clipboard.readText())).toBe(await dialog.getByLabel(text.preview).inputValue());
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: path.join(screens, `connect-${locale}-${theme}.png`) });
      await dialog.getByRole("button", { name: dictionaries[locale].close, exact: true }).click();
    }
    await page.evaluate(async () => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, locale: "en-GB", theme: "light" } }); });
    // External file protocol -> human approval -> real file -> delivery proposal -> separate acceptance.
    const proposal = exampleProposal(readSnapshot(directory));
    const taskId = proposal.changes[0].id;
    proposal.title = "Synthetic onboarding proposal";
    proposal.changes[0].values = { title: "Synthetic onboarding task", description: "Create an isolated delivery file", handoff: "Preserve this human instruction." };
    publishProposal(directory, proposal);
    await frame.getByRole("button", { name: "Proposals", exact: true }).click();
    await frame.getByText(proposal.title, { exact: true }).click();
    await frame.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(frame.locator("dialog.modal")).toHaveCount(0);
    await frame.getByRole("button", { name: "Connect an agent", exact: true }).click();
    const dialog = frame.locator("dialog.modal");
    await dialog.getByLabel("Task (optional)").selectOption(taskId);
    await expect(dialog.getByLabel("Connection instructions")).toContainText(taskId);
    await expect(dialog.getByLabel("Connection instructions")).toContainText("Create an isolated delivery file");
    await dialog.getByRole("button", { name: "Copy connection instructions" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Copied");
    expect(await app.evaluate(async ({ clipboard }) => await clipboard.readText())).toContain(taskId);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    for (const locale of ["en-US", "en-GB", "zh-CN", "zh-TW"] as const) {
      await page.evaluate(async locale => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, locale } }); }, locale);
      const text = connectionText(locale);
      await frame.getByRole("button", { name: text.connect, exact: true }).click();
      await dialog.getByLabel(text.scope).selectOption(taskId);
      await expect(dialog.getByLabel(text.preview)).toContainText(taskId);
      await expect(dialog.getByLabel(text.preview)).toContainText(text.task);
      await dialog.getByRole("button", { name: text.copy, exact: true }).click();
      await expect(dialog.getByRole("status")).toHaveText(dictionaries[locale].copied);
      expect(await app.evaluate(async ({ clipboard }) => await clipboard.readText())).toBe(await dialog.getByLabel(text.preview).inputValue());
      await dialog.getByRole("button", { name: dictionaries[locale].close, exact: true }).click();
    }
    await page.evaluate(async () => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, locale: "en-GB" } }); });
    fs.writeFileSync(path.join(directory, "delivery.txt"), "Synthetic delivery.\n");
    const delivery = exampleProposal(readSnapshot(directory)); delivery.title = "Register synthetic delivery";
    delivery.changes = [{ entity: "task", operation: "update", id: taskId, expectedRevision: readSnapshot(directory).tasks[0].revision, values: { status: "delivered", artifacts: [{ id: "delivery", label: "Delivery", path: "delivery.txt" }] } }];
    publishProposal(directory, delivery);
    await frame.getByText(delivery.title, { exact: true }).click();
    await frame.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(frame.locator("dialog.modal")).toHaveCount(0);
    expect(readSnapshot(directory).tasks[0].acceptedAt).toBeNull();
    await frame.locator(".sidebar nav").getByTitle("Task list", { exact: true }).click();
    await frame.getByRole("button", { name: "Synthetic onboarding task", exact: true }).click();
    await frame.getByRole("button", { name: "Accept delivery", exact: true }).click();
    await expect(frame.locator("dialog.modal")).toHaveCount(0);
    await frame.getByRole("button", { name: "Synthetic onboarding task", exact: true }).click();
    await frame.locator("dialog.modal").getByRole("button", { name: "Handoff", exact: true }).click();
    const handoff = frame.locator("dialog.modal");
    await handoff.getByLabel("Custom handoff content").fill("Updated human content.");
    await handoff.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect.poll(() => readSnapshot(directory).tasks[0].handoff).toBe("Updated human content.");
    const preview = await handoff.getByLabel("Connection instructions").inputValue();
    expect(preview).toContain("agent-guide.md"); expect(preview).toContain("delivery.txt");
    await handoff.getByRole("button", { name: "Copy prompt", exact: true }).click();
    await expect(handoff.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
    expect(await app.evaluate(async ({ clipboard }) => await clipboard.readText())).toBe(preview);
    await handoff.getByRole("button", { name: "Close", exact: true }).click();
    await frame.getByRole("button", { name: "Synthetic onboarding task", exact: true }).click();
    await frame.locator("dialog.modal").getByRole("button", { name: "Handoff", exact: true }).click();
    await expect(handoff.getByLabel("Custom handoff content")).toHaveValue("Updated human content.");
    expect(await handoff.getByLabel("Connection instructions").inputValue()).toBe(preview);
    await handoff.getByRole("button", { name: "Close", exact: true }).click();
    const other = path.join(root, "Other synthetic project"); fs.mkdirSync(other); new ProjectStore(other, "Other project").close();
    await app.evaluate(({ app }, file) => app.emit("open-file", { preventDefault() {} }, file), path.join(other, "HAICoMo.haicomo"));
    await expect(frame.getByRole("heading", { name: "Other project", exact: true })).toBeVisible();
    await frame.getByRole("button", { name: "Connect an agent", exact: true }).click();
    await expect(dialog.getByLabel("Connection instructions")).toContainText(JSON.stringify(other));
    expect(await dialog.getByLabel("Connection instructions").inputValue()).not.toContain(JSON.stringify(directory));
    fs.writeFileSync(path.join(other, ".haicomo/agent-guide.md"), "Custom guide must survive.");
    await dialog.getByRole("button", { name: "Copy connection instructions" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Original files were preserved");
    expect(fs.readFileSync(path.join(other, ".haicomo/agent-guide.md"), "utf8")).toBe("Custom guide must survive.");
    expect(errors).toEqual([]);
  } finally { await closeTestApp(app); await removeTestDirectory(root); }
});

test("0.3.5 cancelled save and invalid title create no project data", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-cancel-create-")), directory = path.join(root, "empty"); fs.mkdirSync(directory);
  const app = await launch(root, directory, true), page = await app.firstWindow();
  try {
    expect(await page.evaluate(() => window.haicomo.request("project.create", { title: "Cancelled project" }))).toBeNull();
    expect(await page.evaluate(() => window.haicomo.request("project.create", { title: "   " }).then(() => false, () => true))).toBe(true);
    expect(fs.readdirSync(directory)).toEqual([]);
  } finally { await closeTestApp(app); await removeTestDirectory(root); }
});

test("0.3.5 handoff drafts cannot overwrite another window's newer task revision", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-handoff-conflict-")), directory = path.join(root, "project"); fs.mkdirSync(directory);
  const store = new ProjectStore(directory, "Conflict sample");
  store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id: "conflict-task", expectedRevision: null, values: { title: "Conflict task", handoff: "Original content" } } });
  store.close();
  const app = await launch(root, directory), page = await app.firstWindow(), frame = current(page);
  try {
    await app.evaluate(({ app }, file) => app.emit("open-file", { preventDefault() {} }, file), path.join(directory, "HAICoMo.haicomo"));
    await frame.getByRole("button", { name: "Conflict task", exact: true }).click();
    await frame.locator("dialog.modal").getByRole("button", { name: "交接", exact: true }).click();
    const dialog = frame.locator("dialog.modal");
    await dialog.getByLabel("自定义交接内容").fill("Draft based on the old revision");
    await page.evaluate(async () => {
      const b = await window.haicomo.request("bootstrap"), binding = b.projects[0].binding;
      const w = await window.haicomo.request("project.view", { binding });
      await window.haicomo.request("project.command", { binding, id: crypto.randomUUID(), type: "change", payload: { entity: "task", operation: "update", id: "conflict-task", expectedRevision: w.state.tasks[0].revision, values: { handoff: "New content from the other window", description: "New task context from another window" } } });
    });
    // Let the UI observe the newer task, proving it cannot silently adopt that
    // revision number for a draft written against the previous one.
    await expect(dialog.getByLabel("接入说明")).toContainText("New task context from another window");
    await dialog.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(dialog.locator(".error-box")).toContainText(dictionaries["zh-CN"].errRevisionConflict);
    expect(readSnapshot(directory).tasks[0].handoff).toBe("New content from the other window");
    await expect(dialog.getByLabel("自定义交接内容")).toHaveValue("Draft based on the old revision");
  } finally { await closeTestApp(app); await removeTestDirectory(root); }
});
