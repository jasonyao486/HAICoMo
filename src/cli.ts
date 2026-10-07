import fs from "node:fs";
import path from "node:path";
import {
  publishProposal,
  publishEvent,
  readSnapshot,
  resolveEntry,
  readJson,
  collaborationStatus,
} from "./core/files";
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
try {
  const command = args[0],
    directory = flag("--project");
  if (!directory)
    throw new Error(
      "Usage: haicomo-cli <read|status|submit|receipt|event> --project <directory> [--file proposal.json] [--id proposalId]",
    );
  const root = path.join(resolveEntry(directory).directory, ".haicomo");
  let result: unknown;
  if (command === "read") result = readSnapshot(directory);
  else if (command === "status") result = collaborationStatus(directory);
  else if (command === "submit" || command === "event") {
    const file = flag("--file");
    if (!file) throw new Error("--file is required");
    const payload = readJson(file);
    result =
      command === "submit"
        ? publishProposal(directory, payload)
        : publishEvent(directory, payload);
  } else if (command === "receipt") {
    const id = flag("--id");
    if (!id || !/^[\w-]{1,100}$/.test(id)) throw new Error("Invalid --id");
    const file = path.join(root, "receipts", `${id}.json`);
    result = fs.existsSync(file)
      ? readJson(file)
      : { proposalId: id, status: "unknown" };
  } else
    throw new Error("Unknown command; agents cannot approve or accept tasks");
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} catch (error) {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
}
