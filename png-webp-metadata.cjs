'use strict';
const assert = require('node:assert/strict');
const TEXT = new Set(['tEXt','zTXt','iTXt']);
const PREFIX = 'https://marinara.local/metadata/';
function pngTextChunks(png) {
 if (!Buffer.isBuffer(png) || !png.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) throw Error('Invalid PNG');
 let p=8,ended=false;const items=[];
 while(p+12<=png.length) {
  const n=png.readUInt32BE(p),kind=png.toString('ascii',p+4,p+8);
  if(n>png.length-p-12)throw Error('Truncated PNG chunk');
  if(TEXT.has(kind))items.push([kind,png.subarray(p+8,p+8+n).toString('base64')]);
  p+=12+n;if(kind==='IEND'){ended=true;break;}
 }
 if(!ended)throw Error('PNG missing IEND');
 return items;
}
function chunksWebp(webp) {
 if(!Buffer.isBuffer(webp)||webp.length<20||webp.toString('ascii',0,4)!=='RIFF'||webp.toString('ascii',8,12)!=='WEBP'||webp.readUInt32LE(4)!==webp.length-8)throw Error('Invalid WebP RIFF');
 const items=[];let p=12;
 while(p+8<=webp.length){
  const n=webp.readUInt32LE(p+4),end=p+8+n;
  if(end>webp.length)throw Error('Truncated WebP chunk');
  items.push({kind:webp.toString('ascii',p,p+4),pos:p,size:n,data:webp.subarray(p+8,end)});
  p=end+(n%2);
 }
 if(p!==webp.length)throw Error('Invalid WebP padding');
 return items;
}
function getArchivedChunks(webp) {
 const all=chunksWebp(webp),xmp=all.filter(x=>x.kind==='XMP ');
 if(xmp.length!==1)return null;
 const str=xmp[0].data.toString('utf8');
 const match=str.match(/<marinara:pngTextChunks>([A-Za-z0-9+/=]+)<\/marinara:pngTextChunks>/);
 if(!match||!str.includes(PREFIX))return null;
 const parsed=JSON.parse(Buffer.from(match[1],'base64').toString('utf8'));
 if(!Array.isArray(parsed)||!parsed.every(x=>Array.isArray(x)&&x.length===2&&TEXT.has(x[0])&&typeof x[1]==='string'))throw Error('Invalid archived PNG metadata');
 return parsed;
}
function withPngMetadata(png,webp) {
 const items=pngTextChunks(png),chunks=chunksWebp(webp);
 if(chunks[0]?.kind!=='VP8X'||chunks[0].size<10)throw Error('WebP requires VP8X');
 if(chunks.some(x=>x.kind==='XMP '))throw Error('Existing XMP: refusing overwrite');
 const payload=Buffer.from(JSON.stringify(items)).toString('base64');
 const xml=Buffer.from('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:marinara="'+PREFIX+'"><marinara:pngTextChunks>'+payload+'</marinara:pngTextChunks></rdf:Description></rdf:RDF></x:xmpmeta>');
 const updated=Buffer.from(webp);updated[chunks[0].pos+8]|=0x04;
 const hdr=Buffer.alloc(8);hdr.write('XMP ',0,4,'ascii');hdr.writeUInt32LE(xml.length,4);
 const result=Buffer.concat([updated,hdr,xml,...(xml.length%2?[Buffer.alloc(1)]:[])]);
 result.writeUInt32LE(result.length-8,4);
 assert.deepEqual(getArchivedChunks(result),items,'Metadata roundtrip mismatch');
 return result;
}
function verify(png,webp) {
 const got=getArchivedChunks(webp);
 assert(got!==null,'Missing metadata archive');
 assert.deepEqual(got,pngTextChunks(png),'PNG/WebP metadata mismatch');
 return {chunks:got.length};
}
module.exports={pngTextChunks,chunksWebp,getArchivedChunks,withPngMetadata,verify};
