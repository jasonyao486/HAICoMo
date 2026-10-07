import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import {
  resolveEntry,
  readSnapshot,
  readJson,
  publishProposal,
  publishEvent,
} from "./core/files";
import { proposalSchema, runEventSchema, idSchema } from "./shared/domain";
import { APP_VERSION } from "./shared/version";

export async function serveMcp(directory: string) {
  const entry = resolveEntry(directory);
  const check = () => {
    const current = resolveEntry(entry.entryPath);
    if (current.id !== entry.id || current.epoch !== entry.epoch)
      throw new Error("PROJECT_REPLACED");
  };
  const dir = entry.directory,
    root = path.join(dir, ".haicomo");
  const server = new McpServer({ name: "haicomo", version: APP_VERSION });
  const output = (value: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  });
  server.registerTool(
    "haicomo_read",
    {
      description:
        "Read the saved project snapshot. This is not live agent state.",
      inputSchema: {},
    },
    async () => {
      check();
      return output(readSnapshot(dir));
    },
  );
  server.registerTool(
    "haicomo_submit_proposal",
    {
      description:
        "Submit an immutable proposal for HUMAN review. Cannot approve, accept, archive or delete.",
      inputSchema: { proposal: proposalSchema },
    },
    async ({ proposal }) => {
      check();
      return output(publishProposal(dir, proposal));
    },
  );
  server.registerTool(
    "haicomo_receipt",
    {
      description:
        "Read the decision for an existing proposal ID. Missing means unknown; do not resubmit with a new ID.",
      inputSchema: { proposalId: idSchema },
    },
    async ({ proposalId }) => {
      check();
      const file = path.join(root, "receipts", `${proposalId}.json`);
      return output(
        fs.existsSync(file)
          ? readJson(file)
          : { proposalId, status: "unknown" },
      );
    },
  );
  server.registerTool(
    "haicomo_proposals",
    {
      description:
        "List immutable submitted proposals and any receipts. Not all submitted files may have been received yet.",
      inputSchema: {},
    },
    async () => {
      check();
      return output(
        fs
          .readdirSync(path.join(root, "inbox"))
          .filter((n) => n.endsWith(".ready"))
          .map((n) => {
            const id = n.slice(0, -6),
              file = path.join(root, "receipts", `${id}.json`);
            return {
              proposalId: id,
              receipt: fs.existsSync(file) ? readJson(file) : null,
            };
          }),
      );
    },
  );
  server.registerTool(
    "haicomo_report_event",
    {
      description:
        "Report your own task execution status. Self-report does not certify completion or human acceptance.",
      inputSchema: { event: runEventSchema },
    },
    async ({ event }) => {
      check();
      return output(publishEvent(dir, event));
    },
  );
  await server.connect(new StdioServerTransport());
  return server;
}
const i = process.argv.indexOf("--project");
if (i >= 0 && process.argv[i + 1])
  void serveMcp(process.argv[i + 1]).catch((e) => {
    process.stderr.write(String(e) + "\n");
    process.exitCode = 1;
  });
