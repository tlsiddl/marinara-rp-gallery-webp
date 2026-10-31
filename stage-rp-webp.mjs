#!/usr/bin/env node
// Online, file-only preconversion. Never edits gallery DB or existing PNG.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const convert=require('./convert-sync.cjs');
const args=process.argv.slice(2);
const opt=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const data=path.resolve(opt('--data',process.env.DATA_DIR||'/app/data'));
const limit=Number(opt('--limit','5'));
const all=args.includes('--all');
if(!Number.isSafeInteger(limit)||limit<1||limit>10000)throw Error('invalid limit');
const gallery=path.join(data,'gallery'),tables=path.join(data,'storage','tables','chat_images');
const stage=path.join(data,'rp-webp-stage'),stagedir=path.join(stage,'images');
fs.mkdirSync(stagedir,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const eligible=new Map();
for(const ent of fs.readdirSync(tables,{withFileTypes:true})){
 if(!ent.isFile()||!ent.name.endsWith('.json'))continue;
 let rows;try{rows=JSON.parse(fs.readFileSync(path.join(tables,ent.name),'utf8'))}catch(e){if(e.code==='ENOENT')continue;throw e}
 if(!Array.isArray(rows))throw Error('Unexpected chat_images table '+ent.name);
 for(const row of rows){const rel=row?.filePath;
  if(typeof rel==='string'&&/^shared\/[A-Za-z0-9_-]+\.png$/.test(rel)&&fs.existsSync(path.join(gallery,rel)))eligible.set(rel,true)
 }
}
const names=[...eligible.keys()].sort().slice(0,all?undefined:limit);
const file=path.join(stage,'manifest.json');
const manifest={schema:1,entries:{}};
if(fs.existsSync(file)){
 const old=JSON.parse(fs.readFileSync(file,'utf8'));
 if(old.schema!==1||!old.entries||typeof old.entries!=='object')throw Error('Invalid stage manifest');
 manifest.entries=old.entries
}
let created=0,reused=0,skipped=0;
for(const from of names){
 const png=fs.readFileSync(path.join(gallery,from));const pngSha=sha(png);
 const target=from.replace(/\.png$/,'.webp'),stagePath=path.join(stagedir,path.basename(target));
 const previous=manifest.entries[from];
 if(previous?.pngSha===pngSha&&fs.existsSync(stagePath)&&sha(fs.readFileSync(stagePath))===previous.webpSha){reused++;continue}
 const webp=convert(png);
 if(!webp){console.log('SKIP unconvertible',from);skipped++;continue}
 const entry={from,to:target,pngSha,webpSha:sha(webp),pngBytes:png.length,webpBytes:webp.length};
 const tmp=stagePath+'.tmp-'+process.pid;
 fs.writeFileSync(tmp,webp,{flag:'wx'});fs.renameSync(tmp,stagePath);
 manifest.entries[from]=entry;
 const mt=file+'.tmp-'+process.pid;fs.writeFileSync(mt,JSON.stringify(manifest,null,2));fs.renameSync(mt,file);
 created++;console.log('STAGED',from,png.length,'->',webp.length);
}
console.log('STAGE COMPLETE',{eligible:eligible.size,selected:names.length,created,reused,skipped,manifest:file});
