#!/usr/bin/env node
const fs = require("node:fs");
const readline = require("node:readline");
const args = process.argv.slice(2);
// The copied script's name selects a dialect: agent (Codex app-server / Claude
// stream-json), kimi (role lines, prompt argument), dsh (DeepSeek Harness
// session/status/final events, prompt on stdin), gemini (message deltas),
// copilot (plain text). No dialect ever calls a model.
// qwen behaves like gemini (Qwen Code shares Gemini CLI's headless interface).
// 0.6.0: kimiacp / kimiacpauth (Kimi with an `acp` command; "auth" refuses
// session/new), hermes / hermescli (with and without `acp`), claudehost (Claude
// with --permission-prompts host over stream-json input).
let dialect = require("node:path").basename(process.argv[1]).replace(/\.(c?js|cmd)$/, "").replace(/^qwen$/, "gemini");
const HELP = {
  agent: "--listen --resume --model stream-json",
  kimi: "-p, --prompt <prompt>  --output-format <format> (choices: \"text\", \"stream-json\")  -S, --session [id]  -m, --model <model>  -y, --yolo  --auto  --plan",
  dsh: "Usage: dsh --profile headless [options] [task...]\n  --json  write newline-delimited run events\n  --session-id <id>",
  gemini: "-p, --prompt  --output-format (choices: \"text\", \"json\", \"stream-json\")  --approval-mode (choices: \"default\", \"auto_edit\", \"yolo\")  -m, --model",
  copilot: "-p, --prompt <text>  --allow-all-tools  --model <model>",
  claudehost: "--resume --model <model> --output-format stream-json --input-format <format> (choices: \"text\", \"stream-json\") --permission-prompts <target> --add-dir <directories...> --permission-mode <mode> (choices: \"default\", \"plan\", \"acceptEdits\")",
  hermes: "Usage: hermes [command]\n\nCommands:\n  chat        Chat with Hermes\n  acp         Run Hermes as an Agent Client Protocol (ACP) server\n",
  hermescli: "Usage: hermes [command]\n\nCommands:\n  chat        Chat with Hermes\n",
};
HELP.kimiacp = HELP.kimiacpauth = `${HELP.kimi}\n\nCommands:\n  acp [options]                 Run kimi-code as an Agent Client Protocol (ACP) server over stdio.\n`;
if (args.includes("--version")) {
  console.log("fixture 1.0.0");
  process.exit(0);
}
if (args.includes("--help")) {
  console.log(dialect.startsWith("hermes") && args[0] === "chat" ? "Usage: hermes chat [options]\n  -q, --query <text>  One query, then exit\n  -Q, --quiet  Programmatic output\n  -m, --model <model>" : HELP[dialect] ?? HELP.agent);
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
/** An ACP server over stdio (JSON-RPC 2.0). Lines of the prompt select a behaviour; no model is called. */
function acpServer(auth) {
  const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
  const note = (method, params) => send({ jsonrpc: "2.0", method, params });
  const chunk = (text) => note("session/update", { sessionId: "acp-session", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } });
  const waiting = new Map();
  let nextId = 500, pendingPrompt = null;
  const ask = (method, params, then) => {
    const id = ++nextId;
    waiting.set(id, then);
    send({ jsonrpc: "2.0", id, method, params });
  };
  const options = [
    { optionId: "ok", name: "Allow once", kind: "allow_once" },
    { optionId: "always", name: "Always allow", kind: "allow_always" },
    { optionId: "no", name: "Reject", kind: "reject_once" },
  ];
  readline.createInterface({ input: process.stdin }).on("line", (line) => {
    const m = JSON.parse(line);
    log(m);
    if (m.id !== undefined && !m.method) {
      const then = waiting.get(m.id);
      waiting.delete(m.id);
      if (then) then(m);
      return;
    }
    if (m.method === "initialize") return reply(m.id, { protocolVersion: 1, agentCapabilities: { loadSession: true }, authMethods: [] });
    if (m.method === "session/new") {
      if (auth) return send({ jsonrpc: "2.0", id: m.id, error: { code: -32000, message: "Authentication required" } });
      return reply(m.id, {
        sessionId: "acp-session",
        modes: { currentModeId: "default", availableModes: [{ id: "default", name: "Default" }, { id: "plan", name: "Plan" }] },
        configOptions: [{ id: "model", name: "Model", category: "model", type: "select", currentValue: "fixture-a", options: [{ value: "fixture-a", name: "A" }, { value: "fixture-b", name: "B" }] }],
      });
    }
    if (m.method === "session/load") {
      chunk("OLD HISTORY");
      return reply(m.id, {});
    }
    if (m.method === "session/set_config_option" || m.method === "session/set_mode") return reply(m.id, {});
    if (m.method === "session/cancel") {
      if (pendingPrompt !== null) reply(pendingPrompt, { stopReason: "cancelled" });
      pendingPrompt = null;
      return;
    }
    if (m.method === "session/prompt") {
      const text = m.params.prompt.map((b) => b.text).join("");
      const has = (k) => text.split(/\r?\n/).includes(k);
      log({ prompt: text });
      pendingPrompt = m.id;
      // An exhausted plan (Kimi 2.2.0): the turn ends at once, no reply, no tool call, no error.
      if (has("acp-empty")) {
        reply(pendingPrompt, { stopReason: "end_turn" });
        pendingPrompt = null;
        return;
      }
      note("session/update", { sessionId: "acp-session", update: { sessionUpdate: "tool_call", toolCallId: "t0", title: "Read files", kind: "read", status: "completed" } });
      const finish = (out) => {
        chunk(out);
        if (pendingPrompt !== null) reply(pendingPrompt, { stopReason: "end_turn" });
        pendingPrompt = null;
      };
      const outcome = (r) => (r.result?.outcome?.outcome === "selected" ? r.result.outcome.optionId : r.result?.outcome?.outcome ?? `error ${r.error?.code}`);
      if (has("acp-hold")) return;
      if (has("acp-permission")) return ask("session/request_permission", { sessionId: "acp-session", toolCall: { toolCallId: "t1", title: "Write notes.md", kind: "edit", locations: [{ path: "notes.md" }] }, options }, (r) => finish(`permission:${outcome(r)}`));
      if (has("acp-destructive")) return ask("session/request_permission", { sessionId: "acp-session", toolCall: { toolCallId: "t2", title: "Run command", kind: "execute", rawInput: { command: "git reset --hard" } }, options }, (r) => finish(`permission:${outcome(r)}`));
      if (has("acp-fs")) return ask("fs/read_text_file", { sessionId: "acp-session", path: "notes.md" }, (r) => finish(`fs:${outcome(r)}`));
      chunk("ACP ");
      return finish(`fixture output${has("handoff-record") ? "\nHAICOMO-HANDOFF-BEGIN\n目标: 写说明\n产物: notes.md; missing.md\n证据: 运行了测试\n下一步: 审阅\n未决问题: 无\nHAICOMO-HANDOFF-END" : ""}`);
    }
  });
}
/** Claude with `--permission-prompts host`: stream-json in, control_request can_use_tool out. */
function hostServer() {
  let waiting = null;
  const result = (text, extra = {}) => send({ type: "result", session_id: "claude-session", result: text, is_error: false, permission_denials: [], ...extra });
  readline.createInterface({ input: process.stdin }).on("line", (line) => {
    const m = JSON.parse(line);
    log(m);
    if (m.type === "control_request" && m.request?.subtype === "initialize") return send({ type: "control_response", response: { subtype: "success", request_id: m.request_id, response: {} } });
    if (m.type === "control_request" && m.request?.subtype === "interrupt") {
      send({ type: "control_response", response: { subtype: "success", request_id: m.request_id, response: {} } });
      if (waiting) send({ type: "control_cancel_request", request_id: "perm-1" });
      waiting = null;
      return result("Interrupted", { is_error: true, subtype: "error_during_execution" });
    }
    if (m.type === "control_response" && waiting) {
      const then = waiting;
      waiting = null;
      return then(m.response.response);
    }
    if (m.type !== "user") return;
    const prompt = String(m.message?.content ?? "");
    log({ prompt });
    send({ type: "system", subtype: "init", session_id: "claude-session", model: "claude-fixture" });
    const has = (k) => prompt.split(/\r?\n/).includes(k);
    if (has("host-hold")) return;
    if (has("host-permission") || has("host-destructive")) {
      send({
        type: "control_request",
        request_id: "perm-1",
        request: has("host-permission")
          ? { subtype: "can_use_tool", tool_name: "Write", input: { file_path: "notes.md", content: "x" }, tool_use_id: "tu1" }
          : { subtype: "can_use_tool", tool_name: "Bash", input: { command: "git reset --hard" }, tool_use_id: "tu2" },
      });
      waiting = (r) => {
        send({ type: "assistant", message: { content: [{ type: "text", text: `decision:${r.behavior}` }] } });
        result(`decision:${r.behavior}`, r.behavior === "deny" ? { permission_denials: [{ tool_name: "Write" }] } : {});
      };
      return;
    }
    send({ type: "assistant", message: { content: [{ type: "text", text: "Host fixture output" }] } });
    result("Host finished");
  });
  process.stdin.on("end", () => process.exit(0));
}
if (args[0] === "acp") return acpServer(dialect.endsWith("auth"));
if (dialect === "claudehost") return hostServer();
if (dialect.startsWith("hermes")) {
  const query = argValue("--query") ?? "";
  log({ prompt: query });
  process.stdout.write("Hermes fixture output\n");
  process.exit(0);
}
if (dialect.startsWith("kimi")) dialect = "kimi";
// A hold line keeps the run observable for synthetic README scenes; it never calls a model.
const HOLD_LINES = ["readme-relay-hold", "Synthetic demonstration: this run waits until it is cancelled."];
const holds = (prompt) => String(prompt).split(/\r?\n/).some((line) => HOLD_LINES.includes(line));
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
    if (holds(prompt)) return setInterval(() => {}, 1000);
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
    const patch = argValue("--patch");
    log({ prompt, patch: patch ? fs.readFileSync(patch, "utf8") : null });
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
      mode = m.params.input[0].text.split(/\r?\n/).find(line => ["approve", "cancel", "cancelQueued", "cancelWithoutCompletion", "recommend", ...HOLD_LINES].includes(line)) ?? m.params.input[0].text;
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
      else if (!["cancel", "cancelWithoutCompletion", "cancelQueued", ...HOLD_LINES].includes(mode))
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
    if (holds(prompt)) {
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
