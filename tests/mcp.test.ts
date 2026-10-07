import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ProjectStore } from "../src/core/store";
import { exampleProposal } from "../src/core/files";
import { createFreshProject } from "../src/core/lifecycle";

test("MCP offers offline collaboration without human approval tools", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "haicomo-mcp-"));
  const store = new ProjectStore(directory, "MCP project");
  const proposal = exampleProposal(store.state());
  store.close();
  const client = new Client({ name: "haicomo-test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: process.env.HAICOMO_MCP_BUNDLE
      ? [path.resolve("dist-electron/haicomo-mcp.cjs"), "--project", directory]
      : ["--import", "tsx", path.resolve("src/mcp.ts"), "--project", directory],
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const listing = await client.listTools();
    assert.deepEqual(
      listing.tools.map((t) => t.name).sort(),
      [
        "haicomo_read",
        "haicomo_submit_proposal",
        "haicomo_receipt",
        "haicomo_proposals",
        "haicomo_report_event",
      ].sort(),
    );
    const result: any = await client.callTool({
      name: "haicomo_read",
      arguments: {},
    });
    assert.equal(JSON.parse(result.content[0].text).title, "MCP project");
    const submitted: any = await client.callTool({
      name: "haicomo_submit_proposal",
      arguments: { proposal },
    });
    assert.equal(JSON.parse(submitted.content[0].text).status, "submitted");
    const receipt: any = await client.callTool({
      name: "haicomo_receipt",
      arguments: { proposalId: proposal.proposalId },
    });
    assert.equal(JSON.parse(receipt.content[0].text).status, "unknown");
    const reopened = new ProjectStore(directory);
    assert.equal(reopened.proposals().length, 1);
    reopened.close();
    const file = path.join(directory, "HAICoMo.haicomo");
    fs.unlinkSync(file);
    const missing: any = await client.callTool({
      name: "haicomo_read",
      arguments: {},
    });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /ENTRY_NOT_FOUND/);
    createFreshProject(file, "Replacement");
    const replaced: any = await client.callTool({
      name: "haicomo_read",
      arguments: {},
    });
    assert.equal(replaced.isError, true);
    assert.match(replaced.content[0].text, /PROJECT_REPLACED/);
  } finally {
    await client.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
