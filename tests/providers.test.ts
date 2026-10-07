import { fixtureAgent } from "./fixture-agent";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  LocalRunners,
  detect,
  type PermissionRequest,
} from "../src/providers/local";
import type { RunEvent } from "../src/shared/domain";
import { terminalCommand } from "../src/shared/terminal";

const until = async (check: () => boolean) => {
  const until = Date.now() + 6000;
  while (!check()) {
    if (Date.now() > until) throw new Error("Timed out");
    await new Promise((r) => setTimeout(r, 15));
  }
};
function fixture(t: any) {
  const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "haicomo agent 测试 "),
    ),
    executable = fixtureAgent(directory);
  const events: RunEvent[] = [],
    permissions: PermissionRequest[] = [];
  const runners = new LocalRunners(
    (_dir, e) => events.push(e),
    (p) => permissions.push(p),
  );
  t.after(async () => {
    runners.dispose();
    await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  return {
    directory,
    executable,
    events,
    permissions,
    runners,
    options: {
      provider: "codex" as const,
      executable,
      directory,
      taskId: "task",
      prompt: "complete",
    },
  };
}
const unix = {}; // Runner tests now execute on both platforms.
test(
  "Codex handshake uses installed protocol and tracks a real completion",
  unix,
  async (t) => {
    const f = fixture(t);
    assert.equal((await detect("codex", f.executable)).background, true);
    const result = await f.runners.start(f.options);
    await until(() => !f.runners.active().length);
    assert.equal(result.threadId, "thread-fixture");
    assert.equal(f.events.at(-1)?.status, "idle");
    assert.equal(f.events.at(-1)?.lifecycle, "history");
    assert.equal(f.events.at(-1)?.endReason, "completed");
    assert.ok(f.events.at(-1)?.endedAt);
    const requests = fs.readFileSync(
      path.join(f.directory, "requests.jsonl"),
      "utf8",
    );
    assert.match(requests, /workspace-write/);
    assert.doesNotMatch(requests, /danger-full-access/);
  },
);
test(
  "Codex permission responses match a pending request and preserve concurrent waits",
  unix,
  async (t) => {
    const f = fixture(t);
    const result = await f.runners.start({ ...f.options, prompt: "approve" });
    await until(() => f.permissions.length === 2);
    assert.equal(f.permissions[0].directory, f.directory);
    assert.throws(
      () =>
        f.runners.respond(
          result.runId,
          1,
          "item/commandExecution/requestApproval",
          true,
        ),
      /INTERACTION_NOT_PENDING/,
    );
    f.runners.respond(
      result.runId,
      9001,
      "item/commandExecution/requestApproval",
      true,
    );
    assert.equal(f.events.at(-1)?.status, "waiting");
    assert.equal(f.events.at(-1)?.lifecycle, "current");
    assert.equal(f.events.at(-1)?.endedAt, undefined);
    assert.equal(f.runners.active().length, 1);
    assert.throws(
      () =>
        f.runners.respond(
          result.runId,
          9001,
          "item/commandExecution/requestApproval",
          true,
        ),
      /INTERACTION_NOT_PENDING/,
    );
    f.runners.respond(
      result.runId,
      9002,
      "item/commandExecution/requestApproval",
      false,
    );
    await until(() => !f.runners.active().length);
    assert.equal(f.events.at(-1)?.status, "idle");
  },
);
test(
  "Codex user questions need explicit answers; cancel includes the turn ID",
  unix,
  async (t) => {
    const f = fixture(t);
    const a = await f.runners.start({ ...f.options, prompt: "questions" });
    await until(() => f.permissions.length === 1);
    assert.throws(
      () =>
        f.runners.respond(a.runId, 9001, "item/tool/requestUserInput", true),
      /ANSWERS_REQUIRED/,
    );
    f.runners.respond(a.runId, 9001, "item/tool/requestUserInput", true, {
      choice: { answers: ["A"] },
    });
    await until(() => !f.runners.active().length);
    const b = await f.runners.start({ ...f.options, prompt: "cancel" });
    await f.runners.cancel(b.runId);
    assert.equal(f.events.at(-1)?.endReason, "cancelled");
    assert.equal(f.events.at(-1)?.lifecycle, "history");
    assert.match(
      fs.readFileSync(path.join(f.directory, "requests.jsonl"), "utf8"),
      /"turn\/interrupt","params":\{"threadId":"thread-fixture","turnId":"turn-fixture"\}/,
    );
  },
);

test("an acknowledged interrupt without final confirmation remains unknown", async t => {
  const f = fixture(t);
  const started = await f.runners.start({ ...f.options, prompt: "cancelWithoutCompletion" });
  await f.runners.cancel(started.runId);
  assert.equal(f.events.at(-1)?.status, "unknown");
  assert.equal(f.events.at(-1)?.endReason, "lost");
  assert.equal(f.events.at(-1)?.lifecycle, "current");
});

test("cancel waits for a queued Codex turn to start before interrupting", async t => {
  const f = fixture(t);
  const started = await f.runners.start({ ...f.options, prompt: "cancelQueued" });
  assert.equal(f.events.at(-1)?.status, "unknown", "A turn/start acknowledgement is not execution evidence");
  await f.runners.cancel(started.runId);
  assert.equal(f.events.at(-1)?.endReason, "cancelled");
  assert.equal(f.events.at(-1)?.lifecycle, "history");
  const requests = fs.readFileSync(path.join(f.directory, "requests.jsonl"), "utf8");
  assert.equal((requests.match(/turn\/interrupt/g) ?? []).length, 1, "No retries mask an early interrupt");
});
test(
  "an exit without completion stays unknown and spawn errors clean up",
  unix,
  async (t) => {
    const f = fixture(t);
    await f.runners.start({ ...f.options, prompt: "exitEarly" });
    await until(() => !f.runners.active().length);
    assert.equal(f.events.at(-1)?.status, "unknown");
    await assert.rejects(
      f.runners.start({
        ...f.options,
        executable: path.join(f.directory, "missing"),
      }),
    );
    assert.equal(f.runners.active().length, 0);
    assert.equal(f.events.at(-1)?.lifecycle, "history");
    assert.equal(f.events.at(-1)?.endReason, "failed");
  },
);
test(
  "Claude stream output, resume and permission fallback are distinct",
  unix,
  async (t) => {
    const f = fixture(t);
    await f.runners.start({
      ...f.options,
      provider: "claude",
      prompt: "permission",
      threadId: "existing-session",
      model: "local-model",
    });
    await until(() => !f.runners.active().length);
    assert.equal(f.events.at(-1)?.status, "waiting");
    assert.equal(f.events.at(-1)?.lifecycle, "history");
    assert.equal(f.events.at(-1)?.endReason, "permission");
    assert.equal(f.events.at(-1)?.threadId, "claude-session");
    const requests = fs.readFileSync(
      path.join(f.directory, "requests.jsonl"),
      "utf8",
    );
    assert.match(requests, /--resume/);
    assert.match(requests, /"default"/);
    assert.doesNotMatch(requests, /dangerously-skip/);
  },
);
test("visible terminal commands preserve literal special characters", () => {
  const value =
    "a 'quoted' \"value\" $(touch nope) `echo nope` $HOME ; & 中文\nnext";
  if (process.platform !== "win32")
    assert.equal(
      execFileSync(
        "/bin/sh",
        ["-c", terminalCommand("darwin", os.tmpdir(), ["printf", "%s", value])],
        { encoding: "utf8" },
      ),
      value,
    );
  const windows = terminalCommand("win32", "C:\\O'Brien\\工作 空格", [
    "claude",
    value,
  ]);
  assert.match(windows, /Set-Location -LiteralPath 'C:\\O''Brien/);
  assert.match(windows, /if \(\$\?\) \{ & 'claude'/);
});
