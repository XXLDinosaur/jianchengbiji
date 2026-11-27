const {test} = require('node:test');
const assert = require('node:assert/strict');
const {latestRelease} = require('../src/updates.cjs');
const url = 'https://github.com/XXLDinosaur/jianchengbiji/releases/download/both/';
function release(names) {
  return {tag_name:'both',assets:names.map(name=>({name,size:12,state:'uploaded',browser_download_url:url+encodeURIComponent(name)}))};
}
test('selects the latest Documents x64 stable MSI from a mixed product feed',async () => {
  for (const prefix of ['简成文档','Jiancheng-Documents']) {
    const names=['Jiancheng-Notes-10.0.0-x64.msi','简成笔记-12.0.0-x64.msi','Jiancheng-Documents-5.0.0-arm64.msi',prefix+'-0.5.9-x64.msi',prefix+'-0.5.11-x64.msi'];
    const selected=await latestRelease(async()=>Response.json([{...release([prefix+'-7.0.0-x64.msi']),prerelease:true},release(names)]));
    assert.equal(selected.name,names.at(-1));
    assert.equal(selected.version,'0.5.11');
  }
  await assert.rejects(latestRelease(async()=>Response.json([release(['简成笔记-12.0.0-x64.msi'])])),/简成文档/);
});
