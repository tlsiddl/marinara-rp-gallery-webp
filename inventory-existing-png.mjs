#!/usr/bin/env node
// Read-only PNG inventory. Scan each storage file only once.
import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {join,relative,basename} from 'node:path';
const DATA=process.env.DATA_DIR||'/app/data';
const GALLERY=join(DATA,'gallery');
const TABLES=join(DATA,'storage','tables');
function scan(root,filter){
 const out=[];if(!existsSync(root))return out;
 const stack=[root];
 while(stack.length){
  const dir=stack.pop();
  for(const e of readdirSync(dir,{withFileTypes:true})){
   const p=join(dir,e.name);
   if(e.isDirectory()) stack.push(p);
   else if(e.isFile()&&filter(p))out.push(p);
  }
 }
 return out;
}
const imgs=scan(GALLERY,p=>/\.png$/i.test(p));
const groups={};let total=0;
for(const p of imgs){
 const rel=relative(GALLERY,p).replaceAll('\\','/');
 const group=rel.split('/')[0]||'(root)';
 const n=statSync(p).size;total+=n;
 const g=groups[group]??={count:0,bytes:0};
 g.count++;g.bytes+=n;
}
const files=scan(TABLES,p=>/\.json(?:\.bak)?$/i.test(p));
const refs={};let examined=0;
const known=new Set(imgs.map(p=>basename(p)));
const token=/[A-Za-z0-9_-]{10,80}\.png/gi;
for(const p of files){
 let data;
 try{data=readFileSync(p,'utf8')}catch{continue}
 let matched=false;
 for(const t of data.matchAll(token)){if(known.has(t[0])){matched=true;break}}
 if(matched){
  const table=relative(TABLES,p).split('/')[0];
  refs[table]=(refs[table]||0)+1;
 }
 examined++;
}
console.log(JSON.stringify({
 mode:'READ_ONLY',pngCount:imgs.length,pngMB:+(total/1048576).toFixed(2),
 groups,storageFilesScanned:examined,
 storageFilesContainingKnownPng:refs,
 note:'Reference counts are files, not occurrence counts. No files were changed.'
},null,2));
