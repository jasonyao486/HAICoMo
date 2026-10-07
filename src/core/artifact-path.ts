import path from "node:path";
import { portableArtifactPath } from "../shared/artifact-path";

export function resolveArtifactPath(directory: string, value: string, platform = process.platform) {
  const p = portableArtifactPath(value);
  const windowsAbsolute = /^[A-Za-z]:/.test(p) || p.startsWith("//");
  if ((platform !== "win32" && windowsAbsolute) || (platform === "win32" && p.startsWith("/") && !p.startsWith("//")))
    throw new Error("ARTIFACT_FOREIGN_ABSOLUTE_PATH");
  return (platform === "win32" ? path.win32 : path.posix).resolve(directory, p);
}
