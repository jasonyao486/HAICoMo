/** A visible command for the user's terminal; never passed to shell execution. */
export function terminalCommand(
  platform: string,
  directory: string,
  args: string[],
) {
  if (platform === "win32") {
    const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
    return `Set-Location -LiteralPath ${quote(directory)}; if ($?) { & ${args.map(quote).join(" ")} }`;
  }
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  return `cd -- ${quote(directory)} && ${args.map(quote).join(" ")}`;
}
