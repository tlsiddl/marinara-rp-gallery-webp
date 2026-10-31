'use strict';
const { createRequire } = require('node:module');
let sharp;
try { sharp = createRequire('/app/packages/server/package.json')('sharp'); }
catch { sharp = require('sharp'); }
const { withPngMetadata, verify } = require('./png-webp-metadata.cjs');
const chunks=[];
process.stdin.on('data', c=>chunks.push(c));
process.stdin.on('end', async ()=>{
 try {
  const png=Buffer.concat(chunks);
  const quality=Number(process.argv[2]||95);
  const info=await sharp(png).metadata();
  if(info.format!=='png' || !info.width || !info.height || info.width*info.height>35_000_000) process.exit(2);
  const enc=sharp(png,{limitInputPixels:35_000_000});
  const encoded=await (quality===100?enc.webp({lossless:true,effort:4}).toBuffer():enc.webp({quality,alphaQuality:100,effort:4}).toBuffer());
  const webp=withPngMetadata(png,encoded);
  verify(png,webp);
  const [a,b]=await Promise.all([
    sharp(png).ensureAlpha().raw().toBuffer(),
    sharp(webp).ensureAlpha().raw().toBuffer()
  ]);
  if(a.length!==b.length) process.exit(3);
  for(let i=3;i<a.length;i+=4) if(a[i]!==b[i]) process.exit(4);
  if(webp.length>=png.length) process.exit(5);
  process.stdout.write(webp);
 } catch(e) { console.error(e?.message||String(e)); process.exitCode=6; }
});
