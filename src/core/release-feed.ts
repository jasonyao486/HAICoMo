import { z } from "zod";
import { compareVersions, parseVersion } from "../shared/version";

// Official update source: the repository's GitHub releases, including pre-releases.
// The resolver only chooses a version; electron-updater still downloads the
// release's own latest*.yml and verifies the payload's SHA-512 before install.
export const OFFICIAL_RELEASES = { owner: "jasonyao486", repo: "HAICoMo", apiOrigin: "https://api.github.com", downloadOrigin: "https://github.com" } as const;
export type ReleaseTarget = { platform: "darwin"; arch: "arm64" } | { platform: "win32"; arch: "x64" };
export type HttpResponse = { status: number; header(name: string): string | null; text: string };
export type HttpGet = (url: string, headers: Record<string, string>) => Promise<HttpResponse>;
export type ResolveResult =
  | { kind: "update"; version: string; tag: string; feed: string; notes: string; page: string }
  | { kind: "none"; newerWithoutPackage?: string; page?: string };
export type ReleaseOrigins = { apiOrigin: string; downloadOrigin: string; owner: string; repo: string };

export function releaseTarget(platform: string, arch: string): ReleaseTarget | null {
  if (platform === "darwin" && arch === "arm64") return { platform, arch };
  if (platform === "win32" && arch === "x64") return { platform, arch };
  return null;
}
export function platformAssets(target: ReleaseTarget, version: string) {
  return target.platform === "darwin"
    ? { metadata: "latest-mac.yml", payload: `HAICoMo-${version}-arm64-mac.zip` }
    : { metadata: "latest.yml", payload: `HAICoMo-${version}-windows-x64-setup.exe` };
}
const base = (o: ReleaseOrigins) => `${o.downloadOrigin.replace(/\/+$/, "")}/${o.owner}/${o.repo}/releases`;
export const releaseFeed = (o: ReleaseOrigins, tag: string) => `${base(o)}/download/${tag}/`;
export const releasePage = (o: ReleaseOrigins, tag?: string) => tag ? `${base(o)}/tag/${tag}` : base(o);
/** A per-version official download folder, as 0.3.5 users paste it to reach 0.4.0. */
export function isOfficialTagFeed(url: string) {
  return /^https:\/\/github\.com\/jasonyao486\/HAICoMo\/releases\/download\/v\d+\.\d+\.\d+\/?$/i.test(url.trim());
}

const releaseSchema = z.object({
  tag_name: z.string().max(200),
  draft: z.boolean().optional().default(false),
  prerelease: z.boolean().optional().default(false),
  body: z.string().nullable().optional(),
  assets: z.array(z.object({ name: z.string().max(500), state: z.string().max(50).optional() }).passthrough()).max(200).default([]),
}).passthrough();
const releasesSchema = z.array(releaseSchema).max(100);
const NOTES_LIMIT = 8000;

/** Pure release selection over a GitHub "list releases" response. */
export function selectRelease(json: unknown, current: string, target: ReleaseTarget, origins: ReleaseOrigins): ResolveResult {
  const parsed = releasesSchema.safeParse(json);
  if (!parsed.success) throw new Error("UPDATE_RELEASE_LIST_INVALID");
  let chosen: { version: string; tag: string; notes: string } | undefined;
  let newest: { version: string; tag: string } | undefined;
  for (const release of parsed.data) {
    if (release.draft) continue;
    const match = /^v(\d+\.\d+\.\d+)$/.exec(release.tag_name);
    if (!match || !parseVersion(match[1]) || compareVersions(match[1], current) <= 0) continue;
    const version = match[1];
    if (!newest || compareVersions(version, newest.version) > 0) newest = { version, tag: release.tag_name };
    const wanted = platformAssets(target, version);
    const uploaded = (name: string) => release.assets.some((a) => a.name === name && (a.state === undefined || a.state === "uploaded"));
    if (!uploaded(wanted.metadata) || !uploaded(wanted.payload)) continue;
    if (!chosen || compareVersions(version, chosen.version) > 0)
      chosen = { version, tag: release.tag_name, notes: (release.body ?? "").trim().slice(0, NOTES_LIMIT) };
  }
  const missing = newest && (!chosen || compareVersions(newest.version, chosen.version) > 0) ? newest : undefined;
  if (!chosen) return missing ? { kind: "none", newerWithoutPackage: missing.version, page: releasePage(origins, missing.tag) } : { kind: "none" };
  return { kind: "update", version: chosen.version, tag: chosen.tag, feed: releaseFeed(origins, chosen.tag), notes: chosen.notes, page: releasePage(origins, chosen.tag) };
}

function failure(response: HttpResponse): Error {
  if (response.status === 429 || response.status === 403 && response.header("x-ratelimit-remaining") === "0") {
    const reset = Number(response.header("x-ratelimit-reset"));
    return new Error(`UPDATE_RATE_LIMITED: ${Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : ""}`.trim());
  }
  return new Error(`UPDATE_SOURCE_UNAVAILABLE: HTTP ${response.status}`);
}
const network = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /^UPDATE_[A-Z_]+/.test(message) ? error as Error : new Error(`UPDATE_NETWORK: ${message}`);
};

/** Fallback when the API is rate limited: the Atom feed lists tags, and each candidate's metadata file is probed. */
async function resolveFromAtom(get: HttpGet, o: ReleaseOrigins, current: string, target: ReleaseTarget, headers: Record<string, string>): Promise<ResolveResult> {
  const atom = await get(`${base(o)}.atom`, { ...headers, Accept: "application/atom+xml" });
  if (atom.status !== 200) throw failure(atom);
  const tags = [...new Set([...atom.text.matchAll(/\/releases\/tag\/(v\d+\.\d+\.\d+)(?=["<])/g)].map((m) => m[1]))]
    .filter((tag) => compareVersions(tag.slice(1), current) > 0)
    .sort((a, b) => compareVersions(b.slice(1), a.slice(1)));
  for (const tag of tags.slice(0, 5)) {
    const metadata = await get(`${releaseFeed(o, tag)}${platformAssets(target, tag.slice(1)).metadata}`, headers);
    if (metadata.status === 200) return { kind: "update", version: tag.slice(1), tag, feed: releaseFeed(o, tag), notes: "", page: releasePage(o, tag) };
    if (metadata.status !== 404) throw failure(metadata);
  }
  return tags.length ? { kind: "none", newerWithoutPackage: tags[0].slice(1), page: releasePage(o, tags[0]) } : { kind: "none" };
}

export function createReleaseResolver(get: HttpGet, origins: ReleaseOrigins, userAgent: string) {
  let cached: { etag: string; json: unknown } | undefined;
  return async (current: string, target: ReleaseTarget): Promise<ResolveResult> => {
    const headers: Record<string, string> = { "User-Agent": userAgent };
    const api = `${origins.apiOrigin.replace(/\/+$/, "")}/repos/${origins.owner}/${origins.repo}/releases?per_page=20`;
    let response: HttpResponse;
    try {
      response = await get(api, { ...headers, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(cached ? { "If-None-Match": cached.etag } : {}) });
    } catch (error) { throw network(error); }
    if (response.status === 304 && cached) return selectRelease(cached.json, current, target, origins);
    if (response.status === 200) {
      let json: unknown;
      try { json = JSON.parse(response.text); } catch { throw new Error("UPDATE_RELEASE_LIST_INVALID"); }
      const result = selectRelease(json, current, target, origins);
      const etag = response.header("etag");
      cached = etag ? { etag, json } : undefined;
      return result;
    }
    const error = failure(response);
    if (!error.message.startsWith("UPDATE_RATE_LIMITED")) throw error;
    try { return await resolveFromAtom(get, origins, current, target, headers); }
    catch { throw error; }
  };
}
