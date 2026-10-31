#!/usr/bin/env node
import fs from 'node:fs';
const file='/app/data/storage/tables/message_swipes/%45ks3%42%50%4Anxzu8%4C%4Dvu%43nr%56%51.json';
const name='_dO5rxZviWGvqEQk6jRKz.png';
const rows=JSON.parse(fs.readFileSync(file,'utf8'));
const value=rows?.[319]?.extra;
if(typeof value!=='string')throw Error('Expected extra string not found');
let at=-1,number=0;
while((at=value.indexOf(name,at+1))>=0){
 const before=value.slice(Math.max(0,at-100),at),after=value.slice(at+name.length,at+name.length+50);
 const json=value.trim().startsWith('{')||value.trim().startsWith('[');
 console.log(JSON.stringify({occurrence:++number,position:at,extraLooksJson:json,before,filename:name,after},null,2))
}
if(!number)console.log('No match');
