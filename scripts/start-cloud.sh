#!/usr/bin/env bash
set -euo pipefail
cd /workspace/Forge-App
export npm_config_cache=/workspace/.npm-cache
export __UNSAFE_EXPO_HOME_DIRECTORY=/workspace/.expo-home
export DOTSLASH_CACHE=/workspace/.dotslash-cache
export EXPO_NO_TELEMETRY=1
export EXPO_NO_CACHE=1
export EXPO_OFFLINE=1
# Keep localhost listening consistent with Expo's generated 127.0.0.1 asset URL.
exec node --dns-result-order=ipv4first node_modules/expo/bin/cli start --go --localhost --port "${FORGE_METRO_PORT:-8081}" --max-workers 2
