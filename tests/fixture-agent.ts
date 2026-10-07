import fs from "node:fs";
import path from "node:path";

/** Exercise production npm-shim resolution on Windows, shebang execution elsewhere. */
export function fixtureAgent(directory: string) {
  const script = path.join(directory, "agent.cjs");
  fs.copyFileSync(path.resolve("tests/fixtures/agent.cjs"), script);
  fs.chmodSync(script, 0o755);
  if (process.platform !== "win32") return script;
  const shim = path.join(directory, "agent.cmd");
  fs.writeFileSync(shim, '@echo off\r\nset "dp0=%~dp0"\r\nnode "%dp0%\\agent.cjs" %*\r\n');
  return shim;
}
