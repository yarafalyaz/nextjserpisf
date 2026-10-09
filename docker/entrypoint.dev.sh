#!/bin/sh
# Dev container entrypoint.
#
# Why this exists: `node_modules` is an anonymous volume that shadows the copy
# baked into the image, so the Prisma Client generated at image-build time is
# frozen. Whenever prisma/schema.prisma changes (e.g. a column moved from
# `customer_vehicles` to `vehicles`), the client inside the container keeps the
# OLD model and every query referencing a dropped column fails at runtime with
# "The column X does not exist in the current database".
#
# Re-generating the client on every start keeps it in lockstep with the schema,
# no matter how the volume was populated. This must run as root because the
# volume's files are root-owned (the image build generated them as root).
set -e

if [ -f /app/prisma/schema.prisma ]; then
  echo "[entrypoint] prisma generate (sync client with schema)…"
  # Never let a generation hiccup take down the dev server: warn and continue,
  # the previously generated client still works for an unchanged schema.
  if ! npx --prefix /app prisma generate; then
    echo "[entrypoint] WARNING: prisma generate failed; using the existing client." >&2
  fi
  # Hand the freshly written client back to the runtime user so the dev server
  # (non-root) can read it and future writes stay owned by nextjs.
  chown -R nextjs:nodejs /app/node_modules/.prisma /app/node_modules/@prisma 2>/dev/null || true
fi

# Drop privileges for the actual dev server.
if [ "$(id -u)" = "0" ]; then
  exec su-exec nextjs "$@"
fi
exec "$@"
