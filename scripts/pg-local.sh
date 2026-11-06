#!/usr/bin/env bash
# Dựng PostgreSQL local trong sandbox (chạy như user nobody, dữ liệu ở /tmp nên
# mất khi VM khởi động lại — chạy lại script này là có DB sạch + seed mẫu).
set -e
PGBIN_SRC="$HOME/workspace/tools/pg/dist"
if [ ! -x /tmp/pgbin/bin/postgres ]; then
  rm -rf /tmp/pgbin && cp -a "$PGBIN_SRC" /tmp/pgbin && chmod -R a+rX /tmp/pgbin
fi
if [ ! -d /tmp/pg-data ]; then
  runuser -u nobody -- mkdir -p /tmp/pg-data /tmp/pg-home
  runuser -u nobody -- env LD_LIBRARY_PATH=/tmp/pgbin/lib HOME=/tmp/pg-home /tmp/pgbin/bin/initdb -D /tmp/pg-data -U postgres --auth=trust -E UTF8 > /dev/null
fi
runuser -u nobody -- env LD_LIBRARY_PATH=/tmp/pgbin/lib HOME=/tmp/pg-home /tmp/pgbin/bin/pg_ctl -D /tmp/pg-data -o "-p 5433 -k /tmp -c listen_addresses=127.0.0.1" -l /tmp/pg.log start || true
sleep 1
cd "$HOME/workspace/smmv2"
export DATABASE_URL="postgresql://postgres@127.0.0.1:5433/postgres"
export PRISMA_QUERY_ENGINE_LIBRARY="$PWD/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node"
export PRISMA_SCHEMA_ENGINE_BINARY="$PWD/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x"
npx prisma db push
npx tsx prisma/seed.ts
echo "PG local sẵn sàng: postgresql://postgres@127.0.0.1:5433/postgres"
