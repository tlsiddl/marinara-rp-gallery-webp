# Marinara RP Gallery WebP — metadata-preserving replacement (candidate)

> **Draft / not production-certified.** PNG -> WebP image references and PNG backup/restore were changed. XMP preservation was tested on synthetic data; NovelAI Inspect and Marinara's native prompt-import UI compatibility are **not proven**. Do not run the deletion migration until those reader behaviors are verified on your server.

## Download/update patch files with curl

From the host:

```bash
curl -fsSL https://raw.githubusercontent.com/tlsiddl/marinara-rp-gallery-webp/fix/webp-metadata-full-replacement/install.sh | bash
```

The installer backs up a pre-existing `rp-webp-patch` directory and updates its code. It **does not restart Docker, change Compose config, migrate images, or remove PNG files**. Existing Compose integration needs to mount `./rp-webp-patch:/app/rp-webp-patch:ro` and append `--import=/app/rp-webp-patch/register.mjs` to existing `NODE_OPTIONS` without removing other preloads.

## Data and migration safety

- `worker.cjs` embeds exact PNG `tEXt`, `zTXt`, `iTXt` payloads into WebP XMP and verifies the roundtrip. This is a custom archive, not an assurance that native NovelAI or Marinara readers can import the metadata.
- Existing 700 staged WebPs must have matching PNG hashes and metadata-rich `images-with-metadata` counterparts.
- Offline migration requires `--use-stage --delete-png --apply --server-stopped`. It backs up the originals and JSON records before deletion and refuses unrecognized image references.
- **Do not pass `--server-stopped` unless Marinara is actually stopped.** The flag is a declaration, not a shutdown mechanism.
- Backups under `rp-webp-backups` retain original PNG bytes for rollback and consume storage.
- `migrate-existing-rp-png.mjs` is legacy and should not be used for this migration.

## Tests

```bash
node test-metadata.cjs
node test-loader.mjs
```

Image conversion tests additionally require `sharp`, and operational migration tests require a stopped server or disposable fixture. Current integration testing does not establish automatic prompt import compatibility.

## Limitations

Native metadata readers may only recognize PNG tEXt/iTXt and may not parse the XMP archive in WebP. Conversion does not automatically make a PNG-only decoder work with a WebP. Test prompt restoration on a copy before deleting originals.
