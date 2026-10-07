import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";

const disposers = new WeakMap<TestContext, (() => void)[]>();

/** Node test hooks run in registration order. Close handles before removing Windows directories. */
export function temporaryDirectory(t: TestContext, prefix: string) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  const cleanup: (() => void)[] = [];
  disposers.set(t, cleanup);
  t.after(() => {
    try {
      for (const close of cleanup.reverse()) close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
  return directory;
}

export function beforeRemove(t: TestContext, close: () => void) {
  const cleanup = disposers.get(t);
  if (!cleanup) throw new Error("Create a temporaryDirectory before registering its handles");
  cleanup.push(close);
}
