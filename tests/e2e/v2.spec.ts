import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../../src/core/store";
import { exampleProposal, publishProposal } from "../../src/core/files";
test("v2 desktop: full proposal count, filters, date dragging, keyboard, stale revision, four locales and static art", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-v2-ui-")),
    directory = path.join(root, "项目 v2");
  fs.mkdirSync(directory);
  const store = new ProjectStore(directory, "V2 verification");
  store.command({
    id: randomUUID(),
    type: "change",
    payload: {
      entity: "task",
      operation: "create",
      id: "past",
      expectedRevision: null,
      values: {
        title: "Accepted task",
        status: "delivered",
        startDate: "2026-01-01",
        endDate: "2026-01-10",
        assignees: ["client:pi"],
      },
    },
  });
  store.command({
    id: randomUUID(),
    type: "task.accept",
    payload: { taskId: "past", expectedRevision: 1 },
  });
  store.command({
    id: randomUUID(),
    type: "change",
    payload: {
      entity: "task",
      operation: "create",
      id: "future",
      expectedRevision: null,
      values: {
        title: "Future task",
        startDate: "2031-10-01",
        endDate: "2031-10-10",
        dependencies: ["past"],
      },
    },
  });
  for (let i = 0; i < 65; i++) {
    const p = exampleProposal(store.state());
    p.actor = { name: "Pi tester", harnessId: "pi", family: null };
    p.title = `Inbox ${i}`;
    p.changes[0].id = "future";
    p.changes[0].operation = "update";
    p.changes[0].expectedRevision = 1;
    p.changes[0].values = { progress: i };
    publishProposal(directory, p);
  }
  store.close();
  const app = await electron.launch({
    ...(process.env.HAICOMO_PACKAGED_EXECUTABLE
      ? {
          executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE,
          args: [path.join(directory, "HAICoMo.haicomo")],
        }
      : { args: [".", path.join(directory, "HAICoMo.haicomo")] }),
    env: {
      ...process.env,
      HAICOMO_TEST: "1",
      HAICOMO_USER_DATA: path.join(root, "profile"),
    },
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await expect(
      page.getByRole("heading", { name: "V2 verification", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /修订提案/ })).toContainText(
      "65",
    );
    await page.getByRole("button", { name: /修订提案/ }).click();
    await expect(page.locator(".proposal-card")).toHaveCount(30);
    await expect(page.locator(".pagination")).toContainText("1 / 3 · 65");
    await page.locator(".pagination button").last().click();
    await expect(page.locator(".pagination")).toContainText("2 / 3 · 65");
    await page.locator(".record-filters input").first().fill("Inbox 64");
    await expect(page.locator(".proposal-card")).toHaveCount(1);
    await page.locator(".record-filters select").first().selectOption("claude");
    await expect(page.locator(".proposal-card")).toHaveCount(0);
    await page.getByRole("button", { name: "时间线", exact: true }).click();
    const bar = page.locator(".gantt-bar").filter({ hasText: "Accepted task" });
    await bar.focus();
    await page.keyboard.press("ArrowRight");
    await expect(bar).toHaveAttribute(
      "title",
      "Accepted task: 2026-01-02 → 2026-01-11",
    );
    const b = (await bar.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2);
    await page.mouse.up();
    await expect(bar).toHaveAttribute(
      "title",
      "Accepted task: 2026-01-04 → 2026-01-13",
    );
    const before = await page.evaluate(async () =>
      window.haicomo.request("project.view", {
        binding: (await window.haicomo.request("bootstrap")).projects[0]
          .binding,
      }),
    );
    expect(before.state.tasks[0].acceptedAt).toBeTruthy();
    expect(before.state.tasks[1].dependencies).toEqual(["past"]);
    const box = (await bar.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.evaluate(
      async (task) =>
        window.haicomo.request("project.command", {
          binding: (await window.haicomo.request("bootstrap")).projects[0]
            .binding,
          id: crypto.randomUUID(),
          type: "change",
          payload: {
            entity: "task",
            operation: "update",
            id: task.id,
            expectedRevision: task.revision,
            values: { startDate: "2026-01-05", endDate: "2026-01-14" },
          },
        }),
      before.state.tasks[0],
    );
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2);
    await page.mouse.up();
    await expect(page.getByRole("alert")).toContainText(/该记录已在别处修改|changed elsewhere|該記錄已在別處修改/);
    await expect(bar).toHaveAttribute(
      "title",
      "Accepted task: 2026-01-05 → 2026-01-14",
    );
    await page.locator(".gantt-jump").fill("2031-10-01");
    await expect(
      page.locator(".gantt-bar").filter({ hasText: "Future task" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    const panel = page.locator(".settings-panel").first();
    for (const locale of ["en-US", "en-GB", "zh-TW", "zh-CN"]) {
      await panel.locator("select").first().selectOption(locale);
      await panel.locator("button.primary").click();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await page.screenshot({ path: `test-results/locale-${locale}.png` });
    }
    await panel.getByRole("switch").nth(0).check();
    await panel.getByRole("switch").nth(1).check();
    await panel.locator(".theme-trigger").click();
    await panel.getByRole("listbox").getByRole("option", { name: "深色", exact: true }).click();
    await panel.locator("button.primary").click();
    await page.getByRole("button", { name: "协作统计", exact: true }).click();
    await expect
      .poll(() => page.locator('img[src$="kimi-original-2.png"]').count())
      .toBe(1);
    expect(await page.locator('img[src$="-original-2.gif"]').count()).toBe(0);
    await page.getByRole("button", { name: "协作办公室", exact: true }).click();
    await expect(page.locator("canvas")).toBeVisible();
    await expect(
      page.locator(".agent-strip").getByText("Pi", { exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: "test-results/v2-reduced-office.png" });
    const actors = async () =>
      JSON.parse(
        (await page
          .locator(".office-canvas")
          .getAttribute("data-office-actors")) || "[]",
      );
    await expect.poll(async () => (await actors()).length).toBe(15);
    const actor = (await actors()).find((a: any) => a.id === "chatgpt");
    const canvas = (await page.locator("canvas").boundingBox())!,
      scale = canvas.width / 1120;
    await page.mouse.move(
      canvas.x + actor.x * scale,
      canvas.y + (actor.y - 35) * scale,
    );
    await page.mouse.down();
    await page.mouse.move(canvas.x + 400 * scale, canvas.y + 260 * scale, {
      steps: 10,
    });
    await expect
      .poll(
        async () =>
          (await actors()).find((a: any) => a.id === "chatgpt")?.dragging,
      )
      .toBe(true);
    expect(
      Math.abs((await actors()).find((a: any) => a.id === "chatgpt").x - 400),
    ).toBeLessThan(5);
    await page.mouse.up();
    await expect
      .poll(
        async () =>
          (await actors()).find((a: any) => a.id === "chatgpt")?.dragging,
      )
      .toBe(false);
    const returned = (await actors()).find((a: any) => a.id === "chatgpt");
    await page.mouse.click(
      canvas.x + returned.x * scale,
      canvas.y + (returned.y - 35) * scale,
      { button: "right" },
    );
    await expect(page.locator(".modal-title h2")).toHaveText("ChatGPT");
    await page.locator(".modal-title button").click();
    await page.getByRole("button", { name: "任务清单", exact: true }).click();
    await page
      .getByRole("button", { name: "Future task", exact: true })
      .click();
    await page.getByLabel("在办公室显示任务桌", { exact: true }).uncheck();
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    await page.getByRole("button", { name: "协作办公室", exact: true }).click();
    await expect
      .poll(
        async () =>
          JSON.parse(
            (await page
              .locator(".office-canvas")
              .getAttribute("data-office-metrics")) || "{}",
          ).tables,
      )
      .toBe(1);
    const finalView = await page.evaluate(async () =>
      window.haicomo.request("project.view", {
        binding: (await window.haicomo.request("bootstrap")).projects[0]
          .binding,
      }),
    );
    expect(finalView.state.tasks[0].assignees).toEqual(["client:pi"]);
    expect(finalView.state.tasks[0].acceptedAt).toBeTruthy();
    expect(finalView.state.tasks[1].dependencies).toEqual(["past"]);
    const missing = await page
      .locator("img")
      .evaluateAll((imgs) =>
        imgs
          .filter((im) => !(im as HTMLImageElement).naturalWidth)
          .map((im) => im.getAttribute("src")),
      );
    expect(missing).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ app }) => app.exit()).catch(() => {});
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
