import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CLIENTS, type HarnessId } from "../shared/clients";
import type { Capabilities, Settings } from "../shared/domain";
import { detect } from "./local";

const exec = promisify(execFile);
export function discoverClient(
  id: HarnessId,
  configured = "",
  platform: NodeJS.Platform = process.platform,
) {
  const entry = CLIENTS.find((c) => c.id === id);
  if (!entry) return { executable: "", appPath: "" };
  let appPath = "",
    executable = "";
  if (configured) {
    if (!path.isAbsolute(configured) || !fs.existsSync(configured))
      return { executable, appPath };
    if (configured.endsWith(".app") && fs.statSync(configured).isDirectory())
      appPath = configured;
    else if (fs.statSync(configured).isFile()) executable = configured;
    return { executable, appPath };
  }
  if (platform === "darwin")
    for (const root of [
      "/Applications",
      path.join(os.homedir(), "Applications"),
    ])
      for (const app of entry.apps) {
        const candidate = path.join(root, app);
        if (
          !appPath &&
          fs.existsSync(path.join(candidate, "Contents", "Info.plist"))
        )
          appPath = candidate;
      }
  const dirs = [
    ...(process.env.PATH ?? "").split(path.delimiter),
    path.join(os.homedir(), ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  for (const dir of dirs)
    for (const name of entry.commands) {
      // The generic name "agent" alone is not evidence of a Cursor installation.
      if (name === "agent" && !appPath) continue;
      for (const suffix of platform === "win32" ? [".exe", ".cmd", ""] : [""]) {
        const file = path.join(dir, name + suffix);
        try {
          fs.accessSync(file, fs.constants.X_OK);
          if (!executable && fs.statSync(file).isFile()) executable = file;
        } catch {}
      }
    }
  if (platform === "win32" && !executable) {
    const names = entry.apps.map((n) => n.replace(/\.app$/, ""));
    for (const root of [
      process.env.LOCALAPPDATA,
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
    ].filter(Boolean) as string[])
      for (const name of names)
        for (const sub of [name, path.join("Programs", name)]) {
          const file = path.join(root, sub, `${name}.exe`);
          if (fs.existsSync(file)) {
            appPath = file;
            break;
          }
        }
  }
  return { executable, appPath };
}
export async function detectClient(
  id: HarnessId,
  configured = "",
): Promise<Capabilities> {
  if (id === "codex" || id === "claude") {
    const cap = await detect(id, configured.endsWith(".app") ? "" : configured);
    const { appPath } = discoverClient(
      id,
      configured.endsWith(".app") ? configured : "",
    );
    return {
      ...cap,
      appPath,
      open: Boolean(appPath || cap.executable),
      installed: cap.installed || Boolean(appPath),
    };
  }
  const found = discoverClient(id, configured);
  let version = "";
  if (found.appPath.endsWith(".app"))
    try {
      version = (
        await exec(
          "/usr/libexec/PlistBuddy",
          [
            "-c",
            "Print :CFBundleShortVersionString",
            path.join(found.appPath, "Contents", "Info.plist"),
          ],
          { timeout: 3000 },
        )
      ).stdout.trim();
    } catch {}
  const installed = Boolean(found.appPath || found.executable);
  return {
    provider: id,
    ...found,
    version,
    installed,
    open: installed,
    background: false,
    resume: false,
    model: false,
    effort: false,
    speed: false,
    modes: [],
    reason: installed
      ? "MANUAL_HANDOFF_ONLY"
      : configured
        ? "CONFIGURED_PATH_NOT_FOUND"
        : "NOT_INSTALLED",
  };
}
export async function detectClients(settings: Settings) {
  return Promise.all(
    CLIENTS.map((c) =>
      detectClient(
        c.id,
        settings.clientPaths[c.id] ||
          (c.id === "codex"
            ? settings.codexPath
            : c.id === "claude"
              ? settings.claudePath
              : ""),
      ),
    ),
  );
}
