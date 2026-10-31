#!/usr/bin/env node
// Offline, conservative Marinara RP shared PNG migration.
// Usage: node migrate-rp-offline.mjs --data /app/data [--limit 5] [--apply --server-stopped]
// Restore: node migrate-rp-offline.mjs --data /app/data --restore /path/to/backup --server-stopped
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
const require=createRequire(import.meta.url);
const {verify:verifyMetadata}=require('./png-webp-metadata.cjs');
const VERSION='2026-10-31-two-phase-v3';
const args=process.argv.slice(2), has=x=>args.includes(x);
const opt=(x,d)=>has(x)?args[args.indexOf(x)+1]:d;
const data=path.resolve(opt('--data',process.env.DATA_DIR||'/app/data'));
const root=path.join(data,'storage','tables'),gallery=path.join(data,'gallery');
const apply=has('--apply'),stopped=has('--server-stopped'),restore=opt('--restore',null);
const limit=Number(opt('--limit','5'));
const staged=has('--use-stage');
const deletePng=has('--delete-png');
const stageDir=path.join(data,'rp-webp-stage');
if(apply)assert(deletePng&&staged,'Replacement requires --delete-png and --use-stage');
const stageManifest=staged?JSON.parse(fs.readFileSync(path.join(stageDir,'manifest.json'),'utf8')):null;
if(staged)assert(stageManifest?.schema===1 && stageManifest.entries && typeof stageManifest.entries==='object','Missing stage manifest');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function assert(c,m){if(!c)throw Error(m)}
function files(dir){if(!fs.existsSync(dir))return [];const o=[],stack=[dir];while(stack.length){const dir=stack.pop();for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())stack.push(f);else if(e.isFile()&&f.endsWith('.json'))o.push(f)}}return o.sort()}
function writeAtomic(file,bytes){const temp=file+'.rp-webp-tmp';fs.writeFileSync(temp,bytes,{flag:'wx'});fs.renameSync(temp,file)}
if(has('--version')){console.log(VERSION);process.exit(0)}
assert(Number.isSafeInteger(limit)&&limit>=1&&limit<=10000,'Invalid --limit');
assert(!apply||stopped,'Apply requires --server-stopped and fully stopped server');
assert(!restore||stopped,'Restore requires --server-stopped and fully stopped server');
const lock=path.join(data,'.rp-webp-offline.lock');
function cleanupLock(){try{fs.unlinkSync(lock)}catch{}}
if(apply||restore){fs.writeFileSync(lock,String(process.pid),{flag:'wx'});process.on('exit',cleanupLock)}
if(restore){
 const dir=path.resolve(restore);
 assert(dir.startsWith(path.join(data,'rp-webp-backups')+path.sep),'Restore dir must be inside data/rp-webp-backups');
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
 assert(manifest.version===VERSION,'Backup format mismatch');
 // Refuse restore if any file has changed since this migration.
 for(const e of manifest.records){const f=path.join(root,e.path);assert(hash(fs.readFileSync(f))===e.afterHash,'Changed since migration; refuse restore: '+e.path)}
 for(const e of manifest.images){const f=path.join(gallery,e.to);assert(hash(fs.readFileSync(f))===e.webpHash,'Changed WebP; refuse restore: '+e.to)}
 for(const e of manifest.images){const save=path.join(dir,'originals',e.from);assert(fs.existsSync(save)&&hash(fs.readFileSync(save))===e.pngHash,'Missing backup PNG: '+e.from)}
 for(const e of manifest.records){writeAtomic(path.join(root,e.path),fs.readFileSync(path.join(dir,'records',e.path)))}
 for(const e of manifest.images){const png=path.join(gallery,e.from);if(!fs.existsSync(png))writeAtomic(png,fs.readFileSync(path.join(dir,'originals',e.from)))}
 for(const e of manifest.images)fs.unlinkSync(path.join(gallery,e.to));
 console.log('RESTORED',manifest.images.length,'images; original PNG files were always retained');process.exit(0)
}
assert(fs.existsSync(path.join(root,'chat_images')),'Missing chat_images table');
// A fast, read-only candidate lookup. No reference scans and no encoding.
const primaries=files(path.join(root,'chat_images'));
const candidates=new Map();
for(const file of primaries){
 let rows;try{rows=JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){if(e.code==='ENOENT')continue;throw e}
 assert(Array.isArray(rows),'Unexpected chat_images file: '+file);
 for(const row of rows){if(typeof row?.filePath!=='string'||!/^shared\/[A-Za-z0-9_-]+\.png$/.test(row.filePath))continue;
 const rel=row.filePath,abs=path.join(gallery,rel);
 if(fs.existsSync(abs))candidates.set(rel,abs)
 }
}
const selected=[...candidates].filter(([rel])=>!staged||Boolean(stageManifest.entries[rel])).sort((a,b)=>a[0].localeCompare(b[0])).slice(0,limit);
console.log('VERSION',VERSION,'eligible',candidates.size,'selected',selected.length,'mode',apply?'APPLY':'PREVIEW');
if(!apply){for(const [rel] of selected)console.log('CANDIDATE',rel);console.log('No files modified');process.exit(0)}
const all=files(root);
const selectedNames=new Set(selected.map(([rel])=>path.basename(rel)));
const selectedRel=new Set(selected.map(([rel])=>rel));
const edits=new Map(), occurrences=new Map();
for(const [rel] of selected)occurrences.set(rel,0);
// Single read per JSON file; reject unsupported mentions rather than silently corrupt.
for(const file of all){
 let original;try{original=fs.readFileSync(file)}catch(e){if(e.code==='ENOENT')throw Error('Storage changed during scan, stop the server: '+file);throw e}
 const source=original.toString('utf8');
 if(![...selectedNames].some(name=>source.includes(name)))continue;
 let obj;try{obj=JSON.parse(source)}catch{throw Error('Unparseable record with PNG reference: '+file)}
 let changes=0,unknown=false;
 function visit(v,k='',parent=null){
  if(typeof v==='string'){
   // message_swipes.extra is serialized JSON holding attachment URL and filename.
   // Traverse that JSON structurally rather than editing arbitrary string payloads.
   if(k==='extra' && (v.trimStart().startsWith('{') || v.trimStart().startsWith('[')) &&
      [...selectedNames].some(name=>v.includes(name))){
    let embedded;
    try{embedded=JSON.parse(v)}catch{unknown=true;return v}
    const updated=visit(embedded,'',null);
    return JSON.stringify(updated);
   }
   let next=v;
   // Only known image path or URL suffixes, and exact filePath fields.
   for(const rel of selectedRel){
    const basename=path.basename(rel),newRel=rel.replace(/\.png$/,'.webp');
    if(k==='filePath'&&v===rel){next=newRel;occurrences.set(rel,occurrences.get(rel)+1);break}
    if((k==='url'||k==='src'||k==='imageUrl'||k==='imagePath')&&v.includes('/'+basename)){
      next=v.split(rel).join(newRel).split('/'+basename).join('/'+path.basename(newRel));
      if(next!==v){occurrences.set(rel,occurrences.get(rel)+1);break}
    }
    if(v.includes(basename)&&next===v)unknown=true;
   }
   if(next!==v){changes++;return next}
   return v;
  }
  if(Array.isArray(v))return v.map(x=>visit(x,'',v));
  if(v&&typeof v==='object'){
   const result={};
   for(const [key,value] of Object.entries(v))result[key]=visit(value,key,v);
   // Correct download names for attachments whose URL was updated.
   if(typeof result.url==='string'&&selected.some(([rel])=>result.url.includes('/'+path.basename(rel,'.png')+'.webp'))&&typeof result.filename==='string'&&/^illustration_\d+\.png$/.test(result.filename)){result.filename=result.filename.replace(/\.png$/,'.webp');changes++}
   return result
  }
  return v
 }
 const after=JSON.stringify(visit(obj));
 assert(!unknown,'Unrecognized reference to selected PNG; abort without changes: '+file);
 if(changes){const rel=path.relative(root,file);edits.set(rel,{before:original,after:Buffer.from(after)});}
}
for(const [rel] of selected)assert(occurrences.get(rel)>0,'Gallery row not found: '+rel);
const backup=path.join(data,'rp-webp-backups',new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid);
fs.mkdirSync(path.join(backup,'records'),{recursive:true});
const convert=staged?null:require('./convert-sync.cjs');
const converted=[];
for(const [rel,pngFile] of selected){
 const png=fs.readFileSync(pngFile),to=rel.replace(/\.png$/,'.webp'),webpFile=path.join(gallery,to);
 assert(!fs.existsSync(webpFile),'Target exists: '+to);
 let out;
 if(staged){const entry=stageManifest.entries[rel];assert(entry&&entry.from===rel&&entry.to===to&&entry.pngSha===hash(png),'Stage PNG checksum mismatch: '+rel);
 const originalStage=fs.readFileSync(path.join(stageDir,'images',path.basename(to)));
  assert(hash(originalStage)===entry.webpSha,'Original stage checksum mismatch: '+rel);
  const sf=path.join(stageDir,'images-with-metadata',path.basename(to));out=fs.readFileSync(sf);
  assert(out.length<png.length,'Metadata-preserving WebP not smaller: '+rel);
 assert(out.subarray(0,4).toString()==='RIFF'&&out.subarray(8,12).toString()==='WEBP','Stage output not WebP: '+rel);
 }else{out=convert(png);assert(out,'Conversion rejected: '+rel)}
 verifyMetadata(png,out);
  converted.push({from:rel,to,webp:out,pngHash:hash(png),webpHash:hash(out)});
}
const manifest={version:VERSION,createdAt:new Date().toISOString(),images:converted.map(({from,to,pngHash,webpHash})=>({from,to,pngHash,webpHash})),records:[...edits].map(([p,e])=>({path:p,beforeHash:hash(e.before),afterHash:hash(e.after)}))};
for(const [p,e] of edits){const save=path.join(backup,'records',p);fs.mkdirSync(path.dirname(save),{recursive:true});fs.writeFileSync(save,e.before)}
for(const e of converted){const dst=path.join(backup,'originals',e.from);fs.mkdirSync(path.dirname(dst),{recursive:true});const original=fs.readFileSync(path.join(gallery,e.from));assert(hash(original)===e.pngHash,'Original PNG changed: '+e.from);fs.writeFileSync(dst,original,{flag:'wx'});assert(hash(fs.readFileSync(dst))===e.pngHash,'Backup verification failed: '+e.from)}
 fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(manifest,null,2));
console.log('BACKUP',backup,'records',edits.size,'images',converted.length);
let committed=0;
try{
 // Original PNG remains in place. All WebPs are created first.
 for(const e of converted)writeAtomic(path.join(gallery,e.to),e.webp);
 for(const [p,e] of edits){
  const target=path.join(root,p);
  assert(hash(fs.readFileSync(target))===hash(e.before),'Concurrent change detected: '+p);
  writeAtomic(target,e.after);committed++;
 }
 for(const [p,e] of edits)assert(hash(fs.readFileSync(path.join(root,p)))===hash(e.after),'Verification failed: '+p);
 for(const e of converted)assert(hash(fs.readFileSync(path.join(gallery,e.to)))===e.webpHash,'WebP changed after write: '+e.to);
  for(const e of converted){const original=path.join(gallery,e.from);assert(hash(fs.readFileSync(original))===e.pngHash,'PNG changed before delete: '+e.from);fs.unlinkSync(original)}
  console.log('SUCCESS',converted.length,'PNG replaced with WebP; backup',backup)
}catch(err){
 console.error('APPLY ERROR',err.message,'starting automatic rollback');
 // Only revert records matching our write; never clobber outside changes.
 for(const item of converted){const png=path.join(gallery,item.from),backupPng=path.join(backup,'originals',item.from);if(!fs.existsSync(png)&&fs.existsSync(backupPng))writeAtomic(png,fs.readFileSync(backupPng))}
  for(const [p,e] of edits){const target=path.join(root,p);if(fs.existsSync(target)&&hash(fs.readFileSync(target))===hash(e.after))writeAtomic(target,e.before)}
 for(const e of converted){const target=path.join(gallery,e.to);if(fs.existsSync(target)&&hash(fs.readFileSync(target))===e.webpHash)fs.unlinkSync(target)}
 throw err
}
