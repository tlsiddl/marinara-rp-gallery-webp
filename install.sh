#!/usr/bin/env bash
set -Eeuo pipefail
# Installs code only. Does NOT apply PNG migration, restart Docker, or delete images.
ROOT="${MARINARA_ROOT:-/root/Marinara-Engine}"
DEST="$ROOT/rp-webp-patch"
BRANCH="fix/webp-metadata-full-replacement"
URL="https://github.com/tlsiddl/marinara-rp-gallery-webp/archive/refs/heads/$BRANCH.tar.gz"
command -v curl >/dev/null && command -v tar >/dev/null || { echo "curl and tar required on host" >&2; exit 2; }
[[ -f "$ROOT/docker-compose.yml" ]] || { echo "Marinara root not found: $ROOT" >&2; exit 2; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
curl -fsSL --retry 3 "$URL" -o "$tmp/source.tar.gz"
tar -xzf "$tmp/source.tar.gz" -C "$tmp"
src="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d -name 'marinara-rp-gallery-webp-*' -print -quit)"
[[ -n "$src" ]] || { echo 'Archive extraction failed' >&2; exit 3; }
for f in worker.cjs png-webp-metadata.cjs convert-sync.cjs loader.mjs register.mjs migrate-rp-offline.mjs; do
 [[ -s "$src/$f" ]] || { echo "Missing $f" >&2; exit 3; }
 if command -v node >/dev/null; then node --check "$src/$f" >/dev/null; fi
done
# Copy only after checks; keep backup of existing installation.
if [[ -d "$DEST" ]]; then
 backup="$ROOT/rp-webp-patch.backup-$(date -u +%Y%m%dT%H%M%SZ)"
 cp -a "$DEST" "$backup"
 echo "BACKUP $backup"
fi
mkdir -p "$DEST"
for f in "$src"/*; do [[ -f "$f" ]] && install -m 0644 "$f" "$DEST/$(basename "$f")"; done
echo "PATCH FILES UPDATED at $DEST"
echo "NOT APPLIED: no Docker restart, no migration or PNG deletion performed."
echo "Check your existing Compose mount and NODE_OPTIONS; the server must restart to load new code."
