#!/usr/bin/env bash
set -euo pipefail

cleanup() { docker compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

export SESSION_SECRET="verification-secret-at-least-32-chars"
export IMAGES_PROVIDER=unsplash

docker compose up --build -d

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:10000/health | grep -q '"status":"ready"'; then
    echo "container boots and serves /health"
    exit 0
  fi
  sleep 2
done

echo "container did not become ready" >&2
docker compose logs app >&2
exit 1
