import fs from 'node:fs';
const {version} = JSON.parse(fs.readFileSync('package.json','utf8'));
const evidence = JSON.parse(fs.readFileSync(`validation/${version}/mac-upgrade/test/result.json`,'utf8'));
if (evidence.fromVersion !== '0.3.5' || evidence.toVersion !== version || !['project','settings','rules','launch'].every(key=>evidence[key]===true)) throw new Error('Mac installed upgrade verification failed');
const file = `release/${version}/mac-release-verification.json`;
const report = JSON.parse(fs.readFileSync(file,'utf8'));
Object.assign(report, {previousVersionUpgrade:evidence.fromVersion,upgradeProject:true,upgradeSettings:true});
fs.writeFileSync(file, JSON.stringify(report,null,2)+'\n');
