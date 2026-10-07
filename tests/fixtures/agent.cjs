#!/usr/bin/env node
const fs = require("node:fs");
const readline = require("node:readline");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("fixture 1.0.0");
  process.exit(0);
}
if (args.includes("--help")) {
  console.log("--listen --resume --model stream-json");
  process.exit(0);
}
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const log = (value) =>
  fs.appendFileSync(
    require("node:path").join(__dirname, "requests.jsonl"),
    JSON.stringify(value) + "\n",
  );
log({ args });
if (args[0] === "app-server") {
  let mode = "",
    responses = 0;
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
      mode = m.params.input[0].text;
      send({ id: m.id, result: { turn: { id: "turn-fixture" } } });
      send({
        method: "turn/started",
        params: { turn: { id: "turn-fixture" } },
      });
      if (mode === "approve") {
        for (const id of [9001, 9002])
          send({
            id,
            method: "item/commandExecution/requestApproval",
            params: { command: "echo safe" },
          });
      } else if (mode === "questions")
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
      else if (mode !== "cancel")
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
      if (mode === "questions" || responses === 2)
        send({
          method: "turn/completed",
          params: { turn: { status: "completed" } },
        });
    }
    if (m.method === "turn/interrupt") {
      if (m.params.turnId !== "turn-fixture")
        return send({ id: m.id, error: { message: "wrong turn id" } });
      send({ id: m.id, result: {} });
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
