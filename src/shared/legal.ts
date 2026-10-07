import { z } from "zod";
export const LEGAL_LINKS = {
  repository: "https://github.com/jasonyao486/HAICoMo",
  releases: "https://github.com/jasonyao486/HAICoMo/releases",
  feedback: "https://github.com/jasonyao486/HAICoMo/issues/new/choose",
  softwareLicense: "https://github.com/jasonyao486/HAICoMo/blob/main/LICENSE",
  assetLicenses: "https://github.com/jasonyao486/HAICoMo/blob/main/ASSET-LICENSES.md",
  thirdParty: "https://github.com/jasonyao486/HAICoMo/blob/main/THIRD-PARTY-NOTICES.md",
  creator: "https://space.bilibili.com/4168597",
  videoAI: "https://www.bilibili.com/video/BV1tE9XBbErS/",
  videoBillion: "https://www.bilibili.com/video/BV1bARXBYEZz/",
  whaleOriginal: "https://b23.tv/3dNz55h",
  ccSummary: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  ccLegal: "https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode",
} as const;
export type LegalLinkId = keyof typeof LEGAL_LINKS;
export const LEGAL_ATTRIBUTION = { creator: "ZipZipPipe", originalCreator: "上善无形", license: "CC BY-NC-SA 4.0", scope: "whale-character-and-adaptations", videos: { videoAI: "大AI和小AI们", videoBillion: "“亿万”身家的她们" } } as const;
const linkSchema = z.object({ linkId: z.enum(Object.keys(LEGAL_LINKS) as [LegalLinkId, ...LegalLinkId[]]) }).strict();
export async function openLegalLink(input: unknown, open: (url: string) => Promise<unknown>): Promise<void> {
  const result = linkSchema.safeParse(input);
  if (!result.success) throw new Error("LEGAL_LINK_NOT_ALLOWED");
  try { await open(LEGAL_LINKS[result.data.linkId]); }
  catch { throw new Error("LEGAL_LINK_OPEN_FAILED"); }
}
