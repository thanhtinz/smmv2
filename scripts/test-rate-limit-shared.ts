/**
 * Full-audit a75d260 P3-02 — lớp rate-limit DB dùng chung:
 * rateLimitExceededShared cộng nguyên tử vào một bucket ở DB nên
 * quota áp dụng xuyên tiến trình/instance (hàm không giữ trạng thái
 * bộ nhớ — mỗi call là một "instance" độc lập trong test này).
 */
import { prisma } from "../src/lib/db";
import { rateLimitExceededShared } from "../src/lib/rate-limit";

let fails = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
}

async function main() {
  const key = `test-rls-${Date.now().toString(36)}`;
  const verdicts: boolean[] = [];
  for (let i = 0; i < 7; i++) verdicts.push(await rateLimitExceededShared(key, 5, 60000));
  ok(verdicts.slice(0, 5).every((v) => v === false) && verdicts[5] === true && verdicts[6] === true,
    `R1: 5 lượt đầu qua, lượt 6-7 bị chặn (${verdicts.map((v) => (v ? 1 : 0)).join("")})`);
  const rows = await prisma.rateLimitBucket.findMany({ where: { key } });
  ok(rows.length === 1 && rows[0].count === 7, `R2: một bucket DB duy nhất, count=7 (đang ${rows[0]?.count})`);
  const other = await rateLimitExceededShared(`${key}-other`, 5, 60000);
  ok(other === false, "R3: khoá khác không bị ảnh hưởng");
  // Song song: 10 call cùng lúc cho khoá mới, limit 5 -> đúng 5 qua, 5 chặn
  const key2 = `${key}-par`;
  const par = await Promise.all(Array.from({ length: 10 }, () => rateLimitExceededShared(key2, 5, 60000)));
  ok(par.filter((v) => !v).length === 5 && par.filter((v) => v).length === 5,
    `R4: 10 call song song -> đúng 5 qua 5 chặn (${par.filter((v) => !v).length}/${par.filter((v) => v).length})`);
  await prisma.rateLimitBucket.deleteMany({ where: { key: { in: [key, `${key}-other`, key2] } } });
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
