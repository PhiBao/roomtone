#!/bin/sh
# Boot sequence:
#   1. Seed the warm response cache onto the volume if it isn't there yet, so a
#      cold machine still answers instantly and never hits Qloo rate limits
#      during a demo.
#   2. Start the Next.js standalone server.
set -e
if [ -n "$ROOMTONE_CACHE_FILE" ]; then
  mkdir -p "$(dirname "$ROOMTONE_CACHE_FILE")"
  if [ ! -s "$ROOMTONE_CACHE_FILE" ] && [ -s /app/.roomtone-cache.json ]; then
    cp /app/.roomtone-cache.json "$ROOMTONE_CACHE_FILE"
    echo "seeded warm cache from image"
  fi
fi
exec node .next-build/server.js
