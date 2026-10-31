import assert from 'node:assert/strict';
import {load} from './loader.mjs';
const url='file:///app/packages/server/dist/services/image/image-generation.js';
const sample=`export function saveImageToDisk(chatId, base64, ext, options = {}) {
  const ownerDir = options.shared ? "shared" : chatId;
  const detectedMime = detectImageMimeType(base64);
  const effectiveExt = (detectedMime ? imageExtensionFromMimeType(detectedMime) : null) ?? ext;
  const filename = "image.png";
  const tempPath = "/tmp/image.tmp";
  writeFileSync(tempPath, Buffer.from(base64, "base64"));
  return filename;
}
export function removeSavedImageFromDisk(filePath) {}`;
const result=await load(url,{},async()=>({format:'module',source:sample}));
assert.match(result.source,/__rpWebpConvert\(imageBytes\)/);
assert.match(result.source,/writeFileSync\(tempPath, imageBytes\)/);
const passthrough=await load('file:///app/other.js',{},async()=>({source:sample}));
assert.equal(passthrough.source,sample);
await assert.rejects(load(url,{},async()=>({source:'export function saveImageToDisk(){}\nexport function removeSavedImageFromDisk(){}'})),/Save implementation changed/);
const route = 'file:///app/packages/server/dist/routes/generate/retry-agents-route.js';
const routeSource = 'const attachment = { type: "image", filename: `illustration_${variantIndex + 1}.${imageResult.ext}`, prompt: renderedPrompt };';
const changed = await load(route, {}, async () => ({ format: 'module', source: routeSource }));
assert.match(changed.source, /filePath\.split\("\."\)\.pop\(\)/);
assert.doesNotMatch(changed.source, /filename: `illustration_\$\{variantIndex \+ 1\}\.\$\{imageResult\.ext\}`/);
const unchangedRoute = await load(route, {}, async () => ({ format: 'module', source: 'const unrelated = 1;' }));
assert.equal(unchangedRoute.source, 'const unrelated = 1;');
console.log('Loader tests passed');
