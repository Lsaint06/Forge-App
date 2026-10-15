#!/usr/bin/env bash
set -euo pipefail
cd /workspace/Forge-App
export npm_config_cache=/workspace/.npm-cache
node -e "if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('FORGE cloud setup requires Node.js 24')"
npm ci --no-audit
