import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { discoverClient } from "../src/providers/registry";
import { temporaryDirectory } from "./temp-directory";

function environment(t: any) {
  const root = temporaryDirectory(t, "haicomo-client-discovery-");
  const names = ["PATH", "LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"];
  const old = Object.fromEntries(names.map(n => [n, process.env[n]]));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  process.env.PATH = bin;
  process.env.LOCALAPPDATA = path.join(root, "local");
  process.env.ProgramFiles = path.join(root, "programs");
  delete process.env["ProgramFiles(x86)"];
  t.after(() => { for (const name of names) { if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name]; } });
  const file = (p: string) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, "fixture", { mode: 0o755 }); return p; };
  return { root, bin, file };
}

test("Windows discovers Cursor desktop and CLI independently and respects an explicit desktop choice", t => {
  const f = environment(t);
  const cli = f.file(path.join(f.bin, "cursor.cmd"));
  const userApp = f.file(path.join(process.env.LOCALAPPDATA!, "Programs", "Cursor", "Cursor.exe"));
  const machineApp = f.file(path.join(process.env.ProgramFiles!, "Cursor", "Cursor.exe"));
  assert.deepEqual(discoverClient("cursor", "", "win32"), { executable: cli, appPath: userApp });
  assert.deepEqual(discoverClient("cursor", machineApp, "win32"), { executable: "", appPath: machineApp });
  assert.deepEqual(discoverClient("cursor", cli, "win32"), { executable: cli, appPath: userApp });
  assert.deepEqual(discoverClient("cursor", path.join(f.root, "missing.exe"), "win32"), { executable: "", appPath: "" });
});

test("a registered Claude desktop app is not a CLI and can coexist with Claude Code", t => {
  const f = environment(t);
  const app = f.file(path.join(f.root, "WindowsApps", "Claude_1.0", "app", "Claude.exe"));
  const registered = { claude: app };
  assert.deepEqual(discoverClient("claude", app, "win32", registered), { executable: "", appPath: app });
  const cli = f.file(path.join(f.bin, "claude.exe"));
  assert.deepEqual(discoverClient("claude", "", "win32", registered), { executable: cli, appPath: app });
  assert.deepEqual(discoverClient("claude", cli, "win32", registered), { executable: cli, appPath: app });
});

test("Mac explicit application selection and executable selection retain their distinct meanings", t => {
  const f = environment(t);
  const app = path.join(f.root, "Claude.app");
  fs.mkdirSync(app);
  assert.deepEqual(discoverClient("claude", app, "darwin"), { executable: "", appPath: app });
  const cli = f.file(path.join(f.bin, "claude"));
  assert.equal(discoverClient("claude", cli, "darwin").executable, cli);
});
