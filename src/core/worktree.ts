import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Git working copies for the parallel steps of one relay stage. Each step gets
 * its own branch in `<project>/.haicomo/worktrees`; when the stage completes the
 * copies are committed and merged into the branch the repository is on. Every
 * git call is an argument array; nothing is ever forced, reset or cleaned, and a
 * conflicting merge is aborted and left to the human.
 */
const run = promisify(execFile);
export type WorktreeInfo = { root: string; path: string; branch: string; cwd: string };
export class WorktreeError extends Error {
  constructor(readonly code: "WORKTREE_GIT" | "WORKTREE_DIRTY" | "WORKTREE_GIT_BUSY" | "WORKTREE_DETACHED" | "WORKTREE_IDENTITY" | "WORKTREE_MERGE_CONFLICT" | "WORKTREE_FAILED", detail = "") {
    super(`${code}${detail ? `: ${detail}` : ""}`);
  }
}
const env = () => ({ ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" });
async function git(cwd: string, args: string[], timeout = 60000) {
  const { stdout } = await run("git", args, { cwd, timeout, env: env(), windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim();
}
async function gitOk(cwd: string, args: string[]) {
  try {
    await git(cwd, args);
    return true;
  } catch {
    return false;
  }
}
/**
 * Git reports canonical paths; a project path may use a Windows 8.3 short name,
 * another letter case or a symlink (/var → /private/var). Compare real paths only.
 */
const real = (p: string) => {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
};
const detail = (error: unknown) => String((error as any)?.stderr || (error as Error)?.message || error).trim().split(/\r?\n/).slice(-3).join(" ").slice(0, 400);

/** The top level of the git working tree that contains `directory`, or null. */
export async function gitTopLevel(directory: string): Promise<string | null> {
  try {
    const top = await git(directory, ["rev-parse", "--show-toplevel"], 15000);
    return top ? real(path.resolve(top)) : null;
  } catch {
    return null;
  }
}
const relative = (root: string, directory: string) => path.relative(real(root), real(directory)).split(path.sep).join("/");
/** HAICoMo's own files never count as the user's changes and are never committed from a working copy. */
function ownFiles(root: string, projectDir: string) {
  const rel = relative(root, projectDir);
  return [`:(exclude)${rel ? `${rel}/` : ""}.haicomo`, ":(exclude,glob)**/*.haicomo"];
}
/** The repository is on a branch, has a commit, has no operation in progress and no uncommitted tracked changes. */
export async function assertReady(root: string, projectDir: string) {
  if (!(await gitOk(root, ["rev-parse", "--verify", "HEAD"]))) throw new WorktreeError("WORKTREE_GIT");
  if (!(await gitOk(root, ["symbolic-ref", "-q", "HEAD"]))) throw new WorktreeError("WORKTREE_DETACHED");
  for (const marker of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"]) {
    const file = await git(root, ["rev-parse", "--git-path", marker]);
    if (fs.existsSync(path.resolve(root, file))) throw new WorktreeError("WORKTREE_GIT_BUSY", marker);
  }
  const dirty = await git(root, ["status", "--porcelain", "--untracked-files=no", "--", ".", ...ownFiles(root, projectDir)]);
  if (dirty) throw new WorktreeError("WORKTREE_DIRTY", dirty.split(/\r?\n/).slice(0, 5).join(", "));
}
/** `.haicomo/.gitignore` names `worktrees/`, so working copies never show up as untracked files. */
export function ensureIgnored(projectDir: string) {
  const file = path.join(projectDir, ".haicomo", ".gitignore");
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {}
  if (text.split(/\r?\n/).some((line) => line.trim() === "worktrees/")) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${text}${text && !text.endsWith("\n") ? "\n" : ""}worktrees/\n`);
}
const SAFE = /[^A-Za-z0-9._-]/g;
/** Where one step works: deterministic, so a retried step continues in the same copy. */
export function worktreeLocation(projectDir: string, relayId: string, label: string) {
  const relay = relayId.replace(SAFE, "").slice(0, 8) || "relay";
  const step = label.toLowerCase().replace(SAFE, "");
  return { path: path.join(projectDir, ".haicomo", "worktrees", relay, step), branch: `haicomo/${relay}/${step}` };
}
/** Creates (or reuses) the working copy for one step and returns where the agent should work. */
export async function prepareWorktree(projectDir: string, relayId: string, label: string): Promise<WorktreeInfo> {
  const root = await gitTopLevel(projectDir);
  if (!root) throw new WorktreeError("WORKTREE_GIT");
  const { path: location, branch } = worktreeLocation(projectDir, relayId, label);
  const rel = path.relative(root, real(projectDir));
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new WorktreeError("WORKTREE_FAILED", "the project folder is outside the repository");
  const cwd = rel ? path.join(location, rel) : location;
  if (fs.existsSync(path.join(location, ".git"))) {
    if (!fs.existsSync(cwd)) throw new WorktreeError("WORKTREE_FAILED", "the project folder is not tracked in git");
    return { root, path: location, branch, cwd };
  }
  await assertReady(root, projectDir);
  ensureIgnored(projectDir);
  fs.mkdirSync(path.dirname(location), { recursive: true });
  const exists = await gitOk(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
  try {
    await git(root, exists ? ["worktree", "add", location, branch] : ["worktree", "add", "-b", branch, location, "HEAD"]);
  } catch (error) {
    throw new WorktreeError("WORKTREE_FAILED", detail(error));
  }
  if (!fs.existsSync(cwd)) throw new WorktreeError("WORKTREE_FAILED", "the project folder is not tracked in git");
  return { root, path: location, branch, cwd };
}
/**
 * Commits whatever the agent changed in the copy (HAICoMo's own files excluded),
 * merges the branch into the current branch with --no-ff, then removes the copy
 * and its merged branch. A conflict aborts the merge and keeps everything.
 */
export async function mergeWorktree(projectDir: string, info: Pick<WorktreeInfo, "path" | "branch">, message: string): Promise<{ commit: string; removed: boolean }> {
  const root = await gitTopLevel(projectDir);
  if (!root) throw new WorktreeError("WORKTREE_GIT");
  if (fs.existsSync(path.join(info.path, ".git"))) {
    try {
      await git(info.path, ["add", "-A", "--", ".", ...ownFiles(info.path, path.join(info.path, path.relative(root, real(projectDir))))]);
    } catch (error) {
      throw new WorktreeError("WORKTREE_FAILED", detail(error));
    }
    if (!(await gitOk(info.path, ["diff", "--cached", "--quiet"]))) {
      const name = await git(info.path, ["config", "user.name"]).catch(() => "");
      const email = await git(info.path, ["config", "user.email"]).catch(() => "");
      if (!name || !email) throw new WorktreeError("WORKTREE_IDENTITY");
      try {
        await git(info.path, ["commit", "--no-verify", "-m", message]);
      } catch (error) {
        throw new WorktreeError("WORKTREE_FAILED", detail(error));
      }
    }
  }
  await assertReady(root, projectDir);
  try {
    await git(root, ["merge", "--no-ff", "--no-edit", "-m", message, info.branch]);
  } catch (error) {
    const conflicted = await git(root, ["diff", "--name-only", "--diff-filter=U"]).catch(() => "");
    if (conflicted || fs.existsSync(path.resolve(root, await git(root, ["rev-parse", "--git-path", "MERGE_HEAD"]).catch(() => "MERGE_HEAD")))) {
      await gitOk(root, ["merge", "--abort"]);
      throw new WorktreeError("WORKTREE_MERGE_CONFLICT", info.branch);
    }
    throw new WorktreeError("WORKTREE_FAILED", detail(error));
  }
  const commit = await git(root, ["rev-parse", "HEAD"]);
  // Removal is a courtesy: a copy with untracked files is kept, and so is its branch.
  let removed = false;
  if (fs.existsSync(info.path) && (await gitOk(root, ["worktree", "remove", info.path]))) {
    removed = true;
    await gitOk(root, ["branch", "-d", info.branch]);
  } else if (!fs.existsSync(info.path)) removed = await gitOk(root, ["branch", "-d", info.branch]);
  return { commit, removed };
}
