#!/bin/sh
set -e

echo "[entrypoint] applying database migrations..."
npx prisma migrate deploy

echo "[entrypoint] starting server..."
exec npx next start -p 3000 -H 0.0.0.0
