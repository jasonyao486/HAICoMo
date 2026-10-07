import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CLIENTS, type HarnessId } from "../shared/clients";
import type { Capabilities, Settings } from "../shared/domain";
import { detect } from "./local";
import { windowsStoreApps, type DesktopApps } from "./windows-apps";

const exec = promisify(execFile);
export function discoverClient(
  id: HarnessId,
  configured = "",
  platform: NodeJS.Platform = process.platform,
  desktopApps: DesktopApps = {},
) {
  const entry = CLIENTS.find((c) => c.id === id);
  if (!entry) return { executable: "", appPath: "" };
  let appPath = "",
    executable = "";
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
  if (platform === "win32") {
    const candidates = [
      desktopApps[id],
      ...(id === "codex" && process.env.LOCALAPPDATA
        ? [path.join(process.env.LOCALAPPDATA, "Programs", "OpenAI", "Codex", "Codex.exe")]
        : []),
      ...[process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]
        .filter((root): root is string => Boolean(root))
        .flatMap(root => entry.apps.flatMap(app => {
          const name = app.replace(/\.app$/, "");
          return [path.join(root, name, `${name}.exe`), path.join(root, "Programs", name, `${name}.exe`)];
        })),
    ];
    appPath = candidates.find((file): file is string => {
      if (!file) return false;
      try { return fs.statSync(file).isFile(); } catch { return false; }
    }) ?? "";
    // Both a per-user and an all-users copy can be installed. Honour an explicit selection.
    if (configured && candidates.some(file => file && path.resolve(file).toLowerCase() === path.resolve(configured).toLowerCase())) appPath = configured;
  }
  if (configured) {
    if (!path.isAbsolute(configured) || !fs.existsSync(configured))
      return { executable: "", appPath: "" };
    if (configured.endsWith(".app") && fs.statSync(configured).isDirectory())
      return { executable: "", appPath: configured };
    if (platform === "win32" && appPath && path.resolve(configured).toLowerCase() === path.resolve(appPath).toLowerCase())
      return { executable: "", appPath };
    return { executable: fs.statSync(configured).isFile() ? configured : "", appPath };
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
  return { executable, appPath };
}
export async function detectClient(
  id: HarnessId,
  configured = "",
): Promise<Capabilities> {
  const found = discoverClient(id, configured, process.platform, await windowsStoreApps());
  if (id === "codex" || id === "claude") {
    const cap = await detect(id, configured && found.appPath === configured ? "" : configured);
    const { appPath } = found;
    return {
      ...cap,
      appPath,
      open: Boolean(appPath || cap.executable),
      installed: cap.installed || Boolean(appPath),
    };
  }
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
