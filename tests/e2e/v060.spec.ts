import { fixtureAgent } from "../fixture-agent";
import { test, expect, _electron as electron, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../../src/core/store";
import { readSnapshot } from "../../src/core/files";
import { defaultSettings } from "../../src/shared/settings";
import { dictionaries } from "../../src/ui/i18n";
import { CLIENTS_BY_NAME } from "../../src/shared/clients";
import type { RunEvent } from "../../src/shared/domain";
import { removeTestDirectory } from "./cleanup";

const current = (page: Page) => page.locator(".workspace-frame:not([hidden])");
const LOCALES = ["zh-CN", "zh-TW", "en-GB", "en-US"] as const;
const TEXT = {
  "zh-CN": { project: "说明文档", task: "撰写安装说明", record: ["目标: 写出安装说明", "产物: docs/install.md; docs/missing.md", "证据: 按步骤在全新账户里装了一遍", "下一步: 审阅措辞", "未决问题: Windows 截图待补"], comment: "补上 Windows 的安装步骤，并附截图。" },
  "zh-TW": { project: "說明文件", task: "撰寫安裝說明", record: ["目標: 寫出安裝說明", "產物: docs/install.md; docs/missing.md", "證據: 依步驟在全新帳戶裡裝了一遍", "下一步: 審閱措辭", "未決問題: Windows 截圖待補"], comment: "補上 Windows 的安裝步驟，並附截圖。" },
  "en-GB": { project: "Guides", task: "Write the install guide", record: ["goal: Write the install guide", "artifacts: docs/install.md; docs/missing.md", "evidence: Followed the steps on a fresh account", "next: Review the wording", "open: Windows screenshots still to add"], comment: "Add the Windows steps, with screenshots." },
  "en-US": { project: "Guides", task: "Write the install guide", record: ["goal: Write the install guide", "artifacts: docs/install.md; docs/missing.md", "evidence: Followed the steps on a fresh account", "next: Review the wording", "open: Windows screenshots still to add"], comment: "Add the Windows steps, with screenshots." },
} as const;

for (const locale of LOCALES)
test(`0.6.0 (${locale}): A–Z agents with channels, sidebar spacing, delivery record, return with comments, relay working copies`, async () => {
  test.setTimeout(180000);
  const t = dictionaries[locale], text = TEXT[locale];
  const functional = locale === "zh-CN";
  const shots = path.resolve(process.env.HAICOMO_MANUAL_IMAGES ? `docs/images/0.6.0/${locale}` : `validation/0.6.0/screens/${locale}`);
  fs.mkdirSync(shots, { recursive: true });
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-v060-")));
  // The project lives inside a git repository, so relays offer separate working copies.
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  git("init", "-q", "-b", "main");
  const dir = path.join(repo, text.project);
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "docs", "install.md"), "# Install\n");
  const store = new ProjectStore(dir, text.project);
  const taskId = randomUUID(), second = randomUUID();
  store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id: taskId, expectedRevision: null, values: { title: text.task, status: "delivered", assignees: ["client:codex"] } } });
  store.command({ id: randomUUID(), type: "change", payload: { entity: "task", operation: "create", id: second, expectedRevision: null, values: { title: `${text.task} 2` } } });
  const at = new Date().toISOString();
  const message = [text.task, "HAICOMO-HANDOFF-BEGIN", ...text.record, "HAICOMO-HANDOFF-END"].join("\n");
  store.recordEvent({ id: randomUUID(), sessionId: randomUUID(), family: null, provider: "codex", harnessId: "codex", model: "gpt-fixture", taskIds: [taskId], status: "idle", source: "runner", at, endedAt: at, message, lifecycle: "history", endReason: "completed", threadId: "thread-fixture", instanceId: "test" } as RunEvent);
  store.close();
  const codex = fixtureAgent(root), kimi = fixtureAgent(root, "kimiacp");
  fs.mkdirSync(path.join(root, "profile"), { recursive: true });
  fs.writeFileSync(path.join(root, "profile/settings.json"), JSON.stringify({ ...defaultSettings, locale, theme: "light", reducedMotion: true, codexPath: codex, clientPaths: { codex, "kimi-code": kimi } }));
  const app = await electron.launch({
    ...(process.env.HAICOMO_PACKAGED_EXECUTABLE ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] } : { args: ["."] }),
    env: { ...process.env, HAICOMO_TEST: "1", HAICOMO_USER_DATA: path.join(root, "profile"), HAICOMO_TEST_DIRECTORY: dir },
  });
  const page = await app.firstWindow(), frame = current(page);
  // Toasts from saving settings or tasks are closed before each manual screenshot.
  const shot = async (name: string) => {
    for (const close of await page.locator(".toast button").all()) await close.click().catch(() => {});
    await page.screenshot({ path: path.join(shots, name) });
  };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
    await app.evaluate(({ app }, file) => app.emit("open-file", { preventDefault() {} }, file), path.join(dir, "HAICoMo.haicomo"));
    // A cold packaged start on a Windows runner can take more than 5 s to open the project.
    await expect(frame.getByRole("heading", { name: text.project, exact: true })).toBeVisible({ timeout: 30000 });

    // Sidebar: Relay → Timeline now has the same gap as Mind map → Collaboration office.
    const nav = frame.locator(".sidebar nav");
    const box = async (label: string) => (await nav.getByTitle(label, { exact: true }).boundingBox())!;
    const [relay, timeline, mindmap, office] = [await box(t.relay), await box(t.timeline), await box(t.mindmap), await box(t.office)];
    const gapA = timeline.y - (relay.y + relay.height), gapB = office.y - (mindmap.y + mindmap.height);
    expect(Math.abs(gapA - gapB)).toBeLessThanOrEqual(1);
    expect(gapA).toBeGreaterThan(10);
    await frame.locator(".sidebar").screenshot({ path: path.join(shots, "sidebar.png") });

    // Settings → Local agents: A–Z, Hermes listed, Kimi on the ACP channel.
    await frame.getByRole("button", { name: t.settings, exact: true }).click();
    const agents = frame.locator(".client-list");
    await expect(agents.locator(".client-config")).toHaveCount(CLIENTS_BY_NAME.length);
    expect(await agents.locator(".client-config").evaluateAll((els) => els.map((e) => e.getAttribute("data-client")))).toEqual(CLIENTS_BY_NAME.map((c) => c.id));
    await frame.getByRole("button", { name: t.detect }).click();
    const kimiRow = agents.locator('.client-config[data-client="kimi-code"]');
    await expect(kimiRow.locator('.client-channel[data-channel="acp"]')).toContainText(t.channelAcp, { timeout: 30000 });
    await kimiRow.scrollIntoViewIfNeeded();
    await shot("settings-agents-channel.png");

    // Delivery record on the task, with the reported paths checked.
    await nav.getByTitle(t.taskList, { exact: true }).click();
    await frame.getByRole("button", { name: text.task, exact: true }).click();
    const modal = frame.locator("dialog.modal");
    const record = modal.locator(".delivery-record");
    await expect(record.getByText(t.recordTitle, { exact: true })).toBeVisible();
    await expect(record.locator("li", { hasText: "docs/missing.md" }).getByText(t.recordMissing, { exact: true })).toBeVisible();
    await record.scrollIntoViewIfNeeded();
    await shot("delivery-record.png");
    if (functional) {
      await record.locator("li", { hasText: "docs/install.md" }).getByRole("button", { name: t.recordAddArtifact }).click();
      await expect(record.locator("li", { hasText: "docs/install.md" }).getByText(t.recordAdded, { exact: true })).toBeVisible();
      await modal.getByRole("button", { name: t.save, exact: true }).last().click();
      await expect(modal).toHaveCount(0);
      expect(readSnapshot(dir).tasks.find((x: any) => x.id === taskId)!.artifacts.map((a: any) => a.path)).toEqual(["docs/install.md"]);
      await frame.getByRole("button", { name: text.task, exact: true }).click();
    }

    // Request changes: comments are required; the original agent continues its session.
    await modal.getByRole("button", { name: t.returnWork, exact: true }).click();
    const back = frame.locator("dialog.modal");
    await expect(back.getByRole("heading")).toContainText(t.returnTitle);
    await expect(back.getByRole("radio").first()).toBeChecked();
    await expect(back.getByText(t.returnContinue)).toBeVisible({ timeout: 30000 });
    if (functional) {
      await back.getByRole("button", { name: t.returnSend, exact: true }).click();
      await expect(back.locator(".error-box")).toHaveText(t.returnCommentHint);
    }
    await back.getByLabel(t.returnComment).fill(text.comment);
    await expect(back.getByLabel(t.returnPreview)).toHaveValue(new RegExp(text.comment));
    await shot("return-original.png");
    await back.getByRole("radio").nth(1).check();
    const options = await back.getByLabel(t.provider).locator("option").allTextContents();
    expect(options).toEqual(CLIENTS_BY_NAME.map((c) => c.name));
    await shot("return-other.png");
    await back.getByRole("radio").first().check();
    await back.getByRole("button", { name: t.returnSend, exact: true }).click();
    await expect(back).toHaveCount(0, { timeout: 30000 });
    const requests = () => fs.readFileSync(path.join(root, "requests.jsonl"), "utf8");
    await expect.poll(() => (fs.existsSync(path.join(root, "requests.jsonl")) ? requests() : "")).toContain("thread/resume");
    const turn = requests().split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((m) => m.method === "turn/start");
    expect(turn.params.input[0].text).toContain(text.comment);
    expect(turn.params.input[0].text).toContain(dictionaries[locale] && (locale.startsWith("zh") ? (locale === "zh-CN" ? "验收退回" : "驗收退回") : "Returned at acceptance review"));
    const snapshot = readSnapshot(dir);
    expect(snapshot.tasks.find((x: any) => x.id === taskId)!.status).toBe("doing");

    // Relay editor: in a git project new relays default to separate working copies.
    await nav.getByTitle(t.relay, { exact: true }).click();
    await frame.getByRole("button", { name: t.relayNew, exact: true }).first().click();
    const editor = frame.locator("dialog.modal");
    const toggle = editor.getByRole("checkbox", { name: t.relayWorktree, exact: true });
    await expect(toggle).toBeChecked({ timeout: 20000 });
    await expect(editor.getByText(t.relayWorktreeHint)).toBeVisible();
    await editor.locator(".relay-worktrees").scrollIntoViewIfNeeded();
    await shot("relay-worktrees.png");
    if (functional) expect(await page.evaluate(async () => { const b = (await window.haicomo.request("bootstrap")).projects[0].binding; return window.haicomo.request("project.git", { binding: b }); })).toEqual({ repo: true });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await removeTestDirectory(root);
  }
});
