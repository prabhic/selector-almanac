#!/usr/bin/env bash
# Install latest yt-dlp release binary (apt package 2024.x returns 0 YouTube videos).
set -euo pipefail
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" -o "$TMP"
if command -v sudo >/dev/null 2>&1; then
  sudo install -m 755 "$TMP" /usr/local/bin/yt-dlp
else
  install -m 755 "$TMP" /usr/local/bin/yt-dlp
fi
yt-dlp --version
