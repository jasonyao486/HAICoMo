import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = path.resolve("assets/runtime");
const manifest = JSON.parse(fs.readFileSync("assets/manifest.json", "utf8"));
const expected = new Set();
for (const item of manifest.files) {
  if (!/^local-assets\/[a-z0-9-]+\.(png|gif|svg)$/.test(item.file) || expected.has(item.file) || !item.license || !item.creator || !item.source)
    throw new Error(`Invalid public asset: ${item.file}`);
  expected.add(item.file);
  const file = path.join(root, item.file), stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe asset: ${item.file}`);
  const data = fs.readFileSync(file);
  if (data.length !== item.bytes || createHash("sha256").update(data).digest("hex") !== item.sha256) throw new Error(`Asset checksum mismatch: ${item.file}`);
  if (item.file.endsWith(".svg") && /<script|<foreignObject|(?:href|src)\s*=\s*["'](?:https?:|file:|\/\/)/i.test(data.toString())) throw new Error(`Active/external SVG: ${item.file}`);
}
function walk(dir, prefix = "") {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name), relative = prefix + name, stat = fs.lstatSync(file);
    if (stat.isDirectory() && !stat.isSymbolicLink()) walk(file, relative + "/");
    else if (!expected.has(relative)) throw new Error(`Unlisted runtime file: ${relative}`);
  }
}
walk(root);
console.log(`Verified ${expected.size} public runtime assets.`);
