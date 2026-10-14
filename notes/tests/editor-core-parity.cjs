// Run with an optional peer project path; neither app imports the other at runtime.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const notes=require('../package.json').name==='chengjian-notes';
const peer=process.argv[2]?path.resolve(process.argv[2]):path.join(path.dirname(root),notes?'墨页Markdown':'成简笔记');
const modules=['block-format.js','core.mjs','custom-colors.js','editor-features.js','export-content.js','exports.cjs','files.cjs','glass-selects.js','link-target.js','number-label.js','resources.cjs','vector-image.cjs','word-format.js'];
assert.ok(fs.existsSync(path.join(peer,'src')),'找不到另一款软件，请传入其项目目录');
for(const file of modules){const read=dir=>fs.readFileSync(path.join(dir,'src',file),'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trim();assert.equal(read(root),read(peer),file+' 编辑核心不同步');}
console.log('PASS: '+modules.length+' shared editor modules match; product shells stay separate');
