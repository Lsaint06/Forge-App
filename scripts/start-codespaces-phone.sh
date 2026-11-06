#!/usr/bin/env bash
# Run inside a personal GitHub Codespace after confirming included free usage.
# Does not create a codespace, enable billing, or modify application dependencies.
set -e
if [ -z "${CODESPACE_NAME:-}" ]; then
  echo 'Run this helper inside GitHub Codespaces. No Codespace was detected.' >&2
  exit 1
fi
cd "$(git rev-parse --show-toplevel)"
if [ "$(node -p 'process.versions.node.split(".")[0]')" != 24 ]; then
  if ! command -v nvm >/dev/null 2>&1 && [ -f /usr/local/share/nvm/nvm.sh ]; then
    . /usr/local/share/nvm/nvm.sh
  fi
  if ! command -v nvm >/dev/null 2>&1; then
    echo 'Node.js 24 is needed. Use a Node 24 dev container or install it with nvm.' >&2
    exit 1
  fi
  nvm install 24
  nvm use 24
fi
npm ci --no-audit --fund=false
export FORGE_PUBLIC_ORIGIN="https://${CODESPACE_NAME}-8081.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
export EXPO_PACKAGER_PROXY_URL="$FORGE_PUBLIC_ORIGIN"
export EXPO_NO_TELEMETRY=1
export EXPO_NO_CACHE=1
export EXPO_OFFLINE=1
FORGE_LAUNCH_DIR=$(mktemp -d /tmp/forge-phone-launch.XXXXXX)
FORGE_LAUNCH_LOG=$(mktemp /tmp/forge-phone-launch.XXXXXX.log)
python3 - "$FORGE_PUBLIC_ORIGIN" "$FORGE_LAUNCH_DIR" <<'PY'
import html, pathlib, sys
origin, directory = sys.argv[1:]
uri = 'exps://' + origin.removeprefix('https://')
page = '''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open FORGE</title><style>body{background:#080a0d;color:#f5f7fa;font:18px system-ui;padding:28px}a{display:block;background:#ff5a36;color:#080a0d;padding:20px;border-radius:16px;font-weight:700;text-decoration:none}code{overflow-wrap:anywhere}</style>
<h1>FORGE</h1><p>Install Expo Go with SDK 58 support, then tap:</p>
<a href="%s">Open FORGE in Expo Go</a><p>Keep the Codespace and Metro running.</p><p><code>%s</code></p>''' % (html.escape(uri, quote=True), html.escape(uri))
pathlib.Path(directory, 'index.html').write_text(page)
PY
# Serve only this fresh launch directory, never the checkout or its .env files.
python3 -m http.server 8080 --bind 0.0.0.0 --directory "$FORGE_LAUNCH_DIR" >"$FORGE_LAUNCH_LOG" 2>&1 &
FORGE_LAUNCH_PID=$!
trap 'kill "$FORGE_LAUNCH_PID" 2>/dev/null || true' EXIT
printf '\nExpo Go URL: %s\n' "${FORGE_PUBLIC_ORIGIN/https:/exps:}"
printf 'Safari launch page: https://%s-8080.%s\n' "$CODESPACE_NAME" "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
printf 'Set ports 8080 and 8081 to PUBLIC in the Codespaces Ports panel. Keep upstream protocol HTTP.\n'
printf 'Use the Safari launch button above; the CLI QR may use an incorrect exp:// scheme for HTTPS forwarding.\n'
printf 'In a SECOND terminal, run: python3 scripts/check-codespaces-phone.py\n\n'
node --dns-result-order=ipv4first node_modules/expo/bin/cli start --go --lan --port 8081 --max-workers 2
