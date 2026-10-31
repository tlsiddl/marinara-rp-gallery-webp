import { fileURLToPath } from 'node:url';
const TARGET = /\/(?:services\/image\/image-generation|routes\/generate\/retry-agents-route)\.js$/;
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (process.env.MARINARA_RP_WEBP_OFF === '1' || !TARGET.test(new URL(url).pathname)) return result;
  const original = String(result.source);
  // Illustrator message attachments use the provider extension instead of the saved
  // file extension. Correct the attachment's download name in the server route.
  if (/\\/routes\\/generate\\/retry-agents-route\\.js$/.test(new URL(url).pathname)) {
    const oldName = 'filename: `illustration_${variantIndex + 1}.${imageResult.ext}`';
    const newName = 'filename: `illustration_${variantIndex + 1}.${filePath.split(".").pop()}`';
    if (!original.includes(oldName)) {
      console.warn('[rp-webp] illustrator attachment filename pattern not found; unchanged');
      return result;
    }
    const updated = original.replace(oldName, newName);
    console.log('[rp-webp] illustrator attachment filename hook applied');
    return { ...result, source: updated };
  }
  const start = original.indexOf('export function saveImageToDisk(');
  const end = original.indexOf('export function removeSavedImageFromDisk(', start);
  if (start < 0 || end < 0) throw new Error('[rp-webp] Save function signature not found');
  let section = original.slice(start, end);
  const extRegex = /const effectiveExt = ([^;]+);/;
  const writeRegex = /writeFileSync\(tempPath, Buffer\.from\(base64, "base64"\)\);/;
  if (!extRegex.test(section) || !writeRegex.test(section)) throw new Error('[rp-webp] Save implementation changed; refusing patch');
  section = section.replace(extRegex, `let effectiveExt = $1;
    let imageBytes = Buffer.from(base64, "base64");
    if (effectiveExt.toLowerCase() === "png") {
      const converted = __rpWebpConvert(imageBytes);
      if (converted) { imageBytes = converted; effectiveExt = "webp"; }
    }`);
  section = section.replace(writeRegex, 'writeFileSync(tempPath, imageBytes);');
  const patch = `import { createRequire as __rpWebpCreateRequire } from 'node:module';
const __rpWebpConvert = __rpWebpCreateRequire(import.meta.url)(${JSON.stringify(fileURLToPath(new URL('./convert-sync.cjs', import.meta.url)))});
`;
  console.log('[rp-webp] image-generation save hook applied');
  return { ...result, source: patch + original.slice(0,start) + section + original.slice(end) };
}
