// Checks that run before a large download, so an update that cannot be applied
// is explained up front instead of failing after the user has waited.
export type MacInstallFacts = { bundle: string; parentWritable: boolean; codesign: string };
export type WindowsInstallFacts = { exe: string; localAppData: string; uninstallerExists: boolean };

/** `codesign` is the stderr text of `codesign -dv <bundle>`. */
export function macPreflight(facts: MacInstallFacts): string | undefined {
  const bundle = facts.bundle.replace(/\/+$/, "");
  if (!bundle.endsWith(".app")) return "UPDATE_UNSUPPORTED_LOCATION";
  if (bundle.includes("/AppTranslocation/")) return "UPDATE_APP_TRANSLOCATED";
  if (bundle.startsWith("/Volumes/") && !facts.parentWritable) return "UPDATE_RUNNING_FROM_DISK_IMAGE";
  if (/Signature=adhoc/i.test(facts.codesign) || !/TeamIdentifier=[A-Z0-9]{10}\b/.test(facts.codesign)) return "UPDATE_UNSIGNED_BUILD";
  return undefined;
}

const winNormal = (value: string) => value.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
export function windowsPreflight(facts: WindowsInstallFacts): string | undefined {
  const exe = winNormal(facts.exe), local = winNormal(facts.localAppData);
  if (!local || !exe.startsWith(`${local}\\`) || !facts.uninstallerExists) return "UPDATE_UNMANAGED_INSTALL";
  return undefined;
}
