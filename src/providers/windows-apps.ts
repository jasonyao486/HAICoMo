import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HarnessId } from "../shared/clients";

export type DesktopApps = Partial<Record<HarnessId, string>>;
const exec = promisify(execFile);
let cached: { until: number; value: Promise<DesktopApps> } | undefined;

/** Query the current user's package registration; never guess a versioned WindowsApps path. */
export async function windowsStoreApps(): Promise<DesktopApps> {
  if (process.platform !== "win32") return {};
  if (cached && cached.until > Date.now()) return cached.value;
  const value = (async () => {
    try {
      const { stdout } = await exec("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
        "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new(); Get-AppxPackage -Name Claude | ForEach-Object { $p=$_; $m=Get-AppxPackageManifest $p; $m.Package.Applications.Application | Where-Object Id -eq 'Claude' | ForEach-Object { Join-Path $p.InstallLocation $_.Executable } } | ConvertTo-Json -Compress",
      ], { timeout: 5000, windowsHide: true, maxBuffer: 65536 });
      const result: unknown = JSON.parse(stdout.trim() || "null");
      const candidates = typeof result === "string" ? [result] : Array.isArray(result) ? result : [];
      const app = candidates.find((v): v is string => typeof v === "string" && path.isAbsolute(v) && /[\\/]claude\.exe$/i.test(v) && fs.existsSync(v));
      return app ? { claude: app } : {};
    } catch { return {}; }
  })();
  cached = { until: Date.now() + 10000, value };
  return value;
}
