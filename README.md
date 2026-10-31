# Marinara RP Gallery WebP (experimental)

Server-side PNG → WebP conversion for Marinara Engine 2.5.x RP/conversation images saved through `saveImageToDisk()`. Conversion occurs on the server, so the browser (including iOS Safari) does not need WebP encoding support. Gacha Forge's global gallery is not modified.

**Experimental: do not install on a production server until validated against your installed engine build and a real NovelAI image.** The code is a Node ESM load hook for the built server module; engine updates can change its signature. It does **not** cover staged images, all direct uploads, or previously saved PNG files.

## NovelAI metadata

The converter compares the full alpha channel between the PNG and WebP. It keeps the original PNG when alpha differs, WebP would be larger, or conversion fails. This is a necessary check for alpha-based NovelAI stealth metadata, **not proof** that NovelAI Inspect can decode the resulting file. PNG tEXt/iTXt metadata is **not preserved**. Test with a real NovelAI PNG before enabling this patch for important images.

## Docker installation (after compatibility testing)

Place the repository directory at `/root/Marinara-Engine/rp-webp-patch`. Add to the existing `marinara` service in your active Compose config, preserving all existing volumes and NODE_OPTIONS:

```yaml
services:
  marinara:
    volumes:
      - ./rp-webp-patch:/app/rp-webp-patch:ro
    environment:
      - NODE_OPTIONS=--import=/app/rp-webp-patch/register.mjs
      - MARINARA_RP_WEBP_QUALITY=95
```

**Do not replace an existing NODE_OPTIONS value.** Append ` --import=/app/rp-webp-patch/register.mjs` to it; other preloads (including Gacha Forge WebP) must remain.

```bash
cd /root/Marinara-Engine
docker compose config -q
docker compose config | grep -E 'NODE_OPTIONS|rp-webp'
docker compose up -d --force-recreate marinara
docker compose logs --since 5m marinara | grep rp-webp
```

Environment: `MARINARA_RP_WEBP_QUALITY=95` (50–100); `MARINARA_RP_WEBP_MAX_MB=30`; `MARINARA_RP_WEBP_OFF=1` to disable. To remove, delete only this mount and `--import` option, then recreate the container. Existing WebP images remain WebP.

## Tests

`node test-loader.mjs` checks module rewrite/passthrough/signature changes. `node test-conversion.cjs` requires sharp and checks PNG→WebP/alpha identity. Docker Node 24, end-to-end gallery references, and real NovelAI Inspect compatibility have not yet been validated. Do not describe them as passing.
