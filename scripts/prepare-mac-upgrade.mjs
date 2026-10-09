import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileHash } from './mac-release-state.mjs';
if (process.platform !== 'darwin') throw new Error('Mac upgrade requires macOS');
const {version} = JSON.parse(fs.readFileSync('package.json','utf8'));
const root = path.resolve(`validation/${version}/mac-upgrade`);
fs.mkdirSync(root, {recursive:true});
const name = 'HAICoMo-0.3.5-arm64-mac.zip';
for (const file of [name, 'SHA256SUMS-darwin-arm64.txt']) {
  execFileSync('curl', ['--fail','--location','--retry','3','--max-time','600',`https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.5/${file}`,'-o',path.join(root,file)], {stdio:'inherit'});
}
const line = fs.readFileSync(path.join(root,'SHA256SUMS-darwin-arm64.txt'),'utf8').split('\n').find(line=>line.endsWith(`  ${name}`));
if (!line || fileHash(path.join(root,name)) !== line.split(' ')[0]) throw new Error('Previous Mac download checksum mismatch');
execFileSync('ditto', ['-x','-k',path.join(root,name),path.join(root,'previous')]);
execFileSync('codesign', ['--verify','--deep','--strict',path.join(root,'previous/HAICoMo.app')]);
