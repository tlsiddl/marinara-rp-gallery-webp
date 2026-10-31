#!/usr/bin/env node
// Marinara 2.5.x file-native RP gallery migration. Dry-run by default.
// Operates ONLY on chat_images-backed shared/*.png, never global or loose assets.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const VERSION='2026-10-31-fast-preview-v2';
const convert=()=>require('./convert-sync.cjs');
const args=process.argv.slice(2);
const flag=x=>args.includes(x);
const opt=(x,d)=>args.includes(x)?args[args.indexOf(x)+1]:d;
const data=path.resolve(opt('--data',process.env.DATA_DIR||'/app/data'));
const root=path.join(data,'storage','tables'), gallery=path.join(data,'gallery');
const apply=flag('--apply'), stopped=flag('--server-stopped'), keep=flag('--keep-png');
const limit=Number(opt('--limit','5'));
if(flag('--version')){console.log(VERSION);process.exit(0)}
if(!Number.isSafeInteger(limit)||limit<1||limit>10000)throw Error('Invalid --limit');
if(apply&&!stopped)throw Error('Apply requires --server-stopped; shut down Marinara first');
if(!fs.existsSync(path.join(root,'chat_images')))throw Error('Missing file-native chat_images table');
function walk(dir){const out=[];const stack=[dir];while(stack.length){const d=stack.pop();if(!fs.existsSync(d))continue;for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())stack.push(f);else if(e.isFile()&&/\.json(?:\.bak)?$/.test(f))out.push(f)}}return out.sort()}
const files=walk(root);const primary=files.filter(f=>f.includes(path.sep+'chat_images'+path.sep)&&f.endsWith('.json'));
const byName=new Map();
for(const file of primary){let raw;try{raw=fs.readFileSync(file,'utf8')}catch(e){if(e.code==='ENOENT'){console.warn('SKIP disappeared gallery record:',file);continue}throw e}const rows=JSON.parse(raw);if(!Array.isArray(rows))throw Error('Unexpected chat_images format: '+file);
for(const row of rows){if(typeof row.filePath!=='string'||!/^shared\/[A-Za-z0-9_-]+\.png$/i.test(row.filePath))continue;
const rel=row.filePath, id=path.basename(rel), full=path.join(gallery,rel);
if(!fs.existsSync(full))continue;
if(!byName.has(id))byName.set(id,{id,rel,full,records:0});byName.get(id).records++}}
const selected=[...byName.values()].sort((a,b)=>a.id.localeCompare(b.id)).slice(0,limit);
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=path.join(data,'rp-webp-migration-backups',stamp);
console.log('[rp-webp-migrate] version:',VERSION);
console.log('[rp-webp-migrate] eligible:',byName.size,'selected:',selected.length,'mode:',apply?'APPLY':'DRY-RUN');
if(!apply){
 console.log('[rp-webp-migrate] FAST PREVIEW: paths only; no encoding, reference verification, or writes.');
 for(const item of selected)console.log('CANDIDATE',item.rel,'galleryRecords:',item.records);
 console.log('[rp-webp-migrate] no files modified');
 process.exit(0);
}
let done=0,skipped=0;
for(const item of selected){
 const png=fs.readFileSync(item.full);
 const webp=convert()(png);
 if(!webp){console.log('SKIP conversion:',item.rel);skipped++;continue}
 const newRel=item.rel.replace(/\.png$/i,'.webp'),newFull=path.join(gallery,newRel);
 if(fs.existsSync(newFull)){console.log('SKIP target exists:',newRel);skipped++;continue}
 const from=item.id,to=path.basename(newRel);
 const edits=[];let blocked=false;
 for(const file of files){
  let original;try{original=fs.readFileSync(file,'utf8')}catch(e){if(e.code==='ENOENT'){console.warn('SKIP disappeared storage file:',file);blocked=true;break}throw e}
  if(!original.includes(from))continue;
  let parsed;
  try{parsed=JSON.parse(original)}catch{blocked=true;console.log('SKIP non-JSON reference:',file);break}
  // Strict substitutions in JSON string values, preserve non-path metadata.
  let count=0;
  function transform(v){
   if(typeof v==='string'){
    let next=v;
    // Only recognized full paths or gallery URLs, not unrelated prose.
    next=next.split(item.rel).join(newRel);
    next=next.replaceAll('/'+from,'/'+to);
    if(next!==v)count++;
    return next
   }
   if(Array.isArray(v))return v.map(transform);
   if(v&&typeof v==='object'){
    const result={};for(const [k,x] of Object.entries(v))result[k]=transform(x);
    if(typeof result.url==='string'&&result.url.includes('/'+to)&&typeof result.filename==='string'&&/\.png$/i.test(result.filename)){result.filename=result.filename.replace(/\.png$/i,'.webp');count++}
    return result
   }
   return v
  }
  const changed=transform(parsed);
  if(!count){blocked=true;console.log('SKIP unrecognized reference in:',file);break}
  edits.push({file,original,after:JSON.stringify(changed),count})
 }
 if(blocked||!edits.some(e=>e.file.includes(path.sep+'chat_images'+path.sep)&&e.file.endsWith('.json'))){console.log('SKIP missing/unsafe references:',item.rel);skipped++;continue}
 console.log((apply?'APPLY':'PLAN'),item.rel,'=>',newRel,'bytes:',png.length,'=>',webp.length,'files:',edits.length);
 if(!apply){done++;continue}
 const entry=path.join(backup,'items',from.replace(/\.png$/i,''));
 fs.mkdirSync(entry,{recursive:true});
 const manifest={from:item.rel,to:newRel,originalFiles:edits.map(x=>path.relative(root,x.file)),pngBytes:png.length,webpBytes:webp.length,completed:false};
 fs.writeFileSync(path.join(entry,'manifest.json'),JSON.stringify(manifest,null,2));
 fs.copyFileSync(item.full,path.join(entry,item.id));
 for(let n=0;n<edits.length;n++)fs.writeFileSync(path.join(entry,'record-'+n+'.json'),edits[n].original);
 fs.writeFileSync(newFull+'.rp-webp-tmp',webp);fs.renameSync(newFull+'.rp-webp-tmp',newFull);
 for(const e of edits){const tmp=e.file+'.rp-webp-tmp';fs.writeFileSync(tmp,e.after);fs.renameSync(tmp,e.file)}
 const verification=edits.every(e=>{const text=fs.readFileSync(e.file,'utf8');JSON.parse(text);return !text.includes(from)});
 if(!verification){console.error('VERIFY FAILED; png retained. Restore table files using backup:',entry);process.exit(2)}
 if(!keep)fs.renameSync(item.full,path.join(entry,item.id+'.migrated'));
 manifest.completed=true;fs.writeFileSync(path.join(entry,'manifest.json'),JSON.stringify(manifest,null,2));
 done++;
}
console.log('[rp-webp-migrate] finished:',done,'skipped:',skipped,apply?'backup: '+backup:'No files modified');
