/** Protocol-relative paths use '/' on all operating systems; immutable input bytes stay untouched. */
export function portableArtifactPath(value: string) { return value.replaceAll("\\", "/"); }
export function externalArtifactPath(value: string) {
  const p = portableArtifactPath(value);
  return p.startsWith("/") || /^[A-Za-z]:/.test(p) || p.split("/").includes("..");
}
export function artifactPromptPath(value: string) {
  return `${portableArtifactPath(value)}${externalArtifactPath(value) ? " [external reference; locate on this computer]" : ""}`;
}
