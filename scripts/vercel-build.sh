#!/usr/bin/env bash
# Build trên Vercel: tạo Prisma Client -> đồng bộ schema vào database đám mây
# -> seed dữ liệu ban đầu khi SEED=1 (chỉ lần deploy đầu) -> build Next.js
set -e
npx prisma generate
npx prisma db push
if [ "$SEED" = "1" ]; then
  npx tsx prisma/seed.ts
fi
npx next build
