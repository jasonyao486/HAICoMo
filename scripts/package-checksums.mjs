import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const root = path.resolve(`release/${pkg.version}`);
const names = fs.readdirSync(root).filter(n => /\.(dmg|zip|exe|blockmap)$/.test(n)).sort();
if (!names.length) throw new Error("No release installers found");
const lines = [];
for (const name of names) {
  const h = createHash("sha256");
  for await (const chunk of fs.createReadStream(path.join(root, name))) h.update(chunk);
  lines.push(`${h.digest("hex")}  ${name}`);
}
const target = path.join(root, `SHA256SUMS-${process.platform}-${process.arch}.txt`);
fs.writeFileSync(target, lines.join("\n") + "\n"); console.log(target);
