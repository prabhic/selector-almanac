#!/usr/bin/env bash
# Install yt-dlp + Deno for YouTube full metadata (chapters need JS runtime + EJS).
set -euo pipefail

install_ytdlp() {
  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN
  curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" -o "$tmp"
  if command -v sudo >/dev/null 2>&1; then
    sudo install -m 755 "$tmp" /usr/local/bin/yt-dlp
  else
    install -m 755 "$tmp" /usr/local/bin/yt-dlp
  fi
  echo "yt-dlp $(yt-dlp --version)"
}

install_deno() {
  if command -v deno >/dev/null 2>&1; then
    echo "deno $(deno --version | head -1)"
    return
  fi

  local arch os zip url
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch="x86_64" ;;
    aarch64|arm64) arch="aarch64" ;;
    *) echo "unsupported arch: $arch" >&2; exit 1 ;;
  esac

  zip="deno-${arch}-unknown-${os}-gnu.zip"
  url="https://github.com/denoland/deno/releases/latest/download/${zip}"

  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' RETURN
  curl -fsSL "$url" -o "${tmpdir}/deno.zip"
  unzip -q "${tmpdir}/deno.zip" -d "${tmpdir}"
  if command -v sudo >/dev/null 2>&1; then
    sudo install -m 755 "${tmpdir}/deno" /usr/local/bin/deno
  else
    install -m 755 "${tmpdir}/deno" /usr/local/bin/deno
  fi
  echo "deno $(deno --version | head -1)"
}

install_ytdlp
install_deno
