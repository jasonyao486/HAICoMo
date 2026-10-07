import fs from 'node:fs';
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a numeric release version');
if (!process.env.GITHUB_ENV) throw new Error('This helper requires GITHUB_ENV');
fs.appendFileSync(process.env.GITHUB_ENV, `HAICOMO_VERSION=${version}\nHAICOMO_EVIDENCE_DIR=validation/${version}/regression\nHAICOMO_SCREENSHOT_DIR=validation/${version}/screens\n`);
