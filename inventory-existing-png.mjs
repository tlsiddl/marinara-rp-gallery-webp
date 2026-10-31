#!/usr/bin/env node
// Safe read-only inventory for a future existing-PNG migration.
// Does NOT encode, modify records, or delete files.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
const DATA=process.env.DATA_DIR || '/app/data';
const GALLERY=join(DATA,'gallery');
const TABLES=join(DATA,'storage','tables');
function scan(root,filter) {
 const result=[]; if(!existsSync(root))return result;
 const stack=[root];
 while(stack.length){
  const dir=stack.pop();
  for(const ent of readdirSync(dir,{withFileTypes:true})){
   const path=join(dir,ent.name);
   if(ent.isDirectory()) stack.push(path);
   else if(ent.isFile()&&filter(path)) result.push(path);
  }
 }
 return result;
}
const images=scan(GALLERY,x=>/\.png$/i.test(x));
const groups={};let bytes=0;
for(const file of images){
 const rel=relative(GALLERY,file).replaceAll('\\','/');
 const group=rel.split('/')[0]||'(root)';
 const size=statSync(file).size;
 bytes+=size;
 groups[group]??={count:0,bytes:0};
 groups[group].count++;groups[group].bytes+=size;
}
const files=scan(TABLES,x=>/\.json(?:\.bak)?$/i.test(x));
const references={};
for(const file of files){
 let content;
 try{content=readFileSync(file,'utf8');}catch{continue;}
 let n=0;
 for(const image of images){
  const rel=relative(GALLERY,image).replaceAll('\\','/');
  const short=basename(image);
  if(content.includes(rel)||content.includes(short))n++;
 }
 if(n)references[relative(TABLES,file).split('/')[0]]=(references[relative(TABLES,file).split('/')[0]]||0)+n;
}
console.log(JSON.stringify({mode:'READ_ONLY',dataDir:DATA,pngCount:images.length,pngMB:Number((bytes/1048576).toFixed(2)),groups,referenceMatchesByTable:references,warning:'This is an inventory only. It does not change or convert any files.'},null,2));
