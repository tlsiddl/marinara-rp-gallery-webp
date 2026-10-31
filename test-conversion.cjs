'use strict';
const assert=require('node:assert/strict');
const sharp=require('sharp');
const convert=require('./convert-sync.cjs');
(async()=>{
 const width=48,height=48; const pixels=Buffer.alloc(width*height*4);
 for(let i=0;i<width*height;i++){pixels[i*4]=i%255;pixels[i*4+1]=85;pixels[i*4+2]=205;pixels[i*4+3]=254+(i%2);}
 const src=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer();
 const out=convert(src);
 assert.ok(out,'WebP conversion should succeed');
 assert.equal((await sharp(out).metadata()).format,'webp');
 const original=await sharp(src).ensureAlpha().raw().toBuffer();
 const result=await sharp(out).ensureAlpha().raw().toBuffer();
 for(let i=3;i<original.length;i+=4) assert.equal(result[i],original[i]);
 assert.equal(convert(Buffer.from('not png')),null);
 console.log('Image conversion passed; alpha channel identical');
})().catch(e=>{console.error(e);process.exitCode=1});
