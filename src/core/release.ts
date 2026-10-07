// A release is prepared locally; uploading remains a separate human action.
export function releaseOptions(platform: string, feed: string, identity: string) {
  let url: URL;
  try { url = new URL(feed); } catch { throw new Error("RELEASE_UPDATE_SOURCE_REQUIRED"); }
  if (url.protocol !== "https:" || url.username || url.password || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("RELEASE_HTTPS_SOURCE_REQUIRED");
  if (platform === "darwin" && !identity.startsWith("Developer ID Application:")) throw new Error("RELEASE_DISTRIBUTION_SIGNATURE_REQUIRED");
  if (platform !== "darwin" && platform !== "win32") throw new Error("RELEASE_PLATFORM_NOT_VALIDATED");
  if (platform === "win32" && !identity) throw new Error("RELEASE_DISTRIBUTION_SIGNATURE_REQUIRED");
  return { provider: "generic" as const, url: url.href };
}
export function releaseArtifacts(platform: string, names: string[]) {
  const required = platform === "darwin" ? [/\.dmg$/, /\.zip$/, /^latest-mac\.yml$/] : [/\.exe$/, /^latest\.yml$/];
  if (!required.every((pattern) => names.some((name) => pattern.test(name)))) throw new Error("RELEASE_UPDATE_ARTIFACTS_MISSING");
  if (names.some((name) => /upgrade-fixture|Upgrade.Test/i.test(name))) throw new Error("RELEASE_TEST_FIXTURE_FORBIDDEN");
}
