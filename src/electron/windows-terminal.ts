import { spawn } from "node:child_process";

/** Start gives the terminal its own console/stdio. Detached + ignored stdin exits immediately. */
export function launchWindowsTerminal(directory: string) {
  // Every command argument is fixed. The project path is passed only as cwd,
  // so quotes, spaces and shell metacharacters in folder names stay literal.
  return spawn("cmd.exe", ["/d", "/c", "start", "", "powershell.exe", "-NoExit"], {
    cwd: directory,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
}
