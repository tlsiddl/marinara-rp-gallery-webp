# Two-phase existing RP PNG migration

- `stage-rp-webp.mjs`: online-safe, image-only conversion into `/app/data/rp-webp-stage/images`, indexed by `manifest.json` with SHA256. Does not alter existing gallery PNGs or storage JSON.
- `migrate-rp-offline.mjs --use-stage`: requires the server to be fully stopped. Scans records once, verifies original PNG SHA256 and staged WebP SHA256, updates known references including serialized `message_swipes.extra`, and backs up original JSON to `/app/data/rp-webp-backups`. PNGs are retained.
- Trial limit: `--limit 5`; do **not** use `--all` for stage on first run.
- Read-only preview still works.
- Before applying: take a consistent full-volume backup with Marinara stopped.
- Before offline apply: stop Marinara; `--server-stopped` does not check actual state.
- If unknown references are found, apply aborts before writing. In case of error, use the pre-migration full-volume backup or script rollback; automatic rollback is best-effort.
- Do not use concurrently with any other migration script; do not mutate the staged images.
- After 5-image trial, check original chats, swipe variants, downloads, and NovelAI prompt before considering a larger batch.
