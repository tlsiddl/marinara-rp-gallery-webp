'use strict';
const assert=require('node:assert/strict');
const {pngTextChunks,withPngMetadata,verify,getArchivedChunks,chunksWebp}=require('./png-webp-metadata.cjs');
function chunk(type,data){let b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);return b}
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',Buffer.alloc(13)),chunk('tEXt',Buffer.from('Comment\0test prompt')),chunk('iTXt',Buffer.from('marinara_novelai_request\0\0\0\0\0{}')),chunk('IEND',Buffer.alloc(0))]);
const vp8x=Buffer.alloc(18);vp8x.write('VP8X',0);vp8x.writeUInt32LE(10,4);
const vp8=Buffer.alloc(8);vp8.write('VP8 ',0);
const webp=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP'),vp8x,vp8]);webp.writeUInt32LE(webp.length-8,4);
const encoded=withPngMetadata(png,webp);
assert.equal(verify(png,encoded).chunks,2);
assert.deepEqual(getArchivedChunks(encoded),pngTextChunks(png));
assert.deepEqual(chunksWebp(encoded).map(x=>x.kind),['VP8X','VP8 ','XMP ']);
assert.throws(()=>withPngMetadata(png,encoded),/Existing XMP/);
assert.throws(()=>verify(png,webp),/Missing metadata archive/);
console.log('Metadata roundtrip test passed');
