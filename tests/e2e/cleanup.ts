import fs from "node:fs/promises";
import type { ElectronApplication } from "@playwright/test";

/** Discard only disposable test windows, then let normal shutdown release runners and SQLite. */
export async function closeTestApp(app: ElectronApplication) {
  await app.evaluate(({ BrowserWindow, dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
  }).catch(() => {});
  await app.close().catch(() => {});
}

export async function removeTestDirectory(directory: string) {
  await fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
