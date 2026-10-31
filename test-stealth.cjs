'use strict';
const assert=require('node:assert/strict');
const sharp=require('sharp');
const {randomBytes}=require('node:crypto');
const convert=require('./convert-sync.cjs');
(async()=>{
 const width=320,height=320,pixels=randomBytes(width*height*4);
 const payload=Buffer.from('Synthetic prompt | seed=123456 | negative=low quality','utf8');
 const bits=[];for(const byte of payload)for(let j=7;j>=0;j--)bits.push((byte>>j)&1);
 for(let i=0;i<width*height;i++)pixels[4*i+3]=254|(bits[i]||0);
 const png=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer();
 const webp=convert(png);
 assert.ok(webp,'test requires conversion smaller than PNG');
 const raw=await sharp(webp).ensureAlpha().raw().toBuffer();
 const recovered=Buffer.alloc(payload.length);
 for(let i=0;i<bits.length;i++)recovered[i>>3]|=(raw[4*i+3]&1)<<(7-(i&7));
 assert.deepEqual(recovered,payload);
 console.log('Synthetic alpha-LSB roundtrip passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
