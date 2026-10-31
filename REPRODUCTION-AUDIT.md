# Reproduction audit — 2026-10-31

## Environment
- Local Node.js 22.16.0 / sharp; no Docker engine available in test container.
- Verified upstream Marinara Engine `v2.5.1` tagged source for `saveImageToDisk` signature and write pattern.
- No authenticated instance of the user's Marinara server or real NovelAI source image.

## Executed checks
- `node test-loader.mjs`: PASS (targeted rewrite, non-target passthrough, fail-closed).
- `node test-conversion.cjs`: PASS (image conversion and byte-exact alpha channel).
- ESM loader with `node --import ./register.mjs` and mock image-generation module: PASS (3,551,253-byte PNG became 964,152-byte WebP; .webp returned path; image was valid).
- Synthetic alpha-LSB hidden prompt/seed data: PASS (351,332-byte PNG became 98,946-byte WebP; extracted bits identical). A GitHub regression test is included as `test-stealth.cjs`.
- Failure to produce a smaller WebP: PNG is intentionally retained.

## NOT reproduced / unsupported claims
- **Actual Marinara Engine Docker 2.5.1 server** start and round-trip gallery UI: NOT TESTED.
- **Actual NovelAI Inspect** prompt/seed extraction on authentic PNG/WebP: NOT TESTED. Synthetic hidden payload is not the same as authentic NovelAI format.
- **iOS Safari** UI end-to-end: NOT TESTED, though conversion is server-side.
- **Simultaneous startup with Gacha Forge WebP runtime patch and other NODE_OPTIONS**: NOT TESTED.
- **Strict RP-only scoping**: NOT GUARANTEED. The hook targets `saveImageToDisk`, not chat-mode-aware call sites; other modes calling it could convert.
- Staged images through `stageImageToDisk` are not handled.
- The generated JavaScript of the exact published Docker image has not been inspected, only the v2.5.1 source declaration.

## Release recommendation
Keep experimental; test on isolated engine Docker with sample messages and a real NovelAI PNG before production use.
