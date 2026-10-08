import { fixtureAgent } from "../fixture-agent";
import { closeTestApp, removeTestDirectory } from "./cleanup";
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../../src/core/store";
import {
  readSnapshot,
  resolveEntry,
  exampleProposal,
  publishProposal,
} from "../../src/core/files";

test.use({ actionTimeout: 10000 });
const current = (page: Page) => page.locator(".workspace-frame:not([hidden])");
async function emitOpen(app: ElectronApplication, file: string) {
  await app.evaluate(
    ({ app }, file) => app.emit("open-file", { preventDefault() {} }, file),
    file,
  );
}
async function choose(page: Page, title: string) {
  const frame = current(page);
  await frame.getByRole("button", { name: "切换项目标签" }).click();
  await frame
    .getByRole("menuitem")
    .filter({ has: page.locator("span", { hasText: title }) })
    .first()
    .click();
}
async function closeTab(page: Page) {
  const frame = current(page);
  await frame.getByRole("button", { name: "切换项目标签" }).click();
  await frame.getByRole("menuitem", { name: "关闭当前标签" }).click();
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-tabs-"));
  const dirs = ["Alpha", "Beta", "Gamma"].map((name) => {
    const dir = path.join(root, name + " 中文 空格");
    fs.mkdirSync(dir);
    const s = new ProjectStore(dir, name);
    s.command({
      id: randomUUID(),
      type: "change",
      payload: {
        entity: "task",
        operation: "create",
        id: "task",
        expectedRevision: null,
        values: {
          title: name + " task",
          assignees: ["claude"],
          status: "todo",
        },
      },
    });
    s.close();
    return dir;
  });
  const fake = fixtureAgent(root);
  return { root, dirs, fake };
}
async function launch(root: string, directory: string) {
  return electron.launch({
    ...(process.env.HAICOMO_PACKAGED_EXECUTABLE
      ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] }
      : { args: ["."] }),
    env: {
      ...process.env,
      HAICOMO_TEST: "1",
      HAICOMO_USER_DATA: path.join(root, "profile"),
      HAICOMO_TEST_DIRECTORY: directory,
    },
  });
}
async function binding(page: Page, dir: string) {
  return page.evaluate(
    async (dir) =>
      (await window.haicomo.request("bootstrap")).projects.find(
        (p: any) =>
          p.directory === dir ||
          p.directory === dir.replace("/var/", "/private/var/"),
      ).binding,
    dir,
  );
}

test("single window tabs retain drafts, route background permissions and keep clipboard feedback truthful", async () => {
  const { root, dirs, fake } = fixture(),
    app = await launch(root, dirs[0]),
    page = await app.firstWindow(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    // At the minimum supported window size the editor overlaps the menu footprint.
    // Switching must remain clickable and retain drafts without force-clicking.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setSize(1000, 720);
    });
    for (const dir of dirs) {
      await emitOpen(app, path.join(dir, "HAICoMo.haicomo"));
      await expect(
        current(page).getByRole("heading", {
          name: path.basename(dir).split(" ")[0],
          exact: true,
        }),
      ).toBeVisible();
    }
    expect(app.windows()).toHaveLength(1);
    await emitOpen(app, path.join(dirs[0], "HAICoMo.haicomo"));
    await expect(
      current(page).getByRole("heading", { name: "Alpha", exact: true }),
    ).toBeVisible();
    expect(
      (await page.evaluate(() => window.haicomo.request("bootstrap"))).projects,
    ).toHaveLength(3);
    await current(page)
      .getByRole("button", { name: "Alpha task", exact: true })
      .click();
    await current(page)
      .getByLabel("标题", { exact: true })
      .fill("Unsaved Alpha");
    await choose(page, "Beta");
    await expect(
      current(page).getByRole("heading", { name: "Beta", exact: true }),
    ).toBeVisible();
    await choose(page, "Alpha");
    await expect(current(page).getByLabel("标题", { exact: true })).toHaveValue(
      "Unsaved Alpha",
    );
    await closeTab(page);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "取消", exact: true })
      .click();
    await expect(current(page).getByLabel("标题", { exact: true })).toHaveValue(
      "Unsaved Alpha",
    );
    await closeTab(page);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "保存修改", exact: true })
      .click();
    await expect
      .poll(() => readSnapshot(dirs[0]).tasks[0].title)
      .toBe("Unsaved Alpha");
    await emitOpen(app, path.join(dirs[0], "HAICoMo.haicomo"));
    await expect(
      current(page).getByRole("heading", { name: "Alpha", exact: true }),
    ).toBeVisible();
    const a = await binding(page, dirs[0]);
    await page.evaluate(
      async ({ fake }) => {
        const b = await window.haicomo.request("bootstrap");
        await window.haicomo.request("settings.save", {
          ...b.settings,
          clientPaths: { codex: fake, claude: fake },
        });
      },
      { fake },
    );
    await current(page)
      .getByRole("button", { name: "设置", exact: true })
      .click();
    await current(page).getByRole("button", { name: "检测智能体" }).click();
    await expect(
      current(page).locator(".client-config .client-name img"),
    ).toHaveCount(10);
    await expect(
      current(page).locator(".capability .client-name img"),
    ).toHaveCount(10);
    await expect(
      current(page).getByText("打开客户端后粘贴已复制的提示词；尚未确认发送。"),
    ).toHaveCount(0);
    await current(page)
      .getByRole("button", { name: "任务清单", exact: true })
      .click();
    await current(page)
      .getByRole("button", { name: "Unsaved Alpha", exact: true })
      .click();
    await current(page)
      .getByRole("button", { name: "交接", exact: true })
      .click();
    const prompt = current(page).locator("textarea:not([readonly])");
    await prompt.fill("cancel");
    await current(page)
      .getByRole("button", { name: "复制提示词", exact: true })
      .click();
    const composed = await current(page).locator("textarea[readonly]").inputValue();
    expect(composed).toContain("agent-guide.md");
    expect(composed).toContain("\ncancel\n");
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(composed);
    await current(page)
      .getByRole("button", { name: "复制命令", exact: true })
      .click();
    const command = await current(page)
      .locator(".command-preview")
      .textContent();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
      command,
    );
    await app.evaluate(({ clipboard }) => {
      (globalThis as any).__copy = clipboard.writeText;
      clipboard.writeText = () => {
        throw new Error("fixture clipboard failure");
      };
    });
    await current(page)
      .getByRole("button", { name: "复制提示词", exact: true })
      .click();
    await expect(current(page).locator(".error-box")).toContainText(
      "无法写入剪贴板，请重新复制。",
    );
    await app.evaluate(({ clipboard }) => {
      clipboard.writeText = (globalThis as any).__copy;
    });
    await prompt.fill("approve");
    await expect(
      current(page).getByRole("button", { name: "复制命令", exact: true }),
    ).toBeVisible();
    await expect(current(page).locator("#provider-models option[value='fixture']")).toHaveCount(1);
    await current(page)
      .getByRole("button", { name: "后台发送", exact: true })
      .click();
    // Discovery and spawning are separate from permission delivery. Wait for the
    // synthetic CLI's actual turn handshake, rather than spending the default
    // five-second permission deadline on OS process startup as well.
    const methods = () => {
      const log = path.join(root, "requests.jsonl");
      if (!fs.existsSync(log)) return [] as string[];
      return fs.readFileSync(log, "utf8").trim().split("\n").flatMap(line => {
        try { const m = JSON.parse(line).method; return typeof m === "string" ? [m] : []; }
        catch { return []; }
      });
    };
    try {
      await expect.poll(() => methods().includes("turn/start"), { timeout: 15000, message: "Fixture CLI must receive the turn before permission delivery" }).toBe(true);
    } catch (error) {
      const background = await page.evaluate(() => window.haicomo.request("providers.background"));
      const visibleErrors = await current(page).locator(".error-box").allTextContents();
      await test.info().attach("fixture-start-diagnostics", {
        body: JSON.stringify({ methods: methods(), statuses: background.runs.map((r: any) => r.status), permissions: background.permissions.length, visibleErrors }),
        contentType: "application/json",
      });
      throw error;
    }
    await expect
      .poll(
        async () =>
          (
            await page.evaluate(() =>
              window.haicomo.request("providers.background"),
            )
          ).permissions.length,
      )
      .toBe(2);
    await expect(current(page).locator("dialog[open]")).toHaveCount(0);
    await closeTab(page);
    await expect
      .poll(
        async () =>
          (
            await page.evaluate(() =>
              window.haicomo.request("providers.background"),
            )
          ).runs.length,
      )
      .toBe(1);
    await current(page).locator(".brand").click();
    await current(page)
      .getByRole("button", { name: /后台任务/ })
      .click();
    await page
      .getByRole("dialog", { name: "后台任务" })
      .locator(".recent-row")
      .click();
    await expect(
      current(page).getByRole("heading", { name: "Alpha", exact: true }),
    ).toBeVisible();
    for (let i = 0; i < 2; i++) {
      await current(page).locator(".permission-banner").click();
      await current(page)
        .getByRole("button", { name: "允许一次", exact: true })
        .click();
    }
    await expect
      .poll(
        async () =>
          (
            await page.evaluate(() =>
              window.haicomo.request("providers.background"),
            )
          ).runs.length,
      )
      .toBe(0);
    await expect
      .poll(() => readSnapshot(dirs[0]).sessions[0].lifecycle)
      .toBe("history");
    expect(readSnapshot(dirs[1]).sessions).toHaveLength(0);
    await choose(page, "Beta");
    const b = await binding(page, dirs[1]);
    // Requests carry their original binding even while another tab is visible.
    const newA = await binding(page, dirs[0]);
    await page.evaluate(
      ({ binding }) =>
        window.haicomo.request("project.command", {
          binding,
          id: crypto.randomUUID(),
          type: "change",
          payload: {
            entity: "note",
            operation: "create",
            id: "only-alpha",
            expectedRevision: null,
            values: {
              title: "Only Alpha",
              body: "Bound request",
              kind: "note",
            },
          },
        }),
      { binding: newA },
    );
    expect(readSnapshot(dirs[0]).notes).toHaveLength(1);
    expect(readSnapshot(dirs[1]).notes).toHaveLength(0);
    await expect(
      current(page).getByRole("heading", { name: "Beta", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".topbar-actions svg.lucide-copy")).toHaveCount(
      0,
    );
    const proposal = exampleProposal(readSnapshot(dirs[1]));
    proposal.title = "Draft review stays unapproved";
    publishProposal(dirs[1], proposal);
    await current(page)
      .getByRole("button", { name: /修订提案/ })
      .click();
    await current(page).getByText(proposal.title, { exact: true }).click();
    await current(page)
      .getByLabel("审阅意见", { exact: true })
      .fill("Save my review draft only");
    await closeTab(page);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "保存修改", exact: true })
      .click();
    await expect(
      page.locator(`.tab-frame[data-project-id="${proposal.projectId}"]`),
    ).toHaveCount(0);
    await emitOpen(app, path.join(dirs[1], "HAICoMo.haicomo"));
    await expect(
      current(page).getByRole("heading", { name: "Beta", exact: true }),
    ).toBeVisible();
    await current(page)
      .getByRole("button", { name: /修订提案/ })
      .click();
    await current(page).getByText(proposal.title, { exact: true }).click();
    await expect(
      current(page).getByLabel("审阅意见", { exact: true }),
    ).toHaveValue("Save my review draft only");
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(
            dirs[1],
            ".haicomo/receipts",
            `${proposal.proposalId}.json`,
          ),
          "utf8",
        ),
      ).status,
    ).toBe("pending");
    await page.screenshot({ path: "test-results/tabs-projects.png" });
    expect(errors).toEqual([]);
  } finally {
    await closeTestApp(app);
    await removeTestDirectory(root);
  }
});

test("agent discovery cannot race project replacement or silently start after its entry is removed", async () => {
  const { root, dirs, fake } = fixture();
  const script = path.join(root, "agent.cjs");
  fs.writeFileSync(
    script,
    fs
      .readFileSync(script, "utf8")
      .replace(
        'if (args.includes("--version")) {',
        'if (args.includes("--version")) {\n  fs.writeFileSync(require("node:path").join(__dirname, "detect-started"), "1");\n  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800);',
      ),
  );
  const app = await launch(root, dirs[0]),
    page = await app.firstWindow();
  try {
    await emitOpen(app, path.join(dirs[0], "HAICoMo.haicomo"));
    await expect(
      current(page).getByRole("heading", { name: "Alpha", exact: true }),
    ).toBeVisible();
    const token = await binding(page, dirs[0]),
      original = readSnapshot(dirs[0]).id;
    await page.evaluate(
      async ({ token, fake }) => {
        const b = await window.haicomo.request("bootstrap");
        await window.haicomo.request("settings.save", {
          ...b.settings,
          clientPaths: { codex: fake },
        });
        (window as any).__starting = window.haicomo
          .request("providers.start", {
            binding: token,
            provider: "codex",
            taskId: "task",
            prompt: "complete",
          })
          .then(() => "unexpected start", String);
      },
      { token, fake },
    );
    await expect
      .poll(() => fs.existsSync(path.join(root, "detect-started")))
      .toBe(true);
    fs.unlinkSync(path.join(dirs[0], "HAICoMo.haicomo"));
    const attempt = () =>
      page.evaluate(() =>
        window.haicomo
          .request("project.create", { title: "New generation" })
          .then((v) => v.state.id, String),
      );
    expect(await attempt()).toContain("PROJECT_HAS_ACTIVE_RUNS");
    expect(await page.evaluate(() => (window as any).__starting)).toContain(
      "ENTRY_NOT_FOUND",
    );
    expect(
      fs.readFileSync(path.join(root, "requests.jsonl"), "utf8"),
    ).not.toContain('"turn/start"');
    expect(await attempt()).not.toBe(original);
    expect(readSnapshot(dirs[0]).tasks).toHaveLength(0);
  } finally {
    await closeTestApp(app);
    await removeTestDirectory(root);
  }
});

test("deleted entry stays missing in recents; same-directory recreation has new identity and invalidates old tabs", async () => {
  const { root, dirs } = fixture();
  let app = await launch(root, dirs[0]);
  let page = await app.firstWindow();
  try {
    let file = path.join(dirs[0], "HAICoMo.haicomo");
    const oldId = resolveEntry(file).id;
    await emitOpen(app, file);
    await expect(
      current(page).getByRole("heading", { name: "Alpha", exact: true }),
    ).toBeVisible();
    const oldBinding = await binding(page, dirs[0]);
    fs.unlinkSync(file);
    await expect(current(page).getByRole("alert")).toContainText(
      "项目文件不可用",
    );
    await current(page).getByRole("button", { name: "切换项目标签" }).click();
    await current(page)
      .getByRole("menuitem", { name: "新建标签页", exact: true })
      .click();
    await expect(
      current(page).locator(".recent-row").filter({ hasText: file }),
    ).toBeVisible();
    await current(page)
      .locator(".recent-row")
      .filter({ hasText: file })
      .click();
    await expect(current(page).locator(".toast")).toContainText(
      "项目文件不存在",
    );
    expect(fs.existsSync(file)).toBe(false);
    await current(page)
      .getByRole("button", { name: "新建项目", exact: true })
      .click();
    await current(page).getByLabel("项目名称", { exact: true }).fill("Fresh");
    await current(page)
      .getByRole("button", { name: "创建", exact: true })
      .click();
    await expect(
      current(page).getByRole("heading", { name: "Fresh", exact: true }),
    ).toBeVisible();
    expect(fs.existsSync(file)).toBe(false);
    file = path.join(dirs[0], "Fresh.haicomo");
    expect(resolveEntry(file).id).not.toBe(oldId);
    expect(readSnapshot(dirs[0]).tasks).toHaveLength(0);
    const stale = await page.evaluate(async (binding) => {
      try {
        await window.haicomo.request("project.command", {
          binding,
          id: crypto.randomUUID(),
          type: "change",
          payload: {
            entity: "note",
            operation: "create",
            id: "late",
            expectedRevision: null,
            values: { title: "Wrong generation" },
          },
        });
        return "bad";
      } catch (e) {
        return String(e);
      }
    }, oldBinding);
    expect(stale).toContain("PROJECT_REPLACED");
    expect(readSnapshot(dirs[0]).notes).toHaveLength(0);
    await page.screenshot({ path: "test-results/entry-recreated.png" });
    await app.close();
    fs.unlinkSync(file);
    app = await launch(root, dirs[0]);
    page = await app.firstWindow();
    await expect(
      current(page).locator(".recent-row").filter({ hasText: file }),
    ).toBeVisible();
    await current(page)
      .locator(".recent-row")
      .filter({ hasText: file })
      .first()
      .click();
    await expect(current(page).locator(".toast")).toContainText(
      "项目文件不存在",
    );
    expect(fs.existsSync(file)).toBe(false);
    await current(page)
      .getByRole("button", { name: "新建项目", exact: true })
      .click();
    await current(page)
      .getByLabel("项目名称", { exact: true })
      .fill("After restart");
    await current(page)
      .getByRole("button", { name: "创建", exact: true })
      .click();
    await expect(
      current(page).getByRole("heading", {
        name: "After restart",
        exact: true,
      }),
    ).toBeVisible();
    expect(fs.readdirSync(path.join(dirs[0], ".haicomo-history"))).toHaveLength(
      2,
    );
  } finally {
    await closeTestApp(app);
    await removeTestDirectory(root);
  }
});

test("project moves respect platform locks; hidden offices pause and native close respects save or cancel", async () => {
  const { root, dirs, fake } = fixture();
  fs.mkdirSync(path.join(root, "profile"));
  fs.writeFileSync(
    path.join(root, "profile/settings.json"),
    JSON.stringify({
      locale: "zh-CN",
      theme: "light",
      enhanced: false,
      reducedMotion: false,
      accent: "#347965",
      codexPath: fake,
      claudePath: fake,
      updateFeed: "",
    }),
  );
  let app = await launch(root, dirs[0]);
  let page = await app.firstWindow();
  try {
    const initial = await page.evaluate(() =>
      window.haicomo.request("bootstrap"),
    );
    expect(initial.settings.clientPaths.codex).toBe(fake);
    await page.evaluate(async () => {
      const { settings } = await window.haicomo.request("bootstrap");
      await window.haicomo.request("settings.save", {
        ...settings,
        clientPaths: { codex: "", claude: "" },
      });
    });
    expect(
      (await page.evaluate(() => window.haicomo.request("bootstrap"))).settings
        .codexPath,
    ).toBe("");
    await emitOpen(app, path.join(dirs[0], "HAICoMo.haicomo"));
    await expect(
      current(page).getByRole("heading", { name: "Alpha", exact: true }),
    ).toBeVisible();
    await current(page)
      .getByRole("button", { name: "协作办公室", exact: true })
      .click();
    const metrics = page.locator("[data-office-metrics]").first();
    await expect(metrics).toBeVisible();
    await emitOpen(app, path.join(dirs[1], "HAICoMo.haicomo"));
    await expect(
      current(page).getByRole("heading", { name: "Beta", exact: true }),
    ).toBeVisible();
    const frames = async () =>
      JSON.parse((await metrics.getAttribute("data-office-metrics"))!).frames;
    const paused = await frames();
    await page.waitForTimeout(300);
    expect(await frames()).toBe(paused);
    await choose(page, "Alpha");
    await expect.poll(frames).toBeGreaterThan(paused);
    await current(page)
      .getByRole("button", { name: "任务清单", exact: true })
      .click();
    await current(page)
      .getByRole("button", { name: "Alpha task", exact: true })
      .click();
    await current(page)
      .getByLabel("标题", { exact: true })
      .fill("Keep after move");
    const moved = path.join(root, "搬家 路径"),
      renamed = path.join(moved, "重命名.haicomo");
    if (process.platform === "win32") {
      expect(() => fs.renameSync(dirs[0], moved)).toThrow(/EPERM|EBUSY|EACCES/);
      await closeTab(page);
      await page.getByRole("alertdialog").getByRole("button", { name: "保存修改", exact: true }).click();
      await expect.poll(() => fs.existsSync(path.join(dirs[0], ".haicomo/writer.lock"))).toBe(false);
    }
    fs.renameSync(dirs[0], moved);
    fs.renameSync(path.join(moved, "HAICoMo.haicomo"), renamed);
    await emitOpen(app, renamed);
    await expect
      .poll(async () =>
        (
          await page.evaluate(() => window.haicomo.request("bootstrap"))
        ).projects.some((p: any) => p.entryPath === fs.realpathSync(renamed)),
      )
      .toBe(true);
    if (process.platform === "win32") {
      await current(page).getByRole("button", { name: "Keep after move", exact: true }).click();
    }
    await expect(current(page).getByLabel("标题", { exact: true })).toHaveValue(
      "Keep after move",
    );
    await current(page)
      .getByRole("button", { name: "保存修改", exact: true })
      .click();
    await expect(current(page).locator(".error-box")).toHaveCount(0);
    await expect
      .poll(() => readSnapshot(moved).tasks[0].title)
      .toBe("Keep after move");
    const movedAgain = path.join(root, "二次移动");
    if (process.platform === "win32") {
      await closeTab(page);
      await expect.poll(() => fs.existsSync(path.join(moved, ".haicomo/writer.lock"))).toBe(false);
    }
    fs.renameSync(moved, movedAgain);
    if (process.platform !== "win32") await closeTab(page);
    await emitOpen(app, path.join(movedAgain, "重命名.haicomo"));
    await expect(
      current(page).getByRole("heading", { name: "Alpha", exact: true }),
    ).toBeVisible();
    await current(page)
      .getByRole("button", { name: "Keep after move", exact: true })
      .click();
    await current(page)
      .getByLabel("标题", { exact: true })
      .fill("Native close saved");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "取消", exact: true })
      .click();
    expect(app.windows()).toHaveLength(1);
    await expect(current(page).getByLabel("标题", { exact: true })).toHaveValue(
      "Native close saved",
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "保存修改", exact: true })
      .click();
    await expect
      .poll(() => readSnapshot(movedAgain).tasks[0].title)
      .toBe("Native close saved");
    await expect.poll(() => app.windows().length).toBe(0);
    if (process.platform === "darwin") {
      const nextWindow = app.waitForEvent("window");
      await app.evaluate(({ app }) => app.emit("activate"));
      page = await nextWindow;
    } else {
      // With no retained work, Windows exits when its last window closes.
      await app.close().catch(() => {});
      app = await launch(root, movedAgain);
      page = await app.firstWindow();
    }
    await expect(
      current(page).getByRole("button", { name: "新建项目", exact: true }),
    ).toBeVisible();
    await emitOpen(app, path.join(movedAgain, "重命名.haicomo"));
    await expect(
      current(page).getByRole("button", {
        name: "Native close saved",
        exact: true,
      }),
    ).toBeVisible();
    await app.evaluate(({ Menu }) => {
      const item = Menu.getApplicationMenu()!
        .items.flatMap((i) => i.submenu?.items ?? [])
        .find((i) => i.accelerator === "CmdOrCtrl+W")!;
      item.click();
    });
    await expect(
      current(page).getByRole("button", { name: "新建项目", exact: true }),
    ).toBeVisible();
    expect(app.windows()).toHaveLength(1);
  } finally {
    await closeTestApp(app);
    await removeTestDirectory(root);
  }
});
