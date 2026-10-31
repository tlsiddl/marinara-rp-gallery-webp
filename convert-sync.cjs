'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const PNG_MAGIC = Buffer.from('89504e470d0a1a0a','hex');
module.exports = function convertPng(source) {
  if (process.env.MARINARA_RP_WEBP_OFF === '1' || !Buffer.isBuffer(source) || !source.subarray(0,8).equals(PNG_MAGIC)) return null;
  const maxMb = Number(process.env.MARINARA_RP_WEBP_MAX_MB || 30);
  if (source.length > Math.min(Math.max(maxMb,1),100)*1048576) return null;
  const quality = Math.min(100,Math.max(50,Number(process.env.MARINARA_RP_WEBP_QUALITY || 95)));
  const job = spawnSync(process.execPath, [path.join(__dirname,'worker.cjs'),String(quality)], {
    input: source, maxBuffer: Math.max(64*1048576,source.length*3), timeout: 45000,
    env: {...process.env, NODE_OPTIONS:''}
  });
  if (job.status !== 0 || job.error || !job.stdout?.length || job.stdout.length >= source.length) {
    if (job.stderr?.length) console.warn('[rp-webp] PNG retained:',String(job.stderr).slice(0,200));
    return null;
  }
  console.log(`[rp-webp] PNG ${source.length} -> WebP ${job.stdout.length} bytes`);
  return job.stdout;
};
