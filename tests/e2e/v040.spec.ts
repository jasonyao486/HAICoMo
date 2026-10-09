import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createDemo } from "../../scripts/create-demo";
import { defaultSettings } from "../../src/shared/settings";
import { ProjectStore } from "../../src/core/store";
import { publishProposal } from "../../src/core/files";
import { closeTestApp } from "./cleanup";

const version = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

/** Demo project plus searchable decisions: a task, a revision, a meeting and a note mention the same parameter. */
function searchableDemo(directory: string) {
  const entry = createDemo(directory);
  const store = new ProjectStore(directory);
  try {
    const command = (type: string, payload: unknown) => store.command({ id: randomUUID(), type, payload }, "Demo user");
    command("change", { entity: "task", operation: "create", id: "search-task", expectedRevision: null, values: { title: "Configure the uploader", description: "Set the upload timeout to 45 seconds after the review." } });
    command("change", { entity: "note", operation: "create", id: "search-meeting", expectedRevision: null, values: { title: "Release sync", body: "Decision: keep the upload timeout at 45 seconds. 帧率参数固定为 60。", kind: "meeting" } });
    command("change", { entity: "note", operation: "create", id: "search-note", expectedRevision: null, values: { title: "Parameter scratchpad", body: "timeout candidates: 30, 45, 60", kind: "note" } });
    const state = store.state(), task = state.tasks.find((t) => t.id === "search-task")!;
    publishProposal(directory, { protocolVersion: 2, proposalId: "search-proposal", projectId: state.id, epoch: state.epoch, actor: { name: "Demo assistant", family: "chatgpt", harnessId: "codex" },
      title: "Raise the retry budget", reason: "Synthetic proposal for search.", createdAt: new Date().toISOString(), dependsOn: [],
      changes: [{ entity: "task", operation: "update", id: task.id, expectedRevision: task.revision, values: { description: "Retry budget: 7 attempts; upload timeout stays 45 seconds." } }] });
    store.ingest(true);
  } finally { store.close(); }
  return entry;
}

test("0.4.0 project search spans the overview cards, filters four scopes and opens each result", async () => {
  test.setTimeout(180000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-v040-search-")), directory = path.join(root, "Demo");
  const entry = searchableDemo(directory);
  fs.mkdirSync(path.join(root, "profile"));
  fs.writeFileSync(path.join(root, "profile/settings.json"), JSON.stringify({ ...defaultSettings, locale: "zh-CN", userName: "Demo user", theme: "light", reducedMotion: true }));
  const screenshots = path.resolve(process.env.HAICOMO_SCREENSHOT_DIR ?? `validation/${version}/screens`);
  fs.mkdirSync(screenshots, { recursive: true });
  const app = await electron.launch({ ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] } : { args: ["."] }), env: { ...process.env, HAICOMO_TEST: "1", HAICOMO_USER_DATA: path.join(root, "profile"), HAICOMO_TEST_DIRECTORY: directory } });
  const page = await app.firstWindow(), frame = page.locator(".workspace-frame:not([hidden])"), errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const shot = (name: string) => page.screenshot({ path: path.join(screenshots, `${name}.png`) });
  const change = (next: Record<string, unknown>) => page.evaluate(async (next) => { const b = await window.haicomo.request("bootstrap"); await window.haicomo.request("settings.patch", { base: b.settings, next: { ...b.settings, ...next } }); }, next);
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
    await app.evaluate(({ app }, entry) => app.emit("open-file", { preventDefault() {} }, entry), entry);
    await expect(frame.getByRole("heading", { name: "HAICoMo Demo", exact: true })).toBeVisible();
    const search = frame.locator(".project-search"), input = search.getByRole("searchbox", { name: "搜索项目" });
    // Same width as the three overview cards, placed above the task and team sections.
    const widths = async () => [(await search.boundingBox())!, (await frame.locator(".metric-grid").boundingBox())!, (await frame.locator(".overview-grid").boundingBox())!];
    let [bar, cards, grid] = await widths();
    expect(Math.abs(bar.width - cards.width)).toBeLessThan(1);
    expect(Math.abs(bar.x - cards.x)).toBeLessThan(1);
    expect(bar.y).toBeGreaterThan(cards.y + cards.height - 1);
    expect(grid.y).toBeGreaterThan(bar.y + bar.height - 1);
    await expect(search.locator(".search-results")).toHaveCount(0);
    await expect(search.getByRole("button", { name: "所有内容" })).toHaveAttribute("aria-pressed", "true");
    await shot("v040-search-empty");

    await input.fill("timeout 45");
    const groups = search.locator(".search-group h3");
    await expect(groups).toHaveText([/任务/, /修订/, /会议/, /备注/]);
    await expect(search.locator(".search-results mark").first()).toBeVisible();
    await shot("v040-search-all");

    await search.getByRole("button", { name: "会议", exact: true }).click();
    await expect(groups).toHaveText([/会议/]);
    await search.locator(".search-hit").first().click();
    await expect(frame.locator("dialog.modal").getByRole("heading")).toBeVisible();
    await expect(frame.locator("dialog.modal input").first()).toHaveValue("Release sync");
    await page.keyboard.press("Escape");
    await expect(frame.locator("dialog.modal")).toHaveCount(0);

    await search.getByRole("button", { name: "修订", exact: true }).click();
    await expect(groups).toHaveText([/修订/]);
    await expect(search.locator(".search-hit")).toContainText("Raise the retry budget");
    await search.locator(".search-hit").first().click();
    await expect(frame.locator("dialog.modal")).toContainText("Raise the retry budget");
    await page.keyboard.press("Escape");

    await search.getByRole("button", { name: "任务", exact: true }).click();
    await expect(groups).toHaveText([/任务/]);
    await search.locator(".search-hit").first().click();
    await expect(frame.locator("dialog.modal input").first()).toHaveValue("Configure the uploader");
    await page.keyboard.press("Escape");

    // Chinese substring search, empty results and keyboard handling.
    await search.getByRole("button", { name: "所有内容" }).click();
    await input.fill("帧率");
    await expect(groups).toHaveText([/会议/]);
    await input.fill("不存在的参数");
    await expect(search.locator(".search-empty")).toContainText("没有找到匹配的内容");
    await input.press("Escape");
    await expect(input).toHaveValue("");
    await frame.getByRole("heading", { name: "HAICoMo Demo", exact: true }).click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+F" : "Control+F");
    await expect(input).toBeFocused();

    // Narrow window: still aligned with the cards.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 800));
    await input.fill("timeout");
    await page.waitForTimeout(300);
    [bar, cards] = await widths();
    expect(Math.abs(bar.width - cards.width)).toBeLessThan(1);
    await shot("v040-search-narrow");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));

    for (const [locale, theme, label, scope] of [["en-GB", "dark", "Search this project", "Everything"], ["zh-TW", "light", "搜尋專案", "所有內容"], ["en-US", "light", "Search this project", "Everything"]] as const) {
      await change({ locale, theme });
      const localized = search.getByRole("searchbox", { name: label });
      await expect(localized).toBeVisible();
      await expect(search.getByRole("button", { name: scope })).toBeVisible();
      await localized.fill("timeout");
      await expect(search.locator(".search-hit").first()).toBeVisible();
      await shot(`v040-search-${locale}-${theme}`);
    }
    await change({ locale: "zh-CN", theme: "light" });

    // Local agent detection uses the official WorkBuddy icon.
    await frame.getByRole("button", { name: "设置", exact: true }).click();
    await frame.getByRole("button", { name: "检测智能体" }).click();
    const icon = frame.locator('.client-config .client-name img[src$="workbuddy-app.png"]');
    await expect(icon).toHaveCount(1);
    expect(await icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(256);
    await frame.locator('.capability .client-name img[src$="workbuddy-app.png"]').scrollIntoViewIfNeeded();
    await shot("v040-agent-icons");
    await frame.locator(".update-panel").scrollIntoViewIfNeeded();
    await shot("v040-update-panel");
    expect(errors).toEqual([]);
  } finally { await closeTestApp(app); fs.rmSync(root, { recursive: true, force: true }); }
});
