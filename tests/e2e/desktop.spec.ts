import { test, expect, _electron as electron } from "@playwright/test";
import { removeTestDirectory } from "./cleanup";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectStore } from "../../src/core/store";
import {
  publishProposal,
  exampleProposal,
  readSnapshot,
} from "../../src/core/files";

test("real desktop: create, edit, accept, concurrent proposal review, windows, views and themes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-e2e-")),
    project = path.join(root, "项目 with spaces");
  fs.mkdirSync(project);
  const app = await electron.launch({
    ...(process.env.HAICOMO_PACKAGED_EXECUTABLE
      ? { executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE, args: [] }
      : { args: ["."] }),
    env: {
      ...process.env,
      HAICOMO_TEST: "1",
      HAICOMO_USER_DATA: path.join(root, "profile"),
      HAICOMO_TEST_DIRECTORY: project,
    },
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await expect(page.getByText("好工作，从一点清晰开始。")).toBeVisible();
    await page.screenshot({ path: "test-results/home.png" });
    await page.getByRole("button", { name: "新建项目", exact: true }).click();
    await page
      .getByLabel("项目名称", { exact: true })
      .fill("HAICoMo · 产品工作室");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "HAICoMo · 产品工作室" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "新建任务", exact: true })
      .first()
      .click();
    await page.getByLabel("标题", { exact: true }).fill("梳理产品需求");
    await page
      .getByLabel("描述", { exact: true })
      .fill("明确协作边界与人工验收要求。");
    await page.getByLabel("开始日期", { exact: true }).fill("2026-10-05");
    await page.getByLabel("截止日期", { exact: true }).fill("2026-10-08");
    await page.getByRole("button", { name: "Claude", exact: true }).click();
    await page.getByLabel("状态", { exact: true }).selectOption("delivered");
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    await page
      .getByRole("button", { name: "梳理产品需求", exact: true })
      .click();
    await page.getByRole("button", { name: "通过验收", exact: true }).click();
    await expect(
      page.locator(".task-row").first().getByText("已完成", { exact: true }),
    ).toBeVisible();
    const snapshot = readSnapshot(project),
      proposal = exampleProposal(snapshot);
    proposal.actor = { name: "Claude · planning", family: "claude" };
    proposal.title = "拆分下一阶段任务";
    proposal.changes[0].values = {
      title: "实现可靠的协作协议",
      description: "每条提案独立投递，审批后事务提交。",
      assignees: ["chatgpt", "claude"],
      status: "doing",
      progress: 45,
      startDate: "2026-10-08",
      endDate: "2026-10-16",
      dependencies: [snapshot.tasks[0].id],
    };
    publishProposal(project, proposal);
    await page.getByRole("button", { name: /修订提案/ }).click();
    await expect(page.getByText("拆分下一阶段任务")).toBeVisible();
    await page.getByText("拆分下一阶段任务").click();
    await page.getByRole("button", { name: "批准", exact: true }).click();
    await page.getByRole("button", { name: "项目总览", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "实现可靠的协作协议", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "切换项目标签" }).click();
    await page.getByRole("menuitem", { name: "更多项目操作" }).click();
    await page.getByRole("menuitem", { name: "在新窗口打开" }).click();
    await expect.poll(() => app.windows().length).toBe(2);
    const second = app.windows()[1];
    await expect(
      second.getByRole("heading", { name: "HAICoMo · 产品工作室" }),
    ).toBeVisible();
    await second
      .getByRole("button", { name: "实现可靠的协作协议", exact: true })
      .click();
    await second
      .getByLabel("标题", { exact: true })
      .fill("Second window stale edit");
    await page
      .getByRole("button", { name: "实现可靠的协作协议", exact: true })
      .click();
    await page.getByLabel("标题", { exact: true }).fill("协作协议 · 已同步");
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(
      second.getByRole("button", { name: "协作协议 · 已同步", exact: true }),
    ).toBeVisible();
    await second.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(second.getByText(/该记录已在别处修改|changed elsewhere/)).toBeVisible();
    await second.close();
    const workerPid = await app.evaluate(({ app }) => {
      const worker = app
        .getAppMetrics()
        .find((m) => m.name === "HAICoMo database");
      if (!worker) throw new Error("No database utility");
      process.kill(worker.pid, "SIGKILL");
      return worker.pid;
    });
    await expect
      .poll(() =>
        app.evaluate(
          ({ app }, oldPid) =>
            app
              .getAppMetrics()
              .some((m) => m.name === "HAICoMo database" && m.pid !== oldPid),
          workerPid,
        ),
      )
      .toBe(true);
    await expect(
      page.getByRole("button", { name: "协作协议 · 已同步", exact: true }),
    ).toBeVisible();
    if (await page.locator(".toast button").isVisible())
      await page.locator(".toast button").click();
    await page.screenshot({ path: "test-results/overview.png" });
    for (const name of ["时间线", "前置关系", "思维导图", "协作统计"]) {
      await page.getByRole("button", { name, exact: true }).first().click();
      await expect(
        page.getByRole("heading", { name, exact: true }).first(),
      ).toBeVisible();
    }
    await page.getByRole("button", { name: "备注与会议", exact: true }).click();
    await page.getByRole("button", { name: "新建备注", exact: true }).click();
    await page.getByLabel("标题", { exact: true }).fill("第一次评审");
    await page.getByLabel("正文", { exact: true }).fill("先验收，再解除阻塞。");
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(page.getByText("第一次评审")).toBeVisible();
    await page
      .getByRole("button", { name: "协作办公室", exact: true })
      .first()
      .click();
    await expect(page.locator("canvas")).toBeVisible();
    await expect.poll(() => page.locator(".office-canvas").getAttribute("data-office-metrics").then(v => v ? JSON.parse(v).frames : 0)).toBeGreaterThan(2);
    await page.screenshot({ path: "test-results/office-default.png" });
    await page.locator(".page-heading button[aria-pressed]").click();
    await expect(
      page.locator('.page-heading button[aria-pressed="true"]'),
    ).toBeVisible();
    await expect.poll(() => page.locator(".office-canvas").getAttribute("data-office-metrics").then(v => v ? JSON.parse(v).enhanced : false)).toBe(true);
    await page.screenshot({ path: "test-results/office-enhanced.png" });
    await page
      .locator("canvas")
      .evaluate((canvas) =>
        canvas.dispatchEvent(
          new Event("webglcontextlost", { cancelable: true }),
        ),
      );
    await expect(
      page.getByText("办公室画面暂不可用。任务管理与下方状态列表仍可使用。"),
    ).toBeVisible();
    await page.locator(".agent-strip button").first().click();
    await expect(page.locator(".modal-title h2")).toHaveText("ChatGPT");
    await page.locator(".modal-title button").click();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByLabel("语言", { exact: true }).selectOption("en-GB");
    await page
      .getByRole("button", { name: "保存修改", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await page.locator(".theme-trigger").click();
    await page.getByRole("listbox").getByRole("option", { name: "Dark", exact: true }).click();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .first()
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(errors).toEqual([]);
    await page.locator(".brand").click();
    await expect(
      page.getByText("Good work starts with a little clarity."),
    ).toBeVisible();
    const offline = exampleProposal(readSnapshot(project));
    publishProposal(project, offline);
    await page.waitForTimeout(1800);
    await expect(
      page.getByText("Good work starts with a little clarity."),
    ).toBeVisible();
  } finally {
    await page
      .screenshot({ path: "test-results/last-screen.png" })
      .catch(() => {});
    await app.close();
    expect(fs.existsSync(path.join(project, ".haicomo", "writer.lock"))).toBe(
      false,
    );
    await removeTestDirectory(root);
  }
});
test("project entries reopen persisted data and distinct projects remain isolated", async () => {
  const mark = (stage: string) => {
    const evidence = process.env.HAICOMO_EVIDENCE_DIR;
    if (!evidence) return;
    fs.mkdirSync(evidence, { recursive: true });
    fs.appendFileSync(path.join(evidence, "entry-lifecycle.jsonl"), JSON.stringify({ stage, node: process.versions.node, packaged: Boolean(process.env.HAICOMO_PACKAGED_EXECUTABLE) }) + "\n");
  };
  mark("start");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-entry-"));
  const first = path.join(root, "原始"),
    other = path.join(root, "独立");
  fs.mkdirSync(first);
  fs.mkdirSync(other);
  for (const [directory, title] of [
    [first, "First project"],
    [other, "Independent project"],
  ]) {
    mark(`create ${title}`);
    const store = new ProjectStore(directory, title);
    store.close();
    mark(`closed ${title}`);
  }
  mark("launch");
  const app = await electron.launch({
    ...(process.env.HAICOMO_PACKAGED_EXECUTABLE
      ? {
          executablePath: process.env.HAICOMO_PACKAGED_EXECUTABLE,
          args: [path.join(first, "HAICoMo.haicomo")],
        }
      : { args: [".", path.join(first, "HAICoMo.haicomo")] }),
    env: {
      ...process.env,
      HAICOMO_TEST: "1",
      HAICOMO_USER_DATA: path.join(root, "profile"),
    },
  });
  mark("launched");
  try {
    const page = await app.firstWindow();
    mark("window ready");
    await expect(
      page.getByRole("heading", { name: "First project", exact: true }),
    ).toBeVisible();
    const view = await page.evaluate(
      (directory) => window.haicomo.request("project.open", { directory }),
      other,
    );
    expect(view.state.title).toBe("Independent project");
    mark("independent opened");
    const duplicate = path.join(root, "外部复制");
    fs.cpSync(first, duplicate, { recursive: true });
    mark("copied");
    const error = await page.evaluate(async (directory) => {
      try {
        await window.haicomo.request("project.open", { directory });
        return "accepted duplicate";
      } catch (error) {
        return String(error);
      }
    }, duplicate);
    expect(error).toContain("DUPLICATE_PROJECT");
    mark("duplicate rejected");
    const firstAgain = await page.evaluate(
      (directory) => window.haicomo.request("project.open", { directory }),
      first,
    );
    expect(firstAgain.state.title).toBe("First project");
    expect(firstAgain.state.id).not.toBe(view.state.id);
    mark("original reopened");
  } finally {
    mark("closing app");
    await app.close();
    mark("removing directory");
    await removeTestDirectory(root);
    mark("complete");
  }
});
