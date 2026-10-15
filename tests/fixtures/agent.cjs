#!/usr/bin/env node
const fs = require("node:fs");
const readline = require("node:readline");
const args = process.argv.slice(2);
// The copied script's name selects a dialect: agent (Codex app-server / Claude
// stream-json), kimi (role lines, prompt argument), dsh (DeepSeek Harness
// session/status/final events, prompt on stdin), gemini (message deltas),
// copilot (plain text). No dialect ever calls a model.
const dialect = require("node:path").basename(process.argv[1]).replace(/\.(c?js|cmd)$/, "");
const HELP = {
  agent: "--listen --resume --model stream-json",
  kimi: "-p, --prompt <prompt>  --output-format <format> (choices: \"text\", \"stream-json\")  -S, --session [id]  -m, --model <model>  -y, --yolo  --auto  --plan",
  dsh: "Usage: dsh --profile headless [options] [task...]\n  --json  write newline-delimited run events\n  --session-id <id>",
  gemini: "-p, --prompt  --output-format (choices: \"text\", \"json\", \"stream-json\")  --approval-mode (choices: \"default\", \"auto_edit\", \"yolo\")  -m, --model",
  copilot: "-p, --prompt <text>  --allow-all-tools  --model <model>",
};
if (args.includes("--version")) {
  console.log("fixture 1.0.0");
  process.exit(0);
}
if (args.includes("--help")) {
  console.log(HELP[dialect] ?? HELP.agent);
  process.exit(0);
}
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const log = (value) =>
  fs.appendFileSync(
    require("node:path").join(__dirname, "requests.jsonl"),
    JSON.stringify(value) + "\n",
  );
log({ args, dialect, env: { DSH_PERMISSION_MODE: process.env.DSH_PERMISSION_MODE } });
const argValue = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
if (dialect === "kimi" || dialect === "gemini" || dialect === "copilot") {
  const prompt = argValue("--prompt") ?? "";
  log({ prompt });
  if (dialect === "kimi") {
    send({ role: "meta", type: "system.version", version: "2.2.0" });
    if (prompt === "fail") { process.stderr.write("error: provider.auth_error: 403 quota\n"); process.exit(1); }
    send({ role: "assistant", content: [{ type: "text", text: "Kimi fixture output" }], session_id: "kimi-session" });
    process.exit(0);
  }
  if (dialect === "gemini") {
    send({ type: "init", session_id: "gemini-session", model: "gemini-fixture" });
    send({ type: "message", role: "assistant", content: "Gemini ", delta: true });
    send({ type: "message", role: "assistant", content: "fixture output", delta: true });
    send({ type: "result", status: "success" });
    process.exit(0);
  }
  process.stdout.write("Copilot fixture output\nsecond line\n");
  process.exit(0);
} else if (dialect === "dsh") {
  let prompt = "";
  process.stdin.on("data", (d) => (prompt += d));
  process.stdin.on("end", () => {
    log({ prompt });
    send({ type: "session", sessionId: "session-dsh-fixture", cwd: process.cwd() });
    send({ type: "status", phase: "turn_start", turn: 1 });
    if (prompt === "fail") {
      send({ type: "status", phase: "turn_end", turn: 1, reason: { kind: "error", error: { message: "MISSING_CREDENTIAL", code: "MISSING_CREDENTIAL" } } });
      send({ type: "final", text: "" });
      process.exit(1);
    }
    send({ type: "status", phase: "turn_end", turn: 1, reason: { kind: "done" } });
    send({ type: "final", text: "DeepSeek fixture output" });
    process.exit(0);
  });
} else if (args[0] === "app-server") {
  let mode = "",
    responses = 0,
    turnStarted = false;
  readline.createInterface({ input: process.stdin }).on("line", (line) => {
    const m = JSON.parse(line);
    log(m);
    if (m.method === "initialize") send({ id: m.id, result: {} });
    if (m.method === "model/list")
      send({
        id: m.id,
        result: {
          data: [
            {
              model: "fixture",
              displayName: "Fixture",
              isDefault: true,
              supportedReasoningEfforts: [{ reasoningEffort: "high" }],
            },
          ],
        },
      });
    if (m.method === "thread/start" || m.method === "thread/resume") {
      if (m.params.sandbox !== "workspace-write")
        return send({ id: m.id, error: { message: "wrong sandbox enum" } });
      send({ id: m.id, result: { thread: { id: "thread-fixture" } } });
    }
    if (m.method === "turn/start") {
      if (!Array.isArray(m.params.input[0].text_elements))
        return send({ id: m.id, error: { message: "missing text_elements" } });
      mode = m.params.input[0].text.split(/\r?\n/).find(line => ["approve", "cancel", "cancelQueued", "cancelWithoutCompletion", "recommend"].includes(line)) ?? m.params.input[0].text;
      send({ id: m.id, result: { turn: { id: "turn-fixture" } } });
      const started = () => { turnStarted = true; send({
        method: "turn/started",
        params: { turn: { id: "turn-fixture" } },
      }); };
      if (mode === "cancelQueued") setTimeout(started, 150);
      else started();
      if (mode === "approve") {
        for (const id of [9001, 9002])
          send({
            id,
            method: "item/commandExecution/requestApproval",
            params: { command: "echo safe" },
          });
      } else if (mode === "recommend")
        send({
          id: 9001,
          method: "item/tool/requestUserInput",
          params: {
            questions: [
              {
                id: "approach",
                header: "Approach",
                question: "Which approach?",
                options: [{ label: "Fast" }, { label: "Safe (Recommended)" }],
              },
            ],
          },
        });
      else if (mode === "questions")
        send({
          id: 9001,
          method: "item/tool/requestUserInput",
          params: {
            questions: [
              {
                id: "choice",
                header: "Choice",
                question: "Which?",
                options: [{ label: "A" }],
              },
            ],
          },
        });
      else if (mode === "exitEarly") process.exit(0);
      else if (!["cancel", "cancelWithoutCompletion", "cancelQueued"].includes(mode))
        setTimeout(
          () =>
            send({
              method: "turn/completed",
              params: { turn: { id: "turn-fixture", status: "completed" } },
            }),
          30,
        );
    }
    if (m.id >= 9001 && !m.method) {
      responses++;
      if (mode === "questions" || mode === "recommend" || responses === 2)
        send({
          method: "turn/completed",
          params: { turn: { status: "completed" } },
        });
    }
    if (m.method === "turn/interrupt") {
      if (!turnStarted) return send({ id: m.id, error: { message: "no active turn to interrupt" } });
      if (m.params.turnId !== "turn-fixture")
        return send({ id: m.id, error: { message: "wrong turn id" } });
      send({ id: m.id, result: {} });
      if (mode === "cancelWithoutCompletion") return;
      setTimeout(
        () =>
          send({
            method: "turn/completed",
            params: { turn: { status: "interrupted" } },
          }),
        5,
      );
    }
  });
} else {
  let prompt = "";
  process.stdin.on("data", (d) => (prompt += d));
  process.stdin.on("end", () => {
    log({ prompt });
    send({ type: "system", subtype: "init", session_id: "claude-session" });
    send({
      type: "assistant",
      message: { content: [{ type: "text", text: "Fixture output" }] },
    });
    // Hold an observable run for the synthetic README scene; never call a model.
    if (prompt === "readme-relay-hold") {
      setInterval(() => {}, 1000);
      return;
    }
    send({
      type: "result",
      session_id: "claude-session",
      result: "Finished",
      is_error: false,
      permission_denials:
        prompt === "permission" ? [{ tool_name: "Write" }] : [],
    });
  });
}
