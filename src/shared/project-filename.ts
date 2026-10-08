/** A portable default; the save dialog may still choose another entry name. */
export function projectFilename(title: string): string {
  let stem = title.replace(/[\p{Cc}\uD800-\uDFFF<>:"/\\|?*]/gu, "_").replace(/[ .]+$/g, "");
  while (/\.haicomo$/i.test(stem)) stem = stem.slice(0, -8).replace(/[ .]+$/g, "");
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(stem)) stem = "_" + stem;
  let limited = "";
  const encoder = new TextEncoder();
  for (const character of stem) {
    if (encoder.encode(limited + character).length > 180) break;
    limited += character;
  }
  return (limited.replace(/[ .]+$/g, "") || "HAICoMo") + ".haicomo";
}
